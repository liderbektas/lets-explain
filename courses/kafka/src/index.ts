import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { KafkaHero } from "./Hero";

export const kafkaCourse: Course = {
  id: "kafka",
  name: "Apache Kafka",
  tagline: l(
    "Log, offset, partition, consumer group, replikasyon ve teslim garantileri: 20 derste sıfırdan.",
    "Logs, offsets, partitions, consumer groups, replication and delivery guarantees: 20 lessons from zero.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("Kafka'yı", "Learn Kafka by"), l("izleyerek", "watching"), l("ve deneyerek öğren.", "and trying it.")],
    lead: l(
      "Her konu adım adım ilerleyen, canlı bir sahne. Bir mesajın nereye gittiğini, bir servis çökünce ne olduğunu, hangi ayarın neyi değiştirdiğini kendi gözünle görürsün. Ön bilgi gerekmiyor.",
      "Every idea is a live scene you step through. You see where a message goes, what happens when a service crashes, and what each setting changes. No prior knowledge needed.",
    ),
    Art: KafkaHero,
  },
};
