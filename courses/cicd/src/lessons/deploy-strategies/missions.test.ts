import { describe, expect, it } from "vitest";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { advance, choose, rollback, scene, setBad, steps } from "./Scene";

describe("deploy-strategies", () => {
  it("the story: recreate goes down, rolling mixes, bad rolling hurts, blue-green switches, canary limits", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).round).toEqual({ v1: 100, v2: 0, failed: 0, down: false });
    expect(scene.at(1)).toMatchObject({ failed: 100, downRounds: 1 });
    expect(scene.at(1).round!.v2).toBe(100);
    const rolling = scene.run.states.slice(scene.stepStart(2) + 2, scene.stepEnd(2) + 1).map((s) => s.round!.v2);
    expect(rolling).toEqual([25, 50, 75, 100]);
    expect(scene.at(3)).toMatchObject({ failed: 125, rolledBack: true, downRounds: 0 });
    expect(scene.at(4)).toMatchObject({ failed: 0, downRounds: 0, live: "green", greenCheck: "ok" });
    expect(scene.at(4).round!.v2).toBe(100);
    expect(scene.at(5)).toMatchObject({ failed: 10, rolledBack: true });
  });

  missionSuite(
    scene,
    missions,
    {
      "zero-downtime": [choose("blue-green"), advance, advance],
      "nobody-hurt": [setBad(true), choose("blue-green"), advance, rollback],
      canary: [setBad(true), choose("canary"), advance, rollback],
    },
    { it, expect },
  );
});
