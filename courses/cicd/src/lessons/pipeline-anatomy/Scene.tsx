import { l } from "@lets-explain/core/i18n";
import { freshWorld, headOf, type CiAction, type Workflow, type World } from "../../engine/ci";
import { BUILD, LINT, PREP, TEST } from "../../engine/presets";
import { jobRows, runRows, Timeline } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "pipeline-anatomy";

/** Everything in one job. */
export const ONE: Workflow = { name: "CI", on: { push: { branches: ["main"] } }, jobs: [{ id: "ci", steps: [...PREP, LINT, TEST, BUILD] }] };

/** Three jobs; `build` waits for whatever is in `needs`. */
export const split = (needs: string[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "lint", steps: [...PREP, LINT] },
    { id: "test", steps: [...PREP, TEST] },
    { id: "build", ...(needs.length ? { needs } : {}), steps: [...PREP, BUILD] },
  ],
});

/** Leaves room after the longest bar for its duration label. */
const roomy = (rows: { end: number }[]) => Math.max(60, ...rows.map((r) => r.end)) * 1.12;

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

export const START: World = freshWorld();

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

/** What `build` currently needs. */
export const needsOf = (w: World) => w.workflows[0]?.jobs.find((j) => j.id === "build")?.needs ?? [];
export const toggleNeed = (w: World, id: string): CiAction => {
  const now = needsOf(w);
  return set(split(now.includes(id) ? now.filter((x) => x !== id) : ["lint", "test"].filter((x) => x === id || now.includes(x))));
};

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const needs = needsOf(w);
  const bugs = headOf(w).bugs;
  return [
    {
      label: tr ? "build job'ı" : "build job",
      buttons: ["lint", "test"].map((id) => ({
        label: needs.includes(id) ? (tr ? `needs'ten ${id} çıkar` : `drop ${id} from needs`) : tr ? `needs'e ${id} ekle` : `add ${id} to needs`,
        action: toggleNeed(w, id),
        tone: "producer" as const,
      })),
    },
    {
      label: "Git",
      buttons: [
        { label: tr ? "push: sağlam" : "push: good", action: { type: "push" }, tone: "go" },
        { label: tr ? "push: lint hatası" : "push: lint error", action: { type: "push", add: ["lint"] }, tone: "danger", disabled: bugs.includes("lint") },
        { label: tr ? "push: test hatası" : "push: test failure", action: { type: "push", add: ["test"] }, tone: "danger", disabled: bugs.includes("test") },
        { label: tr ? "push: hepsini düzelt" : "push: fix everything", action: { type: "push", fix: ["lint", "test"] }, tone: "ok", disabled: bugs.length === 0 },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Bir workflow'un run'ları, job'ları ve adımları; altta job'ların zaman çizelgesi", "A workflow's runs, jobs and steps; below, the jobs on a timeline"),
  view: (w, info) => {
    const tr = info.lang === "tr";
    const run = focusRun(w, info);
    if ((!info.sandbox && (info.step === 0 || info.step === 2)) || (info.sandbox && !run)) return <YamlAndRun world={w} prev={info.prev} run={run} />;
    if (!info.sandbox && info.step === 1) {
      const rs = runRows(w.runs, tr);
      return <Timeline rows={rs} to={roomy(rs)} box={{ x: 20, y: 14, w: 820, h: 300 }} title={tr ? "Aynı workflow, üç run" : "One workflow, three runs"} />;
    }
    return (
      <g>
        <RunStage run={run} box={{ x: 20, y: 14, w: 820, h: 262 }} />
        <Timeline rows={jobRows(run)} to={roomy(jobRows(run))} box={{ x: 20, y: 292, w: 820, h: 166 }} title={tr ? "Job'lar zamanda" : "Jobs over time"} />
      </g>
    );
  },
  metrics: (w, t) => [{ label: t(l("Run sayısı", "Runs")), value: w.runs.length }, ...runMetrics(w, t)],
  sandbox: { start: () => ciSim.apply(freshWorld(), set(split([]))).state, rows, missions },
});
