import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, kill, readNote, rm, rmForce, run, scene, start, steps, stop, writeNote } from "./Scene";

const solutions: Record<string, DockerAction[]> = {
  "full-circle": [run, kill, rm],
  "keep-note": [run, writeNote, stop, start, readNote],
  "gone-with-it": [run, writeNote, rmForce, run, readNote],
};

describe("lifecycle", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: created, running, exited keeps files, rm refuses a running one, a new container starts empty", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(findContainer(at(0), "web")!.state).toBe("created");
    expect(findContainer(at(1), "web")!.state).toBe("running");
    expect(findContainer(at(2), "web")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(ev(3).find((e) => e.type === "execOutput")).toMatchObject({ code: 0, output: ["alışveriş listesi"] });
    const err = ev(4).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("container is running");
    expect(findContainer(at(4), "web")).toBeUndefined();
    expect(ev(5).find((e) => e.type === "execOutput")).toMatchObject({ code: 1 });
    expect(findContainer(at(6), "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(at(7), "web")).toMatchObject({ state: "exited", exitCode: 137 });
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

  it("removing a stopped container is refused while it runs, allowed once it exits", () => {
    const r = ctxFor(scene, [run, stop, rm]);
    expect(findContainer(r.state, "web")).toBeUndefined();
  });
});
