import { l } from "@lets-explain/core/i18n";
import { freshWorld, type CiAction, type Workflow, type World } from "../../engine/ci";
import { onOf, trig, type On } from "./workflow";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { YamlPanel } from "../../iso/panels";
import { ciSim } from "../shared/ci";
export { onOf, trig, type On } from "./workflow";
import { ciTyped } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";
import { TriggerBoard } from "./TriggerBoard";

export const SLUG = "triggers";

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
  // Free play: the lesson's final workflow, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
