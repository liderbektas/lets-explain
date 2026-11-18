import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  base,
  canDo,
  commit,
  crash,
  dedupe,
  duplicateCount,
  lostOffsets,
  process,
  produce,
  read,
  restart,
  run,
  sandboxStart,
  step,
  type DAction,
  type DEvent,
  type DState,
} from "./model";

/** The moves the try-it buttons allow in a state, matching which buttons are enabled. */
function movesIn(s: DState): DAction[] {
  const out: DAction[] = [];
  for (const a of [produce, read, process, commit, crash, restart]) if (canDo(s, a.type)) out.push(a);
  out.push(dedupe(!s.dedupe));
  return out;
}

function ctxFor(actions: DAction[]): SandboxCtx {
  const r = run(actions, sandboxStart);
  return { start: sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): string[] | null {
  const walk = (actions: DAction[], s: DState, events: DEvent[][]): DAction[] | null => {
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

const solutions: Record<string, DAction[]> = {
  lose: [read, commit, crash],
  twice: [read, process, crash, restart, read, process],
  safe: [read, process, commit, crash, restart],
  dedupe: [dedupe(true), read, process, crash, restart, read, process],
};

describe("delivery-semantics lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (i: number) => base.run.states[base.ends[i]!]!;
    expect(lostOffsets(at(2))).toEqual([]);
    expect(lostOffsets(at(3))).toEqual([1]);
    expect(at(4).sent[2]).toBe(2);
    expect(duplicateCount(at(5))).toBe(1 + 3);
    expect(at(7).skips).toBe(1);
    expect(at(7).sent[6]).toBe(1);
    expect(sandboxStart.records.length - sandboxStart.committed).toBe(1);
    expect(sandboxStart.dedupe).toBe(false);
  });

  it("starts the try-it step with no mission already done", () => {
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
});
