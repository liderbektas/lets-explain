import { describe, expect, it } from "vitest";
import { SHAS } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { crashed, scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const GOOD = SHAS[1]!;
const promote = (env: string, sha = GOOD) => `gh workflow run promote.yml -f environment=${env} -f version=${sha}`;
const REBUILD_FILE = ".github/workflows/deploy-rebuild.yml";

/** What a reader would type. Exactly par commands. */
const solutions: Record<string, Way> = {
  "ship-what-was-tested": { typed: ["gh run list", promote("production")], edits: [] },
  "staging-first": { typed: [promote("staging"), promote("production")], edits: [] },
  "roll-back": { typed: [promote("production")], edits: [] },
  "retire-rebuild": { typed: ["ls .github/workflows", `rm ${REBUILD_FILE}`, 'git commit -am "Remove the rebuild workflow"', "git push"], edits: [] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "ship-what-was-tested": [{ typed: [`gh workflow run Promote -f version=${GOOD} -f environment=production`], edits: [] }],
  "staging-first": [{ typed: ["gh workflow list", promote("staging"), "gh run list", promote("production")], edits: [] }],
  "roll-back": [{ typed: [`gh workflow run promote.yml --ref main -f environment=production -f version=${GOOD}`], edits: [] }],
  "retire-rebuild": [{ typed: [`rm ${REBUILD_FILE}`, "git add .", 'git commit -m "ci: drop rebuild"', "git push origin main"], edits: [] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Rebuilding from main ships the untested commit.
  "ship-what-was-tested": { typed: ["gh workflow run deploy-rebuild.yml -f environment=production"], edits: [] },
  // Straight to production: it never ran on staging.
  "staging-first": { typed: [promote("production")], edits: [] },
  // A rebuild installs main again: the broken commit.
  "roll-back": { typed: ["gh workflow run deploy-rebuild.yml -f environment=production"], edits: [] },
  // The wrong file: the road to production is gone, the dangerous one stays.
  "retire-rebuild": { typed: ["rm .github/workflows/promote.yml", 'git commit -am "remove"', "git push"], edits: [] },
};

describe("build-once", () => {
  it("the story: a rebuild ships the untested commit; build once ships the tested image", () => {
    expect(steps).toHaveLength(7);
    const env = (step: number, name: string) => scene.at(step).envs[name]!.sha;
    expect(env(0, "staging")).toBe(SHAS[1]);
    expect(env(1, "production")).toBe(SHAS[2]);
    expect(crashed(scene.at(1), SHAS[2]!)).toBe(true);
    expect(Object.keys(scene.at(2).registry)).toEqual([`sha-${SHAS[3]}`]);
    expect(env(2, "staging")).toBe(SHAS[3]);
    expect(Object.keys(scene.at(3).registry)).toHaveLength(2);
    expect(env(3, "staging")).toBe(SHAS[3]);
    expect(scene.at(4).heads.main).toBe(SHAS[4]);
    expect(env(4, "production")).toBe(SHAS[3]);
    expect(scene.run.states.at(-1)!.runs.every((r) => r.status === "success")).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid|X |could not)/.test(x)), r.output.join("\n")).toEqual([]);
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
