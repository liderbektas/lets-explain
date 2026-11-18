import { describe, expect, it } from "vitest";
import { headId, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const solutions: Record<string, GitAction[]> = {
  "one-merge": [
    { type: "merge", target: "login" },
    { type: "merge", target: "menu" },
  ],
  "keep-record": [
    { type: "merge", target: "login", noFf: true },
    { type: "deleteBranch", name: "login" },
  ],
  "clean-up": [
    { type: "merge", target: "login" },
    { type: "merge", target: "menu" },
    { type: "deleteBranch", name: "login" },
    { type: "deleteBranch", name: "menu" },
  ],
};

describe("merging", () => {
  it("only the refusal the lesson is about produces a Git error", () => {
    steps.forEach((_, step) => {
      const events = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
      const codes = events.flatMap((e) => (e.type === "error" ? [e.code] : []));
      expect(codes, `step ${step}`).toEqual(EXPECTED_ERRORS[step] ? [EXPECTED_ERRORS[step]] : []);
    });
  });

  it("the story: fast-forward, then a merge commit, then --no-ff", () => {
    const after = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1 slides main onto feature without a new commit.
    expect(after(1).branches.main).toBe(after(1).branches.feature);
    expect(Object.keys(after(1).commits).length).toBe(Object.keys(after(0).commits).length);
    // Step 3 makes a merge commit with the default message.
    const m = after(3).commits[headId(after(3))!]!;
    expect(m.parents).toHaveLength(2);
    expect(m.message).toBe("Merge branch 'sepet'");
    // Step 5: --no-ff makes a merge commit even though a fast-forward was possible.
    expect(after(5).commits[headId(after(5))!]!.parents).toHaveLength(2);
    // Step 7 ends with only main.
    expect(Object.keys(after(7).branches)).toEqual(["main"]);
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
