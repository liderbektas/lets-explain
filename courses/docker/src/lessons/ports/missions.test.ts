import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const web = (ports: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "web", ports: [ports] });
const curl = (port: number): DockerAction => ({ type: "curl", port });

const solutions: Record<string, DockerAction[]> = {
  "side-by-side": [web("8081:80"), curl(8081)],
  "make-room": [{ type: "rm", container: "old", force: true }, web("8080:80"), curl(8080)],
  "wrong-door": [web("8081:8080"), curl(8081), { type: "rm", container: "web", force: true }, web("8081:80"), curl(8081)],
};

describe("ports", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: mapping works, a wrong container port resets, a taken host port is refused, a random port works", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(evs(0).find((e) => e.type === "curlResult")).toMatchObject({ port: 8080, ok: true });
    const reset = evs(1).find((e) => e.type === "curlResult");
    expect(reset).toMatchObject({ port: 8081, ok: false });
    expect(reset && "body" in reset ? reset.body : "").toContain("reset");
    expect(evs(2).find((e) => e.type === "curlResult")).toMatchObject({ port: 8081, ok: true });
    const err = evs(3).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("port is already allocated");
    // The container exists but never started.
    expect(findContainer(at(3), "web3")!.state).toBe("created");
    expect(findContainer(at(4), "web3")!.ports).toEqual([{ host: 32768, container: 80 }]);
    expect(evs(4).find((e) => e.type === "curlResult")).toMatchObject({ port: 32768, ok: true });
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
