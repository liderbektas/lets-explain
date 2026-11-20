import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { PAGES, scene, steps } from "./Scene";

const PAGES_YML = "nano .github/workflows/pages.yml";

type Edit = (t: string) => string;
const upload: Edit = (t) => t.replace("      - run: npm run build\n", "      - run: npm run build\n      - uses: actions/upload-pages-artifact@v4\n        with:\n          path: dist/\n");
const uploadArtifact: Edit = (t) => t.replace("      - run: npm run build\n", "      - run: npm run build\n      - uses: actions/upload-artifact@v4\n        with:\n          name: dist\n          path: dist/\n");
const ifMain: Edit = (t) => t.replace("    needs: build\n", "    needs: build\n    if: github.ref == 'refs/heads/main' && github.event_name == 'push'\n");
const ifRef: Edit = (t) => t.replace("    needs: build\n", "    needs: build\n    if: ${{ github.ref_name == 'main' }}\n");
const tests: Edit = (t) => t.replace("      - run: npm ci\n", "      - run: npm ci\n      - run: npm test\n");

const solutions: Record<string, { typed: string[]; edits: Edit[] }> = {
  live: { typed: [PAGES_YML, 'git commit -am "Upload the site"', "git push"], edits: [upload] },
  "pr-safe": { typed: [PAGES_YML, 'git commit -am "Deploy only from main"', "git push", "gh pr create --head docs-fix"], edits: [ifMain] },
  "tests-guard": { typed: [PAGES_YML, 'git commit -am "Run the tests"', "git push", "gh pr merge 1"], edits: [tests] },
  "via-pr": { typed: ["git switch -c add-pages", "git add .github/workflows/pages.yml", 'git commit -m "Deploy to GitHub Pages"', "git push -u origin add-pages", "gh pr create --fill"], edits: [] },
};

const alternatives: Record<string, { typed: string[]; edits: Edit[] }[]> = {
  live: [{ typed: ["gh run view --log-failed", PAGES_YML, "git add .", "git commit -m upload", "git push origin main"], edits: [uploadArtifact] }],
  "pr-safe": [{ typed: [PAGES_YML, "git commit -am guard", "git push", "git switch docs-fix", "gh pr create --fill"], edits: [ifRef] }],
  "tests-guard": [{ typed: [PAGES_YML, "git commit -a", "git push", "gh pr list", "gh pr merge"], edits: [tests, () => "Run the tests"] }],
  "via-pr": [{ typed: ["git checkout -b pages", "git add .", "git commit -m pages", "git push --set-upstream origin pages", "gh pr create --head pages"], edits: [] }],
};

const wrong: Record<string, { typed: string[]; edits: Edit[] }> = {
  // Tests are good, but they don't put the site anywhere.
  live: { typed: [PAGES_YML, 'git commit -am "Run the tests"', "git push"], edits: [tests] },
  // Opening the PR before the guard reaches GitHub: the PR deploys.
  "pr-safe": { typed: ["gh pr create --head docs-fix", PAGES_YML, 'git commit -am "Deploy only from main"', "git push"], edits: [ifMain] },
  // Merging first: the broken rate is already live when the tests arrive.
  "tests-guard": { typed: ["gh pr merge 1", PAGES_YML, 'git commit -am "Run the tests"', "git push"], edits: [tests] },
  // Straight to main.
  "via-pr": { typed: ["git add .", 'git commit -m "Deploy to GitHub Pages"', "git push"], edits: [] },
};

describe("your-pipeline", () => {
  it("the story: nothing runs, then build, then deploy, a PR that deploys, the if, a blocked merge, the merge", () => {
    expect(steps).toHaveLength(9);
    const at = (s: number) => scene.at(s);
    expect(at(0).runs).toHaveLength(0);
    expect(latestRun(at(1))!.status).toBe("success");
    expect(at(1).envs[PAGES]!.sha).toBeNull();
    expect(at(2).envs[PAGES]!.sha).toBe(at(2).heads.main);
    const prRun = latestRun(at(3))!;
    expect(prRun.event).toBe("pull_request");
    expect(at(3).envs[PAGES]!.sha).toBe(at(3).heads.feature);
    expect(latestRun(at(4))!.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
    expect(latestRun(at(5))!.jobs.map((j) => j.status)).toEqual(["failure", "skipped"]);
    expect(scene.run.events[scene.stepEnd(5) - 1]![0]).toMatchObject({ type: "mergeBlocked" });
    expect(at(5).prs[0]!.state).toBe("open");
    expect(at(6).prs[0]!.state).toBe("merged");
    expect(at(6).envs[PAGES]!.sha).toBe(at(6).heads.main);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid|aborted)/.test(x)), r.output.join("\n")).toEqual([]);
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
