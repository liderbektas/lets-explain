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
const REFUND = 'Buffer.from("refund-17"));';
const ORDER = 'Buffer.from("order-55"));';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "refund-nowhere": { typed: ["nano refund.js", "node refund.js"], edits: [swap(REFUND, 'Buffer.from("refund-17"), { mandatory: true });')] },
  "burst-nacked": { typed: ["node worker.js", "node burst.js"] },
  "no-majority": { typed: ["docker start rabbit2", "node pay.js"] },
  "acked-then-lost": { typed: ["nano order.js", "node order.js", "docker restart rabbitmq"], edits: [swap(ORDER, 'Buffer.from("order-55"), { persistent: true });')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "refund-nowhere": [
    // With a per-message confirm callback as well.
    {
      typed: ["rabbitmqctl list_bindings source_name routing_key destination_name", "nano refund.js", "node refund.js"],
      edits: [swap(REFUND, 'Buffer.from("refund-17"), { mandatory: true }, (err) => console.log(err ? "nacked" : "confirmed"));')],
    },
  ],
  "burst-nacked": [{ typed: ["rabbitmqctl list_queues name messages consumers", "node worker.js", "node burst.js"] }],
  "no-majority": [{ typed: ["docker ps -a", "docker start rabbit3", "docker exec rabbit1 rabbitmq-queues quorum_status payments", "node pay.js"] }],
  "acked-then-lost": [{ typed: ["nano order.js", "node order.js", "docker stop rabbitmq", "docker start rabbitmq"], edits: [swap(ORDER, 'Buffer.from("order-55"), { deliveryMode: 2 });')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Running it again: still acked and dropped.
  "refund-nowhere": { typed: ["node refund.js"] },
  // Sending first: the third order is nacked before the worker starts.
  "burst-nacked": { typed: ["node burst.js", "node worker.js", "node burst.js"] },
  // Sending again changes nothing while two nodes are down.
  "no-majority": { typed: ["node pay.js", "node pay.js"] },
  // Confirms alone do not keep a transient message.
  "acked-then-lost": { typed: ["node order.js", "docker restart rabbitmq"] },
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

  it("the scripts tell what the broker answered: a nack crashes waitForConfirms, a returned refund is printed before \"sent\"", () => {
    const burst = scenarios.find((x) => x.id === "burst-nacked")!;
    const crashed = typeInto(burst.start, ["node burst.js"]).output;
    expect(crashed).toContain("Error: message nacked");
    expect(crashed).not.toContain("sent");
    const drained = typeInto(burst.start, ["node worker.js", "node burst.js"]).output;
    expect(drained).toContain("sent");
    expect(drained).not.toContain("Error: message nacked");
    const refund = scenarios.find((x) => x.id === "refund-nowhere")!;
    expect(typeInto(refund.start, ["node refund.js"]).output).toEqual(["sent"]);
    const p = solutions["refund-nowhere"]!;
    expect(typeInto(refund.start, p.typed, [...(p.edits ?? [])]).output).toEqual(["returned: refund-17", "sent"]);
    const alt = alternatives["refund-nowhere"]![0]!;
    expect(typeInto(refund.start, alt.typed, [...(alt.edits ?? [])]).output.slice(-3)).toEqual(["returned: refund-17", "confirmed", "sent"]);
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
