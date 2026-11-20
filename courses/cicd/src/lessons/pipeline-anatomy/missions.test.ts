import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps, toggleNeed } from "./Scene";

const need = (id: string) => (w: World): CiAction => toggleNeed(w, id);

describe("pipeline-anatomy", () => {
  it("the story: one job, three runs, parallel jobs, needs, a skipped build", () => {
    expect(steps).toHaveLength(9);
    expect(scene.at(1).runs).toHaveLength(3);
    const parallel = latestRun(scene.at(3))!;
    expect(parallel.jobs.map((j) => j.start - parallel.start)).toEqual([0, 0, 0]);
    const ordered = latestRun(scene.at(4))!;
    const build = ordered.jobs.find((j) => j.id === "build")!;
    expect(build.start).toBe(Math.max(...ordered.jobs.filter((j) => j.id !== "build").map((j) => j.end)));
    expect(latestRun(scene.at(5))!.jobs.map((j) => j.status)).toEqual(["failure", "success", "skipped"]);
    expect(latestRun(scene.at(6))!.status).toBe("success");
  });

  missionSuite(
    scene,
    missions,
    {
      "skip-build": [need("test"), { type: "push", add: ["test"] }],
      "wait-for-both": [need("lint"), need("test"), { type: "push" }],
    },
    { it, expect },
  );
});
