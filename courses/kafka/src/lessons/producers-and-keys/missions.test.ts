import { describe, expect, it } from "vitest";
import type { Action } from "../../engine/types";
import { partitionForKey } from "../../engine/murmur2";
import { runMoves, shortestWin, topicCtx } from "../shared/topicSim";
import { missions } from "./missions";
import { enabledMoves, sandboxMoves, sandboxStart } from "./model";

const ctxFor = (moves: Action[][]) => topicCtx(sandboxStart, runMoves(sandboxStart, moves), moves);
const c = sandboxMoves.customer;
const grow = (n: number): Action[] => [{ type: "addPartitions", topic: "orders", count: n }];

const solutions: Record<string, Action[][]> = {
  neighbours: [c("ali"), c("can")],
  split: [c("ali"), grow(4), c("ali")],
  fill: [c("mehmet"), grow(4), c("can"), c("mehmet"), c("ali")],
};

describe("producers-and-keys", () => {
  it("keys land where the lesson says", () => {
    expect(["ali", "mehmet", "zeynep", "can"].map((k) => partitionForKey(k, 3))).toEqual([0, 1, 2, 0]);
    expect(["ali", "mehmet", "zeynep", "can"].map((k) => partitionForKey(k, 4))).toEqual([3, 2, 3, 0]);
  });

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
