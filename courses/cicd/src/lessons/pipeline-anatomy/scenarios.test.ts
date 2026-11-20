import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { split } from "./model";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const CI = "nano .github/workflows/ci.yml";
const CART = "nano src/cart.ts";
const whole = (yaml: string) => () => yaml;
const dropLine = (line: RegExp) => (t: string) => t.split("\n").filter((x) => !line.test(x)).join("\n");
const fixLint = dropLine(/const total = subtotal;/);
const fixImport = dropLine(/utils\/money/);

type Play = { typed: string[]; edits: ((t: string) => string)[] };

/** The three jobs written by hand, with other names than the lesson's. */
const HAND = `name: CI
on:
  push:
    branches: [main]
jobs:
  eslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
  bundle:
    needs:
      - eslint
      - unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
`;

const solutions: Record<string, Play> = {
  split: { typed: [CI, 'git commit -am "Split CI into jobs"', "git push"], edits: [whole(workflowYaml(split(["lint", "test"])))] },
  "skip-build": { typed: [CI, 'git commit -am "Build after tests"', "git push"], edits: [(t) => t.replace(/^  build:\n/m, "  build:\n    needs: test\n")] },
  "wait-for-both": { typed: [CI, CART, 'git commit -am "Build after all checks"', "git push"], edits: [(t) => t.replace("needs: test", "needs: [lint, test]"), fixLint] },
  "which-job": { typed: [CART, 'git commit -am "Remove unused import"', "git push"], edits: [fixImport] },
};

const alternatives: Record<string, Play[]> = {
  split: [{ typed: [CI, "git add .", 'git commit -m "ci: jobs"', "git push"], edits: [whole(HAND)] }],
  "skip-build": [{ typed: ["gh run view", CI, 'git commit -am "needs"', "git push"], edits: [(t) => t.replace(/^  build:\n/m, "  build:\n    needs: [lint, test]\n")] }],
  "wait-for-both": [{ typed: ["gh run view --log-failed", CART, CI, "git add -A", 'git commit -m "fix"', "git push"], edits: [fixLint, (t) => t.replace("needs: test", "needs:\n      - test\n      - lint")] }],
  "which-job": [{ typed: ["gh run view", "gh run view --log-failed", 'echo "export const money = (x: number) => x;" > src/utils/money.ts', "git add .", 'git commit -m "Add money helper"', "git push"], edits: [] }],
};

const wrong: Record<string, Play> = {
  // A dependency on lint only: the build still runs while the tests fail.
  split: { typed: [CI, 'git commit -am "jobs"', "git push"], edits: [whole(workflowYaml(split(["lint"])))] },
  // Fixing the test makes the run green, but the build still waits for nobody.
  "skip-build": { typed: [CART, 'git commit -am "Fix VAT"', "git push"], edits: [(t) => t.replace("1.18", "1.2")] },
  // Lint is fixed, but build still waits only for test.
  "wait-for-both": { typed: [CART, 'git commit -am "Fix lint"', "git push"], edits: [fixLint] },
  // A re-run builds the same broken import.
  "which-job": { typed: ["gh run rerun"], edits: [] },
};

describe("pipeline-anatomy", () => {
  it("the story: one job, three runs, parallel jobs, needs, a skipped build", () => {
    expect(steps).toHaveLength(9);
    expect(scene.at(1).runs).toHaveLength(3);
    const parallel = latestRun(scene.at(3))!;
    expect(parallel.jobs.map((j) => j.start - parallel.start)).toEqual([0, 0, 0]);
    const ordered = latestRun(scene.at(4))!;
    const build = ordered.jobs.find((j) => j.id === "build")!;
    expect(build.start).toBe(Math.max(...ordered.jobs.filter((j) => j.id !== "build").map((j) => j.end)));
    expect(latestRun(scene.at(5))!.jobs.map((j) => j.status)).toEqual(["failure", "success", "skipped"]);
    expect(latestRun(scene.at(6))!.status).toBe("success");
  });

  it("the starts are what their stories say", () => {
    const run = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!;
    expect(run("skip-build").jobs.map((j) => j.status)).toEqual(["success", "failure", "success"]);
    expect(run("wait-for-both").jobs.map((j) => j.status)).toEqual(["failure", "success", "success"]);
    expect(run("which-job").jobs.map((j) => j.status)).toEqual(["success", "success", "failure"]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeInto(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeInto(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
