import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { QUEUE, scene, steps } from "./Scene";

const order = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body: `o${n}` });
const join = (tag: string): BrokerAction => ({ type: "consume", tag, queue: QUEUE, prefetch: 1, speed: 1 });
const tick: BrokerAction = { type: "tick" };

const solutions: Record<string, BrokerAction[]> = {
  "no-loss": [order(1), order(2), join("w1"), tick, tick],
  fast: [join("w1"), join("w2"), order(1), order(2), tick],
  backlog: [join("w1"), order(1), order(2), order(3), order(4)],
};

describe("why-rabbitmq", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: orders wait while email is down, a spike builds a backlog, a second worker halves it", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 3: three orders wait with nobody listening.
    expect(depth(at(2), QUEUE).ready).toBe(3);
    // Step 4: one worker sends them, one per second.
    expect(at(3).consumers["mailer-1"]!.done).toHaveLength(3);
    // Step 5: six orders at once, two seconds later three still wait.
    expect(depth(at(4), QUEUE)).toMatchObject({ ready: 3, unacked: 1 });
    // Step 6: with two workers, two more seconds clear everything.
    expect(depth(at(5), QUEUE).total).toBe(0);
    expect(at(5).lost).toEqual([]);
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
