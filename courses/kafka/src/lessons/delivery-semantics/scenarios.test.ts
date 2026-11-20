import { describe, expect, it } from "vitest";
import { typeApp } from "../shared/appShell";
import { base, duplicateCount, lostOffsets, sandboxStart } from "./model";
import { scenarios } from "./scenarios";
import { COMMIT_FIRST, lesson, SEND_FIRST, SEND_FIRST_DEDUPE, shell } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
const write = (code: string) => () => code;
const RUN = "python email_consumer.py";

/** The intended way, in exactly par commands. */
const solutions: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "lost-email": { lines: ["nano email_consumer.py", RUN, RUN], edits: [write(SEND_FIRST)] },
  "double-email": { lines: ["nano email_consumer.py", RUN, RUN], edits: [write(SEND_FIRST_DEDUPE)] },
  "back-up": { lines: [RUN] },
  "at-most-once": { lines: ["nano email_consumer.py", RUN, RUN], edits: [write(COMMIT_FIRST)] },
};

/** Tempting moves that must not pass. */
const wrong: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "lost-email": { lines: [RUN, RUN] },
  "double-email": { lines: [RUN, RUN] },
  "back-up": { lines: ["./place-order.sh"] },
  "at-most-once": { lines: [RUN, RUN] },
};

describe("delivery-semantics lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (i: number) => base.run.states[base.ends[i]!]!;
    expect(lostOffsets(at(2))).toEqual([]);
    expect(lostOffsets(at(3))).toEqual([1]);
    expect(at(4).sent[2]).toBe(2);
    expect(duplicateCount(at(5))).toBe(1 + 3);
    expect(at(7).skips).toBe(1);
    expect(at(7).sent[6]).toBe(1);
    expect(sandboxStart.records.length - sandboxStart.committed).toBe(1);
    expect(sandboxStart.dedupe).toBe(false);
  });

  it("prints what the service does, and the planned failure", () => {
    const { r } = play("lost-email", [RUN]);
    expect(r.output).toContain("email-service | committed: next offset 8");
    expect(r.output).toContain("Killed");
    expect(lostOffsets(r.ctx.state).length).toBeGreaterThan(lostOffsets(r.ctx.start).length);
  });

  it("describes the group with real columns", () => {
    const { r } = play("back-up", ["kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service"]);
    expect(r.output[0]).toBe("Consumer group 'email-service' has no active members.");
    expect(r.output.some((x) => /^email-service\s+orders\s+0\s+7\s+9\s+2\s+-$/.test(x))).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeApp(lesson, shell, s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const { r } = play(s.id, sol.lines, sol.edits);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(play(s.id, w.lines, w.edits).r.ctx)).toBe(false);
    });
  }

  it("lost-email: also wins when the fix comes from vim and a check of the group", () => {
    const { s, r } = play("lost-email", ["vim email_consumer.py", RUN, "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service", RUN], [write(SEND_FIRST_DEDUPE)]);
    expect(s.check(r.ctx)).toBe(true);
  });

  it("at-most-once: committing first still loses the crashed notice, and that is allowed", () => {
    const { s, r } = play("at-most-once", ["nano email_consumer.py", RUN, RUN], [write(COMMIT_FIRST)]);
    expect(s.check(r.ctx)).toBe(true);
    expect(lostOffsets(r.ctx.state).length).toBe(lostOffsets(r.ctx.start).length);
  });
});
