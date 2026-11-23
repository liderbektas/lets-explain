import { l } from "@lets-explain/core/i18n";
import { commitOf, SHAS, type CiAction, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { RegistryCard } from "../build-once/RegistryCard";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps } from "../shared/SimScene";
import { MigrationPanel } from "./MigrationPanel";
import { scenarios } from "./scenarios";
import { freshStart, REDEPLOY } from "./workflow";
export { DEPLOY, freshStart, REDEPLOY } from "./workflow";

export const SLUG = "rollback";

export const START = freshStart();

export const redeploy = (sha: string): CiAction => ({ type: "dispatch", workflow: REDEPLOY.name, inputs: { version: sha } });

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
        <AssemblyStage run={focusRun(w, info)} box={{ x: 16, y: 10, w: 828, h: 292 }} />
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
  // Typed: production is down; roll back with gh, or write the redeploy workflow yourself.
  sandbox: { typed: ciTyped(scenarios) },
});
