import { l } from "@lets-explain/core/i18n";
import type { TopicCtx } from "../shared/topicSim";
import type { Mission } from "@lets-explain/core/course/types";
import { TOPIC } from "./model";

/** Partitions holding records with this key. */
const partitionsWithKey = (ctx: TopicCtx, key: string) =>
  new Set(ctx.state.topics[TOPIC]!.partitions.filter((p) => p.records.some((r) => r.key === key)).map((p) => p.index));

const usedKeyless = (ctx: TopicCtx) => ctx.moves.flat().some((a) => a.type === "produce" && a.key === null);

export const missions: Mission<TopicCtx>[] = [
  {
    id: "neighbours",
    title: l("Komşular", "Neighbours"),
    goal: l(
      "**İki farklı müşterinin** siparişleri **aynı partition'da** dursun.",
      "Get orders from **two different customers** into the **same partition**.",
    ),
    hint: l(
      "Partition sayısı müşteri sayısından az olunca bazı key'ler aynı partition'a düşer. Hangi müşteriler hangi partition'a gidiyor, olay listesinden bak.",
      "When there are fewer partitions than customers, some keys share a partition. Check the event list to see where each customer goes.",
    ),
    par: 2,
    check: (ctx) =>
      ctx.state.topics[TOPIC]!.partitions.some((p) => new Set(p.records.flatMap((r) => (r.key ? [r.key] : []))).size >= 2),
  },
  {
    id: "split",
    title: l("Kopan sıra", "Broken order"),
    goal: l(
      "Ali'nin siparişleri **iki farklı partition'a** dağılsın. Key'siz sipariş kullanmak yok.",
      "Spread Ali's orders over **two different partitions**. No keyless orders.",
    ),
    hint: l("Aynı key hep aynı partition'a gider... partition sayısı değişmediği sürece.", "The same key always goes to the same partition... as long as the partition count stays the same."),
    par: 3,
    check: (ctx) => !usedKeyless(ctx) && partitionsWithKey(ctx, "ali").size >= 2,
  },
  {
    id: "fill",
    title: l("Herkese iş", "Work for everyone"),
    goal: l(
      "Topic **4 partition** olsun ve dördünde de en az bir sipariş bulunsun. Sadece **key'li** siparişler.",
      "Make the topic **4 partitions** with at least one order in each. **Keyed** orders only.",
    ),
    hint: l(
      "4 partition'da hiçbir müşteri P1'e düşmüyor. P1'i partition eklemeden önce doldurman gerekiyor.",
      "With 4 partitions no customer lands in P1. You have to fill P1 before adding the partition.",
    ),
    par: 5,
    check: (ctx) => {
      const ps = ctx.state.topics[TOPIC]!.partitions;
      return !usedKeyless(ctx) && ps.length === 4 && ps.every((p) => p.records.length > 0);
    },
  },
];
