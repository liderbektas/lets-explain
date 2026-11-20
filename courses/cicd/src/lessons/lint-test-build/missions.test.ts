import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { orderOf, scene, steps, timeToError, toFront, wf } from "./Scene";

const front = (kind: "lint" | "typecheck") => (w: World): CiAction => ({ type: "setWorkflow", workflow: wf(toFront(orderOf(w), kind)) });
const push: CiAction = { type: "push", paths: [".github/workflows/ci.yml"], message: "ci: reorder checks" };
const fixLint: CiAction = { type: "push", fix: ["lint"], message: "fix: unused variable" };
const fixType: CiAction = { type: "push", fix: ["type"], message: "fix: price is a number" };

describe("lint-test-build", () => {
  it("the story: lint caught late, then early, then type, test and build errors one at a time", () => {
    expect(steps).toHaveLength(8);
    const failed = (s: number) => latestRun(scene.at(s))!.jobs[0]!.steps.find((x) => x.status === "failure")?.kind;
    expect([0, 1, 2, 3, 4].map(failed)).toEqual(["lint", "lint", "typecheck", "test", "build"]);
    expect(timeToError(scene.at(0))).toBe(53 + 70 + 15);
    expect(timeToError(scene.at(1))).toBe(53 + 15);
    expect(latestRun(scene.at(2))!.jobs[0]!.steps.find((x) => x.kind === "typecheck")!.exit).toBe(2);
    // with test and build both broken, only the test failure shows: build never ran
    expect(latestRun(scene.at(3))!.jobs[0]!.steps.find((x) => x.kind === "build")!.status).toBe("skipped");
    expect(latestRun(scene.at(5))!.status).toBe("success");
  });

  it("the sandbox starts with one red run that fails on typecheck after the tests", () => {
    expect(latestRun(scene.sandboxStart)!.jobs[0]!.failedStep).toBe("Run npx tsc --noEmit");
    expect(timeToError(scene.sandboxStart)).toBe(53 + 70 + 20);
  });

  missionSuite(
    scene,
    missions,
    {
      "fast-lint": [front("lint"), push],
      "right-order": [front("lint"), front("typecheck"), fixLint, fixType],
    },
    { it, expect },
  );
});
