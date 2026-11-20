import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { groupStats } from "../../engine/cluster";
import type { Partition } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { rel } from "@lets-explain/core/iso/geometry";
import { NameTag, PartitionStage, STAGE, type Reader } from "../../iso/PartitionStage";
import { Belt, CommitSeal, Parcel, Person, Pill, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { describeEvents } from "../shared/describe";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { missions, missionView } from "./missions";
import {
  ack,
  ANALYTICS,
  base,
  BILLING,
  canDo,
  crash,
  inQueue,
  kafkaPosition,
  kafkaSeen,
  kCommit,
  kRead,
  kRewind,
  orderNo,
  P,
  restart,
  run,
  SANDBOX_STEP,
  sandboxStart,
  stepActions,
  take,
  TOPIC,
  viewFor,
  write,
  type GroupRef,
  type QEvent,
  type VAction,
  type View,
  type VState,
  type Worker,
} from "./model";

const SLUG = "kafka-vs-queues";

const WORKER_TINT: Record<Worker, Tint> = { a: TINTS.coral, b: TINTS.mint, c: TINTS.lilac };
const GROUP_TINT: Record<string, Tint> = { billing: TINTS.coral, analytics: TINTS.lilac };

const text = {
  label: l(
    "Solda klasik bir mesaj kuyruğu, sonra aynı siparişlerin Kafka topic'i. Kuyrukta onaylanan mesaj silinir; Kafka'da kayıtlar kalır.",
    "A classic message queue, then the same orders in a Kafka topic. In the queue an acknowledged message is deleted; in Kafka records stay.",
  ),
  producer: l("Sipariş servisi", "Order service"),
  worker: { a: l("Worker A", "Worker A"), b: l("Worker B", "Worker B"), c: l("Analitik", "Analytics") } as Record<Worker, L>,
  billing: l("Fatura", "Billing"),
  analytics: l("Analitik", "Analytics"),
  queueTitle: l("Klasik mesaj kuyruğu", "Classic message queue"),
  kafkaTitle: l("Kafka topic'i: orders", "Kafka topic: orders"),
  groupsTitle: l("Kafka: bir group içinde iş paylaşımı", "Kafka: sharing work inside a group"),
  queueNext: l("yeni mesaj", "new message"),
  next: l("sıradaki", "next"),
  shredder: l("ack = sil", "ack = delete"),
  waitingMetric: l("Kuyrukta", "In queue"),
  deletedMetric: l("Silinen (ack)", "Deleted (ack)"),
  againMetric: l("Yeniden teslim", "Redelivered"),
  onLog: l("Log'daki kayıt", "Records on log"),
  lag: l("lag", "lag"),
  partitions: l("Partition", "Partitions"),
  members: l("Group üyesi", "Group members"),
  yours: l("(senin)", "(yours)"),
  legendMsg: l("mesaj / kayıt (üstünde numara)", "message / record (number on top)"),
  legendHeld: l("tik = bir worker'ın elinde", "tick = held by a worker"),
  legendFlagQ: l("bayrak = worker'ın elindeki mesaj", "flag = the message a worker holds"),
  legendFlagK: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  legendSeal: l("mühür = commit edilen offset", "seal = committed offset"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  view: l("Görünüm", "View"),
  viewQueue: l("Kuyruk", "Queue"),
  viewKafka: l("Kafka", "Kafka"),
  write: l("Sipariş yaz (ikisine de)", "Write order (to both)"),
  takeBtn: l("Al", "Take"),
  ackBtn: l("Onayla (ack)", "Ack"),
  crashBtn: l("Çökert", "Crash"),
  startBtn: l("Başlat", "Start"),
  readBtn: l("Oku", "Read"),
  commitBtn: l("Commit", "Commit"),
  rewindBtn: l("Başa sar", "Rewind"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  pBilling0: l("Fatura-1 → partition 0", "Billing-1 → partition 0"),
  pBilling1: l("Fatura-2 → partition 1", "Billing-2 → partition 1"),
  idle: l("Fatura-3: boşta, partition yok", "Billing-3: idle, no partition"),
  joins: l("Fatura-3 katılıyor…", "Billing-3 joins…"),
  useQueue: l("Kuyruk: iş dağıtımı, mesaj başına onay", "Queue: hand out tasks, ack per message"),
  useKafka: l("Kafka: olay akışı, çok okuyucu, yeniden okuma", "Kafka: event streams, many readers, replay"),
  stuck: l("Kafka'da okunamayan bir kayıt partition'ı tıkar", "In Kafka, a record that fails blocks its partition"),
  share: l("Share group: kayıt başına onay (KIP-932)", "Share group: ack per record (KIP-932)"),
  shareMore: l("partition'dan çok consumer olabilir", "more consumers than partitions"),
};

/* ------------------------------------------------------------- partitions */

function queuePartition(s: VState): Partition {
  const ids = inQueue(s.queue);
  return {
    topic: "queue",
    index: 0,
    leader: 1,
    logStartOffset: ids.length ? ids[0]! : s.orders,
    logEndOffset: s.orders,
    records: ids.map((id) => ({ offset: id, key: null, value: `order:${id}`, producer: "orders", time: 0 })),
  };
}

const kafkaPartition = (s: VState) => s.kafka.topics[TOPIC]!.partitions[0]!;

/* ----------------------------------------------------------------- events */

interface Line {
  text: string;
  tone: "produce" | "read" | "bad" | "ok" | "plain";
}

function describe(events: QEvent[], lang: Lang, t: (x: L) => string): Line[] {
  const tr = lang === "tr";
  const w = (x: Worker) => t(text.worker[x]);
  const names = {
    group: (id: string) => t(id === BILLING.group ? text.billing : text.analytics),
    value: (v: string) => (tr ? `sipariş ${v.split(":")[1]}` : `order ${v.split(":")[1]}`),
  };
  return events.flatMap((e): Line[] => {
    switch (e.type) {
      case "written":
        return [
          {
            tone: "produce",
            text: tr ? `Sipariş ${orderNo(e.id)} yazıldı: kuyruğa ve Kafka'ya` : `Order ${orderNo(e.id)} written: to the queue and to Kafka`,
          },
        ];
      case "joined":
        return [{ tone: "plain", text: tr ? `${w(e.w)} kuyruğa bağlandı` : `${w(e.w)} connected to the queue` }];
      case "taken":
        return [
          {
            tone: e.again ? "bad" : "read",
            text: tr
              ? `${w(e.w)} mesaj ${e.id}'i aldı${e.again ? " (yeniden teslim)" : ""}. Başka kimse onu görmüyor`
              : `${w(e.w)} took message ${e.id}${e.again ? " (redelivered)" : ""}. Nobody else sees it`,
          },
        ];
      case "empty":
        return [
          {
            tone: "bad",
            text: tr ? `${w(e.w)}: kuyruk boş. Önceki mesajlar silindi, geçmiş yok` : `${w(e.w)}: the queue is empty. Earlier messages were deleted; there is no history`,
          },
        ];
      case "acked":
        return [{ tone: "ok", text: tr ? `${w(e.w)} onayladı: mesaj ${e.id} kuyruktan silindi` : `${w(e.w)} acked: message ${e.id} deleted from the queue` }];
      case "crashed":
        return [
          {
            tone: "bad",
            text:
              e.requeued !== null
                ? tr
                  ? `${w(e.w)} çöktü! Onaylanmamış mesaj ${e.requeued} kuyruğa geri döndü`
                  : `${w(e.w)} crashed! Unacked message ${e.requeued} went back to the queue`
                : tr
                  ? `${w(e.w)} çöktü!`
                  : `${w(e.w)} crashed!`,
          },
        ];
      case "restarted":
        return [{ tone: "plain", text: tr ? `${w(e.w)} yeniden başladı` : `${w(e.w)} restarted` }];
      case "kafka":
        return describeEvents(e.events, lang, names).map((x) => ({ text: `Kafka · ${x.text}`, tone: x.tone }));
    }
  });
}

/* ------------------------------------------------------------------ scene */

export function KafkaVsQueuesScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [extra, setExtra] = useState<VAction[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });
  const [sandboxView, setSandboxView] = useState<"queue" | "kafka">(() => missionView[missions[missionIndex ?? 0]?.id ?? ""] ?? "queue");
  const view: View = sandbox ? sandboxView : viewFor(step);

  const stepCount = sandbox ? 0 : stepActions[step]!.length;
  // The groups picture has no simulation; it plays two phases instead (a member joins, then rebalances).
  const phases = view === "groups" ? 2 : 0;
  const cursor = usePlayback(stepCount + phases, paused, `${step}-${replayKey}`);
  const sandboxRun = useMemo(() => (sandbox ? run(extra, sandboxStart) : null), [sandbox, extra]);

  let state: VState;
  let lastEvents: QEvent[];
  let shown: QEvent[];
  if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shown = sandboxRun.events.flat();
  } else {
    const start = base.startOf(step);
    const c = Math.min(cursor, stepCount);
    state = base.run.states[start + c]!;
    lastEvents = c > 0 ? base.run.events[start + c - 1]! : [];
    shown = base.run.events.slice(start, start + c).flat();
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
    const v = i === null ? null : missionView[missions[i]!.id];
    if (v) setSandboxView(v);
  };
  const act = (a: VAction) => {
    if (!locked) setExtra((xs) => [...xs, a]);
  };

  const pulse = sandbox ? extra.length : cursor;
  const q = state.queue;

  /* ---- drawing per view */
  let drawing: ReactNode = null;
  let metrics: Metric[] = [];
  const legend: LegendItem[] = [{ swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendMsg) }];
  const yours = sandbox ? ` ${t(text.yours)}` : "";

  if (view === "queue") {
    const marks = new Map<number, { state: ParcelState; tint?: Tint; to?: string }>();
    for (const w of ["a", "b", "c"] as Worker[]) {
      const id = q.inflight[w];
      // A message taken in this action is delivered to its worker; the broker keeps it until the ack.
      const takenNow = lastEvents.some((e) => e.type === "taken" && e.w === w && e.id === id);
      if (id !== null) marks.set(id, { state: "read", tint: WORKER_TINT[w], to: takenNow ? w : undefined });
    }
    const readers: Reader[] = (["a", "b", "c"] as Worker[])
      .filter((w) => q.joined[w])
      .map((w) => {
        const acting = lastEvents.some((e) => (e.type === "taken" || e.type === "acked" || e.type === "empty") && e.w === w);
        return {
          id: w,
          name: t(text.worker[w]),
          tint: WORKER_TINT[w],
          position: q.inflight[w] ?? undefined,
          pulse,
          state: !q.alive[w] ? "crashed" : acting ? (lastEvents.some((e) => e.type === "empty") ? "busy" : "hop") : "idle",
        } satisfies Reader;
      });
    drawing = (
      <PartitionStage
        partition={queuePartition(state)}
        readers={readers}
        producerName={t(text.producer)}
        producerState={lastEvents.some((e) => e.type === "written") ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={() => "order"}
        labels={{ next: t(text.queueNext), retention: t(text.shredder) }}
      />
    );
    const startQ = sandbox ? sandboxStart.queue : null;
    const deleted = Object.keys(q.acked).length - (startQ ? Object.keys(startQ.acked).length : 0);
    const again = q.deliveries.filter((d, i) => q.deliveries.findIndex((x) => x.id === d.id) !== i).length;
    const againStart = startQ ? startQ.deliveries.filter((d, i) => startQ.deliveries.findIndex((x) => x.id === d.id) !== i).length : 0;
    metrics = [
      { label: t(text.waitingMetric), value: inQueue(q).length },
      { label: `${t(text.deletedMetric)}${yours}`, value: deleted },
      { label: `${t(text.againMetric)}${yours}`, value: again - againStart, tone: again - againStart > 0 ? "warn" : "plain" },
    ];
    legend.push(
      { swatch: <circle r={6} cy={-3} className="ink" style={{ fill: TINTS.coral.body }} />, label: t(text.legendHeld) },
      { swatch: <FlagSwatch />, label: t(text.legendFlagQ) },
    );
  } else if (view === "kafka") {
    const part = kafkaPartition(state);
    const marks = new Map<number, { state: ParcelState; tint?: Tint; to?: string }>();
    for (const e of lastEvents) {
      if (e.type !== "kafka") continue;
      for (const x of e.events) if (x.type === "delivered") marks.set(x.offset, { state: x.duplicate ? "dup" : "read", tint: GROUP_TINT[x.group], to: x.group });
    }
    const groups: GroupRef[] = [BILLING, ANALYTICS].filter((g) => state.kafka.groups[g.group]);
    const readers: Reader[] = groups.map((g) => {
      const readNow = lastEvents.some((e) => e.type === "kafka" && e.events.some((x) => x.type === "delivered" && x.group === g.group));
      return {
        id: g.group,
        name: t(g === BILLING ? text.billing : text.analytics),
        tint: GROUP_TINT[g.group]!,
        position: kafkaPosition(state, g),
        committed: state.kafka.groups[g.group]!.committed[P],
        pulse,
        state: readNow ? "hop" : "idle",
      };
    });
    drawing = (
      <PartitionStage
        partition={part}
        readers={readers}
        producerName={t(text.producer)}
        producerState={lastEvents.some((e) => e.type === "written") ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={() => "order"}
        labels={{ next: t(text.next), retention: "" }}
        showShredder={false}
      />
    );
    const lagOf = (g: GroupRef) => (state.kafka.groups[g.group] ? groupStats(state.kafka, g.group).lag : "—");
    metrics = [
      { label: t(text.onLog), value: part.records.length },
      { label: `${t(text.billing)} ${t(text.lag)}`, value: lagOf(BILLING), dot: GROUP_TINT.billing!.body },
      { label: `${t(text.analytics)} ${t(text.lag)}`, value: lagOf(ANALYTICS), dot: GROUP_TINT.analytics!.body },
    ];
    legend.push(
      { swatch: <FlagSwatch />, label: t(text.legendFlagK) },
      {
        swatch: (
          <g transform="translate(0 -3) scale(0.62)">
            <CommitSeal tint={TINTS.coral} label="" />
          </g>
        ),
        label: t(text.legendSeal),
      },
    );
  } else {
    drawing = <GroupsView phase={cursor} t={t} />;
    metrics = [
      { label: t(text.partitions), value: 2 },
      { label: t(text.members), value: cursor >= 1 ? 3 : 2 },
    ];
  }

  const title = view === "queue" ? text.queueTitle : view === "kafka" ? text.kafkaTitle : text.groupsTitle;

  /* ---- event list and sandbox */
  const lines = describe(shown, lang, t);
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

  const btn = (a: VAction, label: L, cls = "") => (
    <button key={`${JSON.stringify(a)}`} className={`chip-btn ${cls}`} disabled={locked || !canDo(state, a)} onClick={() => act(a)}>
      {t(label)}
    </button>
  );
  const workerRow = (w: Worker) => (
    <div className="control-row" key={w}>
      <span className="control-name">
        <i style={{ background: WORKER_TINT[w].body }} />
        {t(text.worker[w])}
      </span>
      {btn(take(w), text.takeBtn)}
      {btn(ack(w), text.ackBtn, "is-ok")}
      {q.alive[w] ? btn(crash(w), text.crashBtn, "is-danger toggle-btn") : btn(restart(w), text.startBtn, "is-ok toggle-btn")}
    </div>
  );
  const groupRow = (g: GroupRef) => (
    <div className="control-row" key={g.group}>
      <span className="control-name">
        <i style={{ background: GROUP_TINT[g.group]!.body }} />
        {t(g === BILLING ? text.billing : text.analytics)}
      </span>
      {btn(kRead(g), text.readBtn)}
      {btn(kCommit(g), text.commitBtn, "is-ok")}
      {g === BILLING && btn(kRewind(g), text.rewindBtn)}
    </div>
  );

  const footer = sandbox ? (
    <div className="sandbox">
      <MissionPanel missions={missions} active={missionIndex} onSelect={selectMission} moves={extra.length} won={won} best={best} />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        <div className="control-row">
          <span className="control-name">{t(text.view)}</span>
          <button className={`chip-btn ${sandboxView === "queue" ? "is-producer" : ""}`} aria-pressed={sandboxView === "queue"} onClick={() => setSandboxView("queue")}>
            {t(text.viewQueue)}
          </button>
          <button className={`chip-btn ${sandboxView === "kafka" ? "is-producer" : ""}`} aria-pressed={sandboxView === "kafka"} onClick={() => setSandboxView("kafka")}>
            {t(text.viewKafka)}
          </button>
          {btn(write, text.write, "is-producer")}
        </div>
        {sandboxView === "queue" ? (
          <>
            {workerRow("a")}
            {workerRow("b")}
          </>
        ) : (
          <>
            {groupRow(BILLING)}
            {groupRow(ANALYTICS)}
          </>
        )}
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
      {drawing}
      {/* Top right is free in every view; top left holds the shredder. */}
      <Pill x={STAGE.width - Math.round((t(title).length * 13 * 0.58 + 22) / 2) - 16} y={24} text={t(title)} tone="ink" size={13} animate={false} />
      <AnimatePresence>
        {step === 8 && (
          <g key="which">
            <Pill x={210} y={300} text={t(text.useQueue)} tone="sun" />
            <Pill x={220} y={334} text={t(text.useKafka)} tone="ok" />
            <Pill x={200} y={368} text={t(text.stuck)} tone="warn" />
          </g>
        )}
        {step === 9 && (
          <g key="share">
            <Pill x={190} y={318} text={t(text.share)} tone="ok" />
            <Pill x={150} y={352} text={t(text.shareMore)} tone="sun" />
          </g>
        )}
      </AnimatePresence>
    </SceneFrame>
  );
}

/** Two partitions, each owned by one member of the billing group; a third member has nothing to do. */
function GroupsView({ phase, t }: { phase: number; t: (x: L) => string }) {
  const s = 34;
  const lanes = [
    { ox: 170, oy: 96, tint: TINTS.coral, tag: text.pBilling0, member: "Fatura-1" },
    { ox: 170, oy: 252, tint: TINTS.mint, tag: text.pBilling1, member: "Fatura-2" },
  ];
  return (
    <g>
      {lanes.map((lane, li) => {
        const [px, py] = rel(s, 3.2, 1.9);
        return (
          <g key={li} transform={`translate(${lane.ox} ${lane.oy})`}>
            <Belt s={s} from={0} to={6.8} />
            {[0, 1, 2, 3, 4].map((i) => {
              const [x, y] = rel(s, 0.55 + i * 1.1, 0);
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <Parcel s={s} label={i} />
                </g>
              );
            })}
            <g transform={`translate(${px} ${py})`}>
              <Person tint={lane.tint} state="idle" />
              <NameTag y={20} text={lane.member} tint={lane.tint} />
            </g>
            <Pill x={-62} y={-4} text={`partition ${li}`} tone="plain" animate={false} />
            <Pill x={rel(s, 6.8, 0)[0] + 70} y={rel(s, 6.8, 0)[1] - 4} text={t(lane.tag)} tone="ok" />
          </g>
        );
      })}
      <AnimatePresence>
        {phase >= 1 && (
          <g key="third" transform="translate(690 330)">
            <Person tint={TINTS.lilac} state={phase >= 2 ? "busy" : "hop"} />
            <NameTag y={20} text="Fatura-3" tint={TINTS.lilac} />
          </g>
        )}
        {phase === 1 && <Pill key="joins" x={690} y={240} text={t(text.joins)} tone="plain" />}
        {phase >= 2 && <Pill key="idle" x={660} y={240} text={t(text.idle)} tone="warn" />}
      </AnimatePresence>
    </g>
  );
}

function FlagSwatch() {
  return (
    <g transform="translate(-6 5)">
      <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
      <path d="M0 -15h12l-2 3 2 3H0z" fill="var(--coral)" className="ink" />
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
  if (viewFor(step) === "groups") {
    return [
      { kind: "change", text: both("Her partition group içinde tek bir üyeye verildi", "Each partition went to exactly one member of the group") },
      { kind: "bad", text: both("Üçüncü üye boşta: 2 partition, 3 üye", "The third member is idle: 2 partitions, 3 members") },
    ];
  }
  const before = base.run.states[base.startOf(step)]!;
  const after = base.run.states[base.ends[step]!]!;
  const events = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const out: Change[] = [];
  const written = events.filter((e) => e.type === "written").length;
  if (written > 0) out.push({ kind: "add", text: both(`+${written} sipariş yazıldı`, `+${written} order${written > 1 ? "s" : ""} written`) });
  const deleted = Object.keys(after.queue.acked).length - Object.keys(before.queue.acked).length;
  if (deleted > 0) out.push({ kind: "remove", text: both(`Kuyruktan ${deleted} mesaj silindi`, `${deleted} message${deleted > 1 ? "s" : ""} deleted from the queue`) });
  for (const e of events) {
    if (e.type === "crashed" && e.requeued !== null) out.push({ kind: "bad", text: both(`Worker çöktü, mesaj ${e.requeued} kuyruğa geri döndü`, `A worker crashed; message ${e.requeued} went back to the queue`) });
    if (e.type === "taken" && e.again) out.push({ kind: "change", text: both(`Mesaj ${e.id} başka bir worker'a yeniden teslim edildi`, `Message ${e.id} was redelivered to another worker`) });
    if (e.type === "empty") out.push({ kind: "bad", text: both("Analitik kuyruğa bağlandı ama hiçbir geçmiş göremedi", "Analytics connected to the queue but saw no history") });
  }
  for (const g of [BILLING, ANALYTICS]) {
    const got = kafkaSeen(after, g).size - kafkaSeen(before, g).size;
    const name = g === BILLING ? both("Fatura", "Billing") : both("Analitik", "Analytics");
    if (got > 0) out.push({ kind: "good", text: both(`Kafka: ${name.tr} ${got} kayıt okudu`, `Kafka: ${name.en} read ${got} record${got > 1 ? "s" : ""}`) });
  }
  if (events.some((e) => e.type === "kafka") && after.kafka.topics[TOPIC]!.partitions[0]!.records.length === before.kafka.topics[TOPIC]!.partitions[0]!.records.length) {
    out.push({ kind: "good", text: both("Kafka'da hiçbir kayıt silinmedi", "No record was deleted in Kafka") });
  }
  return out;
}
