import { l } from "@lets-explain/core/i18n";
import { deliveredIn, type TopicCtx } from "../shared/topicSim";
import type { Mission } from "@lets-explain/core/course/types";
import { GROUP, TOPIC } from "./model";

const partitionsOf = (ctx: TopicCtx) => ctx.state.topics[TOPIC]!.partitions;

export const missions: Mission<TopicCtx>[] = [
  {
    id: "three-lanes",
    title: l("Üç şerit", "Three lanes"),
    goal: l(
      "Topic'i **3 partition**'a çıkar ve üç partition'ın **her birinde** en az bir kayıt olsun.",
      "Grow the topic to **3 partitions** and get at least one record into **each** of them.",
    ),
    hint: l(
      "Yeni partition'lar boş başlar; eski kayıtlar P0'da kalır. Key'siz kayıtlar partition'lara sırayla dağılır.",
      "New partitions start empty; old records stay in P0. Records without a key are spread over the partitions in turn.",
    ),
    par: 4,
    check: (ctx) => {
      const ps = partitionsOf(ctx);
      return ps.length === 3 && ps.every((p) => p.records.length > 0);
    },
  },
  {
    id: "parallel",
    title: l("Aynı anda üç", "Three at once"),
    goal: l(
      "Tek bir **\"Herkes 1 okusun\"** turunda **3 kayıt birden** okunsun.",
      "In a single **\"Everyone reads 1\"** round, **3 records** get read at once.",
    ),
    hint: l(
      "Bir turda her okuyucu en fazla 1 kayıt okur. Üç okuyucuya, onların da okuyacak kaydı olan kendi partition'larına ihtiyacın var.",
      "In one round each reader reads at most 1 record. You need three readers, each with its own partition that has something to read.",
    ),
    par: 7,
    check: (ctx) => ctx.events.some((evs) => deliveredIn(evs, GROUP).length >= 3),
  },
  {
    id: "idle",
    title: l("Boşta bekleyen", "Left on the bench"),
    goal: l(
      "Topic **3 partition** olsun ve Fatura group'unda bir okuyucu **hiç partition alamasın**.",
      "Make the topic **3 partitions**, with one reader in the billing group getting **no partition at all**.",
    ),
    hint: l(
      "Bir group'ta bir partition'ı aynı anda sadece bir okuyucu okuyabilir. Partition'dan fazla okuyucu olursa ne olur?",
      "Within a group, one partition is read by only one reader at a time. What happens with more readers than partitions?",
    ),
    par: 5,
    check: (ctx) => {
      const group = ctx.state.groups[GROUP];
      return partitionsOf(ctx).length === 3 && Boolean(group?.members.some((m) => m.assigned.length === 0));
    },
  },
];
