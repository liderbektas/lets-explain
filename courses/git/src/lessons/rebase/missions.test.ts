import { describe, expect, it } from "vitest";
import { currentBranch, reachable, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, START, steps, STYLE } from "./Scene";

const sw = (target: string): GitAction => ({ type: "switch", target, create: false });
const rebase: GitAction = { type: "rebase", onto: "main" };

const solutions: Record<string, GitAction[]> = {
  "straight-line": [rebase, sw("main"), { type: "merge", target: "feature" }],
  "merge-way": [sw("main"), { type: "merge", target: "feature" }],
  "keep-blue": [sw("theme"), rebase, { type: "resolve", path: STYLE, take: "theirs" }, { type: "add", paths: [STYLE] }, { type: "continue" }],
  abort: [sw("theme"), rebase, { type: "abort" }],
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
