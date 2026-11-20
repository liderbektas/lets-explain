import { describe, expect, it } from "vitest";
import { SHAS } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { crashed, scene, steps } from "./Scene";

const GOOD = SHAS[1]!;
const REDEPLOY_FILE = [
  "name: Redeploy",
  "on:",
  "  workflow_dispatch:",
  "    inputs:",
  "      version:",
  "        required: true",
  "",
  "jobs:",
  "  production:",
  "    runs-on: ubuntu-latest",
  "    environment: production",
  "    steps:",
  "      - run: ./deploy.sh production ${{ inputs.version }}",
  "        env:",
  "          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}",
].join("\n");

const solutions: Record<string, { typed: string[]; edits: ((t: string) => string)[] }> = {
  "prod-down": { typed: [`gh workflow run redeploy.yml -f version=${GOOD}`], edits: [] },
  "then-fix": { typed: [`gh workflow run redeploy.yml -f version=${GOOD}`, "gh pr merge 1"], edits: [] },
  "image-gone": { typed: ["gh run rerun 1"], edits: [] },
  "add-button": { typed: ["nano .github/workflows/redeploy.yml", "git add .", 'git commit -m "Redeploy workflow"', "git push", `gh workflow run redeploy.yml -f version=${GOOD}`], edits: [() => REDEPLOY_FILE] },
};

const alternatives: Record<string, { typed: string[]; edits: ((t: string) => string)[] }[]> = {
  // Re-running the good deploy's old run deploys the same commit again.
  "prod-down": [{ typed: ["gh run list --workflow deploy.yml --status success", "gh run rerun 1"], edits: [] }],
  "then-fix": [{ typed: ["gh run rerun 1", "gh pr list", "gh pr merge"], edits: [] }],
  "image-gone": [{ typed: ["gh run list --workflow deploy.yml", `gh workflow run redeploy.yml -f version=${GOOD}`, "gh run rerun 1"], edits: [] }],
  "add-button": [
    { typed: ["nano .github/workflows/redeploy.yml", "git add .github/workflows/redeploy.yml", "git commit -m rollback", "git push origin main", `gh workflow run Redeploy -f version=${GOOD}`], edits: [(t) => `${t}${REDEPLOY_FILE.replace("required: true", "description: SHA to deploy\n        required: true")}`] },
  ],
};

const wrong: Record<string, { typed: string[]; edits: ((t: string) => string)[] }> = {
  // Too far back: the good "search filters" release is lost too.
  "prod-down": { typed: [`gh workflow run redeploy.yml -f version=${SHAS[0]}`], edits: [] },
  // Fixing without rolling back first leaves users on the broken version until the fix lands.
  "then-fix": { typed: ["gh pr merge 1"], edits: [] },
  // The image the redeploy needs is gone.
  "image-gone": { typed: [`gh workflow run redeploy.yml -f version=${GOOD}`], edits: [] },
  // `commit -a` does not take a new file: GitHub never gets the workflow.
  "add-button": { typed: ["nano .github/workflows/redeploy.yml", 'git commit -am "Redeploy workflow"', "git push", `gh workflow run redeploy.yml -f version=${GOOD}`], edits: [() => REDEPLOY_FILE] },
};

describe("rollback", () => {
  it("the story: a broken deploy, a redeploy of the previous image, then the fix", () => {
    expect(steps).toHaveLength(7);
    const prod = (step: number) => scene.at(step).envs.production!.sha;
    expect(prod(0)).toBe(SHAS[2]);
    expect(crashed(scene.at(0), prod(0))).toBe(true);
    expect(prod(1)).toBe(SHAS[1]);
    expect(scene.at(1).heads.main).toBe(SHAS[2]);
    expect(prod(2)).toBe(SHAS[3]);
    expect(crashed(scene.at(2), prod(2))).toBe(false);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid|could not)/.test(x)), r.output.join("\n")).toEqual([]);
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
