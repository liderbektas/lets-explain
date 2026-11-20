import { motion } from "motion/react";
import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, latestRun, lockHash, type CiAction, type Run, type StepDef, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { cut, Sticker } from "../../iso/parts";
import { appearAt, stepTimes, useReplay, visibleBetween } from "../../iso/replay";
import { ciSim, focusRun, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec } from "../shared/SimScene";
import { missions } from "./missions";

export const SLUG = "caching";

/** none: no cache. npm: ~/.npm keyed by the lockfile. stale: node_modules under a fixed key, `npm ci` skipped on a hit. */
export type Mode = "none" | "npm" | "stale";

export function wf(mode: Mode): Workflow {
  const steps: StepDef[] =
    mode === "none"
      ? [CHECKOUT, SETUP, INSTALL, TEST]
      : mode === "npm"
        ? [CHECKOUT, SETUP, step("cache"), INSTALL, TEST]
        : [CHECKOUT, SETUP, step("cache", { with: { path: "node_modules", key: "static" } }), step("install", { if: "cache-miss" }), TEST];
  return { name: "CI", on: { push: { branches: ["main"] } }, jobs: [{ id: "test", steps }] };
}

export const modeOf = (w: World): Mode => {
  const c = w.workflows[0]?.jobs[0]?.steps.find((s) => s.kind === "cache");
  return !c ? "none" : c.with?.path === "node_modules" ? "stale" : "npm";
};

const set = (m: Mode): CiAction => ({ type: "setWorkflow", workflow: wf(m) });
const src: CiAction = { type: "push", message: "cart: add VAT" };
const dep: CiAction = { type: "push", lock: true, paths: ["package.json", "package-lock.json", "src/date.ts"], message: "add dayjs for dates" };

export const START: World = freshWorld({ workflows: [wf("none")] });

const specs: Spec<World, CiAction>[][] = [
  [src, src],
  [set("npm"), src],
  [src],
  [dep],
  [set("stale"), src],
  [dep],
  [set("npm"), src],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

/** How long `npm ci` took in a run, or "skipped". */
export const installTime = (r?: Run): number | "skipped" | null => {
  const s = r?.jobs[0]?.steps.find((x) => x.kind === "install");
  if (!s) return null;
  return s.status === "skipped" ? "skipped" : s.seconds;
};

/** Whether a run's cache step found its key. */
export const cacheResult = (r?: Run): "hit" | "miss" | null => {
  const c = r?.jobs[0]?.steps.find((x) => x.kind === "cache");
  return !c ? null : c.log[0]?.startsWith("Cache restored") ? "hit" : "miss";
};

export const SANDBOX: World = START;

function rows(w: World, lang: "tr" | "en"): SandboxRow<CiAction>[] {
  const tr = lang === "tr";
  const m = modeOf(w);
  return [
    {
      label: "Cache",
      buttons: [
        { label: tr ? "cache yok" : "no cache", action: set("none"), tone: "danger", disabled: m === "none" },
        { label: tr ? "~/.npm, anahtar: lockfile hash" : "~/.npm, key: lockfile hash", action: set("npm"), tone: "ok", disabled: m === "npm" },
        { label: tr ? "node_modules, sabit anahtar" : "node_modules, fixed key", action: set("stale"), tone: "producer", disabled: m === "stale" },
      ],
    },
    {
      label: "Git",
      buttons: [
        { label: tr ? "kodu değiştir + push" : "change code + push", action: src, tone: "go" },
        { label: tr ? "bağımlılık ekle + push" : "add a dependency + push", action: dep, tone: "go" },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda workflow ve cache'te saklanan anahtarlar, sağda run: npm ci kaç saniye sürdü?", "The workflow and the cache's stored keys on the left, the run on the right: how long did npm ci take?"),
  view: (w, info) => {
    const run = focusRun(w, info);
    return (
      <g>
        <YamlAndRun world={w} prev={info.prev} run={run} yamlBox={{ x: 16, y: 14, w: 350, h: 300 }} />
        <CacheCard world={w} run={run} tr={info.lang === "tr"} />
      </g>
    );
  },
  metrics: (w, t) => {
    const r = latestRun(w);
    const it = installTime(r);
    const res = cacheResult(r);
    return [
      { label: t(l("Son run", "Last run")), value: r ? `#${r.id}` : "—", tone: r?.status === "failure" ? ("danger" as const) : r ? ("ok" as const) : ("plain" as const) },
      { label: "npm ci", value: it === null ? "—" : it === "skipped" ? t(l("atlandı", "skipped")) : fmt(it), tone: it === 12 ? ("ok" as const) : ("plain" as const) },
      { label: "Cache", value: res === "hit" ? t(l("bulundu", "hit")) : res === "miss" ? t(l("yok", "miss")) : "—" },
      { label: t(l("Saklanan anahtar", "Stored keys")), value: Object.keys(w.cache).length },
    ];
  },
  sandbox: { start: () => SANDBOX, rows, missions },
});

/** The repository's cache: every key with the lockfile its folder came from. */
/**
 * The repository's cache. When a run is played back, a key it restored lights up at the moment
 * its cache step read it, and a key it saved appears when its job ended (actions/cache saves in a
 * post step, and only when the job passed).
 */
function CacheCard({ world, run, tr }: { world: World; run?: Run; tr: boolean }) {
  const keys = Object.entries(world.cache);
  const head = world.commits[world.commits.length - 1]!;
  const replay = useReplay(run);
  const timing = (key: string): { hit?: number; saved?: number } => {
    if (!replay || !run) return {};
    for (const j of run.jobs) {
      if (!replay.fresh(j)) continue;
      const k = j.steps.findIndex((st) => st.kind === "cache" && st.status === "success" && st.log[0]?.endsWith(key));
      if (k < 0) continue;
      const st = j.steps[k]!;
      if (st.log[0]!.startsWith("Cache restored")) return { hit: replay.ms(stepTimes(j)[k]!.end) };
      if (j.status === "success") return { saved: replay.ms(j.end) + 300 };
    }
    return {};
  };
  return (
    <g className="ci">
      <Sticker x={16} y={330} w={350} h={128} head="var(--sky-soft)" headH={34}>
        <text x={32} y={330 + 23} className="title" style={{ fontSize: 14 }}>
          {tr ? "Repodaki cache" : "Repository cache"}
        </text>
        <text x={352} y={330 + 23} textAnchor="end" className="sub" style={{ fontSize: 11 }}>
          lockfile: {lockHash(head.lock)}
        </text>
        {keys.length === 0 && (
          <text x={32} y={330 + 62} className="muted">
            {tr ? "Henüz kayıt yok." : "Nothing stored yet."}
          </text>
        )}
        {keys.slice(-3).map(([k, v], i) => {
          const stale = v.lock !== head.lock;
          const { hit, saved } = timing(k);
          return (
            <motion.g key={saved ? `${replay!.key}-${k}` : k} {...(saved ? appearAt(saved) : {})}>
            {hit !== undefined && <motion.rect key={`${replay!.key}-hit-${k}`} x={24} y={330 + 58 + i * 22 - 15} width={334} height={20} rx={6} style={{ fill: "var(--mint)" }} {...visibleBetween(hit, hit + 700)} />}
            <text x={32} y={330 + 58 + i * 22} className="mono" style={{ fontSize: 11.5, fill: stale ? "var(--ink-3)" : undefined }}>
              {cut(`${k}`, 24)}
              <tspan className="sub" style={{ fontSize: 10.5 }}>
                {"  "}
                {stale ? (tr ? `(eski lockfile ${lockHash(v.lock)})` : `(old lockfile ${lockHash(v.lock)})`) : tr ? "(güncel)" : "(current)"}
              </tspan>
            </text>
            </motion.g>
          );
        })}
      </Sticker>
    </g>
  );
}
