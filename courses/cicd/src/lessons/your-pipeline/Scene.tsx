import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type JobDef, type StepDef, type Workflow, type World } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { EnvStrip, PrPanel } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "your-pipeline";
export const PAGES = "github-pages";

export interface Parts {
  test: boolean;
  upload: boolean;
  deploy: boolean;
  onlyMain: boolean;
}

const UPLOAD = step("upload", { name: "Run actions/upload-pages-artifact@v4" });
const FETCH = step("download", { name: "fetch the Pages artifact" });
const DEPLOY_PAGES = step("deploy", { name: "Run actions/deploy-pages@v4", with: { env: PAGES } });

/** This site's own pipeline, built up piece by piece. */
export function pagesWf(p: Parts): Workflow {
  const build: StepDef[] = [CHECKOUT, SETUP, INSTALL, ...(p.test ? [TEST] : []), BUILD, ...(p.upload ? [UPLOAD] : [])];
  const jobs: JobDef[] = [{ id: "build", steps: build }];
  if (p.deploy) jobs.push({ id: "deploy", needs: ["build"], environment: PAGES, ...(p.onlyMain ? { if: "main" as const } : {}), steps: [FETCH, DEPLOY_PAGES] });
  return { name: "Pages", on: { push: { branches: ["main"] }, pull_request: {} }, jobs };
}

export const partsOf = (w: World): Parts => {
  const wf = w.workflows.find((x) => x.name === "Pages");
  const build = wf?.jobs.find((j) => j.id === "build")?.steps.map((s) => s.kind) ?? [];
  const deploy = wf?.jobs.find((j) => j.id === "deploy");
  return { test: build.includes("test"), upload: build.includes("upload"), deploy: Boolean(deploy), onlyMain: deploy?.if === "main" };
};

export const set = (p: Parts): CiAction => ({ type: "setWorkflow", workflow: pagesWf(p) });
export const add = (key: keyof Parts) => (w: World): CiAction => set({ ...partsOf(w), [key]: true });

const world = (workflows: Workflow[]) => freshWorld({ workflows, envs: [{ name: PAGES }], secrets: { DEPLOY_TOKEN: "pages-oidc" } });

export const START: World = world([]);

const BUILD_ONLY: Parts = { test: true, upload: false, deploy: false, onlyMain: false };
const WITH_DEPLOY: Parts = { test: true, upload: true, deploy: true, onlyMain: false };
export const FULL: Parts = { test: true, upload: true, deploy: true, onlyMain: true };

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "update README" }],
  [set(BUILD_ONLY), { type: "push", message: "Add the Pages workflow" }],
  [set(WITH_DEPLOY), { type: "push", message: "Deploy to Pages" }],
  [{ type: "push", branch: "feature", paths: ["courses/cicd/src/glossary.ts"], message: "new glossary terms" }, { type: "openPr", branch: "feature" }],
  [set(FULL), { type: "push", branch: "feature", paths: ["courses/cicd/src/glossary.ts"], message: "more terms" }],
  [{ type: "setProtection", required: ["Pages / build"] }, { type: "push", branch: "feature", add: ["test"], message: "rename a term" }, { type: "merge", pr: 1 }],
  [{ type: "push", branch: "feature", fix: ["test"], message: "fix the test" }, { type: "merge", pr: 1 }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

/** The try-it step: a half-finished pipeline (no tests, no upload, deploys from anywhere). */
export const sandboxStart = (): World => world([pagesWf({ test: false, upload: false, deploy: true, onlyMain: false })]);

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const p = partsOf(w);
  const pr = w.prs.find((x) => x.state === "open");
  return [
    {
      label: "Workflow",
      buttons: [
        { label: tr ? "+ npm test" : "+ npm test", action: add("test")(w), tone: "producer", disabled: p.test },
        { label: "+ upload-pages-artifact", action: add("upload")(w), tone: "producer", disabled: p.upload },
        { label: tr ? "deploy: sadece main'de (if)" : "deploy: main only (if)", action: add("onlyMain")(w), tone: "producer", disabled: p.onlyMain },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "push main", action: { type: "push" }, tone: "go" },
        { label: tr ? "push main: kırık test" : "push main: broken test", action: { type: "push", add: ["test"] }, tone: "danger" },
        { label: "push feature", action: { type: "push", branch: "feature" }, tone: "go" },
        { label: tr ? "PR aç: feature → main" : "open PR: feature → main", action: { type: "openPr", branch: "feature" }, tone: "plain", disabled: !w.heads.feature || Boolean(pr) },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l(
    "Bu sitenin kendi pipeline'ı: build ve deploy job'ları, açık PR ve GitHub Pages'te yayında olan commit",
    "This site's own pipeline: the build and deploy jobs, the open PR, and the commit live on GitHub Pages",
  ),
  view: (w, info) => {
    const run = focusRun(w, info);
    const showPr = !info.sandbox && (info.step === 5 || info.step === 6) && w.prs.length > 0;
    if (showPr) {
      return (
        <g>
          <RunStage run={run} box={{ x: 16, y: 8, w: 828, h: 246 }} />
          <PrPanel world={w} pr={1} box={{ x: 16, y: 260, w: 500, h: 202 }} />
          <EnvStrip world={w} box={{ x: 540, y: 310, w: 300, h: 108 }} names={[PAGES]} />
        </g>
      );
    }
    return (
      <g>
        <RunStage run={run} box={{ x: 16, y: 10, w: 828, h: 318 }} empty={w.workflows.length ? undefined : info.lang === "tr" ? "Henüz bir workflow yok: push'lar hiçbir şey başlatmıyor." : "No workflow yet: pushes start nothing."} />
        <EnvStrip world={w} box={{ x: 250, y: 336, w: 360, h: 108 }} names={[PAGES]} />
      </g>
    );
  },
  metrics: (w, t) => [...runMetrics(w, t).slice(0, 2), { label: t(l("Yayında", "Live")), value: w.envs[PAGES]?.sha ?? "—", tone: w.envs[PAGES]?.sha ? "ok" : "plain" }],
  sandbox: { start: sandboxStart, rows, missions },
});
