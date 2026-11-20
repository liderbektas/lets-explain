import { describe, expect, it } from "vitest";
import { latestRun, SHAS } from "../../engine/ci";
import { envId, USER_ID } from "../../engine/ghApi";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const ENV = "repos/{owner}/{repo}/environments/production";
const PENDING = "repos/{owner}/{repo}/actions/runs/1/pending_deployments";
const REVIEWER = `-F 'reviewers[][type]=User' -F 'reviewers[][id]=${USER_ID}'`;
const PROD = envId("production");
const APPROVE = (id: number) => `gh api -X POST ${PENDING} -F 'environment_ids[]=${id}' -f state=approved -f comment='QA passed on staging'`;
const SET = (env: string, value: string) => `gh secret set DEPLOY_TOKEN --env ${env} --body ${value}`;

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  gate: { typed: ["gh api user --jq .id", `gh api -X PUT ${ENV} ${REVIEWER}`, "git push"], edits: [] },
  approve: { typed: ["gh run list", `gh api ${PENDING}`, APPROVE(PROD)], edits: [] },
  "env-tokens": { typed: [SET("dev", "dpl_dev_4k2"), SET("staging", "dpl_stg_9x1"), SET("production", "dpl_prod_7q8"), "gh run rerun"], edits: [] },
  "by-hand": { typed: [`gh workflow run deploy-by-hand.yml -f version=${SHAS[1]}`], edits: [] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  gate: [
    {
      typed: ["nano production.json", `gh api -X PUT ${ENV} --input production.json`, "git push origin main"],
      edits: [() => `{"reviewers":[{"type":"User","id":${USER_ID}}]}`],
    },
  ],
  approve: [{ typed: ["nano approve.json", `gh api -X POST ${PENDING} --input approve.json`], edits: [() => `{"environment_ids":[${PROD}],"state":"approved","comment":"ok"}`] }],
  "env-tokens": [
    {
      typed: ["gh secret set DEPLOY_TOKEN --env dev", "gh secret set DEPLOY_TOKEN -e staging", "gh secret set DEPLOY_TOKEN --env production", "gh secret list --env production", "gh run rerun 1"],
      edits: [() => "dpl_dev_4k2", () => "dpl_stg_9x1", () => "dpl_prod_7q8"],
    },
  ],
  "by-hand": [{ typed: ["gh workflow list", `gh workflow run "Deploy by hand" -f version=${SHAS[1]}`], edits: [] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Pushing first: the commit flows straight to production before the gate exists.
  gate: { typed: ["git push", `gh api -X PUT ${ENV} ${REVIEWER}`], edits: [] },
  // Taking the gate away does not let the waiting run through.
  approve: { typed: [`gh api -X PUT ${ENV} -F 'reviewers=null'`], edits: [] },
  // One repo-wide token again: it deploys, but every workflow can read it.
  "env-tokens": { typed: ["gh secret set DEPLOY_TOKEN --body dpl_prod_7q8", "gh run rerun"], edits: [] },
  // Re-running the old push run sends the old commit through to production too.
  "by-hand": { typed: ["gh run rerun 1"], edits: [] },
};

describe("environments", () => {
  it("the story: straight to prod, then a gate, a stopped bad version, a fix and a deploy by hand", () => {
    expect(steps).toHaveLength(8);
    const env = (step: number, name: string) => scene.at(step).envs[name]!.sha;
    expect(["dev", "staging", "production"].map((e) => env(0, e))).toEqual([SHAS[1], SHAS[1], SHAS[1]]);
    expect(latestRun(scene.at(1))!.status).toBe("waiting");
    expect(env(1, "staging")).toBe(SHAS[2]);
    expect(env(1, "production")).toBe(SHAS[1]);
    expect(env(2, "production")).toBe(SHAS[2]);
    expect(env(3, "staging")).toBe(SHAS[3]);
    expect(env(3, "production")).toBe(SHAS[2]);
    expect(env(4, "production")).toBe(SHAS[4]);
    expect(scene.at(4).runs.filter((r) => r.status === "waiting")).toHaveLength(1);
    expect(env(5, "staging")).toBe(SHAS[2]);
    expect(env(5, "production")).toBe(SHAS[4]);
  });

  it("gh api answers like GitHub for environments and approvals", () => {
    const approve = scenarios.find((s) => s.id === "approve")!.start;
    const pending = typeInto(approve, [`gh api ${PENDING} --jq '.[].environment.name'`]);
    expect(pending.output).toEqual(["production"]);
    const wrongId = typeInto(approve, [APPROVE(envId("staging"))]);
    expect(wrongId.output.at(-1)).toBe("gh: No pending deployment requests to approve or reject (HTTP 422)");
    const missing = typeInto(approve, [`gh api -X POST ${PENDING} -F 'environment_ids[]=${PROD}' -f state=approved`]);
    expect(missing.output.at(-1)).toBe("gh: Invalid request. (HTTP 422)");
    const gate = scenarios.find((s) => s.id === "gate")!.start;
    expect(typeInto(gate, [`gh api -X PUT ${ENV} -F 'reviewers[][type]=User' -F 'reviewers[][id]=42'`]).output.at(-1)).toBe("gh: Validation Failed (HTTP 422)");
    expect(typeInto(gate, ["gh secret set DEPLOY_TOKEN --env qa --body x"]).output[0]).toMatch(/HTTP 404/);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid|gh: |X )/.test(x)), r.output.join("\n")).toEqual([]);
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
