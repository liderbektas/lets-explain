import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  ack: {
    term: "Ack",
    def: l(
      "Broker'ın producer'a \"kaydın bende\" demesi. Ne zaman söyleneceğini `acks` ayarı belirler.",
      "The broker telling the producer \"I have your record\". The `acks` setting decides when that happens.",
    ),
  },
  acks: {
    term: "acks",
    def: l(
      "Producer ayarı. 0: cevap bekleme. 1: leader yazınca onayla. all: ISR'deki herkes yazınca onayla (Kafka 3.0'dan beri varsayılan).",
      "A producer setting. 0: wait for nothing. 1: ack once the leader writes. all: ack once every ISR copy has it (the default since Kafka 3.0).",
    ),
  },
  minInsyncReplicas: {
    term: "min.insync.replicas",
    def: l(
      "acks=all bir yazmanın kabul edilmesi için ISR'de en az kaç kopya olması gerektiği. Azsa yazma NotEnoughReplicas ile reddedilir. Varsayılan 1.",
      "How many copies the ISR must hold for an acks=all write to be accepted. With fewer, the write fails with NotEnoughReplicas. The default is 1.",
    ),
  },
};
