import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { FAST_SPEED, QUEUE, scene, steps } from "./Scene";

const send = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body: `j${n}` });
const tick: BrokerAction = { type: "tick" };

const solutions: Record<string, BrokerAction[]> = {
  hoard: [send(1), send(2), send(3), send(4)],
  fair: [{ type: "cancel", tag: "slow" }, { type: "consume", tag: "slow", queue: QUEUE, prefetch: 1, speed: 0 }, send(1), send(2), send(3), tick],
  rescue: [send(1), send(2), send(3), send(4), { type: "cancel", tag: "slow" }, tick],
};

describe("prefetch", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: no limit, so the 8 jobs split 4 and 4, speed ignored.
    expect(at(1).consumers.fast!.unacked).toHaveLength(4);
    expect(at(1).consumers.slow!.unacked).toHaveLength(4);
    // Step 2: the fast one is done and idle, the slow one still sits on 4.
    expect(at(2).consumers.fast!.done).toHaveLength(4);
    expect(at(2).consumers.fast!.unacked).toHaveLength(0);
    expect(at(2).consumers.slow!.unacked).toHaveLength(4);
    // Step 3: both reconnect with prefetch 1 and take one each; the slow one's jobs came back.
    expect(at(3).consumers.slow!.unacked).toHaveLength(1);
    expect(depth(at(3), QUEUE).ready).toBe(2);
    // Step 5: four ticks later the fast one did 4 more, one a tick; the slow one still holds only 1.
    expect(at(5).consumers.fast!.done).toHaveLength(4);
    expect(at(5).consumers.slow!.unacked).toHaveLength(1);
    expect(depth(at(5), QUEUE).ready).toBe(2);
    // Step 6: with prefetch 3 the fast one finishes FAST_SPEED a tick.
    expect(at(6).consumers.fast!.done).toHaveLength(2 * FAST_SPEED);
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
