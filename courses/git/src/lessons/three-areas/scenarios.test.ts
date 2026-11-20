import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "only-the-fix": ["git add app.js", 'git commit -m "Fix checkout"'],
  "too-much-staged": ["git restore --staged debug.log"],
  "bad-experiment": ["git restore style.css"],
  together: ["git add .", 'git commit -m "Add cart"'],
  "changed-after-add": ["git add app.js", 'git commit -m "Show cart"'],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "only-the-fix": [["git status", "git add app.js", "git commit -m fix"]],
  "too-much-staged": [["git reset debug.log"], ["git rm --cached debug.log"]],
  "bad-experiment": [["git checkout -- style.css"]],
  together: [["git add cart.js app.js", 'git commit -m "Add cart"'], ["git add cart.js", 'git commit -am "Add cart"']],
  "changed-after-add": [['git commit -am "Show cart"']],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "only-the-fix": ['git commit -am "Fix checkout"'],
  "too-much-staged": ["rm debug.log"],
  "bad-experiment": ["git restore ."],
  together: ['git commit -am "Add cart"'],
  "changed-after-add": ['git commit -m "Show cart"'],
};

describe("three-areas", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(9);
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
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
