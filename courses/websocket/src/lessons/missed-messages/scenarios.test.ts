import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { addResume, answerResume, persist, skipSeen } from "./code";
import { scenarios } from "./scenarios";
import { readerLines, scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Run> = {
  resume: { lines: ["nano reader.js", "pkill -f reader.js", "node reader.js &", "sleep 60"], edits: [addResume] },
  "keep-history": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node reader.js &", "sleep 60"], edits: [answerResume] },
  twice: { lines: ["nano reader.js", "pkill -f reader.js", "node reader.js &", "sleep 60"], edits: [skipSeen] },
  "survive-restart": { lines: ["nano reader.js", "node reader.js &", "sleep 10", "pkill -f reader.js", "node reader.js &", "sleep 10"], edits: [persist] },
};

const alternatives: Record<string, Run[]> = {
  resume: [{ lines: ["nano reader.js", "kill %2", "node reader.js &", "sleep 30", "sleep 40"], edits: [addResume] }],
};

const wrong: Record<string, Run> = {
  // Restarting the same client: it still forgets.
  resume: { lines: ["pkill -f reader.js", "node reader.js &", "sleep 60"] },
  // A client that asks, a server that can't answer.
  "keep-history": { lines: ["pkill -f server.js", "node server.js &", "node reader.js &", "sleep 60"] },
  // Unchanged: the line after the drop shows twice.
  twice: { lines: ["pkill -f reader.js", "node reader.js &", "sleep 60"] },
  // Kept in a variable only: a new process starts from zero.
  "survive-restart": { lines: ["node reader.js &", "sleep 10", "pkill -f reader.js", "node reader.js &", "sleep 10"] },
};

describe("missed-messages", () => {
  it("the story: a gap after the drop; with resume, none", () => {
    expect(steps).toHaveLength(5);
    expect(readerLines(scene.run.states[scene.stepEnd(0)]!).missing).toBeGreaterThan(5);
    const after = readerLines(scene.run.states[scene.stepEnd(1)]!);
    expect(after.missing).toBe(0);
    expect(after.got.length).toBeGreaterThan(20);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });
    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.lines, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });
    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt.lines, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }
    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.lines, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
