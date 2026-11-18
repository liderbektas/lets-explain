import { describe, expect, it } from "vitest";
import { createBroker, simulate, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { KEYS, mergedForDrawing, scene, steps } from "./Scene";

const pub = (key: string): BrokerAction => ({ type: "publish", exchange: "events", routingKey: key, body: KEYS.find((k) => k.key === key)!.body });
const bind = (key: string): BrokerAction => ({ type: "bind", exchange: "events", queue: "target", key });

const solutions: Record<string, BrokerAction[]> = {
  "eu-only": [bind("order.*.eu"), pub("order.created.eu"), pub("order.paid.eu"), pub("order.created.us")],
  "all-orders": [bind("order.#"), pub("order.created.eu"), pub("order.paid.eu"), pub("order.created.us")],
  "two-rules": [bind("user.#"), bind("*.*.us"), pub("order.created.us"), pub("user.signup.eu")],
};

describe("topic-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: what each key reaches, as the lesson text says", () => {
    const routed = (step: number) => {
      const evs = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
      const r = evs.find((e) => e.type === "routed");
      return r && r.type === "routed" ? [...r.queues].sort() : [];
    };
    expect(routed(1)).toEqual(["all-orders", "audit", "eu-orders"]);
    expect(routed(2)).toEqual(["all-orders", "audit"]);
    expect(routed(3)).toEqual(["audit"]);
    expect(routed(4)).toEqual(["all-orders", "audit"]);
    expect(routed(5)).toEqual(["all-orders", "audit", "eu-orders", "refunds"]);
  });

  it("the drawing merges two bindings to one queue into one label", () => {
    const b = simulate(
      [{ type: "declareExchange", name: "events", kind: "topic" }, { type: "declareQueue", name: "target" }, bind("user.#"), bind("*.*.us")],
      createBroker(),
    ).states[4]!;
    expect(mergedForDrawing(b).bindings).toHaveLength(1);
    expect(mergedForDrawing(b).bindings[0]!.key).toContain("user.#");
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
