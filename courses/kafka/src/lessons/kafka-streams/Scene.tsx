import { AnimatePresence, motion } from "motion/react";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { NameTag } from "../../iso/PartitionStage";
import { Belt, Building, CommitSeal, Flag, GhostSlot, Parcel, Person, Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import type { EventLine } from "../shared/describe";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import {
  base,
  CITIES,
  overcount,
  SANDBOX_STEP,
  tableOf,
  trueCounts,
  type City,
  type StreamsEvent,
  type StreamsState,
  type Update,
} from "./model";
import { useAppSandbox } from "../shared/useAppSandbox";
import { FREE, scenarios } from "./scenarios";
import { lesson, shell } from "./shell";
import "./scene.css";

const SLUG = "kafka-streams";
const W = 860;
const H = 470;
const F: Frame = { ox: 104, oy: 262, s: 29 };
const SLOT = 1.1;
const WINDOW = 8;
const BELT_END = WINDOW * SLOT + 0.75;
const at = (x: number, y: number, z = 0) => project(F, x, y, z);
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const APP: [number, number] = [214, 118];
const CHANGELOG_AT: [number, number] = [318, 10];

const KIND: Record<City, "order" | "payment" | "cancel"> = { İstanbul: "order", Ankara: "payment", İzmir: "cancel" };
const FILL: Record<City, string> = { İstanbul: "var(--mint)", Ankara: "var(--sky)", İzmir: "var(--peach)" };
const SHORT: Record<City, string> = { İstanbul: "İst", Ankara: "Ank", İzmir: "İzm" };

const text = {
  label: l(
    "Solda orders topic'i bir bant, ortada sayım uygulaması ve state store, sağda changelog ve sonuç topic'i",
    "On the left the orders topic as a belt, in the middle the counting app and its state store, on the right the changelog and the result topic",
  ),
  producer: l("Sipariş servisi", "Order service"),
  app: l("Sayım uygulaması", "Counting app"),
  library: l("içinde: Kafka Streams", "inside: Kafka Streams"),
  store: l("State store (yerel disk)", "State store (local disk)"),
  lost: l("boş: disk kayboldu", "empty: disk lost"),
  changelog: l("changelog topic", "changelog topic"),
  output: l("KStream: orders-per-city", "KStream: orders-per-city"),
  table: l("KTable: her şehrin son değeri", "KTable: latest value per city"),
  right: l("doğrusu", "correct"),
  orders: l("Sipariş", "Orders"),
  processed: l("İşlenen", "Processed"),
  committed: l("Commit", "Committed"),
  extra: l("Fazla sayım", "Over-counted"),
  guarantee: l("Garanti", "Guarantee"),
  restored: l("changelog'dan geri yüklendi", "restored from the changelog"),
  aborted: l("transaction iptal", "transaction aborted"),
  legendFlag: l("sıradaki işlenecek offset", "next offset to process"),
  legendSeal: l("commit edilen offset", "committed offset"),
  legendOpen: l("commit bekliyor", "waiting for commit"),
  legendAborted: l("iptal edildi", "aborted"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir komut yaz; uygulamanın ne saydığını burada gör.", "Type a command; see what the app counted here."),
};

const cityName = (c: City, lang: Lang) => (lang === "tr" ? c : c.replace("İ", "I"));

export function KafkaStreamsScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const typed = useAppSandbox({ slug: SLUG, active: sandbox, lesson, shell, scenarios, free: FREE });

  const cursor = usePlayback(sandbox ? 0 : base.ends[step]! - base.startOf(step), paused, `${step}-${replayKey}`);
  const sandboxRun = typed.sandboxRun;

  let state: StreamsState;
  let lastEvents: StreamsEvent[];
  let shown: StreamsEvent[];
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

  const extraCount = overcount(state);
  const eos = state.guarantee === "exactly_once_v2";
  const metrics: Metric[] = [
    { label: t(text.orders), value: state.input.length },
    { label: t(text.processed), value: state.position },
    { label: t(text.committed), value: state.committed, tone: "ok" },
    { label: t(text.extra), value: extraCount, tone: extraCount > 0 ? "danger" : "plain" },
    { label: t(text.guarantee), value: eos ? "exactly_once_v2" : "at_least_once", tone: eos ? "ok" : "plain" },
  ];

  const legend: LegendItem[] = [
    ...CITIES.map((c) => ({ swatch: <MiniCube fill={FILL[c]} />, label: cityName(c, lang) })),
    {
      swatch: (
        <g transform="translate(-6 5)">
          <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
          <path d="M0 -15h12l-2 3 2 3H0z" fill="var(--lilac)" className="ink" />
        </g>
      ),
      label: t(text.legendFlag),
    },
    {
      swatch: (
        <g transform="translate(0 -3) scale(0.62)">
          <CommitSeal tint={TINTS.lilac} label="" />
        </g>
      ),
      label: t(text.legendSeal),
    },
    { swatch: <rect x={-9} y={-9} width={18} height={12} rx={5} className="ks-chip-open" />, label: t(text.legendOpen) },
    { swatch: <rect x={-9} y={-9} width={18} height={12} rx={5} className="ks-chip-aborted" />, label: t(text.legendAborted) },
  ];

  const first = Math.max(0, state.input.length - WINDOW);
  const xOf = (offset: number) => 0.55 + (Math.max(offset, first) - first) * SLOT;
  const visibleInput = state.input.filter((r) => r.offset >= first);
  const processedNow = new Set(lastEvents.flatMap((e) => (e.type === "processed" ? [e.offset] : [])));
  const againNow = new Set(lastEvents.flatMap((e) => (e.type === "processed" && e.again ? [e.offset] : [])));
  const orderedNow = lastEvents.some((e) => e.type === "ordered");
  const restoredNow = lastEvents.some((e) => e.type === "restored");
  const abortedNow = lastEvents.some((e) => e.type === "crashed" && e.aborted > 0);
  const producerAt = at(BELT_END + 1.0, 1.1);
  const [flagX, flagY] = at(xOf(state.position), 0.95);
  const [sealX, sealY] = at(xOf(state.committed) - 0.7, 1.85);

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

  const table = tableOf(state.output);
  const right = trueCounts(state);

  return (
    <SceneFrame metrics={metrics} controls={controls} legend={legend} paused={paused} width={W} height={H} label={t(text.label)} footer={footer}>
      {/* Flow: orders → app → changelog / output. */}
      <path d={`M${at(1.2, 0)[0]} ${at(1.2, 0)[1] - 40} C ${at(1.2, 0)[0]} ${APP[1] + 90}, ${APP[0] - 40} ${APP[1] + 70}, ${APP[0] - 20} ${APP[1] + 20}`} className={`link ks-flow ${processedNow.size ? "is-hot" : ""}`} />
      <path d={`M${APP[0] + 40} ${APP[1] - 10} C ${APP[0] + 90} ${APP[1] - 10}, 300 70, 318 70`} className={`link ks-flow ${processedNow.size ? "is-hot" : ""}`} />

      <g transform={`translate(${F.ox} ${F.oy})`}>
        <Belt s={F.s} from={-0.05} to={BELT_END} slot={SLOT} />
      </g>
      <text x={at(0, 0)[0] - 4} y={at(0, 0)[1] - 44} className="ks-title">
        orders
      </text>
      <motion.g initial={false} animate={{ x: at(xOf(state.input.length), 0)[0], y: at(xOf(state.input.length), 0)[1] }} transition={spring}>
        <GhostSlot s={F.s} />
      </motion.g>
      <AnimatePresence initial={false}>
        {visibleInput.map((r) => {
          const [x, y] = at(xOf(r.offset), 0);
          return (
            <motion.g
              key={r.offset}
              initial={{ x: producerAt[0], y: producerAt[1] - 40, opacity: 0, scale: 0.6 }}
              animate={{ x, y, opacity: 1, scale: 1 }}
              exit={{ x: at(-0.6, 0)[0], y: at(-0.6, 0)[1], opacity: 0 }}
              transition={spring}
            >
              <Parcel
                s={F.s}
                kind={KIND[r.city]}
                label={r.offset}
                state={againNow.has(r.offset) ? "dup" : processedNow.has(r.offset) ? "read" : "normal"}
                readTint={TINTS.lilac}
              />
            </motion.g>
          );
        })}
      </AnimatePresence>
      <motion.g initial={false} animate={{ x: sealX, y: sealY }} transition={spring}>
        <g transform="scale(1.2)"><CommitSeal tint={TINTS.lilac} label={state.committed} /></g>
      </motion.g>
      {state.alive && (
        <motion.g initial={false} animate={{ x: flagX, y: flagY }} transition={spring}>
          <Flag tint={TINTS.lilac} label={state.position} height={54} />
        </motion.g>
      )}
      <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
        <Person key={orderedNow ? pulse : "steady"} tint={TINTS.sky} state={orderedNow ? "hop" : "idle"} scale={0.95} />
        <NameTag y={20} text={t(text.producer)} tint={TINTS.sky} />
      </g>

      {/* The app: an ordinary service with the Streams library inside. */}
      <g transform={`translate(${APP[0]} ${APP[1]})`}>
        <Building s={26} roof={TINTS.lilac} status={state.alive ? "ok" : "down"} w={1.7} />
        <NameTag y={34} text={t(text.app)} tint={state.alive ? TINTS.lilac : TINTS.grey} />
        <text y={62} textAnchor="middle" className="label-soft">
          {t(text.library)}
        </text>
      </g>
      {/* On restart the store is rebuilt by reading the changelog back, so its rows come from there. */}
      <StoreCard x={14} y={10} state={state} t={t} lang={lang} from={restoredNow ? CHANGELOG_AT : undefined} />

      {/* The app writes every update to both topics: new entries leave the app. */}
      <UpdatesCard x={CHANGELOG_AT[0]} y={CHANGELOG_AT[1]} w={250} title={t(text.changelog)} updates={state.changelog} lang={lang} from={APP} />
      <UpdatesCard x={584} y={10} w={262} title={t(text.output)} updates={state.output} lang={lang} from={APP} />
      <TableCard x={584} y={124} title={t(text.table)} table={table} right={right} rightLabel={t(text.right)} lang={lang} />

      <AnimatePresence>
        {restoredNow && <Pill key={`r-${pulse}`} x={APP[0] + 10} y={APP[1] - 76} text={t(text.restored)} tone="ok" />}
        {abortedNow && <Pill key={`a-${pulse}`} x={APP[0] + 10} y={APP[1] - 76} text={t(text.aborted)} tone="danger" />}
        {extraCount > 0 && (
          <Pill key="extra" x={715} y={260} text={lang === "tr" ? `${extraCount} sipariş fazla sayıldı!` : `${extraCount} orders counted twice!`} tone="danger" size={13} />
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------- pieces */

function StoreCard({ x, y, state, t, lang, from }: { x: number; y: number; state: StreamsState; t: (x: L) => string; lang: Lang; from?: [number, number] }) {
  const cities = CITIES.filter((c) => state.store[c] !== undefined);
  const w = 160;
  const h = 34 + Math.max(cities.length, 1) * 19 + 4;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={3} width={w} height={h} rx={12} className="pill-shadow" />
      <rect width={w} height={h} rx={12} className="ink" style={{ fill: state.alive ? "var(--lilac-soft)" : "#eeebf0" }} />
      <text x={10} y={18} className="ks-title">
        {t(text.store)}
      </text>
      {!state.alive || cities.length === 0 ? (
        <text x={10} y={40} className="label-soft">
          {state.alive ? "—" : t(text.lost)}
        </text>
      ) : (
        cities.map((c, i) => (
          <motion.g
            key={c}
            initial={from ? { opacity: 0, x: from[0] - x, y: from[1] - y } : false}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ ...spring, delay: i * 0.08 }}
          >
            <g transform={`translate(10 ${28 + i * 19})`}>
              <rect width={10} height={10} y={2} rx={3} className="ink" style={{ fill: FILL[c] }} />
              <text x={16} y={11} className="ks-row">
                {cityName(c, lang)}
              </text>
              <text x={w - 22} y={11} textAnchor="end" className="ks-strong">
                {state.store[c]}
              </text>
            </g>
          </motion.g>
        ))
      )}
    </g>
  );
}

function UpdatesCard({ x, y, w, title, updates, lang, from }: { x: number; y: number; w: number; title: string; updates: Update[]; lang: Lang; from: [number, number] }) {
  const perRow = Math.floor((w - 16) / 58);
  const shown = updates.slice(-perRow * 2);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={3} width={w} height={94} rx={12} className="pill-shadow" />
      <rect width={w} height={94} rx={12} className="ink" style={{ fill: "var(--card)" }} />
      <text x={10} y={18} className="ks-title">
        {title}
      </text>
      {shown.length === 0 && (
        <text x={10} y={44} className="label-soft">
          —
        </text>
      )}
      <AnimatePresence initial={false}>
        {shown.map((u, i) => {
          const index = updates.length - shown.length + i;
          const sx = 10 + (i % perRow) * 58;
          const sy = 30 + Math.floor(i / perRow) * 28;
          return (
            <motion.g
              key={index}
              initial={{ opacity: 0, scale: 0.7, x: from[0] - x - sx, y: from[1] - y - sy }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              transition={spring}
            >
              <g transform={`translate(${sx} ${sy})`}>
                <rect width={54} height={22} rx={8} className={`ks-chip ks-chip-${u.status}`} style={u.status === "committed" ? { fill: FILL[u.city] } : undefined} />
                <text x={27} y={15} textAnchor="middle" className={`ks-mono ${u.status === "aborted" ? "ks-struck" : ""}`}>
                  {lang === "tr" ? SHORT[u.city] : SHORT[u.city].replace("İ", "I")}={u.count}
                </text>
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}

function TableCard({
  x,
  y,
  title,
  table,
  right,
  rightLabel,
  lang,
}: {
  x: number;
  y: number;
  title: string;
  table: Partial<Record<City, number>>;
  right: Partial<Record<City, number>>;
  rightLabel: string;
  lang: Lang;
}) {
  const cities = CITIES.filter((c) => table[c] !== undefined);
  const w = 262;
  const h = 34 + Math.max(cities.length, 1) * 22 + 4;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={3} width={w} height={h} rx={12} className="pill-shadow" />
      <rect width={w} height={h} rx={12} className="ink" style={{ fill: "var(--mint-soft)" }} />
      <text x={10} y={18} className="ks-title">
        {title}
      </text>
      {cities.length === 0 && (
        <text x={10} y={42} className="label-soft">
          —
        </text>
      )}
      <AnimatePresence initial={false}>
        {cities.map((c, i) => {
          const wrong = (right[c] ?? 0) !== table[c];
          return (
            <motion.g key={c} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
              <g transform={`translate(10 ${28 + i * 22})`}>
                <rect width={w - 20} height={19} rx={6} style={{ fill: wrong ? "var(--red-soft)" : "var(--card)" }} />
                <rect x={6} y={4.5} width={10} height={10} rx={3} className="ink" style={{ fill: FILL[c] }} />
                <text x={22} y={14} className="ks-row">
                  {cityName(c, lang)}
                </text>
                <motion.text key={table[c]} initial={{ scale: 1.6 }} animate={{ scale: 1 }} x={120} y={14} className="ks-strong">
                  {table[c]}
                </motion.text>
                {wrong && (
                  <text x={w - 28} y={14} textAnchor="end" className="ks-warn">
                    {rightLabel}: {right[c] ?? 0}
                  </text>
                )}
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>
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

const storeText = (store: Partial<Record<City, number>>, lang: Lang) =>
  CITIES.filter((c) => store[c] !== undefined)
    .map((c) => `${cityName(c, lang)} ${store[c]}`)
    .join(", ") || "—";

export function describe(events: StreamsEvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "ordered":
        out.push({ tone: "produce", text: tr ? `Yeni sipariş: ${cityName(e.city, lang)} → offset ${e.offset}` : `New order: ${cityName(e.city, lang)} → offset ${e.offset}` });
        break;
      case "processed":
        out.push({
          tone: e.again ? "bad" : "read",
          text: tr
            ? `İşlendi: offset ${e.offset} (${cityName(e.city, lang)}) → sayım ${e.count}${e.again ? ". Bu sipariş daha önce de sayılmıştı!" : ""}`
            : `Processed: offset ${e.offset} (${cityName(e.city, lang)}) → count ${e.count}${e.again ? ". This order had already been counted!" : ""}`,
        });
        break;
      case "committed":
        out.push({
          tone: "ok",
          text: tr
            ? `Commit: input offset ${e.offset}${e.transaction ? ", transaction tamamlandı; güncellemeler artık görünür" : ""}`
            : `Commit: input offset ${e.offset}${e.transaction ? "; the transaction is done and the updates are visible" : ""}`,
        });
        break;
      case "crashed":
        out.push({
          tone: "bad",
          text: tr
            ? `Uygulama çöktü ve yerel disk kayboldu!${e.uncommitted ? ` Commit edilmemiş ${e.uncommitted} sipariş vardı.` : ""}${e.aborted ? " Yarım kalan transaction iptal edildi." : ""}`
            : `The app crashed and its local disk is gone!${e.uncommitted ? ` ${e.uncommitted} processed orders were not committed.` : ""}${e.aborted ? " The open transaction was aborted." : ""}`,
        });
        break;
      case "restored":
        out.push({
          tone: "ok",
          text: tr
            ? `Yeniden başladı: state store changelog'dan geri yüklendi (${storeText(e.store, lang)})`
            : `Restarted: the state store was restored from the changelog (${storeText(e.store, lang)})`,
        });
        break;
      case "guaranteeSet":
        out.push({ tone: "plain", text: `processing.guarantee = ${e.guarantee}` });
        break;
      case "reset":
        out.push({
          tone: "plain",
          text: tr
            ? "Application reset: input offset'i 0'a döndü, changelog ve yerel state silindi"
            : "Application reset: the input offset is back at 0, the changelog and local state are wiped",
        });
        break;
      case "nothing":
        out.push({ tone: "plain", text: tr ? "İşlenecek yeni sipariş yok" : "No new order to process" });
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
  const after = base.run.states[base.ends[step]!]!;
  const out: Change[] = [];
  const ordered = events.filter((e) => e.type === "ordered").length;
  const processed = events.filter((e) => e.type === "processed");
  const again = processed.filter((e) => e.type === "processed" && e.again).length;
  if (ordered) out.push({ kind: "add", text: both(`+${ordered} sipariş topic'e yazıldı`, `+${ordered} order${ordered > 1 ? "s" : ""} written to the topic`) });
  for (const e of events) {
    if (e.type === "reset") out.push({ kind: "change", text: both("Uygulama sıfırlandı, her şey baştan sayılıyor", "The app was reset and recounts from the start") });
    if (e.type === "guaranteeSet") out.push({ kind: "change", text: both(`Garanti: ${e.guarantee}`, `Guarantee: ${e.guarantee}`) });
    if (e.type === "crashed") out.push({ kind: "bad", text: both("Uygulama çöktü, yerel state gitti", "The app crashed and lost its local state") });
    if (e.type === "crashed" && e.aborted) out.push({ kind: "good", text: both("Yarım transaction iptal edildi", "The open transaction was aborted") });
    if (e.type === "restored") out.push({ kind: "good", text: both("State store changelog'dan geri yüklendi", "The state store was restored from the changelog") });
  }
  if (processed.length) out.push({ kind: "change", text: both(`${processed.length} sipariş işlendi`, `${processed.length} order${processed.length > 1 ? "s" : ""} processed`) });
  if (again) out.push({ kind: "bad", text: both(`${again} sipariş ikinci kez sayıldı`, `${again} order${again > 1 ? "s" : ""} counted a second time`) });
  if (events.some((e) => e.type === "committed")) out.push({ kind: "good", text: both(`Commit: input offset ${after.committed}`, `Committed: input offset ${after.committed}`) });
  return out;
}
