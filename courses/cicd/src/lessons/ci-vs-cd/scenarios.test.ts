import { describe, expect, it } from "vitest";
import { latestRun, SHAS } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { PIPELINE } from "./model";
import { NO_PROD, scenarios, SIDE_BY_SIDE, UNGUARDED } from "./scenarios";
import { scene, steps } from "./Scene";

const CI = "nano .github/workflows/pipeline.yml";
const CART = "nano src/cart.ts";
const fixVat = (t: string) => t.replace("1.18", "1.2");
const whole = (yaml: string) => () => yaml;
const PROD_JOB = workflowYaml(PIPELINE).slice(workflowYaml(PIPELINE).indexOf("  production:"));

type Play = { typed: string[]; edits: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "needs-a-reviewer": { typed: [CI, 'git commit -am "Gate production"', "git push"], edits: [(t) => t.replace(/^  production:\n/m, "  production:\n    environment: production\n")] },
  "continuous-deployment": { typed: [CI, 'git commit -am "Deploy to production"', "git push"], edits: [(t) => `${t.trimEnd()}\n${PROD_JOB.replace("    environment: production\n", "")}`] },
  "gate-holds": { typed: [CART, 'git commit -am "Fix shipping rules"', "git push"], edits: [fixVat] },
  "staging-first": { typed: [CI, 'git commit -am "Production after staging"', "git push"], edits: [(t) => t.replace(/(  production:\n    needs: )build/, "$1[build, staging]")] },
};

const alternatives: Record<string, Play[]> = {
  "needs-a-reviewer": [{ typed: [CI, "git add .", 'git commit -m "env"', "git push", "gh run view"], edits: [whole(workflowYaml(PIPELINE))] }],
  "continuous-deployment": [{ typed: [CI, "git add .github/workflows/pipeline.yml", 'git commit -m "cd"', "git push origin main"], edits: [(t) => `${t.trimEnd()}\n${PROD_JOB.replace("    environment: production\n", "").replace("needs: [build, staging]", "needs: staging")}`] }],
  "gate-holds": [{ typed: ["gh run view --log-failed", CART, "git add src/cart.ts", 'git commit -m "fix"', "git push"], edits: [fixVat] }],
  "staging-first": [{ typed: [CI, 'git commit -am "order"', "git push"], edits: [(t) => t.replace(/(  production:\n    needs: )build/, "$1staging")] }],
};

const wrong: Record<string, Play> = {
  // An approval rule only on staging leaves production unguarded.
  "needs-a-reviewer": { typed: [CI, 'git commit -am "Gate"', "git push"], edits: [(t) => t.replace(/^  staging:\n/m, "  staging:\n    environment: production\n")] },
  // Production deploys, but side by side with staging rather than after it.
  "continuous-deployment": { typed: [CI, 'git commit -am "cd"', "git push"], edits: [whole(workflowYaml(SIDE_BY_SIDE))] },
  // A re-run tests the same broken commit.
  "gate-holds": { typed: ["gh run rerun"], edits: [] },
  // Waiting for the build again changes nothing.
  "staging-first": { typed: [CI, 'git commit -am "order"', "git push"], edits: [(t) => t.replace(/(  production:\n    needs: )build/, "$1[build]")] },
};

describe("ci-vs-cd", () => {
  it("the story: CI only, delivery waits for approval, deployment goes all the way, a red commit goes nowhere", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).envs.staging!.sha).toBe(SHAS[0]);
    expect(latestRun(scene.at(0))!.status).toBe("success");
    expect(latestRun(scene.at(1))!.status).toBe("waiting");
    expect(scene.at(1).envs.staging!.sha).toBe(scene.at(1).heads.main);
    expect(scene.at(1).envs.production!.sha).toBe(SHAS[0]);
    expect(scene.at(2).envs.production!.sha).toBe(scene.at(2).heads.main);
    expect(scene.at(3).envs.production!.sha).toBe(scene.at(3).heads.main);
    expect(latestRun(scene.at(4))!.jobs.map((j) => j.status)).toEqual(["failure", "skipped", "skipped"]);
    expect(scene.at(4).envs.production!.sha).toBe(scene.at(3).heads.main);
    expect(scene.at(5).envs.production!.sha).toBe(scene.at(5).heads.main);
  });

  it("the starts are what their stories say", () => {
    const start = (id: string) => scenarios.find((s) => s.id === id)!.start.world;
    // The unguarded job went to production without waiting, rule or not.
    const u = start("needs-a-reviewer");
    expect(u.envs.production!.approval).toBe(true);
    expect(u.envs.production!.sha).toBe(u.heads.main);
    expect(start("continuous-deployment").envs.production!.sha).toBe(SHAS[0]);
    const g = start("gate-holds");
    expect(latestRun(g)!.status).toBe("failure");
    expect(g.envs.production!.sha).toBe(SHAS[0]);
    const r = latestRun(start("staging-first"))!;
    expect(r.jobs.find((j) => j.id === "production")!.start).toBe(r.jobs.find((j) => j.id === "staging")!.start);
    void UNGUARDED;
    void NO_PROD;
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
