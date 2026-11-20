import { describe, expect, it } from "vitest";
import { GOOD_SHA } from "./model";
import { scenarios } from "./scenarios";
import { readLpWorkflow, typeIntoLp } from "./shell";
import { scene, steps } from "./Scene";

const CI = "nano .github/workflows/ci.yml";
const lastRun = (step: number) => scene.at(step).runs.at(-1)!;

type Edit = (t: string) => string;
const pin: Edit = (t) => t.replace("acme/lint-action@v1", `acme/lint-action@${GOOD_SHA} # v1.4.2`);
const topRead: Edit = (t) => t.replace("permissions: write-all", "permissions:\n  contents: read");
const publishWrites: Edit = (t) => t.replace("  publish:\n    needs: lint\n", "  publish:\n    needs: lint\n    permissions:\n      contents: read\n      packages: write\n");
const readAll: Edit = (t) => t.replace("permissions: write-all", "permissions: read-all");
const writeAll: Edit = (t) => t.replace(/permissions:\n  contents: read|permissions: read-all/, "permissions: write-all");
const DEPENDABOT_FILE = "version: 2\nupdates:\n  - package-ecosystem: github-actions\n    directory: /\n    schedule:\n      interval: weekly";

const solutions: Record<string, { typed: string[]; edits: Edit[] }> = {
  contain: { typed: [CI, 'git commit -am "Pin lint-action"', "git push"], edits: [pin] },
  "both-locks": { typed: [CI, 'git commit -am "Least privilege"', "git push"], edits: [(t) => publishWrites(topRead(pin(t)))] },
  "too-tight": { typed: [CI, 'git commit -am "Let publish push"', "git push"], edits: [publishWrites] },
  "keep-fresh": { typed: ["nano .github/dependabot.yml", "git add .github/dependabot.yml", 'git commit -m "Dependabot for actions"', "git push"], edits: [() => DEPENDABOT_FILE] },
};

const alternatives: Record<string, { typed: string[]; edits: Edit[] }[]> = {
  // The token's rights alone also contain it: the bad code runs but can write nothing.
  contain: [
    { typed: [CI, "git add .", 'git commit -m "least privilege"', "git push origin main"], edits: [(t) => publishWrites(topRead(t))] },
    { typed: ["git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2", CI, "git commit -a", "git push"], edits: [pin, () => "Pin lint-action to v1.4.2"] },
  ],
  "both-locks": [{ typed: [CI, 'git commit -am "pin"', "git push", CI, 'git commit -am "perms"', "git push"], edits: [pin, (t) => publishWrites(topRead(t))] }],
  "too-tight": [{ typed: [CI, "git commit -am fix", "git push"], edits: [(t) => t.replace("permissions: read-all", "permissions:\n  contents: read").replace("  publish:\n    needs: lint\n", "  publish:\n    needs: lint\n    permissions:\n      packages: write\n      contents: read\n")] }],
  "keep-fresh": [{ typed: ["mkdir -p .github", "nano .github/dependabot.yml", "git add .", "git commit -m dependabot", "git push origin main"], edits: [() => `${DEPENDABOT_FILE.replace("weekly", "daily")}\n`] }],
};

const wrong: Record<string, { typed: string[]; edits: Edit[] }> = {
  // Read-only everywhere: nothing bad gets in, but nothing gets published either.
  contain: { typed: [CI, 'git commit -am "read-all"', "git push"], edits: [readAll] },
  // One lock is not both.
  "both-locks": { typed: [CI, 'git commit -am "Pin"', "git push"], edits: [pin] },
  // Giving everything write again: published, but lint can write too.
  "too-tight": { typed: [CI, 'git commit -am "write-all"', "git push"], edits: [writeAll] },
  // `commit -a` does not take a new file: nothing reaches GitHub.
  "keep-fresh": { typed: ["nano .github/dependabot.yml", 'git commit -am "Dependabot"', "git push"], edits: [() => DEPENDABOT_FILE] },
};

describe("least-privilege", () => {
  it("the story: clean, a moved tag tampers, pinning fixes it, read-all breaks publish, per-job contains bad code", () => {
    expect(steps).toHaveLength(7);
    expect(lastRun(0)).toMatchObject({ code: "good", attack: null, publish: "pushed" });
    expect(lastRun(1)).toMatchObject({ code: "bad", attack: { repo: true, registry: true } });
    expect(scene.at(1).tampered).toBe(true);
    expect(lastRun(2)).toMatchObject({ code: "good", publish: "pushed" });
    expect(scene.at(2).tampered).toBe(false);
    expect(lastRun(3).publish).toBe("denied");
    const w4 = scene.at(4);
    expect(w4.runs.at(-2)).toMatchObject({ code: "good", publish: "pushed", perms: "per-job" });
    expect(w4.runs.at(-1)).toMatchObject({ code: "bad", attack: { repo: false, registry: false }, publish: "pushed" });
    expect(w4.tampered).toBe(false);
  });

  it("reads permissions and the action's ref from the workflow file like GitHub", () => {
    expect(readLpWorkflow("on: push\njobs:\n  lint:\n    steps:\n      - uses: acme/lint-action@v1\n  publish:\n    steps: []")).toEqual({ perms: "write-all", pinned: false });
    expect(readLpWorkflow(`permissions:\n  contents: read\njobs:\n  lint:\n    steps:\n      - uses: acme/lint-action@${GOOD_SHA}\n  publish:\n    permissions:\n      packages: write\n    steps: []`)).toEqual({ perms: "per-job", pinned: true });
    expect(readLpWorkflow("permissions: read-all\njobs:\n  lint:\n    steps:\n      - uses: acme/lint-action@a1b2c3d\n  publish:\n    steps: []")).toMatch(/Unable to resolve action/);
  });

  it("git ls-remote shows where the tags point", () => {
    const r = typeIntoLp(scenarios[0]!.start, ["git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2"]);
    expect(r.output).toEqual([`${GOOD_SHA}\trefs/tags/v1.4.2`]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeIntoLp(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeIntoLp(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Error|Invalid)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeIntoLp(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeIntoLp(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
