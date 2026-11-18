import { describe, expect, it } from "vitest";
import { apply } from "../../engine/cluster";
import type { Action, ClusterState, SimEvent } from "../../engine/types";
import { missions, type SandboxCtx } from "./missions";
import { ANALYTICS, BILLING, commit, consumers, crash, deleteOldest, join, nextOrder, poll, produce, sandboxStart, seek, TOPIC } from "./model";

/** The moves the try-it buttons allow in a state, matching which buttons are enabled. */
function movesIn(state: ClusterState, writtenSoFar: number): Action[] {
  const p = state.topics[TOPIC]!.partitions[0]!;
  const out: Action[] = [produce(nextOrder(writtenSoFar))];
  if (p.logStartOffset < p.logEndOffset) out.push(deleteOldest(state));
  for (const c of consumers) {
    const alive = state.groups[c.group]?.members.some((m) => m.id === c.member);
    if (alive) out.push(poll(c, 1), poll(c), commit(c), seek(c, p.logStartOffset), crash(c));
    else out.push(join(c));
  }
  return out;
}

function ctxFor(actions: Action[]): SandboxCtx {
  let state = sandboxStart;
  const events: SimEvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

/** Is there any sequence of at most `depth` moves that completes the mission? */
function shortcut(check: (c: SandboxCtx) => boolean, depth: number): Action[] | null {
  const walk = (actions: Action[], state: ClusterState, events: SimEvent[][], written: number): Action[] | null => {
    if (actions.length > 0 && check({ start: sandboxStart, state, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of movesIn(state, written)) {
      const r = apply(state, a);
      const found = walk([...actions, a], r.state, [...events, r.events], written + (a.type === "produce" ? 1 : 0));
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, [], 0);
}

const describeMove = (a: Action) => ("group" in a ? `${a.type}(${a.group}${"max" in a && a.max ? `,${a.max}` : ""})` : a.type);

const solutions: Record<string, (s: ClusterState) => Action[]> = {
  double: () => [produce(nextOrder(0)), poll(BILLING), crash(BILLING), join(BILLING), poll(BILLING)],
  safe: () => [produce(nextOrder(0)), produce(nextOrder(1)), poll(BILLING), commit(BILLING), crash(BILLING), join(BILLING)],
  replay: (s) => [seek(ANALYTICS, s.topics[TOPIC]!.partitions[0]!.logStartOffset), poll(ANALYTICS), commit(ANALYTICS)],
  missed: () => {
    // Deletion depends on the state at the time, so build it move by move.
    const out: Action[] = [produce(nextOrder(0))];
    let state = ctxFor(out).state;
    for (let i = 0; i < 3; i++) {
      out.push(deleteOldest(state));
      state = ctxFor(out).state;
    }
    return out;
  },
};

describe("log-and-offset missions", () => {
  it("starts with nothing already done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const actions = solutions[m.id]!(sandboxStart);
      expect(actions).toHaveLength(m.par);
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)?.map(describeMove) ?? null).toBeNull();
    });
  }

  it("a crash right after reading, without commit, fails the safe-crash mission", () => {
    const safe = missions.find((m) => m.id === "safe")!;
    const actions = [produce(nextOrder(0)), produce(nextOrder(1)), poll(BILLING), crash(BILLING), join(BILLING), poll(BILLING)];
    expect(safe.check(ctxFor(actions))).toBe(false);
  });
});
