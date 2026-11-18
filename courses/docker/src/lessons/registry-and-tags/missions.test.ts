import { describe, expect, it } from "vitest";
import type { DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, LATEST, pull, push, release, rmi, scene, steps, tag, V1 } from "./Scene";

const solutions: Record<string, DockerAction[]> = {
  publish: [tag(V1), push(V1)],
  "surprise-latest": [tag(V1), release("node:22-alpine", "teammate build"), pull(LATEST)],
  untag: [tag(LATEST), rmi(LATEST)],
};

describe("registry-and-tags", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: a tag is a name, pushes skip known layers, latest moves, a pinned tag does not", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    const dev = at(0).tags["shop:dev"]!;
    // 1: tagging adds a name for the same image id.
    expect(at(1).tags[V1]).toBe(dev);
    // 2: the registry now holds it.
    expect(at(2).registry.tags[V1]).toBe(dev);
    // 3: the second push uploads no layers.
    const pushes = ev(3).filter((e) => e.type === "pushed");
    expect(pushes[0] && "skipped" in pushes[0] ? pushes[0].skipped : -1).toBe(pushes[0] && "layers" in pushes[0] ? pushes[0].layers : -2);
    // 4: someone moved :latest; pulling it gives a different image than 1.0.0.
    expect(at(4).tags[LATEST]).not.toBe(at(4).tags[V1]);
    // 5: the pinned tag still gives the same image as before.
    expect(at(5).tags[V1]).toBe(dev);
    // 6: removing one of several names only untags.
    expect(ev(6).find((e) => e.type === "imageRemoved")).toMatchObject({ untaggedOnly: true });
    expect(at(6).images[dev]).toBeDefined();
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
