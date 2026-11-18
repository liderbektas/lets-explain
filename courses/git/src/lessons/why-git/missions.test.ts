import { describe, expect, it } from "vitest";
import type { GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

const solutions: Record<string, GitAction[]> = {
  "first-save": [write("rapor.md", "Giriş v2"), { type: "add", paths: ["rapor.md"] }, { type: "commit", message: "Sürüm 2" }],
  together: [write("notes.md", "not 1"), write("rapor.md", "Giriş v2"), { type: "add", paths: "." }, { type: "commit", message: "Sürüm 2" }],
  "time-travel": [
    write("rapor.md", "Giriş v2"),
    { type: "add", paths: ["rapor.md"] },
    { type: "commit", message: "Sürüm 2" },
    { type: "checkout", target: "HEAD~1" },
    { type: "switch", target: "main" },
  ],
};

describe("why-git", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(8);
  });

  it("looking back at the first draft keeps the later commits", () => {
    const atOld = scene.run.states[scene.stepEnd(4)]!;
    expect(atOld.head.kind).toBe("detached");
    expect(atOld.work["rapor.md"]).toBe("Giriş");
    expect(Object.keys(atOld.commits)).toHaveLength(3);
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
