import { describe, expect, it } from "vitest";
import { currentBranch, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const edit: GitAction = { type: "write", path: "app.js", content: "v2" };
const commitAll: GitAction = { type: "commit", all: true, message: "Change" };

const solutions: Record<string, GitAction[]> = {
  "own-path": [{ type: "switch", target: "login" }, edit, commitAll, { type: "switch", target: "main" }],
  "force-delete": [
    { type: "switch", target: "menu", create: true },
    edit,
    commitAll,
    { type: "switch", target: "main" },
    { type: "deleteBranch", name: "menu", force: true },
  ],
  carry: [edit, { type: "switch", target: "login" }, commitAll],
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
