import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  abortTxn,
  abortedSeenBy,
  ack,
  base,
  begin,
  canDo,
  commitInput,
  commitTxn,
  crash,
  duplicateOrders,
  idem,
  lastStable,
  process,
  readC,
  readU,
  restart,
  retry,
  run,
  sandboxStart,
  step,
  txns,
  type TAction,
  type TEvent,
  type TState,
} from "./model";

/** The moves the try-it buttons allow in a state, matching which buttons are enabled. */
function movesIn(s: TState): TAction[] {
  const all = [process, ack, retry, commitInput, begin, commitTxn, abortTxn, crash, restart, readC, readU, idem(!s.idempotent), txns(!s.transactional)];
  return all.filter((a) => canDo(s, a.type));
}

function ctxFor(actions: TAction[]): SandboxCtx {
  const r = run(actions, sandboxStart);
  return { start: sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): string[] | null {
  const walk = (actions: TAction[], s: TState, events: TEvent[][]): TAction[] | null => {
    if (actions.length > 0 && check({ start: sandboxStart, state: s, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of movesIn(s)) {
      const r = step(s, a);
      const found = walk([...actions, a], r.state, [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, [])?.map((a) => a.type) ?? null;
}

const solutions: Record<string, TAction[]> = {
  "retry-dup": [process, retry],
  "broker-drops": [idem(true), process, retry],
  "hidden-abort": [txns(true), begin, process, abortTxn, readU, readC],
};

describe("idempotence-and-transactions lesson", () => {
  const at = (i: number) => base.run.states[base.ends[i]!]!;

  it("tells the story the steps describe", () => {
    expect(duplicateOrders(at(1))).toBe(1);
    expect(at(2).dropped).toBe(1);
    expect(duplicateOrders(at(2))).toBe(1);
    expect(duplicateOrders(at(4))).toBe(2);
    expect(at(5).log.at(-1)!.kind).toBe("commit");
    const s6 = at(6);
    expect(s6.log.filter((r) => r.kind === "abort")).toHaveLength(1);
    expect(duplicateOrders(s6)).toBe(2);
    const s7 = at(7);
    expect(abortedSeenBy(s7, "rc")).toBe(0);
    expect(abortedSeenBy(s7, "ru")).toBe(1);
    // In step 8, read_committed waited at the open transaction, then caught up after the commit.
    const ev8 = base.run.events.slice(base.startOf(8), base.ends[8]!).flat();
    const stops = ev8.filter((e) => e.type === "read" && e.reader === "rc").map((e) => (e.type === "read" ? e.stoppedAt : null));
    expect(stops[0]).not.toBeNull();
    expect(stops[1]).toBeNull();
    expect(lastStable(at(8))).toBe(at(8).log.length);
  });

  it("starts the try-it step clean", () => {
    expect(sandboxStart.idempotent).toBe(false);
    expect(sandboxStart.transactional).toBe(false);
    expect(sandboxStart.txn).toBeNull();
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)).toBeNull();
    });
  }

  it("non-transactional commit avoids a repeat only if it comes before the crash", () => {
    const safe = ctxFor([process, ack, commitInput, crash, restart]);
    expect(duplicateOrders(safe.state)).toBe(duplicateOrders(sandboxStart));
  });
});
