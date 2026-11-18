import { describe, expect, it } from "vitest";
import { firstParents, headId, resolve, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";
import { cardLines, gitDate } from "./CommitCard";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const addAll: GitAction = { type: "add", paths: "." };
const amend: GitAction = { type: "commit", amend: true };

const solutions: Record<string, GitAction[]> = {
  order: [write("README.md", "Merhaba v2"), addAll, { type: "commit", message: "Commit 3" }, write("app.js", "v3"), addAll, { type: "commit", message: "Commit 4" }],
  forgot: [write("README.md", "Merhaba v2"), addAll, amend],
  later: [write("README.md", "Merhaba v2"), addAll, { type: "commit", message: "Commit 3" }, write("app.js", "v3"), addAll, amend],
};

describe("commits-and-history", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(8);
  });

  it("HEAD~2 is the commit the lesson says it is", () => {
    const s = scene.run.states[scene.stepEnd(3)]!;
    expect(s.commits[resolve(s, "HEAD~2")!]!.message).toBe("app.js eklendi");
  });

  it("amend gives a new id and keeps the history length", () => {
    const before = scene.run.states[scene.stepStart(4)]!;
    const after = scene.run.states[scene.stepEnd(4)]!;
    expect(headId(after)).not.toBe(headId(before));
    expect(firstParents(after, headId(after))).toHaveLength(firstParents(before, headId(before)).length);
  });

  it("the terminal card follows git's own format", () => {
    expect(gitDate(1700000000)).toBe("Tue Nov 14 22:13:20 2023 +0000");
    const lines = cardLines(scene.run.states[scene.stepEnd(1)]!, { kind: "show", rev: "HEAD" }).map((x) => x.text);
    expect(lines[1]).toBe("commit (HEAD -> main)");
    expect(lines).toContain(" app.js | 1 +");
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
