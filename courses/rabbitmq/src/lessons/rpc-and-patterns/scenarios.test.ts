import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { answer, ask, REPLY, RPC, scene, steps } from "./Scene";
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
const reply = (n: number) => answer({ replyTo: REPLY, correlationId: `c${n}` });
const ack = (tag: string): BrokerAction => ({ type: "ack", tag });
void reply;
void ack;
void ask;
void RPC;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "no-server": { typed: ["python server.py"] },
  "wrong-reply-queue": { typed: ["nano server.py", "python server.py"], edits: [swap('routing_key="replies"', "routing_key=props.reply_to")] },
  "lost-correlation": { typed: ["nano server.py", "python server.py"], edits: [swap('routing_key=props.reply_to, body=b"42.90")', 'routing_key=props.reply_to, properties=pika.BasicProperties(correlation_id=props.correlation_id), body=b"42.90")')] },
  "stale-requests": { typed: ["nano client.py", "python client.py", "sleep 5"], edits: [swap('correlation_id="c9")', 'correlation_id="c9", expiration="5000")')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "no-server": [{ typed: ["rabbitmqctl list_queues name messages consumers", "python server.py", "rabbitmqctl list_queues name messages"] }],
  // A queue-wide TTL by policy does the same for every request.
  "stale-requests": [{ typed: [`rabbitmqctl set_policy rpc-ttl "^rpc$" '{"message-ttl":5000}' --apply-to queues`, "python client.py", "sleep 6"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Sending another request does not help: nobody is there to answer.
  "no-server": { typed: ["python client.py"] },
  // The unchanged server answers into the web client's queue.
  "wrong-reply-queue": { typed: ["python server.py"] },
  // Answers arrive, but without correlation ids.
  "lost-correlation": { typed: ["python server.py"] },
  // Purging is a one-off: the next night they pile up again, and this request was never sent.
  "stale-requests": { typed: ["rabbitmqctl purge_queue rpc"] },
};

describe("rpc-and-patterns", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: request to a server, answer to the reply queue, out-of-order answers, a timed-out request", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: the request waits in server-1's hands with its reply address.
    const held = at(1).consumers["server-1"]!.unacked[0]!;
    expect(held).toMatchObject({ replyTo: REPLY, correlationId: "c1" });
    // Step 2: the answer reached the client; the request is done.
    expect(at(2).consumers.client!.unacked.map((m) => m.correlationId)).toEqual(["c1"]);
    expect(depth(at(2), RPC).total).toBe(0);
    // Step 4: c3's answer arrived before c2's.
    expect(at(4).consumers.client!.unacked.map((m) => m.correlationId)).toEqual(["c3", "c2"]);
    // Step 5: with no server, the request with a TTL expired and nobody answered it.
    expect(at(5).lost.at(-1)).toMatchObject({ reason: "expired" });
    expect(depth(at(5), RPC).total).toBe(0);
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
