import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { allRecords, createLog, simulateStorage, type StorageAction } from "../../engine/storage";
import { sBox, type SBox, type SCtx } from "../../engine/storageCli";
import { ALI, CAN, CONFIG, ECE, put, sandboxStart, tableOf } from "./model";

export type CompactionScenario = Scenario<SCtx, SBox>;

export const TOPIC = "user-addresses";
const B = "--bootstrap-server localhost:9092";
/** The console producer as people use it for keyed records and tombstones. */
export const KEYED = `kafka-console-producer.sh ${B} --topic ${TOPIC} --property parse.key=true --property key.separator=: --property null.marker=NULL`;
const CONFIG_CMD = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name ${TOPIC} --add-config ${kv}`;

/** The closed segment holds one address each for Ali, Ece and Can; the active one has Ali's newer address. */
export const FREE = sBox(sandboxStart, TOPIC);

/** The same addresses on a topic someone created with the default policy: delete after 7 days. */
const DELETING = simulateStorage(
  [put(ALI, "İzmir"), put(ECE, "Ankara"), put(CAN, "Bursa"), put(ALI, "Ankara")] as StorageAction[],
  createLog({ ...CONFIG, policy: "delete", retentionDays: 7 }),
).logs.at(-1)!;

export const scenarios: CompactionScenario[] = [
  {
    id: "only-ali",
    title: l("Sadece Ali", "Only Ali"),
    story: l(
      "Ece ve Can hesaplarını kapattı ve KVKK gereği verileri silinmeli. Bu topic'i baştan okuyan servisler (yeni bir kopya kuran arama servisi gibi) artık onları görmemeli.",
      "Ece and Can closed their accounts, and privacy law says their data must go. Services that read this topic from the start (like a search service building a fresh copy) must no longer see them.",
    ),
    goal: l("Baştan okuyan biri için tabloda **sadece Ali** kalsın.", "For someone reading from the start, the table holds **only Ali**."),
    start: FREE,
    hints: [
      l(
        "Compacted bir topic'te bir key'i silmek için value'su boş (null) bir kayıt yazılır: tombstone. Okuyan onu görünce key'i siler; cleaner'ı beklemen gerekmez.",
        "On a compacted topic you delete a key by writing a record with an empty (null) value: a tombstone. A reader drops the key as soon as it sees it; no need to wait for the cleaner.",
      ),
      l("Konsol producer'da `--property null.marker=NULL` verirsen `NULL` yazdığın value null gider. İki tombstone tek `printf` ile gidebilir.", "Give the console producer `--property null.marker=NULL` and a value you type as `NULL` is sent as null. One `printf` can carry both tombstones."),
      l(`\`printf "ece:NULL\\ncan:NULL\\n" | ${KEYED}\``, `\`printf "ece:NULL\\ncan:NULL\\n" | ${KEYED}\``),
    ],
    par: 1,
    check: (ctx) => {
      const keys = [...tableOf(ctx.log).keys()];
      return keys.length === 1 && keys[0] === ALI.key;
    },
  },
  {
    id: "clean",
    title: l("Temizlik", "Clean-up"),
    story: l(
      "Disk raporuna bakınca Ali'nin eski adresinin (İzmir) hâlâ diskte durduğunu görüyorsun, oysa yenisi (Ankara) çoktan yazıldı. Cleaner neden silmiyor? Silmesini sağla.",
      "Looking at the disk report, you see Ali's old address (İzmir) still on disk, though the new one (Ankara) was written long ago. Why doesn't the cleaner remove it? Make it do so.",
    ),
    goal: l("Cleaner, yerini daha yeni bir değere bırakmış **eski bir kaydı** silsin.", "The cleaner removes an **old record** that a newer value has replaced."),
    start: FREE,
    hints: [
      l(
        "Ali'nin yeni adresi aktif segment'te ve cleaner aktif segment'e bakmıyor. O segment kapanmalı. `ls /var/lib/kafka/data/user-addresses-0` dosyaları gösterir.",
        "Ali's new address is in the active segment, and the cleaner ignores the active segment. It needs to close. `ls /var/lib/kafka/data/user-addresses-0` shows the files.",
      ),
      l("Bir segment 3 kayıt alıyor: aktif segment'i doldurup bir kayıt daha yaz ki yenisi açılsın, sonra cleaner'a zaman tanı (`sleep 1m`).", "A segment takes 3 records: fill the active one and write one more so a new one opens, then give the cleaner some time (`sleep 1m`)."),
      l(`\`printf "ece:Bursa\\ncan:Konya\\nali:Konya\\n" | ${KEYED}\`, sonra \`sleep 1m\``, `\`printf "ece:Bursa\\ncan:Konya\\nali:Konya\\n" | ${KEYED}\`, then \`sleep 1m\``),
    ],
    par: 2,
    check: (ctx) => ctx.events.some((evs) => evs.some((e) => e.type === "compacted" && e.removed.length > 0)),
  },
  {
    id: "forget-ece",
    title: l("Ece'yi unut", "Forget Ece"),
    story: l(
      "Ece verilerinin tamamen silinmesini istedi: diskte ne eski adresi ne de \"silindi\" işareti kalmalı. Hukuk ekibi `kafka-dump-log.sh` çıktısında Ece'yi arayacak.",
      "Ece asked for all her data to be erased: neither her old address nor a \"deleted\" marker may stay on disk. Legal will search the `kafka-dump-log.sh` output for her.",
    ),
    goal: l("Log'da Ece'den **hiç iz** kalmasın: ne eski adresi ne de tombstone'u.", "Leave **no trace** of Ece in the log: neither her old address nor her tombstone."),
    start: FREE,
    hints: [
      l(
        "Önce bir tombstone gerek, ve cleaner'ın onu görmesi için kapalı bir segment'e düşmesi. Tombstone ilk temizlikte kalır; `delete.retention.ms` (1 gün) geçtikten sonraki bir temizlikte gider.",
        "First you need a tombstone, and it must land in a closed segment for the cleaner to see it. A tombstone survives its first cleaning; it goes at a later one, once `delete.retention.ms` (1 day) has passed.",
      ),
      l("Tombstone'la birlikte segment'i kapatacak kadar kayıt yaz, cleaner çalışsın, sonra bir günden fazla bekle.", "Write the tombstone with enough records to close the segment, let the cleaner run, then wait more than a day."),
      l(`\`printf "ece:NULL\\ncan:Konya\\nali:Bursa\\n" | ${KEYED}\`, \`sleep 1m\`, \`sleep 2d\``, `\`printf "ece:NULL\\ncan:Konya\\nali:Bursa\\n" | ${KEYED}\`, \`sleep 1m\`, \`sleep 2d\``),
    ],
    par: 3,
    check: (ctx) => !allRecords(ctx.log).some((r) => r.key === ECE.key),
  },
  {
    id: "with-key",
    title: l("Key'siz olmaz", "Not without a key"),
    story: l(
      "Can taşındı: yeni adresi Eskişehir. Yeni gelen bir arkadaşın kaydı göndermeye çalıştı ama broker `Compacted topic cannot accept message without key` diye reddetti. Doğru gönder.",
      "Can moved: his new address is Eskişehir. A new colleague tried to send it, but the broker refused with `Compacted topic cannot accept message without key`. Send it the right way.",
    ),
    goal: l("Baştan okuyan biri Can'ı **Eskişehir**'de görsün.", "Someone reading from the start sees Can in **Eskişehir**."),
    start: FREE,
    hints: [
      l("Compacted bir topic her kaydı key'iyle tutar: key olmadan \"en son değer\" diye bir şey olamaz.", "A compacted topic keeps every record by its key: without a key there is no \"latest value\"."),
      l("Konsol producer'a `--property parse.key=true --property key.separator=:` ver, satırı `can:Eskişehir` diye yaz.", "Give the console producer `--property parse.key=true --property key.separator=:` and write the line as `can:Eskişehir`."),
      l(`\`echo "can:Eskişehir" | ${KEYED}\``, `\`echo "can:Eskişehir" | ${KEYED}\``),
    ],
    par: 1,
    check: (ctx) => tableOf(ctx.log).get(CAN.key) === "Eskişehir",
  },
  {
    id: "turn-on",
    title: l("Compaction'ı aç", "Turn compaction on"),
    story: l(
      "Bir hata fark ettin: `user-addresses` varsayılan politikayla açılmış ve 7 gün sonra adresler siliniyor. Bir haftadır taşınmayan kullanıcıların adresi kaybolacak! Bu topic her kullanıcının son adresini sonsuza dek tutmalı.",
      "You spotted a mistake: `user-addresses` was created with the default policy and addresses are deleted after 7 days. Users who haven't moved in a week will lose their address! This topic must keep every user's latest address forever.",
    ),
    goal: l("Topic sıkıştırılan (compacted) bir topic olsun.", "Make the topic a compacted topic."),
    start: sBox(DELETING, TOPIC),
    hints: [
      l("Silmek yerine key başına son değeri tutmak topic'in temizlik politikası: `cleanup.policy`.", "Keeping the latest value per key instead of deleting is the topic's clean-up policy: `cleanup.policy`."),
      l("`kafka-configs.sh --alter --entity-type topics --entity-name user-addresses --add-config cleanup.policy=...`", "`kafka-configs.sh --alter --entity-type topics --entity-name user-addresses --add-config cleanup.policy=...`"),
      l(`\`${CONFIG_CMD("cleanup.policy=compact")}\``, `\`${CONFIG_CMD("cleanup.policy=compact")}\``),
    ],
    par: 1,
    check: (ctx) => ctx.log.config.policy === "compact",
  },
];
