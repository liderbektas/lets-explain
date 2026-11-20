import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { createLog, simulateStorage, type StorageAction, type StorageLog } from "../../engine/storage";
import { sBox, type SBox, type SCtx } from "../../engine/storageCli";
import { CONFIG, sandboxStart } from "./model";

export type SegmentScenario = Scenario<SCtx, SBox>;

const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;
const CONFIG_CMD = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config ${kv}`;

let n = 5000;
const put = (): StorageAction => ({ type: "append", value: `order:${n++}` });
const after = (actions: StorageAction[], start: StorageLog) => simulateStorage(actions, start).logs.at(-1)!;

/** Four orders on day 0: segment 0 is closed and full, segment 3 is active with one record. */
export const FREE = sBox(sandboxStart, "orders");

/** Three orders on day 0, three on day 4, one on day 6: three segments, today is day 6. */
const WEEK = after([put(), put(), put(), { type: "tick", days: 4 }, put(), put(), put(), { type: "tick", days: 2 }, put()], createLog(CONFIG));

/** Seven orders on day 0: segments 0, 3 and 6. */
const SEVEN = after([put(), put(), put(), put(), put(), put(), put()], createLog(CONFIG));

const rolledBySize = (ctx: SCtx) => ctx.events.some((evs) => evs.some((e) => e.type === "rolled" && e.reason === "size"));

export const scenarios: SegmentScenario[] = [
  {
    id: "roll",
    title: l("Yeni segment", "A new segment"),
    story: l(
      "Bu topic'te bir segment 3 KiB alıyor (`segment.bytes=3072`) ve her sipariş 1 KiB. Aktif segment'in dolup Kafka'nın yeni bir dosya açtığını kendi gözünle görmek istiyorsun.",
      "On this topic a segment holds 3 KiB (`segment.bytes=3072`) and every order is 1 KiB. You want to see with your own eyes the active segment fill up and Kafka open a new file.",
    ),
    goal: l("Aktif segment **dolsun** ve Kafka yeni bir segment açsın.", "The active segment **fills up** and Kafka rolls a new one."),
    start: FREE,
    hints: [
      l("`ls /var/lib/kafka/data/orders-0` segment dosyalarını gösterir. Aktif segment'te kaç kayıt var?", "`ls /var/lib/kafka/data/orders-0` shows the segment files. How many records are in the active one?"),
      l("Aktif segment'te 1 kayıt var: 2 kayıt onu doldurur, 3. kayıt yeni bir segment açtırır. Tek bir `printf` üç satır gönderebilir.", "The active segment has 1 record: 2 more fill it, and the 3rd makes Kafka roll a new one. One `printf` can send three lines."),
      l(`\`printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}\``, `\`printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}\``),
    ],
    par: 1,
    check: rolledBySize,
  },
  {
    id: "start-at-3",
    title: l("Log 3'ten başlasın", "Start at 3"),
    story: l(
      "Retention'ın tam olarak nasıl sildiğini ekibe göstereceksin: eski segment silinsin ama aktif segment, yani yazılmaya devam eden dosya, yerinde kalsın. Saat sadece `sleep` ile ilerliyor.",
      "You are going to show the team exactly how retention deletes: the old segment goes, but the active segment, the file still being written, stays. The clock moves only with `sleep`.",
    ),
    goal: l("Retention segment 0'ı silsin ve log **offset 3** ile başlasın.", "Retention deletes segment 0 and the log **starts at offset 3**."),
    start: FREE,
    hints: [
      l(
        "Zaman geçince ikisinin de süresi dolar. Retention bir segment'e en yeni kaydına bakarak karar verir: aktif segment'i genç tutmanın yolu ona yeni bir kayıt yazmak.",
        "With time, both expire. Retention judges a segment by its newest record: the way to keep the active segment young is to write a new record into it.",
      ),
      l("Birkaç gün bekle, bir sipariş yaz, sonra segment 0'ın 7 günü dolana kadar bekle. `kafka-get-offsets.sh --time -2` log'un nereden başladığını söyler.", "Wait a few days, write an order, then wait until segment 0 is past 7 days. `kafka-get-offsets.sh --time -2` tells you where the log starts."),
      l(`\`sleep 5d\`, \`echo "order:9" | ${PRODUCE}\`, \`sleep 3d\``, `\`sleep 5d\`, \`echo "order:9" | ${PRODUCE}\`, \`sleep 3d\``),
    ],
    par: 3,
    check: (ctx) => ctx.log.logStartOffset === 3,
  },
  {
    id: "old-survivor",
    title: l("Eski ama burada", "Old but still here"),
    story: l(
      "Bir denetçi soruyor: \"Retention 7 gün diyorsunuz, ama diskte 8 günlük bir sipariş gördüm. Nasıl?\" Bunun nasıl olduğunu kendin yeniden üret.",
      "An auditor asks: \"You say retention is 7 days, yet I found an 8-day-old order on disk. How?\" Reproduce how that happens yourself.",
    ),
    goal: l("**Kapalı** bir segment'te 7 günden eski bir kayıt hâlâ dursun.", "A record older than 7 days still sits in a **closed** segment."),
    start: FREE,
    hints: [
      l(
        "Retention segment'e en yeni kaydına bakarak karar verir. Eski bir kayıtla aynı segment'e daha yeni kayıtlar koy, sonra o segment'i kapat.",
        "Retention judges a segment by its newest record. Put newer records in the same segment as an old one, then close that segment.",
      ),
      l("Birkaç gün bekle, aktif segment'i dolduracak kadar (ve bir fazla) yaz, sonra eski kayıt 7 günü geçene kadar bekle.", "Wait a few days, write enough to fill the active segment (and one more), then wait until the old record is past 7 days."),
      l(`\`sleep 6d\`, \`printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}\`, \`sleep 2d\``, `\`sleep 6d\`, \`printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}\`, \`sleep 2d\``),
    ],
    par: 3,
    check: (ctx) => {
      const { log } = ctx;
      return log.segments.slice(0, -1).some((seg) => seg.records.some((r) => log.time - r.time > log.config.retentionDays!));
    },
  },
  {
    id: "disk-full",
    title: l("Disk doluyor", "The disk is filling up"),
    story: l(
      "Gece alarm geldi: broker'ın diski doluyor ve en büyük yer kaplayan `orders`. Ekip kararını verdi: bu topic'te 7 gün yerine **3 gün** yetecek.",
      "An alert came in the night: the broker's disk is filling up, and `orders` takes the most space. The team decided: **3 days** are enough on this topic instead of 7.",
    ),
    goal: l("`orders` 3 günden eski segment'leri tutmasın; eski segment silinsin.", "`orders` keeps no segment older than 3 days; the old segment is deleted."),
    start: sBox(WEEK, "orders"),
    hints: [
      l("Saklama süresi topic'in `retention.ms` ayarı; milisaniye cinsinden.", "How long records are kept is the topic's `retention.ms`, in milliseconds."),
      l("3 gün = 3 × 24 × 60 × 60 × 1000 = 259200000 ms. `kafka-configs.sh --alter ... --add-config retention.ms=...`", "3 days = 3 × 24 × 60 × 60 × 1000 = 259200000 ms. `kafka-configs.sh --alter ... --add-config retention.ms=...`"),
      l(`\`${CONFIG_CMD("retention.ms=259200000")}\``, `\`${CONFIG_CMD("retention.ms=259200000")}\``),
    ],
    par: 1,
    check: (ctx) => ctx.log.config.retentionDays === 3 && ctx.log.logStartOffset === 3,
  },
  {
    id: "size-cap",
    title: l("Boyut sınırı", "A size cap"),
    story: l(
      "Bir test ortamında disk çok küçük. `orders` partition'ının boyutu, süreye bakmadan, **4 KiB**'ı geçmemeli; fazlası en eski segment'ten silinsin.",
      "In a test environment the disk is tiny. The `orders` partition must not grow past **4 KiB**, whatever the age; anything more goes, oldest segment first.",
    ),
    goal: l("Topic'te 4 KiB'lık bir boyut sınırı olsun ve en eski segment silinsin.", "The topic has a 4 KiB size cap and the oldest segment is deleted."),
    start: sBox(SEVEN, "orders"),
    hints: [
      l("Süre için `retention.ms` vardı; boyut için de bir retention ayarı var.", "There was `retention.ms` for time; there is a retention setting for size too."),
      l("`retention.bytes` byte cinsinden: 4 KiB = 4096.", "`retention.bytes` is in bytes: 4 KiB = 4096."),
      l(`\`${CONFIG_CMD("retention.bytes=4096")}\``, `\`${CONFIG_CMD("retention.bytes=4096")}\``),
    ],
    par: 1,
    check: (ctx) => ctx.log.config.retentionRecords === 4 && ctx.log.logStartOffset === 3,
  },
];
