import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, GitAction[]> = {
  "only-app": [write("README.md", "Merhaba v2"), write("app.js", "v2"), { type: "add", paths: ["app.js"] }, { type: "commit", message: "Changes" }],
  "change-mind": [write("app.js", "v2"), { type: "add", paths: ["app.js"] }, { type: "unstage", path: "app.js" }, { type: "restore", path: "app.js" }],
  together: [write("notes.txt", "not 1"), write("README.md", "Merhaba v2"), { type: "add", paths: "." }, { type: "commit", message: "Changes" }],
};

describe("three-areas", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      // Each move must be one the sandbox offers at that point.
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
