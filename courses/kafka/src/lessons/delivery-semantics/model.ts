/**
 * A tiny model of one consumer that reads a record, does something with it in the outside
 * world (sends an email) and commits. The guarantee depends only on the order of those
 * three moments and on where a crash lands between them.
 *
 * One partition, one consumer. Offsets start at 0 and the committed offset is the next
 * offset to read, as in Kafka.
 */

export interface DRecord {
  offset: number;
  value: string;
}

export interface DState {
  records: DRecord[];
  alive: boolean;
  /** Next offset to read, held only in the consumer's memory. */
  position: number;
  /** Next offset to read after a restart, saved in Kafka. */
  committed: number;
  /** Records read but not yet processed, oldest first. Lost on a crash. */
  hand: number[];
  /** How many emails went out for each offset. */
  sent: Record<number, number>;
  /** Processing skipped because the "already sent" list had the order. */
  skips: number;
  /** Whether the consumer checks its "already sent" list before sending. */
  dedupe: boolean;
}

export type DAction =
  | { type: "produce" }
  | { type: "read" }
  | { type: "process" }
  | { type: "commit" }
  | { type: "crash" }
  | { type: "restart" }
  | { type: "dedupe"; on: boolean };

export type DEvent =
  | { type: "produced"; offset: number; value: string }
  | { type: "read"; offset: number; again: boolean }
  | { type: "sent"; offset: number; times: number }
  | { type: "skipped"; offset: number }
  | { type: "committed"; offset: number }
  | { type: "crashed"; dropped: number[] }
  | { type: "restarted"; from: number; lost: number[] }
  | { type: "dedupe"; on: boolean }
  | { type: "nothing"; why: "caught-up" | "empty-hand" | "hand-full" | "down" | "up" };

export const HAND_MAX = 3;

export const emptyState = (): DState => ({
  records: [],
  alive: true,
  position: 0,
  committed: 0,
  hand: [],
  sent: {},
  skips: 0,
  dedupe: false,
});

export const orderValue = (offset: number) => `order:${1041 + offset}`;

/** Offsets the consumer will never handle: committed past, never sent, no longer in hand. */
export function lostOffsets(s: DState): number[] {
  const out: number[] = [];
  for (let o = 0; o < Math.min(s.committed, s.records.length); o++) {
    if (!s.sent[o] && !s.hand.includes(o)) out.push(o);
  }
  return out;
}

/** Extra emails: every send beyond the first, summed over orders. */
export function duplicateCount(s: DState): number {
  return Object.values(s.sent).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
}

export const lagOf = (s: DState) => s.records.length - s.committed;

/** Which actions make sense now; the try-it buttons are enabled from this. */
export function canDo(s: DState, a: DAction["type"]): boolean {
  switch (a) {
    case "produce":
      return true;
    case "read":
      return s.alive && s.position < s.records.length && s.hand.length < HAND_MAX;
    case "process":
      return s.alive && s.hand.length > 0;
    case "commit":
      return s.alive;
    case "crash":
      return s.alive;
    case "restart":
      return !s.alive;
    case "dedupe":
      return true;
  }
}

export function step(prev: DState, action: DAction): { state: DState; events: DEvent[] } {
  const s: DState = { ...prev, records: [...prev.records], hand: [...prev.hand], sent: { ...prev.sent } };
  const events: DEvent[] = [];

  switch (action.type) {
    case "produce": {
      const offset = s.records.length;
      const value = orderValue(offset);
      s.records.push({ offset, value });
      events.push({ type: "produced", offset, value });
      break;
    }
    case "read": {
      if (!s.alive) events.push({ type: "nothing", why: "down" });
      else if (s.position >= s.records.length) events.push({ type: "nothing", why: "caught-up" });
      else if (s.hand.length >= HAND_MAX) events.push({ type: "nothing", why: "hand-full" });
      else {
        const offset = s.position;
        s.hand.push(offset);
        s.position += 1;
        events.push({ type: "read", offset, again: (prev.sent[offset] ?? 0) > 0 || offset < prev.committed });
      }
      break;
    }
    case "process": {
      if (!s.alive) events.push({ type: "nothing", why: "down" });
      else if (s.hand.length === 0) events.push({ type: "nothing", why: "empty-hand" });
      else {
        const offset = s.hand.shift()!;
        if (s.dedupe && (s.sent[offset] ?? 0) > 0) {
          s.skips += 1;
          events.push({ type: "skipped", offset });
        } else {
          s.sent[offset] = (s.sent[offset] ?? 0) + 1;
          events.push({ type: "sent", offset, times: s.sent[offset]! });
        }
      }
      break;
    }
    case "commit": {
      if (!s.alive) events.push({ type: "nothing", why: "down" });
      else {
        s.committed = s.position;
        events.push({ type: "committed", offset: s.committed });
      }
      break;
    }
    case "crash": {
      if (!s.alive) events.push({ type: "nothing", why: "down" });
      else {
        events.push({ type: "crashed", dropped: s.hand });
        s.alive = false;
        s.hand = [];
      }
      break;
    }
    case "restart": {
      if (s.alive) events.push({ type: "nothing", why: "up" });
      else {
        s.alive = true;
        s.position = s.committed;
        events.push({ type: "restarted", from: s.committed, lost: lostOffsets(s) });
      }
      break;
    }
    case "dedupe": {
      s.dedupe = action.on;
      events.push({ type: "dedupe", on: action.on });
      break;
    }
  }
  return { state: s, events };
}

export function run(actions: DAction[], start: DState) {
  const states = [start];
  const events: DEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = step(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}

const A = (type: Exclude<DAction["type"], "dedupe">): DAction => ({ type }) as DAction;
export const produce = A("produce");
export const read = A("read");
export const process = A("process");
export const commit = A("commit");
export const crash = A("crash");
export const restart = A("restart");
export const dedupe = (on: boolean): DAction => ({ type: "dedupe", on });

/** What each step plays. Every state is rebuilt by replaying these, so steps are exact. */
export const stepActions: DAction[][] = [
  // 0: three orders on the log; the email service is ready at offset 0.
  [produce, produce, produce],
  // 1: the normal flow for offset 0.
  [read, process, commit],
  // 2: crash right after reading offset 1, before doing anything: harmless.
  [read, crash, restart, read],
  // 3: commit first, then crash before sending: offset 1 is lost (at-most-once).
  [commit, crash, restart],
  // 4: send first, then crash before committing: offset 2 is sent twice (at-least-once).
  [read, process, crash, restart, read, process, commit],
  // 5: three new orders handled with one commit at the end, crash just before it.
  [produce, produce, produce, read, process, read, process, read, process, crash, restart, read, process, read, process, read, process, commit],
  // 6: choosing: nothing new plays.
  [],
  // 7: idempotent consumer: the same crash, but the "already sent" list catches the repeat.
  [dedupe(true), produce, read, process, crash, restart, read, process, commit],
  // 8: exactly-once in reality: nothing new plays.
  [],
  // 9: try it yourself.
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;

export const base = (() => {
  const r = run(stepActions.flat(), emptyState());
  const ends: number[] = [];
  let n = 0;
  for (const actions of stepActions) {
    n += actions.length;
    ends.push(n);
  }
  const startOf = (i: number) => (i === 0 ? 0 : ends[i - 1]!);
  return { run: r, ends, startOf };
})();

/**
 * The try-it step starts from the end of the lesson with one more order waiting and the
 * "already sent" list switched off, so every mission starts from the same honest place.
 */
export const sandboxStart: DState = (() => {
  const end = base.run.states[base.ends[SANDBOX_STEP]!]!;
  const withOrder = step({ ...end, dedupe: false }, produce).state;
  return withOrder;
})();
