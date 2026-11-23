import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type Run, type Workflow, type World } from "../../engine/ci";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { jobRows, runRows, Timeline, YamlPanel } from "../../iso/panels";
import { ciSim, ciTyped, focusRun, runMetrics } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { ONE, split } from "./model";
import { scenarios } from "./scenarios";
export { ONE, split } from "./model";

export const SLUG = "pipeline-anatomy";

/** Leaves room after the longest bar for its duration label. */
const roomy = (rows: { end: number }[]) => Math.max(60, ...rows.map((r) => r.end)) * 1.12;

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

export const START: World = freshWorld();

/** The workflow file on the left (changed lines lit), its run as an assembly line on the right. */
function YamlAndLine({ world, prev, run }: { world: World; prev?: World; run?: Run }) {
  const wf = world.workflows[0];
  const old = wf && prev ? prev.workflows.find((x) => x.name === wf.name) : undefined;
  return (
    <g>
      {wf && <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={{ x: 16, y: 14, w: 312, h: 444 }} title={workflowFile(wf)} />}
      <AssemblyStage run={run} box={{ x: 342, y: 14, w: 504, h: 444 }} />
    </g>
  );
}

const specs: Spec<World, CiAction>[][] = [
  [set(ONE), { type: "push", message: "add product page" }],
  [{ type: "push", message: "product page: price" }, { type: "push", message: "product page: photos" }],
  [],
  [set(split([])), { type: "push", message: "split CI into jobs" }],
  [set(split(["lint", "test"])), { type: "push", message: "build after checks" }],
  [{ type: "push", add: ["lint"], message: "rename helpers" }],
  [{ type: "push", fix: ["lint"], message: "fix lint" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Bir workflow'un run'ları, job'ları ve adımları; altta job'ların zaman çizelgesi", "A workflow's runs, jobs and steps; below, the jobs on a timeline"),
  view: (w, info) => {
    const tr = info.lang === "tr";
    const run = focusRun(w, info);
    if ((!info.sandbox && (info.step === 0 || info.step === 2)) || (info.sandbox && !run)) return <YamlAndLine world={w} prev={info.prev} run={run} />;
    if (!info.sandbox && info.step === 1) {
      const rs = runRows(w.runs, tr);
      return <Timeline rows={rs} to={roomy(rs)} box={{ x: 20, y: 14, w: 820, h: 300 }} title={tr ? "Aynı workflow, üç run" : "One workflow, three runs"} />;
    }
    return (
      <g>
        <AssemblyStage run={run} box={{ x: 20, y: 14, w: 820, h: 290 }} />
        <Timeline rows={jobRows(run)} to={roomy(jobRows(run))} box={{ x: 20, y: 314, w: 820, h: 144 }} title={tr ? "Job'lar zamanda" : "Jobs over time"} />
      </g>
    );
  },
  metrics: (w, t) => [{ label: t(l("Run sayısı", "Runs")), value: w.runs.length }, ...runMetrics(w, t)],
  // Free play: the lesson's three jobs, build after the checks.
  sandbox: { typed: ciTyped(scenarios) },
});
