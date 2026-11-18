import { describe, expect, it } from "vitest";
import { apply, imageFor, imageSize, type DockerAction, type Host } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { ROOT, buildFromFolder, scene, steps } from "./Scene";

/** Replays edits and builds the way the buttons make them, each build reading the folder at that point. */
function play(moves: (DockerAction | "build")[]): DockerAction[] {
  let h: Host = scene.sandboxStart;
  const out: DockerAction[] = [];
  for (const m of moves) {
    const a = m === "build" ? buildFromFolder(h) : m;
    out.push(a);
    h = apply(h, a).state;
  }
  return out;
}
const edit = (path: string, content: string): DockerAction => ({ type: "editHost", path: `${ROOT}/${path}`, content });

const solutions: Record<string, DockerAction[]> = {
  "fast-rebuild": play([edit("Dockerfile", "smart"), "build", edit("server.js", "v2"), "build"]),
  "small-image": play([edit(".dockerignore", "node_modules\n.git"), "build"]),
  "git-safe": play([edit(".dockerignore", "node_modules\n.git"), "build", edit(".git/HEAD", "commit-2"), "build"]),
};

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;

describe("layers-and-cache", () => {
  it("every lesson step builds without an error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    expect(at(0).lastBuild!.seconds).toBeGreaterThanOrEqual(30);
    expect(at(1).lastBuild!.seconds).toBe(0);
    // Naive order: a code change re-runs npm ci.
    const naive = at(2).lastBuild!;
    expect(naive.steps.find((s) => s.text === "RUN npm ci")!.cached).toBe(false);
    // Smart order: a code change only re-runs the last COPY.
    const smart = at(3).lastBuild!;
    expect(smart.steps.find((s) => s.text === "RUN npm ci")!.cached).toBe(true);
    expect(smart.seconds).toBeLessThan(5);
    // A new dependency re-runs npm ci, as it should.
    expect(at(4).lastBuild!.steps.find((s) => s.text === "RUN npm ci")!.cached).toBe(false);
    // No .dockerignore: your node_modules goes into the image.
    expect(imageSize(imageFor(at(5), "shop")!)).toBeGreaterThan(imageSize(imageFor(at(4), "shop")!) + 150);
    // With .dockerignore, a new commit changes nothing.
    expect(at(6).lastBuild!.seconds).toBe(0);
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
