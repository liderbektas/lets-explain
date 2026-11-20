import { describe, expect, it } from "vitest";
import { resolve, short } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const byId = (id: string) => scenarios.find((s) => s.id === id)!;
/** Ids as a reader would copy them from `git log --oneline`. */
const pricesId = short(resolve(byId("revert-shared").start, "HEAD~1")!);
const beforeExperiment = short(resolve(byId("throw-experiment").start, "HEAD~2")!);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "squash-local": ["git reset --soft HEAD~3", 'git commit -m "Add search"'],
  "revert-shared": ["git revert HEAD~1"],
  "split-commit": ["git reset HEAD~1", "git add cart.js", 'git commit -m "Add cart"', "git add footer.html", 'git commit -m "Add footer"'],
  "throw-experiment": ["git reset --hard HEAD~2"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "squash-local": [["git reset HEAD~3", "git add .", 'git commit -m "Add search"']],
  "revert-shared": [[`git revert ${pricesId}`], ["git log --oneline", "git revert --no-edit HEAD~1"]],
  "split-commit": [
    ["git reset --soft HEAD~1", "git restore --staged footer.html", 'git commit -m "Add cart"', "git add .", 'git commit -m "Add footer"'],
    ["git reset --mixed HEAD~1", "git add footer.html", 'git commit -m "Add footer"', "git add cart.js", 'git commit -m "Add cart"'],
  ],
  "throw-experiment": [[`git reset --hard ${beforeExperiment}`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "squash-local": ["git reset --hard HEAD~3", 'git commit -m "Add search"'],
  "revert-shared": ["git reset --hard HEAD~2"],
  "split-commit": ["git revert HEAD"],
  "throw-experiment": ["git reset HEAD~2"],
};

describe("reset-and-revert", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("each reset mode leaves the change where the lesson says", () => {
    const st = (i: number) => scene.run.states[scene.stepEnd(i)]!;
    // --soft: branch back, change staged.
    expect(st(1).index["app.js"]).toBe("bozuk");
    // --mixed: branch back, change only in the folder.
    expect(st(3).index["app.js"]).toBe("v1");
    expect(st(3).work["app.js"]).toBe("düzgün");
    // --hard: the folder change is gone.
    expect(st(4).work["app.js"]).toBe("v1");
    // revert adds a commit on top instead of moving back.
    expect(st(5).commits[st(5).branches.main!]!.parents).toEqual([st(4).branches.main]);
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
