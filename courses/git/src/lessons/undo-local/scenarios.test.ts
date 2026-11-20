import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { FIXED, scene } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "typo-message": ['git commit --amend -m "Fix checkout"'],
  "forgot-file": ["git add cart.css", "git commit --amend --no-edit"],
  "staged-mistake": ["git restore --staged app.js", "git restore app.js"],
  "amend-carefully": ["git restore --staged app.js", 'git commit --amend -m "Add search box"'],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, { typed: string[]; edits?: ((t: string) => string)[] }[]> = {
  "typo-message": [
    { typed: ["git commit --amend"], edits: [(t) => t.replace("Fix chekout", "Fix checkout")] },
    { typed: ["git reset --soft HEAD~1", 'git commit -m "Fix checkout"'] },
  ],
  "forgot-file": [{ typed: ["git add .", "git commit --amend --no-edit"] }, { typed: ["git add cart.css", 'git commit --amend -m "Add cart"'] }],
  "staged-mistake": [{ typed: ["git reset app.js", "git checkout -- app.js"] }, { typed: ["git status", "git restore --staged app.js", "git restore app.js"] }],
  "amend-carefully": [{ typed: ["git reset app.js", 'git commit --amend -m "Add search box"'] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "typo-message": ['git commit -m "Fix checkout"'],
  "forgot-file": ["git add cart.css", 'git commit -m "Add cart css"'],
  "staged-mistake": ["git reset --hard"],
  "amend-carefully": ['git commit --amend -m "Add search box"'],
};

describe("undo-local", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("amend replaces the last commit instead of adding one", () => {
    const before = scene.run.states[scene.stepStart(6)]!;
    const after = scene.run.states[scene.stepEnd(6)]!;
    const b = before.commits[before.branches.main!]!;
    const a = after.commits[after.branches.main!]!;
    expect(a.id).not.toBe(b.id);
    expect(a.parents).toEqual(b.parents);
    expect(a.message).toBe(FIXED);
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
      it(`${s.id}: also wins with ${alt.typed.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt.typed, alt.edits).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
