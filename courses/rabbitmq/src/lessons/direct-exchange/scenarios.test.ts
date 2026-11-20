import { describe, expect, it } from "vitest";
import { depth, route } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, START, steps } from "./Scene";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

const swap = (from: string, to: string): Edit => (t) => {
  if (!t.includes(from)) throw new Error(`the file has no ${from}`);
  return t.replace(from, to);
};
const addLine = (after: string, line: string): Edit => (t) => t.replace(after, `${after}\n${line}`);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "idle-worker": { typed: ["nano setup.py", "python setup.py", "python upload.py"], edits: [swap('routing_key="images"', 'routing_key="image"')] },
  "videos-too": {
    typed: ["nano setup.py", "python setup.py", "python upload_video.py"],
    edits: [addLine('routing_key="image")', 'ch.queue_bind(queue="images", exchange="tasks", routing_key="video")')],
  },
  "shouting-service": {
    typed: ["nano setup.py", "python setup.py", "python payments.py"],
    edits: [addLine('routing_key="error")', 'ch.queue_bind(queue="errors", exchange="logs", routing_key="ERROR")')],
  },
  "keep-debug": { typed: ["nano setup.py", "python setup.py", "python debug.py"], edits: [swap('["info", "warning", "error"]', '["debug", "info", "warning", "error"]')] },
  "wrong-key": { typed: ["nano checkout.py", "python checkout.py"], edits: [swap('routing_key="mail"', 'routing_key="email"')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "idle-worker": [
    {
      typed: ["rabbitmqctl list_bindings source_name destination_name routing_key", "cat setup.py", "nano setup.py", "python setup.py && python upload.py"],
      edits: [swap('routing_key="images"', 'routing_key="image"')],
    },
  ],
  "videos-too": [
    { typed: ["nano bind_video.py", "python bind_video.py", "python upload_video.py"], edits: [() => 'import pika\nconnection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))\nch = connection.channel()\nch.queue_bind(queue="images", exchange="tasks", routing_key="video")'] },
  ],
  "keep-debug": [
    { typed: ["nano setup.py", "python setup.py", "python debug.py"], edits: [addLine('routing_key="error")', 'ch.queue_bind(queue="all-logs", exchange="logs", routing_key="debug")')] },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Running the upload again changes nothing: the binding is still wrong.
  "idle-worker": { typed: ["python upload.py"] },
  // A new queue for videos is not what the team asked for.
  "videos-too": {
    typed: ["nano setup.py", "python setup.py", "python upload_video.py"],
    edits: [addLine('routing_key="image")', 'ch.queue_declare(queue="videos", durable=True)\nch.queue_bind(queue="videos", exchange="tasks", routing_key="video")')],
  },
  // Changing the other team's service is off limits.
  "shouting-service": { typed: ["nano payments.py", "python payments.py"], edits: [swap('routing_key="ERROR"', 'routing_key="error"')] },
  // Sending first loses the message, even if the binding comes after.
  "keep-debug": { typed: ["python debug.py", "nano setup.py", "python setup.py", "python debug.py"], edits: [swap('["info", "warning", "error"]', '["debug", "info", "warning", "error"]')] },
  // Binding the wrong key works, but adds a binding instead of fixing the sender.
  "wrong-key": {
    typed: ["nano setup.py", "python setup.py", "python checkout.py"],
    edits: [addLine('routing_key="email")', 'ch.queue_bind(queue="emails", exchange="tasks", routing_key="mail")')],
  },
};

describe("direct-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: one key to two queues, one queue on three keys, unmatched and case-different keys dropped", () => {
    expect(route(START, "logs", "error").sort()).toEqual(["all-logs", "errors"]);
    expect(route(START, "logs", "info")).toEqual(["all-logs"]);
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "errors").ready).toBe(1);
    expect(depth(at(1), "all-logs").ready).toBe(1);
    expect(depth(at(2), "errors").ready).toBe(1);
    expect(at(3).lost.map((x) => x.reason)).toEqual(["unroutable"]);
    expect(depth(at(4), "errors").ready).toBe(2);
    const e2 = scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat().filter((e) => e.type === "delivered" && e.id === "m5");
    expect(e2.map((e) => (e.type === "delivered" ? e.tag : "")).sort()).toEqual(["alerts", "archive"]);
    expect(at(6).lost).toHaveLength(2);
  });

  it("each scenario's setup ran cleanly", () => {
    for (const s of scenarios) expect(Object.keys(s.start.broker.queues).length, s.id).toBeGreaterThan(0);
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
