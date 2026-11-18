import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const web = (ports?: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "web", ...(ports ? { ports } : {}) });
const curl: DockerAction = { type: "curl", port: 8080 };

const solutions: Record<string, DockerAction[]> = {
  "open-it": [web(["8080:80"]), curl],
  "forgot-port": [web(), { type: "rm", container: "web", force: true }, web(["8080:80"]), curl],
  "missing-setting": [
    { type: "run", image: "acme/api:1.0", detach: true, name: "api" },
    { type: "rm", container: "api", force: true },
    { type: "run", image: "acme/api:1.0", detach: true, name: "api", env: { DATABASE_URL: "postgres://db/shop" } },
  ],
};

describe("run-flags", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: hello exits 0, no port means no answer, -p answers, the name clash, the env var", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(0), "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(at(1), "web")!.state).toBe("running");
    const curls = scene.run.events.flat().filter((e) => e.type === "curlResult");
    expect(curls[0]).toMatchObject({ port: 80, ok: false });
    expect(curls[1]).toMatchObject({ port: 8080, ok: true });
    const err = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat().find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("is already in use");
    expect(scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat().some((e) => e.type === "exited" && e.code === 1)).toBe(true);
    expect(findContainer(at(5), "api")!.state).toBe("running");
    expect(findContainer(at(6), "once")).toBeUndefined();
    expect(at(7).volumes.site!.files["index.html"]).toBe("Merhaba!");
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
