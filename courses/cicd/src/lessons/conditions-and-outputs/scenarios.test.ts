import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { resolvedSummary, scene, steps } from "./Scene";
import { scenarios } from "./scenarios";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci-cd.yml";
const under = (anchor: string, line: string) => (t: string) => {
  if (!t.includes(anchor)) throw new Error(`no ${JSON.stringify(anchor)} in the workflow`);
  return t.replace(anchor, `${anchor}${line}\n`);
};
const DEPLOY = "  deploy:\n    needs: build\n";
const NOTIFY = "  notify:\n    needs: [build, deploy]\n";
const LINT = "      - run: npm run lint\n";
const SUMMARY = '      - run: echo "### Build finished" >> "$GITHUB_STEP_SUMMARY"\n';

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  "staging-from-main": { typed: [CI, 'git commit -am "Deploy only from main"', "git push"], edits: [under(DEPLOY, "    if: github.ref == 'refs/heads/main'")] },
  "speak-up": { typed: [CI, 'git commit -am "Notify on failure"', "git push"], edits: [under(NOTIFY, "    if: failure()")] },
  "soft-lint": { typed: [CI, 'git commit -am "Lint warns only"', "git push"], edits: [under(LINT, "        continue-on-error: true")] },
  "always-summary": { typed: [CI, 'git commit -am "Always write the summary"', "git push"], edits: [under(SUMMARY, "        if: always()")] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "staging-from-main": [
    { typed: [CI, "git add .github/workflows/ci-cd.yml", 'git commit -m "deploy: main only"', "git push origin main"], edits: [under(DEPLOY, "    if: github.ref_name == 'main'")] },
    { typed: [CI, 'git commit -am "deploy: main only"', "git push"], edits: [under(DEPLOY, "    if: ${{ github.ref == 'refs/heads/main' }}")] },
  ],
  "speak-up": [{ typed: [CI, "git add .", 'git commit -m "notify"', "git push"], edits: [under(NOTIFY, "    if: ${{ failure() }}")] }],
  "soft-lint": [{ typed: ["git push", CI, 'git commit -am "lint: warn"', "git push"], edits: [under(LINT, "        continue-on-error: true")] }],
  "always-summary": [{ typed: [CI, 'git commit -am "summary"', "git push"], edits: [under(SUMMARY, "        if: ${{ always() }}")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Limiting the whole workflow to main: feature branches are no longer tested at all.
  "staging-from-main": { typed: [CI, 'git commit -am "main only"', "git push"], edits: [under("  push:\n", "    branches: [main]")] },
  // always() posts on green runs too.
  "speak-up": { typed: [CI, 'git commit -am "notify always"', "git push"], edits: [under(NOTIFY, "    if: always()")] },
  // Deleting the lint step ships the fix, but nobody sees the warning any more.
  "soft-lint": { typed: [CI, 'git commit -am "no lint"', "git push"], edits: [(t) => t.replace(LINT, "")] },
  // Letting the failing test pass ships broken code to staging.
  "always-summary": { typed: [CI, 'git commit -am "tests may fail"', "git push"], edits: [under("      - run: npm test\n", "        continue-on-error: true")] },
};

describe("conditions-and-outputs", () => {
  it("the story: feature deploys, if: main stops it, notify is silent then speaks, outputs reach deploy, lint is tolerated", () => {
    expect(steps).toHaveLength(8);
    const w0 = scene.at(0);
    expect(w0.commits.find((c) => c.sha === w0.envs.staging!.sha)!.branch).toBe("feature");
    const w1 = scene.at(1);
    expect(w1.runs[1]!.jobs.find((j) => j.id === "deploy")!.status).toBe("skipped");
    expect(w1.envs.staging!.sha).toBe(w1.heads.main);
    const r2 = latestRun(scene.at(2))!;
    expect(r2.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "skipped"]);
    const r3 = latestRun(scene.at(3))!;
    expect(r3.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "success"]);
    expect(r3.summary).toEqual(["### Build finished"]);
    const r4 = latestRun(scene.at(4))!;
    expect(r4.status).toBe("success");
    expect(resolvedSummary(r4)).toContain(`Deployed sha-${r4.sha} to staging`);
    expect(r4.jobs.find((j) => j.id === "notify")!.status).toBe("skipped");
    const w5 = scene.at(5);
    const r5 = latestRun(w5)!;
    expect(r5.status).toBe("success");
    expect(r5.jobs[0]!.steps.find((s) => s.kind === "lint")!.allowed).toBe(true);
    expect(w5.envs.staging!.sha).toBe(r5.sha);
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
