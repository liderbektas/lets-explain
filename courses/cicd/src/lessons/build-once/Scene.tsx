import { l, type L } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";
import { RegistryCard } from "./RegistryCard";

export const SLUG = "build-once";

/** The old way: every environment checks out main and builds again. */
export const REBUILD: Workflow = {
  name: "Deploy (rebuild)",
  on: { dispatch: ["environment"] },
  jobs: [{ id: "deploy", steps: [CHECKOUT, SETUP, INSTALL, BUILD, step("deploy", { name: "Deploy", with: { env: "input:environment" } })] }],
};

/** Build once: every push to main is tested and becomes one image tagged with its commit. */
export const CI: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [{ id: "image", steps: [CHECKOUT, SETUP, INSTALL, TEST, step("docker-push")] }],
};

/** ...and that same image is promoted from environment to environment. */
export const PROMOTE: Workflow = {
  name: "Promote",
  on: { dispatch: ["environment", "version"] },
  jobs: [{ id: "deploy", steps: [step("deploy", { name: "Deploy", with: { env: "input:environment", from: "registry", version: "input:version" } })] }],
};

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

/** The try-it step: the build-once workflows are in place, v1 is everywhere and in the registry. */
export function sandboxStart(): World {
  const w = freshWorld({ workflows: [CI, PROMOTE, REBUILD], envs: ENVS, secrets: { DEPLOY_TOKEN: "dpl_live" } });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
}

export const crashed = (w: World, sha: string) => commitOf(w, sha).bugs.includes("crash");
const newestImage = (w: World) => {
  const tags = Object.keys(w.registry);
  return tags.length ? w.registry[tags[tags.length - 1]!]! : "";
};

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const broken = crashed(w, head(w));
  const img = newestImage(w);
  const stg = envSha(w, "staging");
  return [
    {
      label: tr ? "Kod" : "Code",
      buttons: [
        { label: tr ? "push: değişiklik" : "push: a change", action: { type: "push" }, tone: "producer" },
        { label: tr ? "push: bug'lı değişiklik" : "push: a buggy change", action: { type: "push", add: ["crash"] }, tone: "danger", disabled: broken },
        { label: tr ? "push: düzeltme" : "push: a fix", action: { type: "push", fix: ["crash"] }, tone: "ok", disabled: !broken },
      ],
    },
    {
      label: "Staging",
      buttons: [{ label: `promote sha-${img} → staging`, action: promote("staging", img), tone: "go", disabled: !img || stg === img }],
    },
    {
      label: "Production",
      buttons: [
        { label: `promote sha-${stg} → production`, action: promote("production", stg), tone: "go", disabled: envSha(w, "production") === stg },
        { label: tr ? "main'den yeniden build → production" : "rebuild main → production", action: rebuild("production"), tone: "danger" },
      ],
    },
  ];
}

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
  sandbox: { start: sandboxStart, rows, missions },
});
