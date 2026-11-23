import { describe, expect, it } from "vitest";
import type { Repo } from "../engine/git";
import { layoutGraph } from "./layout";

const scenes = import.meta.glob<{ scene?: { run: { states: Repo[] } } }>("../lessons/*/Scene.tsx", { eager: true });

describe("graph layout", () => {
  it("commits never move: once drawn, a commit keeps its lane through every lesson's story", () => {
    for (const [file, mod] of Object.entries(scenes)) {
      if (!mod.scene) continue;
      const lane = new Map<string, number>();
      mod.scene.run.states.forEach((repo, step) => {
        for (const [c, l] of layoutGraph(repo).laneOf) {
          if (lane.has(c)) expect(l, `${file} state ${step}: ${repo.commits[c]!.message}`).toBe(lane.get(c));
          lane.set(c, l);
        }
      });
    }
  });
});
