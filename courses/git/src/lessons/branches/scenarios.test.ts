import { describe, expect, it } from "vitest";
import { currentBranch } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "new-feature": ["git switch -c search", 'echo "search()" > search.js', "git add search.js", 'git commit -m "Search box"'],
  "wrong-branch": ["git switch login", 'git commit -am "Login screen"'],
  "dead-end": ["git switch main", "git branch -D experiment"],
  "already-in": ["git branch -d login"],
  refused: ['git commit -am "Fix typo"', "git switch login"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "new-feature": [["git checkout -b search", "touch search.js", "git add .", 'git commit -m "Start search"'], ["git branch search", "git switch search", "echo x > search.js", "git add search.js", "git commit -m s"]],
  "wrong-branch": [["git checkout login", "git add app.js", 'git commit -m "Login screen"']],
  "dead-end": [["git checkout main", "git branch -D experiment"]],
  "already-in": [["git branch -v", "git log --oneline", "git branch -d login"], ["git branch -D login"]],
  refused: [["git switch login", "git add login.js", 'git commit -m "Fix typo"', "git switch login"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "new-feature": ['echo "search()" > search.js', "git add search.js", 'git commit -m "Search box"', "git branch search"],
  "wrong-branch": ['git commit -am "Login screen"', "git switch login"],
  "dead-end": ["git branch -d experiment", "git switch main", "git branch -d experiment"],
  "already-in": ["git switch login"],
  refused: ["git restore login.js", "git switch login"],
};

describe("branches", () => {
  it("only the refusals the lesson is about produce Git errors", () => {
    steps.forEach((_, step) => {
      const events = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
      const codes = events.flatMap((e) => (e.type === "error" ? [e.code] : []));
      expect(codes, `step ${step}`).toEqual(EXPECTED_ERRORS[step] ? [EXPECTED_ERRORS[step]] : []);
    });
  });

  it("the story: commits move only the current branch, untracked files come along", () => {
    const after = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(after(2).branches.main).toBe(after(1).branches.main);
    expect(after(3).work["login.js"]).toBeUndefined();
    expect(after(5).work["notlar.txt"]).toBe("yapılacaklar");
    expect(currentBranch(after(6))).toBe("login");
    expect(after(7).branches.login).toBeDefined();
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
