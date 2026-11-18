import { l } from "@lets-explain/core/i18n";

import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what docs, tools and colleagues use. */
const core: Record<string, GlossaryEntry> = {
  event: {
    term: "Event",
    def: l(
      "Olmuş bir şeyin kaydı: \"sipariş verildi\", \"ödeme alındı\". Geçmişte kaldığı için değiştirilmez.",
      "A record of something that happened: \"order placed\", \"payment received\". It is in the past, so it is never changed.",
    ),
  },
  record: {
    term: "Record",
    def: l(
      "Kafka'da saklanan tek bir event. Bir key, bir value, bir zaman damgası ve isteğe bağlı header'lardan oluşur.",
      "A single event as Kafka stores it: a key, a value, a timestamp and optional headers.",
    ),
  },
  log: {
    term: "Log",
    def: l(
      "Sadece sonuna ekleme yapılabilen, sıralı kayıt listesi. Kafka'nın temel yapı taşı.",
      "An ordered list of records you can only append to. Kafka's basic building block.",
    ),
  },
  offset: {
    term: "Offset",
    def: l(
      "Bir kaydın log içindeki sıra numarası. 0'dan başlar, hep artar, asla tekrar kullanılmaz.",
      "A record's position in the log. Starts at 0, only grows, and is never reused.",
    ),
  },
  producer: {
    term: "Producer",
    def: l("Kafka'ya kayıt yazan uygulama.", "An application that writes records to Kafka."),
  },
  consumer: {
    term: "Consumer",
    def: l("Kafka'dan kayıt okuyan uygulama.", "An application that reads records from Kafka."),
  },
  consumerGroup: {
    term: "Consumer group",
    def: l(
      "Aynı işi paylaşan consumer'ların grubu. Kafka, okuma ilerlemesini group başına tutar.",
      "Consumers that share the same job. Kafka tracks reading progress per group.",
    ),
  },
  broker: {
    term: "Broker",
    def: l(
      "Kafka sunucusu. Kayıtları diske yazar ve okuyuculara verir. Birkaç broker bir cluster oluşturur.",
      "A Kafka server. It writes records to disk and serves them to readers. Several brokers form a cluster.",
    ),
  },
  topic: {
    term: "Topic",
    def: l(
      "Aynı türden event'lerin toplandığı isimli log, örneğin \"orders\".",
      "A named log for one kind of event, such as \"orders\".",
    ),
  },
  partition: {
    term: "Partition",
    def: l(
      "Bir topic'in parçalarından biri. Her partition kendi başına sıralı bir log'dur.",
      "One slice of a topic. Each partition is an ordered log of its own.",
    ),
  },
  commit: {
    term: "Commit",
    def: l(
      "Consumer'ın \"buraya kadar işledim\" diye kaldığı yeri Kafka'ya kaydetmesi.",
      "A consumer saving \"I have processed up to here\" in Kafka.",
    ),
  },
  committedOffset: {
    term: "Committed offset",
    def: l(
      "Bir group'un kaydettiği konum. Son okunan kaydın değil, sıradaki okunacak kaydın offset'idir.",
      "The position a group saved. It is the offset of the next record to read, not the last one read.",
    ),
  },
  retention: {
    term: "Retention",
    def: l(
      "Kayıtların ne kadar süre (veya ne kadar boyut) saklanacağı. Varsayılan 7 gün.",
      "How long (or how much) Kafka keeps records. The default is 7 days.",
    ),
  },
  autoOffsetReset: {
    term: "auto.offset.reset",
    def: l(
      "Group'un kayıtlı bir konumu yoksa nereden başlayacağı: earliest (en baştan) veya latest (sadece yeni gelenler, varsayılan).",
      "Where a group starts when it has no saved position: earliest (from the start) or latest (only new records, the default).",
    ),
  },
  coupling: {
    term: "Coupling",
    def: l(
      "Bir servisin başka bir servise bağımlılığı. Sıkı bağlı servislerde biri değişince veya çökünce diğeri de etkilenir.",
      "How much one service depends on another. With tight coupling, a change or crash in one hits the other.",
    ),
  },
  key: {
    term: "Key",
    def: l(
      "Bir kaydın isteğe bağlı anahtarı, örneğin müşteri ya da sipariş numarası. Aynı key'li kayıtlar aynı partition'a gider.",
      "A record's optional key, such as a customer or order id. Records with the same key go to the same partition.",
    ),
  },
  leader: {
    term: "Leader",
    def: l(
      "Bir partition'ın yazma ve okumalarını karşılayan broker. Diğer broker'lardaki kopyalar onu takip eder.",
      "The broker that serves a partition's writes and reads. Copies on other brokers follow it.",
    ),
  },
  ack: {
    term: "Ack",
    def: l(
      "Broker'ın producer'a \"kaydın bende\" demesi. Ne zaman söyleneceğini `acks` ayarı belirler; gelmezse producer kaydı yeniden gönderir.",
      "The broker telling the producer \"I have your record\". The `acks` setting decides when; if it never arrives, the producer sends again.",
    ),
  },
  rebalance: {
    term: "Rebalance",
    def: l(
      "Bir group'taki partition'ların üyeler arasında yeniden dağıtılması. Üye katılınca, ayrılınca, çökünce ya da partition eklenince olur.",
      "Sharing a group's partitions out again among its members. Happens when a member joins, leaves or crashes, or partitions are added.",
    ),
  },
  lag: {
    term: "Consumer lag",
    def: l(
      "Yazılmış ama group'un henüz işlemediği kayıt sayısı.",
      "How many written records a group has not processed yet.",
    ),
  },
};

/**
 * Lessons add their own terms in `<slug>/terms.ts` (exporting `terms`), so lessons can be
 * written side by side without editing this file. The terms above win on a clash.
 */
const extra = import.meta.glob<{ terms?: Record<string, GlossaryEntry> }>("./lessons/*/terms.ts", { eager: true });

export const glossary: Record<string, GlossaryEntry> = Object.assign(
  {},
  ...Object.values(extra).map((m) => m.terms ?? {}),
  core,
);
