import { describe, expect, it } from "vitest";
import { currentBranch, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const edit: GitAction = { type: "write", path: "app.js", content: "v2" };
const commitAll: GitAction = { type: "commit", all: true, message: "Small change" };

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "feature-pr": [{ type: "switch", target: "feature", create: true }, edit, commitAll, { type: "push", setUpstream: true }],
  trunk: [edit, commitAll, { type: "pull", rebase: true }, { type: "push" }],
  "wrong-branch": [edit, commitAll, { type: "branch", name: "feature" }, { type: "reset", target: "origin/main", mode: "hard" }],
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

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
});
