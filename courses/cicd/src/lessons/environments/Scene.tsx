import { l } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type JobDef, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { RegistryCard } from "../build-once/RegistryCard";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "environments";

const deployTo = (env: string, needs: string[]): JobDef => ({
  id: env,
  needs,
  environment: env,
  steps: [step("deploy", { name: "Deploy", with: { env, from: "registry" } })],
});

/** One image per commit, then dev → staging → production, each job in its own environment. */
export const DEPLOY: Workflow = {
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [{ id: "image", steps: [CHECKOUT, step("docker-push")] }, deployTo("dev", ["image"]), deployTo("staging", ["dev"]), deployTo("production", ["staging"])],
};

/** Put any earlier image on staging by hand. */
export const MANUAL: Workflow = {
  name: "Deploy by hand",
  on: { dispatch: ["version"] },
  jobs: [{ id: "staging", environment: "staging", steps: [step("deploy", { name: "Deploy", with: { env: "staging", from: "registry", version: "input:version" } })] }],
};

export const ENVS = ["dev", "staging", "production"];

export const freshStart = (): World => {
  const w = freshWorld({ workflows: [DEPLOY, MANUAL], envs: ENVS.map((name) => ({ name, sha: SHAS[0]! })), secrets: { DEPLOY_TOKEN: "dpl_live" } });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
};

export const START: World = freshStart();

export const gate = (on: boolean): CiAction => ({ type: "setEnv", name: "production", approval: on });
export const byHand = (sha: string): CiAction => ({ type: "dispatch", workflow: MANUAL.name, inputs: { version: sha } });
const approve: CiAction = { type: "approve" };

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "new checkout page" }],
  [gate(true), { type: "push", message: "faster search" }],
  [approve],
  [{ type: "push", add: ["crash"], message: "add coupons" }],
  [{ type: "push", fix: ["crash"], message: "fix coupons" }, approve],
  [byHand(SHAS[2]!)],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const crashed = (w: World, sha: string | null) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");
const waiting = (w: World) => w.runs.some((r) => r.status === "waiting");

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const broken = crashed(w, w.heads.main!);
  const on = Boolean(w.envs.production?.approval);
  const prev = w.commits.length >= 2 ? w.commits[w.commits.length - 2]!.sha : "";
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
      label: "Production",
      buttons: [
        { label: on ? (tr ? "onay şartını kapat" : "turn approval off") : tr ? "onay şartını aç" : "require approval", action: gate(!on), tone: "plain" },
        { label: tr ? "Approve and deploy" : "Approve and deploy", action: approve, tone: "go", disabled: !waiting(w) },
      ],
    },
    {
      label: tr ? "Elle" : "By hand",
      buttons: [{ label: `Deploy by hand: ${prev || "—"} → staging`, action: byHand(prev), tone: "producer", disabled: !prev || !w.registry[`sha-${prev}`] }],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l(
    "Üstte son run ve job'ları, altta registry ve dev, staging, production'da çalışan commit",
    "The latest run and its jobs on top; below, the registry and the commit running on dev, staging and production",
  ),
  view: (w, info) => {
    const run = focusRun(w, info);
    const waitingJob = run?.jobs.find((j) => j.status === "waiting");
    return (
      <g>
        <RunStage run={run} box={{ x: 16, y: 10, w: 828, h: 292 }} focus={waitingJob?.key} />
        <RegistryCard world={w} box={{ x: 16, y: 318, w: 270, h: 140 }} />
        <EnvStrip world={w} box={{ x: 300, y: 322, w: 544, h: 116 }} names={ENVS} lit={waitingJob ? "production" : undefined} />
      </g>
    );
  },
  metrics: (w, t) => [
    { label: "main", value: w.heads.main!, tone: crashed(w, w.heads.main!) ? "danger" : "plain" },
    { label: "staging", value: w.envs.staging?.sha ?? "—", tone: crashed(w, w.envs.staging?.sha ?? null) ? "danger" : "ok" },
    { label: "production", value: w.envs.production?.sha ?? "—", tone: crashed(w, w.envs.production?.sha ?? null) ? "danger" : "ok" },
    { label: t(l("Onay bekleyen", "Waiting")), value: w.runs.filter((r) => r.status === "waiting").length, tone: waiting(w) ? "warn" : "plain" },
  ],
  sandbox: { start: freshStart, rows, missions },
});
