import { groupStats } from "../../engine/cluster";
import { l, type Lang } from "@lets-explain/core/i18n";
import { Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { describeTopicEvents } from "../shared/describeTopic";
import { topicChanges } from "../shared/topicChanges";
import { lanesOf } from "../shared/topicSim";
import { MiniCube, TopicLessonScene, type SandboxApi, type SceneView } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  base,
  CUSTOMERS,
  customerOf,
  GROUP,
  MAX_PARTITIONS,
  readerDef,
  sandboxMoves,
  sandboxStart,
  SANDBOX_STEP,
  stepActions,
  TOPIC,
} from "./model";

const SLUG = "producers-and-keys";

const text = {
  label: l(
    "orders topic'i: kayıtlar müşteriye göre renkli, her partition bir bant",
    "The orders topic: records coloured by customer, each partition a belt",
  ),
  producer: l("Sipariş servisi", "Order service"),
  partitions: l("Partition", "Partitions"),
  perPartition: l("Kayıt / partition", "Records / partition"),
  lag: l("Kargo lag", "Shipping lag"),
  keyless: l("key'siz kayıt", "record without a key"),
  write: l("Yaz", "Write"),
  keylessBtn: l("Key'siz yaz", "Write without key"),
  grow: l("Partition ekle", "Add partition"),
  topic: l("Topic", "Topic"),
  scattered: l("Ali'nin 3 olayı 3 ayrı partition'da", "Ali's 3 events in 3 different partitions"),
  together: l("key = ali → üçü de P0'da, sırayla", "key = ali → all three in P0, in order"),
  formula: l("partition = murmur2(key) % 3", "partition = murmur2(key) % 3"),
  shared: l("Ali ve Can aynı partition'da: P0", "Ali and Can share a partition: P0"),
  hot: l("P0 sıcak: tek okuyucu yetişemiyor", "P0 is hot: one reader can't keep up"),
  moved: l("Ali'nin yenisi P3'te, eskileri P0'da", "Ali's new one is in P3, the old ones in P0"),
  manual: l("partition = 0 elle seçildi, key'e bakılmadı", "partition = 0 chosen by hand, key ignored"),
};

const kindText: Record<string, { tr: string; en: string }> = {
  order: { tr: "sipariş", en: "order" },
  address: { tr: "adres değişikliği", en: "address change" },
  cancel: { tr: "iptal", en: "cancel" },
  gift: { tr: "hediye paketi", en: "gift wrap" },
};

export function valueText(value: string, lang: Lang) {
  const [who, what] = value.split(":");
  const c = customerOf(value);
  if (!c) return `${lang === "tr" ? "sipariş" : "order"} ${what ?? who}`;
  return `${c.name[lang]} · ${kindText[what ?? "order"]?.[lang] ?? what}`;
}

function readersOf(view: SceneView) {
  const group = view.state.groups[GROUP];
  if (!group) return [];
  return group.members.map((m) => {
    const def = readerDef(m.id);
    const readNow = view.last.some((e) => e.type === "delivered" && e.member === m.id);
    return {
      id: m.id,
      name: view.t(def.name),
      tint: def.tint,
      pulse: view.pulse,
      state: readNow ? ("hop" as const) : ("idle" as const),
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
  look: (record: { value: string }) => {
    const c = customerOf(record.value);
    return c ? { shades: c.shades } : {};
  },
  metrics: (view: SceneView) => {
    const t = view.t;
    const parts = view.state.topics[TOPIC]!.partitions;
    const counts = parts.map((p) => p.records.length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    return [
      { label: t(text.partitions), value: parts.length },
      { label: t(text.perPartition), value: counts.join(" · "), tone: max - min >= 5 ? ("warn" as const) : ("plain" as const) },
      ...(view.state.groups[GROUP]
        ? [{ label: t(text.lag), value: groupStats(view.state, GROUP).lag, dot: TINTS.coral.body }]
        : []),
    ];
  },
  legend: (view: SceneView) => [
    ...CUSTOMERS.map((c) => ({ swatch: <MiniCube fill={c.shades[0]} />, label: view.t(c.name) })),
    { swatch: <MiniCube fill="var(--mint)" />, label: view.t(text.keyless) },
  ],
  describe: (events: Parameters<typeof describeTopicEvents>[0], view: SceneView) =>
    describeTopicEvents(events, view.lang, {
      member: (_g, m) => view.t(readerDef(m).name),
      value: (v) => valueText(v, view.lang),
      key: (k) => k,
    }),
  controls: (api: SandboxApi, view: SceneView) => {
    const t = view.t;
    const s = api.state;
    const keyless = api.moves.flat().filter((a) => a.type === "produce" && a.key === null).length;
    return (
      <>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.write)}
          </span>
          {CUSTOMERS.map((c) => (
            <button
              key={c.key}
              className="chip-btn"
              style={{ background: c.shades[0] }}
              disabled={api.locked}
              onClick={() => api.press(sandboxMoves.customer(c.key))}
            >
              key = {c.key}
            </button>
          ))}
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--mint)" }} />
            {t(text.topic)}
          </span>
          <button className="chip-btn is-producer" disabled={api.locked} onClick={() => api.press(sandboxMoves.keyless(keyless))}>
            {t(text.keylessBtn)}
          </button>
          <button
            className="chip-btn"
            disabled={api.locked || s.topics[TOPIC]!.partitions.length >= MAX_PARTITIONS}
            onClick={() => api.press(sandboxMoves.grow(s))}
          >
            {t(text.grow)}
          </button>
        </div>
      </>
    );
  },
  overlay: (view: SceneView) => {
    const done = view.pulse >= (stepActions[view.step]?.length ?? 0);
    if (!done || view.sandbox) return null;
    const t = view.t;
    const pills: Record<number, [string, "danger" | "sun" | "ok" | "ink"]> = {
      1: [t(text.scattered), "danger"],
      2: [t(text.together), "ok"],
      3: [t(text.formula), "ink"],
      4: [t(text.shared), "sun"],
      5: [t(text.hot), "danger"],
      6: [t(text.moved), "danger"],
      7: [t(text.manual), "sun"],
    };
    const pill = pills[view.step];
    return pill ? <Pill x={430} y={40} text={pill[0]} tone={pill[1]} /> : null;
  },
};

export function ProducersAndKeysScene(props: SceneProps) {
  return <TopicLessonScene {...props} config={config} />;
}

const names = {
  member: (_g: string, m: string) => readerDef(m).name,
  group: () => l("Kargo", "Shipping"),
};

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const start = base.startOf(step);
  const end = base.ends[step]!;
  const events = base.run.events.slice(start, end).flat();
  const out = topicChanges(base.run.states[start]!, base.run.states[end]!, events, TOPIC, names);
  // Where each customer's events went in this step: the point of the lesson.
  const where = new Map<string, Set<number>>();
  for (const e of events) {
    if (e.type !== "produced") continue;
    const c = customerOf(e.value);
    if (!c) continue;
    if (!where.has(c.key)) where.set(c.key, new Set());
    where.get(c.key)!.add(e.partition);
  }
  for (const [key, parts] of where) {
    const c = CUSTOMERS.find((x) => x.key === key)!;
    const list = [...parts].map((p) => `P${p}`).join(", ");
    out.unshift({
      kind: parts.size > 1 ? "bad" : "change",
      text:
        parts.size > 1
          ? l(`${c.of.tr} olayları dağıldı: ${list}`, `${c.of.en} events scattered: ${list}`)
          : l(`${c.name.tr} → ${list}`, `${c.name.en} → ${list}`),
    });
  }
  return out;
}
