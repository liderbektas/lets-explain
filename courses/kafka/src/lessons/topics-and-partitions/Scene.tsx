import { groupStats } from "../../engine/cluster";
import { l } from "@lets-explain/core/i18n";
import { Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { describeTopicEvents } from "../shared/describeTopic";
import { topicChanges } from "../shared/topicChanges";
import { lanesOf, waiting } from "../shared/topicSim";
import { FlagSwatch, MiniCube, orderText, TopicLessonScene, type SandboxApi, type SceneView } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  activeReaders,
  base,
  GROUP,
  MAX_PARTITIONS,
  MAX_READERS,
  readerDef,
  sandboxMoves,
  sandboxStart,
  SANDBOX_STEP,
  stepActions,
  TOPIC,
} from "./model";

const SLUG = "topics-and-partitions";

const text = {
  label: l(
    "orders topic'i: her partition bir bant, Fatura okuyucuları bantların solunda",
    "The orders topic: each partition a belt, the billing readers at the left end",
  ),
  producer: l("Sipariş servisi", "Order service"),
  partitions: l("Partition", "Partitions"),
  records: l("Toplam kayıt", "Total records"),
  lag: l("Fatura lag", "Billing lag"),
  readers: l("Okuyucu", "Readers"),
  readNow: l("Son turda okunan", "Read last round"),
  legendParcel: l("kayıt (üstünde offset)", "record (offset on top)"),
  legendFlag: l("bayrak = o partition'da sıradaki offset", "flag = next offset on that partition"),
  legendTag: l("P0, P1… = partition numarası", "P0, P1… = partition number"),
  log: l("Topic", "Topic"),
  group: l("Fatura group", "Billing group"),
  write: l("Sipariş yaz (key'siz)", "Write order (no key)"),
  grow: l("Partition ekle", "Add partition"),
  addReader: l("Okuyucu ekle", "Add reader"),
  removeReader: l("Okuyucu çıkar", "Remove reader"),
  tick: l("Herkes 1 okusun", "Everyone reads 1"),
  oneLane: l("Tek şerit: okuyucu yetişemiyor", "One lane: the reader can't keep up"),
  stayed: l("Eski kayıtlar P0'da kaldı", "Old records stayed in P0"),
  noOrder: l("P2'nin yenisi, P0'nun eskisinden önce okundu", "P2's newest was read before P0's older ones"),
  bench: l("Fatura 4 boşta: partition kalmadı", "Billing 4 is idle: no partition left"),
};

function readersOf(view: SceneView) {
  const group = view.state.groups[GROUP];
  if (!group) return [];
  return group.members.map((m) => {
    const def = readerDef(m.id);
    const readNow = view.last.some((e) => e.type === "delivered" && e.member === m.id);
    const committedNow = view.last.some((e) => e.type === "committed" && e.member === m.id);
    return {
      id: m.id,
      name: view.t(def.name),
      tint: def.tint,
      pulse: view.pulse,
      state: readNow ? ("hop" as const) : committedNow ? ("happy" as const) : ("idle" as const),
      lanes: lanesOf(view.state, GROUP, m.id, TOPIC),
    };
  });
}

const config = {
  slug: SLUG,
  topic: TOPIC,
  base,
  stepActions,
  sandboxStep: SANDBOX_STEP,
  sandboxStart,
  missions,
  label: text.label,
  producerName: text.producer,
  readers: readersOf,
  tintOf: (_g: string, member: string) => readerDef(member).tint,
  metrics: (view: SceneView) => {
    const t = view.t;
    const parts = view.state.topics[TOPIC]!.partitions;
    const lastRead = view.last.filter((e) => e.type === "delivered").length;
    return [
      { label: t(text.partitions), value: parts.length },
      { label: t(text.records), value: parts.reduce((sum, p) => sum + p.records.length, 0) },
      { label: t(text.readers), value: view.state.groups[GROUP]?.members.length ?? 0, dot: TINTS.coral.body },
      {
        label: t(text.lag),
        value: view.state.groups[GROUP] ? (view.sandbox ? waiting(view.state, GROUP, TOPIC) : groupStats(view.state, GROUP).lag) : "—",
      },
      ...(view.sandbox ? [{ label: t(text.readNow), value: lastRead, tone: lastRead >= 3 ? ("ok" as const) : ("plain" as const) }] : []),
    ];
  },
  legend: (view: SceneView) => [
    { swatch: <MiniCube fill="var(--mint)" />, label: view.t(text.legendParcel) },
    { swatch: <FlagSwatch fill="var(--coral)" />, label: view.t(text.legendFlag) },
    {
      swatch: (
        <g>
          <rect x={-10} y={-7} width={20} height={13} rx={6.5} fill="var(--ink)" />
          <text y={3} textAnchor="middle" style={{ fill: "var(--card)", fontSize: 8, fontWeight: 800 }}>
            P0
          </text>
        </g>
      ),
      label: view.t(text.legendTag),
    },
  ],
  describe: (events: Parameters<typeof describeTopicEvents>[0], view: SceneView) =>
    describeTopicEvents(events, view.lang, {
      member: (_g, m) => view.t(readerDef(m).name),
      value: (v) => orderText(v, view.lang),
    }),
  // Step 7 is about where partitions live, so their tags name the broker too.
  partitionLabel: (i: number, view: SceneView) => {
    if (view.step !== 6) return `P${i}`;
    const leader = view.state.topics[TOPIC]!.partitions[i]!.leader;
    return `P${i}·B${leader}`;
  },
  controls: (api: SandboxApi, view: SceneView) => {
    const t = view.t;
    const s = api.state;
    const written = api.moves.flat().filter((a) => a.type === "produce").length;
    const parts = s.topics[TOPIC]!.partitions.length;
    const readers = activeReaders(s).length;
    return (
      <>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.log)}
          </span>
          <button className="chip-btn is-producer" disabled={api.locked} onClick={() => api.press(sandboxMoves.write(written))}>
            {t(text.write)}
          </button>
          <button className="chip-btn" disabled={api.locked || parts >= MAX_PARTITIONS} onClick={() => api.press(sandboxMoves.grow(s))}>
            {t(text.grow)}
          </button>
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: TINTS.coral.body }} />
            {t(text.group)}
          </span>
          <button className="chip-btn is-ok" disabled={api.locked || readers >= MAX_READERS} onClick={() => api.press(sandboxMoves.addReader(s))}>
            {t(text.addReader)}
          </button>
          <button className="chip-btn" disabled={api.locked || readers === 0} onClick={() => api.press(sandboxMoves.removeReader(s))}>
            {t(text.removeReader)}
          </button>
          <button className="chip-btn" disabled={api.locked || readers === 0} onClick={() => api.press(sandboxMoves.tick(s))}>
            {t(text.tick)}
          </button>
        </div>
      </>
    );
  },
  overlay: (view: SceneView) => {
    const done = view.pulse >= (stepActions[view.step]?.length ?? 0);
    if (!done) return null;
    const t = view.t;
    if (view.step === 1) return <Pill x={430} y={44} text={t(text.oneLane)} tone="danger" />;
    if (view.step === 2) return <Pill x={430} y={44} text={t(text.stayed)} tone="sun" />;
    if (view.step === 4) return <Pill x={430} y={44} text={t(text.noOrder)} tone="sun" />;
    if (view.step === 7) return <Pill x={430} y={44} text={t(text.bench)} tone="danger" />;
    return null;
  },
};

export function TopicsAndPartitionsScene(props: SceneProps) {
  return <TopicLessonScene {...props} config={config} />;
}

const names = {
  member: (_g: string, m: string) => readerDef(m).name,
  group: () => l("Fatura", "Billing"),
};

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const start = base.startOf(step);
  const end = base.ends[step]!;
  const before = base.run.states[start]!;
  const after = base.run.states[end]!;
  const events = base.run.events.slice(start, end).flat();
  const out = topicChanges(before, after, events, TOPIC, names);
  if (step === 0) out.unshift({ kind: "add", text: l("`orders` topic'i: tek partition (P0)", "The `orders` topic: one partition (P0)") });
  return out;
}
