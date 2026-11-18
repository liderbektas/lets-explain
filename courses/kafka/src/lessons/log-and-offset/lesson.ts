import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, LogAndOffsetScene } from "./Scene";

export const logAndOffset: Lesson = {
  slug: "log-and-offset",
  title: l("Log ve Offset", "The Log and Offsets"),
  summary: l(
    "Kafka'nın temel yapı taşı: sadece sona yazılan log, offset'ler ve okuyucuların kaldığı yeri kaydetmesi.",
    "Kafka's building block: an append-only log, offsets, and how readers save their place.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: LogAndOffsetScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Log'a sadece sonuna yazıldığını görmek", "See that a log is only ever appended to"), step: 1 },
    { text: l("Offset'in ne olduğunu ve neden hiç değişmediğini anlamak", "Understand offsets and why they never change"), step: 2 },
    { text: l("Okumanın kaydı silmediğini görmek", "See that reading does not delete"), step: 4 },
    { text: l("Commit'in tam olarak neyi kaydettiğini öğrenmek", "Learn exactly what a commit saves"), step: 6 },
    { text: l("Çökme sonrası kayıtların neden tekrar okunduğunu görmek", "See why records are read again after a crash"), step: 8 },
    { text: l("Retention'ın eski kayıtları nasıl sildiğini görmek", "See how retention removes old records"), step: 10 },
  ],
  steps: [
    {
      short: l("Log", "The log"),
      tag: "how",
      title: l("Kafka'nın kalbi: log", "Kafka's heart: the log"),
      body: [
        l(
          "Önceki derste Kafka'yı ortak bir defter olarak düşündük. Bu derste o defterin içine bakıyoruz. Kafka'da bu deftere [[log]] denir.",
          "In the last lesson we pictured Kafka as a shared notebook. Now we look inside it. In Kafka that notebook is called a [[log]].",
        ),
        l(
          "Log, sadece **sonuna** ekleme yapılabilen bir listedir. Ortasına bir şey sokamazsın, bir kaydı değiştiremezsin. Bu kısıtlama, Kafka'nın hem basit hem de çok hızlı olmasının sebebi.",
          "A log is a list you can only add to at the **end**. You cannot insert in the middle and you cannot change a record. That restriction is why Kafka is both simple and very fast.",
        ),
        l(
          "Bandı bir log gibi düşün. Kesikli çizgili boş yer, sıradaki kaydın konacağı yer. Bandın ucunda da bu log'a yazacak olan sipariş servisi bekliyor.",
          "Think of the belt as the log. The dashed empty spot is where the next record goes. At the end of the belt, the order service is waiting to write.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka'da log'lar isimli [[topic]]'lerin içinde durur. Burada `orders` adında, tek parçalı bir topic kullanıyoruz. Topic'leri ve parçalarını (partition) bir sonraki bölümde açacağız.",
            "In Kafka, logs live inside named [[topic|topics]]. Here we use a single-piece topic called `orders`. Topics and their pieces (partitions) come in the next chapter.",
          ),
        },
      ],
    },
    {
      short: l("Yazmak", "Writing"),
      tag: "how",
      title: l("Yazmak = sona eklemek", "Writing means appending"),
      body: [
        l(
          "Sipariş servisi üç sipariş yazdı. Her yeni koli bandın sonuna kondu, başka hiçbir yere değil.",
          "The order service wrote three orders. Each new parcel went to the end of the belt and nowhere else.",
        ),
        l(
          "Her kolinin üstündeki numaraya dikkat et: 0, 1, 2. Bu numaraya [[offset]] denir.",
          "Look at the number on each parcel: 0, 1, 2. That number is the [[offset]].",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bankadaki sıra numaratörü gibi: her gelen bir sonraki numarayı alır ve numaralar hiç geri gitmez.",
            "Like a ticket machine at a bank: each newcomer takes the next number, and the numbers never go back.",
          ),
        },
      ],
    },
    {
      short: l("Offset", "Offsets"),
      tag: "how",
      title: l("Offset: kaydın adresi", "An offset is a record's address"),
      body: [
        l(
          "İki sipariş daha geldi ve 3 ile 4 numaralarını aldı. Offset 0'dan başlar ve her yeni kayıtta bir artar.",
          "Two more orders arrived and got 3 and 4. Offsets start at 0 and grow by one with every new record.",
        ),
        l(
          "Offset, bir kaydın log içindeki kalıcı adresidir. \"Offset 3'teki kayıt\" dediğinde herkes aynı kaydı anlar ve o adres hiç değişmez.",
          "An offset is a record's permanent address in the log. \"The record at offset 3\" means the same record to everyone, and that address never changes.",
        ),
        l(
          "Kafka'nın sıralama garantisi de buradan gelir: offset 3, offset 4'ten **önce** yazılmıştır ve her okuyucu onları bu sırayla görür.",
          "This is also where Kafka's ordering guarantee comes from: offset 3 was written **before** offset 4, and every reader sees them in that order.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Offset'ler her [[partition]] için ayrı sayılır. Bir topic'in birden çok partition'ı olduğunda her birinin kendi 0, 1, 2… dizisi olur. Bunu partition dersinde göreceğiz.",
            "Offsets are counted separately for each [[partition]]. When a topic has several partitions, each has its own 0, 1, 2… sequence. The partitions lesson shows this.",
          ),
        },
      ],
    },
    {
      short: l("Değişmez", "Immutable"),
      tag: "how",
      predict: {
        question: l("Müşteri 1042 numaralı siparişi iptal etti. Log'da ne olacak?", "The customer cancelled order 1042. What happens in the log?"),
        options: [
          l("Offset 1'deki 1042 kaydı silinecek", "The 1042 record at offset 1 is deleted"),
          l("Offset 1'deki kayıt \"iptal\" olarak değiştirilecek", "The record at offset 1 is changed to \"cancelled\""),
          l("Log'un sonuna yeni bir \"iptal\" kaydı eklenecek", "A new \"cancel\" record is added to the end of the log"),
        ],
        answer: 2,
        why: l(
          "Log'daki kayıtlar ne silinir ne değiştirilir. Olan her şey sona yeni bir event olarak yazılır.",
          "Records in the log are never deleted or changed. Everything that happens is written to the end as a new event.",
        ),
      },
      title: l("Kayıtlar değiştirilmez", "Records never change"),
      body: [
        l(
          "Müşteri 1042 numaralı siparişi iptal etti. Offset 1'deki kaydı silip düzeltmek mümkün değil, çünkü log'daki kayıtlar değiştirilmez.",
          "The customer cancelled order 1042. You cannot delete or fix the record at offset 1, because records in the log never change.",
        ),
        l(
          "Bunun yerine yeni bir event yazılır: \"1042 iptal edildi.\" Log artık iki gerçeği birlikte anlatıyor: sipariş verildi, sonra iptal edildi.",
          "Instead, a new event is written: \"1042 was cancelled\". The log now tells both facts: the order was placed, then cancelled.",
        ),
        l(
          "Bu sayede log, olanların eksiksiz tarihçesi olur. Bir servis bu tarihçeyi baştan okuyarak bugünkü durumu yeniden çıkarabilir.",
          "That makes the log a complete history of what happened. A service can rebuild today's state by reading that history from the start.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Banka hesap hareketleri gibi: geçmiş bir hareketi silemezsin. Bir hata varsa onu düzelten yeni bir hareket eklenir.",
            "Like a bank statement: you cannot erase a past transaction. If something was wrong, a new transaction that corrects it is added.",
          ),
        },
      ],
    },
    {
      short: l("Okumak", "Reading"),
      tag: "how",
      predict: {
        question: l("Fatura servisi log'daki altı kaydın hepsini okuyacak. Okuma bitince log'da kaç kayıt kalır?", "The billing service will read all six records. How many are left on the log afterwards?"),
        options: [
          l("0, okunan kayıt log'dan çıkar", "0, a record leaves the log once read"),
          l("6, hepsi yerinde durur", "6, they all stay where they are"),
          l("3, yarısı", "3, half of them"),
        ],
        answer: 1,
        why: l(
          "Kafka'da okumak kaydı silmez, sadece okuyucunun bayrağını ilerletir.",
          "Reading does not delete in Kafka; it only moves the reader's flag forward.",
        ),
      },
      title: l("Okumak silmez", "Reading does not delete"),
      body: [
        l(
          "Fatura servisi bir [[consumer]] olarak log'u okumaya başladı ve altı kaydın hepsini işledi.",
          "The billing service started reading the log as a [[consumer]] and processed all six records.",
        ),
        l(
          "Log'a bak: kayıtların hepsi yerinde duruyor. Kafka'da okumak kaydı almak değil, sadece ona **bakmaktır**. Birçok klasik kuyruk sisteminde okunan mesaj silinir; Kafka'da silinmez.",
          "Look at the log: every record is still there. In Kafka, reading does not take a record away; it only **looks** at it. Many classic queues delete a message once it is read. Kafka does not.",
        ),
        l(
          "Fatura'nın elindeki bayrak, sıradaki okuyacağı yeri gösteriyor: offset 6, yani henüz yazılmamış bir sonraki kayıt.",
          "Billing's flag shows where it will read next: offset 6, the next record, which has not been written yet.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Yeni bir okuyucu nereden başlayacağını [[autoOffsetReset]] ayarından öğrenir. Varsayılan değer `latest`, yani sadece bundan sonra gelenler. Fatura geçmişi de görsün diye onu `earliest` ile başlattık.",
            "A new reader finds out where to start from [[autoOffsetReset]]. The default is `latest`: only what arrives from now on. We started billing with `earliest` so it also sees the past.",
          ),
        },
      ],
    },
    {
      short: l("Herkesin yeri", "Own position"),
      tag: "how",
      title: l("Her okuyucunun kendi yeri var", "Every reader has its own position"),
      body: [
        l(
          "Analitik servisi de okumaya başladı ama daha yavaş: şimdilik sadece iki kayıt işledi, sıradaki offset'i 2.",
          "The analytics service started reading too, but more slowly: it has processed two records so far, and its next offset is 2.",
        ),
        l(
          "Fatura 6'da, Analitik 2'de. İkisi aynı log'u okuyor ama birbirini beklemiyor ve birbirinin yerini etkilemiyor.",
          "Billing is at 6, analytics at 2. They read the same log but never wait for each other or move each other's position.",
        ),
        l(
          "İlk dersteki \"herkes kendi hızında okur\" fikri tam olarak bu: log tek, konum her okuyucu için ayrı.",
          "That is the \"everyone reads at their own pace\" idea from the first lesson: one log, a separate position per reader.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Teknik olarak konum, okuyucunun bağlı olduğu [[consumerGroup]] için tutulur. Group'lar ileride ayrı bir ders; şimdilik her servisi tek kişilik bir group gibi düşün.",
            "Technically, the position is kept per [[consumerGroup]]. Groups get their own lesson later; for now, think of each service as a group of one.",
          ),
        },
      ],
    },
    {
      short: l("Commit", "Commit"),
      tag: "how",
      predict: {
        question: l("Fatura offset 0–5 arasını işledi ve şimdi commit edecek. Mührün üstünde hangi sayı yazacak?", "Billing processed offsets 0–5 and will now commit. Which number goes on the seal?"),
        options: [
          l("5, son okunan kayıt", "5, the last record read"),
          l("6, sıradaki okunacak kayıt", "6, the next record to read"),
          l("0, ilk kayıt", "0, the first record"),
        ],
        answer: 1,
        why: l(
          "Commit, sıradaki okunacak offset'i kaydeder. 0–5 işlendiyse sıradaki 6'dır.",
          "A commit saves the next offset to read. If 0–5 are done, the next is 6.",
        ),
      },
      title: l("Commit: kaldığın yeri kaydet", "Commit: save your place"),
      body: [
        l(
          "Okuyucunun konumu önce sadece kendi belleğinde durur. Servis yeniden başlarsa bu bilgi kaybolur.",
          "At first, a reader's position lives only in its own memory. If the service restarts, that is gone.",
        ),
        l(
          "Bu yüzden okuyucu düzenli olarak Kafka'ya \"buraya kadar işledim\" der. Buna [[commit]] denir. Yere basılan mühür, commit edilmiş konumu gösteriyor.",
          "So the reader regularly tells Kafka \"I have processed up to here\". That is a [[commit]]. The stamped seal on the ground shows the committed position.",
        ),
        l(
          "Dikkat: commit edilen değer son okunan kaydın değil, **sıradaki okunacak** kaydın offset'idir. Fatura 0–5'i işledi ve 6'yı commit etti.",
          "Careful: the committed value is not the last record read but the **next one to read**. Billing processed 0–5 and committed 6.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Java consumer'ında `enable.auto.commit` varsayılan olarak açıktır ve konumu belli aralıklarla (varsayılan 5 saniye) kendisi commit eder. Ne zaman commit edileceğini kendin seçmek istersen bunu kapatıp elle commit edersin.",
            "In the Java consumer, `enable.auto.commit` is on by default and commits the position on a timer (every 5 seconds by default). To choose when to commit yourself, you turn it off and commit by hand.",
          ),
        },
      ],
    },
    {
      short: l("Çökme", "Crash"),
      tag: "problem",
      title: l("Commit'ten önce çökerse ne olur?", "What if it crashes before committing?"),
      body: [
        l(
          "Üç yeni sipariş geldi (offset 6, 7 ve 8). Fatura onları okudu ve faturalarını kesti. Ama commit etmeye fırsat bulamadan çöktü.",
          "Three new orders arrived (offsets 6, 7 and 8). Billing read them and issued their invoices. Then it crashed before it could commit.",
        ),
        l(
          "Fatura'nın belleğindeki \"9'dan devam\" bilgisi kayboldu. Kafka'da kayıtlı konum hâlâ 6.",
          "Billing's in-memory \"continue at 9\" is gone. The position saved in Kafka is still 6.",
        ),
        l(
          "Sence Fatura yeniden başladığında nereden okumaya başlayacak? Sıradaki adımda tahminini soracağım.",
          "Where do you think billing will start reading when it restarts? The next step asks for your guess.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Çöken servis log'a hiçbir şey yapmaz; kayıtlar yerinde duruyor. Kaybolan şey sadece servisin konumu.",
            "A crashed service does nothing to the log: the records are all still there. Only the service's position is lost.",
          ),
        },
      ],
    },
    {
      short: l("Tekrar", "Again"),
      tag: "experiment",
      predict: {
        question: l(
          "Fatura 6, 7 ve 8'i okudu ama commit etmeden çöktü. Kafka'da kayıtlı konumu 6. Yeniden başlayınca ne olacak?",
          "Billing read 6, 7 and 8 but crashed before committing. Its position saved in Kafka is 6. What happens when it restarts?",
        ),
        options: [
          l("9'dan devam eder, hiçbir şey tekrarlanmaz", "It continues at 9 and nothing repeats"),
          l("6'dan başlar, 6–8 ikinci kez okunur", "It starts at 6, so 6–8 are read a second time"),
          l("6–8 kaybolur, hiç okunmaz", "6–8 are lost and never read"),
        ],
        answer: 1,
        why: l(
          "Fatura Kafka'daki kayıtlı konumdan, yani 6'dan devam eder. Belleğindeki 9 çökmeyle gitti, bu yüzden 6–8 tekrar okunur.",
          "Billing continues from the position saved in Kafka, which is 6. The 9 in its memory died with the crash, so 6–8 are read again.",
        ),
      },
      title: l("Commit'ten devam: aynı kayıtlar ikinci kez", "Resuming from the commit: the same records twice"),
      body: [
        l(
          "Fatura yeniden başladı ve Kafka'ya sordu: \"Ben nerede kalmıştım?\" Cevap: offset 6.",
          "Billing restarted and asked Kafka: \"Where was I?\" The answer: offset 6.",
        ),
        l(
          "Böylece 6, 7 ve 8'i **ikinci kez** okudu. Koliler üstünde \"2×\" yanıyor ve sayaçta \"Tekrar okunan: 3\" yazıyor: bu üç sipariş için ikinci kez fatura kesildi!",
          "So it read 6, 7 and 8 **a second time**. The parcels flash \"2×\" and the counter says \"Read again: 3\": those three orders were invoiced twice!",
        ),
        l(
          "Bu bir hata değil, Kafka'nın varsayılan davranışı: hiçbir kayıt kaybolmaz ama bazıları birden fazla okunabilir. Buna **at-least-once** (en az bir kez) teslim denir.",
          "This is not a bug; it is Kafka's default behaviour. No record is lost, but some can be read more than once. That is called **at-least-once** delivery.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Okuyan servisi, aynı kaydı iki kez işlemek zarar vermeyecek şekilde yaz. Örneğin fatura kesmeden önce \"bu sipariş için zaten fatura var mı?\" diye kontrol et. Bu özelliğe idempotency denir.",
            "Write the reading service so that handling the same record twice does no harm. For example, check \"is there already an invoice for this order?\" before issuing one. This property is called idempotency.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Tersi, yani önce commit edip sonra işlemek, tekrarı önler ama tam o arada çökülürse kaydı kaybettirir (at-most-once). Teslim garantilerine ayrı bir derste döneceğiz.",
            "The reverse, committing first and processing after, avoids repeats but loses the record if the crash lands in between (at-most-once). Delivery guarantees get their own lesson.",
          ),
        },
      ],
    },
    {
      short: l("Geri sar", "Rewind"),
      tag: "idea",
      title: l("Geçmişi yeniden oynatmak", "Replaying history"),
      body: [
        l(
          "Analitik ekibi raporundaki bir hatayı düzeltti ve bütün geçmişi yeniden hesaplamak istiyor.",
          "The analytics team fixed a bug in its report and wants to recompute everything from the beginning.",
        ),
        l(
          "Kayıtlar okununca silinmediği için bu çok kolay: Analitik konumunu offset 0'a geri sarıyor ve her şeyi baştan okuyor.",
          "Since records are not deleted when read, this is easy: analytics moves its position back to offset 0 and reads everything again.",
        ),
        l(
          "Bu sefer tekrar okumak bilinçli bir tercih. Okunan mesajı silen klasik bir kuyrukta bu mümkün olmazdı.",
          "This time, reading again is a deliberate choice. A classic queue that deletes messages once read could not do this.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Çalışan bir consumer kod içinde `seek()` ile geri sarılır. Bir group'un commit edilmiş konumunu toptan değiştirmek için `kafka-consumer-groups.sh --reset-offsets` aracı kullanılır; bunun için group'un o sırada durdurulmuş olması gerekir.",
            "A running consumer rewinds in code with `seek()`. To change a whole group's committed position, you use `kafka-consumer-groups.sh --reset-offsets`, and the group has to be stopped while you do it.",
          ),
        },
      ],
    },
    {
      short: l("Retention", "Retention"),
      tag: "reality",
      predict: {
        question: l("Retention offset 0–3 arasını silecek. Sonra log hangi offset ile başlar?", "Retention will delete offsets 0–3. Which offset does the log start at afterwards?"),
        options: [
          l("0, kalan kayıtlar yeniden numaralanır", "0, the remaining records are renumbered"),
          l("4, numaralar olduğu gibi kalır", "4, the numbers stay as they are"),
          l("Log tamamen boşalır", "The log is emptied completely"),
        ],
        answer: 1,
        why: l(
          "Offset bir kaydın kalıcı adresidir. Silmek kayıtları yeniden numaralamaz, sadece log'un başlangıcını ileri taşır.",
          "An offset is a record's permanent address. Deleting never renumbers; it only moves the start of the log forward.",
        ),
      },
      title: l("Sonsuza kadar saklanmaz: retention", "Not kept forever: retention"),
      body: [
        l(
          "Disk sonsuz değil. Kafka eski kayıtları belirli bir süre ya da boyut aşılınca siler. Bu kurala [[retention]] denir; varsayılan süre 7 gündür.",
          "Disks are not endless. Kafka deletes old records after a set time or size. That rule is called [[retention]]; the default is 7 days.",
        ),
        l(
          "Burada offset 0–3 arası silindi ve log artık offset 4'ten başlıyor. Yeni kayıtlar yine kaldığı yerden numaralanır; silinen offset'ler asla tekrar kullanılmaz.",
          "Here offsets 0–3 were deleted, and the log now starts at offset 4. New records keep counting from where they were; deleted offsets are never reused.",
        ),
        l(
          "Bir okuyucu çok geride kalırsa ve okumadığı kayıtlar silinirse, o kayıtları hiç göremez. Sonraki adımda bunu kendin deneyebilirsin.",
          "If a reader falls too far behind and records it has not read are deleted, it never sees them. You can try that yourself in the next step.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka kayıtları tek tek değil, segment denen dosya parçaları hâlinde siler; bu yüzden silme tam saniyesinde olmaz. Ayar adları `retention.ms` ve `retention.bytes`. Segment'leri depolama bölümünde göreceğiz.",
            "Kafka deletes whole files called segments, not single records, so deletion is not to-the-second. The settings are `retention.ms` and `retention.bytes`. Segments come in the storage chapter.",
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
          "Sahnenin altındaki düğmelerle log'a kayıt yazabilir, iki okuyucuyu okutabilir, commit ettirebilir, çökertip yeniden başlatabilir ve eski kayıtları silebilirsin.",
          "With the buttons under the scene you can write records, make both readers read, commit, crash and restart them, and delete old records.",
        ),
        l(
          "Her denemenin sonucu üstteki sayaçlarda görünür: kaç kayıt **tekrar** okundu, kaçı **kaçırıldı** ve her okuyucunun kaç kaydı henüz işlenmeyi bekliyor ([[lag]]).",
          "The counters on top show every result: how many records were read **again**, how many were **missed**, and how many each reader still has waiting ([[lag]]).",
        ),
        l(
          "Sahnenin altında **4 görev** var. Her biri bu dersteki bir fikri sınıyor: tekrar okuma, commit, geri sarma ve retention.",
          "Under the scene there are **4 missions**. Each one tests an idea from this lesson: reading again, commit, rewinding and retention.",
        ),
        l(
          "Görevi ne kadar az hamleyle bitirirsen o kadar çok yıldız alırsın. Takılırsan **İpucu**'na bas. Görevsiz oynamak istersen **Serbest**'i seç.",
          "The fewer moves you use, the more stars you get. Stuck? Press **Hint**. To play without a mission, choose **Free play**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sağ alttaki olay listesi her düğmeden sonra ne olduğunu ve nedenini yazar. Bir şeyi bozarsan **Geri al** ya da **Sıfırla**.",
            "The event list at the bottom right says what happened after each button and why. If you break something, use **Undo** or **Reset**.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[log|Log]], sadece sonuna yazılabilen sıralı bir kayıt listesidir; kayıtlar değiştirilmez.",
      "A [[log]] is an ordered list you can only append to; records never change.",
    ),
    l(
      "Her kaydın bir [[offset]]'i vardır: 0'dan başlar, hep artar ve asla tekrar kullanılmaz.",
      "Every record has an [[offset]]: it starts at 0, only grows, and is never reused.",
    ),
    l(
      "Okumak kaydı silmez. Her okuyucunun kendi konumu vardır ve okuyucular birbirini beklemez.",
      "Reading does not delete. Every reader has its own position, and readers never wait for each other.",
    ),
    l(
      "[[commit|Commit]], sıradaki okunacak offset'i Kafka'ya kaydeder. Çöken okuyucu oradan devam eder.",
      "A [[commit]] saves the next offset to read in Kafka. A crashed reader continues from there.",
    ),
    l(
      "Commit'ten önce çökmek kayıtların tekrar okunmasına yol açar (at-least-once). Okuyan kod bunu kaldıracak şekilde yazılmalı.",
      "Crashing before a commit means records are read again (at-least-once). Reading code must cope with that.",
    ),
    l(
      "[[retention|Retention]] eski kayıtları siler; çok geride kalan okuyucu silinen kayıtları kaçırır.",
      "[[retention|Retention]] deletes old records; a reader that falls too far behind misses them.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir consumer offset 0–4 arasındaki kayıtları işledi ve commit etti. Commit edilen değer nedir?",
        "A consumer processed offsets 0–4 and committed. What value was committed?",
      ),
      options: [l("4", "4"), l("5", "5"), l("0", "0"), l("Kafka'da commit yoktur", "Kafka has no commits")],
      answer: 1,
      explain: l(
        "Commit edilen değer, sıradaki okunacak kaydın offset'idir: 5.",
        "The committed value is the offset of the next record to read: 5.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Bir consumer 10–14 arasını okudu. Son commit'i 10'du ve yeniden commit etmeden çöktü. Yeniden başlayınca ne olur?",
        "A consumer read offsets 10–14. Its last commit was 10, and it crashed before committing again. What happens on restart?",
      ),
      options: [
        l("15'ten devam eder, hiçbir şey tekrar edilmez", "It continues at 15 and nothing repeats"),
        l("10'dan başlar; 10–14 ikinci kez okunur", "It starts at 10; 10–14 are read a second time"),
        l("10–14 kaybolur", "10–14 are lost"),
        l("En baştan, offset 0'dan başlar", "It starts over at offset 0"),
      ],
      answer: 1,
      explain: l(
        "Kafka'da kayıtlı konum 10. Okuyucu oradan devam eder, bu yüzden 10–14 tekrar okunur. Bu at-least-once davranışıdır.",
        "The position saved in Kafka is 10. The reader continues there, so 10–14 are read again. That is at-least-once.",
      ),
      reviewStep: 8,
    },
    {
      question: l(
        "İki farklı servis aynı log'u okuyor. Biri bir kaydı okuduğunda o kayda ne olur?",
        "Two services read the same log. When one reads a record, what happens to it?",
      ),
      options: [
        l("Silinir, diğer servis göremez", "It is deleted; the other service cannot see it"),
        l("Diğer servis için kilitlenir", "It is locked for the other service"),
        l("Yerinde kalır; diğer servis de onu kendi hızında okur", "It stays; the other service reads it at its own pace"),
        l("Kopyalanıp diğer servise gönderilir", "It is copied and sent to the other service"),
      ],
      answer: 2,
      explain: l(
        "Kafka'da okumak kaydı silmez. Her okuyucunun kendi konumu vardır.",
        "Reading does not delete in Kafka. Every reader has its own position.",
      ),
      reviewStep: 4,
    },
    {
      question: l(
        "Log'da offset 0–149 var. Retention 0–99 arasını siliyor. Bir sonraki yazılacak kaydın offset'i kaç olur?",
        "The log holds offsets 0–149. Retention deletes 0–99. What offset does the next record get?",
      ),
      options: [l("0", "0"), l("50", "50"), l("100", "100"), l("150", "150")],
      answer: 3,
      explain: l(
        "Offset'ler asla tekrar kullanılmaz. Silme sadece log'un başlangıcını 100'e taşır; sıradaki kayıt 150 olur.",
        "Offsets are never reused. Deleting only moves the start of the log to 100; the next record is 150.",
      ),
      reviewStep: 10,
    },
  ],
};
