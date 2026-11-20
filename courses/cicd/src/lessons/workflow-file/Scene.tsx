import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type Workflow, type World } from "../../engine/ci";
import { ciSim, ciTyped, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { FULL, wf } from "./model";
import { scenarios } from "./scenarios";
export { FULL, wf } from "./model";

export const SLUG = "workflow-file";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const push: CiAction = { type: "push" };

export const START: World = freshWorld();

const specs: Spec<World, CiAction>[][] = [
  [set(wf(["checkout"])), push],
  [set(wf(["checkout", "setup-node", "install", "test"])), push],
  [set(wf(["setup-node", "install", "test"])), push],
  [set(wf(["checkout", "setup-node", "test", "install"])), push],
  [set(FULL), push],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda workflow dosyası, sağda push'un başlattığı run ve her adımın sonucu", "The workflow file on the left, the run a push started on the right, with every step's result"),
  view: (w, info) => <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} />,
  metrics: (w, t) => runMetrics(w, t),
  // Free play: the full workflow from the end of the lesson, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
