import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { LIMIT, OLD, PARKING, QQ, scene, steps } from "./Scene";

const bad = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QQ, body: `bad${n}` });
const good = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QQ, body: `ok${n}` });
const nack = (requeue: boolean): BrokerAction => ({ type: "nack", tag: "w", requeue });

const solutions: Record<string, BrokerAction[]> = {
  limit: [bad(1), nack(true), nack(true), nack(true)],
  straight: [bad(1), nack(false)],
  sort: [bad(1), nack(false), good(2), { type: "ack", tag: "w" }],
};

describe("poison-messages", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: on a classic queue the bad message just keeps coming back: 4 deliveries so far.
    expect(at(1).deliveries.filter((d) => d.id === "m1")).toHaveLength(4);
    expect(at(1).consumers.w1!.unacked[0]!.redelivered).toBe(true);
    // Step 2: rejected with no DLX, it is simply gone.
    expect(at(2).lost).toEqual([{ id: "m1", reason: "rejected" }]);
    expect(depth(at(2), OLD).total).toBe(0);
    // Step 3: a quorum queue with a delivery limit and a DLX into parking.
    expect(at(3).queues[QQ]!.args.deliveryLimit).toBe(LIMIT);
    // Step 4: after LIMIT + 1 failed deliveries it lands in parking.
    const parked = at(4).queues[PARKING]!.ready;
    expect(parked.map((m) => m.body)).toEqual(["bad"]);
    expect(parked[0]!.deaths[0]!.reason).toBe("delivery_limit");
    expect(at(4).deliveries.filter((d) => d.id === "m2")).toHaveLength(LIMIT + 1);
    // Step 5: a good message goes through.
    expect(at(5).consumers.w2!.done).toContain("m3");
    // Step 6: the delayed message expired out of retry and came back into orders.
    expect(at(6).consumers.w2!.unacked.map((m) => m.body)).toEqual(["late"]);
    expect(at(6).consumers.w2!.unacked[0]!.deaths[0]!.reason).toBe("expired");
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
