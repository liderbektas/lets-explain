import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Partition } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { PartitionStage, STAGE, type Reader } from "../../iso/PartitionStage";
import { CommitSeal, Pill, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  base,
  canDo,
  commit,
  crash,
  dedupe,
  duplicateCount,
  lagOf,
  lostOffsets,
  process,
  produce,
  read,
  restart,
  run,
  SANDBOX_STEP,
  sandboxStart,
  stepActions,
  type DAction,
  type DEvent,
  type DState,
} from "./model";
import "./scene.css";

const SLUG = "delivery-semantics";
const READER_TINT: Tint = TINTS.coral;

const text = {
  label: l(
    "Sipariş log'u bir bant; e-posta servisi kayıtları okuyup müşteriye e-posta gönderiyor. Sağ üstte servisin belleği ve müşterilerin gelen kutusu.",
    "The order log as a belt; the email service reads records and emails customers. Top right: the service's memory and the customers' inboxes.",
  ),
  producer: l("Sipariş servisi", "Order service"),
  reader: l("E-posta servisi", "Email service"),
  next: l("sıradaki", "next"),
  onLog: l("Log'daki kayıt", "Records on log"),
  lag: l("lag", "lag"),
  lost: l("Kaybolan e-posta", "Lost emails"),
  twice: l("İki kez giden", "Sent twice"),
  yours: l("(senin)", "(yours)"),
  memory: l("Servisin belleği", "Service memory"),
  inHand: l("Elinde", "In hand"),
  empty: l("boş", "empty"),
  down: l("çöktü, bellek silindi", "down, memory wiped"),
  ledger: l("Gönderilenler defteri", "Already-sent list"),
  ledgerShort: l("Defter", "List"),
  on: l("açık", "on"),
  off: l("kapalı", "off"),
  inbox: l("Müşterilerin gelen kutusu", "Customers' inboxes"),
  lostTag: l("kayıp", "lost"),
  legendParcel: l("sipariş kaydı (üstünde offset)", "order record (offset on top)"),
  legendFlag: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  legendSeal: l("mühür = commit edilen offset", "seal = committed offset"),
  legendMail: l("zarf = müşteriye giden e-posta", "envelope = email sent to the customer"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  log: l("Log", "Log"),
  write: l("Sipariş yaz", "Write order"),
  readOne: l("1 oku", "Read 1"),
  doProcess: l("İşle: e-posta gönder", "Process: send email"),
  doCommit: l("Commit", "Commit"),
  doCrash: l("Çökert", "Crash"),
  doStart: l("Başlat", "Start"),
  ledgerOn: l("Defteri aç", "Turn list on"),
  ledgerOff: l("Defteri kapat", "Turn list off"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  amo: l("at-most-once: kayıp olabilir", "at-most-once: may lose"),
  alo: l("at-least-once: tekrar olabilir", "at-least-once: may repeat"),
  eo: l("+ idempotent işleme = etkisi tek sefer", "+ idempotent processing = effect once"),
  kafkaOnly: l("Kafka içinde: transaction", "Inside Kafka: transactions"),
  outside: l("Dış dünya: idempotent işleme", "Outside world: idempotent processing"),
};

const orderNo = (offset: number) => 1041 + offset;

function toPartition(s: DState): Partition {
  return {
    topic: "orders",
    index: 0,
    leader: 1,
    logStartOffset: 0,
    logEndOffset: s.records.length,
    records: s.records.map((r) => ({ offset: r.offset, key: null, value: r.value, producer: "orders", time: 0 })),
  };
}

/* ---------------------------------------------------------------- events */

interface Line {
  text: string;
  tone: "produce" | "read" | "bad" | "ok" | "plain";
}

function describe(events: DEvent[], lang: Lang): Line[] {
  const tr = lang === "tr";
  const who = tr ? "E-posta servisi" : "Email service";
  return events.map((e): Line => {
    switch (e.type) {
      case "produced":
        return { tone: "produce", text: tr ? `Yazıldı: sipariş ${orderNo(e.offset)} → offset ${e.offset}` : `Written: order ${orderNo(e.offset)} → offset ${e.offset}` };
      case "read":
        return {
          tone: e.again ? "bad" : "read",
          text: tr
            ? `${who} okudu: offset ${e.offset}${e.again ? " (daha önce okunmuştu)" : ""}`
            : `${who} read offset ${e.offset}${e.again ? " (read before)" : ""}`,
        };
      case "sent":
        return e.times > 1
          ? {
              tone: "bad",
              text: tr
                ? `Sipariş ${orderNo(e.offset)} için ${e.times}. e-posta gitti! Müşteri aynı e-postayı tekrar aldı`
                : `Email #${e.times} for order ${orderNo(e.offset)} went out! The customer got it again`,
            }
          : { tone: "ok", text: tr ? `E-posta gönderildi: sipariş ${orderNo(e.offset)}` : `Email sent: order ${orderNo(e.offset)}` };
      case "skipped":
        return {
          tone: "ok",
          text: tr
            ? `Defter: sipariş ${orderNo(e.offset)} için e-posta zaten gitmiş, atlandı`
            : `List: order ${orderNo(e.offset)} already got its email, skipped`,
        };
      case "committed":
        return { tone: "ok", text: tr ? `Commit: sıradaki offset = ${e.offset}` : `Commit: next offset = ${e.offset}` };
      case "crashed":
        return {
          tone: "bad",
          text:
            e.dropped.length > 0
              ? tr
                ? `${who} çöktü! Elindeki kayıt bellekle gitti (offset ${e.dropped.join(", ")})`
                : `${who} crashed! The record in hand went with its memory (offset ${e.dropped.join(", ")})`
              : tr
                ? `${who} çöktü!`
                : `${who} crashed!`,
        };
      case "restarted":
        return e.lost.length > 0
          ? {
              tone: "bad",
              text: tr
                ? `${who} yeniden başladı, offset ${e.from} noktasından devam ediyor. Offset ${e.lost.join(", ")} hiç işlenmeden geçildi: e-posta kayıp`
                : `${who} restarted at offset ${e.from}. Offset ${e.lost.join(", ")} was skipped unprocessed: email lost`,
            }
          : { tone: "plain", text: tr ? `${who} yeniden başladı, offset ${e.from} noktasından devam ediyor` : `${who} restarted at offset ${e.from}` };
      case "dedupe":
        return {
          tone: "plain",
          text: e.on
            ? tr
              ? "Gönderilenler defteri açıldı: göndermeden önce bakılacak"
              : "Already-sent list on: checked before every send"
            : tr
              ? "Gönderilenler defteri kapandı"
              : "Already-sent list off",
        };
      case "nothing":
        return { tone: "plain", text: tr ? "Bir şey olmadı" : "Nothing happened" };
    }
  });
}

/* ----------------------------------------------------------------- scene */

export function DeliverySemanticsScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [extra, setExtra] = useState<DAction[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);
  const sandboxRun = useMemo(() => (sandbox ? run(extra, sandboxStart) : null), [sandbox, extra]);

  let state: DState;
  let lastEvents: DEvent[];
  let shown: DEvent[];
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

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && sandboxRun && mission.check({ start: sandboxStart, state, actions: extra, events: sandboxRun.events }));
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(extra.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, extra.length, setMissionStars]);
  const locked = won;
  const selectMission = (i: number | null) => {
    setMissionIndex(i);
    setExtra([]);
  };
  const act = (a: DAction) => {
    if (!locked) setExtra((xs) => [...xs, a]);
  };

  const pulse = sandbox ? extra.length : cursor;
  const lost = lostOffsets(state);
  const marks = new Map<number, { state: ParcelState; tint?: Tint }>();
  for (const o of lost) marks.set(o, { state: "dim" });
  for (const [o, n] of Object.entries(state.sent)) if (n > 1) marks.set(Number(o), { state: "dup" });
  for (const o of state.hand) marks.set(o, { state: "read", tint: READER_TINT });

  const readNow = lastEvents.some((e) => e.type === "read");
  const happyNow = lastEvents.some((e) => e.type === "committed" || (e.type === "sent" && e.times === 1) || e.type === "skipped");
  const reader: Reader = {
    id: "email",
    name: t(text.reader),
    tint: READER_TINT,
    position: state.alive ? state.position : undefined,
    committed: state.committed,
    pulse,
    state: !state.alive ? "crashed" : readNow ? "hop" : happyNow ? "happy" : "idle",
  };

  const lostNow = sandbox ? lost.length - lostOffsets(sandboxStart).length : lost.length;
  const dupNow = sandbox ? duplicateCount(state) - duplicateCount(sandboxStart) : duplicateCount(state);
  const metrics: Metric[] = [
    { label: t(text.onLog), value: state.records.length },
    { label: `${t(text.reader)} ${t(text.lag)}`, value: lagOf(state), dot: READER_TINT.body },
    { label: `${t(text.lost)}${sandbox ? ` ${t(text.yours)}` : ""}`, value: lostNow, tone: lostNow > 0 ? "danger" : "plain" },
    { label: `${t(text.twice)}${sandbox ? ` ${t(text.yours)}` : ""}`, value: dupNow, tone: dupNow > 0 ? "danger" : "plain" },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
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
          <CommitSeal tint={READER_TINT} label="" />
        </g>
      ),
      label: t(text.legendSeal),
    },
    { swatch: <Envelope x={0} y={-3} scale={0.7} />, label: t(text.legendMail) },
  ];

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

  const can = (a: DAction["type"]) => !locked && canDo(state, a);
  const footer = sandbox ? (
    <div className="sandbox">
      <MissionPanel missions={missions} active={missionIndex} onSelect={selectMission} moves={extra.length} won={won} best={best} />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.log)}
          </span>
          <button className="chip-btn is-producer" disabled={!can("produce")} onClick={() => act(produce)}>
            {t(text.write)}
          </button>
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: READER_TINT.body }} />
            {t(text.reader)}
          </span>
          <button className="chip-btn" disabled={!can("read")} onClick={() => act(read)}>
            {t(text.readOne)}
          </button>
          <button className="chip-btn" disabled={!can("process")} onClick={() => act(process)}>
            {t(text.doProcess)}
          </button>
          <button className="chip-btn is-ok" disabled={!can("commit")} onClick={() => act(commit)}>
            {t(text.doCommit)}
          </button>
          {state.alive ? (
            <button className="chip-btn is-danger toggle-btn" disabled={!can("crash")} onClick={() => act(crash)}>
              {t(text.doCrash)}
            </button>
          ) : (
            <button className="chip-btn is-ok toggle-btn" disabled={!can("restart")} onClick={() => act(restart)}>
              {t(text.doStart)}
            </button>
          )}
        </div>
        <div className="control-row">
          <span className="control-name ds-ledger-name">{t(text.ledger)}</span>
          <button className="chip-btn" disabled={locked} onClick={() => act(dedupe(!state.dedupe))}>
            {t(state.dedupe ? text.ledgerOff : text.ledgerOn)}
          </button>
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
        readers={[reader]}
        producerName={t(text.producer)}
        producerState={lastEvents.some((e) => e.type === "produced") ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={() => "order"}
        labels={{ next: t(text.next), retention: "" }}
        showShredder={false}
      />
      <SidePanel state={state} lost={lost} t={t} />
      <AnimatePresence>
        {step === 6 && (
          <g key="choose">
            <Pill x={150} y={300} text={t(text.amo)} tone="warn" />
            <Pill x={170} y={334} text={t(text.alo)} tone="danger" />
            <Pill x={210} y={368} text={t(text.eo)} tone="ok" />
          </g>
        )}
        {step === 8 && (
          <g key="eo">
            <Pill x={160} y={318} text={t(text.kafkaOnly)} tone="ok" />
            <Pill x={190} y={352} text={t(text.outside)} tone="sun" />
          </g>
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}

/** Top right: what the service holds in memory, its "already sent" list, and the customers' inboxes. */
function SidePanel({ state, lost, t }: { state: DState; lost: number[]; t: (x: L) => string }) {
  const x = 556;
  const y = 6;
  const width = 296;
  const height = 136;
  const shownFrom = Math.max(0, state.records.length - 8);
  const offsets = state.records.slice(shownFrom).map((r) => r.offset);
  const handText = !state.alive ? t(text.down) : state.hand.length ? `offset ${state.hand.join(", ")}` : t(text.empty);

  return (
    <g transform={`translate(${x} ${y})`} className="ds-panel">
      <rect x={0} y={3} width={width} height={height} rx={14} className="pill-shadow" />
      <rect x={0} y={0} width={width} height={height} rx={14} className="ds-card ink" />
      <text x={14} y={22} className="ds-title">
        {t(text.memory)}
      </text>
      <text x={14} y={42} className={`ds-line ${state.alive ? "" : "is-bad"}`}>
        {t(text.inHand)}: {handText}
      </text>
      <g transform={`translate(${width - 12} 18)`}>
        <rect x={-112} y={-12} width={112} height={23} rx={11.5} className={`ds-ledger ink ${state.dedupe ? "is-on" : ""}`} />
        <text x={-56} y={4} textAnchor="middle" className="ds-ledger-text">
          {t(text.ledgerShort)}: {t(state.dedupe ? text.on : text.off)}
        </text>
      </g>
      <line x1={12} x2={width - 12} y1={53} y2={53} className="ds-divider" />
      <text x={14} y={73} className="ds-title">
        {t(text.inbox)}
      </text>
      {offsets.map((o, i) => {
        const n = state.sent[o] ?? 0;
        const isLost = lost.includes(o);
        const cx = 28 + i * 34;
        return (
          <g key={o} transform={`translate(${cx} 100)`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.g
                key={`${n}-${isLost}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
              >
                {n > 0 ? (
                  <>
                    <Envelope x={0} y={0} tone={n > 1 ? "bad" : "ok"} scale={0.86} />
                    {n > 1 && (
                      <g transform="translate(10 -12)">
                        <rect x={-11} y={-8} width={22} height={15} rx={7.5} className="badge-dup" />
                        <text y={3.5} textAnchor="middle" className="badge-dup-text">
                          {n}×
                        </text>
                      </g>
                    )}
                  </>
                ) : isLost ? (
                  <>
                    <rect x={-13} y={-9.5} width={26} height={19} rx={5} className="ds-slot is-lost" />
                    <path d="M-4.5 -4.5l9 9m0 -9l-9 9" className="ds-x" />
                  </>
                ) : (
                  <rect x={-13} y={-9.5} width={26} height={19} rx={5} className="ds-slot" />
                )}
              </motion.g>
            </AnimatePresence>
            <text y={25} textAnchor="middle" className="ds-offset">
              {isLost ? t(text.lostTag) : o}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Envelope({ x, y, tone = "ok", scale = 1 }: { x: number; y: number; tone?: "ok" | "bad"; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-15} y={-11} width={30} height={22} rx={4} className={`ds-env ink ${tone === "bad" ? "is-bad" : ""}`} />
      <path d="M-14 -9l14 10 14 -10" className="ds-env-flap" />
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

  const added = after.records.length - before.records.length;
  if (added > 0) {
    const a = before.records.length;
    const b = after.records.length - 1;
    const r = a === b ? `${a}` : `${a}–${b}`;
    out.push({ kind: "add", text: both(`+${added} sipariş yazıldı (offset ${r})`, `+${added} order${added > 1 ? "s" : ""} written (offset ${r})`) });
  }
  if (events.some((e) => e.type === "dedupe" && e.on)) {
    out.push({ kind: "good", text: both("Gönderilenler defteri açıldı", "The already-sent list is on") });
  }
  if (events.some((e) => e.type === "crashed")) {
    out.push({ kind: "bad", text: both("E-posta servisi çöktü, belleği silindi", "The email service crashed and lost its memory") });
  }
  for (const e of events) {
    if (e.type !== "restarted") continue;
    out.push({ kind: "good", text: both(`Yeniden başladı: kayıtlı konumdan, offset ${e.from} noktasından devam`, `Restarted from the saved position, offset ${e.from}`) });
  }
  const sentNew = events.filter((e) => e.type === "sent" && e.times === 1).length;
  if (sentNew > 0) out.push({ kind: "good", text: both(`${sentNew} e-posta gönderildi`, `${sentNew} email${sentNew > 1 ? "s" : ""} sent`) });
  const lostNew = lostOffsets(after).filter((o) => !lostOffsets(before).includes(o));
  if (lostNew.length > 0) {
    out.push({ kind: "bad", text: both(`Offset ${lostNew.join(", ")}: e-posta hiç gitmedi`, `Offset ${lostNew.join(", ")}: the email never went out`) });
  }
  const dups = duplicateCount(after) - duplicateCount(before);
  if (dups > 0) out.push({ kind: "bad", text: both(`${dups} e-posta ikinci kez gitti`, `${dups} email${dups > 1 ? "s" : ""} sent a second time`) });
  const skips = after.skips - before.skips;
  if (skips > 0) out.push({ kind: "good", text: both(`Defter ${skips} tekrarı yakaladı`, `The list caught ${skips} repeat${skips > 1 ? "s" : ""}`) });
  if (after.committed !== before.committed) {
    out.push({ kind: "change", text: both(`Commit edilen offset: ${before.committed} → ${after.committed}`, `Committed offset: ${before.committed} → ${after.committed}`) });
  }
  if (step === 0) out.push({ kind: "add", text: both("E-posta servisi offset 0'dan okumaya hazır", "The email service is ready to read from offset 0") });
  return out;
}
