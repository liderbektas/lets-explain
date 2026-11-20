import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { groupStats, simulate } from "../../engine/cluster";
import type { Action, ClusterState, SimEvent } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { PartitionStage, STAGE, type Reader } from "../../iso/PartitionStage";
import { CommitSeal, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { describeEvents } from "../shared/describe";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  base,
  commit,
  consumers,
  crash,
  deleteOldest,
  join,
  nextOrder,
  poll,
  produce,
  readerFor,
  SANDBOX_STEP,
  sandboxStart,
  seek,
  stepActions,
  TOPIC,
} from "./model";

const SLUG = "log-and-offset";

const text = {
  label: l("orders log'u bir bant, kayıtlar koli, okuyucular bayraklı karakterler", "The orders log as a belt, records as parcels, readers as characters with flags"),
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
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  legendParcel: l("kayıt (üstünde offset)", "record (offset on top)"),
  legendCancel: l("iptal event'i", "cancel event"),
  legendFlag: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  legendSeal: l("mühür = commit edilen offset", "seal = committed offset"),
  log: l("Log", "Log"),
  write: l("Sipariş yaz", "Write order"),
  retentionBtn: l("Eski 2 kaydı sil", "Delete oldest 2"),
  readOne: l("1 oku", "Read 1"),
  readAll: l("Hepsini oku", "Read all"),
  doCommit: l("Commit", "Commit"),
  doCrash: l("Çökert", "Crash"),
  doStart: l("Başlat", "Start"),
  rewind: l("Başa sar", "Rewind"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
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
  const [extra, setExtra] = useState<Action[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  // Open the first mission not yet finished, so a returning reader picks up where they were.
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);

  const sandboxRun = useMemo(() => (sandbox ? simulate(extra, sandboxStart) : null), [sandbox, extra, sandboxStart]);

  let state: ClusterState;
  let lastEvents: SimEvent[];
  let shownEvents: SimEvent[];
  if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shownEvents = sandboxRun.events.flat();
  } else {
    const start = base.startOf(step);
    state = base.run.states[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shownEvents = base.run.events.slice(start, start + cursor).flat();
  }

  const partition = state.topics[TOPIC]!.partitions[0]!;

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(
    mission && sandboxRun && mission.check({ start: sandboxStart, state, actions: extra, events: sandboxRun.events }),
  );
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(extra.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, extra.length, setMissionStars]);
  // A finished mission freezes the buttons, so the move count on the stars stays honest.
  const locked = won;
  const selectMission = (i: number | null) => {
    setMissionIndex(i);
    setExtra([]);
  };

  const pulse = sandbox ? extra.length : cursor;

  // Highlights for this moment: parcels just read (or read again).
  const marks = new Map<number, { state: ParcelState; tint?: Tint; to?: string }>();
  for (const e of lastEvents) {
    if (e.type !== "delivered") continue;
    const tint = consumers.find((c) => c.group === e.group)?.tint;
    marks.set(e.offset, { state: e.duplicate ? "dup" : "read", tint, to: e.group });
  }

  const readers: Reader[] = consumers.flatMap((c) => {
    const r = readerFor(state, c);
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
        state: !r.alive ? "crashed" : readNow ? "hop" : committedNow ? "happy" : "idle",
      } satisfies Reader,
    ];
  });

  const produced = lastEvents.some((e) => e.type === "produced");
  const before = sandbox ? sandboxStart : null;
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
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
    { swatch: <MiniCube fill="var(--peach)" />, label: t(text.legendCancel) },
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

  const act = (action: Action) => {
    if (!locked) setExtra((xs) => [...xs, action]);
  };
  const orderCount = extra.filter((a) => a.type === "produce").length;

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
      <MissionPanel
        missions={missions}
        active={missionIndex}
        onSelect={selectMission}
        moves={extra.length}
        won={won}
        best={best}
      />
      <div className={`sandbox-controls ${locked ? "is-locked" : ""}`} title={locked ? t(ui.locked) : undefined}>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.log)}
          </span>
          <button className="chip-btn is-producer" disabled={locked} onClick={() => act(produce(nextOrder(orderCount)))}>
            {t(text.write)}
          </button>
          <button
            className="chip-btn"
            disabled={locked || partition.logStartOffset >= partition.logEndOffset}
            onClick={() => act(deleteOldest(state))}
          >
            {t(text.retentionBtn)}
          </button>
        </div>
        {consumers.map((c) => {
          const alive = Boolean(state.groups[c.group]?.members.some((m) => m.id === c.member)) && !locked;
          return (
            <div className="control-row" key={c.group}>
              <span className="control-name">
                <i style={{ background: c.tint.body }} />
                {t(c.name)}
              </span>
              {/* Same buttons in the same places whether up or down, so nothing jumps. */}
              <button className="chip-btn" disabled={!alive} onClick={() => act(poll(c, 1))}>
                {t(text.readOne)}
              </button>
              <button className="chip-btn" disabled={!alive} onClick={() => act(poll(c))}>
                {t(text.readAll)}
              </button>
              <button className="chip-btn is-ok" disabled={!alive} onClick={() => act(commit(c))}>
                {t(text.doCommit)}
              </button>
              <button className="chip-btn" disabled={!alive} onClick={() => act(seek(c, partition.logStartOffset))}>
                {t(text.rewind)}
              </button>
              {alive || locked ? (
                <button className="chip-btn is-danger toggle-btn" disabled={!alive} onClick={() => act(crash(c))}>
                  {t(text.doCrash)}
                </button>
              ) : (
                <button className="chip-btn is-ok toggle-btn" onClick={() => act(join(c))}>
                  {t(text.doStart)}
                </button>
              )}
            </div>
          );
        })}
        <div className="control-row">
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra([])}>
            <Icon name="reset" size={15} /> {t(text.reset)}
          </button>
        </div>
      </div>
      {eventList}
    </div>
  ) : null;

  return (
    <SceneFrame
      metrics={metrics}
      controls={controls}
      legend={legend}
      paused={paused}
      width={STAGE.width}
      height={STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      <PartitionStage
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

function MiniCube({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-7,-4 0,0 0,7 -7,3" style={{ fill }} />
      <polygon points="0,0 7,-4 7,3 0,7" style={{ fill }} opacity="0.75" />
      <polygon points="-7,-4 0,-8 7,-4 0,0" style={{ fill }} />
    </g>
  );
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
