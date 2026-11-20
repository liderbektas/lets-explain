import { l } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type StepDef, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "after-deploy";

export interface Checks {
  smoke: boolean;
  rollback: boolean;
  notify: boolean;
}

/** Build and test, then deploy to staging, with whichever after-deploy checks are on. */
export function deployWf(c: Checks): Workflow {
  const after: StepDef[] = [];
  if (c.smoke) after.push(step("smoke", { with: { env: "staging" } }));
  if (c.rollback) after.push(step("rollback", { if: "failure", with: { env: "staging" } }));
  if (c.notify) after.push(step("notify", { if: "failure", with: { text: "Deploy to staging failed and was rolled back" } }));
  return {
    name: "Deploy",
    on: { push: { branches: ["main"] } },
    jobs: [
      { id: "build", steps: [...PREP, TEST, BUILD, step("upload")] },
      { id: "deploy", needs: ["build"], environment: "staging", steps: [step("download"), step("deploy", { with: { env: "staging" } }), ...after] },
    ],
  };
}

export const NONE: Checks = { smoke: false, rollback: false, notify: false };
export const ALL: Checks = { smoke: true, rollback: true, notify: true };

export const checksOf = (w: World): Checks => {
  const kinds = w.workflows[0]?.jobs.find((j) => j.id === "deploy")?.steps.map((s) => s.kind) ?? [];
  return { smoke: kinds.includes("smoke"), rollback: kinds.includes("rollback"), notify: kinds.includes("notify") };
};

const set = (c: Checks): CiAction => ({ type: "setWorkflow", workflow: deployWf(c) });
export const toggle = (key: keyof Checks) => (w: World): CiAction => {
  const c = checksOf(w);
  return set({ ...c, [key]: !c[key] });
};

export const freshStart = (): World => freshWorld({ workflows: [deployWf(NONE)], envs: [{ name: "staging", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } });

export const START = freshStart();

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "search filters" }, { type: "push", add: ["crash"], message: "new cart" }],
  [set({ smoke: true, rollback: false, notify: false }), { type: "push", fix: ["crash"], message: "fix cart" }],
  [{ type: "push", add: ["crash"], message: "cart discounts" }],
  [{ type: "rollback", env: "staging" }, set(ALL), { type: "push", message: "discounts, second try" }],
  [],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const c = checksOf(w);
  const broken = crashed(w, w.heads.main);
  const label = (on: boolean, name: string) => (on ? (tr ? `${name} adımını sil` : `remove ${name}`) : tr ? `${name} adımı ekle` : `add ${name}`);
  return [
    {
      label: "Workflow",
      buttons: [
        { label: label(c.smoke, "smoke test"), action: toggle("smoke")(w), tone: c.smoke ? "danger" : "producer" },
        { label: label(c.rollback, "rollback (if: failure())"), action: toggle("rollback")(w), tone: c.rollback ? "danger" : "producer" },
        { label: label(c.notify, "notify (if: failure())"), action: toggle("notify")(w), tone: c.notify ? "danger" : "producer" },
      ],
    },
    {
      label: tr ? "Kod" : "Code",
      buttons: [
        { label: tr ? "push: değişiklik" : "push: a change", action: { type: "push" }, tone: "go" },
        { label: tr ? "push: bug'lı değişiklik" : "push: a buggy change", action: { type: "push", add: ["crash"] }, tone: "danger", disabled: broken },
        { label: tr ? "push: düzeltme" : "push: a fix", action: { type: "push", fix: ["crash"] }, tone: "ok", disabled: !broken },
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
    "Üstte build ve deploy job'ları, altta staging'de çalışan commit ve sağlık durumu",
    "The build and deploy jobs on top; below, the commit staging runs and whether it is healthy",
  ),
  view: (w, info) => (
    <g>
      <RunStage run={focusRun(w, info)} box={{ x: 16, y: 10, w: 828, h: 318 }} focus="deploy" />
      <EnvStrip world={w} box={{ x: 250, y: 336, w: 360, h: 108 }} names={["staging"]} />
    </g>
  ),
  metrics: (w, t) => [
    ...runMetrics(w, t).slice(0, 1),
    { label: "staging", value: w.envs.staging?.sha ?? "—", tone: crashed(w, w.envs.staging?.sha) ? "danger" : "ok" },
    { label: t(l("Staging sağlık", "Staging health")), value: crashed(w, w.envs.staging?.sha) ? "500" : "200", tone: crashed(w, w.envs.staging?.sha) ? "danger" : "ok" },
  ],
  sandbox: { start: freshStart, rows, missions },
});
