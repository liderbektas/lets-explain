import { partitionForKey } from "../../engine/murmur2";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * A small model of one topic for the ordering lesson. Each order has up to three events,
 * always written in this sequence: 1 created, 2 paid, 3 shipped. The question the lesson
 * keeps asking: does a consumer ever handle a later event before an earlier one?
 */

export const STAGES = 3;
export const MAX_PARTITIONS = 4;

export interface OrderEvent {
  order: string;
  /** 1 = created, 2 = paid, 3 = shipped. */
  stage: number;
  keyed: boolean;
}

export interface ORecord extends OrderEvent {
  offset: number;
}

export interface OConsumer {
  id: string;
  name: L;
  tint: Tint;
  assigned: number[];
  /** Next offset to read, per partition. Kept across a reassignment (read = committed here). */
  positions: Record<number, number>;
  /** Where the next read starts looking, so one partition cannot starve the others. */
  cursor: number;
}

export interface Processed {
  order: string;
  stage: number;
  partition: number;
  offset: number;
  by: string;
  /** An earlier event of the same order had been written but not yet handled. */
  outOfOrder: boolean;
}

export interface OState {
  partitions: ORecord[][];
  consumers: OConsumer[];
  /** Round-robin cursor for records written without a key. */
  rr: number;
  /** How many events of each order have been written. */
  written: Record<string, number>;
  processed: Processed[];
}

export type OAction =
  | { type: "write"; order: string; keyed: boolean }
  | { type: "addPartition" }
  | { type: "read"; consumer: string };

export type OEvent =
  | { type: "written"; order: string; stage: number; partition: number; offset: number; keyed: boolean; moved: boolean }
  | { type: "partitionAdded"; count: number; assignment: Record<string, number[]> }
  | ({ type: "processed" } & Processed)
  | { type: "nothing"; consumer: string };

export const CONSUMERS: { id: string; name: L; tint: Tint }[] = [
  { id: "c1", name: l("Kargo-1", "Shipping-1"), tint: TINTS.coral },
  { id: "c2", name: l("Kargo-2", "Shipping-2"), tint: TINTS.lilac },
  { id: "c3", name: l("Kargo-3", "Shipping-3"), tint: TINTS.sun },
];

export const ORDERS = ["1042", "1043", "1045", "1048"] as const;

/** Range assignment, as Kafka's default range assignor does for one topic. */
export function rangeAssign(partitions: number, members: number): number[][] {
  const per = Math.floor(partitions / members);
  const extra = partitions % members;
  const out: number[][] = [];
  let next = 0;
  for (let i = 0; i < members; i++) {
    const count = per + (i < extra ? 1 : 0);
    out.push(Array.from({ length: count }, () => next++));
  }
  return out;
}

export function createState(partitions = 3): OState {
  const assignment = rangeAssign(partitions, CONSUMERS.length);
  return {
    partitions: Array.from({ length: partitions }, () => []),
    consumers: CONSUMERS.map((c, i) => ({ ...c, assigned: assignment[i]!, positions: {}, cursor: 0 })),
    rr: 0,
    written: {},
    processed: [],
  };
}

export function apply(prev: OState, action: OAction): { state: OState; events: OEvent[] } {
  const state = structuredClone(prev);
  const events: OEvent[] = [];
  const n = state.partitions.length;

  switch (action.type) {
    case "write": {
      const stage = (state.written[action.order] ?? 0) + 1;
      if (stage > STAGES) return { state: prev, events: [] };
      let partition: number;
      if (action.keyed) {
        partition = partitionForKey(action.order, n);
      } else {
        partition = state.rr % n;
        state.rr += 1;
      }
      const log = state.partitions[partition]!;
      const offset = log.length;
      log.push({ order: action.order, stage, keyed: action.keyed, offset });
      state.written[action.order] = stage;
      // Did this order's earlier events go somewhere else?
      const moved = state.partitions.some((p, i) => i !== partition && p.some((r) => r.order === action.order));
      events.push({ type: "written", order: action.order, stage, partition, offset, keyed: action.keyed, moved });
      break;
    }

    case "addPartition": {
      if (n >= MAX_PARTITIONS) return { state: prev, events: [] };
      state.partitions.push([]);
      // Kafka notices the new partition and rebalances the group.
      const assignment = rangeAssign(n + 1, state.consumers.length);
      state.consumers.forEach((c, i) => {
        c.assigned = assignment[i]!;
        c.cursor = 0;
      });
      events.push({
        type: "partitionAdded",
        count: n + 1,
        assignment: Object.fromEntries(state.consumers.map((c) => [c.id, c.assigned])),
      });
      break;
    }

    case "read": {
      const c = state.consumers.find((x) => x.id === action.consumer);
      if (!c) return { state: prev, events: [] };
      // Positions live on the partition, so a new owner continues where the old one stopped.
      const positionOf = (p: number) => nextOffset(state, p);
      let found: { p: number; record: ORecord } | null = null;
      for (let k = 0; k < c.assigned.length; k++) {
        const p = c.assigned[(c.cursor + k) % c.assigned.length]!;
        const record = state.partitions[p]![positionOf(p)];
        if (record) {
          found = { p, record };
          c.cursor = (c.cursor + k + 1) % c.assigned.length;
          break;
        }
      }
      if (!found) {
        events.push({ type: "nothing", consumer: c.id });
        break;
      }
      const { p, record } = found;
      c.positions[p] = record.offset + 1;
      const handled = new Set(state.processed.filter((x) => x.order === record.order).map((x) => x.stage));
      const outOfOrder = Array.from({ length: record.stage - 1 }, (_, i) => i + 1).some((s) => !handled.has(s));
      const item: Processed = { order: record.order, stage: record.stage, partition: p, offset: record.offset, by: c.id, outOfOrder };
      state.processed.push(item);
      events.push({ type: "processed", ...item });
      break;
    }
  }

  return { state, events };
}

/** Next offset to read in a partition: one past the last record anybody handled there. */
export function nextOffset(state: OState, p: number): number {
  let next = 0;
  for (const x of state.processed) if (x.partition === p) next = Math.max(next, x.offset + 1);
  return next;
}

export function simulate(actions: OAction[], start: OState) {
  const states = [start];
  const events: OEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = apply(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

export const violations = (state: OState) => state.processed.filter((x) => x.outOfOrder).length;

export const ownerOf = (state: OState, p: number) => state.consumers.find((c) => c.assigned.includes(p));

/* ------------------------------------------------------------- lesson steps */

const w = (order: string, keyed = true): OAction => ({ type: "write", order, keyed });
const r = (consumer: string): OAction => ({ type: "read", consumer });

export const stepActions: OAction[][] = [
  [],
  [w("1042", false), w("1042", false), w("1042", false)],
  [r("c3"), r("c2"), r("c1")],
  [w("1043"), w("1043"), w("1043")],
  [r("c1"), r("c1"), r("c1")],
  [w("1045"), w("1048"), w("1045"), w("1048"), r("c2"), r("c3"), r("c3")],
  [{ type: "addPartition" }, w("1045"), r("c1")],
  // Steps 7 and 8 are about the producer's retries and draw their own scene.
  [],
  [],
  // The try-it step.
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;
export const RETRY_STEPS = [7, 8];

export const base = (() => {
  const run = simulate(stepActions.flat(), createState());
  const ends: number[] = [];
  let n = 0;
  for (const actions of stepActions) {
    n += actions.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/** The try-it step starts clean: an empty three-partition topic. */
export const sandboxStart = createState();
