import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const web: DockerAction = { type: "run", image: "nginx:1.27", detach: true, name: "web" };

const solutions: Record<string, DockerAction[]> = {
  "no-pull": [web, { type: "run", image: "redis:7", detach: true, name: "cache" }],
  survivor: [{ ...web, restart: "unless-stopped" } as DockerAction, { type: "daemonRestart" }],
  "bring-back": [web, { type: "daemonRestart" }, { type: "start", container: "web" }],
};

describe("architecture", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: the daemon pulls on run, refuses unknown images, and a daemon restart stops containers without a policy", () => {
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(ev(2).some((e) => e.type === "pulled")).toBe(true);
    expect(ev(3).some((e) => e.type === "pulled")).toBe(false);
    expect(ev(4).some((e) => e.type === "pulled" && e.ref === "redis:7")).toBe(true);
    const err = ev(5).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("pull access denied");
    expect(ev(6).some((e) => e.type === "pulled" && e.ref.startsWith("gcr.io/"))).toBe(true);
    const at7 = scene.run.states[scene.stepEnd(7)]!;
    expect(findContainer(at7, "web")!.state).toBe("exited");
    expect(findContainer(at7, "cache")!.state).toBe("exited");
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
