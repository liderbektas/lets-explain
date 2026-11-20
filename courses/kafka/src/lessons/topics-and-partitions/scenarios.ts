import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { l } from "@lets-explain/core/i18n";
import { applyAll, boxOf, kafkaShell, type KafkaBox } from "../../engine/cli";
import type { Action, ClusterState } from "../../engine/types";
import type { KafkaScenario } from "../shared/TopicLessonScene";
import { stateAfter } from "../shared/topicSim";
import { TOPIC } from "./model";

/**
 * Scenarios for topics and partitions: a 3-broker cluster, the `orders` topic, and the billing
 * service reading it as the `billing` group (each copy a console consumer in the background).
 */

const B = "--bootstrap-server localhost:9092";
const READER = `kafka-console-consumer.sh ${B} --topic ${TOPIC} --group billing &`;

const create = (partitions: number): Action => ({ type: "createTopic", name: TOPIC, partitions });
const order = (n: number): Action => ({ type: "produce", topic: TOPIC, value: `order:${n}`, key: null, producer: "orders-service" });
const cluster = (actions: Action[]): ClusterState => stateAfter(actions, 3);

/** A box after typing setup commands, so background readers are real jobs with pids. */
const after = (start: KafkaBox, typed: string[]): KafkaBox => typeLines(kafkaShell, applyAll, start, typed).state;

/** Free play: orders with one partition and a small backlog. */
export const FREE = boxOf(cluster([create(1), order(2001), order(2002), order(2003), order(2004)]));

const members = (s: ClusterState) => s.groups.billing?.members ?? [];
const partitionsOf = (s: ClusterState) => s.topics[TOPIC]?.partitions ?? [];

export const scenarios: KafkaScenario[] = [
  {
    id: "first-topic",
    title: l("İlk topic", "The first topic"),
    story: l(
      "Sipariş servisi bugün yayına giriyor ama cluster'da henüz `orders` topic'i yok. Fatura servisi üç kopyayla, **paralel** okuyacak.",
      "The order service goes live today, but the cluster has no `orders` topic yet. The billing service will read it with three copies, **in parallel**.",
    ),
    goal: l("`orders` topic'i, üç fatura kopyasının aynı anda çalışabileceği şekilde açılsın.", "Create `orders` so that three billing copies can work at the same time."),
    start: boxOf(cluster([])),
    hints: [
      l(
        "Bir group'ta bir partition'ı aynı anda tek okuyucu okur. Üç okuyucu için kaç partition gerekir?",
        "In a group, one partition is read by one reader at a time. How many partitions do three readers need?",
      ),
      l("Topic'i `kafka-topics.sh --create` açar; `--partitions` sayıyı verir.", "`kafka-topics.sh --create` makes the topic; `--partitions` gives the count."),
      l(`\`kafka-topics.sh ${B} --create --topic orders --partitions 3\``, `\`kafka-topics.sh ${B} --create --topic orders --partitions 3\``),
    ],
    par: 1,
    check: (ctx) => partitionsOf(ctx.state).length >= 3,
  },
  {
    id: "grow",
    title: l("Tek şerit yetmiyor", "One lane isn't enough"),
    story: l(
      "`orders` aceleyle tek partition'la açılmış. Sipariş arttı; tek fatura okuyucusu yetişemiyor ve ikinci bir kopya başlatınca o da boşta bekliyor. Topic'i silmeden büyütmen gerekiyor; içindeki 4 sipariş kaybolmamalı.",
      "`orders` was created in a hurry with one partition. Orders grew; one billing reader can't keep up, and a second copy just sits idle. You need to grow the topic without deleting it; the 4 orders inside must not be lost.",
    ),
    goal: l("`orders` **3 partition** olsun ve eski 4 sipariş yerinde dursun.", "`orders` has **3 partitions**, and the 4 old orders are still there."),
    start: boxOf(cluster([create(1), order(2001), order(2002), order(2003), order(2004)])),
    hints: [
      l("Önce `kafka-topics.sh --describe` ile topic'e bak.", "Look at the topic first with `kafka-topics.sh --describe`."),
      l("Var olan bir topic'in partition sayısını `--alter --partitions` artırır. Yeni partition'lar boş başlar.", "`--alter --partitions` raises the count of an existing topic. New partitions start empty."),
      l(`\`kafka-topics.sh ${B} --alter --topic orders --partitions 3\``, `\`kafka-topics.sh ${B} --alter --topic orders --partitions 3\``),
    ],
    par: 1,
    check: (ctx) => {
      const ps = partitionsOf(ctx.state);
      return ps.length === 3 && ps[0]!.records.length === 4;
    },
  },
  {
    id: "three-readers",
    title: l("Üç kopya", "Three copies"),
    story: l(
      "`orders` 3 partition'la hazır ve 6 sipariş bekliyor. Fatura servisinin üç kopyasını `billing` group'unda başlatman isteniyor; her kopya kendi partition'ını okumalı.",
      "`orders` is ready with 3 partitions and 6 orders waiting. You're asked to start three copies of the billing service in the `billing` group; each copy should read its own partition.",
    ),
    goal: l(
      "`billing` group'unda **3 okuyucu** çalışsın ve her biri **tek bir** partition'a sahip olsun.",
      "**3 readers** run in the `billing` group, each owning **exactly one** partition.",
    ),
    start: boxOf(cluster([create(3), order(3001), order(3002), order(3003), order(3004), order(3005), order(3006)])),
    hints: [
      l(
        "Okuyucular aynı `--group` adıyla başlarsa partition'ları paylaşır. Sürekli çalışmaları için sonlarına `&` koy.",
        "Readers started with the same `--group` share the partitions. Put `&` at the end so they keep running.",
      ),
      l("Aynı console consumer komutunu üç kez çalıştır; sonra `kafka-consumer-groups.sh --describe --members` ile bak.", "Run the same console consumer command three times; then look with `kafka-consumer-groups.sh --describe --members`."),
      l(`Üç kez: \`${READER}\``, `Three times: \`${READER}\``),
    ],
    par: 3,
    check: (ctx) => {
      const ms = members(ctx.state);
      return ms.length === 3 && ms.every((m) => m.assigned.length === 1);
    },
  },
  {
    id: "bench",
    title: l("Boşta bekleyen", "Left on the bench"),
    story: l(
      "Üç fatura kopyası çalışıyor. Bir takım arkadaşın \"dördüncüyü de açarsak daha hızlı olur\" diyor. Dördüncüyü başlat ve gerçekten iş alıp almadığına bak.",
      "Three billing copies are running. A teammate says \"a fourth copy would make it faster\". Start a fourth one and check whether it really gets any work.",
    ),
    goal: l(
      "`billing` group'unda **4 okuyucu** olsun; partition sayısını değiştirme.",
      "Have **4 readers** in the `billing` group, without changing the partition count.",
    ),
    start: after(boxOf(cluster([create(3), order(3001), order(3002), order(3003)])), [READER, READER, READER]),
    hints: [
      l("Aynı group'a bir okuyucu daha ekle, sonra `--describe --members` ile #PARTITIONS sütununa bak.", "Add one more reader to the same group, then look at the #PARTITIONS column with `--describe --members`."),
      l("Partition'dan fazla okuyucu varsa fazlası boşta bekler: buna yedek denir.", "With more readers than partitions, the extra one waits idle: a standby."),
      l(`\`${READER}\``, `\`${READER}\``),
    ],
    par: 1,
    check: (ctx) => {
      const ms = members(ctx.state);
      return partitionsOf(ctx.state).length === 3 && ms.length === 4 && ms.some((m) => m.assigned.length === 0);
    },
  },
  {
    id: "put-to-work",
    title: l("Dördüne de iş", "Work for all four"),
    story: l(
      "Dört fatura kopyası çalışıyor ama `orders` 3 partition: biri boşta. Kampanya için dördünün de çalışması gerekiyor. Hiçbir kopyayı kapatmadan bunu sağla.",
      "Four billing copies are running, but `orders` has 3 partitions: one is idle. For the sale all four need to work. Make it happen without stopping any copy.",
    ),
    goal: l("4 okuyucu çalışmaya devam etsin ve **hepsinin** en az bir partition'ı olsun.", "All 4 readers keep running and **each** owns at least one partition."),
    start: after(boxOf(cluster([create(3), order(3001), order(3002), order(3003)])), [READER, READER, READER, READER]),
    hints: [
      l("Okuyucu sayısını azaltmak yasak; geriye ne kalıyor?", "You can't remove readers; what's left?"),
      l("Partition sayısı artınca group yeniden dengelenir (rebalance) ve yeni partition'lar paylaşılır.", "When partitions are added, the group rebalances and the new ones get shared out."),
      l(`\`kafka-topics.sh ${B} --alter --topic orders --partitions 4\``, `\`kafka-topics.sh ${B} --alter --topic orders --partitions 4\``),
    ],
    par: 1,
    check: (ctx) => {
      const ms = members(ctx.state);
      return ms.length === 4 && ms.every((m) => m.assigned.length >= 1);
    },
  },
];

/** Members started from the terminal are console consumers; the scene names them by pid. */
export const isConsole = (id: string) => id.startsWith("console-consumer-");

