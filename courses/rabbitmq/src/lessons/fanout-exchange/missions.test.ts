import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { NEWS, scene, steps } from "./Scene";

const pub = (n: number): BrokerAction => ({ type: "publish", exchange: NEWS, routingKey: "", body: `n${n}` });
const bind = (queue: string): BrokerAction => ({ type: "bind", exchange: NEWS, queue });

const solutions: Record<string, BrokerAction[]> = {
  everyone: [bind("a"), bind("b"), bind("c"), pub(1)],
  "not-b": [bind("a"), bind("c"), pub(1)],
  late: [bind("a"), pub(1), bind("c"), pub(2)],
};

describe("fanout-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: copies to every bound queue, key ignored, late joiners miss the past", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "email").ready).toBe(1);
    expect(depth(at(1), "sms").ready).toBe(1);
    // A routing key of "xyz" makes no difference.
    expect(depth(at(2), "email").ready).toBe(2);
    expect(depth(at(2), "sms").ready).toBe(2);
    expect(depth(at(3), "email").total + depth(at(3), "sms").total).toBe(0);
    // analytics only sees o3, not o1 or o2.
    expect(at(4).queues.analytics!.ready.map((m) => m.body)).toEqual(["o3"]);
    expect(at(5).queues["tmp-dashboard"]).toBeUndefined();
    // After unbinding sms, o5 goes to email and analytics only.
    expect(at(6).queues.sms!.ready).toHaveLength(0);
    expect(at(6).queues.analytics!.ready.map((m) => m.body)).toEqual(["o3", "o4", "o5"]);
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
