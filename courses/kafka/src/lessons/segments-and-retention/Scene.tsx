import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { fileName, recordCount, segmentFor, type StorageEvent, type StorageLog } from "../../engine/storage";
import { replayS, sCtx, storageShell } from "../../engine/storageCli";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { InfoCard, SEGMENT_STAGE, SegmentStage } from "../../iso/SegmentStage";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { describeStorage } from "../shared/describeStorage";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { TypedFooter, useTypedKit } from "../cluster-kit/kit";
import "./scene.css";
import { base, LOOKUPS, SANDBOX_STEP, stepBeats, SURVIVOR, SURVIVOR_STEP } from "./model";
import { FREE, scenarios } from "./scenarios";

const SLUG = "segments-and-retention";

const text = {
  label: l(
    "Bir partition'ın log'u: segment tepsileri, üstlerinde kayıt kolileri, solda retention öğütücüsü",
    "A partition's log: segment trays with record parcels on them, the retention shredder on the left",
  ),
  producer: l("Sipariş servisi", "Order service"),
  consumer: l("Consumer", "Consumer"),
  segment: (b: number) => l(`segment ${b}`, `segment ${b}`),
  active: l("aktif", "active"),
  closed: l("kapalı", "closed"),
  age: (d: number) => l(`en yeni kayıt: ${d} gün`, `newest record: ${d} d`),
  empty: l("boş", "empty"),
  shredder: l("retention", "retention"),
  hidden: (n: number) => l(`+${n} eski segment`, `+${n} older segments`),
  files: l("orders-0/ klasörü", "orders-0/ folder"),
  day: l("Gün", "Day"),
  segments: l("Segment", "Segments"),
  start: l("Log başı (offset)", "Log start (offset)"),
  records: l("Kayıt", "Records"),
  ask: (o: number) => l(`offset ${o}?`, `offset ${o}?`),
  missing: (o: number, start: number) => l(`offset ${o} silinmiş → ${start}`, `offset ${o} is gone → ${start}`),
  survivor: (d: number) => l(`${d} günlük ama duruyor`, `${d} days old, still here`),
  legendParcel: l("kayıt (üstünde offset)", "record (offset on top)"),
  legendOld: l("retention'dan eski kayıt", "record older than retention"),
  legendTray: l("tepsi = bir segment dosyası", "tray = one segment file"),
  legendActive: l("turuncu tepsi = aktif segment", "orange tray = active segment"),
};

export function SegmentsScene({ step, paused, replayKey, controls }: SceneProps) {
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

  const retention = log.config.retentionDays ?? Infinity;
  const showAge = step >= 4;
  const pulse = typed ? typed.pulse : cursor;
  const produced = lastEvents.some((e) => e.type === "appended");

  // Pictures that belong to a step rather than to the log: a reader asking for an offset, a note.
  const lookupOffset = !sandbox && cursor >= 1 ? LOOKUPS[step] : undefined;
  const lookup =
    lookupOffset === undefined
      ? null
      : {
          offset: lookupOffset,
          name: t(text.consumer),
          ask: t(text.ask(lookupOffset)),
          missing: t(text.missing(lookupOffset, log.logStartOffset)),
        };
  const lookupSegment = lookupOffset !== undefined ? segmentFor(log, lookupOffset) : null;
  const survivor = log.segments.flatMap((s) => s.records).find((r) => r.offset === SURVIVOR);
  const notes =
    step === SURVIVOR_STEP && cursor >= 1 && survivor
      ? [{ offset: SURVIVOR, text: t(text.survivor(log.time - survivor.time)), tone: "danger" as const }]
      : [];

  const metrics: Metric[] = [
    { label: t(text.day), value: Math.round(log.time * 10) / 10 },
    { label: t(text.segments), value: log.segments.length },
    { label: t(text.start), value: log.logStartOffset },
    { label: t(text.records), value: recordCount(log) },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
    ...(showAge ? [{ swatch: <MiniCube fill="var(--peach)" />, label: t(text.legendOld) }] : []),
    { swatch: <MiniTray fill="#f6efe2" />, label: t(text.legendTray) },
    { swatch: <MiniTray fill="var(--tangerine)" />, label: t(text.legendActive) },
  ];

  const lines = describeStorage(shownEvents, lang);
  const footer = typed ? <TypedFooter view={typed} lines={lines} /> : null;

  const fileRows = step >= 2 ? log.segments.slice(-4).map((s) => ({ text: `${fileName(s.base)}  .log .index .timeindex`, tone: s === log.segments[log.segments.length - 1] ? ("strong" as const) : ("plain" as const) })) : [];

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
        shadesOf={(r) => (showAge && log.time - r.time > retention ? "cancel" : "order")}
        highlight={lookupSegment ? [lookupSegment.base] : []}
        labels={{
          segment: (b) => t(text.segment(b)),
          active: t(text.active),
          closed: t(text.closed),
          age: (d) => t(text.age(d)),
          empty: t(text.empty),
          shredder: t(text.shredder),
          hidden: (n) => t(text.hidden(n)),
        }}
        showAge={showAge}
        producerName={t(text.producer)}
        producerState={produced ? "hop" : "idle"}
        producerPulse={pulse}
        lookup={lookup}
        notes={notes}
      >
        {fileRows.length > 0 && <InfoCard x={520} y={12} width={326} title={t(text.files)} rows={fileRows} />}
      </SegmentStage>
    </SceneFrame>
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

function MiniTray({ fill }: { fill: string }) {
  return <polygon points="-10,0 0,-5 10,0 0,5" style={{ fill }} stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />;
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before = base.run.logs[base.startOf(step)]!;
  const after = base.run.logs[base.ends[step]!]!;
  const out: Change[] = [];

  if (step === 0) out.push({ kind: "add", text: both("`orders-0` klasöründe tek bir segment var", "The `orders-0` folder holds a single segment") });
  if (after.time > before.time) out.push({ kind: "change", text: both(`Gün ${before.time} → ${after.time}`, `Day ${before.time} → ${after.time}`) });
  if (after.logEndOffset > before.logEndOffset) {
    const n = after.logEndOffset - before.logEndOffset;
    const r = range(before.logEndOffset, after.logEndOffset - 1);
    out.push({ kind: "add", text: both(`+${n} kayıt yazıldı (offset ${r})`, `+${n} record${n > 1 ? "s" : ""} written (offset ${r})`) });
  }
  const beforeBases = new Set(before.segments.map((s) => s.base));
  const afterBases = new Set(after.segments.map((s) => s.base));
  for (const s of after.segments) {
    if (!beforeBases.has(s.base)) out.push({ kind: "add", text: both(`Yeni segment açıldı: \`${fileName(s.base)}.log\``, `New segment rolled: \`${fileName(s.base)}.log\``) });
  }
  for (const s of before.segments) {
    if (!afterBases.has(s.base)) {
      const r = s.records.length ? ` (offset ${range(s.records[0]!.offset, s.records[s.records.length - 1]!.offset)})` : "";
      out.push({ kind: "remove", text: both(`Segment ${s.base} bütünüyle silindi${r}`, `Segment ${s.base} deleted as a whole${r}`) });
    }
  }
  if (after.logStartOffset > before.logStartOffset) {
    out.push({ kind: "change", text: both(`Log artık offset ${after.logStartOffset} ile başlıyor`, `The log now starts at offset ${after.logStartOffset}`) });
  }
  if (after.config.retentionRecords !== before.config.retentionRecords && after.config.retentionRecords !== null) {
    out.push({ kind: "change", text: both(`Boyut sınırı kondu: en fazla ${after.config.retentionRecords} kayıt`, `Size limit set: at most ${after.config.retentionRecords} records`) });
  }
  if (step === 3) out.push({ kind: "good", text: both("Offset 4, segment 3'te bulundu: 3 ≤ 4 < 6", "Offset 4 found in segment 3: 3 ≤ 4 < 6") });
  if (step === SURVIVOR_STEP) out.push({ kind: "bad", text: both("Offset 6 retention'dan eski ama hâlâ diskte", "Offset 6 is older than retention but still on disk") });
  if (step === 7) out.push({ kind: "bad", text: both("Offset 2 yok: consumer auto.offset.reset ile 6'ya atlar", "Offset 2 is gone: the consumer jumps to 6 via auto.offset.reset") });
  return out;
}
