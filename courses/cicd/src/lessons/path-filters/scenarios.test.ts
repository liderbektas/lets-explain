import { describe, expect, it } from "vitest";
import { blockingChecks, checksFor, latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { REQUIRED, scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci.yml";
const PREP = "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n      - run: npm test\n";

const changesJob = (names: string[]) =>
  [
    "  changes:",
    "    runs-on: ubuntu-latest",
    "    outputs:",
    ...names.map((n) => `      ${n}: \${{ steps.filter.outputs.${n} }}`),
    "    steps:",
    "      - id: filter",
    "        uses: dorny/paths-filter@v3",
    "        with:",
    "          filters: |",
    ...names.flatMap((n) => [`            ${n}:`, `              - '${n}/**'`]),
    "",
  ].join("\n");

/** The trap's workflow, rewritten: always start, let a changes job decide whether test runs. */
const skipPerJob = () =>
  ["name: CI", "on:", "  pull_request:", "", "jobs:", changesJob(["src"]), "  test:", "    needs: changes", "    if: needs.changes.outputs.src == 'true'", "    runs-on: ubuntu-latest", "    steps:", PREP].join("\n");

/** web and api behind a changes job. */
const perApp = (t: string) =>
  t
    .replace("jobs:\n", `jobs:\n${changesJob(["web", "api"])}\n`)
    .replace("\n  web:\n", "\n  web:\n    needs: changes\n    if: needs.changes.outputs.web == 'true'\n")
    .replace("\n  api:\n", "\n  api:\n    needs: changes\n    if: needs.changes.outputs.api == 'true'\n");

const setPaths = (list: string) => (t: string) => t.replace(/    paths: \[.*\]/, `    paths: ${list}`);
const setIgnore = (list: string) => (t: string) => t.replace(/    paths-ignore: \[.*\]/, `    paths-ignore: ${list}`);

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  unblock: { typed: ["gh pr checks", "git switch docs", CI, 'git commit -am "ci: skip tests per job, not per workflow"', "git push", "gh pr merge"], edits: [skipPerJob] },
  "two-apps": { typed: [CI, 'echo "<h1>Shop</h1>" >> web/index.html', 'git commit -am "ci: test only the app that changed"', "git push"], edits: [perApp] },
  dependencies: { typed: [CI, 'git commit -am "ci: dependencies are code too"', "git push"], edits: [setPaths("['src/**', 'package.json', 'package-lock.json']")] },
  "nested-docs": { typed: [CI, 'git commit -am "ci: ignore nested docs"', "git push"], edits: [setIgnore("['docs/**', '**/*.md']")] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  unblock: [{ typed: ["git checkout docs", CI, "git add .github/workflows/ci.yml", 'git commit -m "ci: changes job"', "git push", "gh pr checks", "gh pr merge 1"], edits: [skipPerJob] }],
  // Workflow change and site change as two commits, pushed together.
  "two-apps": [{ typed: [CI, 'git commit -am "ci: per app"', 'echo "<h1>Shop</h1>" >> web/index.html', 'git commit -am "web: heading"', "git push"], edits: [perApp] }],
  // Ignoring docs instead of listing code: the lockfile is not ignored, so it runs.
  dependencies: [{ typed: [CI, 'git commit -am "ci: ignore docs instead"', "git push"], edits: [(t) => t.replace(/    paths: \[.*\]/, "    paths-ignore: ['docs/**', '**/*.md']")] }],
  "nested-docs": [{ typed: [CI, 'git commit -am "ci: only code"', "git push"], edits: [(t) => t.replace(/    paths-ignore: \[.*\]/, "    paths: ['src/**', 'package*.json']")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Without the filter the PR can merge, but the tests ran on a docs change.
  unblock: { typed: ["git switch docs", CI, 'git commit -am "ci: no filter"', "git push", "gh pr merge"], edits: [(t) => t.replace("  pull_request:\n    paths: ['src/**']\n", "  pull_request:\n")] },
  // Two jobs with no changes job: both still run.
  "two-apps": { typed: ['echo "<h1>Shop</h1>" >> web/index.html', 'git commit -am "web: heading"', "git push"], edits: [] },
  // No filter at all: dependency bumps run, but so does every docs fix.
  dependencies: { typed: [CI, 'git commit -am "ci: run always"', "git push"], edits: [(t) => t.replace("    paths: ['src/**']\n", "")] },
  // `docs/**` fixes the folder, but `*.md` still only matches the repo root.
  "nested-docs": { typed: [CI, 'git commit -am "ci: docs folder"', "git push"], edits: [setIgnore("['docs/**', '*.md']")] },
};

describe("path-filters", () => {
  it("the story: README skips, mixed runs, monorepo skips api, the trap blocks, the fix merges", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs).toHaveLength(1);
    const s1 = scene.run.events.slice(scene.stepStart(1), scene.stepEnd(1)).flat();
    expect(s1.filter((e) => e.type === "notTriggered")).toHaveLength(1);
    expect(scene.at(1).runs).toHaveLength(2);
    expect(scene.at(2).runs).toHaveLength(3);
    expect(latestRun(scene.at(3))!.jobs.map((j) => j.status)).toEqual(["success", "success", "skipped"]);
    const trap = scene.at(4);
    expect(checksFor(trap, 1)).toEqual([{ name: REQUIRED, state: "expected", required: true }]);
    expect(trap.prs[0]!.state).toBe("open");
    const fixed = scene.at(5);
    expect(fixed.prs[0]!.state).toBe("merged");
    expect(fixed.runs.find((r) => r.pr === 1)!.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
  });

  it("the stuck PR starts blocked, and merging it as it is is refused", () => {
    const s = scenarios.find((x) => x.id === "unblock")!;
    expect(blockingChecks(s.start.world, 1)).toEqual([REQUIRED]);
    expect(typeInto(s.start, ["gh pr merge"]).output.join("\n")).toContain("is not mergeable");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid|X )/.test(x)), r.output.join("\n")).toEqual([]);
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
