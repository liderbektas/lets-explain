import { describe, expect, it } from "vitest";
import { latestRun, SHAS, type CiAction, type StepKind, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { addPre, addUpload, scene, steps } from "./Scene";

const pre = (k: StepKind) => (w: World): CiAction => addPre(w, k);
const push: CiAction = { type: "push" };

describe("fresh-runners", () => {
  it("the story: one job works, splitting loses dist/, checkout does not bring it back, rebuild or artifact fixes it", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).envs.staging!.sha).toBe(scene.at(0).heads.main);
    const lost = latestRun(scene.at(1))!;
    expect(lost.jobs.map((j) => j.status)).toEqual(["success", "failure"]);
    expect(lost.jobs[1]!.steps[0]!.log.join(" ")).toContain("dist/ not found");
    expect(latestRun(scene.at(2))!.jobs[1]!.status).toBe("failure");
    const rebuilt = latestRun(scene.at(3))!;
    const artifact = latestRun(scene.at(4))!;
    expect(rebuilt.status).toBe("success");
    expect(artifact.status).toBe("success");
    expect(artifact.end - artifact.start).toBeLessThan(rebuilt.end - rebuilt.start);
    expect(scene.at(4).envs.staging!.sha).toBe(scene.at(4).heads.main);
    expect(scene.sandboxStart.envs.staging!.sha).toBe(SHAS[0]);
  });

  missionSuite(
    scene,
    missions,
    {
      "no-code": [pre("install"), push],
      "hand-over": [addUpload, pre("download"), push],
      rebuild: [pre("checkout"), pre("setup-node"), pre("install"), pre("build"), push],
    },
    { it, expect },
  );
});
