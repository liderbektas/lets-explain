import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { l } from "@lets-explain/core/i18n";
import { groupStats } from "../../engine/cluster";
import { applyAll, boxOf, kafkaShell, type KafkaBox } from "../../engine/cli";
import type { ClusterState } from "../../engine/types";
import type { KafkaCtx, KafkaScenario } from "../shared/TopicLessonScene";
import { stateAfter } from "../shared/topicSim";
import { ANALYTICS, BILLING, P, TOPIC } from "./model";

/**
 * Scenarios for Kafka versus queues. They are played in the Kafka world: each story starts
 * from something a queue would do (delete on ack, hand a message to one worker) and asks for
 * what Kafka does instead. The topic has one partition, like the lesson's picture.
 */

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic ${TOPIC} --group ${group}${extra}`;
const WRITE = (...values: string[]) => `printf "${values.join("\\n")}\\n" | kafka-console-producer.sh ${B} --topic ${TOPIC}`;

const after = (start: KafkaBox, typed: string[]): KafkaBox => typeLines(kafkaShell, applyAll, start, typed).state;

/** Six orders, all handled and committed by billing; nobody is reading now. */
const SIX = () =>
  after(boxOf(stateAfter([{ type: "createTopic", name: TOPIC, partitions: 1 }], 1)), [
    WRITE("order:1041", "order:1042", "order:1043", "order:1044", "order:1045", "order:1046"),
    READ(BILLING.group, " --from-beginning"),
  ]);

export const FREE = SIX();

const stats = (s: ClusterState, group: string) => (s.groups[group] ? groupStats(s, group) : null);
const read = (ctx: KafkaCtx, group: string) => new Set(ctx.events.flat().flatMap((e) => (e.type === "delivered" && e.group === group ? [e.offset] : [])));
const committed = (s: ClusterState, group: string) => s.groups[group]?.committed[P];
const dupsSince = (ctx: KafkaCtx, group: string) => (stats(ctx.state, group)?.duplicates ?? 0) - (stats(ctx.start, group)?.duplicates ?? 0);

export const scenarios: KafkaScenario[] = [
  {
    id: "late-joiner",
    title: l("Sonradan gelen", "The late joiner"),
    story: l(
      "Bir kuyrukta, onaylanan mesaj silinir: bugün kurulan bir servis dünkü siparişleri asla göremez. Analitik servisi bugün kuruldu ve `orders`'taki **bütün** siparişleri istiyor. Fatura altısını çoktan işledi.",
      "In a queue, an acknowledged message is deleted: a service set up today can never see yesterday's orders. The analytics service was set up today and wants **every** order in `orders`. Billing already handled all six.",
    ),
    goal: l(
      "`analytics` altı siparişin hepsini okuyup commit etsin; `billing`'in yeri değişmesin.",
      "`analytics` reads and commits all six orders; `billing` stays where it is.",
    ),
    start: SIX(),
    hints: [
      l("Kafka'da okunan kayıt silinmez. Yeni bir group, log'u baştan okuyabilir.", "In Kafka a record isn't deleted when read. A new group can read the log from the start."),
      l("Analitik kendi `--group`'uyla okumalı; commit'i olmayan bir group'a `--from-beginning` nereden başlayacağını söyler.", "Analytics should read with its own `--group`; for a group without commits, `--from-beginning` says where to start."),
      l(`\`${READ(ANALYTICS.group, " --from-beginning")}\``, `\`${READ(ANALYTICS.group, " --from-beginning")}\``),
    ],
    par: 1,
    check: (ctx) => read(ctx, ANALYTICS.group).size === 6 && committed(ctx.state, ANALYTICS.group) === 6 && committed(ctx.state, BILLING.group) === committed(ctx.start, BILLING.group),
  },
  {
    id: "replay",
    title: l("Geçmişi yeniden oku", "Replay history"),
    story: l(
      "Fatura'nın vergi hesabında bir hata vardı; altı siparişin hepsi yeniden hesaplanmalı. Kuyruk kullansaydınız bu mesajlar çoktan silinmişti. Kafka'da hâlâ log'dalar.",
      "Billing's tax calculation had a bug; all six orders must be calculated again. With a queue these messages would be long gone. In Kafka they're still on the log.",
    ),
    goal: l("`billing` altı siparişi bir kez daha okusun ve sonunda lag 0 olsun.", "`billing` reads all six orders once more, and its lag ends at 0."),
    start: SIX(),
    hints: [
      l("`billing`'in commit'leri var; `--from-beginning` artık işe yaramaz.", "`billing` has commits; `--from-beginning` no longer helps."),
      l("Group'un commit'ini `kafka-consumer-groups.sh --reset-offsets` ile başa al, sonra oku.", "Move the group's commit back with `kafka-consumer-groups.sh --reset-offsets`, then read."),
      l(
        `\`kafka-consumer-groups.sh ${B} --group billing --reset-offsets --to-earliest --topic orders --execute\` sonra \`${READ(BILLING.group)}\``,
        `\`kafka-consumer-groups.sh ${B} --group billing --reset-offsets --to-earliest --topic orders --execute\` then \`${READ(BILLING.group)}\``,
      ),
    ],
    par: 2,
    check: (ctx) => read(ctx, BILLING.group).size === 6 && stats(ctx.state, BILLING.group)?.lag === 0,
  },
  {
    id: "own-pace",
    title: l("Herkes kendi hızında", "Everyone at their own pace"),
    story: l(
      "Analitik yavaş: ancak iki sipariş okuyabildi. Bu arada iki yeni sipariş geldi. Fatura hızlı olmalı ve yeni siparişleri hemen işlemeli; ama Analitik'in kaldığı yer kesinlikle değişmemeli.",
      "Analytics is slow: it has read only two orders. Meanwhile two new orders came in. Billing has to be quick and handle the new orders now, but analytics' place must not change at all.",
    ),
    goal: l(
      "`billing`'in lag'i 0 olsun; `analytics` olduğu yerde, offset 2'de kalsın.",
      "`billing`'s lag reaches 0; `analytics` stays where it was, at offset 2.",
    ),
    start: after(SIX(), [READ(ANALYTICS.group, " --from-beginning --max-messages 2"), WRITE("order:1047", "order:1048")]),
    hints: [
      l("Kafka'da her group'un kendi commit'i var; biri okuyunca diğeri etkilenmez.", "In Kafka every group has its own commit; one reading doesn't affect the other."),
      l("`kafka-consumer-groups.sh --describe --all-groups` iki group'un LAG'ini yan yana gösterir. Sonra sadece Fatura'yla oku.", "`kafka-consumer-groups.sh --describe --all-groups` shows both groups' LAG side by side. Then read with billing only."),
      l(`\`${READ(BILLING.group)}\``, `\`${READ(BILLING.group)}\``),
    ],
    par: 1,
    check: (ctx) => stats(ctx.state, BILLING.group)?.lag === 0 && committed(ctx.state, ANALYTICS.group) === 2,
  },
  {
    id: "redeliver",
    title: l("Yeniden teslim", "Redelivery"),
    story: l(
      "Kuyrukta, onaylanmadan çöken worker'ın mesajı başka bir worker'a gider. Kafka'da \"onay\" commit'tir. Fatura okuyucusunu commit'siz (`enable.auto.commit=false`) arka planda başlat, iki sipariş gelsin (`order:1047`, `order:1048`), okuyucu `kill -9` ile çöksün, sonra yeniden başlat.",
      "In a queue, a message held by a worker that crashes before acking goes to another worker. In Kafka the \"ack\" is the commit. Start the billing reader in the background without commits (`enable.auto.commit=false`), let two orders come in (`order:1047`, `order:1048`), crash the reader with `kill -9`, then start it again.",
    ),
    goal: l("Commit edilmemiş siparişler `billing`'e **ikinci kez** gelsin.", "The uncommitted orders reach `billing` **a second time**."),
    start: SIX(),
    hints: [
      l("Çöken okuyucunun commit etmediği ilerleme kaybolur; yeniden başlayan son commit'ten okur.", "Progress the crashed reader didn't commit is lost; whoever starts again reads from the last commit."),
      l(
        "`--consumer-property enable.auto.commit=false` ile `&` sonda: arka planda okur ama commit etmez. `kill -9 %1` çökertir.",
        "`--consumer-property enable.auto.commit=false` with `&` at the end: it reads in the background but never commits. `kill -9 %1` crashes it.",
      ),
      l(
        `\`${READ(BILLING.group, " --consumer-property enable.auto.commit=false")} &\`, \`${WRITE("order:1047", "order:1048")}\`, \`kill -9 %1\`, \`${READ(BILLING.group)}\``,
        `\`${READ(BILLING.group, " --consumer-property enable.auto.commit=false")} &\`, \`${WRITE("order:1047", "order:1048")}\`, \`kill -9 %1\`, \`${READ(BILLING.group)}\``,
      ),
    ],
    par: 4,
    check: (ctx) => dupsSince(ctx, BILLING.group) >= 2 && !ctx.moves.flat().some((a) => a.type === "resetOffsets"),
  },
];
