import { describe, expect, it } from "vitest";
import { commitOf, latestRun, SHAS } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { CICD } from "./model";
import { RACE, scenarios } from "./scenarios";
import { BUG_MSG, scene, steps } from "./Scene";

const CI = "nano .github/workflows/ci.yml";
const CART = "nano src/cart.ts";
const fixVat = (t: string) => t.replace("1.18", "1.2");
const whole = (yaml: string) => () => yaml;
/** The deploy job with `needs: ci` added under its id. */
const needsCi = (t: string) => t.replace(/^  deploy:\n/m, "  deploy:\n    needs: ci\n");

type Play = { typed: string[]; edits: ((t: string) => string)[] };

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Play> = {
  "never-pushed": { typed: ["git add .github/workflows/ci.yml", 'git commit -m "Add CI"', "git push"], edits: [] },
  "red-main": { typed: [CART, 'git commit -am "Fix VAT rate"', "git push"], edits: [fixVat] },
  "auto-staging": { typed: [CI, 'git commit -am "Deploy to staging"', "git push"], edits: [whole(workflowYaml(CICD))] },
  "red-reached-staging": { typed: [CI, CART, 'git commit -am "Deploy only green builds"', "git push"], edits: [needsCi, fixVat] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "never-pushed": [{ typed: ["git status", "git add .", "git commit -m ci", "git push origin main", "gh run list"], edits: [] }],
  "red-main": [{ typed: ["gh run view --log-failed", CART, "git add src/cart.ts", 'git commit -m "fix: VAT"', "git push"], edits: [fixVat] }],
  "auto-staging": [{ typed: [CI, "git add .", 'git commit -m "cd"', "git push"], edits: [whole(workflowYaml(CICD).replace("needs: ci", "needs: [ci]"))] }],
  "red-reached-staging": [{ typed: [CART, CI, "git add -A", 'git commit -m "fix"', "git push"], edits: [fixVat, (t) => t.replace(/^  deploy:\n/m, "  deploy:\n    needs: [ci]\n")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // `-a` only takes files Git already tracks: the new workflow stays behind.
  "never-pushed": { typed: ['git commit -am "Add CI"', "git push"], edits: [] },
  // The bug is in the code, not in luck: a re-run is red again.
  "red-main": { typed: ["gh run rerun"], edits: [] },
  // A deploy that does not wait for the tests ships whatever is on main.
  "auto-staging": { typed: [CI, 'git commit -am "cd"', "git push"], edits: [whole(workflowYaml(RACE))] },
  // Fixing the code alone leaves the pipeline that let red through.
  "red-reached-staging": { typed: [CART, 'git commit -am "Fix VAT"', "git push"], edits: [fixVat] },
};

describe("why-ci-cd", () => {
  it("the story: unchecked commits, a late red run, CI catching its own commit, CD keeping staging clean", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs).toHaveLength(0);
    const late = latestRun(scene.at(1))!;
    expect(late.status).toBe("failure");
    expect(commitOf(scene.at(1), late.sha).message).not.toBe(BUG_MSG);
    expect(scene.at(2).runs.map((r) => r.status).slice(-2)).toEqual(["success", "failure"]);
    expect(latestRun(scene.at(2))!.jobs[0]!.failedStep).toBe("Run npm run lint");
    expect(latestRun(scene.at(3))!.status).toBe("success");
    expect(scene.at(4).envs.staging!.sha).toBe(scene.at(4).heads.main);
    const red = latestRun(scene.at(5))!;
    expect(red.jobs.map((j) => j.status)).toEqual(["failure", "skipped"]);
    expect(scene.at(5).envs.staging!.sha).toBe(scene.at(4).heads.main);
  });

  it("the race start really shipped a red commit to staging", () => {
    const s = scenarios.find((x) => x.id === "red-reached-staging")!.start.world;
    expect(latestRun(s)!.status).toBe("failure");
    expect(commitOf(s, s.envs.staging!.sha!).bugs).toEqual(["test"]);
    expect(s.envs.staging!.sha).not.toBe(SHAS[0]);
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
