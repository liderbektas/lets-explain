import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { GOOD, wf } from "./model";
import { LENIENT, scenarios } from "./scenarios";
import { scene, steps, timeToError } from "./Scene";

const CI = "nano .github/workflows/ci.yml";
const whole = (yaml: string) => () => yaml;
const dropLine = (line: RegExp) => (t: string) => t.split("\n").filter((x) => !line.test(x)).join("\n");
const fixLint = dropLine(/const total = subtotal;/);
const fixType = (t: string) => t.replace('"19.90"', "19.9");
/** Moves a step's line to right after `npm ci`. */
const toFront = (line: string) => (t: string) => t.replace(`${line}\n`, "").replace(`${line}`, "").replace("      - run: npm ci\n", `      - run: npm ci\n${line}\n`);

type Play = { typed: string[]; edits: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "fast-lint": { typed: [CI, 'git commit -am "Lint first"', "git push"], edits: [toFront("      - run: npm run lint")] },
  "right-order": { typed: [CI, "nano src/cart.ts", "nano src/price.ts", 'git commit -am "Checks first, fix lint and types"', "git push"], edits: [whole(workflowYaml(wf(GOOD))), fixLint, fixType] },
  "add-typecheck": { typed: [CI, "nano src/price.ts", 'git commit -am "Type check in CI"', "git push"], edits: [(t) => t.replace("      - run: npm run lint\n", "      - run: npm run lint\n      - run: npx tsc --noEmit\n"), fixType] },
  "lint-may-fail": { typed: [CI, "nano src/cart.ts", 'git commit -am "Lint must pass"', "git push"], edits: [dropLine(/continue-on-error/), fixLint] },
};

const alternatives: Record<string, Play[]> = {
  "fast-lint": [{ typed: ["gh run view", CI, "git add .", 'git commit -m "ci: lint first"', "git push"], edits: [whole(workflowYaml(wf(GOOD)))] }],
  "right-order": [{ typed: ["nano src/price.ts", "nano src/cart.ts", CI, "git add -A", 'git commit -m "fix"', "git push"], edits: [fixType, fixLint, whole(workflowYaml(wf(["typecheck", "lint", "test", "build"])))] }],
  "add-typecheck": [{ typed: [CI, 'git commit -am "tsc"', "git push", "gh run view --log-failed", "nano src/price.ts", 'git commit -am "price is a number"', "git push"], edits: [(t) => t.replace("      - run: npm test\n", "      - run: npx tsc --noEmit\n      - run: npm test\n"), fixType] }],
  "lint-may-fail": [{ typed: ["gh run view --log", "nano src/cart.ts", CI, "git add .", 'git commit -m "lint"', "git push"], edits: [fixLint, (t) => t.replace("continue-on-error: true", "continue-on-error: false")] }],
};

const wrong: Record<string, Play> = {
  // Fixing the lint error hides it: the run now fails on types, after the tests.
  "fast-lint": { typed: ["nano src/cart.ts", 'git commit -am "fix lint"', "git push"], edits: [fixLint] },
  // Green, but the checks still come after the tests.
  "right-order": { typed: ["nano src/cart.ts", "nano src/price.ts", 'git commit -am "fix"', "git push"], edits: [fixLint, fixType] },
  // The price is fixed, but nothing checks the types next time.
  "add-typecheck": { typed: ["nano src/price.ts", 'git commit -am "price"', "git push"], edits: [fixType] },
  // The variable is gone, but lint is still allowed to fail.
  "lint-may-fail": { typed: ["nano src/cart.ts", 'git commit -am "lint"', "git push"], edits: [fixLint] },
};

describe("lint-test-build", () => {
  it("the story: lint caught late, then early, then type, test and build errors one at a time", () => {
    expect(steps).toHaveLength(8);
    const failed = (s: number) => latestRun(scene.at(s))!.jobs[0]!.steps.find((x) => x.status === "failure")?.kind;
    expect([0, 1, 2, 3, 4].map(failed)).toEqual(["lint", "lint", "typecheck", "test", "build"]);
    expect(timeToError(scene.at(0))).toBe(53 + 70 + 15);
    expect(timeToError(scene.at(1))).toBe(53 + 15);
    expect(latestRun(scene.at(2))!.jobs[0]!.steps.find((x) => x.kind === "typecheck")!.exit).toBe(2);
    expect(latestRun(scene.at(3))!.jobs[0]!.steps.find((x) => x.kind === "build")!.status).toBe("skipped");
    expect(latestRun(scene.at(5))!.status).toBe("success");
  });

  it("the starts are what their stories say", () => {
    const start = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!;
    expect(start("fast-lint").jobs[0]!.failedStep).toBe("Run npx tsc --noEmit");
    expect(timeToError(scenarios[0]!.start.world)).toBe(53 + 70 + 20);
    expect(start("add-typecheck").status).toBe("success");
    const lenient = start("lint-may-fail");
    expect(lenient.status).toBe("success");
    expect(lenient.jobs[0]!.steps.find((s) => s.kind === "lint")!.allowed).toBe(true);
    expect(workflowYaml(LENIENT)).toContain("continue-on-error: true");
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
