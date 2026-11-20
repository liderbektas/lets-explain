import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, headOf, latestRun, type CiAction, type StepKind, type Workflow, type World } from "../../engine/ci";
import { step } from "../../engine/presets";
import { ciSim, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "lint-test-build";

const PREP: StepKind[] = ["checkout", "setup-node", "install"];

/** A one-job CI whose checks run in the given order after checkout, setup-node and npm ci. */
export const wf = (order: StepKind[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "ci", steps: [...PREP, ...order].map((k) => step(k)) }],
});

export const GOOD: StepKind[] = ["lint", "typecheck", "test", "build"];
/** The order the sandbox starts with: the slow checks first. */
export const SLOW: StepKind[] = ["test", "typecheck", "build", "lint"];

export const orderOf = (w: World): StepKind[] => (w.workflows[0]?.jobs[0]?.steps.map((s) => s.kind) ?? []).filter((k) => !PREP.includes(k));

/** Move a check to the front, right after `npm ci`. */
export const toFront = (order: StepKind[], kind: StepKind) => [kind, ...order.filter((k) => k !== kind)];

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

export const SANDBOX: World = ciSim.apply(freshWorld({ bugs: ["lint", "type"], workflows: [wf(SLOW)] }), { type: "push", message: "cart: add VAT" }).state;

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const order = orderOf(w);
  const bugs = headOf(w).bugs;
  return [
    {
      label: tr ? "Sıra" : "Order",
      buttons: [
        { label: tr ? "lint'i öne al" : "move lint first", action: set(wf(toFront(order, "lint"))), tone: "producer", disabled: order[0] === "lint" },
        { label: tr ? "typecheck'i öne al" : "move typecheck first", action: set(wf(toFront(order, "typecheck"))), tone: "producer", disabled: order[0] === "typecheck" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "git push", action: ciEdit("ci: reorder checks"), tone: "go" },
        { label: tr ? "lint hatasını düzelt + push" : "fix the lint error + push", action: { type: "push", fix: ["lint"], message: "fix: unused variable" }, tone: "ok", disabled: !bugs.includes("lint") },
        { label: tr ? "tip hatasını düzelt + push" : "fix the type error + push", action: { type: "push", fix: ["type"], message: "fix: price is a number" }, tone: "ok", disabled: !bugs.includes("type") },
      ],
    },
  ];
}

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
  sandbox: { start: () => SANDBOX, rows, missions },
});
