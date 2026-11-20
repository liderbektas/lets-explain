import { describe, expect, it } from "vitest";
import { currentBranch, reachable } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, START, steps, STYLE } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "straight-line": ["git rebase main", "git switch main", "git merge feature"],
  "freshen-up": ["git switch feature", "git rebase main"],
  "keep-blue": ["git switch theme", "git rebase main", "git checkout --theirs style.css", "git add style.css", "git rebase --continue"],
  meeting: ["git rebase --abort"],
  purple: ['echo "renk: mor" > style.css', "git add style.css", "git rebase --continue"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "straight-line": [["git rebase main", "git switch main", "git merge --ff-only feature"], ["git log --oneline --all", "git rebase main && git switch main && git merge feature"]],
  "freshen-up": [["git checkout feature", "git status", "git rebase main"]],
  "keep-blue": [["git switch theme", "git rebase main", 'echo "renk: mavi" > style.css', "git add .", "git rebase --continue"], ["git switch theme", "git rebase main", "git restore --theirs style.css", "git add style.css", "git rebase --continue"]],
  meeting: [["git status", "git rebase --abort"]],
  purple: [["cat style.css", 'echo "renk: mor" > style.css', "git add .", "git rebase --continue"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "straight-line": ["git switch main", "git merge feature"],
  "freshen-up": ["git switch feature", "git merge main"],
  "keep-blue": ["git switch theme", "git rebase main", "git checkout --ours style.css", "git add style.css", "git rebase --continue"],
  meeting: ["git switch main"],
  // Adding without editing commits the conflict markers.
  purple: ["git add style.css", "git rebase --continue"],
};

describe("rebase", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the story: new ids and ghosts, then a fast-forward, then a conflict solved with continue", () => {
    const oldFeature = START.branches.feature!;
    const rebased = scene.run.states[scene.stepEnd(1)]!;
    expect(rebased.branches.feature).not.toBe(oldFeature);
    expect(reachable(rebased).has(oldFeature)).toBe(false);
    expect(rebased.commits[oldFeature]).toBeDefined();
    const ff = scene.run.states[scene.stepEnd(2)]!;
    expect(ff.branches.main).toBe(rebased.branches.feature);
    expect(ff.branches.feature).toBeUndefined();
    const stopped = scene.run.states[scene.stepEnd(5)]!;
    expect(stopped.op?.kind).toBe("rebase");
    expect(stopped.op?.conflicts).toEqual([STYLE]);
    const done = scene.run.states[scene.stepEnd(6)]!;
    expect(done.op).toBeNull();
    expect(currentBranch(done)).toBe("theme");
    expect(done.commits[done.branches.theme!]!.files[STYLE]).toBe("renk: mavi");
    expect(done.commits[done.branches.theme!]!.parents).toEqual([done.branches.main]);
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
