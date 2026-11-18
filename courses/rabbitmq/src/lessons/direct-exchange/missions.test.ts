import { describe, expect, it } from "vitest";
import { depth, route, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, START, steps } from "./Scene";

const bind = (queue: string, key: string): BrokerAction => ({ type: "bind", exchange: "tasks", queue, key });
const pub = (key: string, n: number): BrokerAction => ({ type: "publish", exchange: "tasks", routingKey: key, body: `${key[0]}${n}` });

const solutions: Record<string, BrokerAction[]> = {
  "right-door": [bind("images", "image"), bind("emails", "email"), pub("image", 1), pub("email", 2)],
  video: [bind("images", "video"), pub("video", 1)],
  "nothing-lost": [bind("images", "image"), bind("emails", "email"), bind("images", "video"), pub("image", 1), pub("email", 2), pub("video", 3)],
};

describe("direct-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: one key to two queues, one queue on three keys, unmatched and case-different keys dropped", () => {
    expect(route(START, "logs", "error").sort()).toEqual(["all-logs", "errors"]);
    expect(route(START, "logs", "info")).toEqual(["all-logs"]);
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "errors").ready).toBe(1);
    expect(depth(at(1), "all-logs").ready).toBe(1);
    expect(depth(at(2), "errors").ready).toBe(1);
    expect(at(3).lost.map((x) => x.reason)).toEqual(["unroutable"]);
    expect(depth(at(4), "errors").ready).toBe(2);
    // Two queues, two consumers: each gets its own copy of e2.
    const e2 = scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat().filter((e) => e.type === "delivered" && e.id === "m5");
    expect(e2.map((e) => (e.type === "delivered" ? e.tag : "")).sort()).toEqual(["alerts", "archive"]);
    // Routing keys are case-sensitive: "ERROR" matches nothing.
    expect(at(6).lost).toHaveLength(2);
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

describe("mergeBindings (drawing workaround)", () => {
  it("folds several keys between one exchange and queue into one label", async () => {
    const { mergeBindings } = await import("./mergeBindings");
    const m = mergeBindings(START);
    expect(m.bindings.find((b) => b.queue === "all-logs")!.key).toBe("info · warning · error");
    expect(m.bindings).toHaveLength(2);
  });
});
