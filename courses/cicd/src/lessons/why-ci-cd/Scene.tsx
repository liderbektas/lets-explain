import { l } from "@lets-explain/core/i18n";
import { type CiAction, type Workflow, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, ciTyped, focusRun, runMetrics, startedNothing } from "../shared/ci";
import { deskOf } from "../../engine/desk";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { CommitLane } from "./CommitLane";
import { BUG_MSG, CI, CICD, fresh } from "./model";
import { scenarios } from "./scenarios";
export { BUG_MSG, CI, CICD, fresh } from "./model";

export const SLUG = "why-ci-cd";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const bug: CiAction = { type: "push", add: ["test"], message: BUG_MSG };

export const START: World = fresh();

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", message: "add login page" }, bug],
  [{ type: "push", message: "update footer" }, set(CI), { type: "push", message: "fix typo in README" }],
  [{ type: "push", fix: ["test"], message: "fix VAT rounding" }, { type: "push", add: ["lint"], message: "quick refactor" }],
  [{ type: "push", fix: ["lint"], message: "remove unused variable" }],
  [set(CICD), { type: "push", message: "add search box" }],
  [{ type: "push", add: ["test"], message: "change discount rules" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda main'e giren commit'ler ve kontrol edilip edilmedikleri, sağda son run ve staging'de çalışan sürüm", "On the left the commits on main and whether anything checked them, on the right the latest run and what staging runs"),
  view: (w, info) => (
    <g>
      <CommitLane world={w} box={{ x: 16, y: 14, w: 300, h: 444 }} />
      <RunStage run={startedNothing(info) ? undefined : focusRun(w, info)} blocked={startedNothing(info)} box={{ x: 332, y: 14, w: 514, h: 316 }} empty={info.lang === "tr" ? "Workflow yok: push'lar hiçbir şey başlatmıyor." : "No workflow: pushes start nothing."} />
      <EnvStrip world={w} box={{ x: 420, y: 342, w: 340, h: 100 }} />
    </g>
  ),
  metrics: (w, t) => [
    { label: t(l("main'deki commit", "Commits on main")), value: w.commits.filter((c) => c.branch === "main").length },
    { label: t(l("Kontrolsüz commit", "Unchecked commits")), value: w.commits.filter((c) => c.n > 1 && !w.runs.some((r) => r.sha === c.sha)).length, tone: "warn" as const },
    ...runMetrics(w, t).slice(0, 1),
  ],
  // Free play: the shop with plain CI, staging on the first commit.
  sandbox: { typed: ciTyped(scenarios, () => deskOf(fresh([CI]))) },
});
