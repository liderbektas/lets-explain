import { describe, expect, it } from "vitest";
import { currentBranch, headId, reachable, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const edit: GitAction = { type: "write", path: "app.js", content: "v2" };
const commitAll: GitAction = { type: "commit", all: true, message: "Experiment" };

const solutions: Record<string, GitAction[]> = {
  "look-back": [{ type: "checkout", target: "HEAD~2" }, { type: "switch", target: "main" }],
  rescue: [{ type: "checkout", target: "HEAD~1" }, edit, commitAll, { type: "switch", target: "deneme", create: true }, { type: "switch", target: "main" }],
  "lose-one": [{ type: "checkout", target: "HEAD~1" }, edit, commitAll, { type: "switch", target: "main" }],
};

describe("refs-and-head", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the story: detached commit fades, then is rescued onto a branch", () => {
    const after = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(after(4).head.kind).toBe("detached");
    const lost = headId(after(5))!;
    expect(reachable(after(6)).has(lost)).toBe(false);
    expect(after(7).branches.deneme).toBe(lost);
    expect(currentBranch(after(7))).toBe("deneme");
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
