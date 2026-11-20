import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { createReplicated, simulateReplicated, type RAction, type RState } from "../../engine/replication";
import { rBox, type RBox, type RCtx } from "../../engine/replicationCli";
import { sandboxStart } from "./model";

export type BrokerScenario = Scenario<RCtx, RBox>;

const after = (actions: RAction[], start: RState) => simulateReplicated(actions, start).states.at(-1)!;
const B = "--bootstrap-server localhost:9092";
const MOVE = (partition: number, broker: number) => `{"version":1,"partitions":[{"topic":"orders","partition":${partition},"replicas":[${broker}]}]}`;

/** The cluster at the end of the lesson: P0 on broker 1, P1 on broker 2, P2 on broker 4; broker 3 holds nothing. */
export const FREE = rBox(sandboxStart);

/** Three brokers, one partition each; kafka-4 is in docker-compose.yml but not started. */
const THREE = after(
  Array.from({ length: 6 }, (_, i) => ({ type: "produce", value: `order:${3000 + i}`, partition: i % 3 }) as RAction),
  createReplicated({ brokers: 3, partitions: [[1], [2], [3]] }),
);

/** Index of the first action whose events include one matching `test`, at or after `from`. */
const firstEvent = (ctx: RCtx, from: number, test: (e: RCtx["events"][number][number]) => boolean) => {
  for (let i = from; i < ctx.events.length; i++) if (ctx.events[i]!.some(test)) return i;
  return -1;
};

export const scenarios: BrokerScenario[] = [
  {
    id: "idle-broker",
    title: l("Boştaki broker", "The idle broker"),
    story: l(
      "Geçen hafta eklenen `kafka-3` sunucusu boş duruyor: üzerinde hiç partition yok. Bu arada `kafka-1` hem P0'ı taşıyor hem de herkesin bağlandığı adres; yükü dağıtmak istiyorsun.",
      "The `kafka-3` server added last week sits idle: it holds no partition. Meanwhile `kafka-1` carries P0 and is the address everyone connects to; you want to spread the load.",
    ),
    goal: l("P0 `kafka-3`'e taşınsın: tek kopyası broker 3'te olsun.", "Move P0 to `kafka-3`: its only copy lives on broker 3."),
    start: FREE,
    hints: [
      l(
        "Önce `kafka-topics.sh --describe` ile kimin nerede olduğuna bak. Bir partition'ı taşımak için Kafka'ya bir plan verirsin: hangi partition, hangi broker'lara.",
        "First look at who is where with `kafka-topics.sh --describe`. To move a partition you give Kafka a plan: which partition, onto which brokers.",
      ),
      l(
        "Planı bir JSON dosyasına yaz (`nano move.json`), sonra `kafka-reassign-partitions.sh ... --reassignment-json-file move.json --execute` ile uygula.",
        "Write the plan into a JSON file (`nano move.json`), then apply it with `kafka-reassign-partitions.sh ... --reassignment-json-file move.json --execute`.",
      ),
      l(
        `\`nano move.json\` ile şunu yaz: \`${MOVE(0, 3)}\`. Sonra \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\``,
        `In \`nano move.json\` write: \`${MOVE(0, 3)}\`. Then \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\``,
      ),
    ],
    par: 1,
    check: (ctx) => ctx.state.partitions[0]!.replicas.join() === "3" && ctx.state.partitions[0]!.leader === 3,
  },
  {
    id: "maintenance",
    title: l("Bakım günü", "Maintenance day"),
    story: l(
      "`kafka-1`'in diski değişecek, sunucuyu kapatman gerekiyor. Ama P0'ın tek kopyası onda: kapatırsan P0'a giden siparişler hata verir. Bakım sırasında sipariş akışı durmamalı.",
      "`kafka-1` needs a new disk, so you have to shut it down. But P0's only copy is on it: shut it down and orders for P0 fail. Orders must keep flowing during maintenance.",
    ),
    goal: l("`kafka-1` kapalı olsun ve P0 yine de çevrimiçi kalsın.", "`kafka-1` is stopped and P0 is still online."),
    start: FREE,
    hints: [
      l(
        "Çökmüş bir broker'daki partition'ı taşıyamazsın: kopyalanacak kimse kalmaz. Sıralama önemli.",
        "You cannot move a partition off a broker that is already down: there is nothing left to copy from. Order matters.",
      ),
      l("Önce P0'ı boştaki broker'a taşı (`kafka-reassign-partitions.sh`), sonra `docker stop kafka-1`.", "First move P0 to the idle broker (`kafka-reassign-partitions.sh`), then `docker stop kafka-1`."),
      l(
        `\`nano move.json\` → \`${MOVE(0, 3)}\`, \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\`, sonra \`docker stop kafka-1\``,
        `\`nano move.json\` → \`${MOVE(0, 3)}\`, \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\`, then \`docker stop kafka-1\``,
      ),
    ],
    par: 2,
    check: (ctx) => ctx.state.brokers.find((b) => b.id === 1)?.alive === false && ctx.state.partitions[0]!.leader !== null,
  },
  {
    id: "outage",
    title: l("Gece kesintisi", "The night outage"),
    story: l(
      "Gece `kafka-2` çöktü. Sabah sipariş servisinin loglarında `TimeoutException` dolu: P1'in tek kopyası o broker'daydı ve P1'e yazılan her şey zaman aşımına uğruyor.",
      "`kafka-2` crashed in the night. In the morning the order service's logs are full of `TimeoutException`: P1's only copy was on that broker, and everything written to P1 times out.",
    ),
    goal: l("`kafka-2` geri gelsin ve P1'e yeniden **başarıyla** bir sipariş yazılsın.", "Bring `kafka-2` back and write an order to P1 **successfully** again."),
    start: rBox(after([{ type: "crash", broker: 2 }], sandboxStart)),
    hints: [
      l("`docker ps -a` hangi container'ın durduğunu gösterir.", "`docker ps -a` shows which container has stopped."),
      l(
        "Container'ı `docker start` ile başlat. Anahtarsız kayıtlar partition'lara sırayla dağılır: üç kayıt gönderirsen biri P1'e düşer.",
        "Start the container with `docker start`. Records without a key go round the partitions in turn: send three and one lands on P1.",
      ),
      l(
        `\`docker start kafka-2\`, sonra \`printf "order:1\\norder:2\\norder:3\\n" | kafka-console-producer.sh ${B} --topic orders\``,
        `\`docker start kafka-2\`, then \`printf "order:1\\norder:2\\norder:3\\n" | kafka-console-producer.sh ${B} --topic orders\``,
      ),
    ],
    par: 2,
    check: (ctx) => {
      const up = ctx.actions.findIndex((a) => a.type === "restart" && a.broker === 2);
      return up >= 0 && ctx.state.partitions[1]!.leader !== null && firstEvent(ctx, up + 1, (e) => e.type === "produced" && e.partition === 1) >= 0;
    },
  },
  {
    id: "new-server",
    title: l("Yeni sunucu", "A new server"),
    story: l(
      "Kampanya haftası geliyor ve P2 en kalabalık partition. Ops ekibi yeni bir sunucu hazırladı: `docker-compose.yml`'de `kafka-4` tanımlı ama henüz çalışmıyor. P2'yi tek başına taşıyacak bir broker istiyorsun.",
      "Sale week is coming and P2 is the busiest partition. Ops prepared a new server: `kafka-4` is defined in `docker-compose.yml` but not running yet. You want a broker that carries P2 on its own.",
    ),
    goal: l("`kafka-4` çalışsın ve P2 ona taşınsın.", "`kafka-4` is running and P2 has moved onto it."),
    start: rBox(THREE),
    hints: [
      l("Henüz ayakta olmayan bir broker'a partition taşıyamazsın: önce onu cluster'a kat.", "You cannot move a partition onto a broker that is not up yet: bring it into the cluster first."),
      l("`docker compose up -d kafka-4` yeni broker'ı başlatır; sonra bir taşıma planıyla P2'yi ona ver.", "`docker compose up -d kafka-4` starts the new broker; then give it P2 with a reassignment plan."),
      l(
        `\`docker compose up -d kafka-4\`, \`nano move.json\` → \`${MOVE(2, 4)}\`, sonra \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\``,
        `\`docker compose up -d kafka-4\`, \`nano move.json\` → \`${MOVE(2, 4)}\`, then \`kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute\``,
      ),
    ],
    par: 2,
    check: (ctx) => ctx.state.brokers.some((b) => b.id === 4 && b.alive) && ctx.state.partitions[2]!.replicas.join() === "4",
  },
];

export const MOVE_JSON = MOVE;
