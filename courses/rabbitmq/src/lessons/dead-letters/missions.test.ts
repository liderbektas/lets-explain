import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const send = (body: string, ttl?: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: "work", body, persistent: true, ttl });
const tick: BrokerAction = { type: "tick" };

const solutions: Record<string, BrokerAction[]> = {
  rejected: [send("m1"), { type: "nack", tag: "worker", requeue: false }],
  expired: [send("m1"), send("m2", 2), tick, tick],
  overflow: [send("m1"), send("m2"), send("m3"), send("m4")],
};

describe("dead-letters", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: rejected, expired and maxlen land in dead with x-death; reject-publish leaves no trace; retry comes back", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(1).queues.dead!.ready.map((m) => m.deaths[0]!.reason)).toEqual(["rejected"]);
    expect(at(2).queues.dead!.ready.map((m) => `${m.body}:${m.deaths[0]!.reason}@${m.deaths[0]!.queue}`)).toEqual(["a1:rejected@work", "b1:expired@waiting"]);
    // drop-head: the oldest (c1) goes, c2 and c3 stay.
    expect(at(4).queues.box!.ready.map((m) => m.body)).toEqual(["c2", "c3"]);
    expect(at(4).queues.dead!.ready.at(-1)).toMatchObject({ body: "c1" });
    expect(at(4).queues.dead!.ready.at(-1)!.deaths[0]!.reason).toBe("maxlen");
    // reject-publish: d2 never entered, so nothing new in dead and the message is simply lost.
    expect(depth(at(5), "dead").ready).toBe(depth(at(4), "dead").ready);
    expect(at(5).lost.map((x) => x.reason)).toContain("maxlen");
    // dlxKey routes through a direct exchange.
    expect(at(6).queues.errors!.ready.map((m) => m.body)).toEqual(["e1"]);
    // Retry: rejected from jobs, waited in jobs.retry, then expired back into jobs.
    const back = at(7).consumers["job-worker"]!.unacked[0]!;
    expect(back.body).toBe("f1");
    expect(back.deaths.map((d) => `${d.reason}@${d.queue}`)).toEqual(["expired@jobs.retry", "rejected@jobs"]);
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
