import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { Parcel } from "@lets-explain/core/iso/shapes";
import { fmt, type JobRun, type Run, type StepRun } from "../engine/ci";
import { Barrier, BELT, Crate, crateW, INK, Lever, METAL, OBox, PLATE, Rocket, Safe, THIN } from "./factory";
import { cut, STATUS_FILL, STATUS_SOFT, StatusDot, Sticker, type Box } from "./parts";
import { appearAt, stepTimes, useReplay, visibleBetween, type Replay } from "./replay";
import { benchOf, EVENT_TEXT, FLIGHT_MS, levels, pickSteps, secretOf, statusText } from "./runner";

/**
 * A workflow run drawn as an assembly line, the look of every CI/CD lesson. The run's sign
 * hangs at the top with the commit that started it (and the run's artifact store, when jobs
 * hand files on). Every job is a station on its own base plate: on the left the runner, a
 * machine that is switched on when the job starts and thrown away when it ends; to its right a
 * conveyor through one check gate per step, each with a lamp and, once the step ended, how long
 * it took. The job's work is a parcel that waits under the gate whose step is running and only
 * moves on when that step has passed; a failing step keeps the parcel there and the gates after
 * it stay dark. A job that `needs` others has a barrier at its entrance: cables run to it from
 * the jobs it waits for, light up when each of them passes, and the barrier rises only when the
 * job really starts. A job that waits for a reviewer stands behind the same barrier with an
 * amber lamp until it is approved. A job whose `if` was false has its lever switched off. A deploy
 * step stands at the end of its line as a rocket that lifts off only when that step succeeded.
 * Under a station, when there is room, the runner's disk: what each step left there, wiped when
 * the runner is thrown away. Matrix legs are identical stations side by side, each labelled with
 * its Node version; a cancelled job's runner is switched off where it was cut. Everything is
 * read from the run and played back on one clock (`useReplay`, `stepTimes`).
 */

/* ------------------------------------------------------------- geometry */

/** Gate pitch, the runner block in front of the belt, and the space after the last gate. */
const G = 64;
const MACH = 84;
const END = 34;
const PAD = 54;
/** A station's nominal height, and how far its base plate sticks out to the right (depth). */
const H0 = 140;
/** Room above the lamps for the step durations. */
const TOP = 18;
const PLATE_D = 24;
/** The base plate: its top edge and the height of its front, where the labels are. */
const PY = 88;
const PH = 34;
/** Space between columns: the barrier and the cables live here. */
const GAP = 66;
const HEAD_H = 40;
/** The runner's disk under a station. */
const BENCH = 44;

/** Short name for a gate's plate; the full one is in its tooltip. */
const SHORT: Partial<Record<StepRun["kind"], string>> = {
  smoke: "curl /health",
  rollback: "--previous",
  summary: "summary",
  output: "output",
  "print-secret": "echo token",
  typecheck: "tsc",
};
const shortName = (s: StepRun) => {
  if (SHORT[s.kind] && s.name.startsWith("Run ")) return SHORT[s.kind]!;
  const n = s.name
    .replace(/^Run /, "")
    .replace(/^[\w.-]+\/([\w.-]+)@\S+/, "$1")
    .replace(/^\.\/([\w.-]+\.sh)\b.*$/, "$1")
    .replace(/\s*\(.*\)$/, "");
  return n.length > 10 ? n.replace(/^npm run /, "") : n;
};

/** Plays children from screen time `at`, or draws them as they ended. */
function At({ play, at, k, children, dur }: { play: Replay | null; at: number; k: string; children: ReactNode; dur?: number }) {
  if (!play) return <g>{children}</g>;
  return (
    <motion.g key={`${play.key}-${k}`} {...appearAt(at, dur ?? 0.2)}>
      {children}
    </motion.g>
  );
}

/** Visible only until screen time `until` (a replay's "before" state); nothing when drawn as ended. */
function Until({ play, until, k, children }: { play: Replay | null; until: number; k: string; children: ReactNode }) {
  if (!play) return null;
  return (
    <motion.g key={`${play.key}-${k}`} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: until / 1000, duration: 0.15 }}>
      {children}
    </motion.g>
  );
}

/* ------------------------------------------------------------ station */

interface Slot {
  /** Step index in the job, or -1 for the "+n more" gate. */
  i: number;
  s?: StepRun;
}

interface Layout {
  job: JobRun;
  slots: Slot[];
  hidden: number;
  hiddenPassed: boolean;
  rocket: boolean;
  W: number;
}

const gateX = (n: number) => MACH + 10 + n * G;

function layoutOf(job: JobRun, maxGates: number): Layout {
  const rocket = job.steps.some((s) => s.kind === "deploy");
  let slots: Slot[];
  let hidden = 0;
  let hiddenPassed = true;
  if (job.steps.length <= maxGates) slots = job.steps.map((s, i) => ({ i, s }));
  else {
    const p = pickSteps(job, Math.max(2, maxGates));
    hidden = p.hidden;
    hiddenPassed = p.hiddenPassed;
    slots = [{ i: -1 }, ...p.shown.map(({ s, i }) => ({ i, s }))];
  }
  const n = job.steps.length ? slots.length : 2;
  return { job, slots, hidden, hiddenPassed, rocket, W: gateX(n) + (rocket ? PAD : END) };
}

/** Which gate a step waits under: its own, or the "+n" gate when it is folded away. */
function slotOf(l: Layout, step: number) {
  const k = l.slots.findIndex((x) => x.i === step);
  return k >= 0 ? k : 0;
}

const STATE_TEXT = {
  off: ["açılmadı", "not started"],
  on: ["çalışıyor", "running"],
  gone: ["silindi", "discarded"],
} as const;

const CANCEL_TEXT: Record<string, [string, string]> = {
  "fail-fast": ["fail-fast", "fail-fast"],
  concurrency: ["yeni run", "newer run"],
  timeout: ["zaman aşımı", "timed out"],
};

/** What stands at a station's entrance. */
interface Entrance {
  needs: boolean;
  /** The job's environment asks for a reviewer: it waits, or was approved. */
  approval: boolean;
  /** Skipped by its own `if`. */
  lever: boolean;
}

function Station({ l, play, tr, k, entrance, bench, shelf, run }: { l: Layout; play: Replay | null; tr: boolean; k: number; entrance: Entrance; bench: boolean; shelf?: boolean; run: Run }) {
  const { job, slots, W } = l;
  const times = stepTimes(job);
  const ran = job.status === "success" || job.status === "failure" || job.status === "cancelled";
  const msStart = play ? play.ms(job.start) : 0;
  const msEnd = play ? play.ms(job.end) : 0;
  const empty = job.steps.length === 0;
  const beltEnd = W - 6;
  const cx = (n: number) => gateX(n) + G / 2 - 6;
  const restX = gateX(empty ? 2 : slots.length) + (l.rocket ? PAD : END) / 2 - 4;
  // Where a passed job's parcel ends up: on the tray at the end, or under the last gate when a rocket stands there.
  const doneX = l.rocket ? cx(Math.max(0, slots.length - 1)) : restX;

  /* Where the parcel is: under each gate while its step runs, then on to the next. */
  const failedAt = job.steps.findIndex((s) => s.status === "failure" && !s.allowed);
  const lastRan = (() => {
    let n = -1;
    job.steps.forEach((s, i) => {
      if (s.status !== "skipped" && s.status !== "cancelled") n = i;
      else if (s.status === "cancelled" && n < i) n = i;
    });
    return n;
  })();
  const finalX = job.status === "success" ? doneX : lastRan >= 0 ? cx(slotOf(l, failedAt >= 0 ? failedAt : lastRan)) : cx(0);
  const keys: { t: number; x: number }[] = [];
  if (play && ran && !empty) {
    keys.push({ t: msStart, x: cx(slotOf(l, 0)) });
    for (let i = 0; i < job.steps.length; i++) {
      const s = job.steps[i]!;
      if (s.status === "skipped") break;
      const e = play.ms(times[i]!.end);
      keys.push({ t: e, x: cx(slotOf(l, i)) });
      if (s.status === "cancelled" || (s.status === "failure" && !s.allowed)) break;
      const next = i + 1 < job.steps.length ? cx(slotOf(l, i + 1)) : job.status === "success" ? doneX : cx(slotOf(l, i));
      keys.push({ t: e + 160, x: next });
    }
    for (let i = 1; i < keys.length; i++) if (keys[i]!.t <= keys[i - 1]!.t) keys[i]!.t = keys[i - 1]!.t + 1;
  }
  const kind = job.status === "success" ? "order" : job.status === "failure" ? "cancel" : "neutral";

  const parcel = (p: "neutral" | "order" | "cancel") => (
    <g transform="translate(0 64)">
      <Parcel s={11} size={0.95} kind={p} />
    </g>
  );

  const deploy = job.steps.findIndex((s) => s.kind === "deploy");
  const launched = deploy >= 0 && job.steps[deploy]!.status === "success";
  const env = deploy >= 0 ? (job.steps[deploy]!.delivered?.env ?? job.environment) : undefined;
  const secret = secretOf(job, run);

  const stateText = (key: keyof typeof STATE_TEXT) => STATE_TEXT[key][tr ? 0 : 1];
  const note =
    job.status === "skipped"
      ? job.reason === "needs"
        ? tr ? ["atlandı:", "needs'teki job geçmedi"] : ["skipped:", "a job in needs failed"]
        : tr ? ["atlandı:", "if koşulu tutmadı"] : ["skipped:", "its if was false"]
      : job.status === "waiting"
        ? tr ? ["onay bekliyor:", job.environment ?? ""] : ["waiting for approval:", job.environment ?? ""]
        : job.status === "queued"
          ? [tr ? "sırada" : "queued", ""]
          : job.status === "cancelled" && empty
            ? [tr ? "iptal edildi:" : "cancelled:", CANCEL_TEXT[job.reason ?? ""]?.[tr ? 0 : 1] ?? ""]
            : null;

  // A skipped or cancelled-before-start job's machines fade once that is decided; its labels stay readable.
  const faded = job.status === "skipped" || (job.status === "cancelled" && empty);
  const Hw = play && faded ? motion.g : "g";
  const hwProps = faded ? (play ? { initial: { opacity: 1 }, animate: { opacity: 0.5 }, transition: { delay: msEnd / 1000, duration: 0.3 } } : { opacity: 0.5 }) : {};

  /* Labels: as large as the layout allows on screen; when names do not fit side by side, every
     other one goes on a second line. */
  const labels = slots.map((slot) => (slot.s ? shortName(slot.s) : `+${l.hidden}`));
  let fs = Math.min(17, Math.max(11.5, 11.5 / k));
  // The last gate of a deploy station may use the launch pad's width too (its environment is
  // written on the second line, under the rocket).
  const last = slots.length - 1;
  const avail = (n: number) => (n === last ? G - 6 + (l.rocket ? PAD - 12 : END - 10) : G - 6);
  const fitsAll = (size: number) => labels.every((x, n) => Math.max(4, x.length) * size * 0.6 <= avail(n));
  const stagger = slots.length > 1 && !fitsAll(fs);
  if (stagger) fs = Math.min(fs, 15);
  else while (fs > 11.5 && !fitsAll(fs)) fs -= 0.5;
  const extra = (n: number) => (n === last ? (l.rocket ? PAD - 12 : END - 10) : 0);
  // The first label must not reach the runner's own label on its left.
  const widthOf = (n: number) => Math.min(stagger ? 2 * G - 14 : G - 6, n === 0 ? 2 * (G / 2 + 4) + 8 : Infinity) + extra(n);
  const roomOf = (n: number) => Math.floor(widthOf(n) / (fs * 0.6));
  // Long names on a crowded plate: a little smaller before anything is cut.
  while (stagger && fs > 12 && labels.some((x, n) => x.length > roomOf(n))) fs -= 0.5;
  const fd = Math.min(15, Math.max(11, 10.5 / k));
  // Staggered labels alternate from the last one, which always sits on the first line.
  const lineY = (n: number) => (stagger ? ((last - n) % 2 ? PY + 30 : PY + 14.5) : l.rocket ? PY + 14.5 : PY + PH / 2 + fs * 0.36);

  const screenLabel = job.node !== undefined ? job.id : job.label;
  const screen = Math.max(10, Math.min(16, Math.max(12, 11 / k), 58 / (Math.max(4, screenLabel.length) * 0.6)));
  const roofTag = job.node !== undefined ? `node ${job.node}` : null;

  return (
    <g>
      {/* The base plate; its top takes the job's colour once the job has ended. */}
      <OBox x={0} y={PY} w={W} h={PH} d={PLATE_D} {...PLATE} />
      <At play={play} at={msEnd} k="plate">
        <polygon points={`1,${PY - 1} ${W - 1},${PY - 1} ${W + PLATE_D - 2},${PY - PLATE_D / 2 + 1} ${PLATE_D + 2},${PY - PLATE_D / 2 + 1}`} style={{ fill: STATUS_SOFT[job.status] }} />
      </At>

      <Hw key={play ? `${play.key}-hw` : "hw"} {...hwProps}>
        {/* The runner: a machine of its own for this one job. */}
        <OBox x={4} y={26} w={74} h={60} d={16} {...METAL} />
        {roofTag ? (
          <g>
            <rect x={8} y={3} width={62} height={17} rx={4} style={{ fill: "var(--mint)", ...THIN }} />
            <text x={39} y={15.5} textAnchor="middle" className="mono" style={{ fontSize: 11.5 }}>
              {roofTag}
            </text>
          </g>
        ) : (
          [0, 1, 2].map((v) => <line key={v} x1={22 + v * 12} y1={22} x2={30 + v * 12} y2={18} style={{ stroke: "#8f86a0", strokeWidth: 1.6, strokeLinecap: "round" }} />)
        )}
        {secret && (
          <g>
            <Safe x={roofTag ? 74 : 56} y={2} empty={secret === "empty"} />
            <text x={roofTag ? 85 : 67} y={-8} textAnchor="middle" className="mono" style={{ fontSize: 10.5, fill: secret === "empty" ? "var(--red)" : undefined }}>
              {secret === "masked" ? "***" : tr ? "boş" : "empty"}
            </text>
          </g>
        )}
        <rect x={10} y={32} width={62} height={22} rx={4} style={{ fill: "#2b2a33", ...THIN }} />
        <text x={41} y={43 + screen * 0.36} textAnchor="middle" className="mono-light" style={{ fontSize: screen }}>
          {cut(screenLabel, Math.floor(60 / (screen * 0.6)))}
        </text>
        <StatusDot status={play ? "queued" : job.status} x={19} y={70} r={7.5} />
        {play && (
          <>
            <motion.circle key={`${play.key}-jr`} cx={19} cy={70} r={11} style={{ fill: "none", stroke: "var(--sun)", strokeWidth: 3 }} {...visibleBetween(msStart, msEnd)} />
            <motion.g key={`${play.key}-jd`} {...appearAt(msEnd)}>
              <StatusDot status={job.status} x={19} y={70} r={7.5} />
            </motion.g>
          </>
        )}
        <At play={play} at={msEnd} k="dur">
          <text x={30} y={74.5} className="sub" style={{ fontSize: Math.min(13, Math.max(11.5, 10 / k)) }}>
            {ran ? fmt(job.end - job.start) : ""}
          </text>
        </At>
        {[0, 1, 2].map((v) => (
          <line key={`v${v}`} x1={82} x2={90} y1={40 + v * 7} y2={36 + v * 7} style={{ stroke: "#8f86a0", strokeWidth: 1.6, strokeLinecap: "round" }} />
        ))}
        {/* Power light: on only while the job runs on it. */}
        <circle cx={71} cy={80} r={2.6} style={{ fill: "#b9b2c2", ...THIN }} />
        {play && ran && <motion.circle key={`${play.key}-led`} cx={71} cy={80} r={2.6} style={{ fill: "#3fd07f", ...THIN }} {...visibleBetween(msStart, msEnd)} />}

        {/* Back posts of the gates, behind the belt. */}
        {!empty && slots.map((_, n) => <rect key={`bp${n}`} x={gateX(n) + 30} y={13} width={7} height={53} style={{ fill: "#fffdf8", ...INK }} />)}

        {/* The conveyor. */}
        <OBox x={MACH - 4} y={70} w={beltEnd - MACH + 4} h={10} d={24} {...BELT} />
        {Array.from({ length: Math.floor((beltEnd - MACH) / 10) }, (_, v) => {
          const x = MACH + 2 + v * 10;
          return <line key={`sl${v}`} x1={x} y1={70} x2={x + 24} y2={58} style={{ stroke: "#6d6976", strokeWidth: 1 }} />;
        })}
        {Array.from({ length: Math.floor((beltEnd - MACH) / 16) }, (_, v) => (
          <circle key={`ro${v}`} cx={MACH + 6 + v * 16} cy={75} r={2.4} style={{ fill: "#8b8694", stroke: "#2b2a33", strokeWidth: 1 }} />
        ))}

        {/* The end of the line: a tray for a finished job, or a launch pad for a deploy. */}
        {l.rocket ? <OBox x={restX - 20} y={66} w={42} h={6} d={18} front="#45424d" top="#6d6976" side="#36343d" /> : <OBox x={restX - 13} y={67} w={28} h={4} d={14} {...PLATE} top="#fffdf8" thin />}

        {/* The job's work moving along. */}
        {!empty &&
          ran &&
          (play ? (
            <motion.g key={`${play.key}-parcel`} initial={{ x: keys[0]?.x ?? finalX, opacity: 0 }} animate={{ x: keys.length > 1 ? keys.map((p) => p.x) : finalX, opacity: 1 }} transition={{ x: keys.length > 1 ? { delay: keys[0]!.t / 1000, duration: (keys[keys.length - 1]!.t - keys[0]!.t) / 1000, times: keys.map((p) => (p.t - keys[0]!.t) / Math.max(1, keys[keys.length - 1]!.t - keys[0]!.t)), ease: "linear" } : { duration: 0 }, opacity: { delay: msStart / 1000, duration: 0.15 } }}>
              <Until play={play} until={msEnd} k="pn">
                {parcel("neutral")}
              </Until>
              <At play={play} at={msEnd} k="pf" dur={0.1}>
                {parcel(kind)}
              </At>
            </motion.g>
          ) : (
            <g transform={`translate(${finalX} 0)`}>{parcel(kind)}</g>
          ))}
        {!empty && ran && l.rocket && (
          // A deploy job's work is the rocket itself; it waits on the pad.
          <Rocket x={restX + 1} play={play} at={play && deploy >= 0 ? play.ms(times[deploy]!.end) : 0} launched={launched} />
        )}
        {!ran && l.rocket && <Rocket x={restX + 1} play={null} at={0} launched={false} dim />}

        {/* Front posts, crossbars, lamps, and how long each step took. */}
        {!empty &&
          slots.map((slot, n) => {
            const x = gateX(n);
            const s = slot.s;
            const status = s ? s.status : l.hiddenPassed ? "success" : "queued";
            const lx = x + 18;
            const ends = play && s ? play.ms(times[slot.i]!.end) : play ? msEnd : 0;
            const ranHere = s && s.seconds > 0 && s.status !== "skipped";
            const bad = s && s.status === "failure" && !s.allowed;
            const sub = s ? (s.status === "skipped" ? "—" : s.allowed ? "⚠" : s.status === "cancelled" && s.seconds === 0 ? "" : fmt(s.seconds)) : l.hiddenPassed ? (tr ? "geçti" : "passed") : "";
            return (
              <g key={`g${n}`}>
                {s && <title>{s.name}</title>}
                <rect x={x} y={28} width={7} height={60} style={{ fill: "#fffdf8", ...INK }} />
                <polygon points={`${x - 1},${28} ${x + 38},${8.5} ${x + 38},${15.5} ${x - 1},${35}`} style={{ fill: "#57535f", ...INK }} />
                {bad && (
                  <At play={play} at={ends} k={`bb${n}`}>
                    <polygon points={`${x - 1},${28} ${x + 38},${8.5} ${x + 38},${15.5} ${x - 1},${35}`} style={{ fill: "var(--red)", ...INK }} />
                  </At>
                )}
                <line x1={lx} x2={lx} y1={19} y2={12} style={{ stroke: "var(--ink)", strokeWidth: 2 }} />
                {play && s ? (
                  <>
                    <StatusDot status="queued" x={lx} y={7} r={6.5} />
                    {ranHere && <motion.circle key={`${play.key}-sr`} cx={lx} cy={7} r={9.5} style={{ fill: "none", stroke: "var(--sun)", strokeWidth: 2.5 }} {...visibleBetween(play.ms(times[slot.i]!.start), ends)} />}
                    <motion.g key={`${play.key}-sd`} {...appearAt(ends, 0.15)}>
                      <StatusDot status={status} x={lx} y={7} r={6.5} />
                    </motion.g>
                  </>
                ) : (
                  <StatusDot status={play ? "queued" : status} x={lx} y={7} r={6.5} />
                )}
                {!s && play && (
                  <At play={play} at={msEnd} k={`hs${n}`}>
                    <StatusDot status={status} x={lx} y={7} r={6.5} />
                  </At>
                )}
                {sub && (
                  <At play={play} at={ends} k={`d${n}`}>
                    <text x={lx} y={-5} textAnchor="middle" className="sub" style={{ fontSize: fd, fill: bad ? "var(--red)" : undefined }}>
                      {sub}
                    </text>
                  </At>
                )}
              </g>
            );
          })}
      </Hw>
      <EntranceGear job={job} run={run} play={play} entrance={entrance} tr={tr} />
      {shelf && <Shelf job={job} play={play} tr={tr} x0={MACH + 2} x1={W - 4} />}

      {/* The plate's front: what each gate checks. */}
      {!empty &&
        slots.map((slot, n) => {
          const s = slot.s;
          const label0 = cut(labels[n]!, roomOf(n));
          // A label longer than its gate's share leans right, onto the launch pad.
          const x = gateX(n) + G / 2 - 6 + Math.max(0, Math.min(extra(n), label0.length * fs * 0.6 - (widthOf(n) - extra(n)))) / 2;
          const bad = s && s.status === "failure" && !s.allowed;
          const gray = s && (s.status === "skipped" || s.status === "cancelled");
          const label = label0;
          const y = lineY(n);
          const ends = play && s ? play.ms(times[slot.i]!.end) : 0;
          return (
            <g key={`p${n}`}>
              {stagger && (last - n) % 2 === 1 && <line x1={x} x2={x} y1={PY + 3} y2={PY + 18} style={{ stroke: "#c9bca4", strokeWidth: 1.2 }} />}
              <text x={x} y={y} textAnchor="middle" className="mono" style={{ fontSize: fs }}>
                {label}
              </text>
              {/* A failed or skipped step is only marked once that is known. */}
              {(bad || gray) && (
                <At play={play} at={ends} k={`bad${n}`}>
                  <rect x={x - Math.min(label.length * fs * 0.3 + 5, stagger ? G - 2 : G / 2 - 2)} y={y - fs * 0.95} width={Math.min(label.length * fs * 0.6 + 10, stagger ? 2 * G - 4 : G - 4)} height={fs * 1.3} rx={4} style={{ fill: bad ? "var(--red-soft)" : "#efe5d2" }} />
                  <text x={x} y={y} textAnchor="middle" className="mono" style={{ fontSize: fs, fill: bad ? "var(--red)" : "var(--ink-3)" }}>
                    {label}
                  </text>
                </At>
              )}
            </g>
          );
        })}
      {empty && note && (
        <g>
          {play && (job.status === "skipped" || job.status === "cancelled") ? (
            <>
              <Until play={play} until={msEnd} k="q">
                <text x={(MACH + beltEnd) / 2} y={PY + 21} textAnchor="middle" className="muted" style={{ fontSize: Math.min(14, fs) }}>
                  {tr ? "sırada" : "queued"}
                </text>
              </Until>
              <At play={play} at={msEnd} k="n">
                <NoteLines note={note} x={(MACH + beltEnd) / 2} size={Math.min(14, fs)} w={beltEnd - MACH} />
              </At>
            </>
          ) : (
            <NoteLines note={note} x={(MACH + beltEnd) / 2} size={Math.min(14, fs)} w={beltEnd - MACH} />
          )}
        </g>
      )}

      {/* Under the runner: whether it was ever started, and that it is gone once the job ends. */}
      <text x={42} y={PY + 15} textAnchor="middle" className="mono" style={{ fontSize: Math.min(14, fs) }}>
        runner
      </text>
      {bench ? null : play && ran ? (
        <>
          <motion.text key={`${play.key}-on`} x={42} y={PY + 29} textAnchor="middle" className="sub" style={{ fontSize: Math.min(13, fs - 1) }} {...visibleBetween(msStart, msEnd)}>
            {stateText("on")}
          </motion.text>
          <motion.text key={`${play.key}-gone`} x={42} y={PY + 29} textAnchor="middle" className="sub" style={{ fontSize: Math.min(13, fs - 1), fill: job.status === "cancelled" ? "var(--coral-deep)" : "var(--ink-3)" }} {...appearAt(msEnd + 250)}>
            {job.status === "cancelled" ? cut(CANCEL_TEXT[job.reason ?? ""]?.[tr ? 0 : 1] ?? statusText("cancelled", tr), 12) : stateText("gone")}
          </motion.text>
        </>
      ) : (
        job.status !== "waiting" && (
          <At play={play} at={msEnd} k="rs">
            <text x={42} y={PY + 29} textAnchor="middle" className="sub" style={{ fontSize: Math.min(13, fs - 1), fill: job.status === "cancelled" ? "var(--coral-deep)" : "var(--ink-3)" }}>
              {job.status === "cancelled" ? cut(CANCEL_TEXT[job.reason ?? ""]?.[tr ? 0 : 1] ?? statusText("cancelled", tr), 12) : stateText(ran ? "gone" : "off")}
            </text>
          </At>
        )
      )}

      {l.rocket && env && (
        <text x={restX + 1} y={PY + 30} textAnchor="middle" className="sub" style={{ fontSize: Math.min(13, fs - 1) }}>
          {cut(`→ ${env}`, 13)}
        </text>
      )}
    </g>
  );
}

/** Shelf height above the station, in station units. */
const SHELF_H = 84;

/**
 * The runner's disk as a shelf over the line, when there is room for it: every step leaves its
 * real product there (code, Node, node_modules, dist/) and the next steps use it; when the job
 * ends the runner is thrown away and the shelf is wiped.
 */
function Shelf({ job, play, tr, x0, x1 }: { job: JobRun; play: Replay | null; tr: boolean; x0: number; x1: number }) {
  const { items } = benchOf(job, tr);
  const ran = job.status === "success" || job.status === "failure" || job.status === "cancelled";
  const wipeAt = play ? play.ms(job.end) + 250 : 0;
  const by = -36;
  let cx = x0 + 14;
  const placed = items.map((it) => {
    const w = crateW(it.label, 11.5);
    const at = cx;
    cx += w + 20;
    return { it, x: at, w };
  });
  const shift = Math.max(0, cx - x1);
  return (
    <g>
      {/* Brackets from the machine and from the far end of the line. */}
      <rect x={x0 - 4} y={by - 2} width={6} height={58} style={{ fill: METAL.front, ...INK }} />
      <rect x={x1 - 12} y={by - 2} width={6} height={60} style={{ fill: METAL.front, ...INK }} />
      <OBox x={x0 - 6} y={by} w={x1 - x0} h={7} d={20} front={METAL.side} top={METAL.top} side="#8f86a0" />
      <text x={x0} y={by - 50} className="mono" style={{ fontSize: 12 }}>
        {tr ? "runner'ın diski" : "the runner's disk"}
      </text>
      {ran && (
        <At play={play} at={wipeAt} k="wiped">
          <text x={x0 + (tr ? 128 : 140)} y={by - 50} className="sub" style={{ fontSize: 11, fill: "var(--ink-3)" }}>
            · {tr ? "runner silindi, disk de gitti" : "runner discarded, disk gone"}
          </text>
        </At>
      )}
      {placed.map(({ it, x }, i) => {
        const crate = (ghost: boolean) => (
          <g transform={`translate(${x - shift} ${by - 14})`}>
            <Crate label={it.label} tone={it.tone} ghost={ghost} size={11.5} />
          </g>
        );
        if (!play) return <g key={i}>{crate(ran)}</g>;
        const at = play.ms(it.at);
        return (
          <motion.g key={`${play.key}-sh${i}`} initial={{ y: it.from === "cache" ? -40 : -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: at / 1000, duration: 0.3 }}>
            {ran ? (
              <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0.3 }} transition={{ delay: wipeAt / 1000, duration: 0.3 }}>
                {crate(false)}
              </motion.g>
            ) : (
              crate(false)
            )}
          </motion.g>
        );
      })}
    </g>
  );
}

function NoteLines({ note, x, size, w }: { note: string[]; x: number; size: number; w: number }) {
  return (
    <>
      <text x={x} y={note[1] ? PY + 15 : PY + 21} textAnchor="middle" className="muted" style={{ fontSize: size }}>
        {note[0]}
      </text>
      {note[1] && (
        <text x={x} y={PY + 30} textAnchor="middle" className="muted" style={{ fontSize: size }}>
          {cut(note[1], Math.floor(w / (size * 0.52)))}
        </text>
      )}
    </>
  );
}

/**
 * The entrance of a station. With `needs` or a reviewer to wait for, a barrier that rises when
 * the job starts and stays down while it waits or when it is skipped. A job skipped by its own
 * `if` shows its lever switched off instead (the jobs it needs did pass).
 */
function EntranceGear({ job, run, play, entrance, tr }: { job: JobRun; run: Run; play: Replay | null; entrance: Entrance; tr: boolean }) {
  if (entrance.lever) {
    return (
      <g>
        <Lever x={-36} y={70} on={false} />
        <text x={-22} y={PY + 21} textAnchor="middle" className="mono" style={{ fontSize: 12 }}>
          if
        </text>
      </g>
    );
  }
  if (!entrance.needs && !entrance.approval) return null;
  const opens = job.status === "success" || job.status === "failure" || job.status === "cancelled";
  const at = play ? play.ms(job.start) : 0;
  const decided = play ? play.ms(job.end) : 0;
  const lamp = opens ? "success" : job.status === "skipped" ? "failure" : job.status === "waiting" ? "waiting" : "queued";
  const waits = job.status === "waiting";
  void run;
  return (
    <g>
      <Barrier x={-27} y={88} open={opens} at={opens ? at : decided} play={play} k="gate" lamp={lamp} />
      {entrance.approval && (
        // The reviewer's booth beside the barrier.
        <g>
          <OBox x={-58} y={58} w={16} h={28} d={8} front={waits ? "var(--sun)" : "var(--sun-soft)"} top="#fffdf8" side="#e8c25a" thin />
          <rect x={-55} y={63} width={10} height={8} style={{ fill: "#fffdf8", ...THIN }} />
        </g>
      )}
      <text x={-24} y={PY + 15} textAnchor="middle" className="mono" style={{ fontSize: 12 }}>
        {entrance.needs ? "needs" : tr ? "onay" : "approval"}
      </text>
      {entrance.needs && entrance.approval && (
        <text x={-24} y={PY + 29} textAnchor="middle" className="mono" style={{ fontSize: 12 }}>
          {tr ? "+ onay" : "+ approval"}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------ the disk */

/** The runner's disk under a station: what each step left there, and what left the runner. */
function Disk({ job, x, y, w, replay, tray, trayReady, tr }: { job: JobRun; x: number; y: number; w: number; replay: Replay | null; tray: { x: number; y: number } | null; trayReady: number; tr: boolean }) {
  const play = replay && replay.fresh(job) ? replay : null;
  const { items, outs } = benchOf(job, tr);
  const by = y + BENCH / 2 + 2;
  const pos: number[] = [];
  let cx = x + 14;
  for (const it of items) {
    pos.push(cx);
    cx += crateW(it.label) + 12;
  }
  const why = job.reason ? CANCEL_TEXT[job.reason]?.[tr ? 0 : 1] : undefined;
  const note = job.status === "waiting" ? null : job.status === "skipped" || job.status === "queued" || (job.status === "cancelled" && job.steps.length === 0) ? (tr ? "runner açılmadı" : "no runner started") : `${why ? `${why} · ` : ""}${tr ? "runner silindi" : "runner discarded"}`;
  const overflow = Math.max(0, cx - (x + w - 14));
  const shift = (i: number) => pos[i]! - overflow;
  const visible = (i: number) => shift(i) >= x + 8;
  const ran = job.status === "success" || job.status === "failure" || job.status === "cancelled";
  const wipeAt = play ? play.ms(job.end) + 250 : 0;

  return (
    <g>
      {/* A shallow tray: the runner's disk. */}
      <OBox x={x + 4} y={y + 8} w={w - 18} h={BENCH - 14} d={10} front={ran || items.length ? "#efe5d2" : "#f6f0e4"} top="#e3d7c0" side="#d3c4a8" thin />
      {(() => {
        // Its name, on a tag at the tray's top edge.
        const name = w > 250 ? (tr ? "runner'ın diski" : "the runner's disk") : "disk";
        const tw = name.length * 6 + 14;
        return (
          <g>
            <rect x={x + 10} y={y - 4} width={tw} height={15} rx={4} style={{ fill: "#e3d7c0", stroke: "var(--ink)", strokeWidth: 1.2 }} />
            <text x={x + 10 + tw / 2} y={y + 7} textAnchor="middle" className="sub" style={{ fontSize: 10.5 }}>
              {name}
            </text>
          </g>
        );
      })()}
      {items.map((it, i) => {
        if (!visible(i)) return null;
        const ix = shift(i);
        if (!play) {
          return (
            <g key={i} transform={`translate(${ix} ${by})`}>
              <Crate label={it.label} tone={it.tone} ghost={ran} />
            </g>
          );
        }
        // A download can only leave the store once the upload has landed there.
        const at = it.from === "artifact" ? Math.max(play.ms(it.at), trayReady) : play.ms(it.at);
        // Made here: pops up on the disk. From the cache: drops in from above. From the store: travels down from it.
        const start = it.from === "artifact" && tray ? { x: tray.x, y: tray.y } : it.from === "cache" ? { x: ix, y: by - 70 } : { x: ix, y: by - 10 };
        return (
          <motion.g key={`${play.key}-${i}`} initial={{ x: start.x, y: start.y }} animate={{ x: ix, y: by }} transition={{ delay: at / 1000, duration: FLIGHT_MS / 1000 }}>
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: at / 1000, duration: 0.15 }}>
              {ran ? (
                <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0.3 }} transition={{ delay: wipeAt / 1000, duration: 0.3 }}>
                  <Crate label={it.label} tone={it.tone} />
                </motion.g>
              ) : (
                <Crate label={it.label} tone={it.tone} />
              )}
            </motion.g>
          </motion.g>
        );
      })}
      {play &&
        outs.map((o, i) => {
          const sx = o.source >= 0 && visible(o.source) ? shift(o.source) : x + 14;
          const sy = o.source < 0 && o.to === "right" ? by - 70 : by;
          const target = o.to === "tray" && tray ? { x: tray.x, y: tray.y } : o.to === "up" ? { x: sx, y: by - 80 } : { x: x + w + 40, y: by };
          const at = play.ms(o.at);
          return (
            <motion.g key={`${play.key}-out-${i}`} initial={{ x: sx, y: sy }} animate={{ x: target.x, y: target.y }} transition={{ delay: at / 1000, duration: FLIGHT_MS / 1000 }}>
              <motion.g {...visibleBetween(at, at + FLIGHT_MS + 80)}>
                <Crate label={o.label} tone={o.tone} />
              </motion.g>
            </motion.g>
          );
        })}
      {note &&
        (() => {
          const tw = note.length * 6 + 14;
          const tag = (
            <g>
              <rect x={x + w - 16 - tw} y={y - 4} width={tw} height={15} rx={7.5} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 1.2 }} />
              <text x={x + w - 16 - tw / 2} y={y + 7} textAnchor="middle" className="muted" style={{ fontSize: 10.5, fill: why ? "var(--coral-deep)" : undefined }}>
                {note}
              </text>
            </g>
          );
          return play && ran ? (
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

/* --------------------------------------------------------------- stage */

/** An idle line: nothing has run on it. */
function IdleLine() {
  return (
    <g>
      <OBox x={0} y={PY} w={gateX(3) + END} h={PH} d={PLATE_D} {...PLATE} />
      <OBox x={4} y={26} w={74} h={60} d={16} {...METAL} />
      <rect x={10} y={32} width={62} height={22} rx={4} style={{ fill: "#2b2a33", ...THIN }} />
      <OBox x={MACH - 4} y={70} w={gateX(3) + END - 6 - MACH + 4} h={10} d={24} {...BELT} />
      {[0, 1, 2].map((n) => (
        <g key={n}>
          <rect x={gateX(n)} y={28} width={7} height={60} style={{ fill: "#fffdf8", ...INK }} />
          <polygon points={`${gateX(n) - 1},28 ${gateX(n) + 38},8.5 ${gateX(n) + 38},15.5 ${gateX(n) - 1},35`} style={{ fill: "#57535f", ...INK }} />
        </g>
      ))}
    </g>
  );
}

export function AssemblyStage({ run, box, empty, blocked, focus }: { run?: Run; box: Box; empty?: string; blocked?: boolean; focus?: string }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const replay = useReplay(run);

  if (!run) {
    // Nothing has run: an idle line, its runner switched off. When a push was turned away, its
    // commit stands in front of the closed entrance.
    const lineW = gateX(3) + END + PLATE_D;
    const k = Math.min(1.1, (box.w - (blocked ? 120 : 40)) / lineW, (box.h - HEAD_H - 40) / H0);
    const sx = Math.max(box.x + (box.w - k * lineW) / 2 + (blocked ? 40 : 0), box.x + (blocked ? 150 * k : 0));
    const sy = box.y + HEAD_H + Math.max(24, (box.h - HEAD_H - k * H0) / 2);
    return (
      <g className="ci">
        <Sticker x={box.x} y={box.y} w={box.w} h={HEAD_H} fill="var(--paper-2)">
          <text x={box.x + box.w / 2} y={box.y + 25} textAnchor="middle" className="muted">
            {cut(empty ?? (tr ? "Henüz çalışan bir workflow yok." : "No workflow has run yet."), Math.floor((box.w - 24) / 7))}
          </text>
        </Sticker>
        <g transform={`translate(${sx} ${sy}) scale(${k})`}>
          <g opacity={0.5}>
            <IdleLine />
          </g>
          {blocked && (
            <g>
              {/* The entrance: the commit came in, the barrier stayed down, nothing started. */}
              <OBox x={-118} y={70} w={92} h={10} d={24} {...BELT} />
              <Barrier x={-22} y={88} open={false} lamp="failure" label={tr ? "giriş" : "entrance"} />
              <motion.g initial={{ x: -150, opacity: 0 }} animate={{ x: -70, opacity: 1 }} transition={{ duration: 0.5 }}>
                <g transform="translate(0 64)">
                  <Parcel s={11} size={0.95} kind="neutral" />
                </g>
              </motion.g>
            </g>
          )}
        </g>
      </g>
    );
  }

  const allCols = levels(run);
  const top0 = box.y + HEAD_H + 18;
  const fullH = box.y + box.h - top0 - 4;
  const legsOf = (ids: string[]) => ids.flatMap((id) => run.jobs.filter((j) => j.id === id));
  const ROWGAP = 14;
  const SUBGAP = 26;
  const BANDGAP = 30;

  // The columns go left to right; a long chain of them that would make every station tiny is
  // folded into bands, one under the other (the cables carry on from the end of one band to the
  // start of the next). Within a column, jobs run side by side in time: when a column has more of
  // them than its height holds, they go into a grid, whichever lets the stations be biggest.
  const arrange = (R: number) => {
    const per = Math.ceil(allCols.length / R);
    const bands = Array.from({ length: R }, (_, b) => allCols.slice(b * per, (b + 1) * per)).filter((x) => x.length);
    const bandH = (fullH - BANDGAP * (bands.length - 1)) / bands.length;
    const colW = (box.w - GAP * (per - 1)) / Math.max(per, 1);
    const layouts = new Map<string, Layout>();
    const plans = bands.map((cols) => {
      // As tall as the most crowded column allows; every step gets its own gate unless that would
      // shrink the line below a readable size.
      const kH = Math.min(...cols.map((ids) => (bandH - ROWGAP * (legsOf(ids).length - 1)) / (legsOf(ids).length * H0)));
      const kTarget = Math.max(0.62, Math.min(1.3, kH));
      const maxGates = Math.max(2, Math.floor((colW / Math.min(kTarget, 0.8) - PLATE_D - MACH - 10 - END) / G));
      for (const ids of cols) for (const j of legsOf(ids)) layouts.set(j.key, layoutOf(j, maxGates));
      const grids = cols.map((ids) => {
        const legs = legsOf(ids);
        const widest = Math.max(...legs.map((j) => layouts.get(j.key)!.W + PLATE_D));
        let best = { c: 1, k: 0 };
        for (let c = 1; c <= legs.length; c++) {
          const rows = Math.ceil(legs.length / c);
          const kc = Math.min(1.3, (colW - SUBGAP * (c - 1)) / c / widest, (bandH - ROWGAP * (rows - 1)) / (rows * H0));
          if (kc > best.k + 0.02) best = { c, k: kc };
        }
        return best;
      });
      return { cols, grids };
    });
    const k = Math.max(0.5, Math.min(...plans.flatMap((p) => p.grids.map((g) => g.k))));
    // How much of the run it shows: big stations, and as many of the steps as possible.
    const total = Math.max(1, run.jobs.reduce((n, j) => n + j.steps.length, 0));
    const shown = [...layouts.values()].reduce((n, l) => n + l.slots.filter((x) => x.i >= 0).length, 0);
    const score = k * (0.4 + 0.6 * Math.min(1, shown / total));
    return { plans, bandH, colW, layouts, k, score };
  };
  let plan = arrange(1);
  for (let R = 2; R <= Math.min(3, allCols.length); R++) {
    const next = arrange(R);
    // Folding only pays when the stations stay readable.
    if (next.k >= 0.6 && next.score > plan.score * 1.08) plan = next;
  }
  const { k, bandH, colW } = plan;
  const banded = plan.plans.length > 1;

  // A lone job with plenty of room shows the runner's disk as a shelf over its line instead of a tray.
  const lone = run.jobs.length === 1 ? run.jobs[0]! : null;
  const shelfMode = Boolean(lone && benchOf(lone, tr).outs.length === 0 && fullH - k * (H0 + SHELF_H) > 90);
  const pos = new Map<string, { x: number; y: number; l: Layout; bench: boolean; job: JobRun; band: number; col: number }>();
  plan.plans.forEach(({ cols, grids }, band) => {
    const top = top0 + band * (bandH + BANDGAP);
    cols.forEach((ids, ci) => {
      const legs = legsOf(ids);
      const { c } = grids[ci]!;
      const rows = Math.ceil(legs.length / c);
      const bench = !shelfMode && k >= 0.72 && rows * (k * H0 + BENCH + 6) + ROWGAP * (rows - 1) <= bandH;
      const rowH = k * H0 + (bench ? BENCH + 6 : 0);
      const total = rows * rowH + ROWGAP * (rows - 1);
      const y0 = top + Math.max(0, (bandH - total) * (shelfMode ? 0.7 : !banded && allCols.length === 1 && legs.length === 1 ? 0.9 : 0.5));
      const subW = (colW - SUBGAP * (c - 1)) / c;
      const x0 = box.x + ci * (colW + GAP);
      legs.forEach((j, i) => {
        const l = plan.layouts.get(j.key)!;
        const w = k * (l.W + PLATE_D);
        const r = Math.floor(i / c);
        const sc = i % c;
        // A shorter last row is centred under the full ones.
        const inRow = Math.min(c, legs.length - r * c);
        const indent = ((c - inRow) * (subW + SUBGAP)) / 2;
        pos.set(j.key, { x: x0 + indent + sc * (subW + SUBGAP) + (subW - w) / 2, y: y0 + r * (rowH + ROWGAP), l, bench, job: j, band, col: ci });
      });
    });
  });
  const top = top0;

  // One station with room above it: show the trigger dropping the commit onto its runner.
  const only = pos.size === 1 ? [...pos.values()][0]! : null;
  const chute = only && !shelfMode && only.y - top > 70 ? { x: only.x + k * 41, y1: box.y + HEAD_H + 4, y2: only.y + k * (16 + TOP) } : null;

  const edges: { from: JobRun; to: JobRun }[] = [];
  for (const j of run.jobs) for (const n of j.needs) for (const d of run.jobs.filter((x) => x.id === n)) edges.push({ from: d, to: j });

  const dur = fmt(run.end - run.start);
  const narrow = box.w < 600;
  const ev = EVENT_TEXT[run.event]![tr ? 0 : 1];
  const steps = run.jobs.flatMap((j) => j.steps);
  const hasTray = steps.some((s) => s.kind === "upload" || s.kind === "download");
  const uploaded = run.jobs.flatMap((j) => j.steps.map((s, i) => ({ j, s, t: stepTimes(j)[i]!.end }))).find((x) => x.s.kind === "upload" && x.s.status === "success");
  const resultText = narrow ? `${statusText(run.status, tr)} · ${dur}` : `${statusText(run.status, tr)} · ${dur} · ${run.minutes} ${tr ? "dk" : "min"}`;
  // The artifact store sits just left of the result; on a narrow sign it drops its word.
  const storeW = narrow ? 60 : 122;
  const store = hasTray ? { x: box.x + box.w - 16 - Math.max(resultText.length, tr ? 17 : 15) * 7.1 - 18 - storeW + 4, y: box.y + HEAD_H / 2 } : null;
  const tray = store ? { x: store.x + (narrow ? 2 : 62), y: store.y } : null;
  const runDone = replay ? replay.ms(run.end) : 0;
  const trayReady = replay && uploaded && replay.fresh(uploaded.j) ? replay.ms(uploaded.t) + FLIGHT_MS : 0;
  const headD = `M${box.x + 1} ${box.y + HEAD_H - 1} V${box.y + 6} a5 5 0 0 1 5 -5 H${box.x + box.w - 6} a5 5 0 0 1 5 5 V${box.y + HEAD_H - 1} Z`;

  return (
    <g className="ci">
      {/* The run's sign: which commit came in, from what event, and how the run ended. */}
      <Sticker x={box.x} y={box.y} w={box.w} h={HEAD_H} head={STATUS_SOFT[replay ? "queued" : run.status]} headH={HEAD_H}>
        {replay && <motion.path key={`${replay.key}-head`} d={headD} style={{ fill: STATUS_SOFT[run.status] }} {...appearAt(runDone)} />}
        <motion.g key={replay?.arrival ? `${replay.key}-parcel` : "parcel"} initial={replay?.arrival ? { x: -40, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.4 }}>
          <g transform={`translate(${box.x + 26} ${box.y + 27})`}>
            <Parcel s={13} size={0.9} kind={run.status === "failure" ? "cancel" : run.status === "success" ? "order" : "neutral"} />
          </g>
        </motion.g>
        <StatusDot status={replay ? "queued" : run.status} x={box.x + 56} y={box.y + HEAD_H / 2} r={9} />
        {replay && (
          <motion.g key={`${replay.key}-dot`} {...appearAt(runDone)}>
            <StatusDot status={run.status} x={box.x + 56} y={box.y + HEAD_H / 2} r={9} />
          </motion.g>
        )}
        <text x={box.x + 73} y={box.y + 25} className="title">
          #{run.id} {run.workflow}
        </text>
        <text x={box.x + 83 + (String(run.id).length + run.workflow.length + 2) * 8.6} y={box.y + 25} className="sub">
          {narrow
            ? cut(`${hasTray ? "" : `${run.branch} · `}${run.sha}${run.attempt > 1 ? ` · #${run.attempt}` : ""}`, hasTray ? 8 : 22)
            : cut(`${ev} · ${run.branch} · ${run.sha}${run.attempt > 1 ? (tr ? ` · deneme ${run.attempt}` : ` · attempt ${run.attempt}`) : ""}${run.fork ? " · fork" : ""}`, hasTray ? 26 : 46)}
        </text>
        {store && tray && (
          <g>
            {/* The run's artifact store: jobs leave crates here and pick them up again. */}
            <OBox x={store.x - 4} y={store.y - 13} w={storeW} h={26} d={8} front="#efe5d2" top="#fffdf8" side="#ddd0b8" thin rx={4} />
            {!narrow && (
              <text x={store.x + 4} y={store.y + 4} className="sub" style={{ fontSize: 10.5 }}>
                artifact
              </text>
            )}
            <rect x={tray.x - 3} y={tray.y - 10} width={52} height={20} rx={3} style={{ fill: "none", stroke: "#c9bca4", strokeWidth: 1.2, strokeDasharray: "3 3" }} />
            {uploaded && (
              <At play={replay && replay.fresh(uploaded.j) ? replay : null} at={trayReady} k="tray">
                <g transform={`translate(${tray.x} ${tray.y})`}>
                  <Crate label="dist/" tone="dist" size={10.5} />
                </g>
              </At>
            )}
          </g>
        )}
        {replay && (
          <motion.text key={`${replay.key}-running`} x={box.x + box.w - 16} y={box.y + 25} textAnchor="end" className="sub" {...visibleBetween(0, runDone)}>
            {tr ? "çalışıyor…" : "running…"}
          </motion.text>
        )}
        <motion.text key={replay ? `${replay.key}-result` : "result"} x={box.x + box.w - 16} y={box.y + 25} textAnchor="end" className="sub" {...(replay ? appearAt(runDone) : {})}>
          {resultText}
        </motion.text>
      </Sticker>

      {chute && (
        <g>
          <rect x={chute.x - 13} y={chute.y1} width={26} height={chute.y2 - chute.y1} style={{ fill: "#efe5d2", ...INK }} />
          <rect x={chute.x - 6} y={chute.y1 + 2} width={12} height={chute.y2 - chute.y1 - 4} style={{ fill: "#ddd0b8" }} />
          {Array.from({ length: Math.floor((chute.y2 - chute.y1 - 20) / 36) }, (_, v) => (
            <rect key={v} x={chute.x - 15} y={chute.y1 + 20 + v * 36} width={30} height={6} rx={2} style={{ fill: METAL.front, ...THIN }} />
          ))}
          <path d={`M${chute.x - 22} ${chute.y2 - 2} h44 l-9 9 h-26z`} style={{ fill: METAL.front, ...INK }} />
          {/* The trigger's tag: the event that started this run and the commit it brought. */}
          <g transform={`translate(${chute.x + 24} ${(chute.y1 + chute.y2) / 2 - 22})`}>
            <line x1={-24} x2={0} y1={22} y2={22} style={{ stroke: "var(--ink)", strokeWidth: 1.6 }} />
            <rect x={0} y={3} width={156} height={42} rx={7} className="sticker-shadow" />
            <rect x={0} y={0} width={156} height={42} rx={7} style={{ fill: "var(--card)", ...INK }} />
            <text x={12} y={18} className="mono" style={{ fontSize: 12 }}>
              on: {run.event === "dispatch" ? "workflow_dispatch" : run.event}
            </text>
            <text x={12} y={34} className="sub" style={{ fontSize: 11.5 }}>
              {cut(`${run.branch} · ${run.sha}`, 18)}
            </text>
          </g>
          {replay?.arrival && (
            <motion.g key={`${replay.key}-drop`} initial={{ y: chute.y1 + 4, opacity: 0 }} animate={{ y: [chute.y1 + 4, chute.y2 - 4, chute.y2 - 4], opacity: [1, 1, 0] }} transition={{ delay: 0.15, duration: 0.45, times: [0, 0.8, 1] }}>
              <g transform={`translate(${chute.x} 0)`}>
                <Parcel s={10} size={0.9} kind="neutral" />
              </g>
            </motion.g>
          )}
        </g>
      )}

      {/* needs: a cable from every job it waits for to its entrance; it lights when that job ended. */}
      {edges.map(({ from, to }) => {
        const a = pos.get(from.key);
        const b = pos.get(to.key);
        if (!a || !b) return null;
        const x1 = a.x + k * (a.l.W - 4);
        const y1 = a.y + k * (76 + TOP);
        const x2 = b.x + k * -27;
        const y2 = b.y + k * (62 + TOP);
        const mx = (x1 + x2) / 2;
        // Into the next band: down past the end of this one, back along the gap, down to the entrance.
        const gy = top0 + (a.band + 1) * (bandH + BANDGAP) - BANDGAP / 2;
        // Past a column in between: over the top of the stations there, then down to the entrance.
        const over = b.band === a.band && b.col - a.col > 1 ? Math.min(...[...pos.values()].filter((p) => p.band === a.band && p.col > a.col && p.col < b.col).map((p) => p.y)) - 2 : null;
        const d =
          b.band > a.band
            ? `M${x1} ${y1} C${x1 + 26} ${y1} ${x1 + 26} ${gy} ${x1} ${gy} L${x2 - 20} ${gy} C${x2 - 46} ${gy} ${x2 - 46} ${y2} ${x2} ${y2}`
            : over !== null
              ? `M${x1} ${y1} C${x1 + 34} ${y1} ${x1 + 34} ${over} ${x1 + 60} ${over} L${x2 - 60} ${over} C${x2 - 34} ${over} ${x2 - 34} ${y2} ${x2} ${y2}`
              : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
        const color = from.status === "success" ? STATUS_FILL.success : from.status === "failure" || from.status === "cancelled" ? "var(--red)" : "#d8d2dc";
        const play = replay && replay.fresh(to) ? replay : null;
        return (
          <g key={`${from.key}-${to.key}`}>
            <path d={d} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 6.5, strokeLinecap: "round" }} />
            <path d={d} style={{ fill: "none", stroke: "#d8d2dc", strokeWidth: 3, strokeLinecap: "round" }} />
            {play ? (
              <motion.path key={`${play.key}-cable`} d={d} style={{ fill: "none", stroke: color, strokeWidth: 3, strokeLinecap: "round" }} {...appearAt(play.ms(from.end))} />
            ) : (
              <path d={d} style={{ fill: "none", stroke: color, strokeWidth: 3, strokeLinecap: "round" }} />
            )}
            <circle cx={x1} cy={y1} r={3.5} style={{ fill: "#57535f", ...THIN }} />
          </g>
        );
      })}

      {[...pos.values()].map(({ x, y, l, bench, job }) => {
        const play = replay && replay.fresh(job) ? replay : null;
        const approval = Boolean(job.environment && (job.status === "waiting" || job.reason === "approval" || run.approved.includes(job.environment)));
        const entrance = { needs: job.needs.length > 0, approval, lever: job.status === "skipped" && job.reason === "if" };
        const lit = focus === job.key || focus === job.id;
        return (
          <g key={job.key}>
            {lit && <rect x={x - 12 * k} y={y - 2} width={k * (l.W + PLATE_D + 22)} height={k * (TOP + PY + PH + 8)} rx={12} style={{ fill: "var(--tangerine-soft)", stroke: "var(--tangerine)", strokeWidth: 2, strokeDasharray: "6 5" }} />}
            <g transform={`translate(${x} ${y + k * TOP}) scale(${k})`}>
              <Station l={l} play={play} tr={tr} k={k} entrance={entrance} bench={bench} shelf={shelfMode} run={run} />
            </g>
            {bench && <Disk job={job} x={x} y={y + k * H0 + 6} w={k * (l.W + PLATE_D * 0.5)} replay={replay} tray={tray} trayReady={trayReady} tr={tr} />}
          </g>
        );
      })}

      {/* Outputs: a tag a job hands to the jobs that need it, hung where its cables leave, once it ended. */}
      {run.jobs.map((from) => {
        const outs = Object.entries(from.outputs);
        const a = pos.get(from.key);
        if (!outs.length || !a || !edges.some((e) => e.from === from)) return null;
        const label = cut(outs.map(([key, v]) => `${key}=${v}`).join("  "), 30);
        const w = label.length * 6.6 + 16;
        const tx = Math.min(a.x + k * (a.l.W - 4) - 8, box.x + box.w - w - 2);
        const ty = a.y + k * (76 + TOP) - 32;
        const play = replay && replay.fresh(from) ? replay : null;
        return (
          <At key={`o-${from.key}`} play={play} at={play ? play.ms(from.end) : 0} k={`out-${from.key}`}>
            <line x1={tx + 10} x2={a.x + k * (a.l.W - 4)} y1={ty + 18} y2={a.y + k * (76 + TOP)} style={{ stroke: "var(--ink)", strokeWidth: 1.2 }} />
            <rect x={tx} y={ty} width={w} height={18} rx={4} style={{ fill: "var(--sun-soft)", ...THIN }} />
            <circle cx={tx + 7} cy={ty + 9} r={2} style={{ fill: "var(--ink)" }} />
            <text x={tx + w / 2 + 3} y={ty + 13} textAnchor="middle" className="mono" style={{ fontSize: 11 }}>
              {label}
            </text>
          </At>
        );
      })}
    </g>
  );
}
