import { l } from "@lets-explain/core/i18n";
import { freshWorld, headOf, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { BUILD, LINT, PREP, TEST, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics, startedNothing } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { CommitLane } from "./CommitLane";
import { BUG_MSG, missions } from "./missions";

export const SLUG = "why-ci-cd";

/** Plain CI: every push to main is linted, tested and built. */
export const CI: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "ci", steps: [...PREP, LINT, TEST, BUILD] }],
};

/** CI plus CD: a green build goes to staging by itself. */
export const CICD: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "ci", steps: [...PREP, LINT, TEST, BUILD, step("upload")] },
    { id: "deploy", needs: ["ci"], steps: [step("download"), step("deploy")] },
  ],
};

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const bug: CiAction = { type: "push", add: ["test"], message: BUG_MSG };

/** Staging runs the first commit; someone put it there by hand. */
export const fresh = (): World => freshWorld({ envs: [{ name: "staging", sha: SHAS[0] }], secrets: { DEPLOY_TOKEN: "dpl_live" } });

export const START: World = fresh();

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "add login page" }, bug],
  [{ type: "push", message: "update footer" }, set(CI), { type: "push", message: "fix typo in README" }],
  [{ type: "push", fix: ["test"], message: "fix VAT rounding" }, { type: "push", add: ["lint"], message: "quick refactor" }],
  [{ type: "push", fix: ["lint"], message: "remove unused variable" }],
  [set(CICD), { type: "push", message: "add search box" }],
  [{ type: "push", add: ["test"], message: "change discount rules" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

const kind = (w: World) => (w.workflows.length === 0 ? "none" : w.workflows[0]!.jobs.length > 1 ? "cicd" : "ci");

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const k = kind(w);
  const broken = headOf(w).bugs.includes("test");
  return [
    {
      label: tr ? "Workflow" : "Workflow",
      buttons: [
        { label: tr ? "CI ekle" : "add CI", action: set(CI), tone: "producer", disabled: k === "ci" },
        { label: tr ? "CI + deploy ekle" : "add CI + deploy", action: set(CICD), tone: "producer", disabled: k === "cicd" },
        { label: tr ? "workflow'u sil" : "delete the workflow", action: { type: "removeWorkflow", name: "CI" }, tone: "danger", disabled: k === "none" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: tr ? "push: sağlam commit" : "push: a good commit", action: { type: "push" }, tone: "go" },
        { label: tr ? "push: hatalı commit" : "push: a broken commit", action: bug, tone: "danger", disabled: broken },
        { label: tr ? "push: düzeltme" : "push: the fix", action: { type: "push", fix: ["test"] }, tone: "ok", disabled: !broken },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda main'e giren commit'ler ve kontrol edilip edilmedikleri, sağda son run ve staging'de çalışan sürüm", "On the left the commits on main and whether anything checked them, on the right the latest run and what staging runs"),
  view: (w, info) => (
    <g>
      <CommitLane world={w} box={{ x: 16, y: 14, w: 300, h: 444 }} />
      <RunStage run={startedNothing(info) ? undefined : focusRun(w, info)} blocked={startedNothing(info)} box={{ x: 332, y: 14, w: 514, h: 316 }} empty={info.lang === "tr" ? "Workflow yok: push'lar hiçbir şey başlatmıyor." : "No workflow: pushes start nothing."} />
      <EnvStrip world={w} box={{ x: 420, y: 342, w: 340, h: 100 }} />
    </g>
  ),
  metrics: (w, t) => [
    { label: t(l("main'deki commit", "Commits on main")), value: w.commits.filter((c) => c.branch === "main").length },
    { label: t(l("Kontrolsüz commit", "Unchecked commits")), value: w.commits.filter((c) => c.n > 1 && !w.runs.some((r) => r.sha === c.sha)).length, tone: "warn" as const },
    ...runMetrics(w, t).slice(0, 1),
  ],
  sandbox: { start: () => fresh(), rows, missions },
});
