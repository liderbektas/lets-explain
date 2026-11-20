import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps, wf } from "./Scene";

const add = (...kinds: Parameters<typeof wf>[0]) => (w: World): CiAction => ({ type: "setWorkflow", workflow: wf([...(w.workflows[0]?.jobs[0]?.steps.map((s) => s.kind) ?? []), ...kinds]) });
const push: CiAction = { type: "push" };

describe("workflow-file", () => {
  it("the story: checkout only, then tests, then the two broken files, then the full file", () => {
    expect(steps).toHaveLength(7);
    const status = (step: number) => latestRun(scene.at(step))!.status;
    expect([0, 1, 2, 3, 4].map(status)).toEqual(["success", "success", "failure", "failure", "success"]);
    expect(latestRun(scene.at(2))!.jobs[0]!.failedStep).toBe("Run npm ci");
    expect(latestRun(scene.at(3))!.jobs[0]!.steps.find((s) => s.kind === "test")!.exit).toBe(127);
    expect(latestRun(scene.at(4))!.jobs[0]!.steps).toHaveLength(6);
  });

  missionSuite(
    scene,
    missions,
    {
      "no-node": [add("checkout"), add("install"), push],
      "first-green": [add("checkout"), add("setup-node"), add("install"), add("test"), push],
      "test-then-build": [add("checkout"), add("setup-node"), add("install"), add("test"), add("build"), push],
    },
    { it, expect },
  );
});
