import { describe, expect, it } from "vitest";
import { latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { condWf, optsOf, pushBroken, pushFeature, pushFixed, pushLint, resolvedSummary, scene, steps, type Opts } from "./Scene";

const toggle = (k: "mainOnly" | "notify" | "softLint") => (w: World): CiAction => {
  const o = optsOf(w);
  const next: Opts = k === "notify" ? { ...o, notify: o.notify === "failure" ? "plain" : "failure" } : { ...o, [k]: !o[k] };
  return { type: "setWorkflow", workflow: condWf(next) };
};

describe("conditions-and-outputs", () => {
  it("the story: feature deploys, if: main stops it, notify is silent then speaks, outputs reach deploy, lint is tolerated", () => {
    expect(steps).toHaveLength(8);
    const w0 = scene.at(0);
    expect(w0.commits.find((c) => c.sha === w0.envs.staging!.sha)!.branch).toBe("feature");
    const w1 = scene.at(1);
    expect(w1.runs[1]!.jobs.find((j) => j.id === "deploy")!.status).toBe("skipped");
    expect(w1.envs.staging!.sha).toBe(w1.heads.main);
    const r2 = latestRun(scene.at(2))!;
    expect(r2.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "skipped"]);
    const r3 = latestRun(scene.at(3))!;
    expect(r3.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "success"]);
    expect(r3.summary).toEqual(["### Build finished"]);
    const r4 = latestRun(scene.at(4))!;
    expect(r4.status).toBe("success");
    expect(resolvedSummary(r4)).toContain(`Deployed sha-${r4.sha} to staging`);
    expect(r4.jobs.find((j) => j.id === "notify")!.status).toBe("skipped");
    const w5 = scene.at(5);
    const r5 = latestRun(w5)!;
    expect(r5.status).toBe("success");
    expect(r5.jobs[0]!.steps.find((s) => s.kind === "lint")!.allowed).toBe(true);
    expect(w5.envs.staging!.sha).toBe(r5.sha);
  });

  missionSuite(
    scene,
    missions,
    {
      "feature-safe": [toggle("mainOnly"), pushFeature, pushFixed],
      "hear-failure": [toggle("notify"), pushBroken],
      "soft-lint": [toggle("softLint"), pushLint],
    },
    { it, expect },
  );
});
