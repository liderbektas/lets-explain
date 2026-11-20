import { describe, expect, it } from "vitest";
import { latestRun, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { add, PAGES, scene, steps } from "./Scene";

const push: CiAction = { type: "push" };

describe("your-pipeline", () => {
  it("the story: nothing runs, then build, then deploy, a PR that deploys, the if, a blocked merge, the merge", () => {
    expect(steps).toHaveLength(9);
    const at = (s: number) => scene.at(s);
    expect(at(0).runs).toHaveLength(0);
    expect(latestRun(at(1))!.status).toBe("success");
    expect(at(1).envs[PAGES]!.sha).toBeNull();
    expect(at(2).envs[PAGES]!.sha).toBe(at(2).heads.main);
    const prRun = latestRun(at(3))!;
    expect(prRun.event).toBe("pull_request");
    expect(at(3).envs[PAGES]!.sha).toBe(at(3).heads.feature);
    expect(latestRun(at(4))!.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
    expect(latestRun(at(5))!.jobs.map((j) => j.status)).toEqual(["failure", "skipped"]);
    expect(scene.run.events[scene.stepEnd(5) - 1]![0]).toMatchObject({ type: "mergeBlocked" });
    expect(at(5).prs[0]!.state).toBe("open");
    expect(at(6).prs[0]!.state).toBe("merged");
    expect(at(6).envs[PAGES]!.sha).toBe(at(6).heads.main);
  });

  missionSuite(
    scene,
    missions,
    {
      live: [add("upload"), push],
      "pr-safe": [add("onlyMain"), { type: "push", branch: "feature" }, { type: "openPr", branch: "feature" }],
      "tests-guard": [add("test"), { type: "push", add: ["test"] }],
    },
    { it, expect },
  );
});
