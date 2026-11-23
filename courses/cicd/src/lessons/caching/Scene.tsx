import { motion } from "motion/react";
import { l } from "@lets-explain/core/i18n";
import { fmt, freshWorld, latestRun, lockHash, type CiAction, type Run, type StepDef, type Workflow, type World } from "../../engine/ci";
import { CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { Crate, crateW, METAL, OBox } from "../../iso/factory";
import { cut, Sticker } from "../../iso/parts";
import { appearAt, stepTimes, useReplay, visibleBetween } from "../../iso/replay";
import { ciSim, ciTyped, focusRun, YamlAndRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { scenarios } from "./scenarios";

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

/** Whether a run's cache (an actions/cache step, or setup-node's `cache: npm`) found its key. */
export const cacheResult = (r?: Run): "hit" | "miss" | null => {
  const steps = r?.jobs[0]?.steps ?? [];
  const c = steps.find((x) => x.kind === "cache");
  if (c) return c.log[0]?.startsWith("Cache restored") ? "hit" : "miss";
  const node = steps.find((x) => x.kind === "setup-node" && x.log.some((y) => y.startsWith("Cache restored") || y === "npm cache is not found"));
  return !node ? null : node.log.some((y) => y.startsWith("Cache restored")) ? "hit" : "miss";
};

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
  // Free play: the story's end, checked out on main.
  sandbox: { typed: ciTyped(scenarios) },
});

/**
 * The repository's cache, drawn as a warehouse shelf that outlives the runners: every key is a
 * crate on it, marked current or from an old lockfile. When a run is played back, a key it
 * restored lights up at the moment its cache step read it (a copy goes down to the runner), and
 * a key it saved appears when its job ended (actions/cache saves in a post step, and only when
 * the job passed).
 */
function CacheCard({ world, run, tr }: { world: World; run?: Run; tr: boolean }) {
  const keys = Object.entries(world.cache);
  const head = world.commits[world.commits.length - 1]!;
  const replay = useReplay(run);
  const timing = (key: string): { hit?: number; saved?: number } => {
    if (!replay || !run) return {};
    for (const j of run.jobs) {
      if (!replay.fresh(j)) continue;
      const k = j.steps.findIndex((st) => (st.kind === "cache" || st.kind === "setup-node") && st.status === "success" && st.log.some((x) => x.endsWith(key) || (x === "npm cache is not found" && key.startsWith("node-cache-"))));
      if (k < 0) continue;
      const st = j.steps[k]!;
      if (st.log.some((x) => x.startsWith("Cache restored"))) return { hit: replay.ms(stepTimes(j)[k]!.end) };
      if (j.status === "success") return { saved: replay.ms(j.end) + 300 };
    }
    return {};
  };
  const X = 16;
  const Y = 330;
  return (
    <g className="ci">
      <Sticker x={X} y={Y} w={350} h={128} head="var(--sky-soft)" headH={34}>
        <text x={X + 16} y={Y + 23} className="title" style={{ fontSize: 14 }}>
          {tr ? "Repodaki cache" : "Repository cache"}
        </text>
        <text x={X + 336} y={Y + 23} textAnchor="end" className="sub" style={{ fontSize: 11 }}>
          lockfile: {lockHash(head.lock)}
        </text>
        {/* The shelves: they stay between runs. */}
        {[0, 1, 2].map((i) => (
          <OBox key={i} x={X + 10} y={Y + 62 + i * 28} w={318} h={4} d={10} {...METAL} thin />
        ))}
        {keys.length === 0 && (
          <text x={X + 22} y={Y + 56} className="muted">
            {tr ? "Henüz kayıt yok." : "Nothing stored yet."}
          </text>
        )}
        {keys.slice(-3).map(([k, v], i) => {
          const stale = v.lock !== head.lock;
          const { hit, saved } = timing(k);
          const y = Y + 50 + i * 28;
          const label = cut(k, 22);
          return (
            <motion.g key={saved ? `${replay!.key}-${k}` : k} {...(saved ? appearAt(saved) : {})}>
              {hit !== undefined && <motion.rect key={`${replay!.key}-hit-${k}`} x={X + 14} y={y - 14} width={crateW(label, 11) + 14} height={28} rx={6} style={{ fill: "var(--mint)", stroke: "#3fd07f", strokeWidth: 2 }} {...visibleBetween(hit, hit + 700)} />}
              <g transform={`translate(${X + 20} ${y})`} opacity={stale ? 0.55 : 1}>
                <Crate label={label} tone={stale ? "cache" : "deps"} size={11} />
              </g>
              <text x={X + 30 + crateW(label, 11) + 10} y={y + 4} className="sub" style={{ fontSize: 11, fill: stale ? "var(--ink-3)" : undefined }}>
                {stale ? (tr ? `eski lockfile ${lockHash(v.lock)}` : `old lockfile ${lockHash(v.lock)}`) : tr ? "güncel" : "current"}
              </text>
            </motion.g>
          );
        })}
      </Sticker>
    </g>
  );
}
