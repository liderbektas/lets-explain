import { describe, expect, it } from "vitest";
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
const NO_OFFSET = "on_message_callback=handle)";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "from-the-start": { typed: ["nano analytics.py", "python analytics.py"], edits: [swap(NO_OFFSET, 'on_message_callback=handle, arguments={"x-stream-offset": "first"})')] },
  "no-prefetch": { typed: ["nano billing.py", "python billing.py", "python emit.py"], edits: [swap("ch.basic_consume(", "ch.basic_qos(prefetch_count=100)\nch.basic_consume(")] },
  replay: { typed: ["pkill -f analytics.py", "python analytics.py"] },
  "from-an-offset": { typed: ["nano audit.py", "python audit.py"], edits: [swap('"x-stream-offset": "first"', '"x-stream-offset": 2')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "from-the-start": [{ typed: ["cat analytics.py", "nano analytics.py", "python analytics.py"], edits: [swap(NO_OFFSET, 'on_message_callback=handle, arguments={"x-stream-offset": 0})')] }],
  "no-prefetch": [{ typed: ["python billing.py", "nano billing.py", "python billing.py", "python emit.py"], edits: [swap("ch.basic_consume(", "ch.basic_qos(prefetch_count=10)\nch.basic_consume(")] }],
  replay: [{ typed: ["jobs", "kill %1", "python analytics.py"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Without an offset the reader only waits for new events.
  "from-the-start": { typed: ["python analytics.py"] },
  // Running it as it is: RabbitMQ closes the channel.
  "no-prefetch": { typed: ["python billing.py", "python emit.py"] },
  // A second process next to the old one: two readers, one still with the old code.
  replay: { typed: ["python analytics.py"] },
  // Reading from the start gets the first two too.
  "from-an-offset": { typed: ["python audit.py"] },
};

describe("streams", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: reading keeps the log, offsets decide what each reader gets", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(1).queues.events!.log).toHaveLength(3);
    // Analytics read and acked all three; the log still holds them.
    expect(at(2).consumers.analytics!.done).toEqual(["m1", "m2", "m3"]);
    expect(at(2).queues.events!.log).toHaveLength(3);
    // Billing, starting from "first", gets the same three.
    expect(at(3).consumers.billing!.unacked.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    // Audit, starting from "next", gets only what came after it joined.
    expect(at(4).consumers.audit!.unacked.map((m) => m.id)).toEqual(["m4"]);
    expect(at(4).consumers.billing!.unacked.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
    // Offset 1 replays from the second event.
    expect(at(5).consumers.replay!.unacked.map((m) => m.body)).toEqual(["e2", "e3", "e4"]);
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
