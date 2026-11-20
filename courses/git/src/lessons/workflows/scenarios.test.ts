import { describe, expect, it } from "vitest";
import { currentBranch } from "../../engine/git";
import { ctxFor, typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "start-feature": ["git pull", "git switch -c feature/login"],
  "update-pr": ["git fetch", "git rebase origin/main", "git push --force-with-lease"],
  trunk: ['git commit -am "Fix date format"', "git pull --rebase", "git push"],
  "wrong-branch": ["git branch feature", "git reset --hard origin/main", "git switch feature"],
  "good-message": ['git commit -am "fix: keep dates in DD.MM format" -m "Users saw MM/DD after the refactor."'],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "start-feature": [["git fetch", "git switch -c feature/login origin/main"], ["git pull && git checkout -b feature/login"]],
  "update-pr": [["git fetch", "git rebase origin/main", "git push --force-with-lease origin feature/login"]],
  trunk: [["git add app.js", 'git commit -m "Fix date format"', "git pull --rebase", "git push"]],
  "wrong-branch": [["git branch feature", "git reset --hard HEAD~1", "git switch feature"], ["git switch -c feature", "git switch main", "git reset --hard origin/main", "git switch feature"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[][]> = {
  "start-feature": [["git switch -c feature/login"]],
  "update-pr": [["git fetch", "git merge origin/main", "git push"], ["git fetch", "git rebase origin/main", "git push --force"], ["git fetch", "git rebase origin/main", "git push"]],
  trunk: [['git commit -am "Fix date format"', "git pull", "git push"], ['git commit -am "Fix date format"', "git push --force"]],
  "wrong-branch": [["git reset --hard origin/main", "git switch -c feature"]],
  "good-message": [['git commit -am "fixed stuff"']],
};

describe("workflows", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(11);
  });

  it("the story matches the text", () => {
    const pushed = scene.run.states[scene.stepEnd(3)]!;
    expect(pushed.remote!.branches["feature/login"]).toBe(pushed.branches["feature/login"]);
    // Step 4: a teammate pushed, and nothing changed locally.
    const team = scene.run.states[scene.stepEnd(4)]!;
    expect(team.branches.main).toBe(pushed.branches.main);
    expect(team.remote!.branches.main).not.toBe(pushed.remote!.branches.main);
    // Step 5 needs --force-with-lease: a plain push after the rebase is rejected.
    const rebased = scene.run.states[scene.stepStart(5) + 2]!;
    const plain = ctxFor({ ...scene, sandboxStart: rebased }, [{ type: "push" }]);
    expect(plain.events[0]![0]).toMatchObject({ type: "pushRejected", reason: "non-fast-forward" });
    // Step 6: the PR is merged with a merge commit and the branch is gone.
    const merged = scene.run.states[scene.stepEnd(6)]!;
    expect(merged.commits[merged.branches.main!]!.parents).toHaveLength(2);
    expect(merged.branches["feature/login"]).toBeUndefined();
    expect(merged.remote!.branches.main).toBe(merged.branches.main);
    // Step 7: pull --rebase keeps the new commit on top of the teammate's, one parent each.
    const trunk = scene.run.states[scene.stepEnd(7)]!;
    const tip = trunk.commits[trunk.branches.main!]!;
    expect(tip.message).toBe("Tarih biçimi");
    expect(tip.parents).toHaveLength(1);
    expect(trunk.remote!.branches.main).toBe(trunk.branches.main);
    expect(currentBranch(trunk)).toBe("main");
  });

  it("trunk: pull --rebase refuses while the fix is uncommitted, like Git", () => {
    const s = scenarios.find((x) => x.id === "trunk")!;
    const r = typeInto(s.start, ["git pull --rebase"]);
    expect(r.output.some((line) => line.startsWith("error:"))).toBe(true);
    expect(r.moves).toBe(0);
  });

  it("good-message: writing the body in the editor counts too", () => {
    const s = scenarios.find((x) => x.id === "good-message")!;
    const r = typeInto(s.start, ["git commit -a"], [(t) => `Fix date format\n\nUsers saw MM/DD after the refactor.\n${t}`]);
    expect(s.check(r.ctx)).toBe(true);
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
