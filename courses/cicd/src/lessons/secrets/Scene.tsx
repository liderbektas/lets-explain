import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { LogPanel, YamlPanel } from "../../iso/panels";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { ciSim, ciTyped, focusRun, runMetrics, type CiInfo } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { LEAKED, relWf } from "./workflow";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "secrets";

export { LEAKED, relWf } from "./workflow";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
export const pushMain: CiAction = { type: "push", message: "release 1.4.0" };
export const pushFork: CiAction = { type: "push", branch: "contrib", message: "fix a typo in the cart page" };
export const addToken: CiAction = { type: "setSecret", name: "NPM_TOKEN", value: "npm_8f2kQx7Lr0aW3mZt9" };

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
      <AssemblyStage run={run} box={{ x: 384, y: 14, w: 462, h: 236 }} empty={tr ? "Henüz run yok." : "No runs yet."} />
      <LogPanel run={run} job={job} box={{ x: 384, y: 266, w: 462, h: 192 }} />
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
  // Free play: no token yet, publishing on every event, and a fork's PR is open.
  sandbox: { typed: ciTyped(scenarios, () => FREE) },
});
