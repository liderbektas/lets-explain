import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const bind = (queue: string, key: string): BrokerAction => ({ type: "bind", exchange: "shop", queue, key });
const pub = (key: string, body: string): BrokerAction => ({ type: "publish", exchange: "shop", routingKey: key, body });

const solutions: Record<string, BrokerAction[]> = {
  "first-route": [bind("billing", "order.paid"), pub("order.paid", "p1")],
  both: [bind("billing", "order.paid"), bind("shipping", "order.paid"), pub("order.paid", "p1")],
  "lost-then-found": [pub("order.shipped", "s1"), bind("shipping", "order.shipped"), pub("order.shipped", "s2")],
};

describe("amqp-model", () => {
  it("lesson steps run without broker errors, except the one refused on purpose", () => {
    expect(steps).toHaveLength(9);
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      if (EXPECTED_ERRORS[step]) {
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ message: expect.stringContaining(EXPECTED_ERRORS[step]!) });
      } else expect(errors, `step ${step}`).toEqual([]);
    });
  });

  it("the story: routed by binding, unroutable dropped, declare idempotent, conflicting declare refused", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(2), "billing").ready).toBe(1);
    expect(depth(at(3), "billing").ready).toBe(1);
    expect(at(3).lost).toEqual([{ id: "m2", reason: "unroutable" }]);
    // Declaring the same queue again changes nothing.
    expect(at(4)).toEqual(at(3));
    // The conflicting declare is refused, and the queue keeps its settings.
    expect(at(5).queues.billing!.durable).toBe(true);
    expect(at(7).consumers["billing-1"]!.done).toEqual(["m1"]);
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
