import { describe, expect, it } from "vitest";
import { apply, createBroker, simulate, type Broker, type BrokerAction } from "../engine/broker";
import { choreograph, HOP, hKey, LEG, qKey, type Places } from "./choreography";

/** Simple positions: producers at x 0, exchanges at x 100, queue slots at x 200 - i, hands at x 300. */
function places(b: Broker): Places {
  const queues = Object.keys(b.queues);
  const consumers = Object.keys(b.consumers).sort();
  const exchanges = Object.keys(b.exchanges).filter((n) => n && !n.startsWith("amq."));
  return {
    queues,
    consumers,
    producer: (exchange) => (exchange === "nobody" ? null : [0, 0]),
    exchange: (name) => (exchanges.includes(name) ? [100, exchanges.indexOf(name) * 10] : null),
    slot: (q, i) => (queues.includes(q) ? [200 - i, queues.indexOf(q) * 50] : null),
    hand: (tag, k) => (consumers.includes(tag) ? [300, consumers.indexOf(tag) * 50 + k] : null),
    // No roads in these tests: parcels go straight, which keeps the expected points short.
    tail: () => null,
    head: () => null,
  };
}

/** Plays `setup`, then choreographs `action` from the resulting state. */
function play(setup: BrokerAction[], action: BrokerAction, confirms = false) {
  const prev = simulate(setup, createBroker()).states.at(-1)!;
  const r = apply(prev, action);
  return { plan: choreograph({ prev, cur: r.state, last: r.events, before: places(prev), here: places(r.state), confirms }), prev, cur: r.state };
}

const fanout: BrokerAction[] = [
  { type: "declareExchange", name: "orders", kind: "fanout" },
  { type: "declareQueue", name: "email" },
  { type: "declareQueue", name: "sms" },
  { type: "bind", exchange: "orders", queue: "email" },
  { type: "bind", exchange: "orders", queue: "sms" },
];
const pub = (exchange: string, key: string, body: string, extra: Partial<Extract<BrokerAction, { type: "publish" }>> = {}): BrokerAction => ({ type: "publish", exchange, routingKey: key, body, ...extra });

describe("choreography: how messages move on stage", () => {
  it("fanout: one message reaches the exchange, then one copy leaves for each queue", () => {
    const { plan } = play(fanout, pub("orders", "", "o1"));
    const into = plan.ghosts.filter((g) => g.pts[0]![0] === 0);
    const out = plan.ghosts.filter((g) => g.pts[0]![0] === 100);
    expect(into).toHaveLength(1);
    expect(into[0]!.pts.at(-1)).toEqual([100, 0]);
    expect(out.map((g) => g.pts.at(-1))).toEqual([[200, 0], [200, 50]]);
    expect(out.every((g) => g.ts[0] === LEG && g.end === "land")).toBe(true);
    expect(plan.arrive.get(qKey("email", "m1"))).toBe(2 * LEG);
    expect(plan.arrive.get(qKey("sms", "m1"))).toBe(2 * LEG);
  });

  it("a copy lands behind the messages already waiting (FIFO tail)", () => {
    const { plan } = play([...fanout, pub("orders", "", "o1"), pub("orders", "", "o2")], pub("orders", "", "o3"));
    expect(plan.ghosts.find((g) => g.key.includes("to-email"))!.pts.at(-1)).toEqual([198, 0]);
  });

  it("unroutable: dropped at the exchange, or handed back to the producer when mandatory", () => {
    const setup: BrokerAction[] = [{ type: "declareExchange", name: "orders", kind: "direct" }];
    const dropped = play(setup, pub("orders", "refund", "r1")).plan.ghosts;
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.end).toBe("drop");
    expect(dropped[0]!.pts.at(-1)).toEqual([100, 0]);
    const returned = play(setup, pub("orders", "refund", "r2", { mandatory: true })).plan.ghosts;
    expect(returned[0]!.end).toBe("land");
    expect(returned[0]!.pts).toEqual([[0, 0], [100, 0], [0, 0]]);
  });

  it("delivery: the message leaves the head of the queue for the consumer's hand", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, pub("", "jobs", "a"), pub("", "jobs", "b")];
    const { plan } = play(setup, { type: "consume", tag: "w", queue: "jobs", prefetch: 1 });
    const hop = plan.ghosts.find((g) => g.key.includes("to-w"))!;
    expect(hop.pts).toEqual([[200, 0], [300, 0]]);
    expect(plan.fates.get(qKey("jobs", "m1"))).toEqual({ how: "leave", at: 0 });
    expect(plan.arrive.get(hKey("w", "m1"))).toBe(HOP);
    // b moves up to the head as a leaves.
    expect(plan.shift.get("jobs")).toBe(0);
  });

  it("publish to a queue with an idle consumer: into the queue first, then on to the consumer", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, { type: "consume", tag: "w", queue: "jobs", prefetch: 1 }];
    const { plan } = play(setup, pub("", "jobs", "a"));
    const toQueue = plan.ghosts.find((g) => g.key.startsWith("m1-to-jobs"))!;
    const toHand = plan.ghosts.find((g) => g.key.startsWith("m1-to-w"))!;
    expect(toQueue.pts.at(-1)).toEqual([200, 0]);
    expect(toHand.pts[0]).toEqual([200, 0]);
    expect(toHand.ts[0]).toBe(toQueue.ts.at(-1));
  });

  it("nack with requeue: back from the hand to the head of the queue", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, pub("", "jobs", "a"), pub("", "jobs", "b"), { type: "consume", tag: "w", queue: "jobs", prefetch: 1 }];
    const { plan, cur } = play(setup, { type: "nack", tag: "w", requeue: true });
    // The broker hands it straight back out: it returns to the head, then goes to w again.
    expect(cur.consumers.w!.unacked[0]!.id).toBe("m1");
    const back = plan.ghosts.find((g) => g.key.startsWith("m1-back"))!;
    expect(back.pts).toEqual([[300, 0], [200, 0]]);
    expect(plan.fates.get(hKey("w", "m1"))).toEqual({ how: "leave", at: 0 });
    const again = plan.ghosts.find((g) => g.key.startsWith("m1-to-w"))!;
    expect(again.ts[0]).toBe(HOP);
  });

  it("a crashed consumer's unacked messages travel back from where it stood", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, { type: "consume", tag: "w", queue: "jobs", prefetch: 0 }, pub("", "jobs", "a"), pub("", "jobs", "b")];
    const { plan } = play(setup, { type: "crashConsumer", tag: "w" });
    const backs = plan.ghosts.filter((g) => g.key.includes("-back-"));
    expect(backs.map((g) => g.pts[0])).toEqual([[300, 0], [300, 1]]);
    expect(backs.map((g) => g.pts.at(-1))).toEqual([[200, 0], [199, 0]]);
  });

  it("ack: the message is finished and gone, nothing travels", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, { type: "consume", tag: "w", queue: "jobs", prefetch: 0 }, pub("", "jobs", "a")];
    const { plan } = play(setup, { type: "ack", tag: "w" });
    expect(plan.ghosts).toEqual([]);
    expect(plan.fates.get(hKey("w", "m1"))).toEqual({ how: "done", at: 0 });
  });

  it("reject without requeue: out through the dead letter exchange to its queue, or dropped where it stood", () => {
    const withDlx: BrokerAction[] = [
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      { type: "declareQueue", name: "dead" },
      { type: "bind", exchange: "dlx", queue: "dead" },
      { type: "declareQueue", name: "work", args: { dlx: "dlx" } },
      { type: "consume", tag: "w", queue: "work", prefetch: 1 },
      pub("", "work", "a"),
    ];
    const { plan } = play(withDlx, { type: "nack", tag: "w", requeue: false });
    const viaDlx = plan.ghosts.find((g) => g.key.includes("-dlx-"))!;
    expect(viaDlx.pts).toEqual([[300, 0], [100, 0]]);
    const intoDead = plan.ghosts.find((g) => g.key.includes("-dead-dead-"))!;
    expect(intoDead.pts).toEqual([[100, 0], [200, 0]]);
    expect(plan.arrive.get(qKey("dead", "m1"))).toBe(2 * LEG);

    const noDlx: BrokerAction[] = [{ type: "declareQueue", name: "work" }, { type: "consume", tag: "w", queue: "work", prefetch: 1 }, pub("", "work", "a")];
    const dropped = play(noDlx, { type: "nack", tag: "w", requeue: false }).plan;
    expect(dropped.ghosts).toEqual([]);
    expect(dropped.fates.get(hKey("w", "m1"))).toEqual({ how: "drop", at: 0 });
  });

  it("TTL expiry with nowhere to go: dropped at the head of the queue", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "q", args: { ttl: 1 } }, pub("", "q", "a")];
    const { plan } = play(setup, { type: "tick" });
    expect(plan.fates.get(qKey("q", "m1"))).toEqual({ how: "drop", at: 0 });
  });

  it("drop-head: the oldest is pushed out when the new message arrives, not before", () => {
    const setup: BrokerAction[] = [
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      { type: "declareQueue", name: "dead" },
      { type: "bind", exchange: "dlx", queue: "dead" },
      { type: "declareQueue", name: "box", args: { maxLength: 1, dlx: "dlx" } },
      pub("", "box", "a"),
    ];
    const { plan } = play(setup, pub("", "box", "b"));
    const arrived = plan.arrive.get(qKey("box", "m2"))!;
    expect(arrived).toBeGreaterThan(0);
    expect(plan.fates.get(qKey("box", "m1"))).toEqual({ how: "leave", at: arrived });
    expect(plan.ghosts.find((g) => g.key.includes("-dlx-"))!.ts[0]).toBe(arrived);
    // The rest of the line moves up as the oldest leaves, not before.
    expect(plan.shift.get("box")).toBe(arrived);
  });

  it("reject-publish: the full queue refuses the copy, which falls at its door", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "box", args: { maxLength: 1, overflow: "reject-publish" } }, pub("", "box", "a")];
    const { plan } = play(setup, pub("", "box", "b"), true);
    const g = plan.ghosts.find((x) => x.key.startsWith("m2-to-box"))!;
    expect(g.end).toBe("drop");
    expect(plan.arrive.has(qKey("box", "m2"))).toBe(false);
    expect(plan.tokens).toEqual([expect.objectContaining({ ok: false, to: [0, 0] })]);
  });

  it("stream: reading hands out a copy; the original stays in the log", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "events", queueType: "stream" }, pub("", "events", "e1"), pub("", "events", "e2")];
    const { plan } = play(setup, { type: "consume", tag: "r", queue: "events", prefetch: 10, offset: "first" });
    expect(plan.ghosts.map((g) => g.pts[0])).toEqual([[200, 0], [199, 0]]);
    expect(plan.fates.size).toBe(0);
  });

  it("with roads: a copy comes in at the tail and moves up the line; delivery leaves through the head", () => {
    const withRoads = (b: Broker): Places => ({ ...places(b), tail: () => [150, 0], head: () => [250, 0] });
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }, { type: "consume", tag: "w", queue: "jobs", prefetch: 1 }];
    const prev = simulate(setup, createBroker()).states.at(-1)!;
    const r = apply(prev, pub("", "jobs", "a"));
    const plan = choreograph({ prev, cur: r.state, last: r.events, before: withRoads(prev), here: withRoads(r.state) });
    const into = plan.ghosts.find((g) => g.key.startsWith("m1-to-jobs"))!;
    expect(into.pts.at(-2)).toEqual([150, 0]);
    expect(into.pts.at(-1)).toEqual([200, 0]);
    const out = plan.ghosts.find((g) => g.key.startsWith("m1-to-w"))!;
    expect(out.pts.slice(0, 2)).toEqual([[200, 0], [250, 0]]);
    expect(out.pts.at(-1)).toEqual([300, 0]);
    expect(out.ts.every((t, i) => i === 0 || t > out.ts[i - 1]!)).toBe(true);
  });

  it("confirms go back to the publisher only when the lesson uses them", () => {
    const setup: BrokerAction[] = [{ type: "declareQueue", name: "jobs" }];
    expect(play(setup, pub("", "jobs", "a")).plan.tokens).toEqual([]);
    expect(play(setup, pub("", "jobs", "a"), true).plan.tokens).toEqual([expect.objectContaining({ ok: true, from: [200, 0], to: [0, 0] })]);
  });
});
