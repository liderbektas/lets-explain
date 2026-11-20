import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci.yml";
const UPLOAD = "      - uses: actions/upload-artifact@v4\n        with:\n          name: dist\n          path: dist/\n";
const DOWNLOAD = "      - uses: actions/download-artifact@v4\n        with:\n          name: dist\n          path: dist/\n";
const BUILD = "      - run: npm run build\n";
const PREP = "      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n";
const DEPLOY = "      - run: ./deploy.sh staging\n";

/** Upload after the build job's build (the first `npm run build` in the file). */
const uploadAfterBuild = (t: string) => t.replace(BUILD, BUILD + UPLOAD);
/** Download at the start of the deploy job. */
const downloadInDeploy = (t: string) => t.replace(`    steps:\n${DEPLOY}`, `    steps:\n${DOWNLOAD}${DEPLOY}`);
const bridge = (t: string) => downloadInDeploy(uploadAfterBuild(t));
const moveUpload = (t: string) => t.replace(UPLOAD + BUILD, BUILD + UPLOAD);
/** build uploads; e2e downloads instead of building; deploy only downloads and deploys. */
const buildOnce = (t: string) => {
  const [head, ...rest] = t.split("\n  e2e:\n");
  const [e2e, deploy] = rest.join("\n  e2e:\n").split("\n  deploy:\n");
  return `${uploadAfterBuild(head!)}\n  e2e:\n${e2e!.replace(BUILD, DOWNLOAD)}\n  deploy:\n${deploy!.replace(PREP + BUILD, DOWNLOAD)}`;
};

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  bridge: { typed: ["gh run view --log-failed", CI, 'git commit -am "ci: pass dist/ to deploy"', "git push"], edits: [bridge] },
  "not-found": { typed: ["gh run view --log-failed", CI, 'git commit -am "ci: upload dist"', "git push"], edits: [uploadAfterBuild] },
  "too-early": { typed: ["cat .github/workflows/ci.yml", CI, 'git commit -am "ci: upload after the build"', "git push"], edits: [moveUpload] },
  "test-what-ships": { typed: [CI, 'git commit -am "ci: build once, test and ship the same dist/"', "git push"], edits: [buildOnce] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  bridge: [{ typed: [CI, "git add .github/workflows/ci.yml", 'git commit -m "ci: artifact"', "git push origin main"], edits: [bridge] }],
  "not-found": [{ typed: [CI, "git add .", 'git commit -m "ci: upload-artifact"', "git push"], edits: [uploadAfterBuild] }],
  // Deleting the early upload and writing a new one after the build is the same fix.
  "too-early": [{ typed: [CI, 'git commit -am "ci: fix upload"', "git push"], edits: [(t) => t.replace(UPLOAD, "").replace(BUILD, BUILD + UPLOAD)] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // Staging gets it, but the site was built twice.
  bridge: { typed: [CI, 'git commit -am "ci: build in deploy too"', "git push"], edits: [(t) => t.replace(`    steps:\n${DEPLOY}`, `    steps:\n${PREP}${BUILD}${DEPLOY}`)] },
  // Without the download there is no dist/ at all in deploy.
  "not-found": { typed: [CI, 'git commit -am "ci: drop the download"', "git push"], edits: [(t) => t.replace(DOWNLOAD, "")] },
  // Same files, same failure.
  "too-early": { typed: ["gh run rerun"], edits: [] },
  // Deploy uses the artifact, but e2e still builds its own copy.
  "test-what-ships": { typed: [CI, 'git commit -am "ci: deploy the artifact"', "git push"], edits: [(t) => { const [h, d] = t.split("\n  deploy:\n"); return `${uploadAfterBuild(h!)}\n  deploy:\n${d!.replace(PREP + BUILD, DOWNLOAD)}`; }] },
};

describe("artifacts", () => {
  it("the story: dist/ missing, passed as an artifact, never uploaded, shared by two jobs, not visible to another run", () => {
    expect(steps).toHaveLength(7);
    const r = (s: number) => latestRun(scene.at(s))!;
    expect(r(0).jobs[1]!.failedStep).toBe("Run ./deploy.sh staging");
    expect(r(1).status).toBe("success");
    expect(scene.at(1).envs.staging!.sha).toBe(r(1).sha);
    expect(r(2).jobs[1]!.steps[0]!.log[0]).toContain("Artifact not found for name: dist");
    expect(r(3).jobs.map((j) => [j.id, j.status])).toEqual([
      ["build", "success"],
      ["e2e", "success"],
      ["deploy", "success"],
    ]);
    expect(r(4)).toMatchObject({ workflow: "Redeploy", status: "failure" });
    expect(scene.at(4).envs.staging!.sha).toBe(r(3).sha);
  });

  it("each scenario starts on the failure its story describes", () => {
    const log = (id: string) => latestRun(scenarios.find((s) => s.id === id)!.start.world)!.jobs.flatMap((j) => j.steps.flatMap((s) => s.log)).join("\n");
    expect(log("bridge")).toContain("dist/ not found");
    expect(log("not-found")).toContain("Artifact not found for name: dist");
    expect(log("too-early")).toContain("No files were found with the provided path: dist/");
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
