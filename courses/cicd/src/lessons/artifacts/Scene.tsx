import { motion } from "motion/react";
import { l } from "@lets-explain/core/i18n";
import { freshWorld, latestRun, type CiAction, type JobDef, type Run, type StepDef, type Workflow, type World } from "../../engine/ci";
import { BUILD, PREP, step } from "../../engine/presets";
import { EnvStrip } from "../../iso/panels";
import { Sticker } from "../../iso/parts";
import { RunStage } from "../../iso/RunStage";
import { appearAt, stepTimes, useReplay, visibleBetween } from "../../iso/replay";
import { ciSim, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "artifacts";

export interface Flags {
  upload: boolean;
  download: boolean;
  /** The deploy job builds again itself instead of downloading. */
  rebuild: boolean;
}

const UPLOAD = step("upload");
const DOWNLOAD = step("download");
const DEPLOY = step("deploy");

/** build → deploy, with the artifact steps switched on or off. */
export function wf(f: Flags): Workflow {
  const deploy: StepDef[] = [...(f.rebuild ? [...PREP, BUILD] : []), ...(f.download ? [DOWNLOAD] : []), DEPLOY];
  return {
    name: "CI",
    on: { push: { branches: ["main"] } },
    jobs: [
      { id: "build", steps: [...PREP, BUILD, ...(f.upload ? [UPLOAD] : [])] },
      { id: "deploy", needs: ["build"], steps: deploy },
    ],
  };
}

/** Build once, then e2e and deploy both use the same dist/. */
export const SHARED: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "build", steps: [...PREP, BUILD, UPLOAD] },
    { id: "e2e", needs: ["build"], steps: [...PREP, DOWNLOAD, step("e2e")] } satisfies JobDef,
    { id: "deploy", needs: ["e2e"], steps: [DOWNLOAD, DEPLOY] },
  ],
};

/** A second workflow, started by hand, that tries to deploy a dist/ from another run. */
export const REDEPLOY: Workflow = { name: "Redeploy", on: { dispatch: [] }, jobs: [{ id: "deploy", steps: [DOWNLOAD, DEPLOY] }] };

export const flagsOf = (w: World): Flags => {
  const jobs = w.workflows.find((x) => x.name === "CI")?.jobs ?? [];
  const build = jobs.find((j) => j.id === "build")?.steps ?? [];
  const deploy = jobs.find((j) => j.id === "deploy")?.steps ?? [];
  return { upload: build.some((s) => s.kind === "upload"), download: deploy.some((s) => s.kind === "download"), rebuild: deploy.some((s) => s.kind === "build") };
};

const set = (w: Workflow): CiAction => ({ type: "setWorkflow", workflow: w });
const push = (message: string): CiAction => ({ type: "push", message });

const init = () => freshWorld({ workflows: [wf({ upload: false, download: false, rebuild: false })], secrets: { DEPLOY_TOKEN: "dpl_8f2c" }, envs: [{ name: "staging", sha: "3f2a1c9" }] });

export const START: World = init();

const specs: Spec<World, CiAction>[][] = [
  [push("cart: add VAT")],
  [set(wf({ upload: true, download: true, rebuild: false })), push("ci: pass dist/ between jobs")],
  [set(wf({ upload: false, download: true, rebuild: false })), push("ci: tidy up the build job")],
  [set(SHARED), push("ci: e2e against the built site")],
  [set(REDEPLOY), { type: "dispatch", workflow: "Redeploy" }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const SANDBOX: World = init();

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const f = flagsOf(w);
  const flip = (k: keyof Flags) => set(wf({ ...f, [k]: !f[k] }));
  return [
    {
      label: "build",
      buttons: [{ label: f.upload ? (tr ? "upload-artifact'i kaldır" : "remove upload-artifact") : tr ? "upload-artifact ekle" : "add upload-artifact", action: flip("upload"), tone: "producer" }],
    },
    {
      label: "deploy",
      buttons: [
        { label: f.download ? (tr ? "download-artifact'i kaldır" : "remove download-artifact") : tr ? "download-artifact ekle" : "add download-artifact", action: flip("download"), tone: "producer" },
        { label: f.rebuild ? (tr ? "yeniden build'i kaldır" : "stop building again") : tr ? "burada yeniden build et" : "build again here", action: flip("rebuild"), tone: "producer" },
      ],
    },
    { label: "Git", buttons: [{ label: "git push", action: push("cart: add VAT"), tone: "go" }] },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda run'ın job'ları, sağda run'ların artifact'leri ve staging'de çalışan commit", "The run's jobs on the left, the runs' artifacts and the commit running on staging on the right"),
  view: (w, info) => {
    const run = focusRun(w, info);
    return (
      <g>
        <RunStage run={run} box={{ x: 16, y: 14, w: 828, h: 296 }} />
        <ArtifactCard world={w} focus={run} tr={info.lang === "tr"} />
        <EnvStrip world={w} box={{ x: 560, y: 318, w: 286, h: 118 }} />
      </g>
    );
  },
  metrics: (w, t) => {
    const r = latestRun(w);
    const builds = r ? r.jobs.reduce((n, j) => n + j.steps.filter((s) => s.kind === "build" && s.status === "success").length, 0) : 0;
    return [
      { label: t(l("Son run", "Last run")), value: r ? `#${r.id}` : "—", tone: r?.status === "failure" ? ("danger" as const) : r ? ("ok" as const) : ("plain" as const) },
      { label: t(l("Build sayısı", "Builds in run")), value: r ? builds : "—" },
      { label: t(l("staging", "staging")), value: w.envs.staging?.sha ?? "—" },
    ];
  },
  sandbox: { start: () => SANDBOX, rows, missions },
});

/** Each recent run with the artifacts it holds. */
/** Each recent run's artifact storage. A run being played back shows its artifact once the upload has landed. */
function ArtifactCard({ world, focus, tr }: { world: World; focus?: Run; tr: boolean }) {
  const runs = world.runs.slice(-3);
  const replay = useReplay(focus);
  const uploadedAt = (r: Run) => {
    if (!replay || r.id !== focus?.id) return 0;
    for (const j of r.jobs) {
      const k = j.steps.findIndex((st) => st.kind === "upload" && st.status === "success");
      if (k >= 0 && replay.fresh(j)) return replay.ms(stepTimes(j)[k]!.end) + 400;
    }
    return 0;
  };
  const X = 16;
  const Y = 326;
  const W = 520;
  return (
    <g className="ci">
      <Sticker x={X} y={Y} w={W} h={132} head="var(--sun-soft)" headH={34}>
        <text x={X + 16} y={Y + 23} className="title" style={{ fontSize: 14 }}>
          {tr ? "Artifact'ler" : "Artifacts"}
        </text>
        {runs.length === 0 && (
          <text x={X + 16} y={Y + 64} className="muted">
            {tr ? "Henüz run yok." : "No runs yet."}
          </text>
        )}
        {runs.map((r, i) => {
          const list = world.artifacts[r.id] ?? [];
          const y = Y + 58 + i * 26;
          const lit = focus?.id === r.id;
          return (
            <g key={r.id}>
              {lit && <rect x={X + 8} y={y - 16} width={W - 16} height={24} rx={8} style={{ fill: "var(--tangerine-soft)" }} />}
              <text x={X + 18} y={y + 1} className="mono" style={{ fontSize: 12 }}>
                #{r.id} {r.workflow} · {r.sha}
              </text>
              {uploadedAt(r) ? (
                <>
                  <motion.text key={`${replay!.key}-none`} x={X + W - 18} y={y + 1} textAnchor="end" className="sub" style={{ fontSize: 11.5, fill: "var(--ink-3)" }} {...visibleBetween(0, uploadedAt(r))}>
                    {tr ? "yok" : "none"}
                  </motion.text>
                  <motion.text key={`${replay!.key}-list`} x={X + W - 18} y={y + 1} textAnchor="end" className="sub" style={{ fontSize: 11.5, fill: "var(--ink)" }} {...appearAt(uploadedAt(r))}>
                    {list.join(", ")}
                  </motion.text>
                </>
              ) : (
                <text x={X + W - 18} y={y + 1} textAnchor="end" className="sub" style={{ fontSize: 11.5, fill: list.length ? "var(--ink)" : "var(--ink-3)" }}>
                  {list.length ? list.join(", ") : tr ? "yok" : "none"}
                </text>
              )}
            </g>
          );
        })}
      </Sticker>
    </g>
  );
}
