import { AnimatePresence } from "motion/react";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Partition } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { PartitionStage, STAGE, type Reader } from "../../iso/PartitionStage";
import { Pill, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import {
  abortedSeenBy,
  base,
  duplicateOrders,
  isAborted,
  isOpen,
  lastStable,
  orderNo,
  SANDBOX_STEP,
  stepActions,
  type TEvent,
  type TState,
} from "./model";
import { useAppSandbox } from "../shared/useAppSandbox";
import { FREE, scenarios } from "./scenarios";
import { lesson, shell } from "./shell";
import "./scene.css";

const SLUG = "idempotence-and-transactions";
const RC_TINT: Tint = TINTS.lilac;
const RU_TINT: Tint = TINTS.sun;

const text = {
  label: l(
    "invoices log'u bir bant. Fatura servisi her sipariş için bir fatura yazıyor; iki okuyucu farklı isolation.level ile okuyor. Sağ üstte producer'ın ayarları.",
    "The invoices log as a belt. The billing service writes one invoice per order; two readers read with different isolation levels. Top right: the producer's settings.",
  ),
  producer: l("Fatura servisi", "Billing service"),
  rc: l("Muhasebe", "Accounting"),
  ru: l("Rapor", "Reports"),
  next: l("sıradaki", "next"),
  onLog: l("Log'daki kayıt", "Records on log"),
  dups: l("Çift faturalı sipariş", "Orders invoiced twice"),
  dropped: l("Broker'ın attığı tekrar", "Retries dropped by broker"),
  rcAborted: l("Muhasebe'nin gördüğü iptal", "Aborted seen by Accounting"),
  ruAborted: l("Rapor'un gördüğü iptal", "Aborted seen by Reports"),
  yours: l("(senin)", "(yours)"),
  settings: l("Fatura servisi (producer)", "Billing service (producer)"),
  idemOn: l("Idempotence: açık", "Idempotence: on"),
  idemOff: l("Idempotence: kapalı", "Idempotence: off"),
  txOff: l("Transaction: kapalı", "Transactions: off"),
  txIdle: l("Transaction: açık, beklemede", "Transactions: on, idle"),
  txOpen: l("Transaction: #{n} açık", "Transaction #{n} open"),
  waitingAck: l("Onay bekleniyor: sipariş {o}", "Waiting for ack: order {o}"),
  noAck: l("Bekleyen onay yok", "No ack pending"),
  down: l("Servis çöktü", "Service is down"),
  input: l("orders okuma: sıradaki {p} · commit {c}", "orders input: next {p} · committed {c}"),
  lso: l("read_committed bekliyor: açık transaction", "read_committed waits: open transaction"),
  legendData: l("fatura kaydı (üstünde offset)", "invoice record (offset on top)"),
  legendAborted: l("iptal edilen transaction'ın kaydı", "record of an aborted transaction"),
  legendMarker: l("kontrol kaydı (commit/abort işareti)", "control record (commit/abort marker)"),
  legendOpen: l("soluk = transaction henüz açık", "faded = transaction still open"),
  legendReaders: l("Muhasebe: read_committed · Rapor: read_uncommitted", "Accounting: read_committed · Reports: read_uncommitted"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir komut yaz; uygulamanın ve okuyucuların ne yaptığını burada gör.", "Type a command; see what the app and the readers did here."),
  limitKafka: l("Kafka içi: oku → işle → yaz = tek transaction", "Inside Kafka: read → process → write = one transaction"),
  limitOutside: l("E-posta, ödeme, başka DB: idempotent işleme", "Email, payments, other DBs: idempotent processing"),
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

function toPartition(s: TState): Partition {
  return {
    topic: "invoices",
    index: 0,
    leader: 1,
    logStartOffset: 0,
    logEndOffset: s.log.length,
    records: s.log.map((r) => ({
      offset: r.offset,
      key: null,
      value: r.kind === "data" ? (isAborted(s, r) ? "aborted" : "data") : "marker",
      producer: "billing",
      time: 0,
    })),
  };
}

const kindOf = (v: string): "order" | "cancel" | "payment" => (v === "marker" ? "payment" : v === "aborted" ? "cancel" : "order");

/* ---------------------------------------------------------------- events */

interface Line {
  text: string;
  tone: "produce" | "read" | "bad" | "ok" | "plain";
}

function describe(events: TEvent[], s: TState, lang: Lang): Line[] {
  const tr = lang === "tr";
  return events.flatMap((e): Line[] => {
    switch (e.type) {
      case "config":
        return [
          {
            tone: "plain",
            text: tr
              ? `Producer yeniden ayarlandı: idempotence ${e.idempotent ? "açık" : "kapalı"}, transaction ${e.transactional ? "açık" : "kapalı"} (PID ${e.pid})`
              : `Producer reconfigured: idempotence ${e.idempotent ? "on" : "off"}, transactions ${e.transactional ? "on" : "off"} (PID ${e.pid})`,
          },
        ];
      case "written": {
        const seq = e.seq !== null ? ` · seq ${e.seq}` : "";
        const txn = e.txn !== null ? (tr ? ` · transaction #${e.txn}` : ` · transaction #${e.txn}`) : "";
        if (e.retry) {
          return [
            {
              tone: "bad",
              text: tr
                ? `Tekrar gönderildi ve broker İKİNCİ kez yazdı: sipariş ${orderNo(e.order)} → offset ${e.offset}${seq}`
                : `Sent again and the broker wrote it a SECOND time: order ${orderNo(e.order)} → offset ${e.offset}${seq}`,
            },
          ];
        }
        return [
          {
            tone: "produce",
            text: tr
              ? `Fatura yazıldı: sipariş ${orderNo(e.order)} → offset ${e.offset}${seq}${txn}`
              : `Invoice written: order ${orderNo(e.order)} → offset ${e.offset}${seq}${txn}`,
          },
        ];
      }
      case "retryDropped":
        return [
          {
            tone: "ok",
            text: tr
              ? `Tekrar gönderildi, broker tanıdı: "seq ${e.seq} zaten yazıldı". Kopya atıldı, onay yine gönderildi`
              : `Sent again; the broker recognised it: "seq ${e.seq} already written". Copy dropped, ack sent again`,
          },
        ];
      case "acked":
        return [{ tone: "ok", text: tr ? `Onay geldi: sipariş ${orderNo(e.order)}` : `Ack received: order ${orderNo(e.order)}` }];
      case "inputCommitted":
        return [
          {
            tone: "ok",
            text: tr ? `orders konumu commit edildi: sıradaki sipariş ${orderNo(e.position)}` : `orders position committed: next order ${orderNo(e.position)}`,
          },
        ];
      case "begun":
        return [{ tone: "plain", text: tr ? `Transaction #${e.txn} başladı` : `Transaction #${e.txn} began` }];
      case "marker":
        return [
          e.kind === "commit"
            ? {
                tone: "ok",
                text: tr
                  ? `Transaction #${e.txn} commit edildi: offset ${e.offset} bir commit işareti`
                  : `Transaction #${e.txn} committed: offset ${e.offset} is a commit marker`,
              }
            : {
                tone: "bad",
                text: tr
                  ? `Transaction #${e.txn} ${e.byCoordinator ? "coordinator tarafından " : ""}iptal edildi: offset ${e.offset} bir abort işareti`
                  : `Transaction #${e.txn} aborted${e.byCoordinator ? " by the coordinator" : ""}: offset ${e.offset} is an abort marker`,
              },
        ];
      case "crashed":
        return [
          {
            tone: "bad",
            text: tr
              ? `Fatura servisi çöktü!${e.openTxn !== null ? ` Transaction #${e.openTxn} yarıda kaldı` : ""}`
              : `The billing service crashed!${e.openTxn !== null ? ` Transaction #${e.openTxn} is left half done` : ""}`,
          },
        ];
      case "restarted":
        return [
          {
            tone: "plain",
            text: tr
              ? `Yeniden başladı (PID ${e.pid}, epoch ${e.epoch}). orders'ta sipariş ${orderNo(e.position)} noktasından devam`
              : `Restarted (PID ${e.pid}, epoch ${e.epoch}). Continues at order ${orderNo(e.position)} in orders`,
          },
        ];
      case "read": {
        const who = e.reader === "rc" ? (tr ? "Muhasebe" : "Accounting") : tr ? "Rapor" : "Reports";
        const aborted = e.offsets.filter((o) => isAborted(s, s.log[o]!)).length;
        const lines: Line[] = [
          {
            tone: aborted > 0 ? "bad" : "read",
            text:
              e.offsets.length === 0
                ? tr
                  ? `${who} okudu: yeni fatura yok`
                  : `${who} read: no new invoices`
                : tr
                  ? `${who} ${e.offsets.length} fatura okudu (offset ${e.offsets.join(", ")})${aborted ? ` · ${aborted} tanesi iptal edilmiş transaction'dan!` : ""}`
                  : `${who} read ${e.offsets.length} invoice${e.offsets.length > 1 ? "s" : ""} (offset ${e.offsets.join(", ")})${aborted ? ` · ${aborted} from an aborted transaction!` : ""}`,
          },
        ];
        if (e.stoppedAt !== null) {
          lines.push({
            tone: "plain",
            text: tr
              ? `${who} offset ${e.stoppedAt} önünde bekliyor: orada açık bir transaction var`
              : `${who} waits before offset ${e.stoppedAt}: an open transaction starts there`,
          });
        }
        return lines;
      }
      case "nothing":
        return [];
    }
  });
}

/* ----------------------------------------------------------------- scene */

export function IdempotenceScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const typed = useAppSandbox({ slug: SLUG, active: sandbox, lesson, shell, scenarios, free: FREE });
  const sandboxStart = typed.startModel;

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);
  const sandboxRun = typed.sandboxRun;

  let state: TState;
  let lastEvents: TEvent[];
  let shown: TEvent[];
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

  // Highlights: open transactions faded, repeat invoices flagged, records just read ticked.
  const marks = new Map<number, { state: ParcelState; tint?: Tint; to?: string }>();
  const seenOrders = new Set<number>();
  for (const r of state.log) {
    if (r.kind !== "data") continue;
    if (isOpen(state, r)) marks.set(r.offset, { state: "dim" });
    else if (!isAborted(state, r)) {
      if (seenOrders.has(r.order!)) marks.set(r.offset, { state: "dup" });
      seenOrders.add(r.order!);
    }
  }
  for (const e of lastEvents) {
    if (e.type !== "read") continue;
    for (const o of e.offsets) if (!marks.has(o)) marks.set(o, { state: "read", tint: e.reader === "rc" ? RC_TINT : RU_TINT, to: e.reader });
  }

  const readNow = (who: "rc" | "ru") => lastEvents.some((e) => e.type === "read" && e.reader === who && e.offsets.length > 0);
  const readers: Reader[] = (["rc", "ru"] as const).map((who) => ({
    id: who,
    name: t(who === "rc" ? text.rc : text.ru),
    tint: who === "rc" ? RC_TINT : RU_TINT,
    position: state[who].pos,
    pulse,
    state: readNow(who) ? "hop" : "idle",
  }));

  const since = <T extends number>(now: T, was: T) => (sandbox ? now - was : now);
  const dups = since(duplicateOrders(state), duplicateOrders(sandboxStart));
  const dropped = since(state.dropped, sandboxStart.dropped);
  const rcAb = since(abortedSeenBy(state, "rc"), abortedSeenBy(sandboxStart, "rc"));
  const ruAb = since(abortedSeenBy(state, "ru"), abortedSeenBy(sandboxStart, "ru"));
  const y = sandbox ? ` ${t(text.yours)}` : "";
  const metrics: Metric[] = [
    { label: t(text.onLog), value: state.log.length },
    { label: `${t(text.dups)}${y}`, value: dups, tone: dups > 0 ? "danger" : "plain" },
    { label: `${t(text.dropped)}${y}`, value: dropped, tone: dropped > 0 ? "ok" : "plain" },
  ];
  if (step >= 7) {
    metrics.push(
      { label: `${t(text.rcAborted)}${y}`, value: rcAb, tone: rcAb > 0 ? "danger" : "plain", dot: RC_TINT.body },
      { label: `${t(text.ruAborted)}${y}`, value: ruAb, tone: ruAb > 0 ? "warn" : "plain", dot: RU_TINT.body },
    );
  }

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendData) },
    { swatch: <MiniCube fill="var(--peach)" />, label: t(text.legendAborted) },
    { swatch: <MiniCube fill="var(--sky)" />, label: t(text.legendMarker) },
    { swatch: <g opacity={0.35}><MiniCube fill="var(--mint)" /></g>, label: t(text.legendOpen) },
  ];
  if (step >= 7) legend.push({ swatch: <circle r={5} cy={-3} className="ink" style={{ fill: RC_TINT.body }} />, label: t(text.legendReaders) });

  const lines = describe(shown, state, lang);
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

  const rcWaiting = lastStable(state) < state.log.length;
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
        partition={toPartition(state)}
        readers={readers}
        producerName={t(text.producer)}
        producerState={!state.alive ? "crashed" : lastEvents.some((e) => e.type === "written") ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={kindOf}
        labels={{ next: t(text.next), retention: "" }}
        showShredder={false}
      />
      <SettingsPanel state={state} t={t} />
      <AnimatePresence>
        {rcWaiting && <Pill key="lso" x={210} y={452} text={t(text.lso)} tone="warn" />}
        {step === 9 && (
          <g key="limits">
            <Pill x={190} y={300} text={t(text.limitKafka)} tone="ok" />
            <Pill x={190} y={334} text={t(text.limitOutside)} tone="sun" />
          </g>
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}

function SettingsPanel({ state, t }: { state: TState; t: (x: L) => string }) {
  const x = 556;
  const y = 6;
  const width = 296;
  const height = 116;
  const idemLine = state.idempotent
    ? `${t(text.idemOn)} · PID ${state.pid}${state.transactional ? ` · epoch ${state.epoch}` : ""} · seq ${state.nextSeq}`
    : t(text.idemOff);
  const txLine = !state.transactional ? t(text.txOff) : state.txn ? fill(t(text.txOpen), { n: state.txn.id }) : t(text.txIdle);
  const ackLine = !state.alive ? t(text.down) : state.inflight ? fill(t(text.waitingAck), { o: orderNo(state.inflight.order) }) : t(text.noAck);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={3} width={width} height={height} rx={14} className="pill-shadow" />
      <rect x={0} y={0} width={width} height={height} rx={14} className="it-card ink" />
      <text x={14} y={22} className="it-title">
        {t(text.settings)}
      </text>
      <circle cx={20} cy={39} r={5} className={`ink ${state.idempotent ? "it-on" : "it-off"}`} />
      <text x={32} y={43} className="it-line">
        {idemLine}
      </text>
      <circle cx={20} cy={59} r={5} className={`ink ${state.txn ? "it-open" : state.transactional ? "it-on" : "it-off"}`} />
      <text x={32} y={63} className="it-line">
        {txLine}
      </text>
      <text x={14} y={83} className={`it-line ${state.alive ? (state.inflight ? "is-warn" : "") : "is-bad"}`}>
        {ackLine}
      </text>
      <line x1={12} x2={width - 12} y1={92} y2={92} className="it-divider" />
      <text x={14} y={108} className="it-line is-soft">
        {fill(t(text.input), { p: orderNo(state.position), c: orderNo(state.committed) })}
      </text>
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

/* ------------------------------------------------ "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before = base.run.states[base.startOf(step)]!;
  const after = base.run.states[base.ends[step]!]!;
  const events = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const out: Change[] = [];

  const config = events.filter((e) => e.type === "config").at(-1);
  if (config && config.type === "config") {
    if (config.transactional) out.push({ kind: "good", text: both("Transaction'lar açıldı (`transactional.id` verildi)", "Transactions on (a `transactional.id` is set)") });
    else if (config.idempotent) out.push({ kind: "good", text: both("Idempotence açıldı: PID + sıra numarası", "Idempotence on: PID + sequence numbers") });
  }
  const written = events.filter((e) => e.type === "written").length;
  if (written > 0) out.push({ kind: "add", text: both(`+${written} fatura kaydı yazıldı`, `+${written} invoice record${written > 1 ? "s" : ""} written`) });
  const markers = events.filter((e) => e.type === "marker");
  for (const m of markers) {
    if (m.type !== "marker") continue;
    out.push(
      m.kind === "commit"
        ? { kind: "good", text: both(`Commit işareti offset ${m.offset} noktasına yazıldı`, `Commit marker written at offset ${m.offset}`) }
        : { kind: "bad", text: both(`Abort işareti offset ${m.offset} noktasına yazıldı`, `Abort marker written at offset ${m.offset}`) },
    );
  }
  if (events.some((e) => e.type === "crashed")) out.push({ kind: "bad", text: both("Fatura servisi çöktü", "The billing service crashed") });
  const dropped = after.dropped - before.dropped;
  if (dropped > 0) out.push({ kind: "good", text: both("Broker tekrarı tanıdı ve yazmadı", "The broker recognised the retry and did not write it") });
  const dups = duplicateOrders(after) - duplicateOrders(before);
  if (dups > 0) out.push({ kind: "bad", text: both(`${dups} sipariş için ikinci fatura oluştu`, `A second invoice appeared for ${dups} order${dups > 1 ? "s" : ""}`) });
  for (const who of ["rc", "ru"] as const) {
    const got = after[who].seen.length - before[who].seen.length;
    if (got === 0) continue;
    const ab = abortedSeenBy(after, who) - abortedSeenBy(before, who);
    const name = who === "rc" ? both("Muhasebe", "Accounting") : both("Rapor", "Reports");
    out.push({
      kind: ab > 0 ? "bad" : "change",
      text: both(
        `${name.tr} ${got} fatura okudu${ab > 0 ? `, ${ab} tanesi iptal edilmişti` : ""}`,
        `${name.en} read ${got} invoice${got > 1 ? "s" : ""}${ab > 0 ? `, ${ab} of them aborted` : ""}`,
      ),
    });
  }
  return out;
}
