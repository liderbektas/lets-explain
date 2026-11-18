import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const send = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: "tasks", body: `t${n}` });
const join = (tag: string): BrokerAction => ({ type: "consume", tag, queue: "tasks", prefetch: 0 });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, BrokerAction[]> = {
  "all-done": [join("w1"), send(1), send(2), send(3), { type: "ack", tag: "w1", multiple: true }],
  rescued: [join("w1"), send(1), { type: "crashConsumer", tag: "w1" }, join("w2"), { type: "ack", tag: "w2", multiple: false }],
  share: [join("w1"), join("w2"), send(1), send(2)],
};

describe("first-queue", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: messages wait, are held until acked, and come back after a crash", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "hello").ready).toBe(3);
    expect(depth(at(2), "hello")).toMatchObject({ ready: 0, unacked: 3 });
    expect(depth(at(3), "hello").total).toBe(0);
    expect(depth(at(4), "hello").ready).toBe(2);
    expect(at(4).queues.hello!.ready.every((m) => m.redelivered)).toBe(true);
    expect(depth(at(5), "hello").total).toBe(0);
    // Round-robin: four new messages split two and two.
    expect(at(6).consumers["worker-1"]!.unacked).toHaveLength(2);
    expect(at(6).consumers["worker-2"]!.unacked).toHaveLength(2);
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
