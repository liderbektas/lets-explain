import { describe, expect, it } from "vitest";
import { latestRun, SHAS, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { crashed, scene, steps, toggle } from "./Scene";

const pushBug: CiAction = { type: "push", add: ["crash"] };

describe("after-deploy", () => {
  it("the story: green but broken, a smoke test that catches it, then an automatic rollback", () => {
    expect(steps).toHaveLength(7);
    const at = (s: number) => scene.at(s);
    expect(latestRun(at(0))!.status).toBe("success");
    expect(crashed(at(0), at(0).envs.staging!.sha)).toBe(true);
    expect(latestRun(at(1))!.status).toBe("success");
    expect(at(1).envs.staging!.sha).toBe(SHAS[3]);
    expect(latestRun(at(2))!.status).toBe("failure");
    expect(at(2).envs.staging!.sha).toBe(SHAS[4]);
    const last = latestRun(at(3))!;
    expect(last.status).toBe("failure");
    expect(last.jobs[1]!.steps.map((s) => s.status)).toEqual(["success", "success", "failure", "success", "success"]);
    expect(at(3).envs.staging!.sha).toBe(SHAS[3]);
  });

  missionSuite(
    scene,
    missions,
    {
      catch: [toggle("smoke"), pushBug],
      "self-heal": [toggle("smoke"), toggle("rollback"), pushBug],
      "tell-team": [toggle("smoke"), toggle("rollback"), toggle("notify"), pushBug],
    },
    { it, expect },
  );
});
