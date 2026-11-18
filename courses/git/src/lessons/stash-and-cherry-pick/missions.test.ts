import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERROR_STEP, scene, steps, WIP } from "./Scene";

const solutions: Record<string, GitAction[]> = {
  "copy-hotfix": [{ type: "stash" }, { type: "cherryPick", target: "main" }, { type: "stashPop" }],
  "urgent-fix": [
    { type: "stash" },
    { type: "switch", target: "main" },
    { type: "write", path: "README.md", content: "v2" },
    { type: "commit", message: "Fix", all: true },
    { type: "switch", target: "feature" },
    { type: "stashPop" },
  ],
  "clean-slate": [{ type: "stash" }, { type: "stashDrop" }],
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
