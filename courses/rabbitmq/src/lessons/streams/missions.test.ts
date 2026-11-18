import { describe, expect, it } from "vitest";
import type { BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const read = (tag: string, offset: "first" | "next"): BrokerAction => ({ type: "consume", tag, queue: "events", prefetch: 10, offset });
const ackAll = (tag: string): BrokerAction => ({ type: "ack", tag, multiple: true });
const send = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: "events", body: `e${n}`, persistent: true });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, BrokerAction[]> = {
  "from-start": [read("a", "first"), ackAll("a")],
  "both-see": [read("a", "next"), read("b", "next"), send(4)],
  replay: [read("a", "first"), ackAll("a"), { type: "cancel", tag: "a" }, read("a", "first")],
};

describe("streams", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: reading keeps the log, offsets decide what each reader gets", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(1).queues.events!.log).toHaveLength(3);
    // Analytics read and acked all three; the log still holds them.
    expect(at(2).consumers.analytics!.done).toEqual(["m1", "m2", "m3"]);
    expect(at(2).queues.events!.log).toHaveLength(3);
    // Billing, starting from "first", gets the same three.
    expect(at(3).consumers.billing!.unacked.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    // Audit, starting from "next", gets only what came after it joined.
    expect(at(4).consumers.audit!.unacked.map((m) => m.id)).toEqual(["m4"]);
    expect(at(4).consumers.billing!.unacked.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
    // Offset 1 replays from the second event.
    expect(at(5).consumers.replay!.unacked.map((m) => m.body)).toEqual(["e2", "e3", "e4"]);
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
