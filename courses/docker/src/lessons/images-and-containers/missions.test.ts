import { describe, expect, it } from "vitest";
import { findContainer, imageFor, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const web: DockerAction = { type: "run", image: "nginx:1.27", detach: true, name: "web", ports: ["8080:80"] };
const rmWeb: DockerAction = { type: "rm", container: "web", force: true };

const solutions: Record<string, DockerAction[]> = {
  "keep-image": [web, { type: "curl", port: 8080 }, rmWeb],
  clean: [web, rmWeb, { type: "rmi", ref: "nginx:1.27" }],
  rename: [{ type: "pull", ref: "nginx:1.27" }, { type: "tag", source: "nginx:1.27", target: "mysite:1.0" }, { type: "rmi", ref: "nginx:1.27" }],
};

describe("images-and-containers", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: pull adds an image and no container; containers keep their own changes; tags and builds", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(Object.keys(at(0).images)).toHaveLength(1);
    expect(Object.keys(at(0).containers)).toHaveLength(0);
    expect(imageFor(at(2), "nginx:1.27")).toBeDefined();
    const curls = scene.run.events.slice(scene.stepStart(3), scene.stepEnd(3)).flat().filter((e) => e.type === "curlResult");
    expect(curls[0]).toMatchObject({ port: 8080, body: "web1 değişti" });
    expect(curls[1]).toMatchObject({ port: 8081, ok: true });
    expect(curls[1] && "body" in curls[1] ? curls[1].body : "").not.toBe("web1 değişti");
    // The refused rmi left the image in place.
    expect(imageFor(at(5), "nginx:1.27")).toBeDefined();
    // Removing one of two tags only untags.
    expect(at(6).tags["mysite:base"]).toBeUndefined();
    expect(imageFor(at(6), "nginx:1.27")).toBeDefined();
    const built = imageFor(at(7), "mysite:1.0")!;
    expect(built.layers).toHaveLength(2);
    expect(findContainer(at(7), "site")!.state).toBe("running");
    const siteCurl = scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().find((e) => e.type === "curlResult");
    expect(siteCurl).toMatchObject({ port: 8082, body: "Benim sitem" });
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
