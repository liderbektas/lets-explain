import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { ciSim, ciTyped, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { GOOD, wf } from "./model";
import { scenarios } from "./scenarios";
export { GOOD, orderOf, SANDBOX, SLOW, toFront, wf } from "./model";

export const SLUG = "lint-test-build";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const ciEdit = (message: string, extra: Partial<Extract<CiAction, { type: "push" }>> = {}): CiAction => ({ type: "push", paths: [".github/workflows/ci.yml"], message, ...extra });

export const START: World = freshWorld();

const specs: Spec<World, CiAction>[][] = [
  [set(wf(["test", "lint", "build"])), { type: "push", add: ["lint"], message: "cart: add VAT" }],
  [set(wf(["lint", "test", "build"])), ciEdit("ci: run lint first")],
  [set(wf(GOOD)), { type: "push", fix: ["lint"], add: ["type"], message: "cart: use a number for price" }],
  [{ type: "push", fix: ["type"], add: ["test", "build"], message: "cart: round totals" }],
  [{ type: "push", fix: ["test"], message: "fix: VAT rounding" }],
  [{ type: "push", fix: ["build"], message: "fix: import path" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

/** Seconds from the start of the run to the step that broke it: how long you waited for the bad news. */
export const timeToError = (w: World) => {
  const r = latestRun(w);
  return r && r.status === "failure" ? r.end - r.start : null;
};

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda adımların sırası, sağda run: hangi adım kırıldı ve hata kaçıncı saniyede geldi", "The step order on the left, the run on the right: which step broke and how many seconds the bad news took"),
  view: (w, info) => <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} />,
  metrics: (w, t) => {
    const e = timeToError(w);
    return [...runMetrics(w, t).slice(0, 1), { label: t(l("İlk hataya kadar", "Time to first error")), value: e === null ? "—" : fmt(e), tone: e !== null && e > 90 ? ("warn" as const) : ("plain" as const) }, ...runMetrics(w, t).slice(2)];
  },
  // Free play: the lesson's good order, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
