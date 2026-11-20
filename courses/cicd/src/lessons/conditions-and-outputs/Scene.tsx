import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type Run, type Workflow, type World } from "../../engine/ci";
import { BUILD, CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { jobYaml } from "../../engine/yaml";
import { RunStage } from "../../iso/RunStage";
import { cut, Sticker, Terminal } from "../../iso/parts";
import { ciSim, focusRun, runMetrics, type CiInfo } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "conditions-and-outputs";

export interface Opts {
  /** deploy: `if: github.ref == 'refs/heads/main' ...` */
  mainOnly: boolean;
  /** Is there a notify job, and does it use `if: failure()`? */
  notify: "none" | "plain" | "failure";
  /** lint: `continue-on-error: true` */
  softLint: boolean;
}

export const VERSION_EXPR = "${{ needs.build.outputs.version }}";

export function condWf(o: Opts): Workflow {
  const jobs: Workflow["jobs"] = [
    {
      id: "build",
      steps: [
        CHECKOUT,
        SETUP,
        INSTALL,
        step("lint", o.softLint ? { continueOnError: true } : {}),
        TEST,
        BUILD,
        step("output", { with: { name: "version" } }),
        step("summary", { if: "always", with: { text: "### Build finished" } }),
        step("upload"),
      ],
    },
    {
      id: "deploy",
      needs: ["build"],
      ...(o.mainOnly ? { if: "main" as const } : {}),
      steps: [step("download"), step("deploy"), step("summary", { with: { text: `Deployed ${VERSION_EXPR} to staging` } })],
    },
  ];
  if (o.notify !== "none") jobs.push({ id: "notify", needs: ["build", "deploy"], ...(o.notify === "failure" ? { if: "failure" as const } : {}), steps: [step("notify")] });
  return { name: "CI/CD", on: { push: {} }, jobs };
}

export const optsOf = (w: World): Opts => {
  const wf = w.workflows[0]!;
  const notify = wf.jobs.find((j) => j.id === "notify");
  return {
    mainOnly: wf.jobs.find((j) => j.id === "deploy")?.if === "main",
    notify: !notify ? "none" : notify.if === "failure" ? "failure" : "plain",
    softLint: Boolean(wf.jobs[0]!.steps.find((s) => s.kind === "lint")?.continueOnError),
  };
};

const set = (o: Opts): CiAction => ({ type: "setWorkflow", workflow: condWf(o) });
export const pushFeature: CiAction = { type: "push", branch: "feature", message: "try a new banner" };
export const pushBroken: CiAction = { type: "push", add: ["test"], message: "add VAT to cart total" };
export const pushLint: CiAction = { type: "push", add: ["lint"], message: "quick fix with a leftover variable" };
export const pushFixed: CiAction = { type: "push", fix: ["test", "lint"], message: "fix: tests and lint" };

const INIT = { secrets: { DEPLOY_TOKEN: "dt_x" }, envs: [{ name: "staging", sha: "3f2a1c9" }] };
export const START: World = freshWorld(INIT);

const specs: Spec<World, CiAction>[][] = [
  [set({ mainOnly: false, notify: "none", softLint: false }), pushFeature],
  [set({ mainOnly: true, notify: "none", softLint: false }), pushFeature, pushFixed],
  [set({ mainOnly: true, notify: "plain", softLint: false }), pushBroken],
  [set({ mainOnly: true, notify: "failure", softLint: false }), { type: "push", message: "add a test for VAT" }],
  [pushFixed],
  [set({ mainOnly: true, notify: "failure", softLint: true }), pushLint],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const SANDBOX_OPTS: Opts = { mainOnly: false, notify: "plain", softLint: false };
export const sandboxStart = (): World => ciSim.apply(freshWorld(INIT), set(SANDBOX_OPTS)).state;

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const o = optsOf(w);
  return [
    {
      label: "Workflow",
      buttons: [
        { label: o.mainOnly ? (tr ? "deploy: if'i kaldır" : "deploy: remove if") : "deploy: if main", action: set({ ...o, mainOnly: !o.mainOnly }), tone: "producer" },
        { label: o.notify === "failure" ? (tr ? "notify: if'i kaldır" : "notify: remove if") : "notify: if failure()", action: set({ ...o, notify: o.notify === "failure" ? "plain" : "failure" }), tone: "producer" },
        { label: o.softLint ? (tr ? "lint: zorunlu yap" : "lint: make it strict") : "lint: continue-on-error", action: set({ ...o, softLint: !o.softLint }), tone: "producer" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: "push feature", action: pushFeature, tone: "go" },
        { label: tr ? "push main (test kırık)" : "push main (broken test)", action: pushBroken, tone: "danger" },
        { label: tr ? "push main (lint hatası)" : "push main (lint error)", action: pushLint, tone: "danger" },
        { label: tr ? "push main (hepsi düzgün)" : "push main (all fixed)", action: pushFixed, tone: "go" },
      ],
    },
  ];
}

/** `${{ needs.build.outputs.version }}` filled in with what the build job wrote, like GitHub does. */
export function resolvedSummary(run?: Run): string[] {
  if (!run) return [];
  const version = run.jobs.find((j) => j.id === "build")?.outputs.version ?? "";
  return run.summary.map((s) => s.replace(VERSION_EXPR, version));
}

/** The lines of the workflow this lesson is about: each job's `if:` and the lint step. */
function keyLines(wf: Workflow): string[] {
  const out: string[] = [];
  for (const j of wf.jobs) {
    const lines: string[] = [];
    jobYaml(j, lines, wf.jobs);
    out.push(lines[0]!.trim());
    for (const line of lines) {
      if (/^ {4}(if:|needs:)/.test(line) || /steps\.meta\.outputs/.test(line)) out.push(`  ${line.trim()}`);
      if (/continue-on-error:/.test(line)) out.push("  lint: continue-on-error: true");
    }
  }
  return out;
}

function View({ w, info }: { w: World; info: CiInfo }) {
  const tr = info.lang === "tr";
  const run = focusRun(w, info);
  const wf = w.workflows[0];
  const lines = wf ? keyLines(wf) : [];
  const old = info.prev.workflows[0] ? new Set(keyLines(info.prev.workflows[0])) : null;
  const lastNote = [...w.runs].reverse().flatMap((r) => (r.jobs.find((j) => j.id === "notify" && j.status === "success") ? [r] : []))[0];
  const summary = resolvedSummary(run);
  const lh = Math.min(15, 104 / Math.max(lines.length, 1));
  const size = Math.min(11.5, lh * 0.85);
  return (
    <g className="ci">
      <RunStage run={run} box={{ x: 20, y: 12, w: 820, h: 284 }} />
      <Terminal box={{ x: 20, y: 310, w: 410, h: 148 }} title={tr ? "ci-cd.yml · koşullar" : "ci-cd.yml · conditions"}>
        {lines.map((line, i) => {
          const y = 310 + 44 + i * lh;
          const fresh = old && !old.has(line);
          return (
            <g key={i}>
              {fresh && <rect x={28} y={y - lh + 3} width={394} height={lh} rx={3} className="yaml-new" />}
              <text x={34} y={y} className={line.startsWith("  ") ? "mono-light" : "mono-key"} style={{ fontSize: size, whiteSpace: "pre" }}>
                {cut(line, 62)}
              </text>
            </g>
          );
        })}
      </Terminal>
      <Sticker x={446} y={310} w={394} h={148} head="var(--sky-soft)" headH={32}>
        <text x={462} y={332} className="title" style={{ fontSize: 14 }}>
          {tr ? "Run'ın sonuçları" : "What the run left"}
        </text>
        <text x={462} y={360} className="sub">
          staging: {w.envs.staging?.sha ?? "—"}
          {w.envs.staging?.sha ? ` (${w.commits.find((c) => c.sha === w.envs.staging!.sha)!.branch})` : ""}
        </text>
        <text x={462} y={384} className="sub">
          {cut(`${tr ? "Sohbet" : "Chat"}: ${lastNote ? `#${lastNote.id} ${tr ? "mesaj attı" : "posted"}: "${w.workflows[0]?.name} failed on ${lastNote.branch}"` : "—"}`, 54)}
        </text>
        <text x={462} y={408} className="sub">
          {cut(`Summary: ${summary.length ? summary[summary.length - 1] : "—"}`, 54)}
        </text>
        <text x={462} y={432} className="muted" style={{ fontSize: 11.5 }}>
          {run ? cut(`${tr ? "build çıktısı" : "build output"}: version=${run.jobs.find((j) => j.id === "build")?.outputs.version ?? "—"}`, 56) : ""}
        </text>
      </Sticker>
    </g>
  );
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Üstte son run'ın job'ları; altta workflow'daki koşullar ve run'ın bıraktığı izler", "The last run's jobs on top; below, the workflow's conditions and what the run left behind"),
  view: (w, info) => <View w={w} info={info} />,
  metrics: (w, t) => [...runMetrics(w, t, latestRun(w)).slice(0, 2), { label: "staging", value: w.envs.staging?.sha ?? "—" }],
  sandbox: { start: sandboxStart, rows, missions },
});
