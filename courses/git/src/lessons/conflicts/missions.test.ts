import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { LOG, scene, steps, TITLE } from "./Scene";

const merge: GitAction = { type: "merge", target: "feature" };

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "their-title": [
    merge,
    { type: "resolve", path: TITLE, take: "theirs" },
    { type: "resolve", path: LOG, take: "both" },
    { type: "add", paths: "." },
    { type: "commit" },
  ],
  abort: [merge, { type: "abort" }],
  tidy: [
    merge,
    { type: "resolve", path: TITLE, take: "ours" },
    { type: "resolve", path: LOG, take: "both" },
    { type: "add", paths: "." },
    { type: "commit" },
    { type: "deleteBranch", name: "feature" },
  ],
};

describe("conflicts", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the merge stops on both files, and the lesson ends with a two-parent merge commit", () => {
    const afterMerge = scene.run.states[scene.stepEnd(1)]!;
    expect(afterMerge.op?.conflicts).toEqual([LOG, TITLE]);
    expect(afterMerge.work[TITLE]).toBe("<<<<<<< HEAD\nMağaza: Büyük indirim\n=======\nOnline Mağaza\n>>>>>>> feature");
    const afterAbort = scene.run.states[scene.stepEnd(3)]!;
    expect(afterAbort.op).toBeNull();
    expect(afterAbort.work[TITLE]).toBe("Mağaza: Büyük indirim");
    const done = scene.run.states[scene.stepEnd(6)]!;
    const head = done.commits[done.branches.main!]!;
    expect(head.parents).toHaveLength(2);
    expect(head.files[LOG]).toBe("Şifre sıfırlama eklendi\nKaranlık tema eklendi");
    expect(head.files[TITLE]).toBe("Online Mağaza");
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
