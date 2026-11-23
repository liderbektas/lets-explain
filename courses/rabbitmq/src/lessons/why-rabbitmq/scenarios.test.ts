import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { QUEUE, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "after-outage": ["node mailer.js", "sleep 3"],
  "new-server": ["node setup.js", "node mailer.js", "node order.js", "sleep 1"],
  "black-friday": ["node mailer.js", "sleep 3"],
  maintenance: ["pkill -f mailer.js", "node mailer.js", "sleep 3"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "after-outage": [["rabbitmqctl list_queues name messages", "node mailer.js && sleep 5"], ["node mailer.js", "node mailer.js", "sleep 2"]],
  "new-server": [["node setup.js", "node order.js", "node mailer.js", "sleep 1"]],
  "black-friday": [["node mailer.js", "node mailer.js", "sleep 2"]],
  maintenance: [["kill mailer.js", "node mailer.js", "sleep 3"], ["kill -9 mailer.js", "node mailer.js", "sleep 4"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // Emptying the queue makes the number go to zero, but nobody got an email.
  "after-outage": ["rabbitmqctl purge_queue emails"],
  // Sending before the queue exists: that first order is gone.
  "new-server": ["node order.js", "node setup.js", "node mailer.js", "node order.js", "sleep 1"],
  // Waiting long enough clears it too, but not within 3 seconds.
  "black-friday": ["sleep 6"],
  // Stopping without starting again: the emails just wait.
  maintenance: ["pkill -f mailer.js", "sleep 3"],
};

describe("why-rabbitmq", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: orders wait while email is down, a spike builds a backlog, a second worker halves it", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 3: three orders wait with nobody listening.
    expect(depth(at(2), QUEUE).ready).toBe(3);
    // Step 4: one worker sends them, one per second.
    expect(at(3).consumers["mailer-1"]!.done).toHaveLength(3);
    // Step 5: six orders at once, two seconds later three still wait.
    expect(depth(at(4), QUEUE)).toMatchObject({ ready: 3, unacked: 1 });
    // Step 6: with two workers, two more seconds clear everything.
    expect(depth(at(5), QUEUE).total).toBe(0);
    expect(at(5).lost).toEqual([]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
