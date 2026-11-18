import { describe, expect, it } from "vitest";
import { missions, type WorldCtx } from "./missions";
import { allowed, run, START, step, type WorldAction, type WorldEvent, type WorldState } from "./model";

const ctxFor = (actions: WorldAction[]): WorldCtx => {
  const r = run(actions);
  return { state: r.states[r.states.length - 1]!, actions, events: r.events };
};

function shortcut(check: (c: WorldCtx) => boolean, depth: number): WorldAction[] | null {
  const walk = (actions: WorldAction[], state: WorldState, events: WorldEvent[][]): WorldAction[] | null => {
    if (actions.length > 0 && check({ state, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of allowed(state)) {
      const r = step(state, a);
      const found = walk([...actions, a], r.state, [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], START, []);
}

const solutions: Record<string, WorldAction[]> = {
  tangle: [{ type: "addSource" }, { type: "addSource" }, { type: "addTarget" }],
  lost: [{ type: "crashEmail" }, { type: "order" }],
  "nothing-lost": [
    { type: "setMode", mode: "kafka" },
    { type: "crashEmail" },
    { type: "order" },
    { type: "order" },
    { type: "startEmail" },
  ],
};

describe("why-kafka missions", () => {
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
      expect(shortcut(m.check, m.par - 1)).toBeNull();
    });
  }

  it("orders during an outage are lost without Kafka", () => {
    const s = ctxFor([{ type: "crashEmail" }, { type: "order" }, { type: "order" }, { type: "startEmail" }]).state;
    expect(s.lost).toBe(2);
    expect(s.sent).toBe(0);
  });
});
