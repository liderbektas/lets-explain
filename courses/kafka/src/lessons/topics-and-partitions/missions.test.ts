import { describe, expect, it } from "vitest";
import type { Action, ClusterState } from "../../engine/types";
import { runMoves, shortestWin, topicCtx } from "../shared/topicSim";
import { missions } from "./missions";
import { enabledMoves, sandboxMoves, sandboxStart } from "./model";

const writtenIn = (moves: Action[][]) => moves.flat().filter((a) => a.type === "produce").length;
const movesIn = (state: ClusterState, history: Action[][]) => enabledMoves(state, writtenIn(history));

/** Builds a solution press by press, since each press depends on the state at that moment. */
function play(presses: ("write" | "grow" | "addReader" | "removeReader" | "tick")[]): Action[][] {
  const moves: Action[][] = [];
  let state = sandboxStart;
  for (const p of presses) {
    const move = p === "write" ? sandboxMoves.write(writtenIn(moves)) : sandboxMoves[p](state);
    moves.push(move);
    state = runMoves(state, [move]).states[1]!;
  }
  return moves;
}

const ctxFor = (moves: Action[][]) => topicCtx(sandboxStart, runMoves(sandboxStart, moves), moves);

const solutions: Record<string, Action[][]> = {
  "three-lanes": play(["grow", "grow", "write", "write"]),
  parallel: play(["grow", "grow", "write", "write", "addReader", "addReader", "tick"]),
  idle: play(["grow", "grow", "addReader", "addReader", "addReader"]),
};

describe("topics-and-partitions missions", () => {
  it("starts with nothing already done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const moves = solutions[m.id]!;
      expect(moves).toHaveLength(m.par);
      expect(m.check(ctxFor(moves))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortestWin(sandboxStart, movesIn, topicCtx, m.check, m.par - 1)).toBeNull();
    });
  }
});
