import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  rebalance: {
    term: "Rebalance",
    def: l(
      "Bir group'taki partition'ların üyeler arasında yeniden dağıtılması. Üye katılınca, ayrılınca, çökünce ya da partition sayısı değişince olur.",
      "Sharing a group's partitions out again among its members. Happens when a member joins, leaves or crashes, or the partition count changes.",
    ),
  },
};
