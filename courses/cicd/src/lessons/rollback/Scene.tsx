import { l } from "@lets-explain/core/i18n";
import { commitOf, freshWorld, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { RegistryCard } from "../build-once/RegistryCard";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow } from "../shared/SimScene";
import { MigrationPanel } from "./MigrationPanel";
import { missions } from "./missions";

export const SLUG = "rollback";

/** Every push to main: one image, straight to production. */
export const DEPLOY: Workflow = {
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  permissions: "write",
  jobs: [
    { id: "image", steps: [CHECKOUT, step("docker-push")] },
    { id: "production", needs: ["image"], environment: "production", steps: [step("deploy", { name: "Deploy", with: { env: "production", from: "registry" } })] },
  ],
};

/** Put any image from the registry back on production. */
export const REDEPLOY: Workflow = {
  name: "Redeploy",
  on: { dispatch: ["version"] },
  jobs: [{ id: "production", environment: "production", steps: [step("deploy", { name: "Deploy", with: { env: "production", from: "registry", version: "input:version" } })] }],
};

export const freshStart = (): World => {
  const w = freshWorld({ workflows: [DEPLOY, REDEPLOY], envs: [{ name: "production", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
};

export const START = freshStart();

export const redeploy = (sha: string): CiAction => ({ type: "dispatch", workflow: REDEPLOY.name, inputs: { version: sha } });
export const ROLLBACK: CiAction = { type: "rollback", env: "production" };

export const steps = resolveSteps(ciSim, START, [
  [{ type: "push", message: "search filters" }, { type: "push", add: ["crash"], message: "new cart" }],
  [redeploy(SHAS[1]!)],
  [{ type: "push", fix: ["crash"], message: "fix cart" }],
  [],
  [],
  [],
  [],
]);

export const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const broken = crashed(w, w.heads.main);
  const prod = w.envs.production!;
  const prev = prod.history.length >= 2 ? prod.history[prod.history.length - 2]! : "";
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
      buttons: [{ label: prev ? (tr ? `geri al: ${prev}'i yeniden deploy et` : `roll back: redeploy ${prev}`) : tr ? "geri al" : "roll back", action: ROLLBACK, tone: "go", disabled: !prev }],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l(
    "Son run, registry'deki image'lar ve production'da çalışan commit; iki adımda da veritabanı migration'ları",
    "The latest run, the images in the registry and the commit on production; in two steps, database migrations",
  ),
  view: (w, info) => {
    if (!info.sandbox && info.step === 3) return <MigrationPanel kind="rename" />;
    if (!info.sandbox && info.step === 4) return <MigrationPanel kind="expand" />;
    return (
      <g>
        <RunStage run={focusRun(w, info)} box={{ x: 16, y: 10, w: 828, h: 292 }} />
        <RegistryCard world={w} box={{ x: 16, y: 318, w: 330, h: 140 }} />
        <EnvStrip world={w} box={{ x: 430, y: 322, w: 360, h: 116 }} names={["production"]} />
      </g>
    );
  },
  metrics: (w) => [
    { label: "main", value: w.heads.main!, tone: crashed(w, w.heads.main) ? "danger" : "plain" },
    { label: "production", value: w.envs.production?.sha ?? "—", tone: crashed(w, w.envs.production?.sha) ? "danger" : "ok" },
    { label: "image", value: Object.keys(w.registry).length },
  ],
  sandbox: { start: freshStart, rows, missions },
});
