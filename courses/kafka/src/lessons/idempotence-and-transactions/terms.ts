import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  ack: {
    term: "Ack",
    def: l(
      "Broker'ın producer'a \"kaydı yazdım\" diye gönderdiği onay. Gelmezse producer kaydı yeniden gönderir.",
      "The broker's acknowledgement to the producer: \"I wrote the record\". If it does not arrive, the producer sends the record again.",
    ),
  },
  idempotentProducer: {
    term: "Idempotent producer",
    def: l(
      "Her kayda producer id (PID) ve sıra numarası koyan producer. Broker aynı numarayı ikinci kez görünce kopyayı yazmaz. Kafka 3.0'dan beri varsayılan.",
      "A producer that stamps every record with a producer id (PID) and a sequence number. The broker drops a copy when it sees the same number twice. On by default since Kafka 3.0.",
    ),
  },
  transaction: {
    term: "Transaction",
    def: l(
      "Birkaç yazmanın ve consumer offset commit'inin tek birim olarak ya hep birlikte görünmesi ya da hiç görünmemesi.",
      "Several writes and a consumer offset commit that become visible all together or not at all.",
    ),
  },
  transactionalId: {
    term: "transactional.id",
    def: l(
      "Producer'ın yeniden başlasa da değişmeyen kimliği. Yarım kalan transaction'ı kapatmak ve eski (zombi) producer'ı durdurmak için kullanılır.",
      "A producer identity that survives restarts. It is used to close a half-finished transaction and to stop an old (zombie) producer.",
    ),
  },
  controlRecord: {
    term: "Control record",
    def: l(
      "Bir transaction'ın commit ya da abort edildiğini gösteren işaret kaydı. Log'da bir offset kaplar ama uygulamaya hiç verilmez.",
      "A marker record saying a transaction committed or aborted. It takes up an offset in the log but is never handed to the application.",
    ),
  },
  isolationLevel: {
    term: "isolation.level",
    def: l(
      "Consumer'ın transaction'lı kayıtları nasıl okuyacağı: read_uncommitted (varsayılan, her şeyi görür) veya read_committed (sadece commit edilenleri görür).",
      "How a consumer reads transactional records: read_uncommitted (the default, sees everything) or read_committed (sees committed ones only).",
    ),
  },
};
