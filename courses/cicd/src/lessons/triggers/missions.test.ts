import { describe, expect, it } from "vitest";
import type { CiAction, World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps, toggle, type On } from "./Scene";

const flip = (key: keyof On) => (w: World): CiAction => toggle(w, key);

describe("triggers", () => {
  it("the story: every push, main only, PR runs, schedule, dispatch, docs ignored", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs.map((r) => r.branch)).toEqual(["main", "feature"]);
    expect(scene.at(1).runs).toHaveLength(2);
    const events = scene.run.events.flat();
    expect(events.filter((e) => e.type === "notTriggered").map((e) => (e as { reason: string }).reason)).toEqual(["branch", "branch", "paths"]);
    expect(scene.at(2).runs.slice(2).map((r) => r.event)).toEqual(["pull_request", "pull_request"]);
    expect(scene.at(3).runs.at(-1)!.event).toBe("schedule");
    expect(scene.at(4).runs.at(-1)!.event).toBe("dispatch");
    expect(scene.at(5).runs).toHaveLength(scene.at(4).runs.length);
  });

  missionSuite(
    scene,
    missions,
    {
      "main-only": [flip("mainOnly"), { type: "push", branch: "feature" }, { type: "push" }],
      "pr-only": [flip("mainOnly"), flip("pr"), { type: "push", branch: "feature" }, { type: "openPr", branch: "feature" }],
      "by-hand": [flip("dispatch"), { type: "dispatch", workflow: "CI" }],
    },
    { it, expect },
  );
});
