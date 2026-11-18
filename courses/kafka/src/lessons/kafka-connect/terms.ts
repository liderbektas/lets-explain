import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  kafkaConnect: {
    term: "Kafka Connect",
    def: l(
      "Apache Kafka'nın, veriyi başka sistemlerle Kafka arasında kod yazmadan taşıyan parçası. Connector'ları worker denen süreçlerde çalıştırır.",
      "The part of Apache Kafka that moves data between Kafka and other systems without custom code. It runs connectors in processes called workers.",
    ),
  },
  sourceConnector: {
    term: "Source connector",
    def: l(
      "Bir dış sistemden (veritabanı, dosya, API) veri okuyup Kafka'ya yazan connector.",
      "A connector that reads from an outside system (a database, files, an API) and writes into Kafka.",
    ),
  },
  sinkConnector: {
    term: "Sink connector",
    def: l(
      "Kafka'dan okuyup bir dış sisteme (arama indeksi, veri ambarı, S3) yazan connector.",
      "A connector that reads from Kafka and writes to an outside system (a search index, a warehouse, S3).",
    ),
  },
  worker: {
    term: "Worker",
    def: l(
      "Connector görevlerini çalıştıran Kafka Connect süreci. Aynı group.id'yi kullanan worker'lar bir Connect cluster'ı oluşturur.",
      "A Kafka Connect process that runs connector tasks. Workers sharing a group.id form a Connect cluster.",
    ),
  },
  task: {
    term: "Task",
    def: l(
      "Bir connector'ın işi bölüp paylaştırdığı parça. Bir worker çökerse görevleri diğer worker'lara geçer.",
      "A slice of a connector's work. If a worker dies, its tasks move to the other workers.",
    ),
  },
  smt: {
    term: "SMT",
    def: l(
      "Single Message Transform: kayıtları tek tek, Kafka'ya girerken ya da çıkarken değiştiren küçük dönüşüm. Örneğin bir alanı maskelemek.",
      "Single Message Transform: a small change applied to each record on its way into or out of Kafka, such as masking a field.",
    ),
  },
  converter: {
    term: "Converter",
    def: l(
      "Connect'in iç veri biçimi ile Kafka'daki byte'lar arasında çeviri yapan parça: JsonConverter, AvroConverter gibi.",
      "The piece that translates between Connect's internal data and the bytes in Kafka, such as JsonConverter or AvroConverter.",
    ),
  },
};
