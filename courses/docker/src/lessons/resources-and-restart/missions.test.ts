import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { scene, steps } from "./Scene";

const api = (memory: number): DockerAction => ({ type: "run", image: "acme/api:2.0", detach: true, name: "api", memory });
const tick: DockerAction = { type: "tick" };

const solutions: Record<string, DockerAction[]> = {
  "big-request": [api(512), { type: "load", container: "api", memory: 300 }],
  "oom-then-fix": [api(64), { type: "rm", container: "api", force: true }, api(512)],
  "self-heal": [{ type: "run", image: "acme/flaky:1.0", detach: true, name: "flaky", restart: "on-failure" }, tick, tick],
};

describe("resources-and-restart", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: limits, OOM at start and under load, CPU limit, restart policies", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(0), "api")).toMatchObject({ state: "running", memoryLimit: undefined });
    expect(findContainer(at(1), "api-lim")).toMatchObject({ state: "running", memoryLimit: 256 });
    expect(findContainer(at(2), "api-small")).toMatchObject({ exitCode: 137, oomKilled: true });
    expect(findContainer(at(3), "api-lim")).toMatchObject({ exitCode: 137, oomKilled: true });
    expect(findContainer(at(4), "api-cpu")).toMatchObject({ state: "running", cpus: 0.5 });
    // No policy: a crash stays a crash.
    expect(findContainer(at(5), "flaky")).toMatchObject({ state: "exited", exitCode: 1, restarts: 0 });
    // on-failure: retries the failing one, leaves the successful one alone.
    expect(findContainer(at(6), "flaky2")!.restarts).toBe(3);
    expect(findContainer(at(6), "backup")).toMatchObject({ exitCode: 0, restarts: 0 });
    // A daemon restart brings back `always` even after a manual stop, not `unless-stopped`.
    expect(findContainer(at(7), "web-a")!.state).toBe("running");
    expect(findContainer(at(7), "web-b")!.state).toBe("exited");
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
