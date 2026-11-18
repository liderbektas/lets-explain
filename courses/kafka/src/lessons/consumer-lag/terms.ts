import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  logEndOffset: {
    term: "Log-end offset",
    def: l(
      "Bir partition'a yazılacak sıradaki kaydın offset'i. Son yazılan kaydın bir fazlası.",
      "The offset the next record written to a partition will get: one past the last record.",
    ),
  },
  hotPartition: {
    term: "Hot partition",
    def: l(
      "Trafiğin büyük kısmını alan partition. Genelde çok sık kullanılan tek bir key yüzünden olur.",
      "A partition that gets most of the traffic, usually because one key is used far more than the others.",
    ),
  },
};
