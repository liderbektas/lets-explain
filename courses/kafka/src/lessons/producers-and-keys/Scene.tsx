import { groupStats } from "../../engine/cluster";
import { l, type Lang } from "@lets-explain/core/i18n";
import { Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { describeTopicEvents } from "../shared/describeTopic";
import { topicChanges } from "../shared/topicChanges";
import { lanesOf } from "../shared/topicSim";
import { MiniCube, TopicLessonScene, type SceneView } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { scenarios, FREE } from "./scenarios";
import {
  base,
  CUSTOMERS,
  customerOf,
  GROUP,
  READERS,
  readerDef,
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
  // Typed in the terminal: the key names the customer and the value is the event alone.
  if (!value.includes(":")) return kindText[value]?.[lang] ?? value;
  const [who, what] = value.split(":");
  const c = customerOf(value);
  if (!c) return `${lang === "tr" ? "sipariş" : "order"} ${what ?? who}`;
  return `${c.name[lang]} · ${kindText[what ?? "order"]?.[lang] ?? what}`;
}

function readersOf(view: SceneView) {
  const group = view.state.groups[GROUP];
  if (!group) return [];
  return group.members.map((m, i) => {
    const known = READERS.some((r) => r.id === m.id);
    const def = known ? readerDef(m.id) : { name: l(m.id.replace("console-consumer-", "consumer "), m.id.replace("console-consumer-", "consumer ")), tint: READERS[i % READERS.length]!.tint };
    const readNow = view.last.some((e) => e.type === "delivered" && e.member === m.id);
    return {
      id: m.id,
      name: view.t(def.name),
      tint: def.tint,
      pulse: view.pulse,
      state: readNow ? ("hop" as const) : ("idle" as const),
      lanes: lanesOf(view.state, GROUP, m.id, view.topic),
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
  missions: [],
  scenarios,
  freeStart: FREE,
  label: text.label,
  producerName: text.producer,
  readers: readersOf,
  tintOf: (_g: string, member: string) => readerDef(member).tint,
  look: (record: { value: string; key: string | null }) => {
    const c = customerOf(record.value) ?? CUSTOMERS.find((x) => x.key === record.key);
    return c ? { shades: c.shades } : {};
  },
  metrics: (view: SceneView) => {
    const t = view.t;
    const parts = view.state.topics[view.topic]?.partitions ?? [];
    const counts = parts.map((p) => p.records.length);
    const max = counts.length ? Math.max(...counts) : 0;
    const min = counts.length ? Math.min(...counts) : 0;
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
  controls: () => null,
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
