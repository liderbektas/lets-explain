import { describe, expect, it } from "vitest";
import type { RAction } from "../../engine/replication";
import { enabledMoves, findShortcut, playMoves } from "../cluster-kit/kit";
import { missions } from "./missions";
import { controls, model, run, sandboxOrder, sandboxStart, writtenIn } from "./model";

const movesIn = (s: typeof sandboxStart, actions: RAction[]) => enabledMoves(controls(s, writtenIn(actions)));

const solutions: Record<string, RAction[]> = {
  "new-leader": [{ type: "crash", broker: 1 }, sandboxOrder(0)],
  "lonely-isr": [
    { type: "setSlow", broker: 2, slow: true },
    { type: "setSlow", broker: 3, slow: true },
    sandboxOrder(0),
    { type: "tick" },
  ],
  "unclean-loss": [
    { type: "setSlow", broker: 3, slow: true },
    sandboxOrder(0),
    { type: "tick" },
    { type: "crash", broker: 1 },
    { type: "crash", broker: 2 },
    { type: "setUnclean", value: true },
  ],
};

describe("replication lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => run.states[run.ends[step]!]!.partitions[0]!;
    expect(at(1).isr).toEqual([1, 2, 3]);
    expect(at(4)).toMatchObject({ hw: 5 });
    expect(at(5)).toMatchObject({ hw: 7, isr: [1, 2] });
    expect(at(6).isr).toEqual([1, 2, 3]);
    expect(at(7).leader).toBe(2);
    expect(at(9).leader).toBeNull();
    expect(sandboxStart.partitions[0]).toMatchObject({ leader: 1, isr: [1, 2, 3] });
    expect(sandboxStart.sends.every((x) => x.status !== "lost")).toBe(true);
  });

  it("starts with no mission already done", () => {
    for (const m of missions) expect(m.check(playMoves(model, sandboxStart, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const moves = solutions[m.id]!;
      expect(moves).toHaveLength(m.par);
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
