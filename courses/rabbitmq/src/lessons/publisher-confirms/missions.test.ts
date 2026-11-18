import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { lastAnswer, scene, steps } from "./Scene";

const pub = (routingKey: string, body: string, mandatory = false): BrokerAction => ({ type: "publish", exchange: "orders", routingKey, body, mandatory, persistent: true });

const solutions: Record<string, BrokerAction[]> = {
  "get-nack": [pub("limited", "m1"), pub("limited", "m2"), pub("limited", "m3")],
  "silent-then-back": [pub("refund", "m1"), pub("refund", "m2", true)],
  "all-acked": [pub("limited", "m1"), pub("limited", "m2"), { type: "purge", queue: "limited" }, pub("limited", "m3")],
};

describe("publisher-confirms", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: ack for routed and unroutable, nack for a full queue and for no quorum, duplicates on resend", () => {
    const last = (step: number) => scene.run.events[scene.stepEnd(step) - 1]!;
    expect(lastAnswer(last(1))).toBe("ack");
    // Unroutable without mandatory: dropped, and still acked.
    expect(last(2).some((e) => e.type === "unroutable" && !e.returned)).toBe(true);
    expect(lastAnswer(last(2))).toBe("ack");
    expect(last(3).some((e) => e.type === "unroutable" && e.returned)).toBe(true);
    // The third message into a full reject-publish queue is nacked.
    expect(lastAnswer(last(4))).toBe("nack");
    // No majority on the quorum queue: nacked too.
    expect(last(5).find((e) => e.type === "confirmed")).toMatchObject({ ok: false, reason: "no quorum" });
    // The resent order lands twice.
    const end = scene.run.states[scene.stepEnd(6)]!;
    expect(end.queues.billing!.ready.filter((m) => m.body === "o2")).toHaveLength(2);
    expect(depth(end, "payments").ready).toBe(1);
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
