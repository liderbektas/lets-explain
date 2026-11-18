import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import { apply, base, movesIn, sandboxStart, SANDBOX_STEP, type Action, type SREvent, type SRState } from "./model";

function ctxFor(actions: Action[]): SandboxCtx {
  let state = sandboxStart;
  const events: SREvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): Action[] | null {
  const walk = (actions: Action[], state: SRState, events: SREvent[][]): Action[] | null => {
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

const solutions: Record<string, Action[]> = {
  "new-field": [{ type: "edit", edit: "addCoupon" }, { type: "produce" }, { type: "poll" }],
  rejected: [{ type: "edit", edit: "addCouponRequired" }, { type: "produce" }],
  "reader-first": [{ type: "edit", edit: "removeTotal" }, { type: "produce" }, { type: "upgradeReader" }, { type: "poll" }],
};

describe("schema-registry lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(1).reader.failed).toBe(2); // the rename broke billing without the registry
    expect(at(6).versions.map((v) => v.id)).toEqual([1, 2]); // coupon with a default was accepted
    expect(at(7).versions).toHaveLength(2); // the rename was rejected
    expect(at(7).records).toHaveLength(at(6).records.length); // and nothing was written
    expect(at(8).reader.failed).toBe(3); // BACKWARD allowed deleting total, old billing broke
    expect(at(9).reader.failed).toBe(3); // after upgrading, billing reads fine again
    expect(at(SANDBOX_STEP - 1).reader.ok).toBe(at(8).reader.ok + 1);
  });

  it("starts the sandbox with nothing already done", () => {
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
