import { describe, expect, it } from "vitest";
import { latestRun, SHAS, type CiAction, type World } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { byHand, gate, scene, steps } from "./Scene";

const push: CiAction = { type: "push" };
const approve: CiAction = { type: "approve" };
const prevSha = (w: World) => w.commits[w.commits.length - 2]!.sha;

describe("environments", () => {
  it("the story: straight to prod, then a gate, a stopped bad version, a fix and a deploy by hand", () => {
    expect(steps).toHaveLength(8);
    const env = (step: number, name: string) => scene.at(step).envs[name]!.sha;
    expect(["dev", "staging", "production"].map((e) => env(0, e))).toEqual([SHAS[1], SHAS[1], SHAS[1]]);
    expect(latestRun(scene.at(1))!.status).toBe("waiting");
    expect(env(1, "staging")).toBe(SHAS[2]);
    expect(env(1, "production")).toBe(SHAS[1]);
    expect(env(2, "production")).toBe(SHAS[2]);
    expect(env(3, "staging")).toBe(SHAS[3]);
    expect(env(3, "production")).toBe(SHAS[2]);
    expect(env(4, "production")).toBe(SHAS[4]);
    expect(scene.at(4).runs.filter((r) => r.status === "waiting")).toHaveLength(1);
    expect(env(5, "staging")).toBe(SHAS[2]);
    expect(env(5, "production")).toBe(SHAS[4]);
  });

  missionSuite(
    scene,
    missions,
    {
      gate: [gate(true), push, approve],
      "stop-bad": [gate(true), { type: "push", add: ["crash"] }],
      "by-hand": [push, (w) => byHand(prevSha(w))],
    },
    { it, expect },
  );
});
