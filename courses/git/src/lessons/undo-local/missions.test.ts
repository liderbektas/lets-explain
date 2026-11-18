import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { FIXED, scene } from "./Scene";

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "drop-staged": [{ type: "unstage", path: "app.js" }, { type: "restore", path: "app.js" }],
  "fix-message": [{ type: "unstage", path: "app.js" }, { type: "commit", amend: true, message: FIXED }],
  forgotten: [{ type: "unstage", path: "app.js" }, { type: "add", paths: ["README.md"] }, { type: "commit", amend: true }],
};

describe("undo-local", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("amend replaces the last commit instead of adding one", () => {
    const before = scene.run.states[scene.stepStart(6)]!;
    const after = scene.run.states[scene.stepEnd(6)]!;
    const b = before.commits[before.branches.main!]!;
    const a = after.commits[after.branches.main!]!;
    expect(a.id).not.toBe(b.id);
    expect(a.parents).toEqual(b.parents);
    expect(a.message).toBe(FIXED);
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
