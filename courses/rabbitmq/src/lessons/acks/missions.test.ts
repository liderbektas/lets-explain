import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { DEAD, QUEUE, scene, steps } from "./Scene";

const send = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body: `t${n}` });
const manual: BrokerAction = { type: "consume", tag: "w", queue: QUEUE, prefetch: 0 };
const auto: BrokerAction = { type: "consume", tag: "w", queue: QUEUE, autoAck: true, speed: 1 };

const solutions: Record<string, BrokerAction[]> = {
  "lose-one": [auto, send(1), { type: "crashConsumer", tag: "w" }],
  park: [manual, send(1), { type: "nack", tag: "w", requeue: false }],
  "second-chance": [manual, send(1), { type: "nack", tag: "w", requeue: true }, { type: "ack", tag: "w" }],
};

describe("acks", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: the auto-ack worker took all three at once; the broker holds nothing.
    expect(depth(at(1), QUEUE)).toMatchObject({ ready: 0, unacked: 0 });
    expect(at(1).consumers.auto!.done).toEqual(["m1"]);
    // Step 2: its crash loses the two it had not processed.
    expect(at(2).lost.map((x) => x.reason)).toEqual(["auto-ack-crash", "auto-ack-crash"]);
    // Step 3: the manual worker acked one and holds two.
    expect(depth(at(3), QUEUE).unacked).toBe(2);
    // Step 4: nack + requeue brings b2 straight back, marked redelivered.
    expect(at(4).consumers.manual!.unacked.map((m) => [m.body, m.redelivered])).toEqual([
      ["b3", false],
      ["b2", true],
    ]);
    // Step 5: reject without requeue sends b3 to the dead letter queue.
    expect(at(5).queues[DEAD]!.ready.map((m) => m.body)).toEqual(["b3"]);
    // Step 6: one ack with multiple clears everything.
    expect(depth(at(6), QUEUE).total).toBe(0);
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
