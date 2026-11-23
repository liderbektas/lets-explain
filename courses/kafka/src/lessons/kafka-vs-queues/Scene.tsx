import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { kafkaShell, replayShell, type KafkaBox, type ShellAction } from "../../engine/cli";
import { groupStats } from "../../engine/cluster";
import type { Partition } from "../../engine/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { rel } from "@lets-explain/core/iso/geometry";
import { MiniWagon, RAIL_STAGE as STAGE, RailStage, type Reader } from "../../iso/RailStage";
import { NameTag, Track, Wagon } from "../../iso/rail";
import { CommitSeal, Person, Pill, TINTS, type ParcelState, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { describeEvents } from "../shared/describe";
import { kafkaCtx } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { FREE, scenarios } from "./scenarios";
import {
  ANALYTICS,
  base,
  BILLING,
  inQueue,
  kafkaPosition,
  kafkaSeen,
  orderNo,
  P,
  SANDBOX_STEP,
  stepActions,
  TOPIC,
  viewFor,
  type GroupRef,
  type QEvent,
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
  legendMsg: l("mesaj / kayıt = vagon (yanında numara)", "message / record = wagon (number on its side)"),
  legendHeld: l("tik = bir worker'ın elinde", "tick = held by a worker"),
  legendFlagQ: l("bayrak = worker'ın elindeki mesaj", "flag = the message a worker holds"),
  legendFlagK: l("bayrak = sıradaki okunacak offset", "flag = next offset to read"),
  legendSeal: l("mühür = commit edilen offset", "seal = committed offset"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir komut yaz; Kafka'da ne olduğunu burada sade bir dille gör.", "Type a command; see what happened in Kafka here, in plain words."),
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

/** Where a group reads next: the lesson's own reader, else whichever console consumer is in it, else its commit. */
function positionOf(s: VState, g: GroupRef): number | undefined {
  const own = kafkaPosition(s, g);
  if (own !== undefined) return own;
  const group = s.kafka.groups[g.group];
  if (!group) return undefined;
  return group.members[0]?.positions[P] ?? group.committed[P];
}

/** The end of the lesson; in the try-it step only its Kafka part is replaced by the terminal's. */
const LESSON_END = base.run.states[base.ends[SANDBOX_STEP]!]!;

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
  // The try-it step is typed in the Kafka world: the queue has no command line to type into.
  const view: View = sandbox ? "kafka" : viewFor(step);

  const stepCount = sandbox ? 0 : stepActions[step]!.length;
  // The groups picture has no simulation; it plays two phases instead (a member joins, then rebalances).
  const phases = view === "groups" ? 2 : 0;
  const cursor = usePlayback(stepCount + phases, paused, `${step}-${replayKey}`);

  let state: VState;
  let lastEvents: QEvent[];
  let shown: QEvent[];
  if (box.run) {
    state = { ...LESSON_END, kafka: box.run.boxes[box.run.boxes.length - 1]!.cluster };
    const withEvents = box.run.events.filter((e) => e.length > 0);
    lastEvents = withEvents.length ? [{ type: "kafka", events: withEvents[withEvents.length - 1]! }] : [];
    shown = withEvents.map((events) => ({ type: "kafka", events }));
  } else {
    const start = base.startOf(step);
    const c = Math.min(cursor, stepCount);
    state = base.run.states[start + c]!;
    lastEvents = c > 0 ? base.run.events[start + c - 1]! : [];
    shown = base.run.events.slice(start, start + c).flat();
  }

  const pulse = box.run ? box.run.events.length : cursor;
  const q = state.queue;

  /* ---- drawing per view */
  let drawing: ReactNode = null;
  let metrics: Metric[] = [];
  const legend: LegendItem[] = [{ swatch: <MiniWagon kind="order" />, label: t(text.legendMsg) }];

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
      <RailStage
        partition={queuePartition(state)}
        readers={readers}
        producerName={t(text.producer)}
        producerState={lastEvents.some((e) => e.type === "written") ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={() => "order"}
        labels={{ next: t(text.queueNext), retention: t(text.shredder) }}
        removal="lift"
      />
    );
    // The queue is only drawn while the lesson plays, never in the typed try-it step.
    const deleted = Object.keys(q.acked).length;
    const again = q.deliveries.filter((d, i) => q.deliveries.findIndex((x) => x.id === d.id) !== i).length;
    metrics = [
      { label: t(text.waitingMetric), value: inQueue(q).length },
      { label: t(text.deletedMetric), value: deleted },
      { label: t(text.againMetric), value: again, tone: again > 0 ? "warn" : "plain" },
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
        position: positionOf(state, g),
        committed: state.kafka.groups[g.group]!.committed[P],
        pulse,
        state: readNow ? "hop" : "idle",
      };
    });
    drawing = (
      <RailStage
        partition={part}
        readers={readers}
        producerName={t(text.producer)}
        producerState={lastEvents.some((e) => e.type === "written" || (e.type === "kafka" && e.events.some((x) => x.type === "produced"))) ? "hop" : "idle"}
        producerPulse={pulse}
        marks={marks}
        kindOf={() => "order"}
        labels={{ next: t(text.next), retention: "" }}
        removal="none"
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
      width={STAGE.width}
      height={STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      {drawing}
      {/* Top right is free in every view; the head of the line is at top left. */}
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
            <Track s={s} from={-0.2} to={6.8} />
            {[0, 1, 2, 3, 4].map((i) => {
              const [x, y] = rel(s, 0.55 + i * 1.1, 0);
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <Wagon s={s} label={i} />
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
