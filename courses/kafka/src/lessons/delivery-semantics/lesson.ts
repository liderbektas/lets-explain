import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, DeliverySemanticsScene } from "./Scene";

export const deliverySemantics: Lesson = {
  slug: "delivery-semantics",
  title: l("Teslim garantileri", "Delivery Guarantees"),
  summary: l(
    "Oku, işle, commit: sıraları ve araya giren bir çökme, bir kaydın kaybolmasına ya da iki kez işlenmesine yol açar. at-most-once, at-least-once ve exactly-once.",
    "Read, process, commit: their order and a crash in between decide whether a record is lost or handled twice. At-most-once, at-least-once and exactly-once.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: DeliverySemanticsScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Okumak, işlemek ve commit'in ayrı anlar olduğunu görmek", "See that reading, processing and committing are separate moments"), step: 1 },
    { text: l("Önce commit edince kaydın neden kaybolduğunu görmek (at-most-once)", "See why committing first loses a record (at-most-once)"), step: 3 },
    { text: l("Önce işleyince kaydın neden tekrar işlendiğini görmek (at-least-once)", "See why processing first repeats a record (at-least-once)"), step: 4 },
    { text: l("Commit sıklığının tekrarın boyutunu nasıl etkilediğini görmek", "See how commit frequency changes the size of a repeat"), step: 5 },
    { text: l("Tekrarı idempotent işlemeyle zararsız hale getirmek", "Make repeats harmless with idempotent processing"), step: 7 },
    { text: l("Exactly-once'ın neyi kapsayıp neyi kapsamadığını öğrenmek", "Learn what exactly-once covers and what it does not"), step: 8 },
  ],
  steps: [
    {
      short: l("Üç an", "Three moments"),
      tag: "how",
      title: l("Oku, işle, commit", "Read, process, commit"),
      body: [
        l(
          "E-posta servisi, her sipariş için müşteriye bir onay e-postası gönderen bir [[consumer]]. Log'da üç sipariş bekliyor.",
          "The email service is a [[consumer]] that sends a confirmation email for every order. Three orders are waiting on the log.",
        ),
        l(
          "Her kayıt için üç ayrı an var: **oku** (kayıt servisin belleğine gelir), **işle** (e-posta gider; bu dış dünyada bir etki) ve **commit** (Kafka'ya \"buraya kadar tamam\" denir).",
          "Each record goes through three separate moments: **read** (the record arrives in the service's memory), **process** (the email goes out, an effect in the outside world) and **commit** (Kafka is told \"done up to here\").",
        ),
        l(
          "Bu dersin tek sorusu şu: bir çökme bu anların arasına denk gelirse ne olur? Cevap, işle ile commit'in hangi sırayla yapıldığına bağlı.",
          "This lesson asks one question: what happens if a crash lands between those moments? The answer depends on the order of process and commit.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek bir consumer `poll()` ile tek seferde birçok kayıt alır. Burada olanları net görmek için kayıtları tek tek okuyoruz.",
            "A real consumer gets many records at once from `poll()`. Here we read one at a time so you can see each moment clearly.",
          ),
        },
      ],
    },
    {
      short: l("Normal akış", "Normal flow"),
      tag: "how",
      title: l("Her şey yolundayken", "When nothing goes wrong"),
      body: [
        l(
          "Servis offset 0'ı okudu, siparişin e-postasını gönderdi (sağ üstte gelen kutusunda zarf belirdi) ve commit etti. Mühür artık 1 diyor: sıradaki okunacak kayıt.",
          "The service read offset 0, sent the order's email (an envelope appears in the inbox, top right) and committed. The seal now says 1, the next record to read.",
        ),
        l(
          "Hiç çökme olmasaydı sıranın bir önemi olmazdı. Ama servisler çöker: deploy, bellek hatası, makine kapanması. Bu yüzden her anı ayrı ayrı düşünmek gerekiyor.",
          "Without crashes the order would not matter. But services do crash: deploys, out-of-memory errors, machines going away. So each moment needs thinking about.",
        ),
      ],
    },
    {
      short: l("Hemen çökme", "Instant crash"),
      tag: "experiment",
      predict: {
        question: l(
          "Servis offset 1'i okudu ama hiçbir şey yapamadan çöktü. Kafka'daki kayıtlı konumu 1. Yeniden başlayınca ne olur?",
          "The service read offset 1 but crashed before doing anything. Its position saved in Kafka is 1. What happens when it restarts?",
        ),
        options: [
          l("1 kaybolur, servis 2'den devam eder", "1 is lost; the service continues at 2"),
          l("1'i yeniden okur, hiçbir zarar olmaz", "It reads 1 again, and no harm is done"),
          l("Müşteri iki e-posta alır", "The customer gets two emails"),
        ],
        answer: 1,
        why: l(
          "Commit edilmemiş okuma bellekle birlikte gider; servis kayıtlı konumdan, yani 1'den devam eder. Henüz e-posta gönderilmediği için tekrar okumak zararsız.",
          "An uncommitted read goes with the memory; the service continues from the saved position, 1. No email was sent yet, so reading again does no harm.",
        ),
      },
      title: l("Okudu ve hemen çöktü: zarar yok", "Read, then crashed at once: no harm"),
      body: [
        l(
          "Servis offset 1'i okudu ama e-postayı göndermeden ve commit etmeden çöktü. Elindeki kayıt bellekle birlikte gitti.",
          "The service read offset 1 but crashed before sending and before committing. The record in its hand went with its memory.",
        ),
        l(
          "Yeniden başlayınca Kafka'ya sordu: \"Nerede kalmıştım?\" Cevap 1'di, kaydı yeniden okudu. Hiçbir şey kaybolmadı, hiçbir şey iki kez olmadı, çünkü henüz dış dünyaya bir şey yapılmamıştı.",
          "On restart it asked Kafka \"where was I?\". The answer was 1, so it read the record again. Nothing was lost and nothing happened twice, because nothing had been done to the outside world yet.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Asıl sorun, çökme **işle** ile **commit** arasına denk geldiğinde başlar. Hangisini önce yaptığına göre iki farklı sorun çıkar.",
            "The real trouble starts when a crash lands between **process** and **commit**. Which one you do first decides which of two problems you get.",
          ),
        },
      ],
    },
    {
      short: l("Önce commit", "Commit first"),
      tag: "problem",
      predict: {
        question: l(
          "Servis offset 1'i elinde tutarken önce commit etti (sıradaki = 2) ve e-postayı gönderemeden çöktü. Yeniden başlayınca 1 numaralı siparişe ne olur?",
          "Holding offset 1, the service committed first (next = 2) and crashed before sending the email. What happens to order 1 after the restart?",
        ),
        options: [
          l("Yeniden okunur ve e-postası gider", "It is read again and its email goes out"),
          l("E-postası hiç gitmez", "Its email never goes out"),
          l("Müşteri iki e-posta alır", "The customer gets two emails"),
        ],
        answer: 1,
        why: l(
          "Kayıtlı konum artık 2. Servis 2'den devam eder ve 1'e bir daha hiç bakmaz. O siparişin e-postası kaybolur.",
          "The saved position is now 2. The service continues at 2 and never looks at 1 again. That order's email is lost.",
        ),
      },
      title: l("Önce commit, sonra e-posta: at-most-once", "Commit first, email second: at-most-once"),
      body: [
        l(
          "Servis offset 1'i elinde tutarken önce commit etti (\"2'den devam\"), sonra e-postayı gönderemeden çöktü.",
          "Holding offset 1, the service committed first (\"continue at 2\") and then crashed before sending the email.",
        ),
        l(
          "Yeniden başlayınca 2'den devam etti. 1 numaralı siparişin e-postası **hiç gitmedi**; gelen kutusunda kırmızı bir çarpı var ve \"Kaybolan e-posta\" sayacı 1.",
          "On restart it continued at 2. Order 1's email **never went out**: there is a red cross in the inbox and the \"Lost emails\" counter shows 1.",
        ),
        l(
          "Buna [[atMostOnce]] denir: her kayıt en fazla bir kez işlenir, ama bazıları hiç işlenmeyebilir.",
          "This is called [[atMostOnce]]: each record is processed at most once, but some may never be processed at all.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Birkaç kaybın önemsiz, tekrarın ise zararlı olduğu yerlerde kabul edilebilir: örneğin canlı bir panodaki tıklama sayacı.",
            "Acceptable where losing a few hurts little and repeating hurts more, such as a live click counter on a dashboard.",
          ),
        },
      ],
    },
    {
      short: l("Önce işle", "Process first"),
      tag: "problem",
      predict: {
        question: l(
          "Bu sefer servis offset 2'nin e-postasını gönderdi ama commit edemeden çöktü. Kayıtlı konum 2. Yeniden başlayınca ne olur?",
          "This time the service sent offset 2's email but crashed before committing. The saved position is 2. What happens on restart?",
        ),
        options: [
          l("2'nin e-postası kaybolur", "Order 2's email is lost"),
          l("Müşteri 2 için ikinci bir e-posta alır", "The customer gets a second email for 2"),
          l("Servis 3'ten devam eder, sorun olmaz", "The service continues at 3, no problem"),
        ],
        answer: 1,
        why: l(
          "Kayıtlı konum hâlâ 2, bu yüzden servis 2'yi yeniden okur ve işler. E-posta zaten gitmişti; ikinci kez gider.",
          "The saved position is still 2, so the service reads and processes 2 again. The email had already gone out, so it goes out a second time.",
        ),
      },
      title: l("Önce e-posta, sonra commit: at-least-once", "Email first, commit second: at-least-once"),
      body: [
        l(
          "Sıra ters: servis offset 2'yi okudu, e-postayı gönderdi ve commit edemeden çöktü. Kafka'daki konum hâlâ 2.",
          "The order is reversed: the service read offset 2, sent the email and crashed before committing. The position in Kafka is still 2.",
        ),
        l(
          "Yeniden başlayınca 2'yi yeniden okudu ve e-postayı **bir kez daha** gönderdi. Gelen kutusunda \"2×\" yanıyor.",
          "On restart it read 2 again and sent the email **one more time**. The inbox shows \"2×\".",
        ),
        l(
          "Buna [[atLeastOnce]] denir: hiçbir kayıt kaybolmaz ama bazıları birden fazla işlenebilir. Kafka consumer'larının en yaygın davranışı budur.",
          "This is called [[atLeastOnce]]: no record is lost, but some can be processed more than once. It is the most common behaviour for Kafka consumers.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Kargo şirketi gibi: kapıda aynı paketin iki kopyasını bulmak, hiç paket bulmamaktan iyidir. Fazlasını ayıklamak kolaydır.",
            "Like a courier: finding two copies of a parcel at your door beats finding none. Removing the extra one is easy.",
          ),
        },
      ],
    },
    {
      short: l("Seyrek commit", "Rare commits"),
      tag: "experiment",
      predict: {
        question: l(
          "Üç yeni sipariş (3, 4, 5) okundu ve üçünün de e-postası gitti. Servis tek bir commit'i sona bıraktı ve tam ondan önce çöktü. Kaç e-posta ikinci kez gider?",
          "Three new orders (3, 4, 5) were read and all three emails went out. The service left a single commit for the end and crashed just before it. How many emails go out a second time?",
        ),
        options: [l("Hiçbiri", "None"), l("Sadece 1", "Just 1"), l("Üçü de", "All three")],
        answer: 2,
        why: l(
          "Son commit 3'tü. Servis 3'ten başlar ve 3, 4, 5'in üçünü de yeniden işler. Commit ne kadar seyrekse tekrar o kadar büyür.",
          "The last commit was 3. The service starts at 3 and reprocesses all of 3, 4 and 5. The rarer the commits, the bigger the repeat.",
        ),
      },
      title: l("Seyrek commit, büyük tekrar", "Rare commits, big repeats"),
      body: [
        l(
          "Üç yeni sipariş geldi. Servis üçünü de okudu ve e-postalarını gönderdi, ama commit'i sona bıraktı ve tam ondan önce çöktü.",
          "Three new orders arrived. The service read all three and sent their emails, but left the commit for the end and crashed just before it.",
        ),
        l(
          "Son commit 3'tü; servis oradan başladı ve **üç e-postanın üçünü de** ikinci kez gönderdi.",
          "The last commit was 3, so the service started there and sent **all three emails** a second time.",
        ),
        l(
          "Commit sıklığı bir denge: her kayıttan sonra commit etmek tekrarı küçültür ama Kafka'ya çok daha fazla istek gönderir. Çoğu uygulama her `poll()` grubundan sonra commit eder.",
          "Commit frequency is a trade-off: committing after every record keeps repeats small but sends Kafka many more requests. Most applications commit after each `poll()` batch.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Java consumer'da `enable.auto.commit=true` varsayılandır ve konum her `auto.commit.interval.ms` (varsayılan 5 saniye) commit edilir. Commit `poll()` çağrısı içinde, bir önceki `poll()`'un döndürdüğü kayıtlar için yapılır. Kayıtları döngü içinde işlersen at-least-once olur; işi başka bir thread'e verip hemen yeniden `poll()` edersen at-most-once'a kayabilir.",
            "In the Java consumer `enable.auto.commit=true` is the default, committing every `auto.commit.interval.ms` (5 seconds by default). The commit happens inside `poll()`, for the records the previous `poll()` returned. Processing inside the loop gives at-least-once; handing work to another thread and polling again right away can slip into at-most-once.",
          ),
        },
      ],
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "idea",
      title: l("Hangisini seçmeli?", "Which one should you choose?"),
      body: [
        l(
          "Kaybetmek tekrar etmekten daha kötüyse (siparişler, ödemeler, faturalar) önce işle, sonra commit et: **at-least-once**. Sonra tekrarları zararsız hale getir.",
          "If losing is worse than repeating (orders, payments, invoices), process first and commit after: **at-least-once**. Then make repeats harmless.",
        ),
        l(
          "Tekrar kaybetmekten daha zararlıysa ve birkaç kayıp önemsizse önce commit et: **at-most-once**.",
          "If repeating does more harm and losing a few is fine, commit first: **at-most-once**.",
        ),
        l(
          "Gerçek sistemlerin çoğu ilkini seçer: at-least-once ve tekrarı zararsız yapan bir işleme. Sıradaki adım bunun nasıl yapıldığını gösteriyor.",
          "Most real systems pick the first: at-least-once plus processing that makes a repeat harmless. The next step shows how.",
        ),
      ],
    },
    {
      short: l("Idempotent", "Idempotent"),
      tag: "idea",
      predict: {
        question: l(
          "Servis artık e-posta göndermeden önce defterine bakıyor: \"bu siparişe zaten e-posta gittiyse atla\". Offset 6'nın e-postasını gönderdi ve commit edemeden çöktü. Müşteri 6 için toplam kaç e-posta alır?",
          "The service now checks a list before sending: \"skip if this order already got its email\". It sent offset 6's email and crashed before committing. How many emails does the customer get for 6 in total?",
        ),
        options: [l("0", "0"), l("1", "1"), l("2", "2")],
        answer: 1,
        why: l(
          "Kayıt yine tekrar okunur ve işlenir, ama defter \"zaten gönderildi\" der ve ikinci e-posta atlanır.",
          "The record is still read and processed again, but the list says \"already sent\" and the second email is skipped.",
        ),
      },
      title: l("Tekrarı zararsız yap", "Make the repeat harmless"),
      body: [
        l(
          "Servise küçük bir defter ekledik: e-posta göndermeden önce \"bu siparişe zaten e-posta gitti mi?\" diye bakıyor.",
          "We gave the service a small list: before sending, it checks \"did this order already get its email?\".",
        ),
        l(
          "Aynı çökme yine oldu ve offset 6 yeniden okunup işlendi. Ama defter tekrarı yakaladı ve müşteri **tek** e-posta aldı.",
          "The same crash happened, and offset 6 was read and processed again. But the list caught the repeat and the customer got **one** email.",
        ),
        l(
          "Aynı işi iki kez yapmanın bir kez yapmakla aynı sonucu verdiği işlemeye [[idempotent]] denir. at-least-once ile birlikte kullanıldığında, etkisi tam bir kez görülen bir sistem elde edersin.",
          "Processing where doing it twice has the same result as doing it once is called [[idempotent]]. Together with at-least-once, you get a system whose effects show up exactly once.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte defter, etkiyle **aynı anda** güncellenmeli: örneğin aynı veritabanı transaction'ında, ya da e-posta sağlayıcısına benzersiz bir idempotency key göndererek. E-posta gidip defter yazılmadan çökülürse tekrar yine olur.",
            "In reality the list must be updated **together** with the effect: in the same database transaction, for example, or by sending the email provider a unique idempotency key. If the email goes out and the service crashes before the list is written, the repeat still happens.",
          ),
        },
      ],
    },
    {
      short: l("Exactly-once", "Exactly-once"),
      tag: "reality",
      title: l("Exactly-once: nerede var, nerede yok?", "Exactly-once: where it exists, and where it doesn't"),
      body: [
        l(
          "Kafka'nın bir özelliği olarak [[exactlyOnce]] sözünü de duyacaksın. Kafka bunu **kendi içinde** sağlar: bir topic'ten okuyup başka bir topic'e yazan bir uygulama, yazdıklarını ve okuma konumunun commit'ini tek bir transaction'da yapabilir. Ya hepsi olur ya hiçbiri.",
          "You will also hear [[exactlyOnce]] as a Kafka feature. Kafka provides it **inside Kafka**: an application that reads from one topic and writes to another can put its writes and its offset commit in a single transaction. Either all of it happens or none of it.",
        ),
        l(
          "Ama e-posta, kart ödemesi ya da başka bir veritabanı gibi Kafka dışındaki etkileri Kafka geri alamaz. Orada exactly-once'ı sen kurarsın: at-least-once ve idempotent işleme.",
          "But Kafka cannot undo effects outside Kafka, such as an email, a card payment or a write to another database. There you build exactly-once yourself: at-least-once plus idempotent processing.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Transaction'ları sonraki derste göreceğiz: `transactional.id`, commit ve abort işaretleri ve okuyanın `isolation.level=read_committed` ayarı.",
            "Transactions come in the next lesson: `transactional.id`, commit and abort markers, and the reader's `isolation.level=read_committed` setting.",
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
          "Log'da e-postası gönderilmemiş bir sipariş bekliyor ve gönderilenler defteri kapalı. Düğmelerle okuyabilir, işleyebilir, commit edebilir, servisi çökertip yeniden başlatabilir ve defteri açabilirsin.",
          "One order is waiting for its email and the already-sent list is off. With the buttons you can read, process, commit, crash and restart the service, and switch the list on.",
        ),
        l(
          "Sahnenin altında **4 görev** var: bir e-postayı kaybetmek, iki kez göndermek, güvenle çökmek ve tekrarı zararsız yapmak. Az hamleyle bitirirsen 3 yıldız alırsın.",
          "There are **4 missions** under the scene: lose an email, send one twice, crash safely, and make a repeat harmless. Finish in few moves for 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sayaçlar ve gelen kutusu her hamlenin sonucunu gösterir. Olay listesi ne olduğunu ve nedenini yazar. Bir şeyi bozarsan **Geri al** ya da **Sıfırla**.",
            "The counters and the inbox show every move's result, and the event list says what happened and why. If you break something, use **Undo** or **Reset**.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Bir consumer için her kayıt üç ayrı andan geçer: **oku**, **işle** ve **commit**. Çökme bunların arasına her an düşebilir.",
      "For a consumer, every record goes through three moments: **read**, **process** and **commit**. A crash can land between any of them.",
    ),
    l(
      "Önce commit, sonra işlemek [[atMostOnce]] verir: tekrar olmaz ama çökmede kayıt kaybolabilir.",
      "Committing first and processing after gives [[atMostOnce]]: no repeats, but a crash can lose a record.",
    ),
    l(
      "Önce işlemek, sonra commit etmek [[atLeastOnce]] verir: kayıp olmaz ama çökmede kayıt tekrar işlenebilir.",
      "Processing first and committing after gives [[atLeastOnce]]: nothing is lost, but a crash can repeat a record.",
    ),
    l(
      "Commit ne kadar seyrekse çökmeden sonra tekrarlanan iş o kadar büyür.",
      "The rarer the commits, the more work is repeated after a crash.",
    ),
    l(
      "[[idempotent|Idempotent]] işleme tekrarı zararsız yapar. at-least-once ile birlikte, etkisi tam bir kez görülen bir sistem verir.",
      "[[idempotent|Idempotent]] processing makes repeats harmless. With at-least-once, it gives a system whose effects show up exactly once.",
    ),
    l(
      "Kafka'nın [[exactlyOnce]] desteği Kafka içindeki oku-işle-yaz akışını kapsar; e-posta gibi dış etkileri kapsamaz.",
      "Kafka's [[exactlyOnce]] support covers read-process-write inside Kafka, not outside effects such as emails.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir consumer kaydı okuyor, hemen commit ediyor, sonra işliyor. Bu hangi teslim garantisi?",
        "A consumer reads a record, commits right away, then processes it. Which delivery guarantee is that?",
      ),
      options: [l("at-most-once", "at-most-once"), l("at-least-once", "at-least-once"), l("exactly-once", "exactly-once"), l("Hiçbiri", "None")],
      answer: 0,
      explain: l(
        "Commit işten önce geldiği için, araya giren bir çökme kaydın hiç işlenmemesine yol açar: en fazla bir kez.",
        "The commit comes before the work, so a crash in between means the record is never processed: at most once.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "Bir consumer bir ödemeyi işledi ama commit edemeden çöktü. Yeniden başlayınca ne olur?",
        "A consumer processed a payment but crashed before committing. What happens on restart?",
      ),
      options: [
        l("Ödeme kaybolur", "The payment is lost"),
        l("Kayıt yeniden okunur; işleme idempotent değilse ödeme iki kez çekilir", "The record is read again; unless processing is idempotent, the payment is charged twice"),
        l("Kafka ödemeyi geri alır", "Kafka reverses the payment"),
        l("Consumer bir sonraki kayıttan devam eder", "The consumer continues with the next record"),
      ],
      answer: 1,
      explain: l(
        "Kayıtlı konum değişmediği için kayıt yeniden okunur ve işlenir. Kafka dış dünyadaki bir etkiyi geri alamaz.",
        "The saved position did not move, so the record is read and processed again. Kafka cannot undo an effect in the outside world.",
      ),
      reviewStep: 4,
    },
    {
      question: l("Tekrar işlemeyi zararsız hale getiren hangisi?", "Which one makes reprocessing harmless?"),
      options: [
        l("Daha fazla partition", "More partitions"),
        l("İşlemeden önce \"bu kayıt zaten işlendi mi?\" diye bakmak", "Checking \"was this record already handled?\" before acting"),
        l("Auto commit'i kapatmak", "Turning off auto commit"),
        l("Consumer'ı daha sık yeniden başlatmak", "Restarting the consumer more often"),
      ],
      answer: 1,
      explain: l(
        "Bu idempotent işlemedir: aynı kaydı ikinci kez işlemek, bir kez işlemekle aynı sonucu verir.",
        "That is idempotent processing: handling the same record twice has the same result as handling it once.",
      ),
      reviewStep: 7,
    },
    {
      question: l(
        "Kafka'nın exactly-once desteği müşteriye giden bir e-postayı da tam bir kez garanti eder mi?",
        "Does Kafka's exactly-once support also guarantee that a customer email goes out exactly once?",
      ),
      options: [
        l("Evet, her zaman", "Yes, always"),
        l("Hayır; Kafka dışındaki etkiler için idempotent işleme gerekir", "No; effects outside Kafka need idempotent processing"),
        l("Sadece tek partition'lı topic'lerde", "Only for single-partition topics"),
        l("Sadece auto commit açıksa", "Only with auto commit on"),
      ],
      answer: 1,
      explain: l(
        "Kafka transaction'ları Kafka'ya yazılanları ve offset commit'lerini kapsar. Bir e-postayı geri alamaz.",
        "Kafka transactions cover what is written to Kafka and the offset commits. They cannot take back an email.",
      ),
      reviewStep: 8,
    },
  ],
};
