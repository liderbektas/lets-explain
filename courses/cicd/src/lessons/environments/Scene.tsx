import { l } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { RegistryCard } from "../build-once/RegistryCard";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { DEPLOY, ENVS, MANUAL } from "./workflows";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "environments";

export { DEPLOY, ENVS, MANUAL } from "./workflows";

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
        <AssemblyStage run={run} box={{ x: 16, y: 10, w: 828, h: 292 }} focus={waitingJob?.key} />
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
  // Free play: no gate yet, every environment on the first commit.
  sandbox: { typed: ciTyped(scenarios, () => FREE) },
});
