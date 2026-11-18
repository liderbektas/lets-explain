/**
 * A small, deterministic model of Kafka Connect moving rows from a database table into a
 * topic (source connector) and from the topic into a search index (sink connector).
 *
 * Simplifications (each one is named in a "Gerçekte" note in the lesson):
 * - One source task and one sink task, on a cluster of two workers.
 * - The source reads the table in "incrementing" mode: rows with an id above the last one it saw.
 * - Offsets are saved only when you press flush/commit. Real workers do it on a timer
 *   (`offset.flush.interval.ms`, 60 s by default).
 * - A crashed worker's tasks move to the other worker at once. Real workers wait for the
 *   group to notice (`scheduled.rebalance.max.delay.ms`).
 */

export type WorkerId = "w1" | "w2";
export const WORKERS: WorkerId[] = ["w1", "w2"];
export type TaskId = "source" | "sink";

export interface Row {
  id: number;
  card: string;
}

export interface TopicRec {
  offset: number;
  rowId: number;
  card: string;
}

export interface ConnectState {
  rows: Row[];
  /** Rows the source task has seen, in its memory. Lost if its worker dies. */
  sourceSeen: number;
  /** What the source last saved in the `connect-offsets` topic. */
  sourceSaved: number;
  topic: TopicRec[];
  sinkPosition: number;
  sinkCommitted: number;
  /** Documents in the search index: one entry per write in insert mode, one per id in upsert mode. */
  index: { rowId: number; card: string }[];
  workers: Record<WorkerId, boolean>;
  tasks: Record<TaskId, WorkerId | null>;
  /** Single Message Transform that masks the card number on its way into Kafka. */
  mask: boolean;
  sinkMode: "insert" | "upsert";
  nextRow: number;
}

export type Action =
  | { type: "insertRow" }
  | { type: "sourcePoll" }
  | { type: "sourceFlush" }
  | { type: "sinkPoll" }
  | { type: "sinkCommit" }
  | { type: "crash"; worker: WorkerId }
  | { type: "restart"; worker: WorkerId }
  | { type: "toggleMask" }
  | { type: "setSinkMode"; mode: "insert" | "upsert" };

export type ConnectEvent =
  | { type: "rowInserted"; id: number }
  | { type: "sourced"; offset: number; rowId: number; again: boolean; masked: boolean }
  | { type: "sourceFlushed"; lastId: number }
  | { type: "sunk"; rowId: number; again: boolean; duplicate: boolean }
  | { type: "sinkCommitted"; offset: number }
  | { type: "crashed"; worker: WorkerId; moved: TaskId[]; lostRows: number }
  | { type: "restarted"; worker: WorkerId; moved: TaskId[] }
  | { type: "maskSet"; on: boolean }
  | { type: "sinkModeSet"; mode: "insert" | "upsert" }
  | { type: "nothing"; task: TaskId };

const CARDS = ["4111 1111", "5500 2222", "3714 4963", "6011 0009", "3530 1113", "4012 8888"];
const cardFor = (id: number) => `${CARDS[(id - 1) % CARDS.length]} …`;
export const MASKED = "**** ****";

export function emptyState(): ConnectState {
  return {
    rows: [],
    sourceSeen: 0,
    sourceSaved: 0,
    topic: [],
    sinkPosition: 0,
    sinkCommitted: 0,
    index: [],
    workers: { w1: true, w2: true },
    tasks: { source: "w1", sink: "w2" },
    mask: false,
    sinkMode: "upsert",
    nextRow: 1,
  };
}

/** Spread tasks over the workers that are up, the way the group hands them out again. */
function rebalance(s: ConnectState): TaskId[] {
  const alive = WORKERS.filter((w) => s.workers[w]);
  const before = { ...s.tasks };
  if (alive.length === 0) {
    s.tasks = { source: null, sink: null };
  } else {
    s.tasks = { source: alive[0]!, sink: alive[alive.length > 1 ? 1 : 0]! };
  }
  return (["source", "sink"] as TaskId[]).filter((t) => before[t] !== s.tasks[t]);
}

export function apply(prev: ConnectState, action: Action): { state: ConnectState; events: ConnectEvent[] } {
  const s: ConnectState = structuredClone(prev);
  const events: ConnectEvent[] = [];
  switch (action.type) {
    case "insertRow": {
      const id = s.nextRow;
      s.nextRow += 1;
      s.rows.push({ id, card: cardFor(id) });
      events.push({ type: "rowInserted", id });
      break;
    }
    case "sourcePoll": {
      if (!s.tasks.source) break;
      const fresh = s.rows.filter((r) => r.id > s.sourceSeen);
      if (fresh.length === 0) {
        events.push({ type: "nothing", task: "source" });
        break;
      }
      for (const r of fresh) {
        const again = s.topic.some((t) => t.rowId === r.id);
        const rec: TopicRec = { offset: s.topic.length, rowId: r.id, card: s.mask ? MASKED : r.card };
        s.topic.push(rec);
        events.push({ type: "sourced", offset: rec.offset, rowId: r.id, again, masked: s.mask });
      }
      s.sourceSeen = fresh[fresh.length - 1]!.id;
      break;
    }
    case "sourceFlush":
      if (!s.tasks.source) break;
      s.sourceSaved = s.sourceSeen;
      events.push({ type: "sourceFlushed", lastId: s.sourceSaved });
      break;
    case "sinkPoll": {
      if (!s.tasks.sink) break;
      const recs = s.topic.slice(s.sinkPosition);
      if (recs.length === 0) {
        events.push({ type: "nothing", task: "sink" });
        break;
      }
      for (const r of recs) {
        const existing = s.index.findIndex((d) => d.rowId === r.rowId);
        const again = existing >= 0;
        if (s.sinkMode === "upsert" && again) s.index[existing] = { rowId: r.rowId, card: r.card };
        else s.index.push({ rowId: r.rowId, card: r.card });
        events.push({ type: "sunk", rowId: r.rowId, again, duplicate: again && s.sinkMode === "insert" });
      }
      s.sinkPosition = s.topic.length;
      break;
    }
    case "sinkCommit":
      if (!s.tasks.sink) break;
      s.sinkCommitted = s.sinkPosition;
      events.push({ type: "sinkCommitted", offset: s.sinkCommitted });
      break;
    case "crash": {
      if (!s.workers[action.worker]) break;
      s.workers[action.worker] = false;
      const hadSource = s.tasks.source === action.worker;
      const hadSink = s.tasks.sink === action.worker;
      const lostRows = hadSource ? s.sourceSeen - s.sourceSaved : 0;
      // A task that restarts elsewhere only knows what was saved, never what was in memory.
      if (hadSource) s.sourceSeen = s.sourceSaved;
      if (hadSink) s.sinkPosition = s.sinkCommitted;
      const moved = rebalance(s);
      events.push({ type: "crashed", worker: action.worker, moved, lostRows });
      break;
    }
    case "restart": {
      if (s.workers[action.worker]) break;
      s.workers[action.worker] = true;
      // Tasks with no worker pick up from what was saved.
      if (!s.tasks.source) s.sourceSeen = s.sourceSaved;
      if (!s.tasks.sink) s.sinkPosition = s.sinkCommitted;
      const moved = rebalance(s);
      // A task handed over from a running worker is stopped cleanly, which saves its offsets first.
      if (moved.includes("source")) s.sourceSaved = s.sourceSeen;
      if (moved.includes("sink")) s.sinkCommitted = s.sinkPosition;
      events.push({ type: "restarted", worker: action.worker, moved });
      break;
    }
    case "toggleMask":
      s.mask = !s.mask;
      events.push({ type: "maskSet", on: s.mask });
      break;
    case "setSinkMode":
      s.sinkMode = action.mode;
      events.push({ type: "sinkModeSet", mode: action.mode });
      break;
  }
  return { state: s, events };
}

export function simulate(actions: Action[], start: ConnectState) {
  const states = [start];
  const events: ConnectEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = apply(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}

/** Rows that appear more than once in the topic. */
export const topicDuplicates = (s: ConnectState) => s.topic.length - new Set(s.topic.map((t) => t.rowId)).size;
/** Rows that appear more than once in the search index. */
export const indexDuplicates = (s: ConnectState) => s.index.length - new Set(s.index.map((d) => d.rowId)).size;

/* ------------------------------------------------------------ the lesson */

const A = {
  insert: { type: "insertRow" } as Action,
  srcPoll: { type: "sourcePoll" } as Action,
  srcFlush: { type: "sourceFlush" } as Action,
  sinkPoll: { type: "sinkPoll" } as Action,
  sinkCommit: { type: "sinkCommit" } as Action,
};

export const stepActions: Action[][] = [
  [A.insert, A.insert, A.insert],
  [],
  [A.srcPoll],
  [A.sinkPoll, A.sinkCommit],
  [{ type: "toggleMask" }, A.insert, A.srcPoll, A.sinkPoll],
  [A.srcFlush, A.sinkCommit],
  [A.insert, A.insert, A.srcPoll, { type: "crash", worker: "w1" }, A.srcPoll],
  [{ type: "restart", worker: "w1" }],
  [A.sinkPoll, A.sinkCommit],
  [],
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;

export const base = (() => {
  const run = simulate(stepActions.flat(), emptyState());
  const ends: number[] = [];
  let n = 0;
  for (const a of stepActions) {
    n += a.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/**
 * The try-it step starts clean and calm: three rows copied and saved on both sides,
 * no mask, and the sink in insert mode so repeats show up in the index.
 */
export const sandboxStart: ConnectState = (() => {
  const s = simulate([A.insert, A.insert, A.insert, A.srcPoll, A.srcFlush, A.sinkPoll, A.sinkCommit], emptyState());
  const last = s.states[s.states.length - 1]!;
  return { ...last, sinkMode: "insert" };
})();

/** Every move the sandbox buttons allow in a state, in button order. */
export function movesIn(s: ConnectState): Action[] {
  const out: Action[] = [A.insert];
  if (s.tasks.source) {
    if (s.rows.some((r) => r.id > s.sourceSeen)) out.push(A.srcPoll);
    if (s.sourceSaved !== s.sourceSeen) out.push(A.srcFlush);
  }
  if (s.tasks.sink) {
    if (s.sinkPosition < s.topic.length) out.push(A.sinkPoll);
    if (s.sinkCommitted !== s.sinkPosition) out.push(A.sinkCommit);
  }
  for (const w of WORKERS) out.push(s.workers[w] ? { type: "crash", worker: w } : { type: "restart", worker: w });
  out.push({ type: "toggleMask" });
  out.push({ type: "setSinkMode", mode: s.sinkMode === "insert" ? "upsert" : "insert" });
  return out;
}
