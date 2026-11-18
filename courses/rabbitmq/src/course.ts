import { l } from "@lets-explain/core/i18n";
import type { Chapter, Lesson, LessonEntry } from "@lets-explain/core/course/types";

/** Lessons live in `lessons/<slug>/lesson.ts` and are picked up here by slug. */
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

const entry = (slug: string, tr: string, en: string): LessonEntry => {
  const lesson = written.get(slug);
  return lesson ? { slug, title: lesson.title, lesson } : { slug, title: l(tr, en) };
};

export const chapters: Chapter[] = [
  {
    id: "foundations",
    title: l("Temeller", "Foundations"),
    lessons: [
      entry("why-rabbitmq", "Neden mesaj kuyruğu?", "Why a message queue?"),
      entry("first-queue", "İlk kuyruk", "Your first queue"),
      entry("amqp-model", "AMQP modeli", "The AMQP model"),
    ],
  },
  {
    id: "routing",
    title: l("Yönlendirme", "Routing"),
    lessons: [
      entry("direct-exchange", "Direct exchange", "Direct exchange"),
      entry("fanout-exchange", "Fanout exchange", "Fanout exchange"),
      entry("topic-exchange", "Topic exchange", "Topic exchange"),
      entry("headers-and-alternate", "Headers ve alternate exchange", "Headers and alternate exchanges"),
    ],
  },
  {
    id: "consumers",
    title: l("Tüketiciler", "Consumers"),
    lessons: [
      entry("acks", "Ack, nack, requeue", "Ack, nack, requeue"),
      entry("prefetch", "Prefetch ve iş kuyrukları", "Prefetch and work queues"),
      entry("poison-messages", "Zehirli mesajlar", "Poison messages"),
    ],
  },
  {
    id: "reliability",
    title: l("Güvenilirlik", "Reliability"),
    lessons: [
      entry("durability", "Durability ve persistence", "Durability and persistence"),
      entry("publisher-confirms", "Publisher confirms", "Publisher confirms"),
      entry("dead-letters", "Dead letter, TTL, max-length", "Dead letters, TTL, max length"),
      entry("quorum-queues", "Quorum queue'lar", "Quorum queues"),
    ],
  },
  {
    id: "practice",
    title: l("Pratikte", "In practice"),
    lessons: [
      entry("rpc-and-patterns", "RPC ve desenler", "RPC and patterns"),
      entry("streams", "Stream'ler", "Streams"),
      entry("operations", "İşletmek", "Running it"),
    ],
  },
];

