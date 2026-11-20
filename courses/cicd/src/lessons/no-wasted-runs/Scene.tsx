import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { PREP, TEST, ciWorkflow, step } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { runRows, Timeline, YamlPanel } from "../../iso/panels";
import { ciSim, focusRun, nothingStarted, runMetrics, startedNothing, YamlAndRun, type CiInfo } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "no-wasted-runs";

const ON = { push: { branches: ["main"] } };
export const BASE: Workflow = ciWorkflow({ on: ON });
export const GROUPED: Workflow = { ...BASE, concurrency: true };

/** CI plus an e2e job whose browser tests hang. */
export function e2eWf(o: { concurrency: boolean; timeout: boolean }): Workflow {
  return {
    ...BASE,
    concurrency: o.concurrency || undefined,
    jobs: [BASE.jobs[0]!, { id: "e2e", ...(o.timeout ? { timeout: 15 } : {}), steps: [...PREP, step("hang")] }],
  };
}

export const matrixWf = (failFast: boolean): Workflow => ({
  ...BASE,
  jobs: [{ id: "test", matrix: [20, 22], ...(failFast ? {} : { failFast: false }), steps: [...PREP, TEST, step("e2e")] }],
});

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const pushCode: CiAction = { type: "push", paths: ["src/cart.ts"], message: "tweak the cart" };
export const pushTypoSkip: CiAction = { type: "push", paths: ["README.md"], message: "docs: fix a typo [skip ci]" };
export const pushTypo: CiAction = { type: "push", paths: ["README.md"], message: "docs: fix a typo" };
const five = (): CiAction[] => [1, 2, 3, 4, 5].map((i) => ({ type: "push", paths: ["src/cart.ts"], message: `wip ${i}` }));

export const START: World = freshWorld();
/** Some hours pass between the story's scenes, so no run is still going when the next one starts. */
const later: CiAction = { type: "wait", seconds: 8 * 60 * 60 };

const specs: Spec<World, CiAction>[][] = [
  [set(BASE), ...five()],
  [set(GROUPED), ...five()],
  [later, set(e2eWf({ concurrency: true, timeout: false })), pushCode],
  [later, set(e2eWf({ concurrency: true, timeout: true })), pushCode],
  [later, set(matrixWf(true)), { type: "push", add: ["node20"], message: "group orders with Object.groupBy" }, set(matrixWf(false)), { type: "push", message: "add a comment" }],
  [set(GROUPED), pushTypoSkip],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const hasGroup = (w: World) => Boolean(w.workflows[0]?.concurrency);
export const hasTimeout = (w: World) => w.workflows[0]?.jobs.find((j) => j.id === "e2e")?.timeout !== undefined;

export const sandboxStart = (): World => ciSim.apply(freshWorld(), set(e2eWf({ concurrency: false, timeout: false }))).state;

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const g = hasGroup(w);
  const t = hasTimeout(w);
  return [
    {
      label: "Workflow",
      buttons: [
        { label: g ? (tr ? "concurrency'yi kaldır" : "remove concurrency") : "concurrency: cancel-in-progress", action: set(e2eWf({ concurrency: !g, timeout: t })), tone: "producer" },
        { label: t ? (tr ? "e2e: timeout'u kaldır" : "e2e: remove timeout") : "e2e: timeout-minutes: 15", action: set(e2eWf({ concurrency: g, timeout: !t })), tone: "producer" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "push src/cart.ts", action: pushCode, tone: "go" },
        { label: 'push README "[skip ci]"', action: pushTypoSkip, tone: "go" },
        { label: "push README", action: pushTypo, tone: "go" },
      ],
    },
  ];
}

function View({ w, info }: { w: World; info: CiInfo }) {
  const tr = info.lang === "tr";
  const wf = w.workflows[0];
  if (!info.sandbox && info.step <= 1 && wf) {
    const runs = w.runs.slice(-5);
    const old = info.prev.workflows[0];
    return (
      <g>
        <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={{ x: 16, y: 14, w: 330, h: 444 }} title={workflowFile(wf)} />
        <Timeline
          rows={runRows(runs, tr)}
          from={runs[0]?.start ?? w.clock}
          to={(runs[0]?.start ?? w.clock) + 330}
          box={{ x: 362, y: 14, w: 484, h: 444 }}
          title={tr ? "Arka arkaya 5 push: run'lar" : "5 pushes in a row: the runs"}
        />
      </g>
    );
  }
  return <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} blocked={startedNothing(info) ? nothingStarted(tr) : undefined} />;
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Workflow dosyası ve run'lar: kaç tanesi bitti, kaçı iptal edildi, kaç dakika faturalandı", "The workflow file and the runs: how many finished, how many were cancelled, how many minutes were billed"),
  view: (w, info) => <View w={w} info={info} />,
  metrics: (w, t, info) => {
    const last = latestRun(w);
    if (!info.sandbox && info.step > 1) {
      return [...runMetrics(w, t, last).slice(0, 2), { label: t(l("Bu run'ın dakikası", "This run's minutes")), value: last?.minutes ?? 0, tone: (last?.minutes ?? 0) > 60 ? ("danger" as const) : ("plain" as const) }];
    }
    const runs = info.sandbox ? w.runs : w.runs.slice(-5);
    const minutes = runs.reduce((m, r) => m + r.minutes, 0);
    return [
      { label: t(l("Biten run", "Runs finished")), value: runs.filter((r) => r.status !== "cancelled").length },
      { label: t(l("İptal", "Cancelled")), value: runs.filter((r) => r.status === "cancelled").length },
      { label: t(l("Dakika", "Minutes")), value: minutes, tone: minutes > 60 ? ("danger" as const) : ("plain" as const) },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
