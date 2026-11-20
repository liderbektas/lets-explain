import { l } from "@lets-explain/core/i18n";
import { type CiAction, type Workflow, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { deskOf } from "../../engine/desk";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { CI_ONLY, fresh, gate, PIPELINE } from "./model";
import { scenarios } from "./scenarios";
export { CI_ONLY, fresh, gate, PIPELINE } from "./model";

export const SLUG = "ci-vs-cd";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

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
  // Free play: the whole pipeline, production behind an approval.
  sandbox: { typed: ciTyped(scenarios, () => deskOf(fresh([PIPELINE], true))) },
});
