import { describe, expect, it } from "vitest";
import { missionSuite } from "../shared/missionHelpers";
import { missions } from "./missions";
import { copies, nodeOf, WFS, type RwAction } from "./model";
import { scene, steps } from "./Scene";

const ranNodes = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().flatMap((e) => (e.type === "ran" ? [e.node] : []));

describe("reusable-workflows", () => {
  it("the story: three copies, one forgotten, a composite action, a one-line upgrade, a reusable job", () => {
    expect(steps).toHaveLength(8);
    expect(ranNodes(0)).toEqual([20, 20, 20]);
    expect(copies(scene.at(0))).toBe(3);
    expect(ranNodes(1)).toEqual([22, 22, 20]);
    expect(ranNodes(2)).toEqual([22, 22, 22]);
    expect(copies(scene.at(2))).toBe(1);
    const before = scene.at(2).edits;
    expect(ranNodes(3)).toEqual([24, 24, 24]);
    expect(scene.at(3).edits - before).toBe(1);
    const w4 = scene.at(4);
    expect(w4.calls).toEqual({ ci: true, release: true });
    expect(WFS.map((wf) => nodeOf(w4, wf))).toEqual([24, 24, 24]);
  });

  const n22 = (where: "ci" | "release" | "nightly" | "composite"): RwAction => ({ type: "setNode", where, node: 22 });
  missionSuite(
    scene,
    missions,
    {
      "node-22": [n22("ci"), n22("release"), n22("nightly"), { type: "run" }],
      "one-edit": [{ type: "createComposite" }, { type: "useComposite", place: "ci" }, { type: "useComposite", place: "release" }, { type: "useComposite", place: "nightly" }, n22("composite")],
      "shared-job": [{ type: "createReusable" }, { type: "callReusable", wf: "ci" }, { type: "callReusable", wf: "release" }],
    },
    { it, expect },
  );
});
