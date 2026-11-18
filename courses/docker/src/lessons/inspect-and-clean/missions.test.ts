import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { dangling, images, inspect, ps, stats } from "./cli";
import { missions } from "./missions";
import { EXPECTED_ERRORS, prune, pruneAll, rmiNginx, rmWeb, scene, START, steps, stopWeb } from "./Scene";

const solutions: Record<string, DockerAction[]> = {
  "make-room": [pruneAll],
  "drop-nginx": [rmWeb, rmiNginx],
  "prune-trap": [stopWeb, prune],
};

describe("inspect-and-clean", () => {
  it("the starting machine: web up, hello and broken exited, one dangling image", () => {
    expect(findContainer(START, "web")!.state).toBe("running");
    expect(findContainer(START, "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(START, "broken")).toMatchObject({ state: "exited", exitCode: 1 });
    expect(dangling(START)).toHaveLength(1);
    expect(ps(START, false)).toHaveLength(2);
    expect(ps(START, true)).toHaveLength(4);
    expect(images(START).some((line) => line.startsWith("<none>"))).toBe(true);
    expect(inspect(findContainer(START, "web")!).join("\n")).toContain('"Status": "running"');
    expect(stats(START)).toHaveLength(2);
  });

  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: logs of an exited container, exec, rmi refused, prune keeps web and tagged images", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(findContainer(at(3), "broken")!.logs.at(-1)).toContain("disk full");
    expect(ev(4).find((e) => e.type === "execOutput")).toMatchObject({ output: ["root"] });
    const err = ev(6).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("is using its referenced image");
    expect(findContainer(at(7), "hello")).toBeUndefined();
    expect(findContainer(at(7), "web")!.state).toBe("running");
    const pruned = ev(8).find((e) => e.type === "pruned");
    expect(pruned && "containers" in pruned ? pruned.containers : []).toEqual(["broken"]);
    expect(findContainer(at(8), "web")!.state).toBe("running");
    expect(at(8).tags["acme/old:0.1"]).toBeDefined();
    expect(dangling(at(8))).toHaveLength(0);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
});
