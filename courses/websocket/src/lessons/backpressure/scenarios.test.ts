import { describe, expect, it } from "vitest";
import { bufferedNow } from "../../engine/net";
import { typeInto } from "../shared/testing";
import { dropSlow, skipFull } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Run> = {
  "find-the-slow-one": { lines: ["sleep 30"] },
  "skip-when-full": { lines: ["nano board.js", "pkill -f board.js", "node board.js &", "sleep 60"], edits: [skipFull] },
  "drop-slow": { lines: ["nano board.js", "pkill -f board.js", "node board.js &", "sleep 90"], edits: [dropSlow] },
};

const alternatives: Record<string, Run[]> = {
  "find-the-slow-one": [{ lines: ["sleep 10", "sleep 10", "sleep 10"] }],
  "skip-when-full": [{ lines: ["nano board.js", "kill %1", "node board.js &", "sleep 70"], edits: [(t) => t.replace("    ws.send(board);\n  }\n}, 1000);", "    if (ws.bufferedAmount < 128 * 1024) ws.send(board);\n  }\n}, 1000);")] }],
};

const wrong: Record<string, Run> = {
  // Too short to see anything pile up.
  "find-the-slow-one": { lines: ["sleep 5"] },
  // Restarting changes nothing: the queue grows again.
  "skip-when-full": { lines: ["pkill -f board.js", "node board.js &", "sleep 60"] },
  // Skipping keeps memory low but never lets the slow one go.
  "drop-slow": { lines: ["nano board.js", "pkill -f board.js", "node board.js &", "sleep 90"], edits: [skipFull] },
};

describe("backpressure", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: ~740 KB waits for the phone after 30 s; with the skip it stays under 300 KB", () => {
    expect(steps).toHaveLength(5);
    const waiting = bufferedNow(at(0));
    expect(waiting).toBeGreaterThan(650 * 1024);
    expect(waiting).toBeLessThan(800 * 1024);
    expect(bufferedNow(at(2))).toBeLessThan(300 * 1024);
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
