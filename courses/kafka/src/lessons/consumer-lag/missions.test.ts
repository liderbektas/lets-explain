import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  apply,
  assignment,
  HOT_PARTITION,
  lagOf,
  MAX_CONSUMERS,
  sandboxStart,
  steps,
  totalLag,
  type LAction,
  type LEvent,
  type LState,
} from "./model";

/** The moves the try-it buttons allow, matching which buttons are enabled. */
function movesIn(state: LState): LAction[] {
  const out: LAction[] = [{ type: "tick" }, { type: "toggleHot" }, { type: "toggleFast" }];
  if (state.members.length < MAX_CONSUMERS) out.push({ type: "addConsumer" });
  if (state.members.length > 0) out.push({ type: "removeConsumer" });
  return out;
}

function ctxFor(actions: LAction[]): SandboxCtx {
  let state = sandboxStart;
  const events: LEvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): LAction[] | null {
  const walk = (actions: LAction[], state: LState, events: LEvent[][]): LAction[] | null => {
    if (actions.length > 0 && check({ start: sandboxStart, state, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of movesIn(state)) {
      const r = apply(state, a);
      const found = walk([...actions, a], r.state, [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, []);
}

const tick: LAction = { type: "tick" };
const add: LAction = { type: "addConsumer" };
const solutions: Record<string, LAction[]> = {
  catchup: [add, add, tick, tick],
  hot: [{ type: "toggleHot" }, { type: "toggleFast" }, add, tick, tick],
  lost: [{ type: "toggleHot" }, tick, tick, tick],
};

const at = (step: number) => {
  const run = steps[step]!.run;
  return run.states[run.states.length - 1]!;
};

describe("consumer-lag model", () => {
  it("lag is log-end offset minus committed offset", () => {
    const s = at(0);
    expect(s.partitions[0]!.logEnd).toBe(6);
    expect(s.partitions[0]!.committed).toBe(2);
    expect(totalLag(s)).toBe(4);
    expect(totalLag(at(1))).toBe(4);
    expect(totalLag(at(2))).toBe(7);
  });

  it("one consumer falls behind on three partitions, three catch up", () => {
    expect(totalLag(at(3))).toBe(12);
    expect(totalLag(at(4))).toBe(3);
    expect(totalLag(at(5))).toBe(0);
  });

  it("a fourth consumer on three partitions gets nothing", () => {
    const s = at(5);
    expect(s.members).toHaveLength(4);
    expect(assignment(s)[s.members[3]!]).toEqual([]);
  });

  it("the hot partition keeps growing until the code gets faster", () => {
    const hot = at(6);
    expect(lagOf(hot.partitions[HOT_PARTITION]!)).toBe(4);
    expect(totalLag(hot)).toBe(4);
    expect(totalLag(at(7))).toBe(1);
  });

  it("retention deletes what nobody read", () => {
    expect(at(8).missed).toBe(3);
    expect(at(7).missed).toBe(0);
  });
});

describe("consumer-lag missions", () => {
  it("starts with nothing already done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)?.map((a) => a.type) ?? null).toBeNull();
    });
  }
});
