import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, IdempotenceScene } from "./Scene";

export const idempotenceAndTransactions: Lesson = {
  slug: "idempotence-and-transactions",
  title: l("Idempotence ve Transaction", "Idempotence & Transactions"),
  summary: l(
    "Kaybolan bir onay aynı kaydı iki kez yazdırabilir. Idempotent producer bunu sıra numarasıyla önler; transaction ise birkaç yazmayı ve offset commit'ini tek bir \"hep ya da hiç\" birimi yapar.",
    "A lost acknowledgement can write the same record twice. The idempotent producer prevents that with sequence numbers; a transaction turns several writes and an offset commit into one all-or-nothing unit.",
  ),
  minutes: 14,
  level: l("İleri", "Advanced"),
  Scene: IdempotenceScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kaybolan bir onayın neden çift kayıt yazdırdığını görmek", "See why a lost ack writes a record twice"), step: 1 },
    { text: l("Idempotent producer'ın PID ve sıra numarasıyla tekrarı nasıl attığını görmek", "See how the idempotent producer drops repeats using a PID and sequence numbers"), step: 2 },
    { text: l("Idempotence'ın neden çökmeyi kapsamadığını anlamak", "Understand why idempotence does not cover crashes"), step: 4 },
    { text: l("Transaction'ın yazmayı ve offset commit'ini nasıl birleştirdiğini görmek", "See how a transaction ties writes and the offset commit together"), step: 5 },
    { text: l("read_committed ve read_uncommitted farkını görmek", "See the difference between read_committed and read_uncommitted"), step: 7 },
    { text: l("Exactly-once'ın sınırlarını bilmek", "Know the limits of exactly-once"), step: 9 },
  ],
  steps: [
    {
      short: l("Onay", "The ack"),
      tag: "how",
      title: l("Producer yazar, broker onaylar", "The producer writes, the broker acknowledges"),
      body: [
        l(
          "Fatura servisi `orders` topic'ini okuyor ve her sipariş için `invoices` topic'ine bir fatura yazıyor. Yani hem bir [[consumer]], hem bir [[producer]].",
          "The billing service reads the `orders` topic and writes one invoice per order to the `invoices` topic. It is both a [[consumer]] and a [[producer]].",
        ),
        l(
          "Broker faturayı log'a yazınca producer'a bir [[ack]] gönderir: \"yazdım\". Producer onayı alınca işini bitmiş sayar ve `orders`'taki konumunu commit eder.",
          "Once the broker writes the invoice to the log, it sends the producer an [[ack]]: \"written\". With the ack in hand, the producer counts the work as done and commits its position in `orders`.",
        ),
        l(
          "Sağ üstteki kart producer'ın ayarlarını gösteriyor. Şimdilik ikisi de kapalı: idempotence ve transaction.",
          "The card at the top right shows the producer's settings. Both are off for now: idempotence and transactions.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada producer bir seferde tek kayıt gönderiyor ve onayı bekliyor. Gerçekte kayıtları batch'ler hâlinde gönderir ve aynı anda birkaç isteği yolda tutabilir (`max.in.flight.requests.per.connection`, varsayılan 5).",
            "Here the producer sends one record at a time and waits for the ack. A real producer sends batches and can keep several requests in flight (`max.in.flight.requests.per.connection`, default 5).",
          ),
        },
      ],
    },
    {
      short: l("Kayıp onay", "Lost ack"),
      tag: "problem",
      predict: {
        question: l(
          "Broker 1042'nin faturasını yazdı ama onay yolda kayboldu. Producer cevap alamayınca aynı faturayı yeniden gönderiyor. Idempotence kapalı. Log'da ne olur?",
          "The broker wrote order 1042's invoice but the ack was lost on the way. With no answer, the producer sends the same invoice again. Idempotence is off. What happens in the log?",
        ),
        options: [
          l("Tek fatura kalır, broker tekrarı anlar", "One invoice; the broker spots the repeat"),
          l("Aynı fatura iki kez yazılır", "The same invoice is written twice"),
          l("Fatura kaybolur", "The invoice is lost"),
        ],
        answer: 1,
        why: l(
          "Broker'ın elinde bunun bir tekrar olduğunu anlamasını sağlayacak hiçbir bilgi yok. Gelen her kaydı yeni bir kayıt gibi yazar.",
          "The broker has nothing that tells it this is a repeat. It writes every record it receives as a new one.",
        ),
      },
      title: l("Onay yolda kaybolursa", "When the ack gets lost"),
      body: [
        l(
          "Broker 1042'nin faturasını yazdı, ama onay ağda kayboldu. Producer bir süre bekledi, cevap gelmeyince faturayı yeniden gönderdi. Ağ hatalarında böyle denemeler normaldir.",
          "The broker wrote order 1042's invoice, but the ack got lost in the network. The producer waited, got no answer and sent the invoice again. Retries like this are normal on network errors.",
        ),
        l(
          "Broker bunun bir tekrar olduğunu bilemezdi ve ikinci kez yazdı. Log'da 1042'nin **iki** faturası var; ikincisinin üstünde \"2×\" yanıyor.",
          "The broker could not know it was a repeat and wrote it again. The log now has **two** invoices for 1042; the second shows \"2×\".",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Producer burada doğru davrandı: onay gelmezse kaydın yazılıp yazılmadığını bilemez. Tekrar göndermek kaybetmekten iyidir. Sorun, broker'ın tekrarı tanıyamaması.",
            "The producer did the right thing: without an ack it cannot know whether the record was written. Retrying beats losing. The problem is that the broker cannot recognise the repeat.",
          ),
        },
      ],
    },
    {
      short: l("Sıra numarası", "Sequence no."),
      tag: "idea",
      predict: {
        question: l(
          "Producer artık her kayda kendi kimliğini (PID) ve bir sıra numarası koyuyor. Aynı onay yine kayboldu ve producer faturayı yeniden gönderdi. Log'a kaç kopya yazılır?",
          "The producer now stamps each record with its id (PID) and a sequence number. The same ack is lost again and the producer resends the invoice. How many copies reach the log?",
        ),
        options: [l("Hiç", "None"), l("Bir", "One"), l("İki", "Two")],
        answer: 1,
        why: l(
          "Broker \"bu PID'den bu sıra numarasını zaten yazdım\" der, kopyayı atar ve onayı yeniden gönderir. Log'da tek fatura kalır.",
          "The broker says \"I already wrote this sequence number from this PID\", drops the copy and sends the ack again. One invoice stays in the log.",
        ),
      },
      title: l("Idempotent producer: tekrarı broker yakalar", "Idempotent producer: the broker catches the repeat"),
      body: [
        l(
          "Idempotence'ı açtık. Producer bir producer id (PID) aldı ve her kayda partition başına artan bir **sıra numarası** (seq) koyuyor: 0, 1, 2…",
          "We switched idempotence on. The producer got a producer id (PID) and stamps every record with a **sequence number** (seq) that grows per partition: 0, 1, 2…",
        ),
        l(
          "Onay yine kayboldu ve producer yeniden gönderdi. Bu sefer broker şunu gördü: \"PID'den seq 0'ı zaten yazdım.\" Kopyayı yazmadı ve onayı tekrar gönderdi.",
          "The ack was lost again and the producer resent. This time the broker saw: \"I already wrote seq 0 from this PID.\" It did not write the copy and sent the ack again.",
        ),
        l(
          "Böyle bir producer'a [[idempotentProducer]] denir: aynı kaydı kaç kez gönderirse göndersin, log'a bir kez yazılır.",
          "This is an [[idempotentProducer]]: no matter how many times it sends the same record, the log gets it once.",
        ),
      ],
    },
    {
      short: l("Varsayılan", "Default"),
      tag: "reality",
      title: l("Varsayılan olarak açık, ama sınırları var", "On by default, but with limits"),
      body: [
        l(
          "Kafka 3.0'dan beri `enable.idempotence=true` varsayılandır. Bunun için `acks=all` ve yeniden deneme (retries) gerekir; bunlar da varsayılan değerlerdir. Yeni bir fatura yazıldı ve sıra numarası bir arttı.",
          "Since Kafka 3.0, `enable.idempotence=true` is the default. It needs `acks=all` and retries, which are defaults too. A new invoice was written and the sequence number went up by one.",
        ),
        l(
          "Ama bu garanti **tek bir producer oturumu** ve **partition başına** geçerlidir. Producer yeniden başlarsa yeni bir PID alır, sıra numaraları 0'dan başlar ve broker eski oturumdan gelen kayıtları tanıyamaz.",
          "But the guarantee holds for **one producer session** and **per partition**. If the producer restarts, it gets a new PID, sequence numbers start at 0 again, and the broker cannot recognise records from the old session.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu ayarlarla çelişen değerler verirsen, örneğin `acks=1`, idempotence açık olmaz. Kafka 3.0 ve sonrasında `enable.idempotence=true`'yu açıkça yazıp çelişen bir ayar verirsen producer hata verir.",
            "If you set values that conflict with these, such as `acks=1`, idempotence is not enabled. From Kafka 3.0, setting `enable.idempotence=true` explicitly together with a conflicting value makes the producer fail with a config error.",
          ),
        },
      ],
    },
    {
      short: l("Çökme", "Crash"),
      tag: "problem",
      predict: {
        question: l(
          "Fatura servisi 1045'in faturasını yazdı ve onay aldı, ama `orders` konumunu commit edemeden çöktü. Idempotence açık. Yeniden başlayınca `invoices` log'unda 1045 için kaç fatura olur?",
          "The billing service wrote order 1045's invoice and got the ack, but crashed before committing its `orders` position. Idempotence is on. After the restart, how many invoices for 1045 are in the `invoices` log?",
        ),
        options: [l("Bir: idempotence korur", "One: idempotence protects it"), l("İki", "Two"), l("Hiç", "None")],
        answer: 1,
        why: l(
          "Servis 1045'i yeniden okur ve faturayı yeni bir PID ile, seq 0 olarak gönderir. Broker için bu tamamen yeni bir kayıttır.",
          "The service reads 1045 again and sends the invoice with a new PID as seq 0. To the broker, that is a brand-new record.",
        ),
      },
      title: l("Çökme: idempotence yetmez", "A crash: idempotence is not enough"),
      body: [
        l(
          "Servis 1045'in faturasını yazdı ve onay aldı, ama `orders` konumunu commit edemeden çöktü.",
          "The service wrote order 1045's invoice and got the ack, but crashed before committing its `orders` position.",
        ),
        l(
          "Yeniden başlayınca kayıtlı konumdan, yani 1045'ten devam etti ve faturayı **yeniden** yazdı. Yeni bir PID ve yeni sıra numaraları aldığı için broker bunu tekrar olarak tanıyamadı.",
          "On restart it continued from the saved position, 1045, and wrote the invoice **again**. With a new PID and new sequence numbers, the broker could not tell it was a repeat.",
        ),
        l(
          "Sorunun kökü şu: fatura yazmak ve `orders` konumunu commit etmek iki ayrı iş. Aralarına bir çökme girebiliyor.",
          "The root of the problem: writing the invoice and committing the `orders` position are two separate jobs, and a crash can land between them.",
        ),
      ],
    },
    {
      short: l("Transaction", "Transaction"),
      tag: "idea",
      title: l("Transaction: hepsi ya da hiçbiri", "A transaction: all or nothing"),
      body: [
        l(
          "Producer'a bir [[transactionalId]] verdik ve transaction'ları açtık. Artık servis şunu yapıyor: transaction'ı başlat, faturayı yaz, `orders` konumunu **aynı transaction'a** ekle, sonra commit et.",
          "We gave the producer a [[transactionalId]] and turned transactions on. Now the service does this: begin a transaction, write the invoice, add the `orders` position **to the same transaction**, then commit.",
        ),
        l(
          "Commit edince log'a fazladan bir kayıt düştü: mavi bir **commit işareti**. Buna [[controlRecord]] denir. O ana kadar soluk görünen fatura artık kesinleşti.",
          "On commit, one extra record landed in the log: a blue **commit marker**. It is called a [[controlRecord]]. The invoice that looked faded until then is now final.",
        ),
        l(
          "Bu ikisi, yani fatura ve offset commit'i, bir [[transaction]] oluşturur: ya ikisi birden olur ya hiçbiri.",
          "Together, the invoice and the offset commit form one [[transaction]]: either both happen or neither does.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kontrol kayıtları bir offset kaplar ama uygulamaya hiç verilmez. Transaction kullanan topic'lerde okuduğun offset'ler arasında boşluk görmen bu yüzden normaldir.",
            "Control records take up an offset but are never handed to the application. That is why gaps between the offsets you read are normal on transactional topics.",
          ),
        },
      ],
    },
    {
      short: l("Yarıda kalırsa", "Half done"),
      tag: "experiment",
      predict: {
        question: l(
          "Transaction açıkken, fatura yazılmışken servis çöktü. Aynı transactional.id ile yeniden başladı. O yarım faturaya ne olur?",
          "The service crashed while a transaction was open and its invoice already written. It restarts with the same transactional.id. What happens to that half-finished invoice?",
        ),
        options: [
          l("Log'dan silinir", "It is deleted from the log"),
          l("Log'da kalır ama iptal edildi diye işaretlenir", "It stays in the log but is marked as aborted"),
          l("Otomatik olarak commit edilir", "It is committed automatically"),
        ],
        answer: 1,
        why: l(
          "Log'a yazılan hiçbir şey silinmez. Transaction coordinator yarım transaction'ı iptal eder ve log'a bir abort işareti yazar.",
          "Nothing written to the log is deleted. The transaction coordinator aborts the half-finished transaction and writes an abort marker to the log.",
        ),
      },
      title: l("Transaction yarıda kalırsa", "When a transaction is left half done"),
      body: [
        l(
          "Yeni bir transaction başladı ve 1047'nin faturası yazıldı. Sonra servis commit edemeden çöktü.",
          "A new transaction began and order 1047's invoice was written. Then the service crashed before it could commit.",
        ),
        l(
          "Aynı transactional.id ile yeniden başlayınca Kafka yarım transaction'ı **iptal etti** ve log'a bir abort işareti yazdı. Yarım fatura log'da duruyor ama artık turuncu: iptal edilmiş bir transaction'a ait.",
          "When it restarted with the same transactional.id, Kafka **aborted** the half-finished transaction and wrote an abort marker. The half-done invoice is still in the log, but it is orange now: it belongs to an aborted transaction.",
        ),
        l(
          "`orders` konumu da commit edilmemişti. Servis 1047'yi yeniden okudu, yeni bir transaction'da faturayı yazdı ve bu sefer commit etti.",
          "The `orders` position had not been committed either. The service read 1047 again, wrote the invoice in a new transaction and committed this time.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte coordinator yarım transaction'ı iki durumda iptal eder: aynı transactional.id ile yeni bir producer `initTransactions()` çağırınca ya da `transaction.timeout.ms` (varsayılan 60 saniye) dolunca. Yeniden başlayan producer'ın epoch'u artar; eski epoch'la yazmaya çalışan \"zombi\" producer reddedilir.",
            "In reality the coordinator aborts a half-finished transaction in two cases: when a new producer with the same transactional.id calls `initTransactions()`, or when `transaction.timeout.ms` (60 seconds by default) runs out. The restarted producer gets a higher epoch; a \"zombie\" producer still writing with the old epoch is rejected.",
          ),
        },
      ],
    },
    {
      short: l("Kim ne görür?", "Who sees what?"),
      tag: "how",
      predict: {
        question: l(
          "Log'da iptal edilmiş bir fatura var. Muhasebe `read_committed` ile, Rapor varsayılan ayarla (`read_uncommitted`) okuyor. İptal edilen faturayı kim görür?",
          "There is an aborted invoice in the log. Accounting reads with `read_committed`, Reports with the default (`read_uncommitted`). Who sees the aborted invoice?",
        ),
        options: [l("İkisi de", "Both"), l("Sadece Rapor", "Only Reports"), l("Hiçbiri", "Neither")],
        answer: 1,
        why: l(
          "read_uncommitted her veri kaydını verir, iptal edilmiş olanlar dahil. read_committed iptal edilenleri atlar. İşaret kayıtlarını ise ikisi de uygulamaya vermez.",
          "read_uncommitted hands over every data record, aborted ones included. read_committed skips the aborted ones. Neither hands the markers to the application.",
        ),
      },
      title: l("Okuyan ne görür? isolation.level", "What does a reader see? isolation.level"),
      body: [
        l(
          "Transaction'ların işe yaraması okuyan tarafa da bağlı. Bunu consumer'ın [[isolationLevel]] ayarı belirler.",
          "Transactions only help if the reading side cooperates. The consumer's [[isolationLevel]] setting decides that.",
        ),
        l(
          "**Muhasebe** `read_committed` ile okudu: iptal edilen faturayı hiç görmedi. **Rapor** varsayılan `read_uncommitted` ile okudu ve iptal edilen faturayı da gördü. Sayaçlara bak.",
          "**Accounting** read with `read_committed` and never saw the aborted invoice. **Reports** read with the default `read_uncommitted` and saw it too. Check the counters.",
        ),
        l(
          "Kafka içinde exactly-once istiyorsan, transaction'lı topic'i okuyan her consumer `isolation.level=read_committed` kullanmalı.",
          "If you want exactly-once inside Kafka, every consumer reading a transactional topic must use `isolation.level=read_committed`.",
        ),
      ],
    },
    {
      short: l("Bekleme", "Waiting"),
      tag: "reality",
      title: l("Açık bir transaction okuyanı bekletir", "An open transaction holds readers back"),
      body: [
        l(
          "Yeni bir transaction açıldı ve bir fatura yazıldı, ama henüz commit edilmedi. Rapor onu hemen okudu. Muhasebe ise açık transaction'ın önünde **bekledi**.",
          "A new transaction opened and an invoice was written, but it is not committed yet. Reports read it right away. Accounting **waited** in front of the open transaction.",
        ),
        l(
          "Commit gelince Muhasebe kaldığı yerden devam etti. read_committed bir okuyucu, açık ilk transaction'ın başladığı offset'i geçemez. Bu noktaya *last stable offset* (LSO) denir.",
          "When the commit came, Accounting carried on. A read_committed reader cannot pass the offset where the first open transaction begins. That point is called the *last stable offset* (LSO).",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Uzun süren transaction'lar read_committed okuyucuların lag'ini büyütür. Transaction'ları kısa tut.",
            "Long transactions increase the lag of read_committed readers. Keep transactions short.",
          ),
        },
      ],
    },
    {
      short: l("Sınırlar", "Limits"),
      tag: "reality",
      title: l("Exactly-once'ın sınırları", "The limits of exactly-once"),
      body: [
        l(
          "Idempotent producer, transaction'lar ve read_committed birlikte Kafka içinde **oku → işle → yaz** akışını exactly-once yapar. Kafka Streams bunu `processing.guarantee=exactly_once_v2` ayarıyla senin yerine kurar.",
          "The idempotent producer, transactions and read_committed together make **read → process → write** inside Kafka exactly-once. Kafka Streams sets all of this up for you with `processing.guarantee=exactly_once_v2`.",
        ),
        l(
          "Ama transaction sadece Kafka'ya yazılanları ve offset commit'lerini kapsar. Bir e-posta, bir kart ödemesi ya da başka bir veritabanına yazmak bu transaction'ın parçası değildir. Onlar için önceki dersteki idempotent işlemeye geri dönersin.",
          "But a transaction only covers what is written to Kafka and the offset commits. An email, a card payment or a write to another database is not part of it. For those you go back to idempotent processing from the previous lesson.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Producer ayarları sıfırlandı: idempotence ve transaction kapalı. Faturalar yazıp onayları kaybedebilir, ayarları açıp kapatabilir, transaction başlatıp commit ya da abort edebilir, servisi çökertebilir ve iki okuyucuyu okutabilirsin.",
          "The producer settings are reset: idempotence and transactions off. You can write invoices and lose acks, switch settings, begin, commit or abort transactions, crash the service and make both readers read.",
        ),
        l(
          "Sahnenin altında **3 görev** var: çift fatura yazdırmak, tekrarı broker'a yakalatmak ve iptal edilen bir faturayı sadece doğru okuyucuya göstermek.",
          "There are **3 missions** under the scene: write a duplicate invoice, get the broker to catch the repeat, and show an aborted invoice to only the right reader.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Transaction'ları açmak idempotence'ı da açar; transaction'lar idempotent producer olmadan çalışmaz.",
            "Turning transactions on also turns idempotence on; transactions do not work without the idempotent producer.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Onay kaybolunca producer kaydı yeniden gönderir. Idempotence kapalıysa broker kopyayı da yazar.",
      "When an ack is lost, the producer sends the record again. With idempotence off, the broker writes the copy too.",
    ),
    l(
      "[[idempotentProducer|Idempotent producer]] her kayda PID ve sıra numarası koyar; broker tekrarı atar. Kafka 3.0'dan beri varsayılan olarak açıktır.",
      "The [[idempotentProducer|idempotent producer]] stamps each record with a PID and a sequence number, and the broker drops repeats. It is on by default since Kafka 3.0.",
    ),
    l(
      "Idempotence tek bir producer oturumunu kapsar. Yazdıktan sonra, input konumunu commit etmeden çökmek yine çift kayıt üretir.",
      "Idempotence covers one producer session. Crashing after writing but before committing the input position still produces a duplicate.",
    ),
    l(
      "[[transaction|Transaction]] yazmaları ve consumer offset commit'ini tek birim yapar. Sonu, log'da bir offset kaplayan commit ya da abort işaretidir.",
      "A [[transaction]] makes writes and the consumer offset commit one unit, closed by a commit or abort marker that takes up an offset in the log.",
    ),
    l(
      "`read_committed` okuyucular iptal edilen kayıtları görmez ve açık bir transaction'ın önünde bekler. Varsayılan `read_uncommitted` her şeyi görür.",
      "`read_committed` readers never see aborted records and wait in front of an open transaction. The default `read_uncommitted` sees everything.",
    ),
    l(
      "Exactly-once Kafka içindeki oku-işle-yaz akışını kapsar. Kafka dışındaki etkiler için idempotent işleme gerekir.",
      "Exactly-once covers read-process-write inside Kafka. Effects outside Kafka need idempotent processing.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Idempotence kapalı. Broker bir kaydı yazdı ama onay kayboldu ve producer kaydı yeniden gönderdi. Ne olur?",
        "Idempotence is off. The broker wrote a record but the ack was lost, and the producer sent the record again. What happens?",
      ),
      options: [
        l("Broker tekrarı anlar ve yazmaz", "The broker spots the repeat and skips it"),
        l("Kayıt log'a iki kez yazılır", "The record is written to the log twice"),
        l("Producer hata verip durur", "The producer fails and stops"),
        l("Consumer tekrarı otomatik atar", "The consumer drops the repeat automatically"),
      ],
      answer: 1,
      explain: l(
        "Sıra numarası olmadan broker tekrarı tanıyamaz ve kaydı yeni bir kayıt gibi yazar.",
        "Without sequence numbers the broker cannot recognise the repeat and writes it as a new record.",
      ),
      reviewStep: 1,
    },
    {
      question: l("Idempotent producer'da broker bir tekrarı neyle tanır?", "How does the broker recognise a repeat from an idempotent producer?"),
      options: [
        l("Kaydın value'sunu karşılaştırarak", "By comparing the record's value"),
        l("Producer id (PID) ve partition başına sıra numarasıyla", "By the producer id (PID) and per-partition sequence number"),
        l("Kaydın key'iyle", "By the record's key"),
        l("Zaman damgasıyla", "By the timestamp"),
      ],
      answer: 1,
      explain: l(
        "Her kayıt PID ve artan bir sıra numarası taşır. Broker aynı PID'den aynı numarayı ikinci kez görürse kopyayı yazmaz.",
        "Each record carries a PID and an increasing sequence number. If the broker sees the same number from the same PID again, it does not write the copy.",
      ),
      reviewStep: 2,
    },
    {
      question: l("Bir Kafka transaction'ı neleri birlikte kapsayabilir?", "What can one Kafka transaction cover together?"),
      options: [
        l("Kafka'ya yazılan kayıtlar ve consumer offset commit'i", "Records written to Kafka and the consumer offset commit"),
        l("Kafka'ya yazılan kayıtlar ve gönderilen bir e-posta", "Records written to Kafka and an email sent"),
        l("Bir veritabanı satırı ve bir REST çağrısı", "A database row and a REST call"),
        l("Sadece tek bir kayıt", "Just a single record"),
      ],
      answer: 0,
      explain: l(
        "Transaction, Kafka'daki yazmaları ve `sendOffsetsToTransaction` ile eklenen consumer offset'lerini kapsar. Kafka dışındaki etkileri kapsamaz.",
        "A transaction covers writes in Kafka and the consumer offsets added with `sendOffsetsToTransaction`. It does not cover effects outside Kafka.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Bir transaction iptal edildi. Ayarı değiştirilmemiş (varsayılan) bir consumer o transaction'ın kayıtlarını görür mü?",
        "A transaction was aborted. Does a consumer with the default setting see that transaction's records?",
      ),
      options: [
        l("Hayır, iptal edilen kayıtlar silinir", "No, aborted records are deleted"),
        l("Evet; varsayılan read_uncommitted onları da verir", "Yes; the default read_uncommitted hands them over too"),
        l("Sadece commit işaretini görür", "It sees only the commit marker"),
        l("Consumer hata verir", "The consumer fails"),
      ],
      answer: 1,
      explain: l(
        "Varsayılan `isolation.level=read_uncommitted`'dir ve iptal edilenler dahil her veri kaydını verir. Onları atlamak için `read_committed` gerekir.",
        "The default is `isolation.level=read_uncommitted`, which hands over every data record, aborted ones included. Skipping them needs `read_committed`.",
      ),
      reviewStep: 7,
    },
  ],
};
