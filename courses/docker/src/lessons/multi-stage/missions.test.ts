import { describe, expect, it } from "vitest";
import { apply, imageFor, imageSize, type DockerAction, type Host } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { DF, DISTROLESS, buildNow, scene, steps } from "./Scene";

function play(moves: (DockerAction | "build")[]): DockerAction[] {
  let h: Host = scene.sandboxStart;
  const out: DockerAction[] = [];
  for (const m of moves) {
    const a = m === "build" ? buildNow(h) : m;
    out.push(a);
    h = apply(h, a).state;
  }
  return out;
}
const shape = (content: string): DockerAction => ({ type: "editHost", path: DF, content });
const run: DockerAction = { type: "run", image: "shop", name: "app", detach: true };
const sh: DockerAction = { type: "exec", container: "app", cmd: "sh" };

const solutions: Record<string, DockerAction[]> = {
  "under-200": play([shape("multi|node:22"), shape("multi|node:22-alpine"), "build"]),
  "under-150": play([shape("multi|node:22"), shape(`multi|${DISTROLESS}`), "build"]),
  "no-shell": play([shape("multi|node:22"), shape(`multi|${DISTROLESS}`), "build", run, sh]),
};

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;
const size = (h: Host, tag: string) => imageSize(imageFor(h, tag)!);

describe("multi-stage", () => {
  it("every lesson step runs without an error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: one stage ships the tools; the final stage only carries dist/", () => {
    expect(size(at(0), "shop:single")).toBeGreaterThan(1300);
    const ls = scene.run.events.slice(scene.stepStart(1), scene.stepEnd(1)).flat().find((e) => e.type === "execOutput");
    expect(ls && "output" in ls ? ls.output : []).toEqual(expect.arrayContaining(["src", "node_modules", "dist"]));
    expect(size(at(2), "shop:slim")).toBeLessThan(260);
    expect(size(at(3), "shop:alpine")).toBeLessThan(200);
    expect(size(at(4), "shop:distroless")).toBeLessThan(150);
    const shell = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat().find((e) => e.type === "execOutput");
    expect(shell && "code" in shell ? shell.code : 0).toBe(127);
    // The distroless app still runs: node is its entrypoint.
    expect(at(4).containers[Object.keys(at(4).containers).find((k) => at(4).containers[k]!.name === "tiny")!]!.state).toBe("running");
    // --target build stops at the first stage: the tools are all there.
    expect(size(at(5), "shop:build")).toBeGreaterThan(1300);
    // The multi-stage builds reuse the build stage from the cache.
    expect(at(3).lastBuild!.steps.slice(0, 6).every((s) => s.cached)).toBe(true);
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
