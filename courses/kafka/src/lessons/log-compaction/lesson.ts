import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, LogCompactionScene } from "./Scene";

export const logCompaction: Lesson = {
  slug: "log-compaction",
  title: l("Log Compaction", "Log Compaction"),
  summary: l(
    "Süreye göre silmek yerine her key'in son değerini sonsuza kadar saklamak: compaction, tombstone ve boşluklu offset'ler.",
    "Instead of deleting by age, keep each key's latest value for good: compaction, tombstones and offsets with gaps.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: LogCompactionScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Süreye göre silmenin neden her topic'e uymadığını görmek", "See why deleting by age does not suit every topic"), step: 1 },
    { text: l("Compaction'ın her key'in son değerini nasıl sakladığını görmek", "See how compaction keeps each key's latest value"), step: 3 },
    { text: l("Aktif segment'in neden temizlenmediğini anlamak", "Understand why the active segment is never cleaned"), step: 4 },
    { text: l("Bir key'i tombstone ile silmek", "Delete a key with a tombstone"), step: 5 },
    { text: l("Tombstone'un ne zaman tamamen gittiğini görmek", "See when a tombstone is finally removed"), step: 6 },
    { text: l("Sıkıştırılmış bir topic'ten bir tabloyu yeniden kurmak", "Rebuild a table from a compacted topic"), step: 7 },
  ],
  steps: [
    {
      short: l("Tablo gibi", "Like a table"),
      tag: "how",
      title: l("Bazı topic'ler bir tabloya benzer", "Some topics are like a table"),
      body: [
        l(
          "`user-addresses` topic'i kullanıcıların adreslerini tutuyor. Her kaydın bir key'i var (kullanıcı) ve bir value'su (şehir). Ali İzmir'de, Ece Ankara'da, Can Bursa'da.",
          "The `user-addresses` topic holds users' addresses. Every record has a key (the user) and a value (the city). Ali is in İzmir, Ece in Ankara, Can in Bursa.",
        ),
        l(
          "Kolilerin altındaki harf kaydın key'i. Sağ üstteki kart, bu log'u baştan sona okuyan birinin kafasında oluşan tabloyu gösteriyor.",
          "The letter under each parcel is the record's key. The card at the top right shows the table that forms in the head of someone reading this log from start to end.",
        ),
        l(
          "Böyle topic'lerde önemli olan geçmiş değil, her key'in **son** değeridir.",
          "In topics like this what matters is not the history but each key's **latest** value.",
        ),
      ],
    },
    {
      short: l("Sorun", "The problem"),
      tag: "problem",
      title: l("Retention son adresi de siler", "Retention deletes the latest address too"),
      body: [
        l(
          "Önceki derste gördüğümüz retention süreye bakar: 7 gün geçince segment'i siler. Bu bir sipariş akışı için doğru, ama adres tablosu için değil.",
          "The retention from the last lesson looks at age: after 7 days it deletes the segment. That is right for a stream of orders, but not for an address table.",
        ),
        l(
          "Can adresini bir yıldır değiştirmedi. Süreye göre silinseydi, Can'ın **tek ve hâlâ geçerli** adresi de 7 gün sonra kaybolurdu. Yeni başlayan bir servis Can'ın nerede yaşadığını hiç öğrenemezdi.",
          "Can has not moved in a year. If we deleted by age, Can's **only, still valid** address would be gone after 7 days. A newly started service would never learn where Can lives.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Telefon rehberi gibi düşün: eski numaraları atabilirsin ama herkesin son numarasını saklamak istersin, ne kadar eski olursa olsun.",
            "Think of a phone book: you can throw away old numbers, but you want to keep everyone's latest one, however old it is.",
          ),
        },
      ],
    },
    {
      short: l("Fikir", "The idea"),
      tag: "idea",
      title: l("Fikir: her key'in son değerini sakla", "The idea: keep each key's latest value"),
      body: [
        l(
          "Topic'in silme kuralını değiştiriyoruz: `cleanup.policy=compact`. Artık Kafka eski kayıtları yaşına göre değil, **aynı key için daha yeni bir kayıt** olup olmadığına göre siler.",
          "We change the topic's clean-up rule: `cleanup.policy=compact`. Now Kafka removes old records not by age but by whether **a newer record exists for the same key**.",
        ),
        l(
          "Bu sırada birkaç taşınma oldu: Ali iki kez taşındı (Ankara, sonra Bursa), Ece Antalya'ya, Can Konya'ya gitti. Offset 6 gelince yeni bir segment açıldı.",
          "Meanwhile a few people moved: Ali twice (Ankara, then Bursa), Ece to Antalya, Can to Konya. At offset 6 a new segment rolled.",
        ),
        l(
          "Bu işi broker'daki [[cleaner|log cleaner]] yapar. Şimdi onu çalıştıracağız.",
          "The job is done by the [[cleaner|log cleaner]] on the broker. We are about to run it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sıkıştırılan bir topic'e key'siz kayıt yazılamaz; broker onu reddeder. Key, \"bu kayıt neyin son hâli\" sorusunun cevabıdır.",
            "A compacted topic does not accept records without a key; the broker rejects them. The key answers \"what is this record the latest version of?\".",
          ),
        },
      ],
    },
    {
      short: l("Temizlik", "Cleaning"),
      tag: "experiment",
      predict: {
        question: l(
          "Cleaner şimdi çalışacak. Kapalı segment'lerde offset 0–5 var; aktif segment'te Can'ın Konya kaydı (6). Temizlikten sonra kapalı segment'lerde hangi offset'ler kalır?",
          "The cleaner is about to run. The closed segments hold offsets 0–5; the active segment holds Can's Konya record (6). After cleaning, which offsets remain in the closed segments?",
        ),
        options: [
          l("Hepsi kalır: compaction kayıt silmez", "All of them: compaction deletes nothing"),
          l("4 ve 5: Can'ın son kaydı zaten 6", "4 and 5: Can's latest is 6 anyway"),
          l("2, 4 ve 5", "2, 4 and 5"),
        ],
        answer: 2,
        why: l(
          "Cleaner sadece kapalı segment'lere bakar ve aktif segment'teki kayıtları hesaba katmaz. Kapalı segment'lerde Ali'nin son kaydı 5, Ece'ninki 4, Can'ınki 2. Offset 6 henüz sayılmıyor, bu yüzden 2 kalıyor.",
          "The cleaner only looks at closed segments and ignores the active one. In the closed segments Ali's latest is 5, Ece's is 4 and Can's is 2. Offset 6 does not count yet, so 2 stays.",
        ),
      },
      title: l("Cleaner her key'in son değerini bıraktı", "The cleaner left each key's latest value"),
      body: [
        l(
          "Cleaner kapalı segment'leri taradı. Her key için orada gördüğü son kaydı bıraktı, eskileri sildi: offset 0, 1 ve 3 gitti.",
          "The cleaner went through the closed segments. For each key it kept the latest record it found there and removed the older ones: offsets 0, 1 and 3 are gone.",
        ),
        l(
          "Dikkat: Can'ın offset 2'deki Bursa kaydı duruyor, çünkü Konya kaydı (6) aktif segment'te ve cleaner aktif segment'e hiç dokunmaz. Küçülen iki segment de birleşip tek segment oldu.",
          "Notice that Can's Bursa record at offset 2 is still there: the Konya record (6) is in the active segment, and the cleaner never touches the active segment. The two shrunken segments merged into one.",
        ),
        l(
          "Offset'ler **değişmedi**: 2, 4, 5. Aradaki boşluklar normaldir. Bir consumer offset 3'ü isterse Kafka ona 3'ten sonraki ilk kaydı, yani 4'ü verir.",
          "The offsets **did not change**: 2, 4, 5. The gaps are normal. If a consumer asks for offset 3, Kafka hands it the first record after 3, which is 4.",
        ),
      ],
    },
    {
      short: l("Aktif segment", "Active segment"),
      tag: "how",
      predict: {
        question: l(
          "İki taşınma daha olacak, aktif segment dolup kapanacak ve cleaner tekrar çalışacak. Can'ın eski kaydı (offset 2) ne olur?",
          "Two more moves will happen, the active segment will fill up and close, and the cleaner will run again. What happens to Can's old record (offset 2)?",
        ),
        options: [
          l("Kalır: compaction ilk yazılan değeri korur", "It stays: compaction keeps the first value written"),
          l("Silinir: Can'ın yeni kaydı (6) artık kapalı bir segment'te", "It goes: Can's newer record (6) is now in a closed segment"),
          l("Offset 6 silinir, 2 kalır", "Offset 6 is deleted and 2 stays"),
        ],
        answer: 1,
        why: l(
          "Segment kapanınca içindeki kayıtlar cleaner'ın hesabına girer. Can'ın 6'daki kaydı artık en yenisi, bu yüzden 2 gider.",
          "Once a segment closes, its records count for the cleaner. Can's record at 6 is now the latest, so 2 goes.",
        ),
      },
      title: l("Aktif segment beklemede kalır", "The active segment waits its turn"),
      body: [
        l(
          "Ece ve Ali bir kez daha taşındı ve segment 6 doldu. Can Bursa'ya geri dönünce (offset 9) yeni bir segment açıldı; segment 6 kapandı ve cleaner onu da görebildi.",
          "Ece and Ali moved once more and segment 6 filled up. When Can moved back to Bursa (offset 9), a new segment rolled; segment 6 closed and the cleaner could see it too.",
        ),
        l(
          "Cleaner bu sefer Can'ın eski kaydını (2), Ece'nin (4) ve Ali'nin (5) eski kayıtlarını sildi. Geriye her key için bir kayıt kaldı: 6, 7, 8.",
          "This time the cleaner removed Can's old record (2), and Ece's (4) and Ali's (5) older ones. One record per key remains: 6, 7, 8.",
        ),
        l(
          "Yani compaction anında olmaz. Bir değerin eskisi, yenisi kapalı bir segment'e düşene kadar log'da kalır.",
          "So compaction is not instant. An old value stays in the log until the new one lands in a closed segment.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Birleşen segment ilk segment'in adını (base offset'ini) taşır. Bu yüzden sahnede \"segment 0\" içinde offset 6, 7 ve 8 duruyor. Gerçekte Kafka küçülen segment'leri, `segment.bytes`'ı aşmayacak gruplar hâlinde birleştirir.",
            "A merged segment keeps the first segment's name (base offset). That is why \"segment 0\" holds offsets 6, 7 and 8 in the scene. In reality Kafka merges shrunken segments in groups that stay under `segment.bytes`.",
          ),
        },
      ],
    },
    {
      short: l("Tombstone", "Tombstone"),
      tag: "how",
      predict: {
        question: l(
          "Ece hesabını sildi. Kafka'ya Ece key'iyle, value'su boş (null) bir kayıt yazılacak. Buna tombstone denir. Cleaner çalışınca ne olur?",
          "Ece deleted her account. A record with Ece's key and an empty (null) value will be written. This is called a tombstone. What happens when the cleaner runs?",
        ),
        options: [
          l("Ece'nin bütün kayıtları ve tombstone hemen gider", "All of Ece's records and the tombstone go at once"),
          l("Ece'nin eski adresi gider, tombstone bir süre kalır", "Ece's old address goes; the tombstone stays for a while"),
          l("Hiçbir şey olmaz; boş kayıt yok sayılır", "Nothing: an empty record is ignored"),
        ],
        answer: 1,
        why: l(
          "Tombstone, Ece için en yeni kayıt. Bu yüzden eski adresi silinir. Tombstone'un kendisi bir süre kalır ki geride kalan consumer'lar da \"Ece silindi\" haberini alabilsin.",
          "The tombstone is Ece's latest record, so her old address is removed. The tombstone itself stays for a while, so consumers that are behind also get the news that Ece was deleted.",
        ),
      },
      title: l("Bir key'i silmek: tombstone", "Deleting a key: the tombstone"),
      body: [
        l(
          "Log'a kayıt silinmez, sadece eklenir. Bir key'i silmek için o key'le value'su boş bir kayıt yazılır: [[tombstone]]. Sahnede gri koli ve \"✕\" işareti.",
          "Nothing is erased from a log, only added. To delete a key you write a record with that key and an empty value: a [[tombstone]]. It is the grey parcel marked \"✕\" in the scene.",
        ),
        l(
          "Cleaner Ece'nin eski adresini (7) sildi, çünkü tombstone daha yeni. Tombstone'u ise bıraktı. Tabloya bak: Ece artık \"silindi\".",
          "The cleaner removed Ece's old address (7) because the tombstone is newer. It left the tombstone itself. Look at the table: Ece now shows as deleted.",
        ),
        l(
          "Tombstone hemen gitseydi, o sırada kapalı olan bir consumer geri geldiğinde Ece'nin silindiğini hiç öğrenemezdi.",
          "If the tombstone went at once, a consumer that was down at the time would come back and never learn that Ece was deleted.",
        ),
      ],
    },
    {
      short: l("Tam silme", "Gone for good"),
      tag: "experiment",
      predict: {
        question: l(
          "2 gün geçti. `delete.retention.ms` 1 gün. Cleaner tekrar çalışınca tombstone'a (offset 10) ne olur?",
          "2 days have passed. `delete.retention.ms` is 1 day. When the cleaner runs again, what happens to the tombstone (offset 10)?",
        ),
        options: [
          l("Sonsuza dek kalır", "It stays forever"),
          l("Silinir; log'da Ece'den hiç iz kalmaz", "It is removed; no trace of Ece remains in the log"),
          l("Ece'nin eski adresi geri gelir", "Ece's old address comes back"),
        ],
        answer: 1,
        why: l(
          "Tombstone, cleaner'ın onu ilk gördüğü andan itibaren `delete.retention.ms` kadar kalır. Süre dolunca bir sonraki temizlikte silinir.",
          "A tombstone stays for `delete.retention.ms` after the cleaner first sees it. Once that has passed, the next cleaning removes it.",
        ),
      },
      title: l("Tombstone da sonunda gider", "The tombstone goes too, in the end"),
      body: [
        l(
          "İki gün geçti ve cleaner tekrar çalıştı. Tombstone'un bekleme süresi (`delete.retention.ms`, varsayılan 24 saat) dolmuştu; tombstone silindi.",
          "Two days passed and the cleaner ran again. The tombstone's waiting time (`delete.retention.ms`, 24 hours by default) was over, so it was removed.",
        ),
        l(
          "Artık log'da Ece'ye ait hiçbir kayıt yok. Log'u baştan okuyan yeni bir servis Ece'yi hiç görmez.",
          "There is no record of Ece in the log any more. A new service reading the log from the start never sees her.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bir consumer `delete.retention.ms`'ten daha uzun süre geride kalırsa tombstone'u kaçırabilir ve silinmiş bir key'i kendi tarafında sonsuza dek tutabilir.",
            "A consumer that falls behind for longer than `delete.retention.ms` can miss the tombstone and keep a deleted key on its side forever.",
          ),
        },
      ],
    },
    {
      short: l("Tablo", "Table"),
      tag: "idea",
      title: l("Baştan okuyan güncel tabloyu kurar", "Reading from the start rebuilds the table"),
      body: [
        l(
          "Sağ üstteki karta bak: log'u offset 0'dan okuyan biri, her key'in son değerini alır. Ali Konya'da, Can İzmir'de, Ece yok.",
          "Look at the card at the top right: someone reading the log from offset 0 gets every key's latest value. Ali is in Konya, Can in İzmir, and Ece is gone.",
        ),
        l(
          "Log sonsuza kadar büyümez, çünkü her key için yaklaşık bir kayıt kalır. Ama hiçbir key'in son hâli kaybolmaz.",
          "The log does not grow forever, since roughly one record per key remains. Yet no key's latest state is lost.",
        ),
        l(
          "Kafka'nın kendisi de bunu kullanır: consumer group'ların commit ettiği offset'ler `__consumer_offsets` adlı sıkıştırılmış bir topic'te durur. Kafka Streams de tablolarını böyle topic'lerde (changelog) saklar.",
          "Kafka itself relies on this: the offsets consumer groups commit live in a compacted topic called `__consumer_offsets`. Kafka Streams keeps its tables in such topics too (changelogs).",
        ),
      ],
    },
    {
      short: l("Cleaner ne zaman?", "When it runs"),
      tag: "reality",
      title: l("Gerçekte cleaner ne zaman çalışır?", "When does the cleaner really run?"),
      body: [
        l(
          "Sahnede cleaner'ı biz çalıştırıyoruz. Gerçekte broker'daki cleaner thread'leri kendi kendine çalışır ve önce en çok \"kirli\" (henüz temizlenmemiş) kısmı olan log'ları seçer.",
          "In the scene we run the cleaner by hand. In reality cleaner threads on the broker run on their own and pick the logs with the largest \"dirty\" (not yet cleaned) part first.",
        ),
        l(
          "Bir log'un temizlenmesi için kirli kısmın oranı `min.cleanable.dirty.ratio`'yu (varsayılan 0.5) geçmeli. `min.compaction.lag.ms` ile yeni bir kaydın en az ne kadar süre temizlenmeden kalacağını da ayarlayabilirsin.",
          "A log is cleaned once its dirty share passes `min.cleanable.dirty.ratio` (0.5 by default). With `min.compaction.lag.ms` you can also set how long a new record is guaranteed to stay uncleaned.",
        ),
        l(
          "İki kural birlikte de kullanılabilir: `cleanup.policy=compact,delete`. O zaman her key'in son değeri tutulur, ama retention süresinden eski segment'ler yine silinir.",
          "Both rules can be combined: `cleanup.policy=compact,delete`. Then each key's latest value is kept, but segments older than retention are still deleted.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Compaction bir sıralama garantisi bozmaz: kalan kayıtlar hâlâ offset sırasıyla okunur. Sadece bazı ara değerleri görmezsin.",
            "Compaction breaks no ordering guarantee: the remaining records are still read in offset order. You just do not see some of the in-between values.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Sandbox yeni bir topic ile başlıyor: kapalı segment'te Ali, Ece ve Can'ın birer adresi, aktif segment'te Ali'nin yeni adresi var.",
          "The sandbox starts with a fresh topic: the closed segment holds one address each for Ali, Ece and Can, and the active segment has Ali's new address.",
        ),
        l(
          "Yeni adres yazabilir, bir kişiyi tombstone ile silebilir, cleaner'ı çalıştırabilir ve zamanı 2 gün ilerletebilirsin. Sağ üstteki tablo her hamlede güncellenir.",
          "You can write new addresses, delete a person with a tombstone, run the cleaner and move time forward 2 days. The table at the top right updates on every move.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Az hamleyle bitirirsen daha çok yıldız alırsın.",
          "Under the scene there are **3 missions**. Finish with fewer moves for more stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Cleaner'ı çalıştırıp hiçbir şey olmuyorsa aktif segment'e bak: cleaner onu görmez.",
            "If running the cleaner does nothing, look at the active segment: the cleaner cannot see it.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "`cleanup.policy=compact` kayıtları yaşına göre değil, aynı key için daha yeni bir kayıt olup olmadığına göre siler.",
      "`cleanup.policy=compact` removes records not by age but by whether a newer record exists for the same key.",
    ),
    l(
      "Cleaner sadece kapalı segment'leri temizler; aktif segment'e ve oradaki kayıtlara dokunmaz.",
      "The cleaner only cleans closed segments; it never touches the active segment or counts its records.",
    ),
    l(
      "Offset'ler hiç değişmez; compaction'dan sonra aralarında boşluklar kalır.",
      "Offsets never change; after compaction there are gaps between them.",
    ),
    l(
      "Bir key'i silmek için value'su boş bir kayıt, yani [[tombstone]] yazılır.",
      "To delete a key you write a record with an empty value: a [[tombstone]].",
    ),
    l(
      "Tombstone ilk temizlikten sonra `delete.retention.ms` kadar kalır, sonra o da silinir.",
      "A tombstone stays for `delete.retention.ms` after its first cleaning, then it is removed too.",
    ),
    l(
      "Sıkıştırılmış bir topic'i baştan okuyan, her key'in son değerinden oluşan tabloyu kurar.",
      "Reading a compacted topic from the start rebuilds the table of every key's latest value.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Sıkıştırılan bir topic'in kapalı segment'lerinde `user:7` için offset 10, 15 ve 22'de üç kayıt var. Temizlikten sonra hangisi kalır?",
        "In a compacted topic's closed segments, `user:7` has three records at offsets 10, 15 and 22. Which remains after cleaning?",
      ),
      options: [l("10", "10"), l("15", "15"), l("22", "22"), l("Hepsi", "All three")],
      answer: 2,
      explain: l("Her key için en yeni kayıt kalır: 22. Offset'i de 22 olarak kalır.", "Each key keeps its newest record: 22. Its offset stays 22."),
      reviewStep: 3,
    },
    {
      question: l(
        "`user:9`'un eski değeri kapalı bir segment'te, yeni değeri ise aktif segment'te. Cleaner çalışınca ne olur?",
        "`user:9` has an old value in a closed segment and a new value in the active segment. What happens when the cleaner runs?",
      ),
      options: [
        l("Eski değer hemen silinir", "The old value is removed at once"),
        l("Eski değer kalır, çünkü aktif segment henüz hesaba katılmaz", "The old value stays, because the active segment does not count yet"),
        l("Yeni değer silinir", "The new value is removed"),
        l("İki değer birleştirilir", "The two values are merged"),
      ],
      answer: 1,
      explain: l(
        "Cleaner aktif segment'e bakmaz. Yeni değer kapalı bir segment'e düşene kadar eski değer log'da kalır.",
        "The cleaner does not look at the active segment. The old value stays until the new one lands in a closed segment.",
      ),
      reviewStep: 4,
    },
    {
      question: l("Sıkıştırılan bir topic'te bir key nasıl silinir?", "How do you delete a key in a compacted topic?"),
      options: [
        l("Kafka'ya o offset'i silmesini söyleyerek", "By telling Kafka to delete that offset"),
        l("O key'le value'su boş (null) bir kayıt yazarak", "By writing a record with that key and a null value"),
        l("Topic'i silip yeniden oluşturarak", "By deleting and recreating the topic"),
        l("Retention süresini sıfıra çekerek", "By setting retention to zero"),
      ],
      answer: 1,
      explain: l(
        "Log'a sadece ekleme yapılır. Silmek de bir kayıttır: tombstone. Cleaner sonra eski değerleri ve zamanı gelince tombstone'u siler.",
        "A log is only appended to, so a delete is a record too: a tombstone. The cleaner then removes older values, and later the tombstone.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Compaction'dan sonra log'da offset 2, 4 ve 5 kaldı. Bir consumer offset 3'ten okumak isterse ne olur?",
        "After compaction, offsets 2, 4 and 5 remain. What happens if a consumer asks to read from offset 3?",
      ),
      options: [
        l("Hata alır, 3 yok", "It gets an error: 3 does not exist"),
        l("3'ten sonraki ilk kayıt olan 4'ü alır", "It gets 4, the first record after 3"),
        l("Kafka offset'leri 0, 1, 2 diye yeniden numaralar", "Kafka renumbers the offsets 0, 1, 2"),
        l("En baştan, 2'den başlar", "It starts over from 2"),
      ],
      answer: 1,
      explain: l(
        "Offset'ler hiç değişmez; boşluklar normaldir. Consumer istediği yerden sonraki ilk kayıtla devam eder.",
        "Offsets never change and gaps are normal. The consumer continues with the first record after the one it asked for.",
      ),
      reviewStep: 3,
    },
  ],
};
