import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { Parcel, Pill, type PillTone } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import type { EventLine } from "../shared/describe";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { BeltsStage, beltsGeometry, STAGE, type BeltPartition, type BeltReader, type ParcelKind } from "./BeltsStage";
import { missions } from "./missions";
import {
  base,
  CONSUMERS,
  MAX_PARTITIONS,
  ownerOf,
  RETRY_STEPS,
  SANDBOX_STEP,
  sandboxStart,
  simulate,
  STAGES,
  stepActions,
  violations,
  type OAction,
  type OEvent,
  type OState,
} from "./model";
import "./scene.css";

const SLUG = "ordering";

export const ORDER_KIND: Record<string, ParcelKind> = { "1042": "order", "1043": "payment", "1045": "cancel", "1048": "neutral" };

const stageName: L[] = [
  l("", ""),
  l("oluşturuldu", "created"),
  l("ödendi", "paid"),
  l("kargolandı", "shipped"),
];

const text = {
  label: l(
    "orders topic'inin partition'ları bant olarak, olaylar koli olarak; kargo consumer'ları bantların başında",
    "The orders topic's partitions as belts, events as parcels; shipping consumers at the near end",
  ),
  producer: l("Sipariş servisi", "Order service"),
  next: l("sıradaki", "next"),
  written: l("Yazılan olay", "Events written"),
  handled: l("İşlenen", "Handled"),
  broken: l("Sırası bozulan", "Out of order"),
  partitions: l("Partition", "Partitions"),
  handledOrder: l("İşlenme sırası", "Order handled"),
  nothingYet: l("Henüz işlenen yok", "Nothing handled yet"),
  legendColor: l("renk = hangi sipariş", "colour = which order"),
  legendNumber: l("üstteki sayı: 1 oluşturuldu · 2 ödendi · 3 kargolandı", "number on top: 1 created · 2 paid · 3 shipped"),
  legendOffset: l("alttaki sayı = offset", "number below = offset"),
  legendFlag: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  outOfOrder: l("sıra bozuldu!", "out of order!"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  producerRow: l("Yaz", "Write"),
  nextEvent: l("sıradaki olay", "next event"),
  allWritten: l("üç olay da yazıldı", "all three written"),
  withKey: l("key ile", "with key"),
  noKey: l("key'siz", "no key"),
  addPartition: l("Partition ekle", "Add partition"),
  readersRow: l("Oku", "Read"),
  read: l("oku", "read"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  yours: l("(senin)", "(yours)"),
};

const tl = (lang: Lang, s: L) => s[lang];
const consumerName = (id: string, lang: Lang) => tl(lang, CONSUMERS.find((c) => c.id === id)?.name ?? l(id, id));
const eventName = (order: string, stage: number, lang: Lang) => `${order} · ${stage} (${tl(lang, stageName[stage]!)})`;

export function describe(events: OEvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  return events.map((e): EventLine => {
    switch (e.type) {
      case "written": {
        const how = e.keyed ? (tr ? "key ile" : "with key") : tr ? "key'siz" : "no key";
        let line = tr
          ? `Yazıldı (${how}): ${eventName(e.order, e.stage, lang)} → partition ${e.partition}, offset ${e.offset}`
          : `Written (${how}): ${eventName(e.order, e.stage, lang)} → partition ${e.partition}, offset ${e.offset}`;
        if (e.moved) line += tr ? ` · ${e.order}'in önceki olayları başka partition'da` : ` · ${e.order}'s earlier events are in another partition`;
        return { text: line, tone: e.moved ? "bad" : "produce" };
      }
      case "partitionAdded": {
        const who = Object.entries(e.assignment)
          .map(([id, ps]) => `${consumerName(id, lang)}: ${ps.length ? ps.map((p) => `p${p}`).join(", ") : "—"}`)
          .join(" · ");
        return {
          text: tr ? `Partition eklendi, artık ${e.count}. Rebalance → ${who}` : `Partition added, now ${e.count}. Rebalance → ${who}`,
          tone: "ok",
        };
      }
      case "processed": {
        const who = consumerName(e.by, lang);
        let line = tr ? `${who} işledi: ${eventName(e.order, e.stage, lang)}` : `${who} handled ${eventName(e.order, e.stage, lang)}`;
        if (e.outOfOrder) line += tr ? ` · ama ${e.order}'in önceki bir olayı henüz işlenmedi: sıra bozuldu!` : ` · but an earlier ${e.order} event is not handled yet: out of order!`;
        return { text: line, tone: e.outOfOrder ? "bad" : "read" };
      }
      case "nothing":
        return { text: tr ? `${consumerName(e.consumer, lang)}: okunacak olay yok` : `${consumerName(e.consumer, lang)}: nothing to read`, tone: "plain" };
    }
  });
}

function beltPartitions(state: OState, lastEvents: OEvent[]): BeltPartition[] {
  return state.partitions.map((records, i) => {
    const owner = ownerOf(state, i);
    const position = records.length === 0 ? undefined : nextOffsetFor(state, i);
    return {
      logStart: 0,
      logEnd: records.length,
      records: records.map((r) => {
        const justRead = lastEvents.find((e) => e.type === "processed" && e.partition === i && e.offset === r.offset);
        const handled = state.processed.some((x) => x.partition === i && x.offset === r.offset);
        return {
          offset: r.offset,
          label: String(r.stage),
          kind: ORDER_KIND[r.order] ?? "neutral",
          state: justRead ? (justRead.type === "processed" && justRead.outOfOrder ? "normal" : "read") : handled ? "dim" : "normal",
          tint: owner?.tint,
          alert: Boolean(justRead && justRead.type === "processed" && justRead.outOfOrder),
        };
      }),
      position,
      ownerTint: owner?.tint,
    };
  });
}

function nextOffsetFor(state: OState, p: number) {
  let next = 0;
  for (const x of state.processed) if (x.partition === p) next = Math.max(next, x.offset + 1);
  return next;
}

function beltReaders(state: OState, lastEvents: OEvent[], pulse: number, lang: Lang): BeltReader[] {
  return state.consumers.map((c) => {
    const done = lastEvents.find((e) => e.type === "processed" && e.by === c.id);
    const bubble =
      done && done.type === "processed"
        ? {
            text: done.outOfOrder ? (lang === "tr" ? "sıra bozuldu!" : "out of order!") : `${done.order}·${done.stage} ✓`,
            tone: (done.outOfOrder ? "danger" : "ok") as PillTone,
          }
        : undefined;
    return {
      id: c.id,
      name: tl(lang, c.name),
      tint: c.tint,
      state: done ? (done.type === "processed" && done.outOfOrder ? "busy" : "hop") : "idle",
      pulse,
      partitions: c.assigned,
      bubble,
    };
  });
}

/** Per order, the stages in the order they were handled: "1042: 3, 2, 1". */
function HandledOrder({ state, x, y }: { state: OState; x: number; y: number }) {
  const { t } = useLang();
  const orders = [...new Set(state.processed.map((p) => p.order))];
  const height = 40 + Math.max(orders.length, 1) * 32;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={3} width={196} height={height} rx={14} className="pill-shadow" />
      <rect x={0} y={0} width={196} height={height} rx={14} className="order-card" />
      <text className="order-card-title" x={14} y={24}>
        {t(text.handledOrder)}
      </text>
      {orders.length === 0 && (
        <text className="label-soft" x={14} y={52} style={{ fontWeight: 600 }}>
          {t(text.nothingYet)}
        </text>
      )}
      {orders.map((order, i) => {
        const items = state.processed.filter((p) => p.order === order);
        const broken = items.some((p) => p.outOfOrder);
        return (
          <g key={order} transform={`translate(14 ${50 + i * 32})`}>
            <motion.g initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
              <g transform="translate(8 4)">
                <Parcel s={14} kind={ORDER_KIND[order] ?? "neutral"} size={0.9} />
              </g>
              <text x={22} y={6} className="order-row-name">
                {order}
              </text>
              {items.map((p, k) => (
                <g key={k} transform={`translate(${78 + k * 26} 0)`}>
                  <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }}>
                    <circle r={10} className={`order-step ${p.outOfOrder ? "is-bad" : "is-ok"}`} />
                    <text y={4.5} textAnchor="middle" className="order-step-text">
                      {p.stage}
                    </text>
                  </motion.g>
                </g>
              ))}
              {broken && (
                <text x={70 + items.length * 26 + 4} y={6} className="order-row-bad">
                  ✗
                </text>
              )}
            </motion.g>
          </g>
        );
      })}
    </g>
  );
}

export function OrderingScene({ step, paused, replayKey, controls }: SceneProps) {
  if (RETRY_STEPS.includes(step)) return <RetryScene step={step} paused={paused} replayKey={replayKey} controls={controls} />;
  return <BeltsScene step={step} paused={paused} replayKey={replayKey} controls={controls} />;
}

function BeltsScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [extra, setExtra] = useState<OAction[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);
  const sandboxRun = useMemo(() => (sandbox ? simulate(extra, sandboxStart) : null), [sandbox, extra]);

  let state: OState;
  let lastEvents: OEvent[];
  let shownEvents: OEvent[];
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
  const pulse = sandbox ? extra.length : cursor;

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && sandboxRun && mission.check({ start: sandboxStart, state, actions: extra, events: sandboxRun.events }));
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(extra.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, extra.length, setMissionStars]);
  const locked = won;
  const act = (a: OAction) => {
    if (!locked) setExtra((xs) => [...xs, a]);
  };

  const written = Object.values(state.written).reduce((a, b) => a + b, 0);
  const broken = violations(state);
  const metrics: Metric[] = [
    { label: t(text.partitions), value: state.partitions.length },
    { label: t(text.written), value: written },
    { label: t(text.handled), value: state.processed.length },
    { label: `${t(text.broken)}${sandbox ? ` ${t(text.yours)}` : ""}`, value: broken, tone: broken > 0 ? "danger" : "plain" },
  ];

  const ordersShown = [...new Set(state.partitions.flat().map((r) => r.order))];
  const legend: LegendItem[] = [
    { swatch: <MiniCubes kinds={ordersShown.map((o) => ORDER_KIND[o] ?? "neutral")} />, label: t(text.legendColor) },
    { swatch: <text y={3} textAnchor="middle" className="legend-num">1</text>, label: t(text.legendNumber) },
    { swatch: <text y={3} textAnchor="middle" className="legend-num is-soft">0</text>, label: t(text.legendOffset) },
  ];

  const lines = describe(shownEvents, lang);
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
        onSelect={(i) => {
          setMissionIndex(i);
          setExtra([]);
        }}
        moves={extra.length}
        won={won}
        best={best}
      />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        {(["1042", "1043"] as const).map((order) => {
          const full = (state.written[order] ?? 0) >= STAGES;
          return (
            <div className="control-row" key={order}>
              <span className="control-name">
                <i className={`kind-${ORDER_KIND[order]}`} />
                {order}
              </span>
              {[true, false].map((keyed) => (
                <button
                  key={String(keyed)}
                  className="chip-btn is-producer"
                  disabled={locked || full}
                  onClick={() => act({ type: "write", order, keyed })}
                >
                  {t(text.producerRow)} · {t(keyed ? text.withKey : text.noKey)}
                </button>
              ))}
              <span className="control-note">
                {full ? t(text.allWritten) : `${t(text.nextEvent)}: ${(state.written[order] ?? 0) + 1} (${t(stageName[(state.written[order] ?? 0) + 1]!)})`}
              </span>
            </div>
          );
        })}
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--paper-2)" }} />
            Topic
          </span>
          <button
            className="chip-btn"
            disabled={locked || state.partitions.length >= MAX_PARTITIONS}
            onClick={() => act({ type: "addPartition" })}
          >
            {t(text.addPartition)} ({state.partitions.length} → {Math.min(state.partitions.length + 1, MAX_PARTITIONS)})
          </button>
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--coral)" }} />
            {t(text.readersRow)}
          </span>
          {state.consumers.map((c) => (
            <button key={c.id} className="chip-btn is-ok" disabled={locked} onClick={() => act({ type: "read", consumer: c.id })}>
              <span className="order-dot" style={{ background: c.tint.body }} />
              {t(c.name)} {t(text.read)}
            </button>
          ))}
        </div>
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

  const produced = lastEvents.find((e) => e.type === "written");

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
      <BeltsStage
        partitions={beltPartitions(state, lastEvents)}
        readers={beltReaders(state, lastEvents, pulse, lang)}
        producer={{
          name: t(text.producer),
          state: produced ? "hop" : "idle",
          pulse,
          kind: produced && produced.type === "written" ? ORDER_KIND[produced.order] : "order",
        }}
        partitionLabel={(i) => `p${i}`}
        nextLabel={t(text.next)}
      >
        <HandledOrder state={state} x={648} y={22} />
      </BeltsStage>
    </SceneFrame>
  );
}

function MiniCubes({ kinds }: { kinds: ParcelKind[] }) {
  const shown = kinds.length ? kinds.slice(0, 3) : (["order"] as ParcelKind[]);
  return (
    <g transform={`translate(${-(shown.length - 1) * 4} 3)`}>
      {shown.map((k, i) => (
        <g key={i} transform={`translate(${i * 8} 0)`}>
          <Parcel s={11} kind={k} size={0.8} />
        </g>
      ))}
    </g>
  );
}

/* -------------------------------------------------- steps 7–8: producer retries */

interface Flight {
  stage: number;
  seq?: number;
  where: "producer" | "air" | "landed";
  status?: { text: L; tone: PillTone };
}

interface RetryFrame {
  log: number[];
  flights: Flight[];
  note: { text: L; tone: PillTone };
}

const timeout = { text: l("zaman aşımı ✗", "timed out ✗"), tone: "danger" as PillTone };

const RETRY_FRAMES: Record<number, RetryFrame[]> = {
  7: [
    {
      log: [],
      flights: [
        { stage: 1, where: "producer" },
        { stage: 2, where: "producer" },
      ],
      note: { text: l("idempotence kapalı · max.in.flight = 5", "idempotence off · max.in.flight = 5"), tone: "warn" },
    },
    {
      log: [],
      flights: [
        { stage: 1, where: "air" },
        { stage: 2, where: "air" },
      ],
      note: { text: l("İki istek aynı anda yolda", "Two requests on the way at once"), tone: "plain" },
    },
    {
      log: [2],
      flights: [{ stage: 1, where: "air", status: timeout }],
      note: { text: l("2. istek yazıldı, 1. istek tekrar deneniyor", "Request 2 landed; request 1 is retried"), tone: "warn" },
    },
    {
      log: [2, 1],
      flights: [],
      note: { text: l("Log'da önce \"ödendi\", sonra \"oluşturuldu\"", "The log now says \"paid\" before \"created\""), tone: "danger" },
    },
  ],
  8: [
    {
      log: [],
      flights: [
        { stage: 1, seq: 0, where: "producer" },
        { stage: 2, seq: 1, where: "producer" },
      ],
      note: { text: l("enable.idempotence = true: her batch'in sıra numarası var", "enable.idempotence = true: every batch has a sequence number"), tone: "ok" },
    },
    {
      log: [],
      flights: [
        { stage: 1, seq: 0, where: "air" },
        { stage: 2, seq: 1, where: "air" },
      ],
      note: { text: l("İki istek aynı anda yolda", "Two requests on the way at once"), tone: "plain" },
    },
    {
      log: [],
      flights: [
        { stage: 1, seq: 0, where: "air", status: timeout },
        { stage: 2, seq: 1, where: "air", status: { text: l("seq 1 erken: reddedildi", "seq 1 too early: rejected"), tone: "warn" } },
      ],
      note: { text: l("Broker seq 0'ı bekliyor, seq 1'i kabul etmiyor", "The broker waits for seq 0 and refuses seq 1"), tone: "warn" },
    },
    {
      log: [1, 2],
      flights: [],
      note: { text: l("Tekrar gönderildi: sıra korundu ✓", "Sent again: order kept ✓"), tone: "ok" },
    },
  ],
};

function RetryScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t } = useLang();
  const frames = RETRY_FRAMES[step]!;
  const cursor = usePlayback(frames.length - 1, paused, `${step}-${replayKey}`, 1300);
  const frame = frames[cursor]!;
  const geo = beltsGeometry(1);
  const kindOf = (stage: number): ParcelKind => (stage === 1 ? "order" : "payment");
  const records = frame.log.map((stage, offset) => ({ offset, label: String(stage), kind: kindOf(stage) }));
  const flightPos = (f: Flight, k: number): [number, number] => {
    if (f.where === "producer") return [geo.producerAt[0] - 6 + k * 16, geo.producerAt[1] - 96 - k * 10];
    const [x, y] = geo.at(geo.beltEnd - 0.2 + k * 0.9, -1.3, 1.4);
    return [x, y];
  };

  const metrics: Metric[] = [
    { label: t(l("Yoldaki istek", "Requests in flight")), value: frame.flights.length },
    { label: t(l("Log'daki olay", "Events on log")), value: frame.log.length },
    {
      label: t(l("Log sırası", "Log order")),
      value: frame.log.length ? frame.log.join(" → ") : "—",
      tone: frame.log.length === 2 ? (frame.log[0]! > frame.log[1]! ? "danger" : "ok") : "plain",
    },
  ];
  const legend: LegendItem[] = [
    { swatch: <text y={3} textAnchor="middle" className="legend-num">1</text>, label: t(l("1 oluşturuldu · 2 ödendi", "1 created · 2 paid")) },
    { swatch: <text y={3} textAnchor="middle" className="legend-num is-soft">0</text>, label: t(text.legendOffset) },
  ];

  return (
    <SceneFrame metrics={metrics} controls={controls} legend={legend} paused={paused} width={STAGE.width} height={STAGE.height} label={t(text.label)}>
      <BeltsStage
        partitions={[{ logStart: 0, logEnd: records.length, records }]}
        readers={[]}
        producer={{ name: t(text.producer), state: cursor === 1 ? "hop" : "idle", pulse: cursor }}
        partitionLabel={() => "p0"}
        nextLabel={t(text.next)}
      >
        <AnimatePresence>
          {frame.flights.map((f, k) => {
            const [x, y] = flightPos(f, k);
            return (
              <motion.g
                key={f.stage}
                initial={{ x: geo.producerAt[0], y: geo.producerAt[1] - 60, opacity: 0 }}
                animate={{ x, y, opacity: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
              >
                <Parcel s={geo.s} kind={kindOf(f.stage)} label={String(f.stage)} size={0.74} />
                {f.seq !== undefined && (
                  <text y={-geo.s * 1.15} textAnchor="middle" className="seq-tag">
                    seq {f.seq}
                  </text>
                )}
                {f.status && <Pill key={f.status.text.en} x={0} y={-geo.s * 1.9} text={t(f.status.text)} tone={f.status.tone} size={11.5} />}
              </motion.g>
            );
          })}
        </AnimatePresence>
        <Pill key={`${step}-${cursor}`} x={430} y={404} text={t(frame.note.text)} tone={frame.note.tone} size={13} />
      </BeltsStage>
    </SceneFrame>
  );
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP || RETRY_STEPS.includes(step)) return [];
  const before = base.run.states[base.startOf(step)]!;
  const after = base.run.states[base.ends[step]!]!;
  const out: Change[] = [];
  if (step === 0) {
    out.push({ kind: "add", text: both("`orders` topic'i: 3 partition, her birini bir Kargo consumer'ı okuyor", "`orders` topic: 3 partitions, each read by one shipping consumer") });
    return out;
  }
  if (after.partitions.length > before.partitions.length) {
    out.push({ kind: "change", text: both(`Partition sayısı: ${before.partitions.length} → ${after.partitions.length}`, `Partitions: ${before.partitions.length} → ${after.partitions.length}`) });
    out.push({ kind: "change", text: both("Rebalance: Kargo-1 artık partition 0 ve 1'i okuyor", "Rebalance: Shipping-1 now reads partitions 0 and 1") });
  }
  const evs = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const writes = evs.filter((e): e is Extract<OEvent, { type: "written" }> => e.type === "written");
  const byOrder = new Map<string, number[]>();
  for (const e of writes) byOrder.set(e.order, [...(byOrder.get(e.order) ?? []), e.partition]);
  for (const [order, ps] of byOrder) {
    const where = [...new Set(ps)].map((p) => `p${p}`).join(", ");
    out.push({
      kind: new Set(ps).size > 1 || writes.some((e) => e.order === order && e.moved) ? "bad" : "add",
      text: both(`${order}: ${ps.length} olay yazıldı → ${where}`, `${order}: ${ps.length} event${ps.length > 1 ? "s" : ""} written → ${where}`),
    });
  }
  const handled = evs.filter((e): e is Extract<OEvent, { type: "processed" }> => e.type === "processed");
  if (handled.length > 0) {
    const ok = handled.filter((h) => !h.outOfOrder).length;
    const bad = handled.length - ok;
    if (ok > 0) out.push({ kind: "good", text: both(`${ok} olay sırasında işlendi`, `${ok} event${ok > 1 ? "s" : ""} handled in order`) });
    if (bad > 0) out.push({ kind: "bad", text: both(`${bad} olay kendinden önceki olaydan önce işlendi`, `${bad} event${bad > 1 ? "s" : ""} handled before an earlier one`) });
  }
  return out;
}
