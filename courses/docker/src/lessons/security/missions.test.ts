import { describe, expect, it } from "vitest";
import { findContainer, imageFor, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { CONTEXT, DOCKERFILES, EXPECTED_ERRORS, scene, steps } from "./Scene";
import { hasSecret } from "./SecurityPanel";

const DEV = "acme/api:dev";
const build = (df: (typeof DOCKERFILES)[keyof typeof DOCKERFILES], ignore = [".env", ".git"]): DockerAction => ({ type: "build", tag: DEV, dockerfile: df, context: CONTEXT, ignore });
const rm: DockerAction = { type: "rm", container: "api", force: true };
const run: DockerAction = { type: "run", image: DEV, detach: true, name: "api", env: { API_KEY: "sk_live_51Hx_example" } };

const solutions: Record<string, DockerAction[]> = {
  "not-root": [build(DOCKERFILES.user), rm, run, { type: "exec", container: "api", cmd: "whoami" }],
  "no-secret": [build(DOCKERFILES.root), rm, run],
  "no-shell": [build(DOCKERFILES.distroless), rm, run, { type: "exec", container: "api", cmd: "sh" }],
};

describe("security", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: root by default, USER node, a leak that rm cannot undo, a clean image, no shell in distroless", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const execs = scene.run.events.flat().filter((e) => e.type === "execOutput");
    expect(execs[0]).toMatchObject({ name: "api-root", output: ["root"] });
    expect(execs[1]).toMatchObject({ name: "api-user", output: ["node"] });
    expect(hasSecret(imageFor(at(0), "acme/api:root"))).toBe(false);
    expect(hasSecret(imageFor(at(2), "acme/api:leaky"))).toBe(true);
    // Deleting the file in a later layer does not remove it from the earlier one.
    expect(hasSecret(imageFor(at(3), "acme/api:leaky2"))).toBe(true);
    expect(hasSecret(imageFor(at(4), "acme/api:clean"))).toBe(false);
    expect(findContainer(at(4), "api")!.env.API_KEY).toBeTruthy();
    const dl = imageFor(at(7), "acme/api:distroless")!;
    expect(dl.config.binaries).not.toContain("sh");
    expect(findContainer(at(7), "api-dl")).toMatchObject({ state: "running", user: "nonroot" });
    expect(execs.at(-1)).toMatchObject({ name: "api-dl", cmd: "sh", code: 127 });
  });

  it("the sandbox starts with the secret inside and api running as root", () => {
    const s = scene.sandboxStart;
    const api = findContainer(s, "api")!;
    expect(api.user).toBe("root");
    expect(hasSecret(s.images[api.image])).toBe(true);
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
