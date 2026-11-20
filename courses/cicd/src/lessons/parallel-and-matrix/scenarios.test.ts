import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { REDUCE, scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci.yml";
const PREP = "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n";
const MATRIX_PREP = "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node }}\n      - run: npm ci\n";

const E2E_JOB = `\n  e2e:\n    runs-on: ubuntu-latest\n    steps:\n${PREP}      - run: npm run e2e\n`;
const TEST_JOB = `\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n${MATRIX_PREP}      - run: npm test\n`;

const e2eOut = (t: string) => `${t.replace("      - run: npm run e2e\n", "")}\n${E2E_JOB}`;
const testOut = (t: string) => `${t.replace("      - run: npm test\n", "")}\n${TEST_JOB}`;
const needs = (t: string) => t.replace("  build:\n", "  build:\n    needs: [lint, test]\n");

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  split: { typed: [CI, 'git commit -am "ci: e2e in its own job"', "git push"], edits: [e2eOut] },
  "two-nodes": { typed: [CI, 'git commit -am "ci: test on Node 20 and 22"', "git push"], edits: [testOut] },
  "fix-node20": { typed: ["gh run view --log-failed", "nano src/list.ts", 'git commit -am "orders: group without Object.groupBy"', "git push"], edits: [() => REDUCE] },
  "build-waits": { typed: [CI, 'git commit -am "ci: build after lint and test"', "git push"], edits: [needs] },
  "fast-and-wide": { typed: [CI, 'git commit -am "ci: parallel jobs, Node 20 and 22"', "git push"], edits: [(t) => testOut(e2eOut(t))] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  // Splitting everything into its own job is faster still.
  split: [{ typed: [CI, 'git commit -am "ci: split"', "git push"], edits: [(t) => testOut(e2eOut(t)).replace("node: [20, 22]", "node: [22]")] }],
  "two-nodes": [{ typed: [CI, "git add .", 'git commit -m "ci: matrix"', "git push origin main"], edits: [(t) => testOut(t).replace("node: [20, 22]", "node: ['20', '22']")] }],
  "build-waits": [{ typed: [CI, 'git commit -am "ci: needs"', "git push"], edits: [(t) => t.replace("  build:\n", "  build:\n    needs:\n      - lint\n      - test\n")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Moving e2e earlier in the same job changes nothing: the steps still run one by one.
  split: { typed: [CI, 'git commit -am "ci: e2e first"', "git push"], edits: [(t) => t.replace("      - run: npm run e2e\n", "").replace("      - run: npm run lint\n", "      - run: npm run e2e\n      - run: npm run lint\n")] },
  // Node 20 alone hides nothing, but there is no Node 22 to compare.
  "two-nodes": { typed: [CI, 'git commit -am "ci: node 20"', "git push"], edits: [(t) => t.replace("node-version: 22", "node-version: 20")] },
  // Dropping Node 20 makes the run green and the customers' crash invisible.
  "fix-node20": { typed: [CI, 'git commit -am "ci: only node 22"', "git push"], edits: [(t) => t.replace("node: [20, 22]", "node: [22]")] },
  // Re-running changes nothing about when build starts.
  "build-waits": { typed: ["gh run rerun"], edits: [] },
  // The matrix alone: both Nodes, but e2e still makes the run long.
  "fast-and-wide": { typed: [CI, 'git commit -am "ci: matrix"', "git push"], edits: [testOut] },
};

describe("parallel-and-matrix", () => {
  it("the story: one long job, then parallel jobs, needs, matrix and fail-fast", () => {
    expect(steps).toHaveLength(7);
    const run = (s: number) => latestRun(scene.at(s))!;
    expect(run(0).end - run(0).start).toBe(343);
    expect(run(0).minutes).toBe(6);
    expect(run(1).end - run(1).start).toBe(211);
    expect(run(1).minutes).toBe(11);
    expect(run(2).jobs.map((j) => [j.id, j.status])).toEqual([
      ["lint", "success"],
      ["test", "failure"],
      ["e2e", "success"],
      ["build", "skipped"],
    ]);
    expect(run(3).jobs.map((j) => [j.label, j.status])).toEqual([
      ["lint", "success"],
      ["test (20)", "failure"],
      ["test (22)", "success"],
      ["e2e", "success"],
      ["build", "skipped"],
    ]);
    expect(run(4).jobs.map((j) => [j.label, j.status, j.reason])).toEqual([
      ["lint", "success", undefined],
      ["test (20)", "failure", undefined],
      ["test (22)", "cancelled", "fail-fast"],
      ["build", "skipped", "needs"],
    ]);
  });

  it("the one-job scenarios start at 5m 43s, and the Node 20 code breaks only on Node 20", () => {
    const start = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!;
    expect(start("split").end - start("split").start).toBe(343);
    expect(start("two-nodes").status).toBe("success");
    expect(start("fix-node20").jobs.map((j) => [j.label, j.status])).toContainEqual(["test (20)", "failure"]);
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
