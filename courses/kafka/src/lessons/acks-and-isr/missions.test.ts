import { describe, expect, it } from "vitest";
import type { RAction } from "../../engine/replication";
import { enabledMoves, findShortcut, playMoves } from "../cluster-kit/kit";
import { missions } from "./missions";
import { controls, model, run, sandboxOrder, sandboxStart, writtenIn } from "./model";

const movesIn = (s: typeof sandboxStart, actions: RAction[]) => enabledMoves(controls(s, writtenIn(actions)));

const solutions: Record<string, RAction[]> = {
  "acked-loss": [{ type: "setAcks", acks: 1 }, { type: "setSlow", broker: 1, slow: true }, sandboxOrder(0), { type: "crash", broker: 2 }],
  rejected: [{ type: "crash", broker: 1 }, { type: "crash", broker: 3 }, sandboxOrder(0)],
  "two-crashes": [{ type: "crash", broker: 1 }, sandboxOrder(0), { type: "crash", broker: 3 }],
  "after-append": [
    { type: "setSlow", broker: 1, slow: true },
    { type: "setSlow", broker: 3, slow: true },
    sandboxOrder(0),
    { type: "tick" },
  ],
};

describe("acks-and-isr lesson", () => {
  it("tells the story the steps describe", () => {
    const end = (step: number) => run.states[run.ends[step]!]!;
    const statusOf = (step: number) => end(step).sends.map((x) => x.status);
    expect(statusOf(0)).toEqual(["acked", "acked"]);
    expect(statusOf(1).slice(2)).toEqual(["sent", "sent"]);
    expect(statusOf(2)[4]).toBe("acked");
    expect(statusOf(3)[4]).toBe("lost");
    expect(end(5).sends[6]!.status).toBe("acked");
    expect(end(6).partitions[0]!.isr).toEqual([2]);
    expect(end(6).sends[7]!.status).toBe("acked");
    expect(end(7).sends[8]).toMatchObject({ status: "failed", reason: "notEnoughReplicas" });
    expect(end(8).sends.slice(9).map((x) => x.status)).toEqual(["acked", "failed"]);
    expect(sandboxStart.partitions[0]).toMatchObject({ leader: 2, isr: [1, 2, 3] });
    expect(sandboxStart.config).toMatchObject({ acks: "all", minIsr: 2 });
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
