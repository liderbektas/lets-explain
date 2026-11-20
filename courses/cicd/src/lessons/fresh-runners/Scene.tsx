import { l } from "@lets-explain/core/i18n";
import { freshWorld, SHAS, type CiAction, type StepKind, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, TEST, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";
import { SharedPanel } from "./SharedPanel";

export const SLUG = "fresh-runners";

const DEPLOY = step("deploy");

/** Everything on one machine: test, build and deploy in a single job. */
export const ONE_JOB: Workflow = { name: "Deploy", on: { push: { branches: ["main"] } }, jobs: [{ id: "ship", steps: [...PREP, TEST, BUILD, DEPLOY] }] };

/** Two jobs: `build`, then `deploy` with whatever steps come before its deploy step. */
export const split = (pre: StepKind[], upload = false): Workflow => ({
  name: "Deploy",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "build", steps: [...PREP, TEST, BUILD, ...(upload ? [step("upload")] : [])] },
    { id: "deploy", needs: ["build"], steps: [...pre.map((k) => step(k)), DEPLOY] },
  ],
});

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });

export const fresh = (workflows: Workflow[] = []): World => freshWorld({ workflows, envs: [{ name: "staging", sha: SHAS[0] }], secrets: { DEPLOY_TOKEN: "dpl_live" } });

export const START: World = fresh();

const specs: Spec<World, CiAction>[][] = [
  [set(ONE_JOB), { type: "push", message: "add reviews" }],
  [set(split([])), { type: "push", message: "split build and deploy" }],
  [set(split(["checkout"])), { type: "push", message: "deploy: add checkout" }],
  [set(split(["checkout", "setup-node", "install", "build"])), { type: "push", message: "deploy: build again" }],
  [set(split(["download"], true)), { type: "push", message: "pass dist as an artifact" }],
  [],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

/** The deploy job's steps before `deploy`, and whether build uploads. */
export const shapeOf = (w: World) => {
  const jobs = w.workflows[0]?.jobs ?? [];
  const pre = (jobs.find((j) => j.id === "deploy")?.steps ?? []).slice(0, -1).map((s) => s.kind);
  const upload = (jobs.find((j) => j.id === "build")?.steps ?? []).some((s) => s.kind === "upload");
  return { pre, upload };
};

export const addPre = (w: World, kind: StepKind): CiAction => {
  const s = shapeOf(w);
  return set(split([...s.pre, kind], s.upload));
};
export const addUpload = (w: World): CiAction => set(split(shapeOf(w).pre, true));

const PRE: { kind: StepKind; label: string }[] = [
  { kind: "checkout", label: "checkout" },
  { kind: "setup-node", label: "setup-node" },
  { kind: "install", label: "npm ci" },
  { kind: "build", label: "npm run build" },
  { kind: "download", label: "download-artifact" },
];

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const s = shapeOf(w);
  return [
    {
      label: tr ? "deploy job'ına ekle" : "add to deploy job",
      buttons: PRE.map((p) => ({ label: p.label, action: addPre(w, p.kind), tone: "producer" as const, disabled: s.pre.includes(p.kind) })),
    },
    {
      label: tr ? "build job'ına ekle" : "add to build job",
      buttons: [{ label: "upload-artifact", action: addUpload(w), tone: "producer", disabled: s.upload }],
    },
    { label: "Git", buttons: [{ label: "git push", action: { type: "push" }, tone: "go" }] },
  ];
}


export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Üstte run'ın job'ları ve adımları, altta staging'de çalışan commit", "The run's jobs and steps on top, the commit staging runs below"),
  view: (w, info) => {
    if (!info.sandbox && info.step === 5) return <SharedPanel box={{ x: 20, y: 14, w: 820, h: 444 }} />;
    if (info.sandbox) {
      return (
        <g>
          <YamlAndRun world={w} prev={info.prev} run={focusRun(w, info)} runBox={{ x: 384, y: 14, w: 462, h: 316 }} />
          <EnvStrip world={w} box={{ x: 450, y: 344, w: 330, h: 100 }} />
        </g>
      );
    }
    return (
      <g>
        <RunStage run={focusRun(w, info)} box={{ x: 20, y: 14, w: 820, h: 320 }} />
        <EnvStrip world={w} box={{ x: 260, y: 344, w: 340, h: 100 }} />
      </g>
    );
  },
  metrics: (w, t) => [...runMetrics(w, t).slice(0, 2), { label: "staging", value: w.envs.staging?.sha ?? "—" }],
  sandbox: { start: () => fresh([split([])]), rows, missions },
});
