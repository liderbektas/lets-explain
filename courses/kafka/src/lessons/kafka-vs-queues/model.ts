import { apply, simulate } from "../../engine/cluster";
import type { Action, ClusterState, SimEvent } from "../../engine/types";

/**
 * Two worlds fed by the same order service:
 * - a classic message queue, where a message is handed to one worker and deleted on ack;
 * - a Kafka topic, where records stay and every consumer group keeps its own position.
 *
 * The queue is deliberately simple: a crashed worker's unacknowledged message goes straight
 * back to the front of the queue (real brokers wait for the connection to drop or a
 * visibility timeout).
 */

export type Worker = "a" | "b" | "c";
export const WORKERS: Worker[] = ["a", "b", "c"];

export interface QueueState {
  /** Messages waiting, in the order they will be handed out. */
  waiting: number[];
  /** The message each worker holds and has not acknowledged yet. */
  inflight: Record<Worker, number | null>;
  alive: Record<Worker, boolean>;
  /** Workers that have joined the queue (c is the analytics service, which joins late). */
  joined: Record<Worker, boolean>;
  /** Every hand-out, in order. */
  deliveries: { id: number; worker: Worker }[];
  /** Acknowledged (deleted) messages, and who acknowledged each. */
  acked: Record<number, Worker>;
}

export interface VState {
  orders: number;
  queue: QueueState;
  kafka: ClusterState;
}

export type VAction =
  | { type: "write" }
  | { type: "join"; w: Worker }
  | { type: "take"; w: Worker }
  | { type: "ack"; w: Worker }
  | { type: "crash"; w: Worker }
  | { type: "restart"; w: Worker }
  | { type: "kafka"; action: Action };

export type QEvent =
  | { type: "written"; id: number }
  | { type: "joined"; w: Worker }
  | { type: "taken"; id: number; w: Worker; again: boolean }
  | { type: "empty"; w: Worker }
  | { type: "acked"; id: number; w: Worker }
  | { type: "crashed"; w: Worker; requeued: number | null }
  | { type: "restarted"; w: Worker }
  | { type: "kafka"; events: SimEvent[] };

export const TOPIC = "orders";
export const P = `${TOPIC}-0`;
export const BILLING = { group: "billing", member: "billing-1" };
export const ANALYTICS = { group: "analytics", member: "analytics-1" };
export type GroupRef = typeof BILLING;

export const orderNo = (id: number) => 1041 + id;

const kStart = simulate([
  { type: "createTopic", name: TOPIC, partitions: 1 },
  { type: "joinGroup", group: BILLING.group, member: BILLING.member, topics: [TOPIC], autoOffsetReset: "earliest" },
]).states[2]!;

export const initialState = (): VState => ({
  orders: 0,
  queue: {
    waiting: [],
    inflight: { a: null, b: null, c: null },
    alive: { a: true, b: true, c: true },
    joined: { a: true, b: true, c: false },
    deliveries: [],
    acked: {},
  },
  kafka: kStart,
});

export function canDo(s: VState, a: VAction): boolean {
  const q = s.queue;
  switch (a.type) {
    case "write":
      return true;
    case "join":
      return !q.joined[a.w];
    case "take":
      return q.joined[a.w] && q.alive[a.w] && q.inflight[a.w] === null;
    case "ack":
      return q.alive[a.w] && q.inflight[a.w] !== null;
    case "crash":
      return q.joined[a.w] && q.alive[a.w];
    case "restart":
      return q.joined[a.w] && !q.alive[a.w];
    case "kafka":
      return true;
  }
}

export function step(prev: VState, action: VAction): { state: VState; events: QEvent[] } {
  if (!canDo(prev, action)) return { state: prev, events: [] };
  const s: VState = { ...prev, queue: structuredClone(prev.queue) };
  const q = s.queue;
  const events: QEvent[] = [];

  switch (action.type) {
    case "write": {
      const id = s.orders;
      s.orders += 1;
      q.waiting.push(id);
      const r = apply(s.kafka, { type: "produce", topic: TOPIC, value: `order:${orderNo(id)}`, producer: "orders" });
      s.kafka = r.state;
      events.push({ type: "written", id });
      break;
    }
    case "join":
      q.joined[action.w] = true;
      events.push({ type: "joined", w: action.w });
      break;
    case "take": {
      const id = q.waiting.shift();
      if (id === undefined) {
        events.push({ type: "empty", w: action.w });
        break;
      }
      const again = q.deliveries.some((d) => d.id === id);
      q.inflight[action.w] = id;
      q.deliveries.push({ id, worker: action.w });
      events.push({ type: "taken", id, w: action.w, again });
      break;
    }
    case "ack": {
      const id = q.inflight[action.w]!;
      q.acked[id] = action.w;
      q.inflight[action.w] = null;
      events.push({ type: "acked", id, w: action.w });
      break;
    }
    case "crash": {
      const held = q.inflight[action.w];
      q.alive[action.w] = false;
      q.inflight[action.w] = null;
      // The broker never got an ack, so the message goes back to the front of the queue.
      if (held !== null) q.waiting.unshift(held);
      events.push({ type: "crashed", w: action.w, requeued: held });
      break;
    }
    case "restart":
      q.alive[action.w] = true;
      events.push({ type: "restarted", w: action.w });
      break;
    case "kafka": {
      const r = apply(s.kafka, action.action);
      s.kafka = r.state;
      events.push({ type: "kafka", events: r.events });
      break;
    }
  }
  return { state: s, events };
}

export function run(actions: VAction[], start: VState) {
  const states = [start];
  const events: QEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = step(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------ action makers */

export const write: VAction = { type: "write" };
export const join = (w: Worker): VAction => ({ type: "join", w });
export const take = (w: Worker): VAction => ({ type: "take", w });
export const ack = (w: Worker): VAction => ({ type: "ack", w });
export const crash = (w: Worker): VAction => ({ type: "crash", w });
export const restart = (w: Worker): VAction => ({ type: "restart", w });
const k = (action: Action): VAction => ({ type: "kafka", action });
export const kJoin = (g: GroupRef) => k({ type: "joinGroup", group: g.group, member: g.member, topics: [TOPIC], autoOffsetReset: "earliest" });
export const kRead = (g: GroupRef) => k({ type: "poll", group: g.group, member: g.member });
export const kCommit = (g: GroupRef) => k({ type: "commit", group: g.group, member: g.member });
export const kRewind = (g: GroupRef) => k({ type: "seek", group: g.group, member: g.member, tp: P, offset: 0 });

/* ---------------------------------------------------------------- lesson */

export type View = "queue" | "kafka" | "groups";

export const stepActions: VAction[][] = [
  // 0: three orders go into the queue (and, unseen for now, into Kafka).
  [write, write, write],
  // 1: worker A takes message 0, processes it, acks: it is deleted.
  [take("a"), ack("a")],
  // 2: competing workers: A and B take one message each.
  [take("a"), take("b"), ack("b"), ack("a")],
  // 3: two more orders are handled; then analytics joins and finds the queue empty.
  [write, write, take("a"), take("b"), ack("a"), ack("b"), join("c"), take("c")],
  // 4: A crashes before acking: the message goes back and B gets it.
  [write, take("a"), crash("a"), take("b"), ack("b"), restart("a")],
  // 5: the same orders in Kafka: billing reads them all and commits; nothing is deleted.
  [kRead(BILLING), kCommit(BILLING)],
  // 6: analytics joins Kafka with earliest and reads everything too.
  [kJoin(ANALYTICS), kRead(ANALYTICS), kCommit(ANALYTICS)],
  // 7: partitions split work inside a group (drawn separately).
  [],
  // 8: which one when.
  [],
  // 9: share groups.
  [],
  // 10: try it yourself.
  [],
];

export const viewFor = (step: number): View => (step <= 4 ? "queue" : step === 7 ? "groups" : "kafka");

export const SANDBOX_STEP = stepActions.length - 1;

export const base = (() => {
  const r = run(stepActions.flat(), initialState());
  const ends: number[] = [];
  let n = 0;
  for (const actions of stepActions) {
    n += actions.length;
    ends.push(n);
  }
  const startOf = (i: number) => (i === 0 ? 0 : ends[i - 1]!);
  return { run: r, ends, startOf };
})();

/** The try-it step starts from the end of the lesson with one order waiting in the queue. */
export const sandboxStart: VState = step(base.run.states[base.ends[SANDBOX_STEP]!]!, write).state;

/* ---------------------------------------------------------------- helpers */

/** Messages still in the queue: waiting or held by a worker. */
export function inQueue(q: QueueState): number[] {
  const held = WORKERS.map((w) => q.inflight[w]).filter((x): x is number => x !== null);
  return [...q.waiting, ...held].sort((x, y) => x - y);
}

export function kafkaSeen(s: VState, g: GroupRef): Set<number> {
  return new Set((s.kafka.groups[g.group]?.deliveries ?? []).map((d) => d.offset));
}

export function kafkaPosition(s: VState, g: GroupRef): number | undefined {
  const group = s.kafka.groups[g.group];
  const m = group?.members.find((x) => x.id === g.member);
  if (!group || !m) return undefined;
  return m.positions[P] ?? group.committed[P] ?? 0;
}
