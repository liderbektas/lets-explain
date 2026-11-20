import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type Workflow, type World } from "../../engine/ci";
import { EnvStrip, PrPanel } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, ciTyped, focusRun, runMetrics } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";
import { PAGES, pagesWf, type Parts } from "./workflow";
export { PAGES, pagesWf, type Parts } from "./workflow";

export const SLUG = "your-pipeline";
export const set = (p: Parts): CiAction => ({ type: "setWorkflow", workflow: pagesWf(p) });

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
  // Typed: the Pages workflow is a real file; push, open PRs and merge from the terminal.
  sandbox: { typed: ciTyped(scenarios) },
});
