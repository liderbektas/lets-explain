import { describe, expect, it } from "vitest";
import { latestRun, SHAS, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { gate, scene, steps } from "./Scene";

const push: CiAction = { type: "push" };

describe("ci-vs-cd", () => {
  it("the story: CI only, delivery waits for approval, deployment goes all the way, a red commit goes nowhere", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).envs.staging!.sha).toBe(SHAS[0]);
    expect(latestRun(scene.at(0))!.status).toBe("success");
    expect(latestRun(scene.at(1))!.status).toBe("waiting");
    expect(scene.at(1).envs.staging!.sha).toBe(scene.at(1).heads.main);
    expect(scene.at(1).envs.production!.sha).toBe(SHAS[0]);
    expect(scene.at(2).envs.production!.sha).toBe(scene.at(2).heads.main);
    expect(scene.at(3).envs.production!.sha).toBe(scene.at(3).heads.main);
    expect(latestRun(scene.at(4))!.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "skipped"]);
    expect(scene.at(4).envs.production!.sha).toBe(scene.at(3).heads.main);
    expect(scene.at(5).envs.production!.sha).toBe(scene.at(5).heads.main);
    expect(scene.sandboxStart.envs.production!.approval).toBe(true);
  });

  missionSuite(
    scene,
    missions,
    {
      delivery: [push, { type: "approve" }],
      deployment: [gate(false), push],
      gate: [{ type: "push", add: ["test"] }, { type: "push", fix: ["test"] }, { type: "approve" }],
    },
    { it, expect },
  );
});
