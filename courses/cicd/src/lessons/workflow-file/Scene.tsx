import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type StepKind, type Workflow, type World } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, LINT, SETUP, TEST, step } from "../../engine/presets";
import { ciSim, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "workflow-file";

/** The workflow this lesson grows, one step at a time. */
export const wf = (kinds: StepKind[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "test", steps: kinds.map((k) => step(k)) }],
});

export const FULL: Workflow = { ...wf([]), jobs: [{ id: "test", steps: [CHECKOUT, SETUP, INSTALL, LINT, TEST, BUILD] }] };

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

const ORDER: { kind: StepKind; label: string }[] = [
  { kind: "checkout", label: "uses: actions/checkout" },
  { kind: "setup-node", label: "uses: actions/setup-node" },
  { kind: "install", label: "run: npm ci" },
  { kind: "test", label: "run: npm test" },
  { kind: "build", label: "run: npm run build" },
];

const kindsOf = (w: World) => w.workflows[0]?.jobs[0]?.steps.map((s) => s.kind) ?? [];

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const kinds = kindsOf(w);
  return [
    {
      label: tr ? "Adım ekle" : "Add a step",
      buttons: ORDER.map((o) => ({ label: o.label, action: set(wf([...kinds, o.kind])), tone: "producer" as const, disabled: kinds.includes(o.kind) })),
    },
    {
      label: tr ? "Dosya" : "File",
      buttons: [{ label: tr ? "son adımı sil" : "remove last step", action: set(wf(kinds.slice(0, -1))), tone: "danger", disabled: kinds.length === 0 }],
    },
    { label: "Git", buttons: [{ label: "git push", action: push, tone: "go", disabled: kinds.length === 0 }] },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda workflow dosyası, sağda push'un başlattığı run ve her adımın sonucu", "The workflow file on the left, the run a push started on the right, with every step's result"),
  view: (w, info) => <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} />,
  metrics: (w, t) => runMetrics(w, t),
  sandbox: { start: () => apply0(), rows, missions },
});

/** The try-it step starts with a workflow whose job has no steps yet. */
function apply0(): World {
  return ciSim.apply(freshWorld(), set(wf([]))).state;
}
