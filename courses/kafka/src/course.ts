import { l } from "@lets-explain/core/i18n";
import type { Chapter, Lesson, LessonEntry } from "@lets-explain/core/course/types";

/**
 * Every lesson lives in its own folder as `<slug>/lesson.ts` and is picked up here by slug,
 * so adding a lesson never means editing this file's imports. A slug without a folder yet
 * shows as "soon".
 */
const modules = import.meta.glob<Record<string, unknown>>("./lessons/*/lesson.ts", { eager: true });
const written = new Map<string, Lesson>();
for (const mod of Object.values(modules)) {
  for (const value of Object.values(mod)) {
    if (value && typeof value === "object" && "slug" in value && "steps" in value) {
      const lesson = value as Lesson;
      written.set(lesson.slug, lesson);
    }
  }
}

const soon = (slug: string, tr: string, en: string): LessonEntry => {
  const lesson = written.get(slug);
  return lesson ? { slug, title: lesson.title, lesson } : { slug, title: l(tr, en) };
};

export const chapters: Chapter[] = [
  {
    id: "foundations",
    title: l("Temeller", "Foundations"),
    lessons: [
      soon("why-kafka", "Neden Kafka?", "Why Kafka?"),
      soon("log-and-offset", "Log ve Offset", "The Log and Offsets"),
    ],
  },
  {
    id: "core",
    title: l("Çekirdek", "Core"),
    lessons: [
      soon("topics-and-partitions", "Topic ve Partition", "Topics & Partitions"),
      soon("producers-and-keys", "Producer ve Key'ler", "Producers & Keys"),
      soon("consumer-groups", "Consumer Group'lar", "Consumer Groups"),
      soon("brokers-and-clusters", "Broker ve Cluster", "Brokers & Clusters"),
    ],
  },
  {
    id: "reliability",
    title: l("Güvenilirlik", "Reliability"),
    lessons: [
      soon("replication", "Replikasyon", "Replication"),
      soon("acks-and-isr", "acks ve ISR", "acks & ISR"),
      soon("delivery-semantics", "Teslim garantileri", "Delivery Guarantees"),
      soon("idempotence-and-transactions", "Idempotence ve Transaction", "Idempotence & Transactions"),
    ],
  },
  {
    id: "storage",
    title: l("Depolama", "Storage"),
    lessons: [
      soon("segments-and-retention", "Segment ve Retention", "Segments & Retention"),
      soon("log-compaction", "Log Compaction", "Log Compaction"),
      soon("why-fast", "Kafka neden hızlı?", "Why Is Kafka Fast?"),
    ],
  },
  {
    id: "coordination",
    title: l("Koordinasyon", "Coordination"),
    lessons: [soon("kraft", "KRaft ve Controller", "KRaft & the Controller")],
  },
  {
    id: "ecosystem",
    title: l("Ekosistem", "Ecosystem"),
    lessons: [
      soon("schema-registry", "Schema Registry", "Schema Registry"),
      soon("kafka-connect", "Kafka Connect", "Kafka Connect"),
      soon("kafka-streams", "Kafka Streams", "Kafka Streams"),
    ],
  },
  {
    id: "practice",
    title: l("Pratikte", "In Practice"),
    lessons: [
      soon("ordering", "Sıralama garantileri", "Ordering Guarantees"),
      soon("consumer-lag", "Consumer lag", "Consumer Lag"),
      soon("kafka-vs-queues", "Kafka ve klasik kuyruklar", "Kafka vs. Classic Queues"),
    ],
  },
];
