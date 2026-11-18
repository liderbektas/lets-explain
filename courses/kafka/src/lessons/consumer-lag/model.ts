import { partitionForKey } from "../../engine/murmur2";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { rangeAssign } from "../ordering/model";

/**
 * A small model of consumer lag, ticking in "seconds". Each second the producer writes,
 * every consumer handles up to its speed and commits, and retention trims each partition
 * to its newest records. Lag per partition = log-end offset − committed offset.
 */

export const TOPIC = "clicks";
export const GROUP = "analytics";
/** Records each consumer handles per second, normally and after the code is sped up. */
export const SPEED = 2;
export const FAST_SPEED = 4;
/** Retention keeps this many newest records per partition. */
export const KEEP = 8;
export const MAX_CONSUMERS = 4;
/** The busy key, and the partition it hashes to with three partitions. */
export const HOT_KEY = "istanbul";
export const HOT_PARTITION = partitionForKey(HOT_KEY, 3);

export interface LPartition {
  logStart: number;
  logEnd: number;
  committed: number;
}

export interface LState {
  partitions: LPartition[];
  /** Running consumers, in join order. Assignment is range over this list. */
  members: string[];
  /** Per member: where its next read starts among its partitions, so none starves. */
  cursors: Record<string, number>;
  hot: boolean;
  fast: boolean;
  /** Records deleted by retention before the group read them. */
  missed: number;
  /** Seconds that passed while the busy key was on. */
  hotSeconds: number;
  seconds: number;
}

export type LAction =
  | { type: "tick" }
  | { type: "addConsumer" }
  | { type: "removeConsumer" }
  | { type: "toggleHot" }
  | { type: "toggleFast" }
  /** Scripted steps only: write or handle a set number of records. */
  | { type: "produce"; partition: number; count: number }
  | { type: "consume"; member: string; count: number };

export type LEvent =
  | { type: "second"; written: number[]; handled: Record<string, number[]>; deleted: number[]; missed: number }
  | { type: "joined"; member: string; assignment: Record<string, number[]> }
  | { type: "left"; member: string; assignment: Record<string, number[]> }
  | { type: "hot"; on: boolean }
  | { type: "fast"; on: boolean }
  | { type: "produced"; partition: number; count: number }
  | { type: "consumed"; member: string; handled: number[] };

export const CONSUMER_POOL: { id: string; name: L; tint: Tint }[] = [
  { id: "a1", name: l("Analitik-1", "Analytics-1"), tint: TINTS.lilac },
  { id: "a2", name: l("Analitik-2", "Analytics-2"), tint: TINTS.coral },
  { id: "a3", name: l("Analitik-3", "Analytics-3"), tint: TINTS.sun },
  { id: "a4", name: l("Analitik-4", "Analytics-4"), tint: TINTS.mint },
];

export function assignment(state: LState): Record<string, number[]> {
  const parts = rangeAssign(state.partitions.length, state.members.length);
  return Object.fromEntries(state.members.map((m, i) => [m, parts[i] ?? []]));
}

export const lagOf = (p: LPartition) => p.logEnd - p.committed;
export const totalLag = (state: LState) => state.partitions.reduce((sum, p) => sum + lagOf(p), 0);
export const speedOf = (state: LState) => (state.fast ? FAST_SPEED : SPEED);

/** Records arriving per second, per partition. */
export function inflow(state: LState): number[] {
  if (state.hot) return state.partitions.map((_, i) => (i === HOT_PARTITION ? 3 : 0));
  return state.partitions.map(() => 1);
}

export function createState(opts: { partitions?: number; members?: number; backlog?: number[] } = {}): LState {
  const count = opts.partitions ?? 3;
  const backlog = opts.backlog ?? Array.from({ length: count }, () => 0);
  const members = CONSUMER_POOL.slice(0, opts.members ?? 1).map((c) => c.id);
  return {
    partitions: Array.from({ length: count }, (_, i) => ({ logStart: 0, logEnd: backlog[i] ?? 0, committed: 0 })),
    members,
    cursors: Object.fromEntries(members.map((m) => [m, 0])),
    hot: false,
    fast: false,
    missed: 0,
    hotSeconds: 0,
    seconds: 0,
  };
}

/** One consumer handles up to `budget` records over its partitions, taking them in turn, and commits. */
function consume(state: LState, member: string, budget: number): number[] {
  const mine = assignment(state)[member] ?? [];
  const handled = mine.map(() => 0);
  let cursor = state.cursors[member] ?? 0;
  while (budget > 0) {
    let took = false;
    for (let k = 0; k < mine.length && budget > 0; k++) {
      const idx = (cursor + k) % mine.length;
      const p = state.partitions[mine[idx]!]!;
      if (p.committed < p.logEnd) {
        p.committed += 1;
        handled[idx]! += 1;
        budget -= 1;
        cursor = (idx + 1) % mine.length;
        took = true;
        break;
      }
    }
    if (!took) break;
  }
  state.cursors[member] = cursor;
  // Report per partition index of the topic, not per position in the member's list.
  const out = state.partitions.map(() => 0);
  mine.forEach((p, i) => (out[p] = handled[i]!));
  return out;
}

function retention(state: LState): { deleted: number[]; missed: number } {
  const deleted = state.partitions.map(() => 0);
  let missed = 0;
  state.partitions.forEach((p, i) => {
    const start = Math.max(p.logStart, p.logEnd - KEEP);
    if (start <= p.logStart) return;
    deleted[i] = start - p.logStart;
    if (p.committed < start) {
      // The group never read these; auto.offset.reset=earliest moves it to the new start.
      missed += start - p.committed;
      p.committed = start;
    }
    p.logStart = start;
  });
  state.missed += missed;
  return { deleted, missed };
}

export function apply(prev: LState, action: LAction): { state: LState; events: LEvent[] } {
  const state = structuredClone(prev);
  const events: LEvent[] = [];
  switch (action.type) {
    case "tick": {
      const written = inflow(state);
      state.partitions.forEach((p, i) => (p.logEnd += written[i]!));
      const handled: Record<string, number[]> = {};
      for (const m of state.members) handled[m] = consume(state, m, speedOf(state));
      const r = retention(state);
      state.seconds += 1;
      if (state.hot) state.hotSeconds += 1;
      events.push({ type: "second", written, handled, deleted: r.deleted, missed: r.missed });
      break;
    }
    case "addConsumer": {
      const next = CONSUMER_POOL.find((c) => !state.members.includes(c.id));
      if (!next) return { state: prev, events: [] };
      state.members.push(next.id);
      for (const m of state.members) state.cursors[m] = 0;
      events.push({ type: "joined", member: next.id, assignment: assignment(state) });
      break;
    }
    case "removeConsumer": {
      const last = state.members.pop();
      if (!last) return { state: prev, events: [] };
      delete state.cursors[last];
      for (const m of state.members) state.cursors[m] = 0;
      events.push({ type: "left", member: last, assignment: assignment(state) });
      break;
    }
    case "toggleHot":
      state.hot = !state.hot;
      events.push({ type: "hot", on: state.hot });
      break;
    case "toggleFast":
      state.fast = !state.fast;
      events.push({ type: "fast", on: state.fast });
      break;
    case "produce": {
      const p = state.partitions[action.partition];
      if (!p) return { state: prev, events: [] };
      p.logEnd += action.count;
      retention(state);
      events.push({ type: "produced", partition: action.partition, count: action.count });
      break;
    }
    case "consume": {
      if (!state.members.includes(action.member)) return { state: prev, events: [] };
      events.push({ type: "consumed", member: action.member, handled: consume(state, action.member, action.count) });
      break;
    }
  }
  return { state, events };
}

export function simulate(actions: LAction[], start: LState) {
  const states = [start];
  const events: LEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = apply(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------- lesson steps */

const produce = (count = 1, partition = 0): LAction => ({ type: "produce", partition, count });
const consumeBy = (count = 1, member = "a1"): LAction => ({ type: "consume", member, count });
const tick: LAction = { type: "tick" };
const add: LAction = { type: "addConsumer" };

interface StepPlan {
  /** Where the step starts: its own state, or "continue" from the previous step's end. */
  start: LState | "continue";
  actions: LAction[];
}

const plans: StepPlan[] = [
  // 0. What lag is: six written, two handled.
  { start: createState({ partitions: 1 }), actions: [produce(), produce(), produce(), produce(), produce(), produce(), consumeBy(), consumeBy()] },
  // 1. Same rate in and out: lag stays.
  { start: "continue", actions: [produce(), consumeBy(), produce(), consumeBy(), produce(), consumeBy()] },
  // 2. A slow consumer: two in, one out.
  { start: "continue", actions: [produce(2), consumeBy(), produce(2), consumeBy(), produce(2), consumeBy()] },
  // 3. Three partitions, one consumer, a second at a time.
  { start: createState({ partitions: 3, members: 1, backlog: [3, 3, 3] }), actions: [tick, tick, tick] },
  // 4. Two more consumers: one each.
  { start: "continue", actions: [add, add, tick, tick, tick] },
  // 5. A fourth consumer has nothing to do.
  { start: "continue", actions: [add, tick, tick] },
  // 6. A hot key: everything goes to one partition.
  { start: { ...createState({ partitions: 3, members: 3, backlog: [1, 1, 1] }), hot: true }, actions: [tick, add, tick, tick] },
  // 7. Faster code, and the idle one leaves.
  { start: "continue", actions: [{ type: "removeConsumer" }, { type: "toggleFast" }, tick, tick, tick] },
  // 8. Nobody reads for a while: retention wins.
  { start: createState({ partitions: 3, members: 0, backlog: [6, 6, 6] }), actions: [tick, tick, tick] },
  // 9. Reading lag with the CLI: a still picture.
  { start: (() => {
      const s = createState({ partitions: 3, members: 2, backlog: [15, 9, 14] });
      s.partitions[0]!.committed = 12;
      s.partitions[1]!.committed = 9;
      s.partitions[2]!.committed = 6;
      s.partitions.forEach((p) => (p.logStart = Math.max(0, p.logEnd - KEEP)));
      return s;
    })(), actions: [] },
  // 10. Try it.
  { start: "continue", actions: [] },
];

export const SANDBOX_STEP = plans.length - 1;
export const CLI_STEP = 9;

/** Each step's run, built once. */
export const steps = (() => {
  const out: { start: LState; run: ReturnType<typeof simulate> }[] = [];
  let last = createState();
  for (const plan of plans) {
    const start = plan.start === "continue" ? last : plan.start;
    const run = simulate(plan.actions, start);
    out.push({ start, run });
    last = run.states[run.states.length - 1]!;
  }
  return out;
})();

export const stepActions = plans.map((p) => p.actions);

/** The try-it step: three partitions with a little backlog, one consumer, normal traffic. */
export const sandboxStart = createState({ partitions: 3, members: 1, backlog: [2, 2, 2] });
