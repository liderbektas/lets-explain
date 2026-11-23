import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, latestRun, type CiAction, type JobDef, type StepKind, type Workflow, type World } from "../../engine/ci";
import { PREP, step } from "../../engine/presets";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { jobRows, Timeline } from "../../iso/panels";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";

export const SLUG = "parallel-and-matrix";

const job = (id: string, kinds: StepKind[], extra: Partial<JobDef> = {}): JobDef => ({ id, steps: [...PREP, ...kinds.map((k) => step(k))], ...extra });
const on = { push: { branches: ["main"] } };

/** Everything in one job, one step after another. */
export const SEQ: Workflow = { name: "CI", on, jobs: [job("ci", ["lint", "typecheck", "test", "e2e", "build"])] };

/** The checks in their own jobs, side by side; build waits for lint and test. */
export const PAR: Workflow = {
  name: "CI",
  on,
  jobs: [job("lint", ["lint", "typecheck"]), job("test", ["test"]), job("e2e", ["e2e"]), job("build", ["build"], { needs: ["lint", "test"] })],
};

/** The test job on two Node versions. */
export const MATRIX: Workflow = { ...PAR, jobs: PAR.jobs.map((j) => (j.id === "test" ? { ...j, matrix: [20, 22] } : j)) };

/** e2e moved into the matrix job: the Node 22 leg is still busy when Node 20 fails. */
export const FAILFAST: Workflow = {
  name: "CI",
  on,
  jobs: [job("lint", ["lint", "typecheck"]), job("test", ["test", "e2e"], { matrix: [20, 22] }), job("build", ["build"], { needs: ["lint", "test"] })],
};

export const START: World = freshWorld();

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

const specs: Spec<World, CiAction>[][] = [
  [set(SEQ), { type: "push", message: "cart: add VAT" }],
  [set(PAR), { type: "push", paths: [".github/workflows/ci.yml"], message: "ci: split into jobs" }],
  [{ type: "push", add: ["test"], message: "cart: free shipping" }],
  [set(MATRIX), { type: "push", fix: ["test"], add: ["node20"], message: "orders: group by day" }],
  [set(FAILFAST), { type: "push", paths: [".github/workflows/ci.yml"], message: "ci: e2e on both nodes" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda run'ın job istasyonları ve aralarındaki needs kabloları, sağda her job'ın ne zaman başlayıp bittiği", "The run's job stations and their needs cables on the left, when each job started and ended on the right"),
  view: (w, info) => {
    const run = focusRun(w, info);
    const tr = info.lang === "tr";
    return (
      <g>
        <AssemblyStage run={run} box={{ x: 16, y: 14, w: 574, h: 444 }} />
        <Timeline rows={jobRows(run)} box={{ x: 606, y: 14, w: 240, h: 444 }} title={tr ? "Zaman çizelgesi" : "Timeline"} from={0} to={run ? Math.round((run.end - run.start) * 1.3) : 60} />
      </g>
    );
  },
  metrics: (w, t) => {
    const r = latestRun(w);
    return [
      { label: t(l("Run süresi", "Run time")), value: r ? fmt(r.end - r.start) : "—", tone: r?.status === "failure" ? ("danger" as const) : ("plain" as const) },
      { label: t(l("Bu run'ın dakikası", "This run's minutes")), value: r?.minutes ?? "—" },
      { label: t(l("Job sayısı", "Jobs")), value: r?.jobs.length ?? "—" },
    ];
  },
  // Free play: the story's end, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
