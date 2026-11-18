import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  messageQueue: {
    term: "Message queue",
    def: l(
      "Mesajları bir worker'a verip onaylanınca silen sistem. RabbitMQ ve Amazon SQS bilinen örnekler.",
      "A system that hands each message to one worker and deletes it once acknowledged. RabbitMQ and Amazon SQS are well-known examples.",
    ),
  },
  competingConsumers: {
    term: "Competing consumers",
    def: l(
      "Aynı kuyruktan okuyan worker'lar. Her mesaj sadece birine gider, böylece iş aralarında paylaşılır.",
      "Workers reading from the same queue. Each message goes to only one of them, so the work is shared.",
    ),
  },
  shareGroup: {
    term: "Share group",
    def: l(
      "Kafka'nın kuyruk benzeri okuma modu (KIP-932). Kayıtlar tek tek onaylanır ve bir partition'ı birden çok consumer paylaşabilir. Kafka 4.0'da erken erişim olarak geldi.",
      "Kafka's queue-like way of reading (KIP-932). Records are acknowledged one by one and several consumers can share a partition. It arrived in Kafka 4.0 as early access.",
    ),
  },
  deadLetter: {
    term: "Dead letter queue",
    def: l(
      "İşlenemeyen mesajların ayrıca konduğu yer, böylece diğerleri beklemez. Kafka'da genelde ayrı bir topic olarak kurulur.",
      "Where messages that cannot be processed are put aside so the rest do not wait. In Kafka it is usually a separate topic.",
    ),
  },
};
