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
const addLine = (after: string, line: string): Edit => (t) => {
  if (!t.includes(after)) throw new Error(`the file has no ${after}`);
  return t.replace(after, `${after}\n${line}`);
};

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "idle-worker": { typed: ["nano setup.js", "node setup.js", "node upload.js"], edits: [swap('"tasks", "images");', '"tasks", "image");')] },
  "videos-too": {
    typed: ["nano setup.js", "node setup.js", "node upload_video.js"],
    edits: [addLine('"tasks", "image");', 'await ch.bindQueue("images", "tasks", "video");')],
  },
  "shouting-service": {
    typed: ["nano setup.js", "node setup.js", "node payments.js"],
    edits: [addLine('"logs", "error");', 'await ch.bindQueue("errors", "logs", "ERROR");')],
  },
  "keep-debug": { typed: ["nano setup.js", "node setup.js", "node debug.js"], edits: [swap('["info", "warning", "error"]', '["debug", "info", "warning", "error"]')] },
  "wrong-key": { typed: ["nano checkout.js", "node checkout.js"], edits: [swap('"tasks", "mail",', '"tasks", "email",')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "idle-worker": [
    {
      typed: ["rabbitmqctl list_bindings source_name destination_name routing_key", "cat setup.js", "nano setup.js", "node setup.js && node upload.js"],
      edits: [swap('"tasks", "images");', '"tasks", "image");')],
    },
  ],
  "videos-too": [
    { typed: ["nano bind_video.js", "node bind_video.js", "node upload_video.js"], edits: [() => `const amqp = require("amqplib");\n\n(async () => {\n  const conn = await amqp.connect();\n  const ch = await conn.createChannel();\n  await ch.bindQueue("images", "tasks", "video");\n  await conn.close();\n})();`] },
  ],
  "keep-debug": [
    { typed: ["nano setup.js", "node setup.js", "node debug.js"], edits: [addLine('"logs", "error");', 'await ch.bindQueue("all-logs", "logs", "debug");')] },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Running the upload again changes nothing: the binding is still wrong.
  "idle-worker": { typed: ["node upload.js"] },
  // A new queue for videos is not what the team asked for.
  "videos-too": {
    typed: ["nano setup.js", "node setup.js", "node upload_video.js"],
    edits: [addLine('"tasks", "image");', 'await ch.assertQueue("videos");\nawait ch.bindQueue("videos", "tasks", "video");')],
  },
  // Changing the other team's service is off limits.
  "shouting-service": { typed: ["nano payments.js", "node payments.js"], edits: [swap('"logs", "ERROR",', '"logs", "error",')] },
  // Sending first loses the message, even if the binding comes after.
  "keep-debug": { typed: ["node debug.js", "nano setup.js", "node setup.js", "node debug.js"], edits: [swap('["info", "warning", "error"]', '["debug", "info", "warning", "error"]')] },
  // Binding the wrong key works, but adds a binding instead of fixing the sender.
  "wrong-key": {
    typed: ["nano setup.js", "node setup.js", "node checkout.js"],
    edits: [addLine('"tasks", "email");', 'await ch.bindQueue("emails", "tasks", "mail");')],
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
