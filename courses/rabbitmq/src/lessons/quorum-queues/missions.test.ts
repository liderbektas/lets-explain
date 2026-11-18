import { describe, expect, it } from "vitest";
import { apply, depth, queueAvailable, simulate, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { shownLeader } from "./NodesPanel";
import { scene, START, steps } from "./Scene";

const jobs = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: "jobs", body: `j${n}`, persistent: true });
const cache = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: "cache", body: `c${n}`, persistent: true });
const down = (node: string): BrokerAction => ({ type: "nodeDown", node });
const up = (node: string): BrokerAction => ({ type: "nodeUp", node });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, BrokerAction[]> = {
  "leader-moves": [down("rabbit@1"), jobs(1)],
  "one-survives": [down("rabbit@1"), jobs(1), cache(2)],
  "no-majority": [down("rabbit@2"), down("rabbit@3"), jobs(1), up("rabbit@3"), jobs(2)],
};

describe("quorum-queues", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: the classic queue goes down with its node, the quorum queue moves on until it loses its majority", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(START.queues.orders!.members).toEqual(["rabbit@1", "rabbit@2", "rabbit@3"]);
    expect(START.queues.orders!.args.deliveryLimit).toBe(20);
    expect(depth(at(1), "cache").ready).toBe(2);
    expect(depth(at(1), "orders").ready).toBe(2);

    expect(queueAvailable(at(2), at(2).queues.cache!)).toBe(false);
    expect(at(2).queues.orders!.node).toBe("rabbit@2");

    // c3 is lost: its queue's only node is down. o3 is safe on the quorum queue.
    expect(at(3).lost).toEqual([{ id: "m5", reason: "queue-down" }]);
    expect(depth(at(3), "orders").ready).toBe(3);

    // One node of three left: no majority, so o4 is refused (nacked), not stored.
    const refused = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat().find((e) => e.type === "confirmed");
    expect(refused).toMatchObject({ ok: false, reason: "no quorum" });
    expect(depth(at(4), "orders").ready).toBe(3);

    // Back up: the classic queue's earlier messages come back with its node.
    expect(depth(at(5), "cache").ready).toBe(2);
    expect(at(6).consumers["cache-1"]!.done).toHaveLength(2);
    expect(at(6).consumers["orders-1"]!.done).toHaveLength(3);
  });

  it("quorum queues must be durable", () => {
    const r = apply(START, { type: "declareQueue", name: "x", queueType: "quorum", durable: false });
    expect(r.events[0]).toMatchObject({ type: "error" });
  });

  // The model keeps a down leader's name when a majority returns without it, instead of
  // electing a new leader. The view works around it with shownLeader().
  it("the model elects a new leader when a majority returns without the old one", () => {
    const r = simulate([down("rabbit@1"), down("rabbit@2"), up("rabbit@1")], START);
    // rabbit@2 is still down, but rabbit@1 and rabbit@3 form a majority.
    expect(r.states.at(-1)!.queues.orders!.node).not.toBe("rabbit@2");
  });

  it("the view shows a live leader in that case", () => {
    const r = simulate([down("rabbit@1"), down("rabbit@2"), up("rabbit@1")], START);
    const end = r.states.at(-1)!;
    expect(end.queues.orders!.node).toBe("rabbit@1");
    expect(shownLeader(end, "orders")).toBe("rabbit@1");
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
