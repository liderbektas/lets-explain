import { motion } from "motion/react";
import { useLang } from "@lets-explain/core/i18n";
import { Parcel } from "@lets-explain/core/iso/shapes";
import { fmt, type JobRun, type Run, type Status, type StepRun } from "../engine/ci";
import { cut, STATUS_SOFT, StatusDot, Sticker, type Box } from "./parts";
import { appearAt, stepTimes, useReplay, visibleBetween, type Replay } from "./replay";

/**
 * One workflow run as a little production line. The header is where the commit comes in;
 * each job is a station (a sticker card) laid out left to right by `needs`, joined by arrows,
 * with its steps listed and, underneath, the runner's workbench. A runner starts empty: each
 * step puts its real product on the bench (the code after checkout, Node after setup-node,
 * node_modules after `npm ci`, dist after the build). A failing step leaves its exit code and
 * stops the job. When the job ends the runner is thrown away, so the bench is wiped: nothing
 * reaches the next job unless it went through an artifact (the run's tray in the header) or
 * the cache. A new run is played back in order; an old one is drawn as it ended.
 */

const STATUS_TEXT: Record<Status, [string, string]> = {
  queued: ["sırada", "queued"],
  waiting: ["onay bekliyor", "waiting"],
  success: ["başarılı", "success"],
  failure: ["başarısız", "failure"],
  skipped: ["atlandı", "skipped"],
  cancelled: ["iptal", "cancelled"],
};

const EVENT_TEXT: Record<string, [string, string]> = {
  push: ["push", "push"],
  pull_request: ["pull request", "pull request"],
  schedule: ["schedule", "schedule"],
  dispatch: ["elle", "manual"],
};

export const statusText = (s: Status, tr: boolean) => STATUS_TEXT[s][tr ? 0 : 1];

/** How long a file takes to fly between a bench and the run's artifact tray. */
const FLIGHT_MS = 400;

const ROW = 21;
const HEAD = 44;
const BENCH = 40;

function levels(run: Run): string[][] {
  const ids = [...new Set(run.jobs.map((j) => j.id))];
  const lvl = new Map<string, number>();
  const level = (id: string): number => {
    if (lvl.has(id)) return lvl.get(id)!;
    const j = run.jobs.find((x) => x.id === id);
    const v = j && j.needs.length ? 1 + Math.max(...j.needs.map(level)) : 0;
    lvl.set(id, v);
    return v;
  };
  ids.forEach(level);
  const cols: string[][] = [];
  for (const id of ids) (cols[lvl.get(id)!] ??= []).push(id);
  return cols.filter(Boolean);
}

/** Which steps to list when a card has room for only `rows`: keep the ones that matter. */
function pickSteps(job: JobRun, rows: number) {
  const all = job.steps.map((s, i) => ({ s, i }));
  if (all.length <= rows) return { shown: all, hidden: 0, hiddenPassed: true };
  // One row goes to the "+n more" line, but never drop the step that broke the job.
  const slots = Math.max(1, rows - 1);
  const rank = (st: string) => (st === "failure" ? 0 : st === "cancelled" ? 1 : st === "success" ? 3 : 2);
  const byRank = [...all].sort((a, b) => rank(a.s.status) - rank(b.s.status) || a.i - b.i);
  const keep = new Set(byRank.slice(0, slots).map((x) => x.i));
  const shown = all.filter((x) => keep.has(x.i));
  const hiddenPassed = all.every((x) => keep.has(x.i) || x.s.status === "success");
  return { shown, hidden: all.length - shown.length, hiddenPassed };
}

/* ------------------------------------------------------------- the bench */

type Tone = "code" | "node" | "deps" | "dist" | "image" | "cache" | "bad";

const TONE_FILL: Record<Tone, string> = {
  code: "var(--sun-soft)",
  node: "var(--mint)",
  deps: "var(--lilac-soft)",
  dist: "var(--sky)",
  image: "var(--sky-soft)",
  cache: "#efe5d2",
  bad: "var(--red-soft)",
};

/** Something a step left on the runner. `at` is when (simulated seconds). */
interface Item {
  label: string;
  tone: Tone;
  at: number;
  /** Where it came from, when not made here: dropped in from the cache, or out of the tray. */
  from?: "cache" | "artifact";
}

/** Something that leaves the runner: an artifact upload, a cache save, an image push, a deploy. */
interface Out {
  label: string;
  tone: Tone;
  at: number;
  to: "tray" | "up" | "right";
  /** Index of the bench item it is a copy of, so it flies from there. */
  source: number;
}

const hit = (s: StepRun) => s.kind === "cache" && s.log[0]?.startsWith("Cache restored");
const cacheFolder = (s: StepRun) => (s.name.includes("node_modules") ? "node_modules" : "~/.npm");

function benchOf(job: JobRun, tr: boolean): { items: Item[]; outs: Out[] } {
  const items: Item[] = [];
  const outs: Out[] = [];
  const times = stepTimes(job);
  const find = (tone: Tone) => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i]!.tone === tone) return i;
    return -1;
  };
  job.steps.forEach((s, i) => {
    const at = times[i]!.end;
    if (s.status === "failure" && !s.allowed) {
      items.push({ label: `exit ${s.exit ?? 1}`, tone: "bad", at });
      return;
    }
    if (s.status !== "success") return;
    switch (s.kind) {
      case "checkout":
        items.push({ label: tr ? "kod" : "code", tone: "code", at });
        break;
      case "setup-node":
        items.push({ label: `node ${job.node ?? (/node (\d+)/.exec(s.name)?.[1] ?? "22")}`, tone: "node", at });
        break;
      case "cache":
        if (hit(s)) items.push({ label: cacheFolder(s), tone: cacheFolder(s) === "node_modules" ? "deps" : "cache", at, from: "cache" });
        break;
      case "install":
        if (find("deps") < 0) items.push({ label: "node_modules", tone: "deps", at });
        break;
      case "build":
        items.push({ label: "dist/", tone: "dist", at });
        break;
      case "download":
        items.push({ label: "dist/", tone: "dist", at, from: "artifact" });
        break;
      case "upload":
        if (find("dist") >= 0) outs.push({ label: "dist/", tone: "dist", at, to: "tray", source: find("dist") });
        break;
      case "docker-push":
        items.push({ label: "image", tone: "image", at });
        outs.push({ label: "image", tone: "image", at: at + 0.01, to: "up", source: items.length - 1 });
        break;
      case "deploy": {
        // What goes out is what this runner holds: the build, or else the image. A deploy that
        // pulls from the registry holds neither; its image comes down from above (source -1).
        const src = find("dist") >= 0 ? find("dist") : find("image");
        const env = s.delivered?.env ?? "env";
        outs.push({ label: src >= 0 ? `${items[src]!.label} → ${env}` : `image → ${env}`, tone: src >= 0 ? items[src]!.tone : "image", at, to: "right", source: src });
        break;
      }
    }
  });
  // actions/cache saves in a post step, after the job's last step, only when the job passed.
  const cacheStep = job.steps.find((s) => s.kind === "cache");
  if (cacheStep && cacheStep.status === "success" && !hit(cacheStep) && job.status === "success") {
    const folder = cacheFolder(cacheStep);
    const src = folder === "node_modules" ? find("deps") : -1;
    outs.push({ label: tr ? `${folder} → cache` : `${folder} → cache`, tone: folder === "node_modules" ? "deps" : "cache", at: job.end, to: "up", source: src });
  }
  return { items, outs };
}

const chipW = (label: string) => Math.round(label.length * 6.4 + 16);

function Chip({ label, tone, ghost }: { label: string; tone: Tone; ghost?: boolean }) {
  const w = chipW(label);
  return (
    <g opacity={ghost ? 0.28 : 1}>
      <rect x={0} y={-10} width={w} height={20} rx={6} className="sticker" style={{ fill: TONE_FILL[tone], strokeWidth: 1.4, strokeDasharray: ghost ? "3 3" : undefined }} />
      <text x={w / 2} y={4} textAnchor="middle" className="mono" style={{ fontSize: 10.5, fill: tone === "bad" ? "var(--red)" : undefined }}>
        {label}
      </text>
    </g>
  );
}

/** The runner's workbench under a job card. */
function Bench({ job, x, y, w, replay, tray, trayReady, tr }: { job: JobRun; x: number; y: number; w: number; replay: Replay | null; tray: { x: number; y: number } | null; trayReady: number; tr: boolean }) {
  const play = replay && replay.fresh(job) ? replay : null;
  const { items, outs } = benchOf(job, tr);
  const by = y + BENCH / 2;
  // Lay the items out left to right; when they do not fit, keep the newest.
  const pos: number[] = [];
  let cx = x + 10;
  for (const it of items) {
    pos.push(cx);
    cx += chipW(it.label) + 5;
  }
  const note = job.status === "waiting" ? null : job.status === "skipped" || job.status === "queued" ? (tr ? "runner açılmadı" : "no runner started") : tr ? "runner silindi" : "runner discarded";
  const overflow = Math.max(0, cx - (x + w - 10));
  const shift = (i: number) => pos[i]! - overflow;
  const visible = (i: number) => shift(i) >= x + 6;
  const ran = job.status === "success" || job.status === "failure" || job.status === "cancelled";
  const wiped = ran;
  const wipeAt = play ? play.ms(job.end) + 250 : 0;

  return (
    <g>
      <rect x={x + 4} y={y + 2} width={w - 8} height={BENCH - 8} rx={8} style={{ fill: "#efe5d2", stroke: "var(--ink)", strokeWidth: 1.4, strokeDasharray: ran ? undefined : "4 4" }} />
      {job.status === "waiting" && (
        <g>
          {/* A closed gate: the job waits here until someone approves. */}
          <line x1={x + w / 2 - 40} x2={x + w / 2 - 40} y1={y + 4} y2={y + BENCH - 8} className="edge" />
          <line x1={x + w / 2 + 40} x2={x + w / 2 + 40} y1={y + 4} y2={y + BENCH - 8} className="edge" />
          <rect x={x + w / 2 - 40} y={by - 5} width={80} height={9} rx={3} className="sticker" style={{ fill: "var(--sun)", strokeWidth: 1.4 }} />
          <text x={x + w / 2 + 48} y={by + 3} className="muted" style={{ fontSize: 10.5 }}>
            {tr ? "onay" : "approval"}
          </text>
        </g>
      )}
      {items.map((it, i) => {
        if (!visible(i)) return null;
        const ix = shift(i);
        if (!play) {
          return (
            <g key={i} transform={`translate(${ix} ${by})`}>
              <Chip label={it.label} tone={it.tone} ghost={wiped} />
            </g>
          );
        }
        // A download can only leave the tray once the upload has landed there.
        const at = it.from === "artifact" ? Math.max(play.ms(it.at), trayReady) : play.ms(it.at);
        // Made here: pops up on the bench. From the cache: drops in from above. From the tray: flies down from it.
        const start = it.from === "artifact" && tray ? { x: tray.x + 58, y: tray.y } : it.from === "cache" ? { x: ix, y: by - 70 } : { x: ix, y: by - 10 };
        // Moving and fading are two layers: it travels in when made, and fades when the runner is thrown away.
        return (
          <motion.g key={`${play.key}-${i}`} initial={{ x: start.x, y: start.y }} animate={{ x: ix, y: by }} transition={{ delay: at / 1000, duration: FLIGHT_MS / 1000 }}>
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at / 1000, duration: 0.15 }}>
              {wiped ? (
                <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0.28 }} transition={{ delay: wipeAt / 1000, duration: 0.3 }}>
                  <Chip label={it.label} tone={it.tone} />
                </motion.g>
              ) : (
                <Chip label={it.label} tone={it.tone} />
              )}
            </motion.g>
          </motion.g>
        );
      })}
      {play &&
        outs.map((o, i) => {
          const sx = o.source >= 0 && visible(o.source) ? shift(o.source) : x + 10;
          const sy = o.source < 0 && o.to === "right" ? by - 70 : by;
          const target = o.to === "tray" && tray ? { x: tray.x + 58, y: tray.y } : o.to === "up" ? { x: sx, y: by - 80 } : { x: x + w + 40, y: by };
          const at = play.ms(o.at);
          return (
            <motion.g key={`${play.key}-out-${i}`} initial={{ x: sx, y: sy }} animate={{ x: target.x, y: target.y }} transition={{ delay: at / 1000, duration: FLIGHT_MS / 1000 }}>
              <motion.g {...visibleBetween(at, at + FLIGHT_MS + 80)}>
                <Chip label={o.label} tone={o.tone} />
              </motion.g>
            </motion.g>
          );
        })}
      {note &&
        (() => {
          // A small tag on the bench's top edge, so it never covers what is on the bench.
          const tw = note.length * 5.5 + 14;
          const tag = (
            <g>
              <rect x={x + w - 12 - tw} y={y - 8} width={tw} height={14} rx={7} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 1.2 }} />
              <text x={x + w - 12 - tw / 2} y={y + 2.5} textAnchor="middle" className="muted" style={{ fontSize: 9.5 }}>
                {note}
              </text>
            </g>
          );
          return play && wiped ? (
            <motion.g key={`${play.key}-note`} {...appearAt(wipeAt)}>
              {tag}
            </motion.g>
          ) : (
            tag
          );
        })()}
    </g>
  );
}

/* --------------------------------------------------------------- the run */

export function RunStage({ run, box = { x: 20, y: 16, w: 820, h: 440 }, focus, empty, blocked }: { run?: Run; box?: Box; focus?: string; empty?: string; blocked?: boolean }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const replay = useReplay(run);
  if (!run) {
    return (
      <g className="ci">
        <Sticker x={box.x} y={box.y} w={box.w} h={70} fill="var(--paper-2)">
          {blocked && (
            <g>
              {/* The commit comes in and stops at a closed bar: nothing was started. */}
              <motion.g initial={{ x: box.x - 10, opacity: 0 }} animate={{ x: box.x + 30, opacity: 1 }} transition={{ duration: 0.5 }}>
                <g transform={`translate(0 ${box.y + 46})`}>
                  <Parcel s={12} size={0.9} kind="neutral" />
                </g>
              </motion.g>
              <line x1={box.x + 58} x2={box.x + 58} y1={box.y + 16} y2={box.y + 54} className="edge" />
              <rect x={box.x + 54} y={box.y + 30} width={8} height={12} rx={2} className="sticker" style={{ fill: "var(--coral)", strokeWidth: 1.4 }} />
            </g>
          )}
          <text x={blocked ? box.x + 76 : box.x + box.w / 2} y={box.y + 41} textAnchor={blocked ? "start" : "middle"} className="muted">
            {cut(empty ?? (tr ? "Henüz çalışan bir workflow yok." : "No workflow has run yet."), Math.floor((box.w - (blocked ? 90 : 24)) / 7))}
          </text>
        </Sticker>
      </g>
    );
  }
  const cols = levels(run);
  const top = box.y + 62;
  const areaH = box.y + box.h - top;
  const colW = box.w / Math.max(cols.length, 1);
  const cw = Math.min(300, colW - 34);
  const chars = Math.floor((cw - 78) / 7.3);

  const cards = new Map<string, { x: number; y: number; h: number; job: JobRun; bench: boolean }>();
  cols.forEach((ids, ci) => {
    const legs = ids.flatMap((id) => run.jobs.filter((j) => j.id === id));
    const gap = 12;
    const maxH = (areaH - gap * (legs.length - 1)) / legs.length;
    const bench = maxH >= HEAD + ROW + BENCH + 6;
    const natural = legs.map((j) => HEAD + Math.max(1, j.steps.length) * ROW + 10 + (bench ? BENCH : 0));
    const heights = natural.map((n) => Math.min(n, maxH));
    const total = heights.reduce((a, b) => a + b, 0) + gap * (legs.length - 1);
    let y = top + Math.max(0, Math.min(24, (areaH - total) / 2));
    legs.forEach((j, i) => {
      cards.set(j.key, { x: box.x + ci * colW + (colW - cw) / 2, y, h: heights[i]!, job: j, bench });
      y += heights[i]! + gap;
    });
  });

  const edges: { from: JobRun; to: JobRun }[] = [];
  for (const j of run.jobs) for (const n of j.needs) for (const d of run.jobs.filter((x) => x.id === n)) edges.push({ from: d, to: j });

  const dur = fmt(run.end - run.start);
  const narrow = box.w < 600;
  const ev = EVENT_TEXT[run.event]![tr ? 0 : 1];
  const steps = run.jobs.flatMap((j) => j.steps);
  const hasTray = steps.some((s) => s.kind === "upload" || s.kind === "download");
  const uploaded = run.jobs.flatMap((j) => j.steps.map((s, i) => ({ j, s, t: stepTimes(j)[i]!.end }))).find((x) => x.s.kind === "upload" && x.s.status === "success");
  const tray = hasTray ? { x: box.x + box.w - (narrow ? 150 : 300), y: box.y + 23 } : null;
  const runDone = replay ? replay.ms(run.end) : 0;
  const trayReady = replay && uploaded && replay.fresh(uploaded.j) ? replay.ms(uploaded.t) + FLIGHT_MS : 0;

  return (
    <g className="ci">
      {/* header: where the commit comes in */}
      <Sticker x={box.x} y={box.y} w={box.w} h={46} head={STATUS_SOFT[replay ? "queued" : run.status]} headH={46}>
        {replay && (
          <motion.path key={`${replay.key}-head`} d={`M${box.x + 1} ${box.y + 45} V${box.y + 14} a13 13 0 0 1 13 -13 H${box.x + box.w - 14} a13 13 0 0 1 13 13 V${box.y + 45} Z`} style={{ fill: STATUS_SOFT[run.status] }} {...appearAt(runDone)} />
        )}
        <motion.g key={replay?.arrival ? `${replay.key}-parcel` : "parcel"} initial={replay?.arrival ? { x: -40, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.4 }}>
          <g transform={`translate(${box.x + 28} ${box.y + 30})`}>
            <Parcel s={14} size={0.9} kind={run.status === "failure" ? "cancel" : run.status === "success" ? "order" : "neutral"} />
          </g>
        </motion.g>
        <StatusDot status={replay ? "queued" : run.status} x={box.x + 58} y={box.y + 23} r={9} />
        {replay && (
          <motion.g key={`${replay.key}-dot`} {...appearAt(runDone)}>
            <StatusDot status={run.status} x={box.x + 58} y={box.y + 23} r={9} />
          </motion.g>
        )}
        <text x={box.x + 75} y={box.y + 28} className="title">
          #{run.id} {run.workflow}
        </text>
        <text x={box.x + 85 + (String(run.id).length + run.workflow.length + 2) * 8.6} y={box.y + 28} className="sub">
          {narrow
            ? cut(`${hasTray ? "" : `${run.branch} · `}${run.sha}${run.attempt > 1 ? ` · #${run.attempt}` : ""}`, hasTray ? 8 : 22)
            : cut(`${ev} · ${run.branch} · ${run.sha}${run.attempt > 1 ? (tr ? ` · deneme ${run.attempt}` : ` · attempt ${run.attempt}`) : ""}${run.fork ? " · fork" : ""}`, hasTray ? 26 : 46)}
        </text>
        {tray && (
          <g>
            {/* The run's artifact storage: jobs leave files here and pick them up again. */}
            <rect x={tray.x - 4} y={tray.y - 13} width={118} height={26} rx={8} style={{ fill: "#efe5d2", stroke: "var(--ink)", strokeWidth: 1.4, strokeDasharray: "4 3" }} />
            <text x={tray.x + 2} y={tray.y + 4} className="sub" style={{ fontSize: 10 }}>
              artifact
            </text>
            {uploaded &&
              (replay && replay.fresh(uploaded.j) ? (
                <motion.g key={`${replay.key}-tray`} {...appearAt(trayReady, 0.1)}>
                  <g transform={`translate(${tray.x + 58} ${tray.y})`}>
                    <Chip label="dist/" tone="dist" />
                  </g>
                </motion.g>
              ) : (
                <g transform={`translate(${tray.x + 58} ${tray.y})`}>
                  <Chip label="dist/" tone="dist" />
                </g>
              ))}
          </g>
        )}
        {/* The result is written in once the run has played out. */}
        {replay && (
          <motion.text key={`${replay.key}-running`} x={box.x + box.w - 16} y={box.y + 28} textAnchor="end" className="sub" {...visibleBetween(0, runDone)}>
            {tr ? "çalışıyor…" : "running…"}
          </motion.text>
        )}
        <motion.text key={replay ? `${replay.key}-result` : "result"} x={box.x + box.w - 16} y={box.y + 28} textAnchor="end" className="sub" {...(replay ? appearAt(runDone) : {})}>
          {narrow ? dur : `${statusText(run.status, tr)} · ${dur} · ${run.minutes} ${tr ? "dk" : "min"}`}
        </motion.text>
      </Sticker>

      {edges.map(({ from, to }) => {
        const a = cards.get(from.key);
        const b = cards.get(to.key);
        if (!a || !b) return null;
        const x1 = a.x + cw + 2;
        const y1 = a.y + Math.min(a.h / 2, 22);
        const x2 = b.x - 6;
        const y2 = b.y + Math.min(b.h / 2, 22);
        const mx = (x1 + x2) / 2;
        const d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2} M${x2 - 7} ${y2 - 5} L${x2} ${y2} L${x2 - 7} ${y2 + 5}`;
        const goes = from.status === "success" && to.status !== "skipped" && to.status !== "queued";
        // The arrow lights up when the job it comes from has passed: that is what lets the next one start.
        if (replay && replay.fresh(to) && goes) {
          return (
            <g key={`${from.key}-${to.key}`}>
              <path d={d} className="edge is-dim" />
              <motion.path key={`${replay.key}-edge`} d={d} className="edge" {...appearAt(replay.ms(from.end))} />
            </g>
          );
        }
        return <path key={`${from.key}-${to.key}`} d={d} className={`edge ${goes ? "" : "is-dim"}`} />;
      })}

      {[...cards.values()].map(({ x, y, h, job, bench }) => {
        const play = replay && replay.fresh(job) ? replay : null;
        const stepsH = h - (bench ? BENCH : 0);
        const rows = Math.max(1, Math.floor((stepsH - HEAD - 6) / ROW));
        const { shown, hidden, hiddenPassed } = pickSteps(job, rows);
        const times = stepTimes(job);
        const note =
          job.status === "skipped"
            ? job.reason === "needs"
              ? tr ? "atlandı: ihtiyaç duyduğu job geçmedi" : "skipped: a job it needs did not pass"
              : tr ? "atlandı: if koşulu tutmadı" : "skipped: its if was false"
            : job.status === "waiting"
              ? tr ? `onay bekliyor: ${job.environment}` : `waiting for approval: ${job.environment}`
              : job.status === "queued"
                ? tr ? "sırada" : "queued"
                : null;
        // A step's lamp turns when the step ends; one that never ran (skipped after a failure) turns when the job stopped.
        const endOf = (i: number) => times[i]!.end;
        return (
          <Sticker key={job.key} x={x} y={y} w={cw} h={h} head={STATUS_SOFT[play ? "queued" : job.status]} headH={34} lit={focus === job.key || focus === job.id}>
            {play && <motion.path key={`${play.key}-jh`} d={`M${x + 1} ${y + 34} V${y + 14} a13 13 0 0 1 13 -13 H${x + cw - 14} a13 13 0 0 1 13 13 V${y + 34} Z`} style={{ fill: STATUS_SOFT[job.status] }} {...appearAt(play.ms(job.end))} />}
            <StatusDot status={play ? "queued" : job.status} x={x + 18} y={y + 17} r={8.5} />
            {play && (
              <>
                <motion.circle key={`${play.key}-jr`} cx={x + 18} cy={y + 17} r={12} style={{ fill: "none", stroke: "var(--sun)", strokeWidth: 3 }} {...visibleBetween(play.ms(job.start), play.ms(job.end))} />
                <motion.g key={`${play.key}-jd`} {...appearAt(play.ms(job.end))}>
                  <StatusDot status={job.status} x={x + 18} y={y + 17} r={8.5} />
                </motion.g>
              </>
            )}
            <text x={x + 33} y={y + 22} className="title" style={{ fontSize: 14.5 }}>
              {cut(job.label, Math.floor((cw - 100) / 8))}
            </text>
            <text x={x + cw - 12} y={y + 22} textAnchor="end" className="sub" style={{ fontSize: 12 }}>
              {job.status === "skipped" || job.status === "waiting" || job.status === "queued" ? "" : fmt(job.end - job.start)}
            </text>
            {note && job.steps.length === 0 ? (
              play && job.status === "skipped" ? (
                // Being skipped is decided when the jobs it needs end: until then it is only queued.
                <>
                  <motion.text key={`${play.key}-jq`} x={x + 14} y={y + HEAD + 12} className="muted" style={{ fontSize: 11.5 }} {...visibleBetween(0, play.ms(job.end))}>
                    {tr ? "sırada" : "queued"}
                  </motion.text>
                  <motion.text key={`${play.key}-jn`} x={x + 14} y={y + HEAD + 12} className="muted" style={{ fontSize: 11.5 }} {...appearAt(play.ms(job.end))}>
                    {cut(note, Math.floor((cw - 24) / 6.2))}
                  </motion.text>
                </>
              ) : (
                <text x={x + 14} y={y + HEAD + 12} className="muted" style={{ fontSize: 11.5 }}>
                  {cut(note, Math.floor((cw - 24) / 6.2))}
                </text>
              )
            ) : (
              shown.map(({ s, i: si }, i) => {
                const ry = y + HEAD + 6 + i * ROW;
                const bad = s.status === "failure" && !s.allowed;
                const ends = play ? play.ms(endOf(si)) : 0;
                const ranHere = s.seconds > 0 && s.status !== "skipped";
                return (
                  <g key={`${s.name}-${i}`}>
                    {bad && (play ? <motion.rect key={`${play.key}-bad`} x={x + 6} y={ry - 8} width={cw - 12} height={ROW - 2} rx={6} style={{ fill: "var(--red-soft)" }} {...appearAt(ends)} /> : <rect x={x + 6} y={ry - 8} width={cw - 12} height={ROW - 2} rx={6} style={{ fill: "var(--red-soft)" }} />)}
                    {play ? (
                      <>
                        <StatusDot status="queued" x={x + 17} y={ry + 2} r={6} />
                        {ranHere && <motion.circle key={`${play.key}-sr`} cx={x + 17} cy={ry + 2} r={9} style={{ fill: "none", stroke: "var(--sun)", strokeWidth: 2.5 }} {...visibleBetween(play.ms(times[si]!.start), ends)} />}
                        <motion.g key={`${play.key}-sd`} {...appearAt(ends, 0.15)}>
                          <StatusDot status={s.status} x={x + 17} y={ry + 2} r={6} />
                        </motion.g>
                      </>
                    ) : (
                      <StatusDot status={s.status} x={x + 17} y={ry + 2} r={6} />
                    )}
                    <text x={x + 30} y={ry + 6.5} className="mono" style={{ fontSize: 12, fill: s.status === "skipped" || s.status === "cancelled" ? "var(--ink-3)" : undefined }}>
                      {cut(s.name.replace(/^Run /, ""), chars)}
                    </text>
                    <text x={x + cw - 12} y={ry + 6.5} textAnchor="end" className="sub" style={{ fontSize: 11.5 }}>
                      {s.status === "skipped" ? "—" : s.allowed ? "⚠" : fmt(s.seconds)}
                    </text>
                  </g>
                );
              })
            )}
            {hidden > 0 && (
              <text x={x + 28} y={y + HEAD + 6 + shown.length * ROW + 5} className="muted" style={{ fontSize: 10.5 }}>
                {hiddenPassed ? (tr ? `+${hidden} adım başarılı` : `+${hidden} more passed`) : tr ? `+${hidden} adım daha` : `+${hidden} more steps`}
              </text>
            )}
            {bench && <Bench job={job} x={x} y={y + h - BENCH} w={cw} replay={replay} tray={tray} trayReady={trayReady} tr={tr} />}
          </Sticker>
        );
      })}
    </g>
  );
}
