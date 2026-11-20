import { describe, expect, it } from "vitest";
import { short } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { ROUNDING, scenarios, WISHLIST } from "./scenarios";
import { EXPECTED_ERROR_STEP, scene, steps, WIP } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "put-aside": ['git stash push -m "filter wip"'],
  "urgent-fix": ["git stash", "git switch main", 'echo "# Shop" > README.md', 'git commit -am "Fix README title"', "git switch feature", "git stash pop"],
  "pick-one": [`git cherry-pick ${short(ROUNDING)}`],
  "wrong-branch": ["git reset --hard HEAD~1", "git switch feature", `git cherry-pick ${short(WISHLIST)}`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, { typed: string[]; edits?: ((t: string) => string)[] }[]> = {
  "put-aside": [{ typed: ["git stash"] }, { typed: ["git status", "git stash", "git stash list"] }],
  "urgent-fix": [
    { typed: ["git switch main", "git stash", "git checkout main", "nano README.md", "git add README.md", 'git commit -m "Fix title"', "git checkout feature", "git stash pop"], edits: [() => "# Shop"] },
  ],
  "pick-one": [{ typed: ["git log experiment --oneline", "git cherry-pick experiment~1"] }],
  "wrong-branch": [{ typed: ["git switch feature", "git cherry-pick main", "git switch main", "git reset --hard HEAD~1"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "put-aside": ["git restore app.js"],
  "urgent-fix": ["git stash", "git switch main", 'echo "# Shop" > README.md', 'git commit -am "Fix README title"', "git switch feature"],
  "pick-one": ["git merge experiment"],
  "wrong-branch": ["git switch feature", "git cherry-pick main"],
};

describe("stash-and-cherry-pick", () => {
  it("only the planned step (switching with unsaved work) gives a Git error", () => {
    steps.forEach((_, i) => {
      const errors = scene.run.events.slice(scene.stepStart(i), scene.stepEnd(i)).flat().filter((e) => e.type === "error");
      if (i === EXPECTED_ERROR_STEP) expect(errors).toHaveLength(1);
      else expect(errors, `step ${i}`).toEqual([]);
    });
  });

  it("the story does what the text says", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(1).head).toEqual({ kind: "branch", name: "feature" });
    expect(at(2).work["app.js"]).toBe("v2: arama");
    expect(at(2).stash).toHaveLength(1);
    expect(at(4).work["app.js"]).toBe(WIP);
    expect(at(4).stash).toHaveLength(0);
    const picked = at(6).branches.feature!;
    const hotfix = at(6).branches.main!;
    expect(picked).not.toBe(hotfix);
    expect(at(6).commits[picked]!.message).toBe(at(6).commits[hotfix]!.message);
    expect(at(6).work["login.js"]).toBe("giriş (düzeltildi)");
  });

  it("urgent-fix: Git refuses to switch to main with the half-done work, as the story says", () => {
    const s = scenarios.find((x) => x.id === "urgent-fix")!;
    const r = typeInto(s.start, ["git switch main"]);
    expect(r.moves).toBe(0);
    expect(r.output[0]).toMatch(/^error: Your local changes to the following files would be overwritten by checkout:/);
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
