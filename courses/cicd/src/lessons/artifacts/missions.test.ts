import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { flagsOf, scene, steps, wf, type Flags } from "./Scene";

const flip = (k: keyof Flags) => (w: World): CiAction => {
  const f = flagsOf(w);
  return { type: "setWorkflow", workflow: wf({ ...f, [k]: !f[k] }) };
};
const push: CiAction = { type: "push", message: "cart: add VAT" };

describe("artifacts", () => {
  it("the story: dist/ missing, passed as an artifact, never uploaded, shared by two jobs, not visible to another run", () => {
    expect(steps).toHaveLength(7);
    const r = (s: number) => latestRun(scene.at(s))!;
    expect(r(0).jobs[1]!.failedStep).toBe("Run ./deploy.sh staging");
    expect(r(1).status).toBe("success");
    expect(scene.at(1).envs.staging!.sha).toBe(r(1).sha);
    expect(r(2).jobs[1]!.steps[0]!.log[0]).toContain("Artifact not found for name: dist");
    expect(r(3).jobs.map((j) => [j.id, j.status])).toEqual([
      ["build", "success"],
      ["e2e", "success"],
      ["deploy", "success"],
    ]);
    expect(r(4)).toMatchObject({ workflow: "Redeploy", status: "failure" });
    expect(scene.at(4).envs.staging!.sha).toBe(r(3).sha);
  });

  missionSuite(
    scene,
    missions,
    {
      ship: [flip("rebuild"), push],
      "build-once": [flip("upload"), flip("download"), push],
      missing: [flip("download"), push],
    },
    { it, expect },
  );
});
