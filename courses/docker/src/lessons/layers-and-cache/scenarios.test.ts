import { describe, expect, it } from "vitest";
import { imageFor, imageSize, type Host } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { SMART, scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const at = (step: number): Host => scene.run.states[scene.stepEnd(step)]!;
const toSmart = () => SMART;

type Play = { typed: string[]; edits?: ((t: string) => string)[] };

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "fast-rebuild": { typed: ["nano Dockerfile", "docker build -t shop .", "echo 'app.listen(3000); // v2' > server.js", "docker build -t shop ."], edits: [toSmart] },
  "slim-context": { typed: ["echo node_modules > .dockerignore", "docker build -t shop ."] },
  "no-history": { typed: ["echo .git >> .dockerignore", "docker build -t shop ."] },
  "fresh-packages": { typed: ["docker build --no-cache -t shop ."] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "fast-rebuild": [
    { typed: ["cat Dockerfile", "nano Dockerfile", "docker build -t shop .", "nano server.js", "docker build -t shop ."], edits: [(t) => t.replace("COPY . .\nRUN npm ci", "COPY package.json package-lock.json ./\nRUN npm ci\nCOPY . ."), (t) => `${t}\n// v2`] },
  ],
  "slim-context": [{ typed: ["nano .dockerignore", "docker build -t shop ."], edits: [() => "node_modules\n.git\n.env"] }],
  "no-history": [{ typed: ["nano .dockerignore", "docker build -t shop ."], edits: [(t) => `${t}\n.git`] }],
  "fresh-packages": [{ typed: ["docker build --no-cache --tag shop ."] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // A code change with the old order: npm ci runs again.
  "fast-rebuild": { typed: ["echo 'app.listen(3000); // v2' > server.js", "docker build -t shop ."] },
  // Rebuilding changes nothing while node_modules is still sent.
  "slim-context": { typed: ["docker build --no-cache -t shop ."] },
  // `>` replaces the file: .git is out, but node_modules is back in.
  "no-history": { typed: ["echo .git > .dockerignore", "docker build -t shop ."] },
  // A plain build: everything CACHED.
  "fresh-packages": { typed: ["docker build -t shop ."] },
};

const play = (start: Host, p: Play) => typeInto(start, p.typed, [...(p.edits ?? [])]);

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

  it("the start states tell the truth: big with node_modules, .git inside, warm cache", () => {
    const [fast, slim, hist] = scenarios;
    expect(fast!.start.lastBuild!.steps.find((x) => x.text === "RUN npm ci")).toBeDefined();
    expect(imageSize(imageFor(slim!.start, "shop")!)).toBeGreaterThan(400);
    const files = Object.keys(Object.assign({}, ...imageFor(hist!.start, "shop")!.layers.map((x) => x.files)));
    expect(files.some((p) => p.startsWith("/app/.git/"))).toBe(true);
    // --no-cache really runs every line again.
    const out = play(scenarios[3]!.start, solutions["fresh-packages"]!).output;
    expect(out.some((x) => x.includes("CACHED"))).toBe(false);
    expect(play(scenarios[3]!.start, wrong["fresh-packages"]!).output.some((x) => x.includes("CACHED [2/6] RUN apt-get"))).toBe(true);
  });
});
