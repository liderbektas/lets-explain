import { describe, expect, it } from "vitest";
import { latestRun, type CiAction } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { cacheResult, installTime, scene, steps, wf, type Mode } from "./Scene";

const set = (m: Mode): CiAction => ({ type: "setWorkflow", workflow: wf(m) });
const src: CiAction = { type: "push", message: "cart: add VAT" };
const dep: CiAction = { type: "push", lock: true, paths: ["package.json", "package-lock.json", "src/date.ts"], message: "add dayjs for dates" };

describe("caching", () => {
  it("the story: no cache, miss and save, hit, new key, the stale trap, the fix", () => {
    expect(steps).toHaveLength(9);
    const r = (s: number) => latestRun(scene.at(s));
    expect(scene.at(0).runs.map((x) => installTime(x))).toEqual([45, 45]);
    expect([cacheResult(r(1)), installTime(r(1))]).toEqual(["miss", 45]);
    expect([cacheResult(r(2)), installTime(r(2))]).toEqual(["hit", 12]);
    expect([cacheResult(r(3)), installTime(r(3)), r(3)!.status]).toEqual(["miss", 45, "success"]);
    expect([cacheResult(r(4)), installTime(r(4)), r(4)!.status]).toEqual(["miss", 45, "success"]);
    expect([cacheResult(r(5)), installTime(r(5)), r(5)!.status]).toEqual(["hit", "skipped", "failure"]);
    expect([cacheResult(r(6)), r(6)!.status]).toEqual(["miss", "success"]);
  });

  missionSuite(
    scene,
    missions,
    {
      warm: [set("npm"), src, src],
      "new-key": [set("npm"), src, dep],
      stale: [set("stale"), src, dep],
    },
    { it, expect },
  );
});
