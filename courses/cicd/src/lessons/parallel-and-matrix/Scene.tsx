import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, latestRun, type CiAction, type JobDef, type StepKind, type Workflow, type World } from "../../engine/ci";
import { PREP, step } from "../../engine/presets";
import { RunStage } from "../../iso/RunStage";
import { jobRows, Timeline } from "../../iso/panels";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

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

/* ---------------------------------------------------------------- sandbox */

export interface Layout {
  lint: boolean;
  test: boolean;
  e2e: boolean;
  matrix: boolean;
}

/** The sandbox's workflow: split groups get their own job; whatever is left stays in `ci` with the build. */
export function layoutWf(o: Layout): Workflow {
  const jobs: JobDef[] = [];
  const rest: StepKind[] = [];
  if (o.lint) jobs.push(job("lint", ["lint", "typecheck"]));
  else rest.push("lint", "typecheck");
  if (o.test) jobs.push(job("test", ["test"], o.matrix ? { matrix: [20, 22] } : {}));
  else rest.push("test");
  if (o.e2e) jobs.push(job("e2e", ["e2e"]));
  else rest.push("e2e");
  jobs.push(job("ci", [...rest, "build"]));
  return { name: "CI", on, jobs };
}

export function layoutOf(w: World): Layout {
  const ids = w.workflows[0]?.jobs.map((j) => j.id) ?? [];
  return { lint: ids.includes("lint"), test: ids.includes("test"), e2e: ids.includes("e2e"), matrix: Boolean(w.workflows[0]?.jobs.find((j) => j.id === "test")?.matrix) };
}

export const SANDBOX: World = ciSim.apply(freshWorld({ bugs: ["node20"], workflows: [layoutWf({ lint: false, test: false, e2e: false, matrix: false })] }), { type: "push", message: "orders: group by day" }).state;

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const o = layoutOf(w);
  const toggle = (patch: Partial<Layout>) => set(layoutWf({ ...o, ...patch, matrix: patch.test === false ? false : (patch.matrix ?? o.matrix) }));
  const split = (k: "lint" | "test" | "e2e", name: string) => ({
    label: o[k] ? (tr ? `${name}: ci'a geri koy` : `${name}: back into ci`) : tr ? `${name}: ayrı job` : `${name}: own job`,
    action: toggle({ [k]: !o[k] }),
    tone: "producer" as const,
  });
  return [
    { label: tr ? "Job'lar" : "Jobs", buttons: [split("lint", "lint + typecheck"), split("test", "test"), split("e2e", "e2e")] },
    {
      label: "Matrix",
      buttons: [{ label: o.matrix ? (tr ? "test: sadece Node 22" : "test: Node 22 only") : tr ? "test: Node 20 ve 22" : "test: Node 20 and 22", action: toggle({ matrix: !o.matrix }), tone: "producer", disabled: !o.test }],
    },
    { label: "Git", buttons: [{ label: "git push", action: { type: "push", paths: [".github/workflows/ci.yml"], message: "ci: change jobs" }, tone: "go" }] },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda run'ın job'ları ve aralarındaki needs okları, sağda her job'ın ne zaman başlayıp bittiği", "The run's jobs and their needs arrows on the left, when each job started and ended on the right"),
  view: (w, info) => {
    const run = focusRun(w, info);
    const tr = info.lang === "tr";
    return (
      <g>
        <RunStage run={run} box={{ x: 16, y: 14, w: 520, h: 444 }} />
        <Timeline rows={jobRows(run)} box={{ x: 552, y: 14, w: 294, h: 444 }} title={tr ? "Zaman çizelgesi" : "Timeline"} from={0} to={run ? Math.round((run.end - run.start) * 1.3) : 60} />
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
  sandbox: { start: () => SANDBOX, rows, missions },
});
