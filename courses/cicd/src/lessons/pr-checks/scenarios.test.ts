import { describe, expect, it } from "vitest";
import { blockingChecks, checksFor, latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const BODY = (ctx: string) => `{"required_status_checks":{"strict":true,"contexts":["${ctx}"]},"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null}`;
const PUT = "gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input protection.json";
const FIELDS = (ctx: string) =>
  `gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F 'required_status_checks[strict]=true' -f 'required_status_checks[contexts][]=${ctx}' -F enforce_admins=true -F required_pull_request_reviews=null -F restrictions=null`;
const DELETE = "gh api -X DELETE repos/{owner}/{repo}/branches/main/protection";

const fixVat = (t: string) => t.replace("1.18", "1.2");
const fixLint = (t: string) => t.replace("  const total = subtotal;\n", "");

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  guard: { typed: ["nano protection.json", PUT], edits: [() => BODY("ci")] },
  "fix-the-pr": { typed: ["git switch feature", "nano src/cart.ts", 'git commit -am "fix: VAT rate"', "git push", "gh pr merge"], edits: [fixVat] },
  "ghost-check": { typed: ["nano protection.json", PUT, "gh pr merge 1"], edits: [() => BODY("test")] },
  "protect-and-land": {
    typed: ["nano protection.json", PUT, "git switch feature", "nano src/cart.ts", 'git commit -am "fix: lint"', "git push", "gh pr merge"],
    edits: [() => BODY("ci"), fixLint],
  },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  guard: [{ typed: [FIELDS("ci")], edits: [] }],
  "fix-the-pr": [
    { typed: ["git checkout feature", "nano src/cart.ts", "git add src/cart.ts", 'git commit -m "fix VAT"', "git push origin feature", "gh pr checks", "gh pr merge 1"], edits: [fixVat] },
  ],
  "ghost-check": [
    { typed: [FIELDS("test"), "gh pr merge 1"], edits: [] },
    // Or name the job `ci` again, on the PR's branch, so the required check arrives.
    { typed: ["git switch feature", "nano .github/workflows/ci.yml", 'git commit -am "ci: name the job ci again"', "git push", "gh pr merge"], edits: [(t) => t.replace(/^ {2}test:$/m, "  ci:")] },
  ],
  "protect-and-land": [{ typed: [FIELDS("ci"), "git switch feature", "nano src/cart.ts", 'git commit -am "fix: lint"', "git push", "gh pr merge 1"], edits: [fixLint] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Merging first, then protecting: the red PR is already in.
  guard: { typed: ["gh pr merge 1", "nano protection.json", PUT], edits: [() => BODY("ci")] },
  // Switching protection off to get the red PR in.
  "fix-the-pr": { typed: [DELETE, "gh pr merge 1"], edits: [] },
  // Same: the merge goes through, but main is left unguarded.
  "ghost-check": { typed: [DELETE, "gh pr merge 1"], edits: [] },
  // Merge first and protect after: main is red and the rule came too late.
  "protect-and-land": { typed: ["gh pr merge 1", "nano protection.json", PUT], edits: [() => BODY("ci")] },
};

describe("pr-checks", () => {
  it("the story: red PR merges into unprotected main, then protection blocks one, then a renamed job leaves a check expected", () => {
    expect(steps).toHaveLength(8);
    expect(checksFor(scene.at(0), 1)).toEqual([{ name: "CI / ci", state: "failure", required: false }]);
    expect(scene.at(1).prs[0]!.state).toBe("merged");
    expect(latestRun(scene.at(1))!).toMatchObject({ branch: "main", status: "failure" });
    expect(scene.at(3).prs[1]!.state).toBe("open");
    expect(scene.run.events[scene.stepEnd(3) - 1]![0]).toMatchObject({ type: "mergeBlocked", checks: ["CI / ci"] });
    expect(scene.at(4).prs[1]!.state).toBe("merged");
    expect(latestRun(scene.at(4))!).toMatchObject({ branch: "main", status: "success" });
    expect(scene.at(5).prs[2]!.state).toBe("open");
    expect(blockingChecks(scene.at(5), 3)).toEqual(["CI / ci"]);
    expect(checksFor(scene.at(5), 3).find((c) => c.name === "CI / test")!.state).toBe("success");
  });

  it("gh api answers like GitHub: a missing field is a 422, an unprotected branch a 404", () => {
    const start = scenarios[0]!.start;
    expect(typeInto(start, ["gh api repos/{owner}/{repo}/branches/main/protection"]).output.at(-1)).toBe("gh: Branch not protected (HTTP 404)");
    const partial = typeInto(start, ["gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F 'required_status_checks[strict]=true' -f 'required_status_checks[contexts][]=ci'"]);
    expect(partial.output.at(-1)).toBe("gh: Invalid request. (HTTP 422)");
    expect(partial.ctx.state.world.protection).toBeNull();
    const ok = typeInto(start, [FIELDS("ci"), "gh pr merge 1"]);
    expect(ok.output.some((x) => /^X Pull request #1 is not mergeable/.test(x))).toBe(true);
    expect(ok.ctx.state.world.prs[0]!.state).toBe("open");
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
      expect(s.check(r.ctx)).toBe(true);
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
