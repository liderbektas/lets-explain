import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci.yml";
const CONCURRENCY = "concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n\njobs:";
const group = (t: string) => t.replace("jobs:", CONCURRENCY);
const cap = (t: string) => t.replace("  e2e:\n    runs-on: ubuntu-latest\n", "  e2e:\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n");
const typo = (t: string) => t.replace("A small web shop.", "A small online shop.");
const noFailFast = (t: string) => t.replace("    strategy:\n", "    strategy:\n      fail-fast: false\n");

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  "only-last": { typed: [CI, 'git commit -am "ci: cancel older runs"', "git push", 'echo "// tidy" >> src/app.ts', 'git commit -am "tidy"', "git push", "gh run list"], edits: [group] },
  "six-hours": { typed: ["gh run list", CI, 'git commit -am "ci: cap e2e at 15 minutes"', "git push"], edits: [cap] },
  typo: { typed: ["nano README.md", 'git commit -am "docs: fix a typo [skip ci]"', "git push"], edits: [typo] },
  "fail-fast": { typed: ["gh run view", CI, 'git commit -am "ci: let every Node finish"', "git push"], edits: [noFailFast] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "only-last": [{ typed: [CI, "git add .", 'git commit -m "ci: concurrency"', "git push origin main", 'echo "x" >> README.md', "git add README.md", 'git commit -m "readme"', "git push"], edits: [(t) => t.replace("jobs:", "concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\n\njobs:")] }],
  // Fixing the hanging test itself also stops the bill.
  "six-hours": [{ typed: ["nano e2e/checkout.spec.ts", 'git commit -am "e2e: give page.goto a time limit"', "git push"], edits: [(t) => t.replace(", { timeout: 0 }", "")] }],
  typo: [{ typed: ['echo "Run it with npm start." >> README.md', 'git commit -am "docs: how to run [ci skip]"', "git push origin main"], edits: [] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // The setting alone: nothing was cancelled yet.
  "only-last": { typed: [CI, 'git commit -am "ci: cancel older runs"', "git push"], edits: [group] },
  // Another push without a limit hangs for 6 hours again.
  "six-hours": { typed: ['echo "// retry" >> src/app.ts', 'git commit -am "retry"', "git push"], edits: [] },
  // An ordinary commit message: a run starts.
  typo: { typed: ["nano README.md", 'git commit -am "docs: fix a typo"', "git push"], edits: [typo] },
  // Re-running changes nothing: fail-fast cancels Node 22 again.
  "fail-fast": { typed: ["gh run rerun"], edits: [] },
};

describe("no-wasted-runs", () => {
  it("the story: 5 runs, then 4 cancelled, a 6-hour hang, a 15-minute cap, fail-fast, [skip ci]", () => {
    expect(steps).toHaveLength(8);
    const w0 = scene.at(0);
    expect(w0.runs.map((r) => r.status)).toEqual(Array(5).fill("success"));
    expect(w0.runs.reduce((m, r) => m + r.minutes, 0)).toBe(15);
    const second = scene.at(1).runs.slice(5);
    expect(second.map((r) => r.status)).toEqual(["cancelled", "cancelled", "cancelled", "cancelled", "success"]);
    expect(second.reduce((m, r) => m + r.minutes, 0)).toBe(7);
    expect(latestRun(scene.at(2))!.minutes).toBe(363);
    const capped = latestRun(scene.at(3))!;
    expect(capped.jobs[1]!.reason).toBe("timeout");
    expect(capped.minutes).toBe(18);
    const w4 = scene.at(4);
    const [fast, slow] = w4.runs.slice(-2);
    expect(fast!.jobs.map((j) => j.status)).toEqual(["failure", "cancelled"]);
    expect(slow!.jobs.map((j) => j.status)).toEqual(["failure", "success"]);
    expect(scene.at(5).runs).toHaveLength(w4.runs.length);
    // Hours pass between scenes: nothing after step 1 is cancelled by a later scene.
    expect(scene.at(5).runs.slice(10).filter((r) => r.status === "cancelled")).toEqual([]);
  });

  it("the typed scenarios start where their stories say", () => {
    const start = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!;
    expect(start("six-hours").minutes).toBe(363);
    expect(start("fail-fast").jobs.map((j) => [j.label, j.status])).toEqual([
      ["test (20)", "failure"],
      ["test (22)", "cancelled"],
    ]);
  });

  it("a capped e2e job ends as a timeout after 15 minutes", () => {
    const s = scenarios.find((x) => x.id === "six-hours")!;
    const r = typeInto(s.start, solutions["six-hours"]!.typed, [cap]);
    const run = latestRun(r.ctx.state.world)!;
    expect(run.jobs.find((j) => j.id === "e2e")).toMatchObject({ status: "failure", reason: "timeout" });
    expect(run.minutes).toBe(18);
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
