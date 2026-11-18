import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  kafkaStreams: {
    term: "Kafka Streams",
    def: l(
      "Apache Kafka'nın Java kütüphanesi: topic'lerden okuyup işleyen ve sonucu topic'lere yazan uygulamalar yazmak için. Ayrı bir cluster gerektirmez.",
      "Apache Kafka's Java library for apps that read topics, process records and write results back to topics. It needs no separate cluster.",
    ),
  },
  kstream: {
    term: "KStream",
    def: l(
      "Her kaydın ayrı bir olay olduğu akış. Aynı key'li iki kayıt iki ayrı olaydır.",
      "A stream where every record is a separate event. Two records with the same key are two events.",
    ),
  },
  ktable: {
    term: "KTable",
    def: l(
      "Her key'in sadece son değerini tutan tablo görünümü. Aynı key'li yeni kayıt eskisinin yerine geçer.",
      "A table view that keeps only the latest value per key. A new record for a key replaces the old one.",
    ),
  },
  stateStore: {
    term: "State store",
    def: l(
      "Kafka Streams uygulamasının sayım gibi ara sonuçları tuttuğu yerel depo; varsayılan olarak diskte RocksDB.",
      "The local store where a Kafka Streams app keeps intermediate results such as counts; RocksDB on disk by default.",
    ),
  },
  changelogTopic: {
    term: "Changelog topic",
    def: l(
      "State store'daki her değişikliğin yazıldığı compacted topic. Store kaybolursa ondan yeniden kurulur.",
      "A compacted topic that records every change to a state store. If the store is lost, it is rebuilt from it.",
    ),
  },
  exactlyOnceV2: {
    term: "exactly_once_v2",
    def: l(
      "Kafka Streams'te okuma, işleme ve yazmayı tek bir transaction'da birleştiren işleme garantisi. Bir kaydın etkisi tam olarak bir kez görünür.",
      "The Kafka Streams guarantee that ties reading, processing and writing into one transaction, so a record's effect shows exactly once.",
    ),
  },
};
