import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  controller: {
    term: "Controller",
    def: l(
      "Cluster'ın metadata'sını yöneten sunucu: broker'ları izler, partition leader'larını seçer, topic'leri kaydeder.",
      "The server that manages cluster metadata: it watches brokers, picks partition leaders and records topics.",
    ),
  },
  kraft: {
    term: "KRaft",
    def: l(
      "Kafka'nın metadata'yı ZooKeeper olmadan, kendi içinde Raft ile yönettiği mod. Kafka 4.0'dan beri tek seçenek.",
      "Kafka's mode for managing metadata itself with Raft, without ZooKeeper. The only option since Kafka 4.0.",
    ),
  },
  quorum: {
    term: "Quorum",
    def: l(
      "Karar vermek için gereken çoğunluk. 3 controller'da 2, 5 controller'da 3.",
      "The majority needed to make a decision: 2 of 3 controllers, or 3 of 5.",
    ),
  },
  metadataLog: {
    term: "Metadata log",
    def: l(
      "Cluster'daki her değişikliğin sırayla yazıldığı iç topic: `__cluster_metadata`. Controller'lar kopyalar, broker'lar okur.",
      "The internal topic where every cluster change is written in order: `__cluster_metadata`. Controllers replicate it, brokers read it.",
    ),
  },
  zookeeper: {
    term: "ZooKeeper",
    def: l(
      "Kafka'nın eskiden metadata için kullandığı ayrı sistem. 3.5'te kullanımdan kaldırılacağı duyuruldu, 4.0'da tamamen çıkarıldı.",
      "The separate system Kafka used to store metadata. Deprecated in 3.5 and removed entirely in 4.0.",
    ),
  },
  fenced: {
    term: "Fenced broker",
    def: l(
      "Controller'ın heartbeat alamadığı için devre dışı saydığı broker. Ona leader'lık verilmez.",
      "A broker the controller treats as out of service because its heartbeats stopped. It is given no leadership.",
    ),
  },
};
