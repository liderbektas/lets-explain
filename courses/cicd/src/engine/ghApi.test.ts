import { describe, expect, it } from "vitest";
import { freshWorld, SHAS } from "./ci";
import { deskOf } from "./desk";
import { envId, ghApi, USER_ID } from "./ghApi";
import { ciWorkflow } from "./presets";

const desk = deskOf(freshWorld({ workflows: [ciWorkflow()], envs: [{ name: "production", sha: SHAS[0]! }] }));
const text = (r: { output: { text: string }[] }) => r.output.map((l) => l.text).join("\n");

describe("gh api", () => {
  it("builds nested bodies from -F/-f the way gh does", () => {
    const r = ghApi(desk, ["-X", "PUT", "repos/{owner}/{repo}/environments/production", "-F", "reviewers[][type]=User", "-F", `reviewers[][id]=${USER_ID}`]);
    expect(r.failed).toBeFalsy();
    expect(r.actions).toEqual([{ type: "gh", action: { type: "setEnv", name: "production", approval: true } }]);
    expect(JSON.parse(text(r)).protection_rules[0].type).toBe("required_reviewers");
  });

  it("maps a required check's context to the job it names", () => {
    const r = ghApi(desk, ["-X", "PUT", "repos/ada/shop/branches/main/protection", "-F", "required_status_checks[strict]=true", "-f", "required_status_checks[contexts][]=ci", "-F", "enforce_admins=true", "-F", "required_pull_request_reviews=null", "-F", "restrictions=null"]);
    expect(r.actions).toEqual([{ type: "gh", action: { type: "setProtection", required: ["CI / ci"] } }]);
  });

  it("picks fields with --jq and defaults to GET", () => {
    expect(text(ghApi(desk, ["user", "--jq", ".id"]))).toBe(String(USER_ID));
    expect(text(ghApi(desk, ["repos/{owner}/{repo}/environments", "-q", ".environments[].id"]))).toBe(String(envId("production")));
  });

  it("says plainly what it does not answer", () => {
    const r = ghApi(desk, ["repos/{owner}/{repo}/collaborators"]);
    expect(r.failed).toBe(true);
    expect(text(r)).toContain("gh: Not Found (HTTP 404)");
    expect(text(r)).toContain("this sandbox answers");
  });
});
