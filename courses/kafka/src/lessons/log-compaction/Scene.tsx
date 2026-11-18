import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { allRecords, recordCount, simulateStorage, type StorageEvent, type StorageLog } from "../../engine/storage";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { InfoCard, SEGMENT_STAGE, SegmentStage } from "../../iso/SegmentStage";
import { TINTS } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { describeStorage } from "../shared/describeStorage";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { base, moveAction, people, personFor, SANDBOX_STEP, sandboxStart, stepBeats, tableOf, type SandboxMove } from "./model";
import "../segments-and-retention/scene.css";

const SLUG = "log-compaction";

const text = {
  label: l(
    "Sıkıştırılan bir topic: segment tepsileri, üstlerinde key'i yazan kayıt kolileri, sağ üstte baştan okuyanın göreceği tablo",
    "A compacted topic: segment trays with parcels tagged by key, and at the top right the table a reader from the start would see",
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
  legendTray: l("tepsi = bir segment", "tray = one segment"),
  write: l("yaz", "write"),
  del: l("sil", "delete"),
  rowWrite: l("Yeni adres", "New address"),
  rowDelete: l("Tombstone", "Tombstone"),
  rowBroker: l("Broker", "Broker"),
  runCleaner: l("Cleaner'ı çalıştır", "Run the cleaner"),
  wait: l("+2 gün", "+2 days"),
  note: l("Cleaner sadece kapalı segment'lere bakar.", "The cleaner only looks at closed segments."),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};

export function LogCompactionScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [moves, setMoves] = useState<SandboxMove[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const count = sandbox ? 0 : stepBeats[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);

  const actions = useMemo(() => moves.map((m, i) => moveAction(m, i)), [moves]);
  const sandboxRun = useMemo(() => (sandbox ? simulateStorage(actions, sandboxStart) : null), [sandbox, actions]);

  let log: StorageLog;
  let lastEvents: StorageEvent[];
  let shownEvents: StorageEvent[];
  if (sandboxRun) {
    log = sandboxRun.logs[sandboxRun.logs.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shownEvents = sandboxRun.events.flat();
  } else {
    const start = base.startOf(step);
    log = base.run.logs[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shownEvents = base.run.events.slice(start, start + cursor).flat();
  }

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && sandboxRun && mission.check({ start: sandboxStart, log, actions, events: sandboxRun.events }));
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(moves.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, moves.length, setMissionStars]);
  const locked = won;
  const selectMission = (i: number | null) => {
    setMissionIndex(i);
    setMoves([]);
  };
  const act = (m: SandboxMove) => {
    if (!locked) setMoves((xs) => [...xs, m]);
  };

  const pulse = sandbox ? moves.length : cursor;
  const produced = lastEvents.some((e) => e.type === "appended");
  const cleanedNow = lastEvents.some((e) => e.type === "compacted");

  const notes: { offset: number; text: string; tone?: "danger" | "sun" | "ok" }[] = [];
  if (!sandbox && step === 1 && cursor >= 1) notes.push({ offset: 2, text: t(text.wouldGo), tone: "danger" });
  if (!sandbox && step === 3 && cursor >= 1) notes.push({ offset: 2, text: t(text.stays), tone: "sun" });
  if (!sandbox && step === 5 && cursor >= 1) notes.push({ offset: 10, text: t(text.tombstone), tone: "danger" });

  const records = allRecords(log);
  const metrics: Metric[] = [
    { label: t(text.day), value: log.time },
    { label: t(text.onLog), value: recordCount(log) },
    { label: t(text.written), value: log.logEndOffset },
    { label: t(text.cleaned), value: log.logEndOffset - records.length, tone: cleanedNow ? "ok" : "plain" },
  ];

  const legend: LegendItem[] = [
    ...people.map((p) => ({ swatch: <MiniCube fill={p.tint.body} />, label: t(p.name) })),
    { swatch: <MiniCube fill="#efe7d8" />, label: t(text.legendTomb) },
    { swatch: <MiniTray fill="#f6efe2" />, label: t(text.legendTray) },
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
      <MissionPanel missions={missions} active={missionIndex} onSelect={selectMission} moves={moves.length} won={won} best={best} />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.rowWrite)}
          </span>
          {people.map((p) => (
            <button key={p.key} className="chip-btn is-producer" disabled={locked} onClick={() => act(`w-${p.key}` as SandboxMove)}>
              {t(p.name)} {t(text.write)}
            </button>
          ))}
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "#d8d2dc" }} />
            {t(text.rowDelete)}
          </span>
          {people.map((p) => (
            <button key={p.key} className="chip-btn is-danger" disabled={locked} onClick={() => act(`d-${p.key}` as SandboxMove)}>
              {t(p.name)} {t(text.del)}
            </button>
          ))}
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sun)" }} />
            {t(text.rowBroker)}
          </span>
          <button className="chip-btn is-ok" disabled={locked} onClick={() => act("compact")}>
            {t(text.runCleaner)}
          </button>
          <button className="chip-btn" disabled={locked} onClick={() => act("wait")}>
            {t(text.wait)}
          </button>
        </div>
        <p className="control-note">{t(text.note)}</p>
        <div className="control-row">
          <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves([])}>
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
