import { AnimatePresence, motion } from "motion/react";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { NameTag } from "../../iso/PartitionStage";
import { Belt, Building, Flag, GhostSlot, Parcel, Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import type { EventLine } from "../shared/describe";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import {
  base,
  indexDuplicates,
  MASKED,
  SANDBOX_STEP,
  topicDuplicates,
  WORKERS,
  type ConnectEvent,
  type ConnectState,
  type TaskId,
  type WorkerId,
} from "./model";
import { useAppSandbox } from "../shared/useAppSandbox";
import { FREE, scenarios } from "./scenarios";
import { lesson, shell } from "./shell";
import "./scene.css";

const SLUG = "kafka-connect";
const W = 860;
const H = 470;
const F: Frame = { ox: 262, oy: 236, s: 32 };
const SLOT = 1.1;
const WINDOW = 7;
const BELT_END = WINDOW * SLOT + 0.75;
const at = (x: number, y: number, z = 0) => project(F, x, y, z);
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

const WORKER_AT: Record<WorkerId, [number, number]> = { w1: [356, 112], w2: [496, 112] };
const DB_AT: [number, number] = [740, 96];
const INDEX_AT: [number, number] = [118, 96];

const text = {
  label: l(
    "Sağda veritabanı, ortada Connect worker'ları ve topic bandı, solda arama indeksi",
    "The database on the right, Connect workers and the topic belt in the middle, the search index on the left",
  ),
  db: l("Veritabanı: orders", "Database: orders"),
  index: l("Arama indeksi", "Search index"),
  cluster: l("Connect cluster", "Connect cluster"),
  offsets: l("connect-offsets", "connect-offsets"),
  sourceSaved: l("source: kaydedilen son id", "source: last saved id"),
  inMemory: l("hafızada", "in memory"),
  sinkSaved: l("sink: commit edilen offset", "sink: committed offset"),
  notCopied: l("henüz kopyalanmadı", "not copied yet"),
  rows: l("Tablodaki satır", "Rows in table"),
  topic: l("Topic'teki kayıt", "Records in topic"),
  topicDup: l("Topic'te tekrar", "Repeats in topic"),
  docs: l("İndeksteki belge", "Docs in index"),
  indexDup: l("İndekste kopya", "Copies in index"),
  smt: l("SMT: kartı maskele", "SMT: mask card"),
  legendParcel: l("kayıt (üstünde satır id)", "record (row id on top)"),
  legendMasked: l("kartı maskeli kayıt", "record with masked card"),
  legendDup: l("aynı satır ikinci kez", "the same row again"),
  legendFlag: l("sink'in sıradaki offset'i", "the sink's next offset"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir komut yaz; Connect, worker'lar ve indeks ne yaptı burada gör.", "Type a command; see what Connect, the workers and the index did here."),
};

const workerName = (w: WorkerId, lang: Lang) => `${lang === "tr" ? "Worker" : "Worker"} ${w === "w1" ? 1 : 2}`;

export function KafkaConnectScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const typed = useAppSandbox({ slug: SLUG, active: sandbox, lesson, shell, scenarios, free: FREE });

  const cursor = usePlayback(sandbox ? 0 : base.ends[step]! - base.startOf(step), paused, `${step}-${replayKey}`);
  const sandboxRun = typed.sandboxRun;

  let state: ConnectState;
  let lastEvents: ConnectEvent[];
  let shown: ConnectEvent[];
  if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shown = sandboxRun.events.flat();
  } else {
    const start = base.startOf(step);
    state = base.run.states[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shown = base.run.events.slice(start, start + cursor).flat();
  }

  const pulse = sandbox ? (sandboxRun?.events.length ?? 0) : cursor;

  const tDup = topicDuplicates(state);
  const iDup = indexDuplicates(state);
  const metrics: Metric[] = [
    { label: t(text.rows), value: state.rows.length },
    { label: t(text.topic), value: state.topic.length },
    { label: t(text.topicDup), value: tDup, tone: tDup > 0 ? "danger" : "plain" },
    { label: t(text.docs), value: state.index.length },
    { label: t(text.indexDup), value: iDup, tone: iDup > 0 ? "danger" : "plain" },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
    { swatch: <MiniCube fill="var(--sky)" />, label: t(text.legendMasked) },
    {
      swatch: (
        <g>
          <rect x={-10} y={-8} width={20} height={14} rx={7} className="badge-dup" />
          <text y={3} textAnchor="middle" className="badge-dup-text" style={{ fontSize: 9 }}>
            2×
          </text>
        </g>
      ),
      label: t(text.legendDup),
    },
    {
      swatch: (
        <g transform="translate(-6 5)">
          <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
          <path d="M0 -15h12l-2 3 2 3H0z" fill="var(--coral)" className="ink" />
        </g>
      ),
      label: t(text.legendFlag),
    },
  ];

  // Belt: the last records, newest at the far end next to the source.
  const first = Math.max(0, state.topic.length - WINDOW);
  const xOf = (offset: number) => 0.55 + (Math.max(offset, first) - first) * SLOT;
  const visible = state.topic.filter((r) => r.offset >= first);
  const firstSeen = new Map<number, number>();
  for (const r of state.topic) if (!firstSeen.has(r.rowId)) firstSeen.set(r.rowId, r.offset);
  const sourcedNow = lastEvents.some((e) => e.type === "sourced");
  const sunkNow = lastEvents.some((e) => e.type === "sunk");
  const crashedNow = lastEvents.find((e) => e.type === "crashed");
  const entry = at(BELT_END + 0.4, 0);
  const [flagX, flagY] = at(xOf(state.sinkPosition), 1.0);

  const lines = describe(shown, lang);
  const eventList = (
    <div className={`events ${sandbox ? "" : "is-short"}`} aria-live="polite">
      <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
      {lines.length === 0 ? (
        <p>{t(sandbox ? text.nothing : text.waiting)}</p>
      ) : (
        <ol>
          {(sandbox ? [...lines].reverse() : lines).map((line, i) => (
            <li key={`${pulse}-${i}`} className={`ev-${line.tone}`}>
              <span className="ev-dot" />
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const footer = sandbox ? (
    <div className="sandbox">
      {typed.panel}
      {typed.terminal}
      {eventList}
    </div>
  ) : null;

  const taskAt = (task: TaskId): [number, number] | null => {
    const w = state.tasks[task];
    if (!w) return null;
    const [x, y] = WORKER_AT[w];
    const sameBoth = state.tasks.source === state.tasks.sink;
    const dy = sameBoth ? (task === "source" ? -66 : -42) : -54;
    return [x + 50, y + dy];
  };
  const srcChip = taskAt("source");
  const sinkChip = taskAt("sink");

  return (
    <SceneFrame metrics={metrics} controls={controls} legend={legend} paused={paused} width={W} height={H} label={t(text.label)} footer={footer}>
      {/* Data flow: table → source task → topic → sink task → index. */}
      <Flow from={[DB_AT[0] - 70, DB_AT[1] + 80]} to={srcChip ?? WORKER_AT.w1} active={sourcedNow} />
      <Flow from={srcChip ?? WORKER_AT.w1} to={[entry[0], entry[1] - 30]} active={sourcedNow} />
      <Flow from={[at(0.3, 0)[0], at(0.3, 0)[1] - 30]} to={sinkChip ?? WORKER_AT.w2} active={sunkNow} />
      <Flow from={sinkChip ?? WORKER_AT.w2} to={[INDEX_AT[0] + 70, INDEX_AT[1] + 80]} active={sunkNow} />

      <g className="cx-cluster">
        <rect x={276} y={8} width={302} height={146} rx={22} className="cx-cluster-box" />
        <text x={292} y={30} className="cx-title">
          {t(text.cluster)}
        </text>
      </g>
      {WORKERS.map((w) => (
        <g key={w} transform={`translate(${WORKER_AT[w][0]} ${WORKER_AT[w][1]})`}>
          <Building s={22} roof={TINTS.lilac} status={state.workers[w] ? "ok" : "down"} />
          <NameTag y={26} text={workerName(w, lang)} tint={state.workers[w] ? TINTS.lilac : TINTS.grey} />
        </g>
      ))}
      <TaskChip key="source" at={srcChip} label="source" fill="var(--sky)" />
      <TaskChip key="sink" at={sinkChip} label="sink" fill="var(--coral)" />

      <OffsetsCard x={300} y={164} state={state} t={t} />

      <g transform={`translate(${F.ox} ${F.oy})`}>
        <Belt s={F.s} from={-0.05} to={BELT_END} slot={SLOT} />
      </g>
      <motion.g initial={false} animate={{ x: at(xOf(state.topic.length), 0)[0], y: at(xOf(state.topic.length), 0)[1] }} transition={spring}>
        <GhostSlot s={F.s} />
      </motion.g>
      <AnimatePresence initial={false}>
        {visible.map((r) => {
          const [x, y] = at(xOf(r.offset), 0);
          const repeat = firstSeen.get(r.rowId) !== r.offset;
          return (
            <motion.g
              key={r.offset}
              initial={{ x: entry[0] + 30, y: entry[1] - 40, opacity: 0, scale: 0.6 }}
              animate={{ x, y, opacity: 1, scale: 1 }}
              exit={{ x: at(-0.6, 0)[0], y: at(-0.6, 0)[1], opacity: 0 }}
              transition={spring}
            >
              <Parcel s={F.s} kind={r.card === MASKED ? "payment" : "order"} label={r.rowId} state={repeat ? "dup" : "normal"} />
            </motion.g>
          );
        })}
      </AnimatePresence>
      <motion.g initial={false} animate={{ x: flagX, y: flagY }} transition={spring}>
        <Flag tint={TINTS.coral} label={state.sinkPosition} height={58} />
      </motion.g>
      <AnimatePresence>
        {state.mask && <Pill key="smt" x={entry[0] + 40} y={entry[1] + 30} text={t(text.smt)} tone="sun" />}
      </AnimatePresence>

      <g transform={`translate(${DB_AT[0]} ${DB_AT[1]})`}>
        <Database />
      </g>
      <RowsCard x={632} y={150} title={t(text.db)} state={state} notCopied={t(text.notCopied)} />

      <g transform={`translate(${INDEX_AT[0]} ${INDEX_AT[1]})`}>
        <Building s={24} roof={TINTS.coral} />
      </g>
      {/* The sink task writes each record to the index, so new documents come from the task. */}
      <IndexCard x={14} y={150} title={t(text.index)} state={state} from={sinkChip} />

      <AnimatePresence>
        {crashedNow && crashedNow.type === "crashed" && (
          <Pill
            key={`crash-${pulse}`}
            x={WORKER_AT[crashedNow.worker][0]}
            y={WORKER_AT[crashedNow.worker][1] - 104}
            text={crashedNow.lostRows > 0 ? (lang === "tr" ? `${crashedNow.lostRows} satırın yeri kayboldu` : `place of ${crashedNow.lostRows} rows lost`) : lang === "tr" ? "çöktü" : "crashed"}
            tone="danger"
          />
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------- pieces */

function Flow({ from, to, active }: { from: [number, number]; to: [number, number]; active: boolean }) {
  const mx = (from[0] + to[0]) / 2;
  const d = `M${from[0]} ${from[1]} C ${mx} ${from[1]}, ${mx} ${to[1]}, ${to[0]} ${to[1]}`;
  return <path d={d} className={`link cx-flow ${active ? "is-hot" : ""}`} />;
}

function TaskChip({ at: pos, label, fill }: { at: [number, number] | null; label: string; fill: string }) {
  if (!pos) return null;
  return (
    <motion.g initial={false} animate={{ x: pos[0], y: pos[1] }} transition={{ type: "spring", stiffness: 140, damping: 18 }}>
      <rect x={-30} y={-8} width={60} height={20} rx={10} className="pill-shadow" />
      <rect x={-30} y={-11} width={60} height={20} rx={10} className="ink" style={{ fill }} />
      <text y={3.5} textAnchor="middle" className="cx-mono">
        {label}
      </text>
    </motion.g>
  );
}

function OffsetsCard({ x, y, state, t }: { x: number; y: number; state: ConnectState; t: (x: L) => string }) {
  const unsaved = state.sourceSeen !== state.sourceSaved;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={3} width={256} height={52} rx={12} className="pill-shadow" />
      <rect width={256} height={52} rx={12} className="ink" style={{ fill: "var(--card)" }} />
      <text x={12} y={17} className="cx-mono">
        {t(text.offsets)}
      </text>
      <text x={12} y={32} className="cx-row">
        {t(text.sourceSaved)}: <tspan className="cx-strong">{state.sourceSaved}</tspan>
        {unsaved && (
          <tspan className="cx-warn">
            {"  "}({t(text.inMemory)}: {state.sourceSeen})
          </tspan>
        )}
      </text>
      <text x={12} y={46} className="cx-row">
        {t(text.sinkSaved)}: <tspan className="cx-strong">{state.sinkCommitted}</tspan>
      </text>
    </g>
  );
}

function RowsCard({ x, y, title, state, notCopied }: { x: number; y: number; title: string; state: ConnectState; notCopied: string }) {
  const rows = state.rows.slice(-6);
  const h = 34 + rows.length * 21 + 18;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={4} width={214} height={h} rx={14} className="pill-shadow" />
      <rect width={214} height={h} rx={14} className="ink" style={{ fill: "var(--card)" }} />
      <text x={12} y={21} className="cx-title">
        {title}
      </text>
      <AnimatePresence initial={false}>
        {rows.map((r, i) => {
          const pending = r.id > state.sourceSeen;
          return (
            <motion.g key={r.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
              <g transform={`translate(10 ${32 + i * 21})`}>
                <rect width={194} height={18} rx={6} style={{ fill: pending ? "var(--sun-soft)" : "var(--paper-2)" }} />
                <text x={8} y={13} className="cx-mono">
                  #{r.id}
                </text>
                <text x={44} y={13} className="cx-row">
                  {r.card}
                </text>
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>
      <text x={12} y={h - 7} className="label-soft">
        <tspan style={{ fill: "#d9a826" }}>■</tspan> {notCopied}
      </text>
    </g>
  );
}

function IndexCard({ x, y, title, state, from }: { x: number; y: number; title: string; state: ConnectState; from: [number, number] | null }) {
  const docs = state.index.slice(-7);
  const counts = new Map<number, number>();
  for (const d of state.index) counts.set(d.rowId, (counts.get(d.rowId) ?? 0) + 1);
  const h = 36 + Math.max(docs.length, 1) * 21;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={4} width={214} height={h} rx={14} className="pill-shadow" />
      <rect width={214} height={h} rx={14} className="ink" style={{ fill: "var(--card)" }} />
      <text x={12} y={21} className="cx-title">
        {title}
      </text>
      <rect x={136} y={8} width={68} height={18} rx={9} className="ink" style={{ fill: state.sinkMode === "upsert" ? "var(--mint-soft)" : "var(--paper-2)" }} />
      <text x={170} y={21} textAnchor="middle" className="cx-mono">
        {state.sinkMode}
      </text>
      <AnimatePresence initial={false}>
        {docs.map((d, i) => {
          const dup = (counts.get(d.rowId) ?? 0) > 1;
          return (
            <motion.g
              key={`${d.rowId}-${state.index.length - docs.length + i}`}
              initial={from ? { opacity: 0, x: from[0] - x - 10, y: from[1] - y - 32 - i * 21 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={spring}
            >
              <g transform={`translate(10 ${32 + i * 21})`}>
                <rect width={194} height={18} rx={6} style={{ fill: dup ? "var(--red-soft)" : d.card === MASKED ? "var(--sky-soft)" : "var(--paper-2)" }} />
                <text x={8} y={13} className="cx-mono">
                  #{d.rowId}
                </text>
                <text x={44} y={13} className="cx-row">
                  {d.card}
                </text>
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}

/** A database: a short stack of iso cylinders. */
function Database() {
  const disc = (y: number, top: boolean) => (
    <g transform={`translate(0 ${y})`}>
      <path d="M-34 0 v14 a34 13 0 0 0 68 0 v-14" className="ink" style={{ fill: "var(--sun)" }} />
      {top && <ellipse rx={34} ry={13} className="ink" style={{ fill: "#ffe39a" }} />}
    </g>
  );
  return (
    <g>
      <ellipse cy={44} rx={40} ry={12} className="ground-shadow" />
      {disc(24, false)}
      {disc(6, false)}
      {disc(-12, true)}
    </g>
  );
}

function MiniCube({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-7,-4 0,0 0,7 -7,3" style={{ fill }} />
      <polygon points="0,0 7,-4 7,3 0,7" style={{ fill }} opacity="0.75" />
      <polygon points="-7,-4 0,-8 7,-4 0,0" style={{ fill }} />
    </g>
  );
}

/* ------------------------------------------------------- event wording */

export function describe(events: ConnectEvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  const taskNames = (ts: TaskId[]) => ts.join(", ");
  for (const e of events) {
    switch (e.type) {
      case "rowInserted":
        out.push({ tone: "plain", text: tr ? `Uygulama tabloya satır #${e.id}'i ekledi` : `The app inserted row #${e.id} into the table` });
        break;
      case "sourced":
        out.push({
          tone: e.again ? "bad" : "produce",
          text: tr
            ? `Source: satır #${e.rowId} → topic, offset ${e.offset}${e.masked ? " (kart maskeli)" : ""}${e.again ? " — ikinci kez!" : ""}`
            : `Source: row #${e.rowId} → topic, offset ${e.offset}${e.masked ? " (card masked)" : ""}${e.again ? " — a second time!" : ""}`,
        });
        break;
      case "sourceFlushed":
        out.push({ tone: "ok", text: tr ? `Source offset'i kaydedildi: son id ${e.lastId}` : `Source offset saved: last id ${e.lastId}` });
        break;
      case "sunk":
        out.push({
          tone: e.duplicate ? "bad" : "read",
          text: e.duplicate
            ? tr
              ? `Sink: #${e.rowId} indekse ikinci bir kopya olarak eklendi!`
              : `Sink: #${e.rowId} added to the index as a second copy!`
            : e.again
              ? tr
                ? `Sink: #${e.rowId} indekste aynı belgenin üstüne yazıldı, kopya yok`
                : `Sink: #${e.rowId} overwrote the same document, no copy`
              : tr
                ? `Sink: #${e.rowId} indekse yazıldı`
                : `Sink: #${e.rowId} written to the index`,
        });
        break;
      case "sinkCommitted":
        out.push({ tone: "ok", text: tr ? `Sink offset'i commit edildi: ${e.offset}` : `Sink offset committed: ${e.offset}` });
        break;
      case "crashed":
        out.push({
          tone: "bad",
          text: tr
            ? `${workerName(e.worker, lang)} çöktü!${e.moved.length ? ` ${taskNames(e.moved)} görevi diğer worker'a taşındı.` : ""}${e.lostRows ? ` Kaydedilmemiş ${e.lostRows} satırın bilgisi kayboldu.` : ""}`
            : `${workerName(e.worker, lang)} crashed!${e.moved.length ? ` The ${taskNames(e.moved)} task moved to the other worker.` : ""}${e.lostRows ? ` What it knew about ${e.lostRows} unsaved rows is gone.` : ""}`,
        });
        break;
      case "restarted":
        out.push({
          tone: "ok",
          text: tr
            ? `${workerName(e.worker, lang)} geri geldi${e.moved.length ? `; ${taskNames(e.moved)} görevi ona geçti (offset'i önce kaydedilerek)` : ""}`
            : `${workerName(e.worker, lang)} is back${e.moved.length ? `; the ${taskNames(e.moved)} task moved to it (saving its offset first)` : ""}`,
        });
        break;
      case "maskSet":
        out.push({ tone: "plain", text: tr ? `Mask SMT ${e.on ? "açıldı" : "kapandı"}` : `Mask SMT turned ${e.on ? "on" : "off"}` });
        break;
      case "sinkModeSet":
        out.push({ tone: "plain", text: tr ? `Sink modu: ${e.mode}` : `Sink mode: ${e.mode}` });
        break;
      case "nothing":
        out.push({ tone: "plain", text: tr ? `${e.task}: yapılacak yeni bir şey yok` : `${e.task}: nothing new to do` });
        break;
    }
  }
  return out;
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const events = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const out: Change[] = [];
  const inserted = events.filter((e) => e.type === "rowInserted").length;
  const sourced = events.filter((e) => e.type === "sourced");
  const again = sourced.filter((e) => e.type === "sourced" && e.again).length;
  const sunk = events.filter((e) => e.type === "sunk");
  if (inserted) out.push({ kind: "add", text: both(`Tabloya ${inserted} satır eklendi`, `${inserted} row${inserted > 1 ? "s" : ""} added to the table`) });
  for (const e of events) {
    if (e.type === "maskSet") out.push({ kind: "change", text: both("Mask SMT açıldı", "Mask SMT turned on") });
    if (e.type === "crashed") out.push({ kind: "bad", text: both(`${workerName(e.worker, "tr")} çöktü, source görevi taşındı`, `${workerName(e.worker, "en")} crashed and the source task moved`) });
    if (e.type === "restarted") out.push({ kind: "good", text: both(`${workerName(e.worker, "tr")} geri geldi, görevler yeniden dağıtıldı`, `${workerName(e.worker, "en")} is back and tasks were spread again`) });
    if (e.type === "sourceFlushed") out.push({ kind: "good", text: both(`Source offset'i kaydedildi: son id ${e.lastId}`, `Source offset saved: last id ${e.lastId}`) });
    if (e.type === "sinkCommitted") out.push({ kind: "good", text: both(`Sink commit etti: offset ${e.offset}`, `Sink committed: offset ${e.offset}`) });
  }
  if (sourced.length - again > 0) {
    const n = sourced.length - again;
    out.push({ kind: "add", text: both(`Source ${n} satırı topic'e yazdı`, `Source wrote ${n} row${n > 1 ? "s" : ""} to the topic`) });
  }
  if (again > 0) out.push({ kind: "bad", text: both(`${again} satır topic'e ikinci kez yazıldı`, `${again} row${again > 1 ? "s" : ""} written to the topic a second time`) });
  if (sunk.length > 0) {
    const overwrote = sunk.filter((e) => e.type === "sunk" && e.again && !e.duplicate).length;
    out.push({ kind: "add", text: both(`Sink ${sunk.length} kaydı indekse yazdı`, `Sink wrote ${sunk.length} record${sunk.length > 1 ? "s" : ""} to the index`) });
    if (overwrote) out.push({ kind: "good", text: both(`${overwrote} tekrar aynı belgenin üstüne yazıldı, kopya yok`, `${overwrote} repeat${overwrote > 1 ? "s" : ""} overwrote the same document, no copies`) });
  }
  return out;
}
