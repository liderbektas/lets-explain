import type { GlossaryEntry } from "../../glossary";
import { l } from "@lets-explain/core/i18n";

export const terms: Record<string, GlossaryEntry> = {
  tombstone: {
    term: "Tombstone",
    def: l(
      "Value'su boş (null) bir kayıt: \"bu key silindi\" demektir. Sıkıştırılan topic'lerde bir key böyle silinir.",
      "A record with an empty (null) value: it means \"this key is deleted\". It is how a key is deleted in a compacted topic.",
    ),
  },
  cleaner: {
    term: "Log cleaner",
    def: l(
      "Broker'da çalışan ve sıkıştırılan topic'lerin kapalı segment'lerinden eski değerleri silen arka plan işi.",
      "A background job on the broker that removes old values from the closed segments of compacted topics.",
    ),
  },
  compaction: {
    term: "Log compaction",
    def: l(
      "cleanup.policy=compact: her key'in sadece son değerini saklayan temizlik kuralı.",
      "cleanup.policy=compact: the clean-up rule that keeps only each key's latest value.",
    ),
  },
};
