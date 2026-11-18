/**
 * A small model of a billing service: it reads orders from an `orders` topic and writes one
 * invoice per order to an `invoices` partition. It covers two producer features:
 *
 * - Idempotence: the producer stamps each record with its producer id (PID) and a sequence
 *   number, so the broker can drop a retried copy of a record it already wrote.
 * - Transactions: the invoice and the input offset commit become one all-or-nothing unit,
 *   closed by a commit or abort marker that takes up an offset in the log.
 *
 * Simplifications, each named in a lesson callout: one partition, one record in flight at a
 * time, and the coordinator aborting an open transaction the moment the producer restarts.
 */

export type RecKind = "data" | "commit" | "abort";

export interface Rec {
  offset: number;
  kind: RecKind;
  /** Order index the invoice is for (data records only). */
  order: number | null;
  pid: number;
  /** Sequence number when idempotence is on; null otherwise. */
  seq: number | null;
  txn: number | null;
}

export type TxnStatus = "open" | "committed" | "aborted";

export interface Reader {
  /** Next offset to look at. */
  pos: number;
  /** Data record offsets this reader handed to its application. */
  seen: number[];
}

export interface TState {
  log: Rec[];
  idempotent: boolean;
  transactional: boolean;
  alive: boolean;
  pid: number;
  epoch: number;
  nextPid: number;
  nextSeq: number;
  /** Highest sequence the broker wrote, per producer session ("pid:epoch"). */
  brokerSeq: Record<string, number>;
  /** The record sent but not acknowledged yet. */
  inflight: { order: number; seq: number | null; txn: number | null } | null;
  /** Retries the broker recognised and dropped. */
  dropped: number;
  /** The input side: how many orders exist, the next one to read, and the committed position. */
  orders: number;
  position: number;
  committed: number;
  txn: { id: number } | null;
  txns: Record<number, TxnStatus>;
  nextTxn: number;
  rc: Reader;
  ru: Reader;
}

export type TAction =
  | { type: "idempotence"; on: boolean }
  | { type: "transactions"; on: boolean }
  | { type: "process" }
  | { type: "ack" }
  | { type: "retry" }
  | { type: "commitInput" }
  | { type: "begin" }
  | { type: "commitTxn" }
  | { type: "abortTxn" }
  | { type: "crash" }
  | { type: "restart" }
  | { type: "readCommitted" }
  | { type: "readUncommitted" };

export type TEvent =
  | { type: "config"; idempotent: boolean; transactional: boolean; pid: number }
  | { type: "written"; offset: number; order: number; seq: number | null; txn: number | null; retry: boolean }
  | { type: "retryDropped"; order: number; seq: number }
  | { type: "acked"; order: number }
  | { type: "inputCommitted"; position: number }
  | { type: "begun"; txn: number }
  | { type: "marker"; offset: number; txn: number; kind: "commit" | "abort"; byCoordinator: boolean }
  | { type: "crashed"; openTxn: number | null; unacked: boolean }
  | { type: "restarted"; position: number; pid: number; epoch: number }
  | { type: "read"; reader: "rc" | "ru"; offsets: number[]; stoppedAt: number | null }
  | { type: "nothing" };

export const ORDER_BASE = 1041;
export const orderNo = (order: number) => ORDER_BASE + order;

export const initialState = (): TState => ({
  log: [],
  idempotent: false,
  transactional: false,
  alive: true,
  pid: 0,
  epoch: 0,
  nextPid: 1,
  nextSeq: 0,
  brokerSeq: {},
  inflight: null,
  dropped: 0,
  orders: 12,
  position: 0,
  committed: 0,
  txn: null,
  txns: {},
  nextTxn: 1,
  rc: { pos: 0, seen: [] },
  ru: { pos: 0, seen: [] },
});

/** Last stable offset: read_committed readers stop before the first record of an open transaction. */
export function lastStable(s: TState): number {
  const open = s.log.find((r) => r.kind === "data" && r.txn !== null && s.txns[r.txn] === "open");
  return open ? open.offset : s.log.length;
}

export const isAborted = (s: TState, r: Rec) => r.txn !== null && s.txns[r.txn] === "aborted";
export const isOpen = (s: TState, r: Rec) => r.txn !== null && s.txns[r.txn] === "open";

/** Invoices a read_committed reader will ever see: non-transactional ones and committed ones. */
export const visible = (s: TState, r: Rec) => r.kind === "data" && !isAborted(s, r) && !isOpen(s, r);

/** Orders that have more than one invoice that counts (not aborted). */
export function duplicateOrders(s: TState): number {
  const count = new Map<number, number>();
  for (const r of s.log) if (r.kind === "data" && !isAborted(s, r)) count.set(r.order!, (count.get(r.order!) ?? 0) + 1);
  let n = 0;
  for (const c of count.values()) if (c > 1) n += 1;
  return n;
}

export const abortedSeenBy = (s: TState, who: "rc" | "ru") =>
  s[who].seen.filter((o) => isAborted(s, s.log[o]!)).length;

export function canDo(s: TState, a: TAction["type"]): boolean {
  switch (a) {
    case "idempotence":
    case "transactions":
      return s.alive && s.txn === null && s.inflight === null;
    case "process":
      return s.alive && s.inflight === null && s.position < s.orders && (!s.transactional || s.txn !== null);
    case "ack":
    case "retry":
      return s.alive && s.inflight !== null;
    case "commitInput":
      return s.alive && !s.transactional && s.inflight === null;
    case "begin":
      return s.alive && s.transactional && s.txn === null && s.inflight === null;
    case "commitTxn":
      return s.alive && s.txn !== null && s.inflight === null;
    case "abortTxn":
      return s.alive && s.txn !== null;
    case "crash":
      return s.alive;
    case "restart":
      return !s.alive;
    case "readCommitted":
    case "readUncommitted":
      return true;
  }
}

const session = (s: TState) => `${s.pid}:${s.epoch}`;

function append(s: TState, rec: Omit<Rec, "offset">): number {
  const offset = s.log.length;
  s.log.push({ ...rec, offset });
  return offset;
}

function newSession(s: TState) {
  s.pid = s.nextPid;
  s.nextPid += 1;
  s.epoch = 0;
  s.nextSeq = 0;
}

export function step(prev: TState, action: TAction): { state: TState; events: TEvent[] } {
  const s: TState = structuredClone(prev);
  const events: TEvent[] = [];
  if (!canDo(s, action.type)) return { state: prev, events: [{ type: "nothing" }] };

  switch (action.type) {
    case "idempotence": {
      s.idempotent = action.on;
      if (!action.on) s.transactional = false;
      newSession(s);
      events.push({ type: "config", idempotent: s.idempotent, transactional: s.transactional, pid: s.pid });
      break;
    }
    case "transactions": {
      s.transactional = action.on;
      // Transactions need idempotence; the producer switches it on with them.
      if (action.on) s.idempotent = true;
      newSession(s);
      events.push({ type: "config", idempotent: s.idempotent, transactional: s.transactional, pid: s.pid });
      break;
    }
    case "process": {
      const order = s.position;
      s.position += 1;
      const seq = s.idempotent ? s.nextSeq++ : null;
      const txn = s.txn?.id ?? null;
      const offset = append(s, { kind: "data", order, pid: s.pid, seq, txn });
      if (seq !== null) s.brokerSeq[session(s)] = seq;
      s.inflight = { order, seq, txn };
      events.push({ type: "written", offset, order, seq, txn, retry: false });
      break;
    }
    case "ack": {
      events.push({ type: "acked", order: s.inflight!.order });
      s.inflight = null;
      break;
    }
    case "retry": {
      const f = s.inflight!;
      const last = s.brokerSeq[session(s)];
      if (f.seq !== null && last !== undefined && f.seq <= last) {
        s.dropped += 1;
        events.push({ type: "retryDropped", order: f.order, seq: f.seq });
      } else {
        const offset = append(s, { kind: "data", order: f.order, pid: s.pid, seq: f.seq, txn: f.txn });
        events.push({ type: "written", offset, order: f.order, seq: f.seq, txn: f.txn, retry: true });
      }
      // This time the acknowledgement arrives.
      events.push({ type: "acked", order: f.order });
      s.inflight = null;
      break;
    }
    case "commitInput": {
      s.committed = s.position;
      events.push({ type: "inputCommitted", position: s.committed });
      break;
    }
    case "begin": {
      const id = s.nextTxn++;
      s.txn = { id };
      s.txns[id] = "open";
      events.push({ type: "begun", txn: id });
      break;
    }
    case "commitTxn": {
      const id = s.txn!.id;
      const offset = append(s, { kind: "commit", order: null, pid: s.pid, seq: null, txn: id });
      s.txns[id] = "committed";
      // The input offsets were sent to the transaction, so they commit with it.
      s.committed = s.position;
      s.txn = null;
      events.push({ type: "marker", offset, txn: id, kind: "commit", byCoordinator: false });
      events.push({ type: "inputCommitted", position: s.committed });
      break;
    }
    case "abortTxn": {
      const id = s.txn!.id;
      const offset = append(s, { kind: "abort", order: null, pid: s.pid, seq: null, txn: id });
      s.txns[id] = "aborted";
      s.txn = null;
      s.inflight = null;
      // After an abort the application goes back to its last committed input position.
      s.position = s.committed;
      events.push({ type: "marker", offset, txn: id, kind: "abort", byCoordinator: false });
      break;
    }
    case "crash": {
      events.push({ type: "crashed", openTxn: s.txn?.id ?? null, unacked: s.inflight !== null });
      s.alive = false;
      s.inflight = null;
      break;
    }
    case "restart": {
      s.alive = true;
      s.position = s.committed;
      if (s.transactional) {
        // Same transactional.id: same PID, higher epoch. The coordinator aborts what was left open.
        s.epoch += 1;
        s.nextSeq = 0;
        if (s.txn) {
          const id = s.txn.id;
          const offset = append(s, { kind: "abort", order: null, pid: s.pid, seq: null, txn: id });
          s.txns[id] = "aborted";
          s.txn = null;
          events.push({ type: "marker", offset, txn: id, kind: "abort", byCoordinator: true });
        }
      } else {
        // Without a transactional.id a restarted producer is a brand-new session.
        newSession(s);
      }
      events.push({ type: "restarted", position: s.position, pid: s.pid, epoch: s.epoch });
      break;
    }
    case "readCommitted":
    case "readUncommitted": {
      const who = action.type === "readCommitted" ? "rc" : "ru";
      const reader = s[who];
      const end = who === "rc" ? lastStable(s) : s.log.length;
      const got: number[] = [];
      while (reader.pos < end) {
        const r = s.log[reader.pos]!;
        // Control records (markers) are never handed to the application.
        if (r.kind === "data" && (who === "ru" || !isAborted(s, r))) got.push(r.offset);
        reader.pos += 1;
      }
      reader.seen.push(...got);
      const stoppedAt = who === "rc" && end < s.log.length ? end : null;
      events.push({ type: "read", reader: who, offsets: got, stoppedAt });
      break;
    }
  }
  return { state: s, events };
}

export function run(actions: TAction[], start: TState) {
  const states = [start];
  const events: TEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = step(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}

export const process: TAction = { type: "process" };
export const ack: TAction = { type: "ack" };
export const retry: TAction = { type: "retry" };
export const commitInput: TAction = { type: "commitInput" };
export const begin: TAction = { type: "begin" };
export const commitTxn: TAction = { type: "commitTxn" };
export const abortTxn: TAction = { type: "abortTxn" };
export const crash: TAction = { type: "crash" };
export const restart: TAction = { type: "restart" };
export const readC: TAction = { type: "readCommitted" };
export const readU: TAction = { type: "readUncommitted" };
export const idem = (on: boolean): TAction => ({ type: "idempotence", on });
export const txns = (on: boolean): TAction => ({ type: "transactions", on });

export const stepActions: TAction[][] = [
  // 0: one invoice, acknowledged; the input offset is committed.
  [process, ack, commitInput],
  // 1: the acknowledgement is lost and the producer retries: a duplicate.
  [process, retry, commitInput],
  // 2: idempotence on: the broker drops the retried copy.
  [idem(true), process, retry, commitInput],
  // 3: the normal path with sequence numbers.
  [process, ack, commitInput],
  // 4: crash after writing, before committing the input: the order is invoiced again.
  [process, ack, crash, restart, process, ack, commitInput],
  // 5: a transaction: invoice + input offset, closed by a commit marker.
  [txns(true), begin, process, ack, commitTxn],
  // 6: crash inside a transaction: the coordinator aborts it, then the work is redone.
  [begin, process, ack, crash, restart, begin, process, ack, commitTxn],
  // 7: two readers with different isolation levels read everything.
  [readC, readU],
  // 8: an open transaction holds read_committed back until it commits.
  [begin, process, ack, readC, readU, commitTxn, readC],
  // 9: limits; nothing new plays.
  [],
  // 10: try it yourself.
  [],
];

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

/** The try-it step keeps the log and readers but resets the producer to plain settings. */
export const sandboxStart: TState = (() => {
  const end = base.run.states[base.ends[SANDBOX_STEP]!]!;
  const s = structuredClone(end);
  s.idempotent = false;
  s.transactional = false;
  newSession(s);
  return s;
})();
