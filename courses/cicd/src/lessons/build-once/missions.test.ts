import { describe, expect, it } from "vitest";
import { SHAS, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { crashed, promote, rebuild, scene, steps } from "./Scene";

const push: CiAction = { type: "push" };
const pushBug: CiAction = { type: "push", add: ["crash"] };
const newest = (w: World) => w.registry[Object.keys(w.registry).at(-1)!]!;

describe("build-once", () => {
  it("the story: a rebuild ships the untested commit; build once ships the tested image", () => {
    expect(steps).toHaveLength(7);
    const env = (step: number, name: string) => scene.at(step).envs[name]!.sha;
    expect(env(0, "staging")).toBe(SHAS[1]);
    expect(env(1, "production")).toBe(SHAS[2]);
    expect(crashed(scene.at(1), SHAS[2]!)).toBe(true);
    expect(Object.keys(scene.at(2).registry)).toEqual([`sha-${SHAS[3]}`]);
    expect(env(2, "staging")).toBe(SHAS[3]);
    expect(Object.keys(scene.at(3).registry)).toHaveLength(2);
    expect(env(3, "staging")).toBe(SHAS[3]);
    expect(scene.at(4).heads.main).toBe(SHAS[4]);
    expect(env(4, "production")).toBe(SHAS[3]);
    expect(scene.run.states.at(-1)!.runs.every((r) => r.status === "success")).toBe(true);
  });

  missionSuite(
    scene,
    missions,
    {
      "tested-to-prod": [push, (w) => promote("staging", newest(w)), (w) => promote("production", w.envs.staging!.sha!)],
      untested: [push, rebuild("production")],
      "main-moved": [push, (w) => promote("staging", newest(w)), pushBug, (w) => promote("production", w.envs.staging!.sha!)],
    },
    { it, expect },
  );
});
