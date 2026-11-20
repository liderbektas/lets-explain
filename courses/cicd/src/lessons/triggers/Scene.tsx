import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type Workflow, type World } from "../../engine/ci";
import { ciJob } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { YamlPanel } from "../../iso/panels";
import { ciSim } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";
import { TriggerBoard } from "./TriggerBoard";

export const SLUG = "triggers";

export interface On {
  mainOnly?: boolean;
  pr?: boolean;
  schedule?: boolean;
  dispatch?: boolean;
  ignoreDocs?: boolean;
}

/** The CI workflow with the triggers switched on. */
export const trig = (o: On): Workflow => ({
  name: "CI",
  on: {
    push: { ...(o.mainOnly ? { branches: ["main"] } : {}), ...(o.ignoreDocs ? { pathsIgnore: ["docs/**", "**/*.md"] } : {}) },
    ...(o.pr ? { pull_request: { branches: ["main"] } } : {}),
    ...(o.schedule ? { schedule: "0 3 * * *" } : {}),
    ...(o.dispatch ? { dispatch: [] } : {}),
  },
  jobs: [ciJob()],
});

/** Reads the switches back from the current workflow. */
export const onOf = (w: World): On => {
  const on = w.workflows[0]?.on ?? {};
  return { mainOnly: Boolean(on.push?.branches), pr: Boolean(on.pull_request), schedule: Boolean(on.schedule), dispatch: Boolean(on.dispatch), ignoreDocs: Boolean(on.push?.pathsIgnore) };
};

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const toggle = (w: World, key: keyof On): CiAction => set(trig({ ...onOf(w), [key]: !onOf(w)[key] }));

export const START: World = freshWorld();

const specs: Spec<World, CiAction>[][] = [
  [set(trig({})), { type: "push", message: "add cart" }, { type: "push", branch: "feature", message: "wip: coupons" }],
  [set(trig({ mainOnly: true })), { type: "push", branch: "feature", message: "coupons: form" }],
  [set(trig({ mainOnly: true, pr: true })), { type: "openPr", branch: "feature" }, { type: "push", branch: "feature", message: "coupons: tests" }],
  [set(trig({ mainOnly: true, pr: true, schedule: true })), { type: "schedule" }],
  [set(trig({ mainOnly: true, pr: true, schedule: true, dispatch: true })), { type: "dispatch", workflow: "CI" }],
  [set(trig({ mainOnly: true, pr: true, schedule: true, dispatch: true, ignoreDocs: true })), { type: "push", paths: ["README.md"], message: "docs: install steps" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const FINAL = trig({ mainOnly: true, pr: true, schedule: true, dispatch: true, ignoreDocs: true });

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const o = onOf(w);
  const hasFeature = Boolean(w.heads.feature);
  const prOpen = w.prs.some((p) => p.state === "open");
  return [
    {
      label: "on:",
      buttons: [
        { label: o.mainOnly ? (tr ? "push: tüm branch'ler" : "push: all branches") : tr ? "push: sadece main" : "push: main only", action: toggle(w, "mainOnly"), tone: "producer" },
        { label: o.pr ? (tr ? "pull_request'i kaldır" : "remove pull_request") : tr ? "pull_request ekle" : "add pull_request", action: toggle(w, "pr"), tone: "producer" },
        { label: o.dispatch ? (tr ? "workflow_dispatch'i kaldır" : "remove workflow_dispatch") : tr ? "workflow_dispatch ekle" : "add workflow_dispatch", action: toggle(w, "dispatch"), tone: "producer" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "push → main", action: { type: "push" }, tone: "go" },
        { label: "push → feature", action: { type: "push", branch: "feature" }, tone: "go" },
        { label: tr ? "PR aç: feature → main" : "open PR: feature → main", action: { type: "openPr", branch: "feature" }, tone: "ok", disabled: !hasFeature || prOpen },
      ],
    },
    {
      label: tr ? "Elle" : "By hand",
      buttons: [{ label: "Run workflow", action: { type: "dispatch", workflow: "CI" }, tone: "ok", disabled: !o.dispatch }],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda workflow dosyası, sağda workflow'un dinlediği olaylar ve her push'un başlattığı run'lar", "The workflow file on the left; on the right, the events it listens to and the runs each push started"),
  view: (w, info) => {
    const wf = w.workflows[0];
    const old = info.prev.workflows[0];
    return (
      <g>
        {wf && <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={{ x: 16, y: 14, w: 350, h: 444 }} title={workflowFile(wf)} />}
        <TriggerBoard world={w} box={{ x: 384, y: 14, w: 462, h: 444 }} />
      </g>
    );
  },
  metrics: (w, t) => [
    { label: t(l("Push", "Pushes")), value: w.commits.length - 1 },
    { label: t(l("Run", "Runs")), value: w.runs.length },
    { label: t(l("Run başlatmayan push", "Pushes with no run")), value: w.commits.filter((c) => c.n > 1 && !w.runs.some((r) => r.sha === c.sha)).length },
  ],
  sandbox: { start: () => ciSim.apply(freshWorld(), set(trig({}))).state, rows, missions },
});
