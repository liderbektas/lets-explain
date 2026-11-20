import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { e2eWf, hasGroup, hasTimeout, pushCode, pushTypoSkip, scene, steps } from "./Scene";

const toggle = (k: "concurrency" | "timeout") => (w: World): CiAction => ({
  type: "setWorkflow",
  workflow: e2eWf({ concurrency: k === "concurrency" ? !hasGroup(w) : hasGroup(w), timeout: k === "timeout" ? !hasTimeout(w) : hasTimeout(w) }),
});

describe("no-wasted-runs", () => {
  it("the story: 5 runs, then 4 cancelled, a 6-hour hang, a 15-minute cap, fail-fast, [skip ci]", () => {
    expect(steps).toHaveLength(8);
    const w0 = scene.at(0);
    expect(w0.runs.map((r) => r.status)).toEqual(Array(5).fill("success"));
    expect(w0.runs.reduce((m, r) => m + r.minutes, 0)).toBe(15);
    const second = scene.at(1).runs.slice(5);
    expect(second.map((r) => r.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled", "success"]);
    expect(second.reduce((m, r) => m + r.minutes, 0)).toBe(7);
    expect(latestRun(scene.at(2))!.minutes).toBe(363);
    const capped = latestRun(scene.at(3))!;
    expect(capped.jobs[1]!.reason).toBe("timeout");
    expect(capped.minutes).toBe(18);
    const w4 = scene.at(4);
    const [fast, slow] = w4.runs.slice(-2);
    expect(fast!.jobs.map((j) => j.status)).toEqual(["failure", "cancelled"]);
    expect(slow!.jobs.map((j) => j.status)).toEqual(["failure", "success"]);
    expect(scene.at(5).runs).toHaveLength(w4.runs.length);
    // Hours pass between scenes: nothing after step 1 is cancelled by a later scene.
    expect(scene.at(5).runs.slice(10).filter((r) => r.status === "cancelled")).toEqual([]);
  });

  missionSuite(
    scene,
    missions,
    {
      "only-last": [toggle("concurrency"), pushCode, pushCode, pushCode],
      "under-20": [toggle("timeout"), pushCode],
      typo: [pushTypoSkip, pushCode],
    },
    { it, expect },
  );
});
