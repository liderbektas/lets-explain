import { describe, expect, it } from "vitest";
import { BORA } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { REJECTED_STEPS, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "straight-line": ["git pull --rebase", "git push"],
  "safe-amend": ['git commit --amend -m "Fix checkout"', "git push --force-with-lease"],
  "pr-ready": ["git switch -c search", "git add search.js", 'git commit -m "Add search box"', "git push -u origin search"],
  "after-merge": ["git switch main", "git pull", "git branch -d feature"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "straight-line": [["git push", "git fetch", "git rebase origin/main", "git push"]],
  "pr-ready": [["git checkout -b search", "git add .", 'git commit -m "Add search box"', "git push --set-upstream origin search"]],
  "after-merge": [["git checkout main", "git pull", "git branch -D feature"], ["git switch main && git pull && git branch -d feature"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[][]> = {
  "straight-line": [["git pull", "git push"], ["git push --force"]],
  "safe-amend": [['git commit --amend -m "Fix checkout"', "git push --force"], ['git commit --amend -m "Fix checkout"', "git push"]],
  "pr-ready": [["git add .", 'git commit -m "Add search box"', "git push"], ["git switch -c search", "git add .", 'git commit -m "Add search box"', "git push origin search"]],
  "after-merge": [["git switch main", "git branch -d feature"], ["git branch -d feature"]],
};

const eventsOf = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();

describe("collaboration", () => {
  it("no step gives a Git error; pushes are refused only where planned", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(11);
    steps.forEach((_, i) => {
      const rejected = eventsOf(i).filter((e) => e.type === "pushRejected");
      expect(rejected.length > 0, `step ${i}`).toBe(REJECTED_STEPS.includes(i));
    });
  });

  it("the story does what the text says", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(eventsOf(1).at(-1)).toMatchObject({ reason: "non-fast-forward" });
    // pull made a merge commit with two parents.
    expect(at(2).commits[at(2).branches.main!]!.parents).toHaveLength(2);
    expect(at(3).remote!.branches.main).toBe(at(3).branches.main);
    // pull --rebase kept the line straight: the tip has one parent, Bora's commit.
    const tip4 = at(4).commits[at(4).branches.main!]!;
    expect(tip4.parents).toHaveLength(1);
    expect(at(4).commits[tip4.parents[0]!]!.author).toBe(BORA);
    expect(eventsOf(5).at(-1)).toMatchObject({ reason: "stale" });
    // --force overwrote Bora's README commit on origin.
    expect(eventsOf(6).at(-1)).toMatchObject({ type: "pushed", forced: true });
    const remote = at(6).remote!;
    const lost = Object.values(remote.commits).find((c) => c.message === "Bora: README düzeltildi")!;
    expect(lost).toBeDefined();
    expect(remote.branches.main).not.toBe(lost.id);
    expect(at(7).remote!.branches.feature).toBe(at(7).branches.feature);
    expect(at(8).branches.feature).toBeUndefined();
    expect(at(8).remote!.branches.main).toBe(at(8).branches.main);
  });

  it("safe-amend also works through the commit editor", () => {
    const s = scenarios.find((x) => x.id === "safe-amend")!;
    const r = typeInto(s.start, ["git commit --amend", "git push --force-with-lease"], [(t) => t.replace("Fix chekout", "Fix checkout")]);
    expect(s.check(r.ctx)).toBe(true);
  });

  it("after-merge starts with the PR merged on origin only", () => {
    const s = scenarios.find((x) => x.id === "after-merge")!;
    const main = s.start.remote!.branches.main!;
    expect(s.start.remote!.commits[main]!.parents).toHaveLength(2);
    expect(s.start.branches.main).not.toBe(main);
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

    for (const bad of wrong[s.id] ?? []) {
      it(`${s.id}: does not win with ${bad.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, bad).ctx)).toBe(false);
      });
    }
  }
});
