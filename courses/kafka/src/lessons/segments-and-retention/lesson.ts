import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, SegmentsScene } from "./Scene";

export const segmentsAndRetention: Lesson = {
  slug: "segments-and-retention",
  title: l("Segment ve Retention", "Segments & Retention"),
  summary: l(
    "Log diskte segment dosyalarına bölünür. Retention eski kayıtları tek tek değil, bütün segment'ler hâlinde siler.",
    "On disk the log is split into segment files. Retention deletes old records whole segments at a time, not one by one.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: SegmentsScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Log'un segment dosyalarına nasıl bölündüğünü görmek", "See how the log is split into segment files"), step: 1 },
    { text: l("Bir offset'in hangi dosyada olduğunu bulmak", "Find which file holds an offset"), step: 3 },
    { text: l("Retention'ın bütün segment'leri sildiğini görmek", "See that retention deletes whole segments"), step: 5 },
    { text: l("Retention'ın neden bir alt sınır olduğunu anlamak", "Understand why retention is a lower bound"), step: 6 },
    { text: l("Silinmiş bir offset istenince ne olduğunu görmek", "See what happens when a deleted offset is asked for"), step: 7 },
    { text: l("Boyuta göre silmeyi (retention.bytes) tanımak", "Meet size-based deletion (retention.bytes)"), step: 8 },
  ],
  steps: [
    {
      short: l("Diskteki log", "Log on disk"),
      tag: "how",
      title: l("Log diskte nasıl durur?", "How does the log sit on disk?"),
      body: [
        l(
          "Log dersinde bir partition'ı uzun tek bir liste gibi düşündük. Diskte ise her partition'ın bir klasörü vardır, örneğin `orders-0/`. Log o klasörde tek bir dev dosya olarak değil, parçalar hâlinde durur.",
          "In the log lesson we pictured a partition as one long list. On disk, each partition has a folder, such as `orders-0/`. The log lives in that folder not as one huge file but in pieces.",
        ),
        l(
          "Her parçaya [[segment]] denir. Sahnedeki her tren bir segment dosyası. Kayıtlar hep en sondaki trene, [[activeSegment|aktif segment]]'e yazılır.",
          "Each piece is called a [[segment]]. Every train in the scene is one segment file. Records always go to the last train, the [[activeSegment|active segment]].",
        ),
        l(
          "Şimdilik iki sipariş yazıldı ve ikisi de aynı segment'te: offset 0 ve 1.",
          "So far two orders were written, and both are in the same segment: offsets 0 and 1.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte bir segment'in boyutu kayıt sayısıyla değil byte ile ölçülür: `segment.bytes`, varsayılan 1 GiB. Sahnede her şey görünsün diye bir segment'e 3 kayıt sığdırıyoruz.",
            "In reality a segment's size is counted in bytes, not records: `segment.bytes`, 1 GiB by default. So everything fits on screen, our segments hold 3 records.",
          ),
        },
      ],
    },
    {
      short: l("Yeni segment", "Rolling"),
      tag: "how",
      predict: {
        question: l(
          "Bu segment 3 kayıt alabiliyor. Şimdi 2 sipariş daha gelecek: offset 2 ve 3. Offset 3 nereye yazılır?",
          "This segment holds 3 records. Two more orders are coming: offsets 2 and 3. Where does offset 3 go?",
        ),
        options: [
          l("Aynı segment'e, segment büyür", "Into the same segment, which grows"),
          l("Yeni açılan bir segment'e", "Into a newly opened segment"),
          l("En eski kayıt silinir, yerine yazılır", "The oldest record is deleted to make room"),
        ],
        answer: 1,
        why: l(
          "Aktif segment dolunca Kafka onu kapatır ve yeni bir segment açar. Hiçbir kayıt silinmez ya da taşınmaz.",
          "When the active segment is full, Kafka closes it and opens a new one. No record is deleted or moved.",
        ),
      },
      title: l("Segment dolunca yenisi açılır", "A full segment rolls over"),
      body: [
        l(
          "Offset 2 ilk segment'i doldurdu. Offset 3 gelince Kafka ilk segment'i **kapattı** ve yeni bir segment açtı. Buna roll (yeni segment'e geçmek) denir.",
          "Offset 2 filled the first segment. When offset 3 arrived, Kafka **closed** the first segment and opened a new one. This is called rolling.",
        ),
        l(
          "Kapanan segment bir daha hiç yazılmaz, sadece okunur. Yeni kayıtlar artık sadece yeni aktif segment'e gider.",
          "A closed segment is never written again, only read. New records now go only to the new active segment.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kapalı segment'ler değişmediği için silmek, kopyalamak ve önbellekte tutmak çok kolaydır. Retention ve compaction bunu kullanır.",
            "Since closed segments never change, they are easy to delete, copy and cache. Retention and compaction rely on that.",
          ),
        },
      ],
    },
    {
      short: l("Dosya adları", "File names"),
      tag: "how",
      title: l("Her segment'in adı ilk offset'idir", "Each segment is named after its first offset"),
      body: [
        l(
          "Üç sipariş daha geldi. Offset 6 gelince bir segment daha açıldı. Sağ üstteki kart klasördeki dosyaları gösteriyor.",
          "Three more orders came in. At offset 6, another segment rolled. The card at the top right shows the files in the folder.",
        ),
        l(
          "Her segment, içindeki ilk kaydın offset'iyle adlandırılır. Buna [[baseOffset|base offset]] denir ve dosya adında 20 haneye tamamlanır: `00000000000000000003.log`.",
          "Each segment is named after its first record's offset, its [[baseOffset|base offset]], padded to 20 digits in the file name: `00000000000000000003.log`.",
        ),
        l(
          "Her `.log` dosyasının yanında iki küçük yardımcı dosya durur. `.index` bir offset'in dosyada kaçıncı byte'ta olduğunu söyler. `.timeindex` bir zamanın hangi offset'e denk geldiğini söyler.",
          "Next to every `.log` file sit two small helper files. `.index` says at which byte of the file an offset is. `.timeindex` says which offset matches a point in time.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Klasörde bunlardan başka küçük dosyalar da olabilir, örneğin `.snapshot` ve `leader-epoch-checkpoint`. Asıl üçlü yine de `.log`, `.index` ve `.timeindex`.",
            "The folder can hold a few other small files too, such as `.snapshot` and `leader-epoch-checkpoint`. The core trio is still `.log`, `.index` and `.timeindex`.",
          ),
        },
      ],
    },
    {
      short: l("Offset bulmak", "Finding"),
      tag: "how",
      predict: {
        question: l(
          "Bir consumer offset 4'ü istiyor. Segment'ler 0, 3 ve 6 ile başlıyor. Kafka hangi dosyaya bakar?",
          "A consumer asks for offset 4. The segments start at 0, 3 and 6. Which file does Kafka look in?",
        ),
        options: [
          l("`…000.log`: en baştan sırayla tarar", "`…000.log`: it scans from the very start"),
          l("`…003.log`", "`…003.log`"),
          l("`…006.log`", "`…006.log`"),
        ],
        answer: 1,
        why: l(
          "Kafka base offset'i 4'ten büyük olmayan son segment'i seçer: 3 ≤ 4 < 6. Baştan taramaz.",
          "Kafka picks the last segment whose base offset is not above 4: 3 ≤ 4 < 6. It does not scan from the start.",
        ),
      },
      title: l("Bir offset'i bulmak", "Finding an offset"),
      body: [
        l(
          "Consumer offset 4'ü istedi. Kafka önce dosya adlarına bakar: 0, 3, 6. Offset 4, 3'ten büyük ama 6'dan küçük, yani segment 3'tedir.",
          "The consumer asked for offset 4. Kafka first looks at the file names: 0, 3, 6. Offset 4 is above 3 but below 6, so it is in segment 3.",
        ),
        l(
          "Sonra o segment'in `.index` dosyasına bakar ve offset 4'ün dosyada nerede durduğunu bulur. Dosyayı baştan okumadan doğrudan oraya atlar.",
          "Then it checks that segment's `.index` file to find where offset 4 sits in the file, and jumps straight there without reading the file from the start.",
        ),
        l(
          "Log ne kadar büyük olursa olsun, bir offset'i bulmak hep hızlıdır.",
          "However big the log grows, finding an offset stays quick.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`.index` her kaydı tutmaz, belli aralıklarla bir kayıt tutar (yaklaşık her 4 KB'ta bir, `index.interval.bytes`). Kafka en yakın kayda atlar ve kalan kısa yolu okur.",
            "`.index` does not list every record, only one every so often (about every 4 KB, `index.interval.bytes`). Kafka jumps to the nearest entry and reads the short rest of the way.",
          ),
        },
      ],
    },
    {
      short: l("Zaman", "Time"),
      tag: "how",
      title: l("Kayıtlar yaşlanıyor", "Records get older"),
      body: [
        l(
          "Altı gün geçti; arada 3. gün bir sipariş daha geldi. Her trenin önünde, içindeki **en yeni** kaydın kaç günlük olduğu yazıyor.",
          "Six days went by, with one more order on day 3. In front of each train you can see how old its **newest** record is.",
        ),
        l(
          "[[retention|Retention]] tam olarak buna bakar. Varsayılan süre 7 gün: `retention.ms = 604800000`. Bir segment'in en yeni kaydı 7 günden eskiyse, segment silinebilir.",
          "[[retention|Retention]] looks at exactly that. The default is 7 days: `retention.ms = 604800000`. Once a segment's newest record is older than 7 days, the segment can be deleted.",
        ),
        l(
          "Şimdilik hiçbir segment 7 günü geçmedi. Turuncu vagon, yani retention'dan eski bir kayıt, henüz yok.",
          "No segment is past 7 days yet. There is no orange wagon, a record older than retention, so far.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Broker retention'ı sürekli değil, 5 dakikada bir kontrol eder (`log.retention.check.interval.ms`). Kayıtların yaşı da varsayılan olarak producer'ın koyduğu zaman damgasından (CreateTime) hesaplanır.",
            "The broker checks retention every 5 minutes, not continuously (`log.retention.check.interval.ms`). A record's age comes from the timestamp the producer set (CreateTime) by default.",
          ),
        },
      ],
    },
    {
      short: l("Silme", "Deleting"),
      tag: "experiment",
      predict: {
        question: l(
          "İki gün daha geçecek, bugün 8. gün olacak. Retention 7 gün. Ne silinir?",
          "Two more days will pass, making it day 8. Retention is 7 days. What gets deleted?",
        ),
        options: [
          l("7 günden eski kayıtlar, tek tek (offset 0–6)", "Records older than 7 days, one by one (offsets 0–6)"),
          l("Segment 0 ve segment 3, bütünüyle", "Segments 0 and 3, as a whole"),
          l("Hiçbir şey, Kafka kayıt silmez", "Nothing: Kafka never deletes records"),
        ],
        answer: 1,
        why: l(
          "Retention dosya dosya siler. Segment 0 ve 3'ün en yeni kaydı 8 günlük, bu yüzden ikisi de gider. Segment 6'nın en yeni kaydı (offset 7) sadece 5 günlük; o yüzden offset 6 da onunla birlikte kalır.",
          "Retention deletes file by file. The newest records of segments 0 and 3 are 8 days old, so both go. Segment 6's newest record (offset 7) is only 5 days old, so offset 6 stays with it.",
        ),
      },
      title: l("Retention kayıt değil, segment siler", "Retention deletes segments, not records"),
      body: [
        l(
          "8. gün geldi. Segment 0 ve segment 3'ün içindeki en yeni kayıt 8 günlük, yani 7 günü geçti. İki segment de tünele girip silindi.",
          "Day 8 is here. The newest records in segments 0 and 3 are 8 days old, past the 7-day limit, so both segments went into the tunnel and were deleted.",
        ),
        l(
          "Bütün bir dosyayı silmek çok ucuzdur: Kafka dosyanın içini yeniden yazmaz, sadece dosyayı siler.",
          "Deleting a whole file is very cheap: Kafka does not rewrite anything, it just removes the file.",
        ),
        l(
          "Log artık offset 6 ile başlıyor. Bu sayıya [[logStartOffset|log start offset]] denir. Silinen offset'ler (0–5) bir daha hiç kullanılmaz.",
          "The log now starts at offset 6. That number is the [[logStartOffset|log start offset]]. The deleted offsets (0–5) are never used again.",
        ),
      ],
    },
    {
      short: l("Alt sınır", "Lower bound"),
      tag: "how",
      title: l("Retention bir alt sınırdır", "Retention is a lower bound"),
      body: [
        l(
          "Offset 6'ya bak: 8 günlük, yani retention'dan eski. Ama hâlâ diskte, çünkü aynı segment'te daha yeni bir kayıt var (offset 7) ve segment ancak en yeni kaydı eskiyince silinir.",
          "Look at offset 6: it is 8 days old, older than retention. It is still on disk, because a newer record shares its segment (offset 7), and a segment is only deleted once its newest record expires.",
        ),
        l(
          "Yani `retention.ms = 7 gün`, \"en fazla 7 gün sakla\" değil, \"**en az** 7 gün sakla\" demektir. Bir kayıt kabaca retention.ms + [[segmentMs|segment.ms]] kadar, yani burada 14 güne yakın yaşayabilir.",
          "So `retention.ms = 7 days` does not mean \"keep at most 7 days\" but \"keep **at least** 7 days\". A record can live roughly retention.ms + [[segmentMs|segment.ms]], close to 14 days here.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bir veriyi belli bir sürede kesinlikle silmen gerekiyorsa (örneğin kişisel veriler), sadece `retention.ms`'i değil `segment.ms`'i de düşür. Yoksa veri hesapladığından uzun yaşar.",
            "If data must be gone within a set time (personal data, say), lower `segment.ms` as well as `retention.ms`. Otherwise it lives longer than you planned.",
          ),
        },
      ],
    },
    {
      short: l("Silinen offset", "Gone offset"),
      tag: "problem",
      predict: {
        question: l(
          "Bir consumer bir haftadır kapalıydı. Geri geldi ve offset 2'yi istiyor, ama log artık 6'dan başlıyor. Ne olur?",
          "A consumer was down for a week. It is back and asks for offset 2, but the log now starts at 6. What happens?",
        ),
        options: [
          l("Kafka offset 2'yi arşivden getirir", "Kafka brings offset 2 back from an archive"),
          l("Kayıt yok; consumer auto.offset.reset'e göre yeni bir yerden başlar", "The record is gone; the consumer restarts from a place set by auto.offset.reset"),
          l("Consumer offset 6'nın yerine offset 2 diye bir kayıt alır", "The consumer gets the record at 6 relabelled as offset 2"),
        ],
        answer: 1,
        why: l(
          "Silinen kayıtlar geri gelmez. Kafka \"offset out of range\" der; consumer [[autoOffsetReset]] ayarına bakar. earliest ise log start offset'ten (6), latest ise en sondan devam eder.",
          "Deleted records do not come back. Kafka answers \"offset out of range\" and the consumer checks [[autoOffsetReset]]: earliest continues from the log start offset (6), latest from the end.",
        ),
      },
      title: l("Silinmiş bir offset'i istemek", "Asking for a deleted offset"),
      body: [
        l(
          "Bir hafta kapalı kalan bir consumer, kaldığı yer olan offset 2'yi istedi. O kayıt retention'la birlikte silindi.",
          "A consumer that was down for a week asked for offset 2, where it had stopped. That record was deleted by retention.",
        ),
        l(
          "Kafka \"offset out of range\" cevabı verdi. Consumer'ın [[autoOffsetReset]] ayarı `earliest` olduğu için hâlâ duran ilk kayıttan, offset 6'dan devam ediyor. Offset 2–5 arasını hiç görmeyecek.",
          "Kafka answered \"offset out of range\". The consumer's [[autoOffsetReset]] is `earliest`, so it continues from the first record still there, offset 6. It will never see offsets 2–5.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bunu önlemenin yolu consumer [[lag]]'ini izlemek: bir consumer retention süresinden daha fazla geride kalmamalı.",
            "The way to prevent this is to watch consumer [[lag]]: a consumer should never fall further behind than the retention period.",
          ),
        },
      ],
    },
    {
      short: l("Boyut sınırı", "Size limit"),
      tag: "reality",
      title: l("Bir de boyut sınırı var: retention.bytes", "There is a size limit too: retention.bytes"),
      body: [
        l(
          "Beş sipariş daha geldi. Dikkat: offset 8, segment 6'da yer olmasına rağmen yeni bir segment'e yazıldı. Segment 6'nın ilk kaydı 8 günlüktü ve bu [[segmentMs|segment.ms]] (7 gün) süresini geçiyordu; Kafka sıradaki yazmada yeni segment açtı.",
          "Five more orders arrived. Notice that offset 8 went into a new segment even though segment 6 had room. Segment 6's first record was 8 days old, past [[segmentMs|segment.ms]] (7 days), so Kafka rolled on the next write.",
        ),
        l(
          "Sonra partition'a bir boyut sınırı koyduk: en fazla 4 kayıt. Log'da 7 kayıt vardı. Kafka en eski segment'i (6) sildi, çünkü geriye 5 kayıt kalıyordu ve bu hâlâ sınırın üstündeydi. Segment 8'i de silseydi 2 kayıt kalırdı; orada durdu.",
          "Then we set a size limit on the partition: at most 4 records. The log held 7. Kafka deleted the oldest segment (6), since 5 would remain, still over the limit. Deleting segment 8 too would leave only 2, so it stopped there.",
        ),
        l(
          "Süre ve boyut sınırı birlikte çalışır: hangisi önce aşılırsa o siler.",
          "The time and size limits work together: whichever is crossed first does the deleting.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`retention.bytes` byte ile ölçülür ve topic için değil **her partition** için ayrı uygulanır. Varsayılanı `-1`, yani boyut sınırı yok.",
            "`retention.bytes` is counted in bytes and applies to **each partition**, not to the whole topic. Its default is `-1`: no size limit.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Terminal `kafka-1` broker'ının üzerinde açık: `orders` topic'inin tek partition'ı `/var/lib/kafka/data/orders-0` klasöründe. Aşağıda gerçek işten **5 senaryo** var; komutları **kendin yaz**.",
          "Your turn. The terminal is open on broker `kafka-1`: the `orders` topic's single partition lives in `/var/lib/kafka/data/orders-0`. Below are **5 scenarios** from real work; **type the commands yourself**.",
        ),
        l(
          "Burada her sipariş 1 KiB, segment 3 KiB (`segment.bytes=3072`), retention ve `segment.ms` 7 gün. Saat sadece `sleep` ile ilerler (`sleep 3d`); retention saat her ilerlediğinde kontrol eder. Ayarlar `kafka-configs.sh` ile değişir, `ls -l` segment dosyalarını gösterir.",
          "Here every order is 1 KiB, a segment 3 KiB (`segment.bytes=3072`), retention and `segment.ms` 7 days. The clock moves only with `sleep` (`sleep 3d`); retention checks every time it moves. Settings change with `kafka-configs.sh`, and `ls -l` shows the segment files.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Trenlerin önündeki \"en yeni kayıt\" etiketini izle: retention sadece ona bakar. Kırmızı olan segment bir sonraki kontrolde gider.",
            "Watch the \"newest record\" label in front of each train: it is all retention looks at. A red one goes at the next check.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Bir partition diskte bir klasördür; log'u [[segment]] dosyalarına bölünür. Kayıtlar sadece son segment'e, aktif segment'e yazılır.",
      "A partition is a folder on disk, and its log is split into [[segment]] files. Records are only written to the last one, the active segment.",
    ),
    l(
      "Aktif segment dolunca (`segment.bytes`) ya da yeterince eskiyince (`segment.ms`) kapanır ve yenisi açılır.",
      "The active segment closes and a new one rolls when it is full (`segment.bytes`) or old enough (`segment.ms`).",
    ),
    l(
      "Segment'ler ilk offset'leriyle adlandırılır; `.index` ve `.timeindex` sayesinde bir offset'i bulmak hep hızlıdır.",
      "Segments are named after their first offset; with `.index` and `.timeindex`, finding an offset is always quick.",
    ),
    l(
      "Retention kayıtları tek tek değil, en yeni kaydı süreyi aşan bütün segment'ler hâlinde siler.",
      "Retention deletes not single records but whole segments whose newest record has passed the limit.",
    ),
    l(
      "Bu yüzden `retention.ms` bir alt sınırdır: kayıtlar bundan daha uzun yaşayabilir.",
      "That is why `retention.ms` is a lower bound: records can live longer than it.",
    ),
    l(
      "Silinen bir offset'i isteyen consumer, `auto.offset.reset`'e göre başka bir yerden devam eder ve aradakileri kaçırır.",
      "A consumer asking for a deleted offset continues from somewhere else, chosen by `auto.offset.reset`, and misses what was in between.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir partition'da `…000.log`, `…250.log` ve `…500.log` dosyaları var. Offset 499 hangi dosyadadır?",
        "A partition has the files `…000.log`, `…250.log` and `…500.log`. Which one holds offset 499?",
      ),
      options: [l("`…000.log`", "`…000.log`"), l("`…250.log`", "`…250.log`"), l("`…500.log`", "`…500.log`"), l("Hiçbiri", "None of them")],
      answer: 1,
      explain: l(
        "Base offset'i 499'dan büyük olmayan son segment `…250.log`. `…500.log` 500'den başlar.",
        "The last segment whose base offset is not above 499 is `…250.log`. `…500.log` starts at 500.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "retention.ms 7 gün. Kapalı bir segment'teki en eski kayıt 12, en yeni kayıt 6 günlük. Bu segment'e ne olur?",
        "retention.ms is 7 days. In a closed segment the oldest record is 12 days old and the newest is 6. What happens to it?",
      ),
      options: [
        l("12 günlük kayıt silinir, diğerleri kalır", "The 12-day-old record is deleted, the rest stay"),
        l("Segment şimdilik bütünüyle kalır", "The whole segment stays for now"),
        l("Segment bütünüyle silinir", "The whole segment is deleted"),
        l("Kafka segment'i ikiye böler", "Kafka splits the segment in two"),
      ],
      answer: 1,
      explain: l(
        "Retention segment'in en yeni kaydına bakar. O 6 günlük, yani segment en az bir gün daha kalır; 12 günlük kayıt da onunla birlikte.",
        "Retention looks at the segment's newest record. It is 6 days old, so the segment stays at least one more day, and the 12-day-old record with it.",
      ),
      reviewStep: 6,
    },
    {
      question: l("Yeni bir kayıt hangi segment'e yazılır?", "Which segment does a new record go to?"),
      options: [
        l("En çok boş yeri olan segment'e", "The one with the most room"),
        l("Sadece aktif segment'e, yani en sondakine", "Only the active segment, the last one"),
        l("Key'ine göre seçilen segment'e", "One chosen by its key"),
        l("En eski segment'e", "The oldest one"),
      ],
      answer: 1,
      explain: l(
        "Kapalı segment'ler bir daha yazılmaz. Her yeni kayıt aktif segment'in sonuna eklenir.",
        "Closed segments are never written again. Every new record is appended to the active segment.",
      ),
      reviewStep: 1,
    },
    {
      question: l(
        "Bir consumer silinmiş offset 120'yi istiyor. Log 300'den başlıyor ve `auto.offset.reset=earliest`. Nereden okumaya devam eder?",
        "A consumer asks for offset 120, which was deleted. The log starts at 300 and `auto.offset.reset=earliest`. Where does it continue?",
      ),
      options: [l("120", "120"), l("0", "0"), l("300", "300"), l("Log'un sonundan", "From the end of the log")],
      answer: 2,
      explain: l(
        "earliest, hâlâ diskte duran ilk kayıt demektir: log start offset, yani 300. Offset 120–299 kaçırılır.",
        "earliest means the first record still on disk: the log start offset, 300. Offsets 120–299 are missed.",
      ),
      reviewStep: 7,
    },
  ],
};
