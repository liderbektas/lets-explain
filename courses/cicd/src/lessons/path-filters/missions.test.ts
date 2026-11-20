import { describe, expect, it } from "vitest";
import { blockingChecks, checksFor, latestRun, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { hasPaths, hasSkip, merge, prWorkflow, pushDocs, pushSrc, REQUIRED, scene, steps } from "./Scene";

const toggle = (which: "paths" | "skip") => (w: World): CiAction => ({
  type: "setWorkflow",
  workflow: prWorkflow(which === "paths" ? !hasPaths(w) : hasPaths(w), which === "skip" ? !hasSkip(w) : hasSkip(w)),
});

describe("path-filters", () => {
  it("the story: README skips, mixed runs, monorepo skips api, the trap blocks, the fix merges", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs).toHaveLength(1);
    const s1 = scene.run.events.slice(scene.stepStart(1), scene.stepEnd(1)).flat();
    expect(s1.filter((e) => e.type === "notTriggered")).toHaveLength(1);
    expect(scene.at(1).runs).toHaveLength(2);
    expect(scene.at(2).runs).toHaveLength(3);
    expect(latestRun(scene.at(3))!.jobs.map((j) => j.status)).toEqual(["success", "success", "skipped"]);
    const trap = scene.at(4);
    expect(checksFor(trap, 1)).toEqual([{ name: REQUIRED, state: "expected", required: true }]);
    expect(trap.prs[0]!.state).toBe("open");
    const fixed = scene.at(5);
    expect(fixed.prs[0]!.state).toBe("merged");
    expect(fixed.runs.find((r) => r.pr === 1)!.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
  });

  it("the sandbox starts blocked", () => {
    expect(blockingChecks(scene.sandboxStart, 1)).toEqual([REQUIRED]);
  });

  missionSuite(
    scene,
    missions,
    {
      unblock: [toggle("skip"), toggle("paths"), pushDocs("docs/faq.md"), merge],
      "both-ways": [toggle("skip"), toggle("paths"), pushDocs("docs/faq.md"), pushSrc, merge],
    },
    { it, expect },
  );
});
