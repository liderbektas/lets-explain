import { l } from "@lets-explain/core/i18n";
import { type CiAction, type Workflow, type World } from "../../engine/ci";
import { EnvStrip } from "../../iso/panels";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { ciSim, ciTyped, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { fresh, ONE_JOB, split } from "./model";
import { scenarios } from "./scenarios";
export { fresh, ONE_JOB, split } from "./model";
import { SharedPanel } from "./SharedPanel";

export const SLUG = "fresh-runners";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

export const START: World = fresh();

const specs: Spec<World, CiAction>[][] = [
  [set(ONE_JOB), { type: "push", message: "add reviews" }],
  [set(split([])), { type: "push", message: "split build and deploy" }],
  [set(split(["checkout"])), { type: "push", message: "deploy: add checkout" }],
  [set(split(["checkout", "setup-node", "install", "build"])), { type: "push", message: "deploy: build again" }],
  [set(split(["download"], true)), { type: "push", message: "pass dist as an artifact" }],
  [],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Üstte run'ın job'ları ve adımları, altta staging'de çalışan commit", "The run's jobs and steps on top, the commit staging runs below"),
  view: (w, info) => {
    if (!info.sandbox && info.step === 5) return <SharedPanel box={{ x: 20, y: 14, w: 820, h: 444 }} />;
    if (info.sandbox) {
      return (
        <g>
          <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} runBox={{ x: 384, y: 14, w: 462, h: 316 }} />
          <EnvStrip world={w} box={{ x: 450, y: 344, w: 330, h: 100 }} />
        </g>
      );
    }
    return (
      <g>
        <AssemblyStage run={focusRun(w, info)} box={{ x: 20, y: 14, w: 820, h: 320 }} />
        <EnvStrip world={w} box={{ x: 260, y: 344, w: 340, h: 100 }} />
      </g>
    );
  },
  metrics: (w, t) => [...runMetrics(w, t).slice(0, 2), { label: "staging", value: w.envs.staging?.sha ?? "—" }],
  // Free play: the lesson's end, dist/ handed over as an artifact.
  sandbox: { typed: ciTyped(scenarios) },
});
