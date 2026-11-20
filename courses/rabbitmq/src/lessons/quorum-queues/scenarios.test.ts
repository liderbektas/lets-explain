import { describe, expect, it } from "vitest";
import { apply, depth, queueAvailable, simulate, type BrokerAction } from "../../engine/broker";
import { shownLeader } from "./NodesPanel";
import { scene, START, steps } from "./Scene";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

const swap = (from: string, to: string): Edit => (t) => {
  if (!t.includes(from)) throw new Error(`the file has no ${from}`);
  return t.replace(from, to);
};
const addLine = (after: string, line: string): Edit => (t) => {
  if (!t.includes(after)) throw new Error(`the file has no ${after}`);
  return t.replace(after, `${after}\n${line}`);
};
void swap;
void addLine;
const down = (node: string): BrokerAction => ({ type: "nodeDown", node });
const up = (node: string): BrokerAction => ({ type: "nodeUp", node });
void apply;
const QUORUM = 'ch.queue_declare(queue="payments", durable=True, arguments={"x-queue-type": "quorum"})';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "patch-the-leader": { typed: ["docker stop rabbit1", "python order.py"] },
  "check-first": { typed: ["docker start rabbit3", "docker restart rabbit2"] },
  "classic-by-mistake": {
    typed: ["nano setup.py", "rabbitmqctl delete_queue payments", "python setup.py", "docker stop rabbit1", "python pay.py"],
    edits: [swap('ch.queue_declare(queue="payments", durable=True)', QUORUM)],
  },
  "move-the-leader": { typed: ["docker restart rabbit1"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "patch-the-leader": [{ typed: ["docker exec rabbit2 rabbitmq-queues quorum_status orders", "docker stop rabbit1", "docker exec rabbit2 rabbitmq-queues quorum_status orders", "python order.py"] }],
  "check-first": [
    { typed: ["docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical", "docker start rabbit3", "docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical", "docker stop rabbit2", "docker start rabbit2"] },
  ],
  "move-the-leader": [{ typed: ["docker stop rabbit1", "docker exec rabbit2 rabbitmqctl list_queues name leader", "docker start rabbit1"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Sending before the stop proves nothing about the maintenance.
  "patch-the-leader": { typed: ["python order.py", "docker stop rabbit1"] },
  // Restarting rabbit2 while rabbit3 is still down leaves orders without a majority for a moment.
  "check-first": { typed: ["docker restart rabbit2", "docker start rabbit3"] },
  // Doing the maintenance first: the payment is acked and lost with the node.
  "classic-by-mistake": { typed: ["docker stop rabbit1", "python pay.py"] },
  // Stopping the node moves the leader but leaves the cluster short a node.
  "move-the-leader": { typed: ["docker stop rabbit1"] },
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

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const p = solutions[s.id]!;
      const r = typeInto(s.start, p.typed, [...(p.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.typed, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }

});
