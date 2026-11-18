import { groupStats } from "../../engine/cluster";
import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { ANALYTICS, BILLING, kafkaPosition, kafkaSeen, type QEvent, type VAction, type VState } from "./model";

export interface SandboxCtx {
  start: VState;
  state: VState;
  actions: VAction[];
  events: QEvent[][];
}

/** Which world a mission is played in, so the stage can switch to it. */
export const missionView: Record<string, "queue" | "kafka"> = {
  redeliver: "queue",
  "both-worlds": "kafka",
  replay: "kafka",
};

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "redeliver",
    title: l("Yeniden teslim", "Redelivery"),
    goal: l(
      "**Kuyrukta:** Worker A bekleyen mesajı alsın ve onaylamadan çöksün. Mesaj **Worker B**'ye gitsin ve B onu onaylasın.",
      "**In the queue:** worker A takes the waiting message and crashes before acking. The message goes to **worker B**, and B acks it.",
    ),
    hint: l("A al, A çökert, B al, B onayla.", "A takes, A crashes, B takes, B acks."),
    par: 4,
    check: (c) => {
      const q = c.state.queue;
      const fresh = q.deliveries.slice(c.start.queue.deliveries.length);
      return fresh.some((d) => d.worker === "a" && fresh.some((e) => e.id === d.id && e.worker === "b") && q.acked[d.id] === "b");
    },
  },
  {
    id: "both-worlds",
    title: l("İki dünya", "Two worlds"),
    goal: l(
      "**Bekleyen sipariş** kuyrukta bir worker tarafından işlenip silinsin; Kafka'da ise aynı siparişi hem **Fatura** hem **Analitik** okusun.",
      "The **waiting order** is handled and deleted by a worker in the queue, while in Kafka both **Billing** and **Analytics** read the same order.",
    ),
    hint: l(
      "Kuyrukta mesaj tek bir worker'a gider ve onayla silinir. Kafka'da her group kendi hızında okur.",
      "In the queue a message goes to one worker and is deleted on ack. In Kafka every group reads at its own pace.",
    ),
    par: 4,
    check: (c) => {
      const fresh = c.start.queue.waiting[0];
      if (fresh === undefined) return false;
      return c.state.queue.acked[fresh] !== undefined && kafkaSeen(c.state, BILLING).has(fresh) && kafkaSeen(c.state, ANALYTICS).has(fresh);
    },
  },
  {
    id: "replay",
    title: l("Geçmişi yeniden oku", "Replay history"),
    goal: l(
      "**Kafka'da:** Fatura bütün geçmişi **baştan** yeniden okusun. Kuyrukta bunu yapmak mümkün değil.",
      "**In Kafka:** Billing reads the whole history again **from the start**. A queue cannot do this.",
    ),
    hint: l("Fatura'yı başa sar, sonra okut.", "Rewind Billing, then read."),
    par: 2,
    check: (c) => {
      const dups = groupStats(c.state.kafka, BILLING.group).duplicates - groupStats(c.start.kafka, BILLING.group).duplicates;
      const end = c.state.kafka.topics.orders!.partitions[0]!.logEndOffset;
      return dups >= c.start.kafka.topics.orders!.partitions[0]!.logEndOffset - 1 && kafkaPosition(c.state, BILLING) === end;
    },
  },
];
