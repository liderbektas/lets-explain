import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { layoutOf, layoutWf, scene, steps, type Layout } from "./Scene";

const flip = (k: keyof Layout) => (w: World): CiAction => {
  const o = layoutOf(w);
  return { type: "setWorkflow", workflow: layoutWf({ ...o, [k]: !o[k] }) };
};
const push: CiAction = { type: "push", paths: [".github/workflows/ci.yml"], message: "ci: change jobs" };

describe("parallel-and-matrix", () => {
  it("the story: one long job, then parallel jobs, needs, matrix and fail-fast", () => {
    expect(steps).toHaveLength(7);
    const run = (s: number) => latestRun(scene.at(s))!;
    expect(run(0).end - run(0).start).toBe(343);
    expect(run(0).minutes).toBe(6);
    expect(run(1).end - run(1).start).toBe(211);
    expect(run(1).minutes).toBe(11);
    expect(run(2).jobs.map((j) => [j.id, j.status])).toEqual([
      ["lint", "success"],
      ["test", "failure"],
      ["e2e", "success"],
      ["build", "skipped"],
    ]);
    expect(run(3).jobs.map((j) => [j.label, j.status])).toEqual([
      ["lint", "success"],
      ["test (20)", "failure"],
      ["test (22)", "success"],
      ["e2e", "success"],
      ["build", "skipped"],
    ]);
    expect(run(4).jobs.map((j) => [j.label, j.status, j.reason])).toEqual([
      ["lint", "success", undefined],
      ["test (20)", "failure", undefined],
      ["test (22)", "cancelled", "fail-fast"],
      ["build", "skipped", "needs"],
    ]);
  });

  it("the sandbox starts with one long job of 5m 43s", () => {
    const r = latestRun(scene.sandboxStart)!;
    expect(r.end - r.start).toBe(343);
  });

  missionSuite(
    scene,
    missions,
    {
      fast: [flip("e2e"), push],
      "two-nodes": [flip("test"), flip("matrix"), push],
      "fast-and-wide": [flip("e2e"), flip("test"), flip("matrix"), push],
    },
    { it, expect },
  );
});
