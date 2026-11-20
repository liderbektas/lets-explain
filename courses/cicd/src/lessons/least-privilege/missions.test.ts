import { describe, expect, it } from "vitest";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { perms, pin, scene, steps } from "./Scene";

const lastRun = (step: number) => scene.at(step).runs.at(-1)!;

describe("least-privilege", () => {
  it("the story: clean, a moved tag tampers, pinning fixes it, read-all breaks publish, per-job contains bad code", () => {
    expect(steps).toHaveLength(7);
    expect(lastRun(0)).toMatchObject({ code: "good", attack: null, publish: "pushed" });
    expect(lastRun(1)).toMatchObject({ code: "bad", attack: { repo: true, registry: true } });
    expect(scene.at(1).tampered).toBe(true);
    expect(lastRun(2)).toMatchObject({ code: "good", publish: "pushed" });
    expect(scene.at(2).tampered).toBe(false);
    expect(lastRun(3).publish).toBe("denied");
    const w4 = scene.at(4);
    expect(w4.runs.at(-2)).toMatchObject({ code: "good", publish: "pushed", perms: "per-job" });
    expect(w4.runs.at(-1)).toMatchObject({ code: "bad", attack: { repo: false, registry: false }, publish: "pushed" });
    expect(w4.tampered).toBe(false);
  });

  missionSuite(
    scene,
    missions,
    {
      contain: [pin(true), { type: "push" }],
      "both-locks": [pin(true), perms("per-job"), { type: "push" }],
      "too-tight": [perms("read-all"), { type: "push" }],
    },
    { it, expect },
  );
});
