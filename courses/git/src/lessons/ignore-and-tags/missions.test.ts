import { describe, expect, it } from "vitest";
import { status, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { IGNORE, scene, steps } from "./Scene";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "clean-commit": [write(".gitignore", IGNORE), { type: "add", paths: "." }, { type: "commit", message: "Changes" }],
  "untrack-log": [write(".gitignore", IGNORE), { type: "rmCached", path: "debug.log" }, { type: "add", paths: "." }, { type: "commit", message: "Changes" }],
  "release-tag": [{ type: "tag", name: "v1.0" }, write("app.js", "v2"), { type: "add", paths: ["app.js"] }, { type: "commit", message: "Changes" }],
};

describe("ignore-and-tags", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the story matches the text: add . takes only .gitignore, a tracked log stays tracked", () => {
    const afterAdd = scene.run.states[scene.stepStart(2) + 1]!;
    expect(status(afterAdd).staged.map((c) => c.path)).toEqual([".gitignore"]);
    expect(status(afterAdd).ignored).toEqual([".env", "app.log", "node_modules/lib.js"]);
    const edited = scene.run.states[scene.stepEnd(3)]!;
    expect(status(edited).unstaged.map((c) => c.path)).toEqual(["debug.log"]);
    const untracked = scene.run.states[scene.stepEnd(4)]!;
    expect(status(untracked).ignored).toContain("debug.log");
    expect(untracked.work["debug.log"]).toBe("log 2");
  });

  it("the tag stays on the old commit after a new one", () => {
    const tagged = scene.run.states[scene.stepEnd(6)]!;
    const end = scene.run.states[scene.stepEnd(7)]!;
    expect(end.tags["v1.0"]).toBe(tagged.tags["v1.0"]);
    expect(end.branches.main).not.toBe(end.tags["v1.0"]);
  });

  it("an explicit add of an ignored file is refused", () => {
    const r = ctxFor(scene, [write(".gitignore", IGNORE), { type: "add", paths: ["app.log"] }]);
    expect(r.events[1]![0]).toMatchObject({ type: "error", code: "ignored" });
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
