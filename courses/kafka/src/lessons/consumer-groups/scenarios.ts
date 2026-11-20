import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { l } from "@lets-explain/core/i18n";
import { groupStats } from "../../engine/cluster";
import { applyAll, boxOf, kafkaShell, type KafkaBox } from "../../engine/cli";
import type { Action, ClusterState } from "../../engine/types";
import type { KafkaCtx, KafkaScenario } from "../shared/TopicLessonScene";
import { deliveredIn, stateAfter } from "../shared/topicSim";
import { ANALYTICS, BILLING, TOPIC } from "./model";

/**
 * Scenarios for consumer groups: `orders` with 3 partitions on a 3-broker cluster, read by the
 * billing and analytics groups. Readers started in the terminal are console consumers.
 */

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic ${TOPIC} --group ${group}${extra}`;
const READER = `${READ(BILLING)} &`;
/** The copies already running when a scenario starts: they began with the topic's first record. */
const RUNNING = `${READ(BILLING, " --from-beginning")} &`;

let n = 5000;
const order = (): Action => ({ type: "produce", topic: TOPIC, value: `order:${++n}`, key: null, producer: "orders-service" });
const orders = (count: number) => Array.from({ length: count }, order);
const cluster = (actions: Action[]): ClusterState => stateAfter([{ type: "createTopic", name: TOPIC, partitions: 3 }, ...actions], 3);

/** A box after typing setup commands, so readers and commits are real. */
const after = (start: KafkaBox, typed: string[]): KafkaBox => typeLines(kafkaShell, applyAll, start, typed).state;

/** Six orders, two per partition. */
const SIX = () => {
  n = 5000;
  return boxOf(cluster(orders(6)));
};

/** Billing has read and committed all six orders, and nobody is reading now. */
const BILLED = () => after(SIX(), [READ(BILLING, " --from-beginning")]);

export const FREE = SIX();

const lag = (s: ClusterState, group: string) => (s.groups[group] ? groupStats(s, group).lag : Infinity);
const readBy = (ctx: KafkaCtx, group: string) => deliveredIn(ctx.events.flat(), group);
const members = (s: ClusterState) => s.groups[BILLING]?.members ?? [];

/** Ten orders for the catch-up scenario: billing has committed six of them. */
const BEHIND = (() => {
  const box = BILLED();
  n = 5006;
  return { ...box, cluster: applyCluster(box.cluster, orders(4)) };
})();

function applyCluster(s: ClusterState, actions: Action[]): ClusterState {
  return applyAll(boxOf(s), actions).cluster;
}

export const scenarios: KafkaScenario[] = [
  {
    id: "second-team",
    title: l("İkinci ekip", "A second team"),
    story: l(
      "Analitik ekibi `orders`'taki **bütün** siparişleri raporlamak istiyor. Fatura servisi altı siparişi çoktan işledi; onun kaldığı yer hiç değişmemeli.",
      "The analytics team wants to report on **every** order in `orders`. The billing service has already handled all six; where it stands must not change.",
    ),
    goal: l(
      "`analytics` group'u 6 siparişin hepsini okuyup commit etsin; `billing`'in commit'leri yerinde kalsın.",
      "The `analytics` group reads and commits all 6 orders; `billing`'s commits stay where they are.",
    ),
    start: BILLED(),
    hints: [
      l(
        "Her group'un kendi commit'leri vardır. Yeni bir group, başka bir group'un ilerlemesine dokunmadan baştan okuyabilir.",
        "Every group has its own commits. A new group can read from the start without touching another group's progress.",
      ),
      l(
        "Yeni bir group'un nereden başlayacağını `--from-beginning` söyler (commit'i yoksa).",
        "`--from-beginning` tells a new group where to start (when it has no commits yet).",
      ),
      l(`\`${READ(ANALYTICS, " --from-beginning")}\``, `\`${READ(ANALYTICS, " --from-beginning")}\``),
    ],
    par: 1,
    check: (ctx) => {
      const before = ctx.start.groups[BILLING]!.committed;
      const now = ctx.state.groups[BILLING]?.committed ?? {};
      return lag(ctx.state, ANALYTICS) === 0 && readBy(ctx, ANALYTICS).length >= 6 && Object.keys(before).every((k) => now[k] === before[k]);
    },
  },
  {
    id: "catch-up",
    title: l("Geride kalan", "Fallen behind"),
    story: l(
      "Fatura servisi gece kapalıydı. Sabah `kafka-consumer-groups.sh` `billing`'in lag'ini 4 gösteriyor. Servis henüz ayağa kalkmadı; bekleyen siparişleri şimdi elle işlemen isteniyor.",
      "The billing service was down overnight. In the morning `kafka-consumer-groups.sh` shows `billing` with a lag of 4. The service isn't back yet; you're asked to handle the waiting orders by hand now.",
    ),
    goal: l("`billing` group'unun lag'i **0** olsun.", "The `billing` group's lag reaches **0**."),
    start: BEHIND,
    hints: [
      l("Önce `kafka-consumer-groups.sh --describe --group billing` ile LAG sütununa bak.", "Look at the LAG column first with `kafka-consumer-groups.sh --describe --group billing`."),
      l(
        "Lag, group'un **commit ettiği** yere göre sayılır. Okumak yetmez; aynı `--group` ile okumalısın ki commit gitsin.",
        "Lag counts from where the group **committed**. Reading isn't enough; read with the same `--group` so the commit goes in.",
      ),
      l(`\`${READ(BILLING)}\``, `\`${READ(BILLING)}\``),
    ],
    par: 1,
    check: (ctx) => lag(ctx.state, BILLING) === 0,
  },
  {
    id: "replay",
    title: l("Baştan işle", "Process it again"),
    story: l(
      "Fatura servisinde bir hata vardı: dünkü altı sipariş yanlış faturalandı. Düzeltme yayında; şimdi `billing` group'u o altı siparişi **yeniden** işlemeli.",
      "The billing service had a bug: yesterday's six orders were billed wrong. The fix is live; now the `billing` group must process those six orders **again**.",
    ),
    goal: l(
      "`billing` altı siparişin hepsini bir kez daha okusun ve sonunda lag 0 olsun.",
      "`billing` reads all six orders once more, and its lag ends at 0.",
    ),
    start: BILLED(),
    hints: [
      l(
        "`--from-beginning` sadece commit'i **olmayan** bir group için geçerlidir; `billing`'in commit'leri var.",
        "`--from-beginning` only applies to a group **without** commits; `billing` has some.",
      ),
      l(
        "Group'un commit'lerini `kafka-consumer-groups.sh --reset-offsets` geri alır; `--execute` olmadan sadece ne yapacağını gösterir.",
        "`kafka-consumer-groups.sh --reset-offsets` moves the group's commits back; without `--execute` it only shows what it would do.",
      ),
      l(
        `\`kafka-consumer-groups.sh ${B} --group billing --reset-offsets --to-earliest --topic orders --execute\` sonra \`${READ(BILLING)}\``,
        `\`kafka-consumer-groups.sh ${B} --group billing --reset-offsets --to-earliest --topic orders --execute\` then \`${READ(BILLING)}\``,
      ),
    ],
    par: 2,
    check: (ctx) => readBy(ctx, BILLING).length >= 6 && lag(ctx.state, BILLING) === 0,
  },
  {
    id: "team",
    title: l("Üç kişilik takım", "A team of three"),
    story: l(
      "Fatura servisinin tek kopyası arka planda çalışıyor ve üç partition'ın hepsini o okuyor. Kampanya başlıyor: iki kopya daha başlat, sonra gelen ilk üç siparişi (`order:6001`, `order:6002`, `order:6003`) yaz ve işin üç kopyaya paylaştırıldığını gör.",
      "One copy of the billing service runs in the background and reads all three partitions. The sale starts: start two more copies, then write the first three orders (`order:6001`, `order:6002`, `order:6003`) and see the work shared across the three copies.",
    ),
    goal: l(
      "`billing`'de **3 okuyucu** olsun ve **her biri** yeni siparişlerden en az birini okusun.",
      "**3 readers** in `billing`, and **each** reads at least one of the new orders.",
    ),
    start: after(SIX(), [RUNNING]),
    hints: [
      l("Aynı `--group` ile başlayan her okuyucu bir rebalance başlatır ve partition'lar yeniden paylaşılır.", "Every reader started with the same `--group` triggers a rebalance, and the partitions are shared out again."),
      l(
        "İki okuyucuyu `&` ile başlat; key'siz yazılan üç sipariş üç partition'a sırayla dağılır.",
        "Start two readers with `&`; three orders written without a key go to the three partitions in turn.",
      ),
      l(
        `İki kez \`${READER}\` sonra \`printf "order:6001\\norder:6002\\norder:6003\\n" | kafka-console-producer.sh ${B} --topic orders\``,
        `Twice \`${READER}\` then \`printf "order:6001\\norder:6002\\norder:6003\\n" | kafka-console-producer.sh ${B} --topic orders\``,
      ),
    ],
    par: 3,
    check: (ctx) => {
      const ms = members(ctx.state);
      const fresh = ctx.events.flat().filter((e) => e.type === "delivered" && e.group === BILLING);
      return ms.length === 3 && ms.every((m) => fresh.some((e) => e.type === "delivered" && e.member === m.id && e.offset >= 2));
    },
  },
  {
    id: "stuck",
    title: l("Kilitlenen kopya", "The stuck copy"),
    story: l(
      "Üç fatura kopyası çalışıyor. İkinci kopya (`%2`) kilitlendi, normal `kill`'e cevap vermiyor; zorla kapatman gerekiyor. Sonra gelen yeni sipariş (`order:7001`) yine de işlenmeli.",
      "Three billing copies are running. The second one (`%2`) hangs and ignores a normal `kill`; you need to force it down. The new order that comes in after that (`order:7001`) must still be handled.",
    ),
    goal: l(
      "İkinci kopya kapansın, kalan iki kopya üç partition'ı paylaşsın ve `order:7001` okunup lag 0 olsun.",
      "The second copy is gone, the other two share all three partitions, and `order:7001` gets read with lag at 0.",
    ),
    start: after(SIX(), [RUNNING, RUNNING, RUNNING]),
    hints: [
      l("`jobs` arka plandaki okuyucuları listeler.", "`jobs` lists the readers in the background."),
      l(
        "`kill -9` süreci hemen öldürür; group bunu çökme olarak görür ve partition'ı diğerlerine verir.",
        "`kill -9` ends the process at once; the group sees a crash and hands its partition to the others.",
      ),
      l(
        `\`kill -9 %2\` sonra \`echo "order:7001" | kafka-console-producer.sh ${B} --topic orders\``,
        `\`kill -9 %2\` then \`echo "order:7001" | kafka-console-producer.sh ${B} --topic orders\``,
      ),
    ],
    par: 2,
    check: (ctx) => {
      const gone = ctx.startBox.jobs[1]!.member;
      const ms = members(ctx.state);
      const owned = new Set(ms.flatMap((m) => m.assigned));
      const record = ctx.state.topics[TOPIC]!.partitions.flatMap((p) => p.records.map((r) => ({ p: p.index, r }))).find((x) => x.r.value === "order:7001");
      const read = Boolean(record && ctx.events.flat().some((e) => e.type === "delivered" && e.group === BILLING && e.tp === `${TOPIC}-${record.p}` && e.offset === record.r.offset));
      return ms.length === 2 && !ms.some((m) => m.id === gone) && owned.size === 3 && read && lag(ctx.state, BILLING) === 0;
    },
  },
];
