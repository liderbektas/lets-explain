import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { FAST_SPEED, QUEUE, scene, steps } from "./Scene";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

const QOS = "ch.basic_qos(prefetch_count=1)";
const CONSUME = 'ch.basic_consume(queue="jobs"';
const addQos: Edit = (t) => t.replace(CONSUME, `${QOS}\n${CONSUME}`);
const moveQos: Edit = (t) => {
  if (!t.includes(`\n${QOS}`)) throw new Error("no qos line");
  return addQos(t.replace(`\n${QOS}`, ""));
};
const RESTART = ["pkill -f slow_worker.py", "python slow_worker.py", "python send.py"];

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  hoarding: { typed: ["nano slow_worker.py", ...RESTART], edits: [addQos] },
  "qos-too-late": { typed: ["nano slow_worker.py", ...RESTART], edits: [moveQos] },
  rescue: { typed: ["pkill -f slow_worker.py"] },
  backlog: { typed: ["python fast_worker.py"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  hoarding: [{ typed: ["pkill -f slow_worker.py", "nano slow_worker.py", "python slow_worker.py", "python send.py"], edits: [addQos] }],
  rescue: [{ typed: ["rabbitmqctl list_queues name messages_unacknowledged", "kill -9 slow_worker.py"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Sending the batch before fixing it: the slow worker grabs its half again.
  hoarding: { typed: ["python send.py", "nano slow_worker.py", ...RESTART], edits: [addQos] },
  // A restart without moving the line changes nothing.
  "qos-too-late": { typed: RESTART },
  // Waiting for the slow worker: time passes, and it still holds the others.
  rescue: { typed: ["sleep 10"] },
  // Waiting instead: the slow worker does one in ten seconds.
  backlog: { typed: ["sleep 10"] },
};

describe("prefetch", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: no limit, so the 8 jobs split 4 and 4, speed ignored.
    expect(at(1).consumers.fast!.unacked).toHaveLength(4);
    expect(at(1).consumers.slow!.unacked).toHaveLength(4);
    // Step 2: the fast one is done and idle, the slow one still sits on 4.
    expect(at(2).consumers.fast!.done).toHaveLength(4);
    expect(at(2).consumers.fast!.unacked).toHaveLength(0);
    expect(at(2).consumers.slow!.unacked).toHaveLength(4);
    // Step 3: both reconnect with prefetch 1 and take one each; the slow one's jobs came back.
    expect(at(3).consumers.slow!.unacked).toHaveLength(1);
    expect(depth(at(3), QUEUE).ready).toBe(2);
    // Step 5: four ticks later the fast one did 4 more, one a tick; the slow one still holds only 1.
    expect(at(5).consumers.fast!.done).toHaveLength(4);
    expect(at(5).consumers.slow!.unacked).toHaveLength(1);
    expect(depth(at(5), QUEUE).ready).toBe(2);
    // Step 6: with prefetch 3 the fast one finishes FAST_SPEED a tick.
    expect(at(6).consumers.fast!.done).toHaveLength(2 * FAST_SPEED);
  });

  it("without a limit, the slow worker takes half the batch", () => {
    const s = scenarios.find((x) => x.id === "hoarding")!;
    const out = typeInto(s.start, ["python send.py", "rabbitmqctl list_queues name messages_ready messages_unacknowledged"]).output;
    expect(out.at(-1)).toBe("jobs\t0\t3");
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
