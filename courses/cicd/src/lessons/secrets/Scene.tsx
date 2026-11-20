import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, PREP, SETUP, TEST, step } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { LogPanel, YamlPanel } from "../../iso/panels";
import { RunStage } from "../../iso/RunStage";
import { ciSim, focusRun, runMetrics, type CiInfo } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "secrets";

export function relWf(pushOnly: boolean): Workflow {
  return {
    name: "Release",
    on: { push: { branches: ["main"] }, pull_request: {} },
    jobs: [
      { id: "test", steps: [...PREP, TEST] },
      { id: "publish", needs: ["test"], ...(pushOnly ? { if: "push" as const } : {}), steps: [CHECKOUT, SETUP, step("print-secret"), step("publish")] },
    ],
  };
}

/** What people do before they learn about secrets: the token right in the file. */
export const LEAKED = `name: Release
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: npm_8f2kQx7Lr0aW3mZt9`;

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const pushMain: CiAction = { type: "push", message: "release 1.4.0" };
export const pushFork: CiAction = { type: "push", branch: "contrib", message: "fix a typo in the cart page" };
export const addToken: CiAction = { type: "setSecret", name: "NPM_TOKEN", value: "npm_8f2kQx7Lr0aW3mZt9" };
export const dropToken: CiAction = { type: "setSecret", name: "NPM_TOKEN", value: null };

export const START: World = freshWorld();

const specs: Spec<World, CiAction>[][] = [
  [],
  [set(relWf(false)), pushMain],
  [addToken, pushMain],
  [{ type: "push", branch: "contrib", message: "fix a typo in the cart page" }, { type: "openPr", branch: "contrib", fork: true }],
  [set(relWf(true)), pushFork],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const pushOnly = (w: World) => w.workflows[0]?.jobs.find((j) => j.id === "publish")?.if === "push";

/** The try-it step: no token yet, publishing on every event, and a fork's PR is open. */
export function sandboxStart(): World {
  let w = freshWorld({ workflows: [relWf(false)] });
  for (const a of [pushFork, { type: "openPr", branch: "contrib", fork: true } as CiAction]) w = ciSim.apply(w, a).state;
  return w;
}

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const has = "NPM_TOKEN" in w.secrets;
  const p = pushOnly(w);
  return [
    {
      label: tr ? "Ayarlar" : "Settings",
      buttons: [
        has ? { label: tr ? "NPM_TOKEN secret'ını sil" : "delete NPM_TOKEN secret", action: dropToken, tone: "danger" } : { label: tr ? "NPM_TOKEN secret'ı ekle" : "add NPM_TOKEN secret", action: addToken, tone: "ok" },
        { label: p ? (tr ? "publish: if'i kaldır" : "publish: remove if") : "publish: if push", action: set(relWf(!p)), tone: "producer" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "push main", action: pushMain, tone: "go" },
        { label: tr ? "fork PR'a push" : "push to the fork's PR", action: pushFork, tone: "go" },
      ],
    },
  ];
}

function View({ w, info }: { w: World; info: CiInfo }) {
  const tr = info.lang === "tr";
  const wf = w.workflows[0];
  if (!info.sandbox && info.step === 0) {
    return (
      <g>
        <YamlPanel yaml={LEAKED} box={{ x: 120, y: 30, w: 620, h: 400 }} title=".github/workflows/release.yml" bad={[13]} />
      </g>
    );
  }
  const old = wf ? info.prev.workflows.find((x) => x.name === wf.name) : undefined;
  const run = focusRun(w, info);
  const publish = run?.jobs.find((j) => j.id === "publish");
  const job = publish && publish.status !== "skipped" ? publish : run?.jobs[0];
  return (
    <g>
      {wf && <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={{ x: 16, y: 14, w: 350, h: 444 }} title={workflowFile(wf)} />}
      <RunStage run={run} box={{ x: 384, y: 14, w: 462, h: 214 }} empty={tr ? "Henüz run yok." : "No runs yet."} />
      <LogPanel run={run} job={job} box={{ x: 384, y: 244, w: 462, h: 214 }} />
    </g>
  );
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Workflow dosyası, son run ve publish job'ının logu", "The workflow file, the last run and the publish job's log"),
  view: (w, info) => <View w={w} info={info} />,
  metrics: (w, t) => [
    ...runMetrics(w, t, latestRun(w)).slice(0, 1),
    { label: t(l("Secret'lar", "Secrets")), value: Object.keys(w.secrets).length ? Object.keys(w.secrets).join(", ") : "—" },
    { label: t(l("Yayınlanan sürüm", "Published")), value: w.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === "publish" && s.status === "success"))) ? "1.4.0" : "—" },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
