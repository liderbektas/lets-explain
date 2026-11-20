import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { lastAnswer, scene, steps } from "./Scene";
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
const PERSISTENT = "properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent)";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "refund-nowhere": { typed: ["nano refund.py", "python refund.py"], edits: [swap('body=b"refund-17")', 'body=b"refund-17", mandatory=True)')] },
  "burst-nacked": { typed: ["python worker.py", "python burst.py"] },
  "no-majority": { typed: ["docker start rabbit2", "python pay.py"] },
  "acked-then-lost": { typed: ["nano order.py", "python order.py", "docker restart rabbitmq"], edits: [swap('body=b"order-55")', `body=b"order-55", ${PERSISTENT})`)] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "refund-nowhere": [{ typed: ["rabbitmqctl list_bindings source_name routing_key destination_name", "nano refund.py", "python refund.py"], edits: [swap('routing_key="refund", body=b"refund-17"', 'routing_key="refund", body=b"refund-17", mandatory=True')] }],
  "burst-nacked": [{ typed: ["rabbitmqctl list_queues name messages consumers", "python worker.py", "python burst.py"] }],
  "no-majority": [{ typed: ["docker ps -a", "docker start rabbit3", "docker exec rabbit1 rabbitmq-queues quorum_status payments", "python pay.py"] }],
  "acked-then-lost": [{ typed: ["nano order.py", "python order.py", "docker stop rabbitmq", "docker start rabbitmq"], edits: [swap('body=b"order-55")', 'body=b"order-55", properties=pika.BasicProperties(delivery_mode=2))')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Running it again: still acked and dropped.
  "refund-nowhere": { typed: ["python refund.py"] },
  // Sending first: the third order is nacked before the worker starts.
  "burst-nacked": { typed: ["python burst.py", "python worker.py", "python burst.py"] },
  // Sending again changes nothing while two nodes are down.
  "no-majority": { typed: ["python pay.py", "python pay.py"] },
  // Confirms alone do not keep a transient message.
  "acked-then-lost": { typed: ["python order.py", "docker restart rabbitmq"] },
};

describe("publisher-confirms", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: ack for routed and unroutable, nack for a full queue and for no quorum, duplicates on resend", () => {
    const last = (step: number) => scene.run.events[scene.stepEnd(step) - 1]!;
    expect(lastAnswer(last(1))).toBe("ack");
    // Unroutable without mandatory: dropped, and still acked.
    expect(last(2).some((e) => e.type === "unroutable" && !e.returned)).toBe(true);
    expect(lastAnswer(last(2))).toBe("ack");
    expect(last(3).some((e) => e.type === "unroutable" && e.returned)).toBe(true);
    // The third message into a full reject-publish queue is nacked.
    expect(lastAnswer(last(4))).toBe("nack");
    // No majority on the quorum queue: nacked too.
    expect(last(5).find((e) => e.type === "confirmed")).toMatchObject({ ok: false, reason: "no quorum" });
    // The resent order lands twice.
    const end = scene.run.states[scene.stepEnd(6)]!;
    expect(end.queues.billing!.ready.filter((m) => m.body === "o2")).toHaveLength(2);
    expect(depth(end, "payments").ready).toBe(1);
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
