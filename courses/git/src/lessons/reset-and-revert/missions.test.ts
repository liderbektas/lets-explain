import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene } from "./Scene";

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  squash: [{ type: "reset", target: "HEAD~1", mode: "soft" }, { type: "reset", target: "HEAD~1", mode: "soft" }, { type: "commit", message: "Düzeltme" }],
  shared: [{ type: "revert", target: "HEAD" }, { type: "revert", target: "HEAD~2" }],
  redo: [
    { type: "reset", target: "HEAD~1", mode: "mixed" },
    { type: "write", path: "app.js", content: "düzgün" },
    { type: "add", paths: "." },
    { type: "commit", message: "Düzeltme" },
  ],
};

describe("reset-and-revert", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("each reset mode leaves the change where the lesson says", () => {
    const st = (i: number) => scene.run.states[scene.stepEnd(i)]!;
    // --soft: branch back, change staged.
    expect(st(1).index["app.js"]).toBe("bozuk");
    // --mixed: branch back, change only in the folder.
    expect(st(3).index["app.js"]).toBe("v1");
    expect(st(3).work["app.js"]).toBe("düzgün");
    // --hard: the folder change is gone.
    expect(st(4).work["app.js"]).toBe("v1");
    // revert adds a commit on top instead of moving back.
    expect(st(5).commits[st(5).branches.main!]!.parents).toEqual([st(4).branches.main]);
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
