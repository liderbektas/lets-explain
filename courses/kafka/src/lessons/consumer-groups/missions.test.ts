import { describe, expect, it } from "vitest";
import type { Action } from "../../engine/types";
import { runMoves, shortestWin, topicCtx } from "../shared/topicSim";
import { missions } from "./missions";
import { commit, crash, enabledMoves, join, poll, sandboxStart } from "./model";

const ctxFor = (moves: Action[][]) => topicCtx(sandboxStart, runMoves(sandboxStart, moves), moves);

const solutions: Record<string, Action[][]> = {
  takeover: [[poll("billing-2")], [crash("billing-2")], [poll("billing-1")]],
  handover: [[poll("billing-2")], [commit("billing-2")], [crash("billing-2")], [poll("billing-1")], [commit("billing-1")]],
  team: [[join("billing-3")], [poll("billing-1")], [poll("billing-2")], [poll("billing-3")]],
};

describe("consumer-groups missions", () => {
  it("missions start unsolved", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      expect(solutions[m.id]).toHaveLength(m.par);
      expect(m.check(ctxFor(solutions[m.id]!))).toBe(true);
    });
    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortestWin(sandboxStart, enabledMoves, topicCtx, m.check, m.par - 1)).toBeNull();
    });
  }
});
