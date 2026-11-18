import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  atMostOnce: {
    term: "At-most-once",
    def: l(
      "Her kayıt en fazla bir kez işlenir; çökmede bazıları hiç işlenmeyebilir. Consumer önce commit edip sonra işlerse olur.",
      "Each record is processed at most once; a crash can make some never processed. Happens when a consumer commits before processing.",
    ),
  },
  atLeastOnce: {
    term: "At-least-once",
    def: l(
      "Hiçbir kayıt kaybolmaz ama çökmeden sonra bazıları tekrar işlenebilir. Consumer önce işleyip sonra commit ederse olur.",
      "No record is lost, but some can be processed again after a crash. Happens when a consumer processes before committing.",
    ),
  },
  exactlyOnce: {
    term: "Exactly-once",
    def: l(
      "Her kaydın etkisi tam bir kez görülür. Kafka bunu kendi içinde transaction ile sağlar; dış dünyadaki etkiler için idempotent işleme gerekir.",
      "Each record's effect shows up exactly once. Kafka provides it inside Kafka with transactions; effects outside Kafka need idempotent processing.",
    ),
  },
  idempotent: {
    term: "Idempotent",
    def: l(
      "Aynı işi iki kez yapmanın bir kez yapmakla aynı sonucu verdiği durum. Örneğin \"bu siparişe e-posta gittiyse atla\".",
      "Doing the same thing twice has the same result as doing it once. For example, \"skip if this order already got its email\".",
    ),
  },
};
