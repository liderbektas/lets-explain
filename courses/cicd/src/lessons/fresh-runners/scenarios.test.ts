import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { workflowYaml } from "../../engine/yaml";
import { typeInto } from "../shared/missionHelpers";
import { split } from "./model";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const WF = "nano .github/workflows/deploy.yml";
const whole = (yaml: string) => () => yaml;
const DEPLOY_LINE = "      - run: ./deploy.sh staging";
const above = (line: string, add: string) => (t: string) => t.replace(`${line}\n`, `${add}${line}\n`);
const UPLOAD = "      - uses: actions/upload-artifact@v4\n        with:\n          name: dist\n          path: dist/\n";
const DOWNLOAD = "      - uses: actions/download-artifact@v4\n        with:\n          name: dist\n          path: dist/\n";
const REBUILD = "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n      - run: npm run build\n";
/** Adds the upload step at the end of the build job (right before `deploy:`). */
const upload = (t: string) => t.replace("  deploy:\n", `${UPLOAD}  deploy:\n`);

type Play = { typed: string[]; edits: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "dist-not-found": { typed: [WF, 'git commit -am "Pass dist as an artifact"', "git push"], edits: [(t) => above(DEPLOY_LINE, DOWNLOAD)(upload(t))] },
  "no-artifacts": { typed: [WF, 'git commit -am "Build in the deploy job"', "git push"], edits: [above(DEPLOY_LINE, REBUILD)] },
  "no-package-json": { typed: [WF, 'git commit -am "Check out in deploy"', "git push"], edits: [(t) => t.replace(/(  deploy:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n)/, "$1      - uses: actions/checkout@v4\n")] },
  "split-the-job": { typed: [WF, 'git commit -am "Deploy in its own job"', "git push"], edits: [whole(workflowYaml(split(["download"], true)))] },
};

const alternatives: Record<string, Play[]> = {
  "dist-not-found": [{ typed: ["gh run view --log-failed", WF, "git add .", 'git commit -m "artifact"', "git push"], edits: [whole(workflowYaml(split(["download"], true)))] }],
  "no-artifacts": [{ typed: [WF, "git add .github/workflows/deploy.yml", 'git commit -m "rebuild"', "git push"], edits: [whole(workflowYaml(split(["checkout", "setup-node", "install", "build"])))] }],
  // Handing dist over as an artifact also fixes it.
  "no-package-json": [{ typed: [WF, 'git commit -am "artifact"', "git push"], edits: [whole(workflowYaml(split(["download"], true)))] }],
  "split-the-job": [{ typed: ["cat .github/workflows/deploy.yml", WF, "git add -A", 'git commit -m "split"', "git push"], edits: [whole(workflowYaml(split(["download"], true)).replace("needs: build", "needs: [build]"))] }],
};

const wrong: Record<string, Play> = {
  // The code comes back, but dist/ does not: it was built on another machine.
  "dist-not-found": { typed: [WF, 'git commit -am "checkout"', "git push"], edits: [above(DEPLOY_LINE, "      - uses: actions/checkout@v4\n")] },
  // Works, but through an artifact, which is banned here.
  "no-artifacts": { typed: [WF, 'git commit -am "artifact"', "git push"], edits: [whole(workflowYaml(split(["download"], true)))] },
  // A re-run starts the deploy job on another empty machine.
  "no-package-json": { typed: ["gh run rerun"], edits: [] },
  // Split, but the deploy job builds everything again.
  "split-the-job": { typed: [WF, 'git commit -am "split"', "git push"], edits: [whole(workflowYaml(split(["checkout", "setup-node", "install", "build"])))] },
};

describe("fresh-runners", () => {
  it("the story: one job works, splitting loses dist/, checkout does not bring it back, rebuild or artifact fixes it", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).envs.staging!.sha).toBe(scene.at(0).heads.main);
    const lost = latestRun(scene.at(1))!;
    expect(lost.jobs.map((j) => j.status)).toEqual(["success", "failure"]);
    expect(lost.jobs[1]!.steps[0]!.log.join(" ")).toContain("dist/ not found");
    expect(latestRun(scene.at(2))!.jobs[1]!.status).toBe("failure");
    const rebuilt = latestRun(scene.at(3))!;
    const artifact = latestRun(scene.at(4))!;
    expect(rebuilt.status).toBe("success");
    expect(artifact.status).toBe("success");
    expect(artifact.end - artifact.start).toBeLessThan(rebuilt.end - rebuilt.start);
    expect(scene.at(4).envs.staging!.sha).toBe(scene.at(4).heads.main);
  });

  it("the starts are what their stories say", () => {
    const run = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!;
    expect(run("dist-not-found").jobs[1]!.steps.at(-1)!.log.join(" ")).toContain("dist/ not found");
    const enoent = run("no-package-json").jobs[1]!.steps.find((s) => s.status === "failure")!;
    expect(enoent.exit).toBe(254);
    expect(enoent.log.join(" ")).toContain("Could not read package.json");
    expect(run("split-the-job").status).toBe("success");
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
