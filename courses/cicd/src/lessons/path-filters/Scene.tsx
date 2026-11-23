import { l } from "@lets-explain/core/i18n";
import { blockingChecks, freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { PREP, TEST, ciWorkflow, step } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { PrPanel, YamlPanel } from "../../iso/panels";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { ciSim, ciTyped, focusRun, runMetrics, type CiInfo } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";

export const SLUG = "path-filters";

/** Runs on every push to main, whatever changed. */
export const PLAIN: Workflow = ciWorkflow({ on: { push: { branches: ["main"] } } });
/** Skips the whole workflow when only docs or Markdown changed. */
export const IGNORE: Workflow = ciWorkflow({ on: { push: { branches: ["main"], pathsIgnore: ["docs/**", "**/*.md"] } } });
/** One repo, two apps: a `changes` job decides which app's tests run. */
export const MONO: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "changes", steps: [step("changes", { with: { filters: "web/**,api/**" } })] },
    { id: "web", needs: ["changes"], if: "changed:web/**", steps: [...PREP, TEST] },
    { id: "api", needs: ["changes"], if: "changed:api/**", steps: [...PREP, TEST] },
  ],
};

/**
 * The PR workflow of the trap. `paths`: the workflow only starts for `src/**`.
 * `skip`: the workflow always starts, and a `changes` job lets `test` skip itself.
 */
export function prWorkflow(paths: boolean, skip: boolean): Workflow {
  const test = { id: "test", steps: [...PREP, TEST] };
  return {
    name: "CI",
    on: { pull_request: paths ? { paths: ["src/**"] } : {} },
    jobs: skip ? [{ id: "changes", steps: [step("changes", { with: { filters: "src/**" } })] }, { ...test, needs: ["changes"], if: "changed:src/**" }] : [test],
  };
}

export const REQUIRED = "CI / test";

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const pushMain = (paths: string[]): CiAction => ({ type: "push", paths, message: paths.every((p) => p.endsWith(".md")) ? "docs: fix a typo" : `update ${paths.join(", ")}` });
export const pushDocs = (path: string): CiAction => ({ type: "push", branch: "docs", paths: [path], message: `docs: ${path}` });
export const merge: CiAction = { type: "merge", pr: 1 };

export const START: World = freshWorld();

const specs: Spec<World, CiAction>[][] = [
  [set(PLAIN), pushMain(["README.md"])],
  [set(IGNORE), pushMain(["README.md"]), pushMain(["src/cart.ts"])],
  [pushMain(["README.md", "src/cart.ts"])],
  [set(MONO), pushMain(["web/index.html"])],
  [{ type: "setProtection", required: [REQUIRED] }, set(prWorkflow(true, false)), pushDocs("docs/guide.md"), { type: "openPr", branch: "docs" }, merge],
  [set(prWorkflow(false, true)), pushDocs("docs/faq.md"), merge],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

function View({ w, info }: { w: World; info: CiInfo }) {
  const tr = info.lang === "tr";
  const wf = w.workflows[0];
  const old = wf ? info.prev.workflows.find((x) => x.name === wf.name) : undefined;
  const yaml = wf && <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={{ x: 16, y: 14, w: 350, h: 444 }} title={workflowFile(wf)} />;
  const skipped = info.last.some((e) => e.type === "notTriggered") && !info.last.some((e) => e.type === "triggered");
  const empty = skipped
    ? tr
      ? "CI hiç başlamadı: değişen dosyalar filtreye uymadı."
      : "CI never started: the changed files did not match the filter."
    : undefined;
  if (w.prs.length) {
    const run = w.runs.find((r) => r.pr === 1 && r.sha === w.heads.docs) ?? undefined;
    return (
      <g>
        {yaml}
        <PrPanel world={w} pr={1} box={{ x: 384, y: 14, w: 462, h: 210 }} />
        <AssemblyStage run={skipped ? undefined : run} blocked={skipped} box={{ x: 384, y: 244, w: 462, h: 214 }} empty={empty ?? (tr ? "Bu PR'da CI hiç çalışmadı." : "CI never ran on this PR.")} />
      </g>
    );
  }
  return (
    <g>
      {yaml}
      <AssemblyStage run={skipped ? undefined : focusRun(w, info)} blocked={skipped} box={{ x: 384, y: 14, w: 462, h: 444 }} empty={empty} />
    </g>
  );
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda workflow dosyası; sağda push'un başlattığı run ya da PR'ın check'leri", "The workflow file on the left; on the right the run a push started, or the PR's checks"),
  view: (w, info) => <View w={w} info={info} />,
  metrics: (w, t) =>
    w.prs.length
      ? [
          { label: t(l("PR #1", "PR #1")), value: w.prs[0]!.state === "merged" ? t(l("merge edildi", "merged")) : blockingChecks(w, 1).length ? t(l("engelli", "blocked")) : t(l("merge edilebilir", "mergeable")), tone: w.prs[0]!.state === "merged" ? ("ok" as const) : blockingChecks(w, 1).length ? ("danger" as const) : ("plain" as const) },
          { label: t(l("Run sayısı", "Runs")), value: w.runs.length },
          { label: t(l("Toplam dakika", "Minutes billed")), value: w.runs.reduce((m, r) => m + r.minutes, 0) },
        ]
      : [...runMetrics(w, t, latestRun(w)).slice(0, 2), { label: t(l("Run sayısı", "Runs")), value: w.runs.length }, { label: t(l("Toplam dakika", "Minutes billed")), value: w.runs.reduce((m, r) => m + r.minutes, 0) }],
  // Free play: the story's end, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});
