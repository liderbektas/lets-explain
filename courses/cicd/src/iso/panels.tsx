import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { Building, Flag, Parcel, TINTS } from "@lets-explain/core/iso/shapes";
import { checkName, checksFor, commitOf, fmt, type JobRun, type Run, type World } from "../engine/ci";
import { statusText } from "./RunStage";
import { cut, STATUS_FILL, StatusDot, Sticker, Terminal, type Box } from "./parts";
import { appearAt, LEAD_MS, stepTimes, useReplay, visibleBetween } from "./replay";

/* ------------------------------------------------------------- YAML file */

/** A workflow file in a terminal card. Lines that were not in `prev` are highlighted. */
export function YamlPanel({ yaml, prev, box, title, bad }: { yaml: string; prev?: string; box: Box; title: string; bad?: number[] }) {
  const lines = yaml.split("\n");
  const old = prev === undefined ? null : new Set(prev.split("\n"));
  const lh = Math.min(15, (box.h - 44) / lines.length);
  const size = Math.max(8.5, Math.min(12, lh * 0.82));
  const chars = Math.floor((box.w - 52) / (size * 0.6));
  return (
    <g className="ci">
      <Terminal box={box} title={title}>
        {lines.map((line, i) => {
          const y = box.y + 44 + i * lh;
          const fresh = old && line.trim() !== "" && !old.has(line);
          const isBad = bad?.includes(i);
          const key = /^(\s*-?\s*)([a-z_-]+:)(.*)$/i.exec(line);
          return (
            <g key={i}>
              {(fresh || isBad) && <rect x={box.x + 8} y={y - lh + 3} width={box.w - 16} height={lh} rx={3} className={isBad ? "yaml-bad" : "yaml-new"} />}
              <text x={box.x + 30} y={y} textAnchor="end" className="mono-dim" style={{ fontSize: size - 1 }}>
                {i + 1}
              </text>
              <text x={box.x + 40} y={y} className="mono-light" style={{ fontSize: size, whiteSpace: "pre" }}>
                {key ? (
                  <>
                    <tspan>{key[1]}</tspan>
                    <tspan className="mono-key">{key[2]}</tspan>
                    <tspan>{cut(key[3]!, Math.max(4, chars - key[1]!.length - key[2]!.length))}</tspan>
                  </>
                ) : (
                  cut(line, chars)
                )}
              </text>
            </g>
          );
        })}
      </Terminal>
    </g>
  );
}

/* ------------------------------------------------------------------ logs */

/** A job's log: every step with its lamp, and the failed (or chosen) step opened up. */
export function LogPanel({ run, job, box, open }: { run?: Run; job?: JobRun; box: Box; open?: number }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const replay = useReplay(run);
  const j = job ?? run?.jobs.find((x) => x.status === "failure") ?? run?.jobs[run.jobs.length - 1];
  if (!run || !j) {
    return (
      <g className="ci">
        <Terminal box={box} title={tr ? "log" : "log"}>
          <text x={box.x + 20} y={box.y + 60} className="mono-dim" style={{ fontSize: 12 }}>
            {tr ? "Henüz log yok." : "No logs yet."}
          </text>
        </Terminal>
      </g>
    );
  }
  const openIdx = open ?? Math.max(0, j.steps.findIndex((s) => s.status === "failure" || s.status === "cancelled"));
  const failIdx = j.steps.findIndex((s) => s.status === "failure" || s.status === "cancelled");
  const idx = failIdx >= 0 && open === undefined ? failIdx : Math.min(openIdx, j.steps.length - 1);
  // `at`: when the line is written, in simulated time. A step's name shows when it starts, its
  // output when it ends, so a played-back run streams its log the way GitHub does.
  const rows: { text: string; cls: string; bg?: boolean; dot?: JobRun["steps"][number]["status"]; at: number }[] = [];
  const times = stepTimes(j);
  j.steps.forEach((s, i) => {
    rows.push({ text: `${s.name}${s.status === "skipped" ? "" : `   ${fmt(s.seconds)}`}`, cls: s.status === "failure" ? "mono-bad" : s.status === "success" ? "mono-light" : "mono-dim", dot: s.status, at: times[i]!.start });
    if (i === idx) for (const line of s.log) rows.push({ text: line, cls: line.startsWith("##[error]") || /error|Error|FAIL|✖|failed/.test(line) ? "mono-bad" : "mono-dim", bg: s.status === "failure" || s.status === "cancelled", at: times[i]!.end });
  });
  if (j.status === "failure" || j.status === "cancelled") {
    const exit = j.steps.find((s) => s.name === j.failedStep)?.exit;
    rows.push({ text: j.reason === "timeout" ? "##[error]The operation was canceled." : `##[error]Process completed with exit code ${exit ?? 1}.`, cls: "mono-bad", bg: true, at: j.end });
  }
  const play = replay && replay.fresh(j) ? replay : null;
  const lh = Math.min(17, (box.h - 50) / rows.length);
  const size = Math.max(9, Math.min(12, lh * 0.74));
  const chars = Math.floor((box.w - 60) / (size * 0.6));
  return (
    <g className="ci">
      <Terminal box={box} title={`#${run.id} ${run.workflow} · ${j.label}`}>
        {rows.map((r, i) => {
          const y = box.y + 48 + i * lh;
          const Line = play ? motion.g : "g";
          return (
            <Line key={play ? `${play.key}-${i}` : i} {...(play ? appearAt(play.ms(r.at), 0.15) : {})}>
              {r.bg && <rect x={box.x + 8} y={y - lh + 4} width={box.w - 16} height={lh} rx={3} className="log-fail" />}
              {r.dot ? <StatusDot status={r.dot} x={box.x + 24} y={y - size * 0.35} r={5} /> : null}
              <text x={box.x + (r.dot ? 36 : 48)} y={y} className={r.cls} style={{ fontSize: size, whiteSpace: "pre" }}>
                {cut(r.text, r.dot ? chars + 2 : chars)}
              </text>
            </Line>
          );
        })}
      </Terminal>
    </g>
  );
}

/* --------------------------------------------------------------- PR card */

/** Its children as they ended; when `at` > 0 they appear only then (keyed on the replay). */
function Settle({ at, k, children }: { at: number; k?: string; children: ReactNode }) {
  if (at <= 0) return <g>{children}</g>;
  return (
    <motion.g key={`${k}-settle`} {...appearAt(at, 0.2)}>
      {children}
    </motion.g>
  );
}

/**
 * A pull request as GitHub shows it: its checks, which are required, and the merge button. When
 * the PR's newest run is played back, each of its checks stays pending until its job has ended,
 * and the merge button only settles after the last one.
 */
export function PrPanel({ world, pr, box }: { world: World; pr: number; box: Box }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const p = world.prs.find((x) => x.id === pr);
  const head = p ? world.heads[p.branch] : undefined;
  const prRun = [...world.runs].reverse().find((r) => r.pr === pr && r.sha === head && r.event === "pull_request");
  const replay = useReplay(prRun);
  if (!p) return null;
  const checks = checksFor(world, pr);
  // When does a check settle on screen? At its job's end, if that job is being played back now.
  const settles = (name: string) => {
    if (!replay || !prRun) return 0;
    const job = prRun.jobs.find((j) => checkName(prRun.workflow, j.label) === name);
    return job && replay.fresh(job) ? replay.ms(job.end) : 0;
  };
  const allSettle = Math.max(0, ...checks.map((c) => settles(c.name)));
  const blocked = checks.some((c) => c.required && c.state !== "success" && c.state !== "skipped");
  const merged = p.state === "merged";
  const rowH = 30;
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} head="var(--lilac-soft)" headH={58}>
        <text x={box.x + 18} y={box.y + 26} className="title">
          {tr ? `Pull request #${p.id}` : `Pull request #${p.id}`}
        </text>
        <text x={box.x + 18} y={box.y + 46} className="sub">
          {p.branch} → main{p.fork ? " · fork" : ""} · {world.heads[p.branch]}
        </text>
        <text x={box.x + box.w - 16} y={box.y + 26} textAnchor="end" className="sub">
          {world.protection ? (tr ? "main korumalı" : "main is protected") : tr ? "main korumasız" : "main unprotected"}
        </text>
        {checks.length === 0 && (
          <text x={box.x + 18} y={box.y + 92} className="muted">
            {tr ? "Bu PR'da hiç check çalışmadı." : "No checks ran on this PR."}
          </text>
        )}
        {checks.slice(0, Math.floor((box.h - 140) / rowH)).map((c, i) => {
          const y = box.y + 88 + i * rowH;
          const label =
            c.state === "expected"
              ? tr ? "bekleniyor: hiç çalışmadı" : "expected: never reported"
              : c.state === "success"
                ? tr ? "geçti" : "passed"
                : c.state === "failure"
                  ? tr ? "kırıldı" : "failed"
                  : c.state === "skipped"
                    ? tr ? "atlandı (geçmiş sayılır)" : "skipped (counts as passing)"
                    : c.state === "pending"
                      ? tr ? "bekliyor" : "pending"
                      : tr ? "iptal" : "cancelled";
          const shownLabel = cut(label, 24);
          const badgeX = box.x + box.w - 24 - shownLabel.length * 6.6 - 70;
          const nameChars = Math.max(6, Math.floor((badgeX - box.x - 50) / 7.2));
          const at = settles(c.name);
          return (
            <g key={c.name}>
              {at > 0 && (
                <motion.g key={`${replay!.key}-pending`} {...visibleBetween(0, at)}>
                  <StatusDot status="pending" x={box.x + 26} y={y} r={7.5} />
                  <text x={box.x + box.w - 16} y={y + 4.5} textAnchor="end" className="sub" style={{ fontSize: 11 }}>
                    {tr ? "çalışıyor" : "running"}
                  </text>
                </motion.g>
              )}
              <Settle at={at} k={replay?.key}>
                <StatusDot status={c.state === "expected" ? "expected" : c.state} x={box.x + 26} y={y} r={7.5} />
                <text x={box.x + box.w - 16} y={y + 4.5} textAnchor="end" className="sub" style={{ fontSize: 11 }}>
                  {shownLabel}
                </text>
              </Settle>
              <text x={box.x + 42} y={y + 4.5} className="mono" style={{ fontSize: 12 }}>
                {cut(c.name, c.required ? nameChars : nameChars + 10)}
              </text>
              {c.required && (
                <g>
                  <rect x={badgeX} y={y - 10} width={64} height={20} rx={10} className="sticker" style={{ fill: "var(--sun-soft)", strokeWidth: 1.5 }} />
                  <text x={badgeX + 32} y={y + 4} textAnchor="middle" className="sub" style={{ fontSize: 10.5, fill: "var(--ink)" }}>
                    {tr ? "zorunlu" : "required"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {allSettle > 0 && !merged && (
          <motion.g key={`${replay!.key}-merge-wait`} {...visibleBetween(0, allSettle)}>
            <rect x={box.x + 16} y={box.y + box.h - 54} width={box.w - 32} height={38} rx={12} className="sticker" style={{ fill: "var(--sun-soft)" }} />
            <text x={box.x + box.w / 2} y={box.y + box.h - 30} textAnchor="middle" className="title" style={{ fontSize: 14 }}>
              {tr ? "Check'ler çalışıyor…" : "Checks are running…"}
            </text>
          </motion.g>
        )}
        <Settle at={merged ? 0 : allSettle} k={replay?.key}>
          <rect x={box.x + 16} y={box.y + box.h - 54} width={box.w - 32} height={38} rx={12} className="sticker" style={{ fill: merged ? "var(--lilac)" : blocked ? "#e9e5ec" : "#3fd07f" }} />
          <text x={box.x + box.w / 2} y={box.y + box.h - 30} textAnchor="middle" className="title" style={{ fontSize: 14 }}>
            {merged ? (tr ? "Merge edildi" : "Merged") : blocked ? (tr ? "Merge engellendi: zorunlu check'ler geçmedi" : "Merging is blocked: required checks not passing") : tr ? "Merge pull request" : "Merge pull request"}
          </text>
        </Settle>
      </Sticker>
    </g>
  );
}

/* -------------------------------------------------------------- timeline */

export interface TimelineRow {
  label: string;
  start: number;
  end: number;
  status: JobRun["status"];
  segments?: number[];
  /** The run (and job) the row stands for, so a new run's bars grow on the replay clock. */
  run?: Run;
  job?: JobRun;
}

/**
 * A Gantt chart: one row per job (or per run), bars from start to end on a shared clock. When a
 * run is played back its bars grow in step with the run cards, in the run's colour of "still
 * going" until they end; a run that a newer one cancelled shrinks back to where it was cut off.
 */
export function Timeline({ rows, box, title, from, to }: { rows: TimelineRow[]; box: Box; title?: string; from?: number; to?: number }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const clock = rows.find((r) => r.job)?.run ?? [...rows].filter((r) => r.run).sort((a, b) => b.run!.id - a.run!.id)[0]?.run;
  const replay = useReplay(clock);
  const t0 = from ?? Math.min(...rows.map((r) => r.start), 0);
  const t1 = Math.max(to ?? 0, ...rows.map((r) => r.end), t0 + 60);
  const left = box.x + 130;
  const right = box.x + box.w - 64;
  const xs = (t: number) => left + ((t - t0) / (t1 - t0)) * (right - left);
  const top = box.y + (title ? 54 : 30);
  const rowH = Math.min(40, (box.y + box.h - top - 26) / Math.max(rows.length, 1));
  const span = t1 - t0;
  const stepT = span > 1800 ? 600 : span > 900 ? 300 : span > 420 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= span; t += stepT) ticks.push(t);
  return (
    <g className="ci">
      <defs>
        <pattern id="ci-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" style={{ fill: "#e9e5ec" }} />
          <line x1="0" y1="0" x2="0" y2="8" style={{ stroke: "#b9b2c2", strokeWidth: 3 }} />
        </pattern>
      </defs>
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} fill="var(--card)">
        {title && (
          <text x={box.x + 18} y={box.y + 30} className="title">
            {title}
          </text>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xs(t0 + t)} x2={xs(t0 + t)} y1={top - 6} y2={top + rows.length * rowH} className="tick" />
            <text x={xs(t0 + t)} y={top + rows.length * rowH + 16} textAnchor="middle" className="tick-label">
              {fmt(t)}
            </text>
          </g>
        ))}
        {rows.length === 0 && (
          <text x={box.x + 18} y={top + 20} className="muted">
            {tr ? "Henüz çalışan bir şey yok." : "Nothing has run yet."}
          </text>
        )}
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const x1 = xs(r.start);
          const x2 = Math.max(xs(r.end), x1 + 4);
          const barH = Math.min(22, rowH - 10);
          const by = y + (rowH - barH) / 2;
          const segs: number[] = [];
          let acc = r.start;
          for (const s of r.segments ?? []) {
            acc += s;
            if (acc < r.end) segs.push(xs(acc));
          }
          const id = r.job ? `${r.run!.id}:${r.job.key}` : r.run ? `run:${r.run.id}` : `${r.label}-${i}`;
          // Rows of the run being played back grow on its clock (in absolute simulated time).
          const offset = r.job ? r.run!.start : 0;
          const growing = replay && ((r.job && replay.fresh(r.job)) || (!r.job && r.run && r.run.id === clock?.id && replay.arrival)) ? replay : null;
          const finalBar = (
            <rect x={x1} y={by} width={x2 - x1} height={barH} rx={6} className={`bar ${r.status === "cancelled" ? "hatch" : ""}`} style={r.status === "cancelled" ? undefined : { fill: STATUS_FILL[r.status] }} />
          );
          let bar;
          if (r.status === "skipped") bar = null;
          else if (growing) {
            const K = 8;
            const ts = Array.from({ length: K + 1 }, (_, k) => r.start + ((r.end - r.start) * k) / K);
            const at = ts.map((t) => growing.ms(t + offset));
            const d0 = at[0]!;
            const dur = Math.max(0.05, (at[K]! - d0) / 1000);
            bar = (
              <g key={`${growing.key}-${id}`}>
                <motion.rect x={x1} y={by} height={barH} rx={6} className="bar" style={{ fill: "var(--sun)" }} initial={{ width: 0 }} animate={{ width: ts.map((t) => Math.max(0, xs(t) - x1)).map((w, k) => (k === K ? x2 - x1 : w)) }} transition={{ delay: d0 / 1000, duration: dur, times: at.map((a) => (a - d0) / 1000 / dur), ease: "linear" }} />
                <motion.g {...appearAt(at[K]!)}>{finalBar}</motion.g>
              </g>
            );
          } else {
            // Drawn as it ended; a bar that got shorter (cancelled by a newer run) shrinks to its new end.
            bar = (
              <motion.rect key={id} x={x1} y={by} height={barH} rx={6} className={`bar ${r.status === "cancelled" ? "hatch" : ""}`} style={r.status === "cancelled" ? undefined : { fill: STATUS_FILL[r.status] }} initial={false} animate={{ width: x2 - x1 }} transition={{ delay: LEAD_MS / 1000, duration: 0.5 }} />
            );
          }
          return (
            <g key={id}>
              <text x={box.x + 18} y={y + rowH / 2 + 4} className="mono" style={{ fontSize: 11.5 }}>
                {cut(r.label, 15)}
              </text>
              {r.status === "skipped" ? (
                <text x={x1 + 4} y={y + rowH / 2 + 4} className="muted" style={{ fontSize: 11 }}>
                  {tr ? "atlandı" : "skipped"}
                </text>
              ) : (
                <g>
                  {bar}
                  {segs.map((sx) => (
                    <line key={sx} x1={sx} x2={sx} y1={by + 2} y2={by + barH - 2} className="bar-seg" />
                  ))}
                  {growing ? (
                    <motion.text key={`${growing.key}-${id}-t`} x={x2 + 6} y={y + rowH / 2 + 4} className="sub" style={{ fontSize: 10.5 }} {...appearAt(growing.ms(r.end + offset))}>
                      {fmt(r.end - r.start)}
                    </motion.text>
                  ) : (
                    <text x={x2 + 6} y={y + rowH / 2 + 4} className="sub" style={{ fontSize: 10.5 }}>
                      {fmt(r.end - r.start)}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </Sticker>
    </g>
  );
}

export const jobRows = (run?: Run): TimelineRow[] =>
  (run?.jobs ?? []).map((j) => ({ label: j.label, start: j.start - (run?.start ?? 0), end: j.end - (run?.start ?? 0), status: j.status, segments: j.steps.map((s) => s.seconds), run, job: j }));

export const runRows = (runs: Run[], tr: boolean) =>
  runs.map((r) => ({ label: `#${r.id} ${r.sha}`, start: r.start, end: r.end, status: r.status, segments: [] as number[], text: statusText(r.status, tr), run: r }));

/* ---------------------------------------------------------- environments */

/** How long a delivered parcel takes to drop into its building. */
const DROP_MS = 450;

interface Frame {
  sha: string | null;
  /** Screen ms this version arrives; 0 for the one already there. */
  at: number;
  /** A rollback brought it back, rather than a deploy bringing it in. */
  back?: boolean;
}

/** The newest run that deployed, rolled back, or is waiting at an environment's gate. */
const deployRun = (w: World) => [...w.runs].reverse().find((r) => r.jobs.some((j) => j.environment || j.steps.some((st) => st.delivered)));

/**
 * Each environment as a little building; its flag shows the commit running there. When a run
 * is played back, every deploy arrives as a parcel at the moment its step finished and the flag
 * changes; a rollback puts the previous flag back. A build that answers 500 makes the building
 * smoke. A job waiting for approval stands at a closed gate in front of it.
 */
export function EnvStrip({ world, box, names, lit }: { world: World; box: Box; names?: string[]; lit?: string }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const list = (names ?? Object.keys(world.envs)).map((n) => world.envs[n] ?? { name: n, approval: false, sha: null, history: [] });
  const run = deployRun(world);
  const replay = useReplay(run);
  const now: Record<string, string | null> = Object.fromEntries(list.map((e) => [e.name, e.sha]));
  const seen = useRef<{ shas: Record<string, string | null>; key: string | null; before: Record<string, string | null> } | null>(null);
  const c = seen.current;
  const before = replay ? (c && c.key === replay.key ? c.before : (c?.shas ?? now)) : now;
  useEffect(() => {
    seen.current = { shas: now, key: replay?.key ?? null, before };
  });

  const tints = [TINTS.sky, TINTS.sun, TINTS.coral, TINTS.lilac];
  const colW = box.w / Math.max(list.length, 1);
  const crashes = (sha: string | null) => Boolean(sha) && commitOf(world, sha!).bugs.includes("crash");

  return (
    <g className="ci">
      {list.map((e, i) => {
        const cx = box.x + colW * (i + 0.5);
        const by = box.y + box.h - 34;
        // What this environment ran during the replay: the version before, then each delivery in order.
        const frames: Frame[] = [{ sha: before[e.name] ?? null, at: 0 }];
        if (replay && run) {
          for (const j of run.jobs) {
            if (!replay.fresh(j)) continue;
            const times = stepTimes(j);
            j.steps.forEach((st, k) => {
              // The parcel leaves when the step finishes and the flag changes when it lands.
              if (st.delivered?.env === e.name) frames.push({ sha: st.delivered.sha, at: replay.ms(times[k]!.end) + DROP_MS, back: st.kind === "rollback" });
            });
          }
          frames.sort((a, b) => a.at - b.at);
        }
        // Only play it when the deliveries really end where the environment is now.
        const animated = Boolean(replay) && frames.length > 1 && frames[frames.length - 1]!.sha === e.sha;
        const shown = animated ? frames : [{ sha: e.sha, at: 0 }];
        const waiting = run?.jobs.some((j) => j.status === "waiting" && j.environment === e.name);
        return (
          <g key={e.name} className={lit === e.name ? "is-lit" : undefined}>
            {shown.map((f, k) => {
              const until = shown[k + 1]?.at;
              const body = (
                <>
                  <g transform={`translate(${cx} ${by})`}>
                    <Building s={20} roof={tints[i % tints.length]!} status={crashes(f.sha) ? "down" : "ok"} />
                  </g>
                  <g transform={`translate(${cx + 34} ${by - 34})`}>
                    <Flag tint={f.sha ? TINTS.mint : TINTS.grey} label={f.sha ? f.sha.slice(0, 4) : "—"} height={40} muted={!f.sha} />
                  </g>
                  <text x={cx} y={box.y + box.h + 12} textAnchor="middle" className="sub" style={{ fontSize: 10.5 }}>
                    {f.sha ? `${f.sha}${crashes(f.sha) ? " · 500" : ""}` : tr ? "boş" : "empty"}
                  </text>
                </>
              );
              if (!animated) return <motion.g key={`${f.sha}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>{body}</motion.g>;
              // Each version is on screen from its arrival until the next one replaces it.
              const fade = 150;
              let anim: { initial: { opacity: number }; animate: { opacity: number | number[] }; transition: object };
              if (until === undefined) anim = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: f.at / 1000, duration: 0.3 } };
              else {
                // The next version fades in over [until, until + fade] while this one fades out: a crossfade.
                const end = Math.max(until, f.at + fade) + fade;
                const at = (ms: number) => Math.min(1, Math.max(0, ms / end));
                anim =
                  k === 0
                    ? { initial: { opacity: 1 }, animate: { opacity: [1, 1, 0] }, transition: { duration: end / 1000, times: [0, at(end - fade), 1] } }
                    : { initial: { opacity: 0 }, animate: { opacity: [0, 0, 1, 1, 0] }, transition: { duration: end / 1000, times: [0, at(f.at), at(f.at + fade), at(end - fade), 1] } };
              }
              return (
                <motion.g key={`${replay!.key}-${k}`} {...anim}>
                  {body}
                </motion.g>
              );
            })}
            {animated &&
              shown.slice(1).map((f, k) => (
                // The delivery itself: a parcel drops into the building.
                <motion.g key={`${replay!.key}-p${k}`} initial={{ x: cx, y: by - 110 }} animate={{ x: cx, y: by - 26 }} transition={{ delay: (f.at - DROP_MS) / 1000, duration: DROP_MS / 1000 }}>
                  <motion.g {...visibleBetween(f.at - DROP_MS, f.at + 60)}>
                  <Parcel s={12} size={0.8} kind={f.back ? "neutral" : "order"} />
                  </motion.g>
                </motion.g>
              ))}
            {waiting && (
              <g>
                {/* The gate: a reviewer has to approve before the deploy job may enter. */}
                <line x1={cx - 52} x2={cx - 52} y1={by - 30} y2={by + 4} className="edge" />
                <rect x={cx - 64} y={by - 22} width={26} height={7} rx={2} className="sticker" style={{ fill: "var(--sun)", strokeWidth: 1.3 }} />
                <g transform={`translate(${cx - 76} ${by - 2})`}>
                  <Parcel s={10} size={0.8} kind="neutral" />
                </g>
              </g>
            )}
            <text x={cx} y={box.y + box.h - 4} textAnchor="middle" className="env-name">
              {e.name}
              {e.approval ? (tr ? " · onaylı" : " · approval") : ""}
            </text>
          </g>
        );
      })}
    </g>
  );
}
