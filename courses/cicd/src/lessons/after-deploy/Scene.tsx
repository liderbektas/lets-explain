import { l } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics } from "../shared/ci";
import { ciTyped } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";
import { ALL, deployWf, NONE, type Checks } from "./workflow";
export { ALL, deployWf, NONE, type Checks } from "./workflow";

export const SLUG = "after-deploy";

export const checksOf = (w: World): Checks => {
  const kinds = w.workflows[0]?.jobs.find((j) => j.id === "deploy")?.steps.map((s) => s.kind) ?? [];
  return { smoke: kinds.includes("smoke"), rollback: kinds.includes("rollback"), notify: kinds.includes("notify") };
};

const set = (c: Checks): CiAction => ({ type: "setWorkflow", workflow: deployWf(c) });

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
  // Typed: the deploy workflow is a real file; Bora's broken cart ships with the next push.
  sandbox: { typed: ciTyped(scenarios) },
});
