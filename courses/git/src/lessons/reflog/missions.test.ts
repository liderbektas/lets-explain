import { describe, expect, it } from "vitest";
import { reachable, resolve, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPERIMENT, IMPORTANT, rescueName, scene } from "./Scene";

const startMain = scene.sandboxStart.branches.main!;
const back = resolve(scene.sandboxStart, "HEAD~1")!;

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "bring-back": [{ type: "reset", target: IMPORTANT, mode: "hard" }],
  both: [
    { type: "reset", target: IMPORTANT, mode: "hard" },
    { type: "branch", name: rescueName(EXPERIMENT), at: EXPERIMENT },
  ],
  "round-trip": [
    { type: "reset", target: "HEAD~1", mode: "hard" },
    { type: "reset", target: startMain, mode: "hard" },
  ],
};

describe("reflog", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("the lesson's story holds: lost after reset, found again, and uncommitted work is gone", () => {
    const at = (i: number) => scene.run.states[scene.stepEnd(i)]!;
    expect(reachable(at(1)).has(IMPORTANT)).toBe(false);
    expect(at(1).reflog.some((e) => e.to === IMPORTANT)).toBe(true);
    expect(at(3).branches.main).toBe(IMPORTANT);
    expect(reachable(at(4)).has(EXPERIMENT)).toBe(false);
    expect(at(5).branches.deneme).toBe(EXPERIMENT);
    // The unsaved README change never reached a commit, so nothing in the reflog holds it.
    const s6 = at(6);
    expect(s6.work["README.md"]).toBe("Merhaba");
    expect(Object.values(s6.commits).some((c) => c.files["README.md"] === "yarım kalmış iş")).toBe(false);
  });

  it("the sandbox starts with both commits lost", () => {
    expect(reachable(scene.sandboxStart).has(IMPORTANT)).toBe(false);
    expect(reachable(scene.sandboxStart).has(EXPERIMENT)).toBe(false);
    expect(back).toBeTruthy();
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
