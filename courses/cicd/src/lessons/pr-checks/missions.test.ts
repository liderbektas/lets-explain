import { describe, expect, it } from "vitest";
import { blockingChecks, checksFor, latestRun, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const protect = (name: string): CiAction => ({ type: "setProtection", required: [name] });
const fix: CiAction = { type: "push", branch: "feature", fix: ["test"], message: "fix: VAT rounding" };
const merge: CiAction = { type: "merge", pr: 1 };

describe("pr-checks", () => {
  it("the story: red PR merges into unprotected main, then protection blocks one, then a renamed job leaves a check expected", () => {
    expect(steps).toHaveLength(8);
    expect(checksFor(scene.at(0), 1)).toEqual([{ name: "CI / ci", state: "failure", required: false }]);
    expect(scene.at(1).prs[0]!.state).toBe("merged");
    expect(latestRun(scene.at(1))!).toMatchObject({ branch: "main", status: "failure" });
    expect(scene.at(3).prs[1]!.state).toBe("open");
    expect(scene.run.events[scene.stepEnd(3) - 1]![0]).toMatchObject({ type: "mergeBlocked", checks: ["CI / ci"] });
    expect(scene.at(4).prs[1]!.state).toBe("merged");
    expect(latestRun(scene.at(4))!).toMatchObject({ branch: "main", status: "success" });
    expect(scene.at(5).prs[2]!.state).toBe("open");
    expect(blockingChecks(scene.at(5), 3)).toEqual(["CI / ci"]);
    expect(checksFor(scene.at(5), 3).find((c) => c.name === "CI / test")!.state).toBe("success");
  });

  missionSuite(
    scene,
    missions,
    {
      guard: [protect("CI / ci"), merge],
      "safe-merge": [protect("CI / ci"), fix, merge],
      "ghost-check": [protect("CI / test"), merge],
    },
    { it, expect },
  );
});
