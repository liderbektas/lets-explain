import { describe, expect, it } from "vitest";
import { headId, type GitAction } from "../../engine/git";
import { buildTrees, hashBlob } from "../../engine/objects";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { objectCounts, scene, steps } from "./Scene";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const addAll: GitAction = { type: "add", paths: "." };

const solutions: Record<string, GitAction[]> = {
  twins: [write("notes.txt", "Merhaba"), addAll, { type: "commit", message: "Commit 2" }],
  reuse: [write("notes.txt", "Selam"), addAll, { type: "commit", message: "Commit 2" }],
  "same-tree": [write("README.md", "Selam"), addAll, { type: "commit", message: "Commit 2" }, write("README.md", "Merhaba"), addAll, { type: "commit", message: "Commit 3" }],
};

describe("objects", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the lesson's object counts are what the text says", () => {
    const at = (step: number) => objectCounts(scene.run.states[scene.stepEnd(step)]!);
    // git add writes the blob; commit adds one tree and one commit.
    expect(at(1)).toEqual({ blobs: 1, trees: 0, commits: 0 });
    expect(at(2)).toEqual({ blobs: 1, trees: 1, commits: 1 });
    // notes.txt has README's content: still one blob.
    expect(at(3).blobs).toBe(1);
    // Changing src/app.js: one new blob, a new src tree, a new root tree, a new commit.
    const before = scene.run.states[scene.stepStart(5)]!;
    const after = scene.run.states[scene.stepEnd(5)]!;
    expect(objectCounts(after).blobs - objectCounts(before).blobs).toBe(1);
    expect(objectCounts(after).trees - objectCounts(before).trees).toBe(2);
    const headFiles = after.commits[headId(after)!]!.files;
    expect(hashBlob(headFiles["README.md"]!)).toBe(hashBlob(before.commits[headId(before)!]!.files["README.md"]!));
    expect(buildTrees(headFiles).map((t) => t.entries.length)).toEqual([3, 1]);
  });

  it("blob id for \"Merhaba\" is the one real git prints", () => {
    // printf 'Merhaba\n' | git hash-object --stdin
    expect(hashBlob("Merhaba")).toBe("41979c4ebe928f5fe22a06edc6af95798b951285");
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
