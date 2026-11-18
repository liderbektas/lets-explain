import { describe, expect, it } from "vitest";
import type { BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const send = (body: string, persistent: boolean): BrokerAction => ({ type: "publish", exchange: "", routingKey: "jobs", body, persistent });
const durable: BrokerAction = { type: "declareQueue", name: "jobs", durable: true };
const transient: BrokerAction = { type: "declareQueue", name: "jobs", durable: false };
const restart: BrokerAction = { type: "restart" };

const solutions: Record<string, BrokerAction[]> = {
  survivors: [durable, send("j1", true), send("j2", true), restart],
  "empty-shelf": [durable, send("j1", false), send("j2", false), restart],
  "no-shelf": [transient, send("j1", true), restart],
};

describe("durability", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: only persistent messages in durable queues survive; quorum keeps everything", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // First restart: a transient message in a durable queue and a transient queue are both lost.
    expect(at(2).queues.orders!.ready).toHaveLength(0);
    expect(at(2).queues.temp).toBeUndefined();
    // Second restart: only p1 (persistent, durable queue) is left.
    expect(at(4).queues.orders!.ready.map((m) => m.body)).toEqual(["p1"]);
    expect(at(4).queues.temp).toBeUndefined();
    // A quorum queue keeps even a transient message.
    expect(at(6).queues.payments!.ready.map((m) => m.body)).toEqual(["q1"]);
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
