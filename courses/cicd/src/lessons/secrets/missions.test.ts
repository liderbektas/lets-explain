import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { addToken, pushFork, pushMain, pushOnly, relWf, scene, steps } from "./Scene";

const toggle = (w: World): CiAction => ({ type: "setWorkflow", workflow: relWf(!pushOnly(w)) });
const publishStep = (w: World) => latestRun(w)!.jobs.find((j) => j.id === "publish")!;

describe("secrets", () => {
  it("the story: no secret fails, the secret publishes and is masked, the fork gets nothing, push-only fixes the fork", () => {
    expect(steps).toHaveLength(7);
    expect(publishStep(scene.at(1)).failedStep).toBe("Run npm publish");
    const ok = publishStep(scene.at(2));
    expect(ok.status).toBe("success");
    expect(ok.steps.find((s) => s.kind === "print-secret")!.log).toEqual(["token: ***"]);
    expect(ok.steps.flatMap((s) => s.log).join("\n")).not.toContain("npm_8f2k");
    const fork = latestRun(scene.at(3))!;
    expect(fork.fork).toBe(true);
    expect(fork.jobs.find((j) => j.id === "publish")!.failedStep).toBe("Run npm publish");
    const fixed = latestRun(scene.at(4))!;
    expect(fixed.status).toBe("success");
    expect(fixed.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
  });

  missionSuite(
    scene,
    missions,
    {
      release: [addToken, pushMain],
      "fork-green": [toggle, addToken, pushFork, pushMain],
    },
    { it, expect },
  );
});
