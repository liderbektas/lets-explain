import { describe, expect, it } from "vitest";
import { aheadBehind, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const bora = (n: number): GitAction => ({ type: "teammate", branch: "main", path: `bora${n}.txt`, content: "not", message: `Bora ${n}` });
const edit = (n: number): GitAction => ({ type: "write", path: "app.js", content: `v${n + 2}` });
const commitAll: GitAction = { type: "commit", message: "Change", all: true };

const solutions: Record<string, GitAction[]> = {
  "you-on-top": [bora(1), edit(1), commitAll, { type: "pull" }, { type: "push" }],
  "just-look": [bora(1), { type: "fetch" }],
  "two-ahead": [edit(1), commitAll, edit(2), commitAll],
  publish: [{ type: "switch", target: "feature", create: true }, edit(1), commitAll, { type: "push", setUpstream: true }],
};

describe("remotes", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(11);
  });

  it("the story does what the text says", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // A local commit: main is one ahead, origin unchanged.
    expect(aheadBehind(at(1), at(1).branches.main!, at(1).tracking["origin/main"]!)).toEqual({ ahead: 1, behind: 0 });
    expect(at(2).remote!.branches.main).toBe(at(2).branches.main);
    // Bora pushed: your origin/main does not know yet.
    expect(at(3).tracking["origin/main"]).toBe(at(2).tracking["origin/main"]);
    // fetch moves origin/main only.
    expect(at(4).branches.main).toBe(at(3).branches.main);
    expect(aheadBehind(at(4), at(4).branches.main!, at(4).tracking["origin/main"]!)).toEqual({ ahead: 0, behind: 1 });
    expect(at(5).branches.main).toBe(at(5).tracking["origin/main"]);
    expect(at(6).branches.main).toBe(at(6).remote!.branches.main);
    // The first plain push of a new branch is refused, -u sends it.
    expect(scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().at(-1)).toMatchObject({ type: "pushRejected", reason: "no-upstream" });
    expect(at(8).remote!.branches.feature).toBe(at(8).branches.feature);
    expect(at(8).upstream.feature).toBe("origin/feature");
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
