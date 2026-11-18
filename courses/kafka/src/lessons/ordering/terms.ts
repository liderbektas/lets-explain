import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  key: {
    term: "Key",
    def: l(
      "Bir kaydın isteğe bağlı anahtarı, örneğin sipariş numarası. Aynı key'li kayıtlar aynı partition'a gider.",
      "A record's optional key, such as an order number. Records with the same key go to the same partition.",
    ),
  },
  partitioner: {
    term: "Partitioner",
    def: l(
      "Producer'ın bir kaydın hangi partition'a gideceğini seçen parçası. Key varsa hash(key) % partition sayısı kullanılır.",
      "The part of the producer that picks a record's partition. With a key it uses hash(key) % partition count.",
    ),
  },
  rebalance: {
    term: "Rebalance",
    def: l(
      "Bir group'taki partition'ların consumer'lara yeniden dağıtılması. Consumer gelince, gidince ya da partition eklenince olur.",
      "Handing a group's partitions out to its consumers again. It happens when a consumer joins or leaves, or partitions are added.",
    ),
  },
  idempotence: {
    term: "Idempotence",
    def: l(
      "Aynı işi tekrar yapmanın sonucu değiştirmemesi. Idempotent producer, tekrar denenen bir kaydı ikinci kez yazmaz ve sırayı korur.",
      "Doing the same thing again does not change the result. An idempotent producer never writes a retried record twice and keeps the order.",
    ),
  },
  maxInFlight: {
    term: "max.in.flight.requests.per.connection",
    def: l(
      "Producer'ın cevap beklemeden aynı anda yolda tutabileceği istek sayısı. Varsayılan 5.",
      "How many requests the producer keeps on the way without waiting for answers. The default is 5.",
    ),
  },
};
