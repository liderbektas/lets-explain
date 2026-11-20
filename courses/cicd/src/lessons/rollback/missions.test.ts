import { describe, expect, it } from "vitest";
import { SHAS } from "../../engine/ci";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { crashed, ROLLBACK, scene, steps } from "./Scene";

describe("rollback", () => {
  it("the story: a broken deploy, a redeploy of the previous image, then the fix", () => {
    expect(steps).toHaveLength(7);
    const prod = (step: number) => scene.at(step).envs.production!.sha;
    expect(prod(0)).toBe(SHAS[2]);
    expect(crashed(scene.at(0), prod(0))).toBe(true);
    expect(prod(1)).toBe(SHAS[1]);
    expect(scene.at(1).heads.main).toBe(SHAS[2]);
    expect(prod(2)).toBe(SHAS[3]);
    expect(crashed(scene.at(2), prod(2))).toBe(false);
  });

  missionSuite(
    scene,
    missions,
    {
      undo: [{ type: "push", add: ["crash"] }, ROLLBACK],
      "then-fix": [{ type: "push", add: ["crash"] }, ROLLBACK, { type: "push", fix: ["crash"] }],
    },
    { it, expect },
  );
});
