import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { allRecords, recordCount, type StorageEvent, type StorageLog } from "../../engine/storage";
import { replayS, sCtx, storageShell } from "../../engine/storageCli";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { InfoCard, SEGMENT_STAGE, SegmentStage } from "../../iso/SegmentStage";
import { MiniWagon, WAGON_SHADES } from "../../iso/rail";
import { TINTS } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { describeStorage } from "../shared/describeStorage";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { TypedFooter, useTypedKit } from "../cluster-kit/kit";
import { base, people, personFor, SANDBOX_STEP, stepBeats, tableOf } from "./model";
import { FREE, scenarios } from "./scenarios";
import "../segments-and-retention/scene.css";

const SLUG = "log-compaction";

const text = {
  label: l(
    "Sıkıştırılan bir topic: her segment bir tren, vagonların üstünde key'leri, sağ üstte baştan okuyanın göreceği tablo",
    "A compacted topic: each segment a train of wagons tagged by key, and at the top right the table a reader from the start would see",
  ),
  producer: l("Üyelik servisi", "Accounts service"),
  segment: (b: number) => l(`segment ${b}`, `segment ${b}`),
  active: l("aktif", "active"),
  closed: l("kapalı", "closed"),
  shredder: l("cleaner", "cleaner"),
  hidden: (n: number) => l(`+${n} eski segment`, `+${n} older segments`),
  table: l("Baştan okuyan ne görür?", "What a reader from the start sees"),
  gone: l("(silindi)", "(deleted)"),
  none: l("—", "—"),
  day: l("Gün", "Day"),
  onLog: l("Log'daki kayıt", "Records on log"),
  written: l("Yazılan", "Written"),
  cleaned: l("Temizlenen", "Cleaned"),
  wouldGo: l("retention bunu da silerdi", "retention would delete this too"),
  stays: l("yenisi aktif segment'te", "the newer one is in the active segment"),
  tombstone: l("tombstone", "tombstone"),
  legendTomb: l("tombstone (value = null)", "tombstone (value = null)"),
  legendTray: l("tren = bir segment", "train = one segment"),
};

export function LogCompactionScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const count = sandbox ? 0 : stepBeats[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);
  // The try-it step is typed: the terminal runs Kafka's tools on the broker's disk.
  const typed = useTypedKit({ slug: SLUG, active: sandbox, scenarios, freeStart: FREE, shell: storageShell, replay: replayS, context: sCtx, stateOf: (b) => b.log });

  let log: StorageLog;
  let lastEvents: StorageEvent[];
  let shownEvents: StorageEvent[];
  if (typed) {
    log = typed.state;
    lastEvents = typed.lastEvents;
    shownEvents = typed.shownEvents;
  } else {
    const start = base.startOf(step);
    log = base.run.logs[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shownEvents = base.run.events.slice(start, start + cursor).flat();
  }

  const pulse = typed ? typed.pulse : cursor;
  const produced = lastEvents.some((e) => e.type === "appended");
  const cleanedNow = lastEvents.some((e) => e.type === "compacted");

  const notes: { offset: number; text: string; tone?: "danger" | "sun" | "ok" }[] = [];
  if (!sandbox && step === 1 && cursor >= 1) notes.push({ offset: 2, text: t(text.wouldGo), tone: "danger" });
  if (!sandbox && step === 3 && cursor >= 1) notes.push({ offset: 2, text: t(text.stays), tone: "sun" });
  if (!sandbox && step === 5 && cursor >= 1) notes.push({ offset: 10, text: t(text.tombstone), tone: "danger" });

  const records = allRecords(log);
  const metrics: Metric[] = [
    { label: t(text.day), value: Math.round(log.time * 10) / 10 },
    { label: t(text.onLog), value: recordCount(log) },
    { label: t(text.written), value: log.logEndOffset },
    { label: t(text.cleaned), value: log.logEndOffset - records.length, tone: cleanedNow ? "ok" : "plain" },
  ];

  const legend: LegendItem[] = [
    ...people.map((p) => ({ swatch: <MiniWagon shades={WAGON_SHADES[p.shades]} />, label: t(p.name) })),
    { swatch: <MiniWagon kind="neutral" />, label: t(text.legendTomb) },
    { swatch: <MiniSegment fill="#e6dac4" />, label: t(text.legendTray) },
  ];

  const table = tableOf(log);
  const tableRows = people.map((p) => {
    const value = table.get(p.key);
    const hasTombstone = records.some((r) => r.key === p.key && r.value === null);
    const name = t(p.name).padEnd(4, " ");
    if (value) return { text: `${name} → ${value}`, tone: "strong" as const };
    return { text: `${name} → ${hasTombstone ? t(text.gone) : t(text.none)}`, tone: "gone" as const };
  });

  const lines = describeStorage(shownEvents, lang, (key) => {
    const p = personFor(key);
    return p ? t(p.name) : null;
  });
  const footer = typed ? <TypedFooter view={typed} lines={lines} /> : null;

  return (
    <SceneFrame
      metrics={metrics}
      controls={controls}
      legend={legend}
      paused={paused}
      width={SEGMENT_STAGE.width}
      height={SEGMENT_STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      <SegmentStage
        log={log}
        shadesOf={(r) => (r.value === null ? "neutral" : (personFor(r.key)?.shades ?? "order"))}
        tagOf={(r) => {
          const p = personFor(r.key);
          if (!p) return null;
          const initial = t(p.name).charAt(0);
          return r.value === null ? { text: `${initial}✕`, tint: TINTS.grey } : { text: initial, tint: p.tint };
        }}
        labels={{
          segment: (b) => t(text.segment(b)),
          active: t(text.active),
          closed: t(text.closed),
          age: () => "",
          empty: "",
          shredder: t(text.shredder),
          hidden: (n) => t(text.hidden(n)),
        }}
        head="cleaner"
        producerName={t(text.producer)}
        producerState={produced ? "hop" : "idle"}
        producerPulse={pulse}
        notes={notes}
      >
        <InfoCard x={600} y={12} width={246} title={t(text.table)} rows={tableRows} />
      </SegmentStage>
    </SceneFrame>
  );
}



/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });
const list = (xs: number[]) => xs.join(", ");

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before = base.run.logs[base.startOf(step)]!;
  const after = base.run.logs[base.ends[step]!]!;
  const events = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const out: Change[] = [];

  if (after.time > before.time) out.push({ kind: "change", text: both(`Gün ${before.time} → ${after.time}`, `Day ${before.time} → ${after.time}`) });
  for (const e of events) {
    if (e.type === "appended") {
      const p = personFor(e.key)!;
      const rec = allRecords(base.run.logs[base.ends[step]!]!).find((r) => r.offset === e.offset);
      const value = rec?.value ?? null;
      out.push(
        e.tombstone
          ? { kind: "bad", text: both(`Tombstone: ${p.name.tr} silindi (offset ${e.offset})`, `Tombstone: ${p.name.en} deleted (offset ${e.offset})`) }
          : { kind: "add", text: both(`${p.name.tr}${value ? ` → ${value}` : ""} (offset ${e.offset})`, `${p.name.en}${value ? ` → ${value}` : ""} (offset ${e.offset})`) },
      );
    }
    if (e.type === "rolled") out.push({ kind: "add", text: both(`Yeni segment açıldı: segment ${e.base}`, `New segment rolled: segment ${e.base}`) });
    if (e.type === "compacted") {
      if (e.removed.length) out.push({ kind: "remove", text: both(`Cleaner eski değerleri sildi: offset ${list(e.removed)}`, `The cleaner removed old values: offset ${list(e.removed)}`) });
      if (e.tombstonesRemoved.length)
        out.push({ kind: "remove", text: both(`Tombstone gitti: offset ${list(e.tombstonesRemoved)}`, `Tombstone removed: offset ${list(e.tombstonesRemoved)}`) });
      if (e.merged.length) out.push({ kind: "change", text: both(`Küçülen segment birleşti: ${list(e.merged)} → ${after.segments[0]!.base}`, `Shrunken segment merged: ${list(e.merged)} → ${after.segments[0]!.base}`) });
    }
    if (e.type === "nothingToDo" && e.what === "compact") out.push({ kind: "change", text: both("Cleaner temizleyecek bir şey bulamadı", "The cleaner found nothing to clean") });
  }
  if (step === 1) out.push({ kind: "bad", text: both("Silme politikasıyla 7 gün sonra Can'ın tek adresi de giderdi", "With the delete policy, Can's only address would be gone after 7 days") });
  if (step === 3) out.push({ kind: "good", text: both("Offset'ler aynı kaldı: 2, 4, 5. Aradaki boşluklar normal", "Offsets stayed the same: 2, 4, 5. The gaps are normal") });
  if (step === 7) out.push({ kind: "good", text: both("Baştan okuyan biri her key'in son değerini alıyor", "A reader from the start gets every key's latest value") });
  return out;
}

/** Legend swatch for a segment: a short stretch of track with its ballast tinted. */
function MiniSegment({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.3" strokeLinejoin="round">
      <polygon points="-12,1 0,-5 12,1 0,7" style={{ fill }} />
      <line x1={-7} y1={-0.5} x2={5} y2={5.5} stroke="#7d5d3d" />
      <line x1={-3} y1={-2.5} x2={9} y2={3.5} stroke="#6d6976" strokeWidth={2} />
      <line x1={-9} y1={0.5} x2={3} y2={6.5} stroke="#6d6976" strokeWidth={2} />
    </g>
  );
}
