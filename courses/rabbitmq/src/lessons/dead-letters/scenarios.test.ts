import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { scene, steps } from "./Scene";
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
const DLX = `rabbitmqctl set_policy DLX "^work$" '{"dead-letter-exchange":"dlx"}' --apply-to queues`;
const STALE = `rabbitmqctl set_policy stale "^reminders$" '{"message-ttl":3000,"dead-letter-exchange":"dlx"}' --apply-to queues`;
const KEY = `rabbitmqctl set_policy dlk "^payments$" '{"dead-letter-routing-key":"payment.failed"}' --apply-to queues`;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  rejected: { typed: [DLX, "python send_bad.py"] },
  expired: { typed: [STALE, "python remind.py", "sleep 3"] },
  overflow: { typed: [DLX, "python burst.py"] },
  "dlx-key": { typed: [KEY, "python declined.py"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  // Recreate the queue with the argument in code: the worker has to be started again too.
  rejected: [
    {
      typed: ["nano setup.py", "rabbitmqctl delete_queue work", "python setup.py", "python worker.py", "python send_bad.py"],
      edits: [swap('queue_declare(queue="work", durable=True)', 'queue_declare(queue="work", durable=True, arguments={"x-dead-letter-exchange": "dlx"})')],
    },
  ],
  // A per-message expiration does the same, once the queue has a DLX.
  expired: [
    {
      typed: [`rabbitmqctl set_policy dlx "^reminders$" '{"dead-letter-exchange":"dlx"}' --apply-to queues`, "nano remind.py", "python remind.py", "sleep 10"],
      edits: [swap('body=b"meeting at 10:00")', 'body=b"meeting at 10:00", properties=pika.BasicProperties(expiration="3000"))')],
    },
  ],
  // Binding errors to the key the payments really carry also works.
  "dlx-key": [{ typed: ["nano setup.py", "python setup.py", "python declined.py"], edits: [addLine('routing_key="payment.failed")', 'ch.queue_bind(queue="errors", exchange="errors-x", routing_key="payments")')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Changing the code without recreating the queue: RabbitMQ refuses the redeclare.
  rejected: {
    typed: ["nano setup.py", "python setup.py", "python send_bad.py"],
    edits: [swap('queue_declare(queue="work", durable=True)', 'queue_declare(queue="work", durable=True, arguments={"x-dead-letter-exchange": "dlx"})')],
  },
  // A TTL without a DLX: the reminder expires and is simply gone.
  expired: { typed: [`rabbitmqctl set_policy stale "^reminders$" '{"message-ttl":3000}' --apply-to queues`, "python remind.py", "sleep 3"] },
  // Sending before the policy: the oldest order is already dropped.
  overflow: { typed: ["python burst.py", DLX, "python burst.py"] },
  // A policy's DLX does not override the queue's own argument: still errors-x, still the wrong key.
  "dlx-key": { typed: [`rabbitmqctl set_policy x "^payments$" '{"dead-letter-exchange":"errors-x"}' --apply-to queues`, "python declined.py"] },
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
