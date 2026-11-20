import { describe, expect, it } from "vitest";
import { latestRun, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { errorLine, scene, steps } from "./Scene";

const rerun: CiAction = { type: "rerun" };
const fixTest: CiAction = { type: "push", fix: ["test"], message: "fix: VAT rounding" };
const fixFlaky: CiAction = { type: "push", fix: ["flaky"], message: "test: wait for the order" };

describe("reading-failures", () => {
  it("the story: a real bug, a flaky test that passes on re-run, a real bug that does not", () => {
    expect(steps).toHaveLength(9);
    expect(errorLine(latestRun(scene.at(0)))).toBe("AssertionError: expected 118 to be 120");
    expect(latestRun(scene.at(2))!.status).toBe("success");
    expect(errorLine(latestRun(scene.at(3)))).toBe("Error: Test timed out in 5000ms.");
    expect(latestRun(scene.at(4))!).toMatchObject({ status: "success", attempt: 2 });
    const s5 = scene.at(5).runs.slice(-2);
    expect(s5.map((r) => [r.attempt, r.status])).toEqual([
      [1, "failure"],
      [2, "failure"],
    ]);
    expect(errorLine(s5[1])).toBe("AssertionError: expected 118 to be 120");
    expect(latestRun(scene.at(6))!.status).toBe("success");
  });

  it("the sandbox's red run shows the real bug, not the flaky test behind it", () => {
    expect(errorLine(latestRun(scene.sandboxStart))).toBe("AssertionError: expected 118 to be 120");
  });

  missionSuite(
    scene,
    missions,
    {
      green: [fixTest, rerun],
      clean: [fixTest, fixFlaky],
      prove: [rerun, fixTest, rerun],
    },
    { it, expect },
  );
});
