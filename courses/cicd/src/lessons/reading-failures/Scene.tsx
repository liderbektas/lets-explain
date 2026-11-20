import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type Run, type Workflow, type World } from "../../engine/ci";
import { ciWorkflow } from "../../engine/presets";
import { RunStage } from "../../iso/RunStage";
import { LogPanel } from "../../iso/panels";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";

export const SLUG = "reading-failures";

export const CI: Workflow = ciWorkflow({ on: { push: { branches: ["main"] } } });

export const START: World = freshWorld({ workflows: [CI] });

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", add: ["test"], message: "cart: add VAT" }],
  [],
  [{ type: "push", fix: ["test"], message: "fix: VAT rounding" }],
  [{ type: "push", add: ["flaky"], message: "checkout: show a spinner" }],
  [{ type: "rerun" }],
  [{ type: "push", add: ["test"], message: "cart: free shipping over 500" }, { type: "rerun" }],
  [{ type: "push", fix: ["test", "flaky"], message: "fix: shipping rule, wait for the order in the test" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

/** The first error line of a run's failed step, as the log shows it. */
export function errorLine(r?: Run): string | null {
  const job = r?.jobs.find((j) => j.status === "failure");
  const s = job?.steps.find((x) => x.status === "failure");
  return s?.log.find((x) => /Error|FAIL/.test(x) && !x.startsWith(" FAIL")) ?? null;
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda run, sağda kırılan job'ın logu: adımlar ve kırılan adımın çıktısı", "The run on the left, the failed job's log on the right: its steps and the failing step's output"),
  view: (w, info) => {
    const run = focusRun(w, info);
    return (
      <g>
        <RunStage run={run} box={{ x: 16, y: 14, w: 330, h: 444 }} />
        <LogPanel run={run} box={{ x: 362, y: 14, w: 484, h: 444 }} />
      </g>
    );
  },
  metrics: (w, t) => {
    const r = latestRun(w);
    return [
      { label: t(l("Son run", "Last run")), value: r ? `#${r.id}` : "—", tone: r?.status === "failure" ? ("danger" as const) : r ? ("ok" as const) : ("plain" as const) },
      { label: t(l("Deneme", "Attempt")), value: r?.attempt ?? "—" },
      { label: t(l("Commit", "Commit")), value: r?.sha ?? "—" },
    ];
  },
  // Free play: the story's end, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
