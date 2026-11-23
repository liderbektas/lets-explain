import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

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
const QUORUM = 'await ch.assertQueue("payments", { arguments: { "x-queue-type": "quorum" } });';
const ORDERS = 'await ch.assertQueue("orders");';
const POLICY = `rabbitmqctl set_policy max-orders "^orders$" '{"max-length":2}' --apply-to queues`;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "queue-vanished": {
    typed: ["nano setup.js", "rabbitmqctl delete_queue orders", "node setup.js", "node order.js", "docker restart rabbitmq"],
    edits: [swap("{ durable: false }", "{ durable: true }")],
  },
  "empty-after-restart": {
    typed: ["nano order.js", "node order.js", "docker restart rabbitmq"],
    edits: [swap('Buffer.from("order-1002"));', 'Buffer.from("order-1002"), { persistent: true });')],
  },
  "quorum-payments": { typed: ["nano setup.js", "node setup.js", "node pay.js", "docker restart rabbitmq"], edits: [addLine(ORDERS, QUORUM)] },
  "cap-by-policy": { typed: [POLICY, "node burst.js"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  // A restart deletes the transient queue too, which also clears the way.
  "queue-vanished": [
    {
      typed: ["rabbitmqctl list_queues name durable", "docker restart rabbitmq", "nano setup.js", "node setup.js", "node order.js", "docker restart rabbitmq"],
      edits: [swap("{ durable: false }", "{ durable: true }")],
    },
    // Dropping the option works too: amqplib declares queues durable by default.
    { typed: ["nano setup.js", "rabbitmqctl delete_queue orders", "node setup.js", "node order.js", "docker restart rabbitmq"], edits: [swap(", { durable: false }", "")] },
  ],
  "empty-after-restart": [
    {
      typed: ["nano order.js", "node order.js", "docker exec rabbitmq rabbitmqctl list_queues name messages", "docker restart rabbitmq"],
      edits: [swap('Buffer.from("order-1002"));', 'Buffer.from("order-1002"), { deliveryMode: 2 });')],
    },
  ],
  "cap-by-policy": [{ typed: [`docker exec rabbitmq rabbitmqctl set_policy --apply-to queues --priority 1 cap "^orders" '{"max-length":2,"overflow":"drop-head"}'`, "node burst.js"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Changing durable in the code and running it again: RabbitMQ refuses the redeclare (406).
  "queue-vanished": {
    typed: ["nano setup.js", "node setup.js", "node order.js", "docker restart rabbitmq"],
    edits: [swap("{ durable: false }", "{ durable: true }")],
  },
  // A durable queue alone does not keep a transient message.
  "empty-after-restart": { typed: ["node order.js", "docker restart rabbitmq"] },
  // A classic durable queue loses pay.js's transient message.
  "quorum-payments": { typed: ["nano setup.js", "node setup.js", "node pay.js", "docker restart rabbitmq"], edits: [addLine(ORDERS, 'await ch.assertQueue("payments");')] },
  // Setting the cap in the code fails: the live queue was declared without it (406).
  "cap-by-policy": {
    typed: ["nano setup.js", "node setup.js", "node burst.js"],
    edits: [swap(ORDERS, 'await ch.assertQueue("orders", { maxLength: 2 });')],
  },
};

describe("durability", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: only persistent messages in durable queues survive; quorum keeps everything", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // First restart: a transient message in a durable queue and a transient queue are both lost.
    expect(at(2).queues.orders!.ready).toHaveLength(0);
    expect(at(2).queues.temp).toBeUndefined();
    // Second restart: only p1 (persistent, durable queue) is left.
    expect(at(4).queues.orders!.ready.map((m) => m.body)).toEqual(["p1"]);
    expect(at(4).queues.temp).toBeUndefined();
    // A quorum queue keeps even a transient message.
    expect(at(6).queues.payments!.ready.map((m) => m.body)).toEqual(["q1"]);
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

  it("redeclaring with another durable setting fails like RabbitMQ", () => {
    const s = scenarios.find((x) => x.id === "queue-vanished")!;
    const r = typeInto(s.start, ["nano setup.js", "node setup.js"], [swap("{ durable: false }", "{ durable: true }")]);
    expect(r.output).toContain(
      `Error: Operation failed: QueueDeclare; 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'orders' in vhost '/': received 'true' but current is 'false'"`,
    );
  });
});
