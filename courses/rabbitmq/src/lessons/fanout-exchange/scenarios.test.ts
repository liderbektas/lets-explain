import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
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

const SMS_BIND = 'await ch.bindQueue("sms", "orders", "");';
const OWN_QUEUE = swap('await ch.consume("email"', 'await ch.assertQueue("push");\nawait ch.bindQueue("push", "orders", "");\nawait ch.consume("push"');

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "new-subscriber": {
    typed: ["nano setup.js", "node setup.js", "node order.js"],
    edits: [addLine(SMS_BIND, 'await ch.assertQueue("analytics");\nawait ch.bindQueue("analytics", "orders", "");')],
  },
  "sms-off": { typed: ["nano setup.js", "node setup.js", "node order.js"], edits: [swap(SMS_BIND, 'await ch.unbindQueue("sms", "orders", "");')] },
  "own-queue": { typed: ["nano push.js", "pkill -f push.js", "node push.js", "node order.js"], edits: [OWN_QUEUE] },
  "key-ignored": { typed: ["nano newsletter.js", "node newsletter.js"], edits: [swap('ch.publish("orders",', 'ch.publish("",')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "sms-off": [
    // A one-off script for the unbind, leaving setup.js as it was.
    {
      typed: ["nano unbind_sms.js", "node unbind_sms.js", "node order.js"],
      edits: [() => 'import amqp from "amqplib";\nconst conn = await amqp.connect();\nconst ch = await conn.createChannel();\nawait ch.unbindQueue("sms", "orders", "");\nawait conn.close();'],
    },
  ],
  "own-queue": [
    // A server-named queue, as the lesson's dashboard does.
    {
      typed: ["pkill -f push.js", "nano push.js", "node push.js", "node order.js"],
      edits: [
        swap('await ch.consume("email"', 'const { queue } = await ch.assertQueue("", { exclusive: true });\nawait ch.bindQueue(queue, "orders", "");\nawait ch.consume(queue'),
      ],
    },
  ],
  "key-ignored": [{ typed: ["nano newsletter.js", "node newsletter.js"], edits: [swap('ch.publish("orders", "email",', 'ch.sendToQueue("email",')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // A second publish just for analytics: the order service now sends twice, and it was off limits.
  "new-subscriber": {
    typed: ["nano setup.js", "node setup.js", "nano order.js", "node order.js"],
    edits: [
      addLine(SMS_BIND, 'await ch.assertQueue("analytics");'),
      addLine('Buffer.from("order 1001"));', 'ch.sendToQueue("analytics", Buffer.from("order 1001"));'),
    ],
  },
  // Deleting the bind line and re-running declares nothing new, and removes nothing either.
  "sms-off": { typed: ["nano setup.js", "node setup.js", "node order.js"], edits: [swap(`${SMS_BIND}\n`, "")] },
  // Two orders: each service gets one, neither gets both.
  "own-queue": { typed: ["node order.js", "node order.js"] },
  // Unbinding sms keeps it out, but changes the subscriptions for every order.
  "key-ignored": {
    typed: ["nano setup.js", "node setup.js", "node newsletter.js"],
    edits: [swap(SMS_BIND, 'await ch.unbindQueue("sms", "orders", "");')],
  },
};

describe("fanout-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: copies to every bound queue, key ignored, late joiners miss the past", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "email").ready).toBe(1);
    expect(depth(at(1), "sms").ready).toBe(1);
    // A routing key of "xyz" makes no difference.
    expect(depth(at(2), "email").ready).toBe(2);
    expect(depth(at(2), "sms").ready).toBe(2);
    expect(depth(at(3), "email").total + depth(at(3), "sms").total).toBe(0);
    // analytics only sees o3, not o1 or o2.
    expect(at(4).queues.analytics!.ready.map((m) => m.body)).toEqual(["o3"]);
    expect(at(5).queues["tmp-dashboard"]).toBeUndefined();
    // After unbinding sms, o5 goes to email and analytics only.
    expect(at(6).queues.sms!.ready).toHaveLength(0);
    expect(at(6).queues.analytics!.ready.map((m) => m.body)).toEqual(["o3", "o4", "o5"]);
  });

  it("with push on the email queue, two orders split between the services", () => {
    const s = scenarios.find((x) => x.id === "own-queue")!;
    const out = typeInto(s.start, ["node order.js", "node order.js"]).output;
    expect(out.filter((x) => x.startsWith(" [email]"))).toHaveLength(1);
    expect(out.filter((x) => x.startsWith(" [push]"))).toHaveLength(1);
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
