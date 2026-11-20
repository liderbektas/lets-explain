import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { NEW_TOKEN, scenarios, TOKEN } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const REL = "nano .github/workflows/release.yml";
const paste = (value: string) => () => value;
const fromSecret = (name: string) => (t: string) => t.replace(/NODE_AUTH_TOKEN: .*/, `NODE_AUTH_TOKEN: \${{ secrets.${name} }}`);
const under = (anchor: string, line: string) => (t: string) => {
  if (!t.includes(anchor)) throw new Error(`no ${JSON.stringify(anchor)} in the workflow`);
  return t.replace(anchor, `${anchor}${line}\n`);
};
const PUBLISH = "  publish:\n    needs: test\n";

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  "first-release": { typed: ["gh secret set NPM_TOKEN", "gh run rerun"], edits: [paste(TOKEN)] },
  "leaked-token": { typed: [`gh secret set NPM_TOKEN --body ${NEW_TOKEN}`, REL, 'git commit -am "Read the npm token from a secret"', "git push"], edits: [fromSecret("NPM_TOKEN")] },
  "fork-pr": { typed: [REL, 'git commit -am "Publish only on push"', "git push"], edits: [under(PUBLISH, "    if: github.event_name == 'push'")] },
  "team-secret": { typed: [REL, 'git commit -am "Use the team\'s npm secret"', "git push"], edits: [fromSecret("NPM_PUBLISH_TOKEN")] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "first-release": [
    { typed: [`gh secret set NPM_TOKEN --body ${TOKEN}`, "gh secret list", "gh run rerun --failed"], edits: [] },
    { typed: [`gh secret set NPM_TOKEN -b ${TOKEN}`, "gh run list", "gh run rerun 1"], edits: [] },
  ],
  "leaked-token": [{ typed: ["gh secret set NPM_TOKEN", REL, "git add .github/workflows/release.yml", 'git commit -m "secret"', "git push origin main"], edits: [paste(NEW_TOKEN), fromSecret("NPM_TOKEN")] }],
  "fork-pr": [
    { typed: [REL, 'git commit -am "Publish from main only"', "git push"], edits: [under(PUBLISH, "    if: github.ref == 'refs/heads/main'")] },
    // On the step instead of the job: the job runs, the publish step is skipped on PRs.
    { typed: [REL, 'git commit -am "Skip publish on PRs"', "git push"], edits: [under("      - run: npm publish\n", "        if: github.event_name == 'push'")] },
  ],
  "team-secret": [{ typed: ["gh secret list", REL, "git add .", 'git commit -m "team secret"', "git push"], edits: [fromSecret("NPM_PUBLISH_TOKEN")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // It publishes, and the token is now in the git history for anyone to read.
  "first-release": { typed: [REL, 'git commit -am "token"', "git push"], edits: [(t) => t.replace("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}", `NODE_AUTH_TOKEN: ${TOKEN}`)] },
  // Swapping in the new token, still in plain text.
  "leaked-token": { typed: [REL, 'git commit -am "new token"', "git push"], edits: [(t) => t.replace(TOKEN, NEW_TOKEN)] },
  // No more PR runs at all: the contributor's typo fix is never tested.
  "fork-pr": { typed: [REL, 'git commit -am "no PRs"', "git push"], edits: [(t) => t.replace("  pull_request:\n", "")] },
  // A copied (guessed) token in a new secret: npm refuses it, and the team said not to.
  "team-secret": { typed: ["gh secret set NPM_TOKEN --body copied-from-slack", "gh run rerun"], edits: [] },
};

describe("secrets", () => {
  it("the story: no secret fails, the secret publishes and is masked, the fork gets nothing, push-only fixes the fork", () => {
    expect(steps).toHaveLength(7);
    const publishStep = (n: number) => latestRun(scene.at(n))!.jobs.find((j) => j.id === "publish")!;
    expect(publishStep(1).failedStep).toBe("Run npm publish");
    const ok = publishStep(2);
    expect(ok.status).toBe("success");
    expect(ok.steps.find((s) => s.kind === "print-secret")!.log).toEqual(["token: ***"]);
    expect(ok.steps.flatMap((s) => s.log).join("\n")).not.toContain("npm_8f2k");
    const fork = latestRun(scene.at(3))!;
    expect(fork.fork).toBe(true);
    expect(fork.jobs.find((j) => j.id === "publish")!.failedStep).toBe("Run npm publish");
    const fixed = latestRun(scene.at(4))!;
    expect(fixed.status).toBe("success");
    expect(fixed.jobs.map((j) => j.status)).toEqual(["success", "skipped"]);
  });

  it("npm answers like npm: no token is ENEEDAUTH, a token that isn't one is E401", () => {
    const s = scenarios.find((x) => x.id === "first-release")!;
    const log = (r: ReturnType<typeof typeInto>) => latestRun(r.ctx.state.world)!.jobs.find((j) => j.id === "publish")!.steps.find((x) => x.kind === "publish")!.log;
    expect(log(typeInto(s.start, ["gh run rerun"]))[0]).toBe("npm error code ENEEDAUTH");
    expect(log(typeInto(s.start, ["gh secret set NPM_TOKEN --body hunter2", "gh run rerun"]))[0]).toBe("npm error code E401");
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
