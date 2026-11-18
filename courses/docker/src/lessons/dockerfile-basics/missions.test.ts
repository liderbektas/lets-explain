import { describe, expect, it } from "vitest";
import { createHost, imageFor, imageSize, simulate, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { DF, INS, PROJECT, scene, steps } from "./Scene";

/** Presses the "+ instruction" buttons in order, then build. */
function writeAndBuild(keys: string[]): DockerAction[] {
  const out: DockerAction[] = keys.map((_, i) => ({ type: "editHost", path: DF, content: keys.slice(0, i + 1).join("\n") }));
  out.push({ type: "build", tag: "my-app", context: PROJECT, dockerfile: keys.map((k) => INS[k]!) });
  return out;
}

const solutions: Record<string, DockerAction[]> = {
  "first-image": writeAndBuild(["from", "cmd"]),
  "with-deps": writeAndBuild(["from", "copyAll", "npm"]),
  "right-place": writeAndBuild(["from", "workdir", "copyAll", "cmd"]),
};

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;

describe("dockerfile-basics", () => {
  it("every lesson step builds without an error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story: layers only from RUN and COPY; ENV, EXPOSE and CMD add nothing; ARG busts what follows", () => {
    expect(imageFor(at(0), "shop")!.layers).toHaveLength(1);
    expect(imageFor(at(1), "shop")!.layers).toHaveLength(2);
    expect(imageSize(imageFor(at(2), "shop")!)).toBe(imageSize(imageFor(at(1), "shop")!) + 60);
    const before = imageFor(at(3), "shop")!;
    const after = imageFor(at(4), "shop")!;
    expect(after.layers).toHaveLength(before.layers.length);
    expect(imageSize(after)).toBe(imageSize(before));
    expect(after.config.env.NODE_ENV).toBe("production");
    expect(after.config.exposed).toContain(3000);
    expect(files(after)["/app/server.js"]).toBeDefined();
    // Step 4's build reuses everything from step 3: only metadata changed.
    expect(at(4).lastBuild!.seconds).toBe(0);
    // The second ARG build: the ARG line and everything after it ran again.
    const second = at(5).lastBuild!;
    const argAt = second.steps.findIndex((s) => s.text.startsWith("ARG"));
    expect(second.steps.slice(0, argAt).every((s) => s.cached)).toBe(true);
    expect(second.steps.slice(argAt).filter((s) => /^(RUN|COPY)/.test(s.text)).every((s) => !s.cached)).toBe(true);
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

function files(img: { layers: { files: Record<string, string> }[] }) {
  return Object.assign({}, ...img.layers.map((x) => x.files)) as Record<string, string>;
}

describe("engine gap (reported, not fixed here)", () => {
  // Real BuildKit: a --build-arg only affects RUN lines after the ARG is declared.
  // The model mixes every passed build argument into every RUN's cache key.
  it("a RUN before the ARG stays cached when only the build argument changes", () => {
    const df: Instruction[] = [
      { op: "FROM", image: "alpine:3.20" },
      { op: "RUN", cmd: "apk add curl", size: 5, seconds: 5 },
      { op: "ARG", key: "V", value: "1" },
      { op: "RUN", cmd: "echo $V", size: 1, seconds: 1 },
    ];
    const r = simulate([
      { type: "build", tag: "t", context: {}, dockerfile: df },
      { type: "build", tag: "t", context: {}, dockerfile: df, args: { V: "2" } },
    ], createHost());
    const steps = r.states[2]!.lastBuild!.steps;
    expect(steps[1]!.cached).toBe(true);
  });
});
