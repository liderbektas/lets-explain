import { l } from "@lets-explain/core/i18n";
import { freshWorld, headOf, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "ci-vs-cd";

const BUILD_JOB = { id: "build", steps: [...PREP, TEST, BUILD, step("upload")] };

/** Only CI: the run ends at a green build. */
export const CI_ONLY: Workflow = { name: "Pipeline", on: { push: { branches: ["main"] } }, jobs: [BUILD_JOB] };

/** The whole pipeline: build, then staging, then production behind its environment. */
export const PIPELINE: Workflow = {
  name: "Pipeline",
  on: { push: { branches: ["main"] } },
  jobs: [
    BUILD_JOB,
    { id: "staging", needs: ["build"], steps: [step("download"), step("deploy", { with: { env: "staging" } })] },
    { id: "production", needs: ["build", "staging"], environment: "production", steps: [step("download"), step("deploy", { with: { env: "production" } })] },
  ],
};

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const gate = (on: boolean): CiAction => ({ type: "setEnv", name: "production", approval: on });

export const fresh = (workflows: Workflow[] = [], approval = false): World =>
  freshWorld({
    workflows,
    envs: [
      { name: "staging", sha: SHAS[0] },
      { name: "production", sha: SHAS[0], approval },
    ],
    secrets: { DEPLOY_TOKEN: "dpl_live" },
  });

export const START: World = fresh();

const specs: Spec<World, CiAction>[][] = [
  [set(CI_ONLY), { type: "push", message: "add wishlist" }],
  [set(PIPELINE), gate(true), { type: "push", message: "wishlist: share button" }],
  [{ type: "approve" }],
  [gate(false), { type: "push", message: "faster product page" }],
  [{ type: "push", add: ["test"], message: "new shipping rules" }],
  [{ type: "push", fix: ["test"], message: "fix shipping rules" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const broken = headOf(w).bugs.includes("test");
  const on = Boolean(w.envs.production?.approval);
  return [
    {
      label: "Git",
      buttons: [
        { label: tr ? "push: sağlam commit" : "push: a good commit", action: { type: "push" }, tone: "go" },
        { label: tr ? "push: hatalı commit" : "push: a broken commit", action: { type: "push", add: ["test"] }, tone: "danger", disabled: broken },
        { label: tr ? "push: düzeltme" : "push: the fix", action: { type: "push", fix: ["test"] }, tone: "ok", disabled: !broken },
      ],
    },
    {
      label: "Production",
      buttons: [
        { label: tr ? "deploy'u onayla" : "approve the deploy", action: { type: "approve" }, tone: "ok", disabled: !w.runs.some((r) => r.status === "waiting") },
        { label: on ? (tr ? "onay şartını kaldır" : "drop the approval rule") : tr ? "onay şartı koy" : "require an approval", action: gate(!on), tone: "producer" },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Üstte pipeline'ın son run'ı, altta staging ve production'da çalışan commit'ler", "The pipeline's latest run on top, the commits staging and production run below"),
  view: (w, info) => (
    <g>
      <RunStage run={focusRun(w, info)} box={{ x: 20, y: 14, w: 820, h: 300 }} />
      <EnvStrip world={w} box={{ x: 230, y: 330, w: 400, h: 108 }} names={["staging", "production"]} lit={info.last.some((e) => e.type === "deployed" && e.env === "production") ? "production" : undefined} />
    </g>
  ),
  metrics: (w, t) => [
    { label: t(l("Production onayı", "Production approval")), value: w.envs.production?.approval ? t(l("gerekli", "required")) : t(l("yok", "none")), tone: w.envs.production?.approval ? ("warn" as const) : ("plain" as const) },
    { label: "staging", value: w.envs.staging?.sha ?? "—" },
    { label: "production", value: w.envs.production?.sha ?? "—" },
  ],
  sandbox: { start: () => fresh([PIPELINE], true), rows, missions },
});
