import { describe, expect, it } from "vitest";
import { commitOf, latestRun, SHAS, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { BUG_MSG, missions } from "./missions";
import { CI, CICD, scene, steps } from "./Scene";

const set = (w: typeof CI): CiAction => ({ type: "setWorkflow", workflow: w });
const bug: CiAction = { type: "push", add: ["test"], message: BUG_MSG };
const fix: CiAction = { type: "push", fix: ["test"] };

describe("why-ci-cd", () => {
  it("the story: unchecked commits, a late red run, CI catching its own commit, CD keeping staging clean", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs).toHaveLength(0);
    const late = latestRun(scene.at(1))!;
    expect(late.status).toBe("failure");
    expect(commitOf(scene.at(1), late.sha).message).not.toBe(BUG_MSG);
    expect(scene.at(2).runs.map((r) => r.status).slice(-2)).toEqual(["success", "failure"]);
    expect(latestRun(scene.at(2))!.jobs[0]!.failedStep).toBe("Run npm run lint");
    expect(latestRun(scene.at(3))!.status).toBe("success");
    expect(scene.at(4).envs.staging!.sha).toBe(scene.at(4).heads.main);
    const red = latestRun(scene.at(5))!;
    expect(red.jobs.map((j) => j.status)).toEqual(["failure", "skipped"]);
    expect(scene.at(5).envs.staging!.sha).toBe(scene.at(4).heads.main);
    expect(scene.sandboxStart.envs.staging!.sha).toBe(SHAS[0]);
  });

  missionSuite(
    scene,
    missions,
    {
      caught: [set(CI), bug],
      late: [bug, set(CI), { type: "push" }],
      "safe-staging": [set(CICD), bug, fix],
    },
    { it, expect },
  );
});
