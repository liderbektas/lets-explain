import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { QUEUE, scene, steps } from "./Scene";
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
const PRINT = "  console.log(` [x] shipping ${msg.content}`);";
const ADD_ACK = swap(PRINT, `${PRINT}\n  ch.ack(msg);`);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "zero-consumers": { typed: ["node worker.js"] },
  "stuck-worker": { typed: ["nano worker.js", "pkill -f worker.js", "node worker.js"], edits: [ADD_ACK] },
  "scale-out": { typed: ["node worker.js", "node worker.js", "sleep 4"] },
  "purge-test": { typed: ["rabbitmqctl purge_queue orders-test"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "zero-consumers": [{ typed: ["docker exec rabbitmq rabbitmqctl list_queues name messages consumers", "node worker.js", "docker exec rabbitmq rabbitmqctl list_queues name messages consumers"] }],
  // Killing the stuck process hard also hands its unacked orders back.
  "stuck-worker": [{ typed: ["rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers", "nano worker.js", "kill -9 %1", "node worker.js"], edits: [ADD_ACK] }],
  "purge-test": [{ typed: ["docker exec rabbitmq rabbitmqctl purge_queue orders-test", "rabbitmqctl list_queues name messages"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Purging empties the queue but ships nothing.
  "zero-consumers": { typed: ["rabbitmqctl purge_queue orders"] },
  // A fixed second worker next to the stuck one: the stuck one still holds two orders.
  "stuck-worker": { typed: ["nano worker.js", "node worker.js"], edits: [ADD_ACK] },
  // Waiting with one worker takes 12 seconds.
  "scale-out": { typed: ["sleep 12"] },
  // Deleting the test queue takes it away entirely.
  "purge-test": { typed: ["rabbitmqctl delete_queue orders-test"] },
};

describe("operations", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(11);
  });

  it("the story: healthy, a spike piles up, a second worker drains it, a stuck worker, then no consumers", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(1), QUEUE).total).toBe(0);
    // Six orders for a worker doing one per tick: after 2 ticks, 2 held and 2 still waiting.
    expect(depth(at(2), QUEUE)).toMatchObject({ ready: 2, unacked: 2 });
    expect(depth(at(3), QUEUE).total).toBe(0);
    // The stuck worker holds orders it never acks.
    const stuck = at(4).consumers["worker-3"]!;
    expect(stuck.unacked.length).toBeGreaterThan(0);
    expect(stuck.done).toHaveLength(0);
    // Crashing it hands its orders back and the others finish them.
    expect(depth(at(5), QUEUE).total).toBe(0);
    expect(at(5).lost).toHaveLength(0);
    // With no consumers left, new orders only pile up.
    expect(Object.keys(at(6).consumers)).toHaveLength(0);
    expect(depth(at(6), QUEUE).ready).toBe(3);
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
