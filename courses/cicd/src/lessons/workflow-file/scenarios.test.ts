import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { wf } from "./model";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const CI = "nano .github/workflows/ci.yml";
const SETUP = "      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n";
const CHECKOUT = "      - uses: actions/checkout@v4\n";
const whole = (yaml: string) => () => yaml;
/** Inserts lines right after the line that matches. */
const afterLine = (match: string, add: string) => (t: string) => t.replace(`${match}\n`, `${match}\n${add}`);
const moveInstallUp = (t: string) => t.replace("      - run: npm test\n      - run: npm ci", "      - run: npm ci\n      - run: npm test");

type Play = { typed: string[]; edits: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "first-workflow": { typed: [CI, "git add .github/workflows/ci.yml", 'git commit -m "Add CI"', "git push"], edits: [whole(workflowYaml(wf(["checkout", "setup-node", "install", "test"])))] },
  "npm-not-found": { typed: [CI, 'git commit -am "Set up Node"', "git push"], edits: [afterLine("      - uses: actions/checkout@v4", SETUP)] },
  "no-package-json": { typed: [CI, 'git commit -am "Check out the code"', "git push"], edits: [afterLine("    steps:", CHECKOUT)] },
  "wrong-order": { typed: [CI, 'git commit -am "Install before testing"', "git push"], edits: [moveInstallUp] },
  "build-too": { typed: [CI, 'git commit -am "Build in CI"', "git push"], edits: [(t) => `${t.trimEnd()}\n      - run: npm run build\n`] },
};

/** A hand-written first workflow, the way people type it. */
const HAND = `name: CI
on:
  push:
    branches:
      - main
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
      - run: npm run build
`;

const alternatives: Record<string, Play[]> = {
  "first-workflow": [{ typed: ["mkdir -p .github/workflows", CI, "git add .", "git commit -m ci", "git push", "gh run list"], edits: [whole(HAND)] }],
  "npm-not-found": [{ typed: ["gh run view --log-failed", CI, "git add .github/workflows/ci.yml", 'git commit -m "ci: node"', "git push"], edits: [afterLine("      - uses: actions/checkout@v4", "      - uses: actions/setup-node@v4\n")] }],
  "no-package-json": [{ typed: [CI, 'git commit -am "checkout"', "git push"], edits: [whole(workflowYaml(wf(["checkout", "setup-node", "install", "test"])))] }],
  "wrong-order": [{ typed: [CI, 'git commit -am "order"', "git push"], edits: [whole(workflowYaml(wf(["checkout", "setup-node", "install", "test", "build"])))] }],
  "build-too": [{ typed: [CI, 'git commit -am "build"', "git push"], edits: [whole(workflowYaml(wf(["checkout", "setup-node", "install", "lint", "test", "build"])))] }],
};

const wrong: Record<string, Play> = {
  // Committed but never sent: the file stays on the laptop.
  "first-workflow": { typed: [CI, "git add .", 'git commit -m "Add CI"'], edits: [whole(workflowYaml(wf(["checkout", "setup-node", "install", "test"])))] },
  // A re-run gets the same empty machine.
  "npm-not-found": { typed: ["gh run rerun"], edits: [] },
  // The code arrives too late: npm ci already ran.
  "no-package-json": { typed: [CI, 'git commit -am "checkout"', "git push"], edits: [afterLine("      - run: npm ci", CHECKOUT)] },
  // Installing again after the tests still leaves the tests without vitest.
  "wrong-order": { typed: [CI, 'git commit -am "install twice"', "git push"], edits: [(t) => `${t.trimEnd()}\n      - run: npm ci\n`] },
  // The build runs, but before the tests.
  "build-too": { typed: [CI, 'git commit -am "build"', "git push"], edits: [(t) => t.replace("      - run: npm test\n", "      - run: npm run build\n      - run: npm test\n")] },
};

describe("workflow-file", () => {
  it("the story: checkout only, then tests, then the two broken files, then the full file", () => {
    expect(steps).toHaveLength(7);
    const status = (step: number) => latestRun(scene.at(step))!.status;
    expect([0, 1, 2, 3, 4].map(status)).toEqual(["success", "success", "failure", "failure", "success"]);
    expect(latestRun(scene.at(2))!.jobs[0]!.failedStep).toBe("Run npm ci");
    expect(latestRun(scene.at(3))!.jobs[0]!.steps.find((s) => s.kind === "test")!.exit).toBe(127);
    expect(latestRun(scene.at(4))!.jobs[0]!.steps).toHaveLength(6);
  });

  it("each broken start is red for the reason its story gives", () => {
    const failed = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!.jobs[0]!.steps.find((s) => s.status === "failure")!;
    expect(failed("npm-not-found").exit).toBe(127);
    expect(failed("no-package-json").exit).toBe(254);
    expect(failed("wrong-order").log.join("\n")).toContain("vitest: not found");
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
