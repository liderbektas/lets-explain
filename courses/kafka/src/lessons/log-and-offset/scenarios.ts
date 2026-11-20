import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { l } from "@lets-explain/core/i18n";
import { groupStats } from "../../engine/cluster";
import { applyAll, boxOf, kafkaShell, type KafkaBox } from "../../engine/cli";
import type { ClusterState } from "../../engine/types";
import type { KafkaCtx, KafkaScenario } from "../shared/TopicLessonScene";
import { stateAfter } from "../shared/topicSim";
import { ANALYTICS, BILLING, P, TOPIC } from "./model";

/**
 * Scenarios for the log and offsets: the one-partition `orders` log, read by the billing and
 * analytics groups. Readers started in the terminal are console consumers.
 */

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic ${TOPIC} --group ${group}${extra}`;
const WRITE = (...values: string[]) => `printf "${values.join("\\n")}\\n" | kafka-console-producer.sh ${B} --topic ${TOPIC}`;
export const DELETE = `kafka-delete-records.sh ${B} --offset-json-file delete.json`;
/** The file a teammate prepared: delete everything before offset 4. */
const DELETE_JSON = `{"partitions":[{"topic":"${TOPIC}","partition":0,"offset":4}],"version":1}`;

const EMPTY = () => boxOf(stateAfter([{ type: "createTopic", name: TOPIC, partitions: 1 }], 1));
const after = (start: KafkaBox, typed: string[]): KafkaBox => typeLines(kafkaShell, applyAll, start, typed).state;

/** The nine records of the lesson: orders 1041–1048 and a cancel, offsets 0–8. */
const NINE = ["order:1041", "order:1042", "order:1043", "order:1044", "order:1045", "cancel:1042", "order:1046", "order:1047", "order:1048"];

/** Free play: the nine records, billing has read them all, analytics has read two. */
export const FREE = after(EMPTY(), [WRITE(...NINE), READ(BILLING.group, " --from-beginning"), READ(ANALYTICS.group, " --from-beginning --max-messages 2")]);

const stats = (s: ClusterState, group: string) => (s.groups[group] ? groupStats(s, group) : null);
const dupsSince = (ctx: KafkaCtx, group: string) => (stats(ctx.state, group)?.duplicates ?? 0) - (stats(ctx.start, group)?.duplicates ?? 0);
const readOffsets = (ctx: KafkaCtx, group: string) =>
  new Set(ctx.events.flat().flatMap((e) => (e.type === "delivered" && e.group === group ? [e.offset] : [])));
const log = (s: ClusterState) => s.topics[TOPIC]!.partitions[0]!;
const committed = (s: ClusterState, group: string) => s.groups[group]?.committed[P];

export const scenarios: KafkaScenario[] = [
  {
    id: "where-left",
    title: l("Kaldığı yerden", "Where it left off"),
    story: l(
      "Fatura servisi beş siparişi işleyip commit ettikten sonra kapandı; bu arada üç sipariş daha geldi. Servis henüz dönmedi, kalanları elle işlemen gerekiyor. Daha önce faturalanan bir sipariş **ikinci kez** faturalanmamalı.",
      "The billing service handled and committed five orders, then shut down; three more orders came in meanwhile. The service isn't back yet, so you handle the rest by hand. An order that was already billed must not be billed **a second time**.",
    ),
    goal: l(
      "`billing` sadece yeni üç siparişi okusun, hiçbir kayıt iki kez okunmasın ve lag 0 olsun.",
      "`billing` reads only the three new orders, nothing is read twice, and its lag is 0.",
    ),
    start: after(EMPTY(), [WRITE(...NINE.slice(0, 5)), READ(BILLING.group, " --from-beginning"), WRITE(...NINE.slice(5, 8))]),
    hints: [
      l(
        "Group'un commit ettiği offset, \"buraya kadar işledim\" demek. Aynı group'la okuyan oradan devam eder.",
        "A group's committed offset says \"I'm done up to here\". Whoever reads with that group carries on from there.",
      ),
      l("`kafka-consumer-groups.sh --describe --group billing` nerede kaldığını gösterir; sonra aynı `--group` ile oku.", "`kafka-consumer-groups.sh --describe --group billing` shows where it stopped; then read with the same `--group`."),
      l(`\`${READ(BILLING.group)}\``, `\`${READ(BILLING.group)}\``),
    ],
    par: 1,
    check: (ctx) => {
      const read = readOffsets(ctx, BILLING.group);
      return [5, 6, 7].every((o) => read.has(o)) && dupsSince(ctx, BILLING.group) === 0 && stats(ctx.state, BILLING.group)?.lag === 0;
    },
  },
  {
    id: "double",
    title: l("Çift fatura", "Double invoice"),
    story: l(
      "Bir takım arkadaşın \"otomatik commit'i kapatsak ne olur?\" diye soruyor. Göster: Fatura okuyucusunu `enable.auto.commit=false` ile arka planda başlat, iki sipariş gelsin (`order:1049`, `order:1050`), okuyucu çöksün (`kill -9`) ve yeniden başlasın.",
      "A teammate asks \"what if we turned auto commit off?\" Show them: start the billing reader in the background with `enable.auto.commit=false`, let two orders come in (`order:1049`, `order:1050`), crash the reader (`kill -9`), and start it again.",
    ),
    goal: l("`billing` bir siparişi **ikinci kez** okusun.", "`billing` reads an order **a second time**."),
    start: after(EMPTY(), [WRITE(...NINE.slice(0, 6)), READ(BILLING.group, " --from-beginning")]),
    hints: [
      l(
        "Commit edilmemiş ilerleme çökmede kaybolur; yeniden başlayan okuyucu son commit'ten başlar.",
        "Uncommitted progress is lost in a crash; a restarted reader begins at the last commit.",
      ),
      l(
        "Ayar consumer'a `--consumer-property enable.auto.commit=false` ile verilir; okuyucuyu `&` ile arka planda başlat, `kill -9 %1` onu çökertir.",
        "The setting goes to the consumer with `--consumer-property enable.auto.commit=false`; start the reader in the background with `&`, and `kill -9 %1` crashes it.",
      ),
      l(
        `\`${READ(BILLING.group, " --consumer-property enable.auto.commit=false")} &\`, \`${WRITE("order:1049", "order:1050")}\`, \`kill -9 %1\`, \`${READ(BILLING.group)}\``,
        `\`${READ(BILLING.group, " --consumer-property enable.auto.commit=false")} &\`, \`${WRITE("order:1049", "order:1050")}\`, \`kill -9 %1\`, \`${READ(BILLING.group)}\``,
      ),
    ],
    par: 4,
    check: (ctx) => dupsSince(ctx, BILLING.group) > 0 && !ctx.moves.flat().some((a) => a.type === "resetOffsets"),
  },
  {
    id: "replay",
    title: l("Baştan say", "Count it again"),
    story: l(
      "Analitik ekibi raporunda bir hata buldu: log'da şu an duran **bütün** kayıtları yeniden okuyup saymaları gerekiyor. Eski kayıtların bir kısmı retention ile silinmiş; onlar artık yok.",
      "The analytics team found a bug in its report: it has to read and count **every** record now on the log again. Some old records were deleted by retention; those are gone.",
    ),
    goal: l(
      "`analytics` log'daki bütün kayıtları yeniden okusun ve sonunda lag 0 olsun.",
      "`analytics` reads every record on the log again, and its lag ends at 0.",
    ),
    start: after(EMPTY(), [WRITE(...NINE), READ(ANALYTICS.group, " --from-beginning"), "echo '" + DELETE_JSON + "' > delete.json", DELETE, "rm delete.json"]),
    hints: [
      l(
        "`--from-beginning`, commit'i olan bir group için bir şey değiştirmez. Commit'i geri taşıman gerekiyor.",
        "`--from-beginning` changes nothing for a group that has commits. You need to move the commit back.",
      ),
      l(
        "`--reset-offsets --to-earliest` group'u log'un **şu anki** başına götürür: silinmiş offset'lere değil.",
        "`--reset-offsets --to-earliest` takes the group to where the log starts **now**, not to deleted offsets.",
      ),
      l(
        `\`kafka-consumer-groups.sh ${B} --group analytics --reset-offsets --to-earliest --topic orders --execute\` sonra \`${READ(ANALYTICS.group)}\``,
        `\`kafka-consumer-groups.sh ${B} --group analytics --reset-offsets --to-earliest --topic orders --execute\` then \`${READ(ANALYTICS.group)}\``,
      ),
    ],
    par: 2,
    check: (ctx) => {
      const p = log(ctx.state);
      const read = readOffsets(ctx, ANALYTICS.group);
      return p.records.every((r) => read.has(r.offset)) && stats(ctx.state, ANALYTICS.group)?.lag === 0;
    },
  },
  {
    id: "safe-delete",
    title: l("Silmeden önce", "Before you delete"),
    story: l(
      "Disk doluyor. Ekip `orders`'ta offset 4'ten eski kayıtları silmeye karar verdi ve silme dosyasını hazırladı: `delete.json`. Ama Analitik henüz sadece iki kaydı okudu; silinecek kayıtları kaybetmemeli.",
      "The disk is filling up. The team decided to delete the records before offset 4 in `orders` and prepared the file: `delete.json`. But analytics has read only two records so far; it must not lose the ones about to go.",
    ),
    goal: l(
      "Offset 4'ten öncesi silinsin ve `analytics` **hiçbir kaydı kaçırmasın**.",
      "Everything before offset 4 is deleted, and `analytics` **misses no record**.",
    ),
    start: { ...FREE, files: { "delete.json": DELETE_JSON } },
    hints: [
      l(
        "Retention okuyucuyu beklemez: okunmamış bir kayıt silinirse o group onu hiç göremez. Sıra önemli.",
        "Retention waits for no reader: if an unread record is deleted, that group never sees it. Order matters.",
      ),
      l(
        "Önce Analitik yetişsin (`--group analytics` ile oku), sonra `kafka-delete-records.sh` ile sil.",
        "Let analytics catch up first (read with `--group analytics`), then delete with `kafka-delete-records.sh`.",
      ),
      l(`\`${READ(ANALYTICS.group)}\` sonra \`${DELETE}\``, `\`${READ(ANALYTICS.group)}\` then \`${DELETE}\``),
    ],
    par: 2,
    check: (ctx) =>
      log(ctx.state).logStartOffset >= 4 &&
      (committed(ctx.state, ANALYTICS.group) ?? 0) >= 4 &&
      (stats(ctx.state, ANALYTICS.group)?.skipped ?? 0) === (stats(ctx.start, ANALYTICS.group)?.skipped ?? 0),
  },
];
