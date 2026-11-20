import { describe, expect, it } from "vitest";
import { imageFor, imageSize, type Host } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { multiOn, scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;
const size = (h: Host, tag: string) => imageSize(imageFor(h, tag)!);

const ALPINE = multiOn("node:22-alpine");
const DISTROLESS = multiOn("gcr.io/distroless/nodejs22-debian12");

type Play = { typed: string[]; edits?: ((t: string) => string)[] };

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "under-200": { typed: ["nano Dockerfile", "docker build -t shop ."], edits: [() => ALPINE] },
  "under-150": {
    typed: ["nano Dockerfile", "docker build -t shop ."],
    edits: [(t) => t.replace("FROM node:22-alpine", "FROM gcr.io/distroless/nodejs22-debian12").replace('CMD ["node", "dist/server.js"]', 'CMD ["dist/server.js"]')],
  },
  "test-stage": { typed: ["docker build --target build -t shop:build ."] },
  "no-shell": { typed: ["docker build -t shop .", "docker run -d --name app shop", "docker exec app sh"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "under-200": [
    { typed: ["nano Dockerfile", "docker build -t shop ."], edits: [() => multiOn("node:22-alpine").replace("AS build", "AS builder").replace("--from=build", "--from=builder")] },
    { typed: ["nano Dockerfile", "docker build -t shop .", "docker images"], edits: [() => DISTROLESS] },
  ],
  "under-150": [{ typed: ["nano Dockerfile", "docker build -t shop .", "docker run -d -p 3000:3000 shop"], edits: [() => DISTROLESS] }],
  "test-stage": [{ typed: ["docker build -t shop:build --target=build ."] }],
  "no-shell": [{ typed: ["docker build -t shop .", "docker run -d -p 3000:3000 --name app shop", "docker exec -it app sh"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // One stage on alpine still ships npm ci's packages and the build output's tools: 222 MB.
  "under-200": { typed: ["nano Dockerfile", "docker build -t shop ."], edits: [(t) => t.replace("FROM node:22", "FROM node:22-alpine")] },
  // distroless with CMD ["node", …]: its ENTRYPOINT already is node, so `node node …` fails.
  "under-150": { typed: ["nano Dockerfile", "docker build -t shop ."], edits: [(t) => t.replace("FROM node:22-alpine", "FROM gcr.io/distroless/nodejs22-debian12")] },
  // Without --target the last stage is built: no sources, no node_modules.
  "test-stage": { typed: ["docker build -t shop:build ."] },
  // A different command in the container proves nothing about a shell.
  "no-shell": { typed: ["docker build -t shop .", "docker run -d --name app shop", "docker exec app node -v"] },
};

const play = (start: Host, p: Play) => typeInto(start, p.typed, [...(p.edits ?? [])]);

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

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        expect(s.check(play(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("node node on distroless stops with Node's own error", () => {
    const r = play(scenarios[1]!.start, { typed: ["nano Dockerfile", "docker build -t shop .", "docker run --name app shop"], edits: [wrong["under-150"]!.edits![0]!] });
    expect(r.output).toContain("Error: Cannot find module '/app/node'");
  });

  it("exec sh in distroless fails the way Docker says it", () => {
    const r = play(scenarios[3]!.start, solutions["no-shell"]!);
    expect(r.output.at(-1)).toContain('exec: "sh": executable file not found in $PATH');
  });
});
