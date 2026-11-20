import { describe, expect, it } from "vitest";
import { createHost, imageFor, imageSize, simulate, type Host, type Instruction } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;

/** Editor saves: the whole new Dockerfile, or a change to the one that opened. */
const write = (text: string) => () => text;
const after = (line: string, add: string) => (text: string) => text.replace(line, `${line}\n${add}`);

const BASIC = 'FROM node:22-slim\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.js"]';

/** What a reader would type for each scenario, and what they would write in the editor. */
const solutions: Record<string, { typed: string[]; edits?: ((t: string) => string)[] }> = {
  "first-image": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [write(BASIC)] },
  "with-deps": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [after("WORKDIR /app", "COPY package*.json ./\nRUN npm ci")] },
  "right-folder": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [after("FROM node:22-slim", "WORKDIR /app")] },
  "ready-for-prod": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [(t) => t.replace("CMD", "ENV NODE_ENV=production\nEXPOSE 3000\nCMD")] },
  "ship-it": { typed: ["docker build -t my-app .", "docker run -d -p 3000:3000 my-app"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, { typed: string[]; edits?: ((t: string) => string)[] }[]> = {
  "first-image": [
    { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [write("FROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nCMD node server.js")] },
    { typed: ["echo FROM node:22-slim > Dockerfile", "echo WORKDIR /app >> Dockerfile", "echo COPY . . >> Dockerfile", "echo 'CMD [\"npm\", \"start\"]' >> Dockerfile", "docker build -t my-app ."] },
  ],
  "with-deps": [{ typed: ["nano Dockerfile", "docker build --tag my-app ."], edits: [after("WORKDIR /app", "COPY package.json package-lock.json ./\nRUN npm install")] }],
  "right-folder": [{ typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [write('FROM node:22-slim\nWORKDIR /app\nCOPY . /app\nCMD ["node", "/app/server.js"]')] }],
  "ready-for-prod": [{ typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [(t) => t.replace("FROM node:22-slim", "FROM node:22-slim\nENV NODE_ENV production\nEXPOSE 3000/tcp")] }],
  "ship-it": [{ typed: ["docker build -t my-app .", "docker run -d --name shop -p 3000:3000 my-app", "curl localhost:3000"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, { typed: string[]; edits?: ((t: string) => string)[] }> = {
  // No CMD: the image runs the base image's bare `node`.
  "first-image": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [write("FROM node:22-slim\nWORKDIR /app\nCOPY . .")] },
  // npm ci before package.json is copied in.
  "with-deps": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [after("WORKDIR /app", "RUN npm ci")] },
  // WORKDIR after COPY: the code stays in /, and CMD looks for /app/server.js.
  "right-folder": { typed: ["nano Dockerfile", "docker build -t my-app ."], edits: [(t) => t.replace("COPY . .", "COPY . .\nWORKDIR /app")] },
  // Edited but never built: the image is unchanged.
  "ready-for-prod": { typed: ["nano Dockerfile"], edits: [(t) => t.replace("CMD", "ENV NODE_ENV=production\nEXPOSE 3000\nCMD")] },
  // EXPOSE alone does not open the port.
  "ship-it": { typed: ["docker build -t my-app .", "docker run -d my-app"] },
};

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

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.typed, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        expect(s.check(typeInto(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.typed, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }

  it("the build prints BuildKit's steps for the reader's own Dockerfile", () => {
    const sol = solutions["with-deps"]!;
    const out = typeInto(scenarios[1]!.start, sol.typed, [...sol.edits!]).output;
    expect(out).toContain(" => [3/5] COPY package*.json ./                         1.0s");
    expect(out.some((x) => x.startsWith(" => [4/5] RUN npm ci"))).toBe(true);
    // CMD is a setting, not a build step.
    expect(out.some((x) => x.includes("CMD"))).toBe(false);
  });
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
