import { l, type L } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { CI, PROMOTE, REBUILD } from "./workflows";
import { FREE, scenarios } from "./scenarios";
import { RegistryCard } from "./RegistryCard";

export const SLUG = "build-once";

export { CI, PROMOTE, REBUILD } from "./workflows";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const rebuild = (env: string): CiAction => ({ type: "dispatch", workflow: REBUILD.name, inputs: { environment: env } });
export const promote = (env: string, sha: string): CiAction => ({ type: "dispatch", workflow: PROMOTE.name, inputs: { environment: env, version: sha } });

const ENVS = [
  { name: "staging", sha: SHAS[0]! },
  { name: "production", sha: SHAS[0]! },
];

export const START: World = freshWorld({ workflows: [REBUILD], envs: ENVS, secrets: { DEPLOY_TOKEN: "dpl_live" } });

const head = (w: World) => w.heads.main!;
const envSha = (w: World, env: string) => w.envs[env]?.sha ?? "";

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "new checkout page" }, rebuild("staging")],
  [{ type: "push", add: ["crash"], message: "refactor prices" }, rebuild("production")],
  [set(CI), set(PROMOTE), { type: "push", fix: ["crash"], message: "fix prices" }, (w) => promote("staging", head(w))],
  [{ type: "push", add: ["crash"], message: "add coupons" }],
  [(w) => promote("production", envSha(w, "staging"))],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const crashed = (w: World, sha: string) => commitOf(w, sha).bugs.includes("crash");
export const VIEW_LABELS: L = l(
  "Üstte son run, altta registry'deki image'lar ve her ortamda çalışan commit",
  "The latest run on top; below, the images in the registry and the commit each environment runs",
);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: VIEW_LABELS,
  view: (w, info) => (
    <g>
      <RunStage run={focusRun(w, info)} box={{ x: 16, y: 10, w: 828, h: 292 }} />
      <RegistryCard world={w} box={{ x: 16, y: 318, w: 300, h: 140 }} />
      <EnvStrip world={w} box={{ x: 340, y: 322, w: 500, h: 116 }} names={["staging", "production"]} />
    </g>
  ),
  metrics: (w, t) => [
    { label: "main", value: head(w), tone: crashed(w, head(w)) ? "danger" : "plain" },
    { label: "staging", value: envSha(w, "staging") || "—", tone: envSha(w, "staging") && crashed(w, envSha(w, "staging")) ? "danger" : "ok" },
    { label: "production", value: envSha(w, "production") || "—", tone: envSha(w, "production") && crashed(w, envSha(w, "production")) ? "danger" : "ok" },
    { label: t(l("Image", "Images")), value: Object.keys(w.registry).length },
  ],
  // Free play: the build-once workflows are in place, v1 everywhere and in the registry.
  sandbox: { typed: ciTyped(scenarios, () => FREE) },
});
