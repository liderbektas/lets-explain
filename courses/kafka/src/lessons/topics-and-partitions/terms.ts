import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  leader: {
    term: "Leader",
    def: l(
      "Bir partition'ın yazma ve okuma işini yapan broker. Diğer broker'lardaki kopyalar onu takip eder.",
      "The broker that handles a partition's writes and reads. Copies on other brokers follow it.",
    ),
  },
  key: {
    term: "Key",
    def: l(
      "Bir kaydın isteğe bağlı anahtarı, örneğin müşteri numarası. Aynı key'li kayıtlar aynı partition'a gider.",
      "A record's optional key, such as a customer id. Records with the same key go to the same partition.",
    ),
  },
};
