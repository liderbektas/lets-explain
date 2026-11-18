import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, NOTE, scene, steps } from "./Scene";

const run = (name: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name });
const write: DockerAction = { type: "write", container: "box1", path: NOTE, content: "box1'in notu" };
const cat = (name: string): DockerAction => ({ type: "exec", container: name, cmd: `cat ${NOTE}` });

const solutions: Record<string, DockerAction[]> = {
  three: [run("box1"), run("box2"), run("box3")],
  "own-room": [run("box1"), write, run("box2"), cat("box2")],
  throwaway: [run("box1"), write, { type: "rm", container: "box1", force: true }, run("box1"), cat("box1")],
};

describe("why-containers", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: one pull for three containers, separate files, and a fresh container after rm", () => {
    const step4 = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat();
    expect(step4.filter((e) => e.type === "pulled")).toHaveLength(1);
    const at4 = scene.run.states[scene.stepEnd(4)]!;
    expect(["web-1", "web-2", "web-3"].every((n) => findContainer(at4, n)?.state === "running")).toBe(true);
    const step5 = scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat();
    expect(step5.find((e) => e.type === "execOutput")).toMatchObject({ name: "web-2", code: 1 });
    const step6 = scene.run.events.slice(scene.stepStart(6), scene.stepEnd(6)).flat();
    expect(step6.find((e) => e.type === "execOutput")).toMatchObject({ name: "web-1", code: 1 });
    expect(step6.some((e) => e.type === "pulled")).toBe(false);
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
