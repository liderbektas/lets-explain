import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { order, QUEUE, scene, steps, worker } from "./Scene";

const crash = (tag: string): BrokerAction => ({ type: "crashConsumer", tag });
const tick: BrokerAction = { type: "tick", count: 1 };

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, BrokerAction[]> = {
  // Stop the stuck worker, add a healthy one, let time pass.
  drain: [crash("w2"), worker("w3"), tick, tick],
  zero: [crash("w1"), crash("w2"), worker("w3"), tick],
  pile: [crash("w1"), crash("w2"), order(5)],
};

describe("operations", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(11);
  });

  it("the story: healthy, a spike piles up, a second worker drains it, a stuck worker, then no consumers", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), QUEUE).total).toBe(0);
    // Six orders for a worker doing one per tick: after 2 ticks, 2 held and 2 still waiting.
    expect(depth(at(2), QUEUE)).toMatchObject({ ready: 2, unacked: 2 });
    expect(depth(at(3), QUEUE).total).toBe(0);
    // The stuck worker holds orders it never acks.
    const stuck = at(4).consumers["worker-3"]!;
    expect(stuck.unacked.length).toBeGreaterThan(0);
    expect(stuck.done).toHaveLength(0);
    // Crashing it hands its orders back and the others finish them.
    expect(depth(at(5), QUEUE).total).toBe(0);
    expect(at(5).lost).toHaveLength(0);
    // With no consumers left, new orders only pile up.
    expect(Object.keys(at(6).consumers)).toHaveLength(0);
    expect(depth(at(6), QUEUE).ready).toBe(3);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
});
