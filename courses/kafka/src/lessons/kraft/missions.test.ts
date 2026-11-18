import { describe, expect, it } from "vitest";
import { enabledMoves, findShortcut, playMoves } from "../cluster-kit/kit";
import { missions } from "./missions";
import { applyKraft, controls, createKraft, model, run, sandboxStart, stranded, topicsIn, type KAction } from "./model";

const movesIn = (s: typeof sandboxStart, actions: KAction[]) => enabledMoves(controls(s, topicsIn(actions)));
const topic = (n: number): KAction => ({ type: "createTopic", name: `topic-${n}` });

const solutions: Record<string, KAction[]> = {
  "new-active": [{ type: "crashController", id: 1 }, topic(1)],
  frozen: [{ type: "crashController", id: 1 }, { type: "crashController", id: 2 }, topic(1)],
  stranded: [{ type: "crashController", id: 1 }, { type: "crashController", id: 2 }, { type: "crashBroker", id: 1 }],
  rescue: [
    { type: "crashController", id: 1 },
    { type: "crashController", id: 2 },
    { type: "crashBroker", id: 1 },
    { type: "restartController", id: 1 },
  ],
};

describe("KRaft model", () => {
  it("moves leadership off a crashed broker through the metadata log", () => {
    const r = applyKraft(createKraft(), { type: "crashBroker", id: 2 });
    expect(r.state.partitions[1]!.leader).toBe(3);
    expect(r.state.controllers.every((c) => c.log.length === r.state.committed)).toBe(true);
  });

  it("elects a new active controller while a majority is up, and freezes without one", () => {
    let s = applyKraft(createKraft(), { type: "crashController", id: 1 }).state;
    expect(s.active).toBe(2);
    s = applyKraft(s, { type: "crashController", id: 2 }).state;
    expect(s.active).toBeNull();
    const r = applyKraft(s, { type: "crashBroker", id: 3 });
    expect(stranded(r.state).map((p) => p.index)).toEqual([2]);
  });

  it("tells the story the steps describe", () => {
    const end = (step: number) => run.states[run.ends[step]!]!;
    expect(end(4).partitions[1]!.leader).toBe(3);
    expect(end(6).active).toBe(2);
    expect(end(7).active).toBeNull();
    expect(stranded(end(7)).length).toBeGreaterThan(0);
    expect(end(8).active).not.toBeNull();
    expect(stranded(end(8))).toHaveLength(0);
    expect(sandboxStart.controllers.every((c) => c.alive)).toBe(true);
    expect(sandboxStart.active).toBe(1);
    expect(sandboxStart.brokers.every((b) => b.alive && !b.fenced)).toBe(true);
  });
});

describe("kraft missions", () => {
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
