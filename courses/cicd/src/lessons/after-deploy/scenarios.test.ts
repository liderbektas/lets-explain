import { describe, expect, it } from "vitest";
import { latestRun, SHAS } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { crashed, scene, steps } from "./Scene";

const DEPLOY = "nano .github/workflows/deploy.yml";

type Edit = (t: string) => string;
/** Adds lines at the end of the deploy job (the file's last job). */
const append = (...lines: string[]): Edit => (t) => `${t.replace(/\s+$/, "")}\n${lines.join("\n")}`;
const SMOKE = "      - run: curl --fail --retry 3 https://staging.shop.example/health";
const ROLLBACK = ["      - run: ./deploy.sh staging --previous", "        if: failure()", "        env:", "          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}"];
const NOTIFY = ['      - run: ./notify.sh "Deploy to staging failed and was rolled back"', "        if: failure()"];

const solutions: Record<string, { typed: string[]; edits: Edit[] }> = {
  catch: { typed: [DEPLOY, 'git commit -am "Smoke test"', "git push"], edits: [append(SMOKE)] },
  "self-heal": { typed: [DEPLOY, 'git commit -am "Roll back on failure"', "git push"], edits: [append(...ROLLBACK)] },
  "tell-team": { typed: [DEPLOY, 'git commit -am "Tell the team"', "git push"], edits: [append(...NOTIFY)] },
  "fix-forward": { typed: ["gh pr merge 1"], edits: [] },
};

const alternatives: Record<string, { typed: string[]; edits: Edit[] }[]> = {
  catch: [{ typed: [DEPLOY, "git add .", 'git commit -m "check staging"', "git push origin main"], edits: [append("      - name: Smoke test", "        run: curl -f https://staging.shop.example/health")] }],
  // Smoke test and rollback both still in one go, rollback without its env.
  "self-heal": [{ typed: [DEPLOY, "git commit -am heal", "git push"], edits: [append("      - run: ./deploy.sh staging --previous", "        if: ${{ failure() }}")] }],
  "tell-team": [{ typed: ["gh run list", DEPLOY, "git commit -a", "git push"], edits: [append('      - run: ./notify.sh "Staging was rolled back"', "        if: failure()"), () => "Notify on rollback"] }],
  "fix-forward": [{ typed: ["gh pr list", "gh pr checks 1", "gh pr merge"], edits: [] }],
};

const wrong: Record<string, { typed: string[]; edits: Edit[] }> = {
  // Saved and committed, never pushed: the old workflow ships nothing new.
  catch: { typed: [DEPLOY, 'git commit -am "Smoke test"'], edits: [append(SMOKE)] },
  // A rollback step without `if: failure()` is skipped once the smoke test fails.
  "self-heal": { typed: [DEPLOY, 'git commit -am "Roll back"', "git push"], edits: [append("      - run: ./deploy.sh staging --previous")] },
  // The message without `if: failure()` never goes out after a failure.
  "tell-team": { typed: [DEPLOY, 'git commit -am "Tell"', "git push"], edits: [append('      - run: ./notify.sh "Deploy to staging failed and was rolled back"')] },
  // Re-running the failed deploy ships the same broken cart again.
  "fix-forward": { typed: ["gh run rerun"], edits: [] },
};

describe("after-deploy", () => {
  it("the story: green but broken, a smoke test that catches it, then an automatic rollback", () => {
    expect(steps).toHaveLength(7);
    const at = (s: number) => scene.at(s);
    expect(latestRun(at(0))!.status).toBe("success");
    expect(crashed(at(0), at(0).envs.staging!.sha)).toBe(true);
    expect(latestRun(at(1))!.status).toBe("success");
    expect(at(1).envs.staging!.sha).toBe(SHAS[3]);
    expect(latestRun(at(2))!.status).toBe("failure");
    expect(at(2).envs.staging!.sha).toBe(SHAS[4]);
    const last = latestRun(at(3))!;
    expect(last.status).toBe("failure");
    expect(last.jobs[1]!.steps.map((s) => s.status)).toEqual(["success", "success", "failure", "success", "success"]);
    expect(at(3).envs.staging!.sha).toBe(SHAS[3]);
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
