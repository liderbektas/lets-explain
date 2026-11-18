import { describe, expect, it } from "vitest";
import type { RAction } from "../../engine/replication";
import { enabledMoves, findShortcut, playMoves } from "../cluster-kit/kit";
import { missions } from "./missions";
import { controls, model, run, SANDBOX_STEP, sandboxOrder, sandboxStart, writtenIn } from "./model";

const movesIn = (s: typeof sandboxStart, actions: RAction[]) => enabledMoves(controls(s, writtenIn(actions)));

const solutions: Record<string, RAction[]> = {
  "empty-broker": [{ type: "reassign", partition: 0, replicas: [3] }, sandboxOrder(0, 0)],
  maintenance: [{ type: "reassign", partition: 0, replicas: [3] }, { type: "crash", broker: 1 }, sandboxOrder(0, 0)],
  outage: [{ type: "crash", broker: 2 }, sandboxOrder(0, 1), { type: "restart", broker: 2 }, sandboxOrder(1, 1)],
};

describe("brokers-and-clusters", () => {
  it("lays the lesson out as expected", () => {
    const s = sandboxStart;
    expect(s.brokers.map((b) => b.id)).toEqual([1, 2, 3, 4]);
    expect(s.partitions.map((p) => p.leader)).toEqual([1, 2, 4]);
    // The crash step: P1 rejected a write while broker 2 was down.
    const crashStep = run.events.slice(run.startOf(7), run.ends[7]).flat();
    expect(crashStep.some((e) => e.type === "rejected" && e.partition === 1)).toBe(true);
    expect(SANDBOX_STEP).toBe(9);
  });

  it("starts with no mission already done", () => {
    for (const m of missions) expect(m.check(playMoves(model, sandboxStart, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const moves = solutions[m.id]!;
      expect(moves).toHaveLength(m.par);
      // Every move must be a button the reader can press at that point.
      let ctx = playMoves(model, sandboxStart, []);
      for (const a of moves) {
        expect(movesIn(ctx.state, ctx.actions)).toContainEqual(a);
        ctx = playMoves(model, sandboxStart, [...ctx.actions, a]);
      }
      expect(m.check(ctx)).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(findShortcut(model, sandboxStart, movesIn, m.check, m.par - 1)).toBeNull();
    });
  }
});
