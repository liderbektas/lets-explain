import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { DEAD, QUEUE, scene, steps } from "./Scene";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

const swap = (from: string, to: string): Edit => (t) => {
  if (!t.includes(from)) throw new Error(`the file has no ${from}`);
  return t.replace(from, to);
};
const toManual: Edit = (t) => swap("  await sleep(1000);\n", "  await sleep(1000);\n  ch.ack(msg);\n")(swap(", { noAck: true }", "")(t));

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "reproduce-loss": { typed: ["node worker.js", "node send.js", "kill -9 worker.js"] },
  "manual-ack": { typed: ["nano worker.js", "node worker.js", "sleep 3"], edits: [toManual] },
  "poison-order": { typed: ["nano worker.js", "node worker.js"], edits: [swap("ch.nack(msg, false, true)", "ch.nack(msg, false, false)")] },
  "safe-deploy": { typed: ["pkill -f worker.js", "node worker.js", "sleep 3"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "reproduce-loss": [{ typed: ["node send.js", "node worker.js", "sleep 1", "kill -9 worker.js"] }],
  "manual-ack": [
    { typed: ["cat worker.js", "nano worker.js", "node worker.js && sleep 5"], edits: [toManual] },
    // Keeping the option but turning it off, and acking with the tutorial's setTimeout.
    {
      typed: ["nano worker.js", "node worker.js", "sleep 3"],
      edits: [(t) => swap("{ noAck: true }", "{ noAck: false }")(swap("  await sleep(1000);\n", "  setTimeout(() => ch.ack(msg), 1000);\n")(t))],
    },
  ],
  "poison-order": [
    { typed: ["nano worker.js", "node worker.js"], edits: [swap("ch.nack(msg, false, true)", "ch.reject(msg, false)")] },
  ],
  // A crash is fine too with manual acks: what it held comes back.
  "safe-deploy": [{ typed: ["kill -9 worker.js", "node worker.js", "sleep 3"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // A clean stop gives the worker time to finish what it took: nothing is lost.
  "reproduce-loss": { typed: ["node worker.js", "node send.js", "pkill -f worker.js"] },
  // Running it as it is: the orders get processed, but the broker never hears an ack.
  "manual-ack": { typed: ["node worker.js", "sleep 3"] },
  // Running it as it is: the broken order bounces forever.
  "poison-order": { typed: ["node worker.js"] },
  // Waiting does it, but nothing was restarted.
  "safe-deploy": { typed: ["sleep 3"] },
};

describe("acks", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: the auto-ack worker took all three at once; the broker holds nothing.
    expect(depth(at(1), QUEUE)).toMatchObject({ ready: 0, unacked: 0 });
    expect(at(1).consumers.auto!.done).toEqual(["m1"]);
    // Step 2: its crash loses the two it had not processed.
    expect(at(2).lost.map((x) => x.reason)).toEqual(["auto-ack-crash", "auto-ack-crash"]);
    // Step 3: the manual worker acked one and holds two.
    expect(depth(at(3), QUEUE).unacked).toBe(2);
    // Step 4: nack + requeue brings b2 straight back, marked redelivered.
    expect(at(4).consumers.manual!.unacked.map((m) => [m.body, m.redelivered])).toEqual([
      ["b3", false],
      ["b2", true],
    ]);
    // Step 5: reject without requeue sends b3 to the dead letter queue.
    expect(at(5).queues[DEAD]!.ready.map((m) => m.body)).toEqual(["b3"]);
    // Step 6: one ack with multiple clears everything.
    expect(depth(at(6), QUEUE).total).toBe(0);
  });

  it("the requeue loop shows in the terminal", () => {
    const s = scenarios.find((x) => x.id === "poison-order")!;
    expect(typeInto(s.start, ["node worker.js"]).output.at(-1)).toMatch(/keep coming back/);
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
