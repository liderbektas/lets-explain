import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const BOTH = { format: "pdf", region: "eu" };
const doc = (format: string, region: string, body: string): BrokerAction => ({ type: "publish", exchange: "docs", routingKey: "", body, headers: { format, region } });
const bindAll: BrokerAction = { type: "bind", exchange: "docs", queue: "pdf-eu", headers: BOTH, match: "all" };
const bindAny: BrokerAction = { type: "bind", exchange: "docs", queue: "pdf-eu", headers: BOTH, match: "any" };
const alternate: BrokerAction = { type: "declareExchange", name: "docs", kind: "headers", alternate: "unrouted" };

const solutions: Record<string, BrokerAction[]> = {
  "nothing-lost": [alternate, doc("csv", "us", "cu")],
  "both-required": [bindAll, doc("pdf", "eu", "pe"), doc("pdf", "us", "pu")],
  either: [bindAny, doc("pdf", "us", "pu"), doc("csv", "eu", "ce")],
};

describe("headers-and-alternate", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: all vs any, a lost message, the alternate catching it, mandatory returning", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(depth(at(1), "pdf-eu").ready).toBe(1);
    expect(depth(at(1), "pdf-or-eu").ready).toBe(1);
    expect(depth(at(2), "pdf-eu").ready).toBe(1);
    expect(depth(at(2), "pdf-or-eu").ready).toBe(2);
    expect(at(3).lost).toEqual([{ id: "m3", reason: "unroutable" }]);
    expect(depth(at(4), "unrouted").ready).toBe(1);
    expect(at(4).lost).toHaveLength(1);
    const unroutable = evs(5).filter((e) => e.type === "unroutable");
    expect(unroutable.map((e) => e.type === "unroutable" && e.returned)).toEqual([false, true]);
    // The returned one is not counted as lost: the producer got it back.
    expect(at(5).lost).toHaveLength(2);
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
