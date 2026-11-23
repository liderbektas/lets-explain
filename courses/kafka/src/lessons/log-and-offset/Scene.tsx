import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { kafkaShell, replayShell, type KafkaBox, type ShellAction } from "../../engine/cli";
import { groupStats } from "../../engine/cluster";
import type { ClusterState, SimEvent } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { MiniWagon, RAIL_STAGE, RailStage, type Reader } from "../../iso/RailStage";
import { CommitSeal, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { describeEvents } from "../shared/describe";
import { kafkaCtx } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { FREE, scenarios } from "./scenarios";
import { base, consumers, P, readerFor, SANDBOX_STEP, stepActions, TOPIC, type ConsumerDef } from "./model";

const SLUG = "log-and-offset";

const text = {
  label: l("orders log'u bir ray, kayıtlar numaralı vagonlar, okuyucular bayraklı karakterler", "The orders log as a railway track, records as numbered wagons, readers as characters with flags"),
  producer: l("Sipariş servisi", "Order service"),
  next: l("sıradaki", "next"),
  retention: l("retention", "retention"),
  onLog: l("Log'daki kayıt", "Records on log"),
  lag: l("lag", "lag"),
  again: l("Tekrar okunan", "Read again"),
  missed: l("Kaçırılan", "Missed"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir komut yaz; log'da ne olduğunu burada sade bir dille gör.", "Type a command; see what happened on the log here, in plain words."),
  legendParcel: l("kayıt = vagon (yanında offset)", "record = wagon (offset on its side)"),
  legendCancel: l("iptal event'i", "cancel event"),
  legendFlag: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  legendSeal: l("mühür = commit edilen offset", "seal = committed offset"),
  yours: l("(senin)", "(yours)"),
};

function cellKind(value: string): "order" | "cancel" {
  return value.startsWith("cancel:") ? "cancel" : "order";
}

function valueText(value: string, lang: Lang) {
  const [kind, id] = value.split(":");
  const word = kind === "cancel" ? (lang === "tr" ? "iptal" : "cancel") : lang === "tr" ? "sipariş" : "order";
  return `${word} ${id}`;
}

export function LogAndOffsetScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const box = useTypedSandbox({
    slug: SLUG,
    active: sandbox,
    scenarios,
    freeStart: FREE,
    shell: kafkaShell,
    replay: (start: KafkaBox, actions: ShellAction[]) => replayShell(start, actions),
    final: (r) => r.boxes[r.boxes.length - 1]!,
    context: (start, _actions, r) => kafkaCtx(start, r),
  });

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);

  let state: ClusterState;
  let lastEvents: SimEvent[];
  let shownEvents: SimEvent[];
  if (box.run) {
    state = box.run.boxes[box.run.boxes.length - 1]!.cluster;
    const withEvents = box.run.events.filter((e) => e.length > 0);
    lastEvents = withEvents[withEvents.length - 1] ?? [];
    shownEvents = box.run.events.flat();
  } else {
    const start = base.startOf(step);
    state = base.run.states[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shownEvents = base.run.events.slice(start, start + cursor).flat();
  }

  const partition = state.topics[TOPIC]!.partitions[0]!;

  const pulse = box.run ? box.run.events.length : cursor;

  // Highlights for this moment: wagons just read (or read again).
  const marks = new Map<number, { state: ParcelState; tint?: Tint; to?: string }>();
  for (const e of lastEvents) {
    if (e.type !== "delivered") continue;
    const tint = consumers.find((c) => c.group === e.group)?.tint;
    marks.set(e.offset, { state: e.duplicate ? "dup" : "read", tint, to: e.group });
  }

  const readers: Reader[] = consumers.flatMap((c) => {
    const r = sandbox ? typedReader(state, c, shownEvents) : readerFor(state, c);
    if (!r) return [];
    const readNow = lastEvents.some((e) => e.type === "delivered" && e.group === c.group);
    const committedNow = lastEvents.some((e) => e.type === "committed" && e.group === c.group);
    return [
      {
        id: c.group,
        name: t(c.name),
        tint: c.tint,
        position: r.position,
        committed: r.committed,
        pulse,
        state: !r.alive ? ("crashed" in r && !r.crashed ? "idle" : "crashed") : readNow ? "hop" : committedNow ? "happy" : "idle",
      } satisfies Reader,
    ];
  });

  const produced = lastEvents.some((e) => e.type === "produced");
  const before = sandbox ? box.start.cluster : null;
  const statsOf = (group: string) => {
    const now = groupStats(state, group);
    if (!before) return now;
    const was = groupStats(before, group);
    return { ...now, duplicates: now.duplicates - was.duplicates, skipped: now.skipped - was.skipped };
  };
  const dupTotal = consumers.reduce((sum, c) => sum + statsOf(c.group).duplicates, 0);
  const skippedTotal = consumers.reduce((sum, c) => sum + statsOf(c.group).skipped, 0);

  const metrics: Metric[] = [
    { label: t(text.onLog), value: partition.records.length },
    ...consumers.map((c) => ({
      label: `${t(c.name)} ${t(text.lag)}`,
      value: state.groups[c.group] ? statsOf(c.group).lag : "—",
      dot: c.tint.body,
    })),
    {
      label: `${t(text.again)}${sandbox ? ` ${t(text.yours)}` : ""}`,
      value: dupTotal,
      tone: dupTotal > 0 ? "danger" : "plain",
    },
  ];
  if (sandbox || skippedTotal > 0) {
    metrics.push({
      label: `${t(text.missed)}${sandbox ? ` ${t(text.yours)}` : ""}`,
      value: skippedTotal,
      tone: skippedTotal > 0 ? "danger" : "plain",
    });
  }

  const legend: LegendItem[] = [
    { swatch: <MiniWagon kind="order" />, label: t(text.legendParcel) },
    { swatch: <MiniWagon kind="cancel" />, label: t(text.legendCancel) },
    {
      swatch: (
        <g transform="translate(-6 5)">
          <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
          <path d="M0 -15h12l-2 3 2 3H0z" fill="var(--coral)" className="ink" />
        </g>
      ),
      label: t(text.legendFlag),
    },
    {
      swatch: (
        <g transform="translate(0 -3) scale(0.62)">
          <CommitSeal tint={TINTS.coral} label="" />
        </g>
      ),
      label: t(text.legendSeal),
    },
  ];

  const names = {
    group: (id: string) => t(consumers.find((c) => c.group === id)?.name ?? l(id, id)),
    value: (v: string) => valueText(v, lang),
  };
  const lines = describeEvents(shownEvents, lang, names);

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
      {box.panel}
      {box.terminal}
      {eventList}
    </div>
  ) : null;

  return (
    <SceneFrame
      metrics={metrics}
      controls={controls}
      legend={legend}
      paused={paused}
      width={RAIL_STAGE.width}
      height={RAIL_STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      <RailStage
        partition={partition}
        readers={readers}
        producerName={t(text.producer)}
        producerState={produced ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={cellKind}
        labels={{ next: t(text.next), retention: t(text.retention) }}
      />
    </SceneFrame>
  );
}

/**
 * A reader in the terminal is whichever console consumer is in its group right now. When none
 * is, the group still has its committed offset: drawn at rest, or crashed if `kill -9` ended it.
 */
function typedReader(state: ClusterState, c: ConsumerDef, events: SimEvent[]) {
  const group = state.groups[c.group];
  if (!group) return null;
  const member = group.members[0];
  const left = [...events].reverse().find((e) => e.type === "memberLeft" && e.group === c.group);
  return {
    alive: Boolean(member),
    crashed: !member && Boolean(left && left.type === "memberLeft" && left.crashed),
    position: member ? (member.positions[P] ?? group.committed[P]) : group.committed[P],
    committed: group.committed[P],
  };
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before = base.run.states[base.startOf(step)]!;
  const after = base.run.states[base.ends[step]!]!;
  const out: Change[] = [];

  const pb = before.topics[TOPIC]?.partitions[0];
  const pa = after.topics[TOPIC]!.partitions[0]!;
  if (step === 0) out.push({ kind: "add", text: both("`orders` adında boş bir log var", "There is an empty log called `orders`") });
  const oldEnd = pb?.logEndOffset ?? 0;
  if (pa.logEndOffset > oldEnd) {
    const n = pa.logEndOffset - oldEnd;
    const r = range(oldEnd, pa.logEndOffset - 1);
    out.push({ kind: "add", text: both(`+${n} kayıt yazıldı (offset ${r})`, `+${n} record${n > 1 ? "s" : ""} written (offset ${r})`) });
  }
  if (pb && pa.logStartOffset > pb.logStartOffset) {
    const r = range(pb.logStartOffset, pa.logStartOffset - 1);
    out.push({ kind: "remove", text: both(`Offset ${r} silindi (retention)`, `Offset ${r} deleted (retention)`) });
    out.push({ kind: "change", text: both(`Log artık offset ${pa.logStartOffset} ile başlıyor`, `The log now starts at offset ${pa.logStartOffset}`) });
  }

  for (const c of consumers) {
    const rb = readerFor(before, c);
    const ra = readerFor(after, c);
    if (!ra) continue;
    const tr = c.name.tr;
    const en = c.name.en;
    if (!rb) out.push({ kind: "good", text: both(`${tr} okumaya başladı`, `${en} started reading`) });
    if (rb?.alive && !ra.alive) out.push({ kind: "bad", text: both(`${tr} çöktü, aklındaki yer kayboldu`, `${en} crashed and forgot its place`) });
    if (rb && !rb.alive && ra.alive) out.push({ kind: "good", text: both(`${tr} yeniden başladı`, `${en} restarted`) });
    if (ra.alive && rb?.position !== ra.position && ra.position !== undefined) {
      const from = rb?.position ?? "—";
      out.push({ kind: "change", text: both(`${tr} bayrağı: ${from} → ${ra.position}`, `${en}'s flag: ${from} → ${ra.position}`) });
    }
    if (ra.committed !== rb?.committed && ra.committed !== undefined) {
      out.push({ kind: "good", text: both(`${tr} commit etti: ${ra.committed}`, `${en} committed: ${ra.committed}`) });
    }
    const dups = groupStats(after, c.group).duplicates - groupStats(before, c.group).duplicates;
    if (dups > 0) {
      out.push({ kind: "bad", text: both(`${tr} ${dups} kaydı ikinci kez okudu`, `${en} read ${dups} record${dups > 1 ? "s" : ""} a second time`) });
    }
  }
  return out;
}
