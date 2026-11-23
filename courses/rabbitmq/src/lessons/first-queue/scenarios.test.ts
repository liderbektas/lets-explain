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

const PRINT = "  console.log(` [x] Resizing ${msg.content}`);";
const addAck: Edit = (t) => {
  if (!t.includes(PRINT)) throw new Error(`the file has no ${PRINT}`);
  return t.replace(PRINT, `${PRINT}\n  ch.ack(msg);`);
};

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "morning-queue": { typed: ["node worker.js"] },
  "forgot-ack": { typed: ["nano worker.js", "pkill -f worker.js", "node worker.js"], edits: [addAck] },
  "lunch-rush": { typed: ["node worker.js", "node send.js"] },
  "stuck-worker": { typed: ["pkill -f slow_worker.js"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "morning-queue": [{ typed: ["rabbitmqctl list_queues name messages", "node worker.js"] }],
  "forgot-ack": [
    { typed: ["pkill -f worker.js", "nano worker.js", "node worker.js"], edits: [addAck] },
    { typed: ["cat worker.js", "kill -9 worker.js", "nano worker.js", "node worker.js"], edits: [addAck] },
  ],
  "stuck-worker": [{ typed: ["jobs", "kill -9 slow_worker.js"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Emptying the queue makes it look done, but nobody processed anything.
  "morning-queue": { typed: ["rabbitmqctl purge_queue tasks"] },
  // A restart without the fix: the new worker never acks either.
  "forgot-ack": { typed: ["pkill -f worker.js", "node worker.js"] },
  // One worker does it all.
  "lunch-rush": { typed: ["node send.js"] },
  // Waiting a little: the slow worker is still stuck.
  "stuck-worker": { typed: ["sleep 5"] },
};

describe("first-queue", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: messages wait, are held until acked, and come back after a crash", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), "hello").ready).toBe(3);
    expect(depth(at(2), "hello")).toMatchObject({ ready: 0, unacked: 3 });
    expect(depth(at(3), "hello").total).toBe(0);
    expect(depth(at(4), "hello").ready).toBe(2);
    expect(at(4).queues.hello!.ready.every((m) => m.redelivered)).toBe(true);
    expect(depth(at(5), "hello").total).toBe(0);
    // Round-robin: four new messages split two and two.
    expect(at(6).consumers["worker-1"]!.unacked).toHaveLength(2);
    expect(at(6).consumers["worker-2"]!.unacked).toHaveLength(2);
  });

  it("the forgotten ack leaves the messages unacked, as rabbitmqctl shows", () => {
    const s = scenarios.find((x) => x.id === "forgot-ack")!;
    const out = typeInto(s.start, ["rabbitmqctl list_queues name messages_ready messages_unacknowledged"]).output;
    expect(out.at(-1)).toBe("tasks\t0\t3");
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
