import { describe, expect, it } from "vitest";
import { createBroker, deliveryCounts, depth, route, simulate, topicMatches, type BrokerAction, type BrokerEvent } from "./broker";

const run = (actions: BrokerAction[], start = createBroker()) => {
  const r = simulate(actions, start);
  const errors = r.events.flat().filter((e) => e.type === "error");
  return { s: r.states[r.states.length - 1]!, events: r.events.flat(), errors };
};
const ok = (actions: BrokerAction[], start = createBroker()) => {
  const r = run(actions, start);
  expect(r.errors).toEqual([]);
  return r;
};
const pub = (exchange: string, routingKey: string, body = "x", extra: Partial<Extract<BrokerAction, { type: "publish" }>> = {}): BrokerAction => ({ type: "publish", exchange, routingKey, body, ...extra });
const q = (name: string, extra: Partial<Extract<BrokerAction, { type: "declareQueue" }>> = {}): BrokerAction => ({ type: "declareQueue", name, ...extra });
const of = <T extends BrokerEvent["type"]>(events: BrokerEvent[], type: T) => events.filter((e): e is Extract<BrokerEvent, { type: T }> => e.type === type);

describe("topic matching (examples from the RabbitMQ tutorial)", () => {
  it.each([
    ["*.orange.*", "quick.orange.rabbit", true],
    ["*.*.rabbit", "quick.orange.rabbit", true],
    ["*.orange.*", "lazy.orange.elephant", true],
    ["lazy.#", "lazy.orange.elephant", true],
    ["*.orange.*", "quick.brown.fox", false],
    ["lazy.#", "lazy.brown.fox", true],
    ["*.*.rabbit", "lazy.pink.rabbit", true],
    ["*.orange.*", "orange", false],
    ["*.orange.*", "quick.orange.new.rabbit", false],
    ["lazy.#", "lazy", true],
    ["#", "", true],
    ["#.rabbit", "rabbit", true],
  ])("%s ~ %s → %s", (pattern, key, want) => {
    expect(topicMatches(pattern, key)).toBe(want);
  });
});

describe("routing", () => {
  it("the default exchange routes by queue name", () => {
    const { s } = ok([q("orders"), pub("", "orders"), pub("", "nope")]);
    expect(depth(s, "orders").ready).toBe(1);
    expect(s.lost).toEqual([{ id: "m2", reason: "unroutable" }]);
  });

  it("direct, fanout and topic exchanges", () => {
    const { s } = ok([
      { type: "declareExchange", name: "logs", kind: "fanout" },
      { type: "declareExchange", name: "events", kind: "topic" },
      q("a"),
      q("b"),
      { type: "bind", exchange: "logs", queue: "a" },
      { type: "bind", exchange: "logs", queue: "b" },
      { type: "bind", exchange: "events", queue: "a", key: "order.*" },
      { type: "bind", exchange: "events", queue: "b", key: "#.eu" },
    ]);
    expect(route(s, "logs", "whatever").sort()).toEqual(["a", "b"]);
    expect(route(s, "events", "order.created")).toEqual(["a"]);
    expect(route(s, "events", "order.created.eu").sort()).toEqual(["b"]);
    expect(route(s, "events", "user.eu")).toEqual(["b"]);
  });

  it("headers exchange with all and any", () => {
    const { s } = ok([
      { type: "declareExchange", name: "h", kind: "headers" },
      q("pdf-eu"),
      q("any"),
      { type: "bind", exchange: "h", queue: "pdf-eu", headers: { format: "pdf", region: "eu" }, match: "all" },
      { type: "bind", exchange: "h", queue: "any", headers: { format: "pdf", region: "eu" }, match: "any" },
    ]);
    expect(route(s, "h", "", { format: "pdf", region: "eu" }).sort()).toEqual(["any", "pdf-eu"]);
    expect(route(s, "h", "", { format: "pdf", region: "us" })).toEqual(["any"]);
  });

  it("an alternate exchange catches unroutable messages; mandatory returns them", () => {
    const r = ok([
      { type: "declareExchange", name: "unrouted", kind: "fanout" },
      { type: "declareExchange", name: "orders", kind: "direct", alternate: "unrouted" },
      q("catch-all"),
      { type: "bind", exchange: "unrouted", queue: "catch-all" },
      pub("orders", "nobody"),
      { type: "declareExchange", name: "plain", kind: "direct" },
      pub("plain", "nobody", "y", { mandatory: true }),
    ]);
    expect(depth(r.s, "catch-all").ready).toBe(1);
    expect(of(r.events, "unroutable").at(-1)).toMatchObject({ returned: true });
  });

  it("publish events carry the message as published, even when it never reaches a queue", () => {
    const r = ok([q("jobs"), pub("", "jobs", "a"), { type: "declareExchange", name: "plain", kind: "direct" }, pub("plain", "nobody", "b")]);
    expect(of(r.events, "routed")[0]!.message).toMatchObject({ id: "m1", body: "a", routingKey: "jobs" });
    expect(of(r.events, "unroutable")[0]!.message).toMatchObject({ id: "m2", body: "b", exchange: "plain" });
  });
});

describe("consumers and acks", () => {
  it("round-robins between consumers and requeues what a crashed one held", () => {
    const r = ok([
      q("work"),
      { type: "consume", tag: "w1", queue: "work", prefetch: 1 },
      { type: "consume", tag: "w2", queue: "work", prefetch: 1 },
      pub("", "work", "a"),
      pub("", "work", "b"),
      pub("", "work", "c"),
    ]);
    expect(r.s.consumers.w1!.unacked.map((m) => m.id)).toEqual(["m1"]);
    expect(r.s.consumers.w2!.unacked.map((m) => m.id)).toEqual(["m2"]);
    expect(depth(r.s, "work").ready).toBe(1);
    const after = ok([{ type: "crashConsumer", tag: "w1" }], r.s);
    // m1 comes back first and goes to w2's free slot once it acks.
    expect(after.s.queues.work!.ready.map((m) => m.id)).toEqual(["m1", "m3"]);
    const done = ok([{ type: "ack", tag: "w2" }], after.s);
    expect(done.s.consumers.w2!.unacked[0]).toMatchObject({ id: "m1", redelivered: true });
  });

  it("prefetch makes a slow consumer take less", () => {
    const actions: BrokerAction[] = [
      q("work"),
      { type: "consume", tag: "fast", queue: "work", prefetch: 1, speed: 1 },
      { type: "consume", tag: "slow", queue: "work", prefetch: 1, speed: 0 },
    ];
    for (let i = 0; i < 6; i++) actions.push(pub("", "work", `j${i}`));
    actions.push({ type: "tick", count: 5 });
    const { s } = ok(actions);
    expect(s.consumers.slow!.unacked).toHaveLength(1);
    expect(s.consumers.fast!.done.length).toBe(5);
  });

  it("auto-ack loses what a crashed consumer had not processed", () => {
    const r = ok([q("work"), { type: "consume", tag: "w", queue: "work", autoAck: true, speed: 1 }, pub("", "work"), pub("", "work"), pub("", "work"), { type: "tick" }, { type: "crashConsumer", tag: "w" }]);
    expect(r.s.consumers.w).toBeUndefined();
    expect(r.s.lost.filter((l) => l.reason === "auto-ack-crash")).toHaveLength(2);
    expect(depth(r.s, "work").total).toBe(0);
  });

  it("nack without requeue dead-letters; with requeue it comes back redelivered", () => {
    const r = ok([
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      q("dead"),
      { type: "bind", exchange: "dlx", queue: "dead" },
      q("work", { args: { dlx: "dlx" } }),
      { type: "consume", tag: "w", queue: "work", prefetch: 1 },
      pub("", "work", "a"),
      { type: "nack", tag: "w", requeue: true },
      { type: "nack", tag: "w", requeue: false },
    ]);
    expect(deliveryCounts(r.s).get("m1")).toBe(2);
    expect(r.s.queues.dead!.ready[0]!.deaths).toEqual([{ reason: "rejected", queue: "work", count: 1 }]);
  });
});

describe("dead letters, TTL and limits", () => {
  it("messages expire at the head and go to the DLX", () => {
    const r = ok([
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      q("dead"),
      { type: "bind", exchange: "dlx", queue: "dead" },
      q("wait", { args: { ttl: 3, dlx: "dlx" } }),
      pub("", "wait"),
      { type: "tick", count: 2 },
    ]);
    expect(depth(r.s, "wait").ready).toBe(1);
    const later = ok([{ type: "tick" }], r.s);
    expect(depth(later.s, "dead").ready).toBe(1);
    expect(later.s.queues.dead!.ready[0]!.deaths[0]!.reason).toBe("expired");
  });

  it("max-length drops the oldest, or rejects the new one", () => {
    const head = ok([q("box", { args: { maxLength: 2 } }), pub("", "box", "1"), pub("", "box", "2"), pub("", "box", "3")]);
    expect(head.s.queues.box!.ready.map((m) => m.body)).toEqual(["2", "3"]);
    const reject = ok([q("box", { args: { maxLength: 2, overflow: "reject-publish" } }), pub("", "box", "1"), pub("", "box", "2"), pub("", "box", "3")]);
    expect(reject.s.queues.box!.ready.map((m) => m.body)).toEqual(["1", "2"]);
    expect(of(reject.events, "confirmed").at(-1)).toMatchObject({ ok: false });
  });

  it("quorum queues dead-letter a poison message after the delivery limit", () => {
    const actions: BrokerAction[] = [
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      q("parking"),
      { type: "bind", exchange: "dlx", queue: "parking" },
      q("work", { queueType: "quorum", args: { deliveryLimit: 2, dlx: "dlx" } }),
      { type: "consume", tag: "w", queue: "work", prefetch: 1 },
      pub("", "work", "poison"),
    ];
    for (let i = 0; i < 3; i++) actions.push({ type: "nack", tag: "w", requeue: true });
    const { s } = ok(actions);
    expect(depth(s, "work").total).toBe(0);
    expect(s.queues.parking!.ready[0]!.deaths[0]!.reason).toBe("delivery_limit");
  });

  it("quorum queues default to a delivery limit of 20", () => {
    const { s } = ok([q("qq", { queueType: "quorum" })]);
    expect(s.queues.qq!.args.deliveryLimit).toBe(20);
  });
});

describe("durability and nodes", () => {
  it("a restart keeps persistent messages in durable queues only", () => {
    const r = ok([
      q("durable"),
      q("temp", { durable: false }),
      pub("", "durable", "keep", { persistent: true }),
      pub("", "durable", "lose"),
      pub("", "temp", "gone", { persistent: true }),
      { type: "restart" },
    ]);
    expect(r.s.queues.durable!.ready.map((m) => m.body)).toEqual(["keep"]);
    expect(r.s.queues.temp).toBeUndefined();
  });

  it("a quorum queue survives one node going down; a classic queue on it does not", () => {
    const start = createBroker({ nodes: 3 });
    const r = ok([
      q("qq", { queueType: "quorum" }),
      q("cq", { node: "rabbit@1" }),
      { type: "nodeDown", node: "rabbit@1" },
      pub("", "qq", "safe"),
      pub("", "cq", "lost"),
    ], start);
    expect(r.s.queues.qq!.node).toBe("rabbit@2");
    expect(depth(r.s, "qq").ready).toBe(1);
    expect(r.s.lost).toEqual([{ id: "m2", reason: "queue-down" }]);
    const two = ok([{ type: "nodeDown", node: "rabbit@2" }, pub("", "qq", "no")], r.s);
    expect(of(two.events, "confirmed").at(-1)).toMatchObject({ ok: false, reason: "no quorum" });
  });

  it("streams keep messages and let a consumer start from the first offset", () => {
    const r = ok([
      q("s", { queueType: "stream" }),
      pub("", "s", "a"),
      pub("", "s", "b"),
      { type: "consume", tag: "late", queue: "s", prefetch: 10, offset: "first" },
      { type: "ack", tag: "late", multiple: true },
      { type: "consume", tag: "new", queue: "s", prefetch: 10, offset: "next" },
      pub("", "s", "c"),
    ]);
    expect(r.s.queues.s!.log).toHaveLength(3);
    expect(r.s.consumers.late!.done).toEqual(["m1", "m2"]);
    expect(r.s.consumers.new!.unacked.map((m) => m.id)).toEqual(["m3"]);
  });
});
