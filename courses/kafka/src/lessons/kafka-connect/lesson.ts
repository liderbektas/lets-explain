import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, KafkaConnectScene } from "./Scene";

export const kafkaConnect: Lesson = {
  slug: "kafka-connect",
  title: l("Kafka Connect", "Kafka Connect"),
  summary: l(
    "Veritabanları, arama motorları ve dosya sistemleriyle Kafka arasında kod yazmadan veri taşımak.",
    "Moving data between Kafka and databases, search engines or file stores without writing code.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: KafkaConnectScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Source ve sink connector'ı ayırt etmek", "Tell a source connector from a sink connector"), step: 3 },
    { text: l("SMT ve converter'ın kayda ne yaptığını görmek", "See what SMTs and converters do to a record"), step: 4 },
    { text: l("Connect'in kaldığı yeri nerede tuttuğunu öğrenmek", "Learn where Connect keeps its place"), step: 5 },
    { text: l("Worker çökünce neden satırların tekrar gönderildiğini görmek", "See why rows are sent again when a worker crashes"), step: 6 },
    { text: l("Tekrarları sink tarafında zararsız hale getirmek", "Make repeats harmless on the sink side"), step: 8 },
  ],
  steps: [
    {
      short: l("Hep aynı kod", "Same code again"),
      tag: "problem",
      title: l("Her ekip aynı köprüyü yeniden yazıyor", "Every team writes the same bridge again"),
      changes: [{ kind: "add", text: l("Tabloya 3 sipariş eklendi", "3 orders added to the table") }],
      body: [
        l(
          "Siparişler bir PostgreSQL tablosunda duruyor (sağda). Arama ekibi bu siparişleri bir arama indeksinde görmek istiyor (solda) ve araya Kafka koymak istiyoruz.",
          "Orders live in a PostgreSQL table (on the right). The search team wants them in a search index (on the left), and we want Kafka in between.",
        ),
        l(
          "Bunun için bir ekip tabloyu okuyup Kafka'ya yazan bir producer yazmalı, başka bir ekip de Kafka'dan okuyup indekse yazan bir consumer. Yeniden deneme, hata, \"nerede kaldım\" takibi, ölçekleme… hepsi baştan.",
          "One team has to write a producer that reads the table into Kafka, another a consumer that reads Kafka into the index. Retries, errors, tracking \"where was I\", scaling… all from scratch.",
        ),
        l(
          "Her şirkette, her veritabanı için aynı köprü tekrar tekrar yazılıyor.",
          "In every company, for every database, the same bridge gets written again and again.",
        ),
      ],
    },
    {
      short: l("Kafka Connect", "Kafka Connect"),
      tag: "idea",
      title: l("Fikir: köprüyü bir kez yaz, ayarla kullan", "The idea: build the bridge once, then just configure it"),
      body: [
        l(
          "[[kafkaConnect]], Apache Kafka'nın bu iş için gelen parçası. Hazır bir **connector** seçersin, birkaç satır ayar yazarsın; okuma, yazma, yeniden deneme ve takip işini Connect yapar.",
          "[[kafkaConnect]] is the part of Apache Kafka built for exactly this. You pick a ready-made **connector** and write a few lines of config; Connect does the reading, writing, retrying and tracking.",
        ),
        l(
          "Connector'lar [[worker]] denen süreçlerde çalışır. Ortadaki mor çerçeve iki worker'lı bir **Connect cluster**. Bir connector işini [[task|task]]'lara böler ve worker'lar bu task'ları paylaşır.",
          "Connectors run in processes called [[worker|workers]]. The purple frame in the middle is a **Connect cluster** with two workers. A connector splits its work into [[task|tasks]], and the workers share them.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Connector'lar Connect'in REST API'sine (varsayılan port 8083) gönderilen bir JSON ayarıyla oluşturulur: hangi connector sınıfı, hangi tablo, hangi topic, kaç task (`tasks.max`).",
            "Connectors are created by sending a JSON config to Connect's REST API (port 8083 by default): which connector class, which table, which topic, how many tasks (`tasks.max`).",
          ),
        },
      ],
    },
    {
      short: l("Source", "Source"),
      tag: "how",
      title: l("Source connector: dışarıdan Kafka'ya", "Source connector: from outside into Kafka"),
      body: [
        l(
          "Worker 1'deki **source** task'ı tabloyu okudu ve 3 satırı topic'e 3 kayıt olarak yazdı. Bandın sonundaki koliler o satırlar; üstlerinde satırın id'si yazıyor.",
          "The **source** task on Worker 1 read the table and wrote its 3 rows into the topic as 3 records. The parcels on the belt are those rows, with each row's id on top.",
        ),
        l(
          "Bir dış sistemden okuyup Kafka'ya yazan connector'a [[sourceConnector]] denir. Bu örnek, id'si en son gördüğünden büyük satırları soruyor: \"son id 3'tü, 3'ten büyük yeni satır var mı?\"",
          "A connector that reads from outside and writes into Kafka is a [[sourceConnector]]. This one asks for rows with an id above the last one it saw: \"the last id was 3; any rows above 3?\"",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu, JDBC source connector'ının `incrementing` modu. Debezium gibi CDC connector'ları ise tabloyu sorgulamak yerine veritabanının değişiklik günlüğünü okur; silinen ve güncellenen satırları da yakalar.",
            "This is the JDBC source connector's `incrementing` mode. CDC connectors such as Debezium read the database's change log instead of querying the table, so they also catch updates and deletes.",
          ),
        },
      ],
    },
    {
      short: l("Sink", "Sink"),
      tag: "how",
      title: l("Sink connector: Kafka'dan dışarıya", "Sink connector: from Kafka out"),
      body: [
        l(
          "Worker 2'deki **sink** task'ı topic'i okudu ve 3 kaydı arama indeksine yazdı. Sonra kaldığı yeri commit etti.",
          "The **sink** task on Worker 2 read the topic, wrote the 3 records into the search index, then committed its place.",
        ),
        l(
          "Kafka'dan okuyup bir dış sisteme yazan connector'a [[sinkConnector]] denir. Aslında içeride sıradan bir consumer group çalışır; bayrak, sink'in sıradaki okuyacağı offset.",
          "A connector that reads Kafka and writes to an outside system is a [[sinkConnector]]. Inside, it is an ordinary consumer group; the flag is the sink's next offset.",
        ),
        l(
          "Veritabanı ile arama indeksi birbirini hiç tanımıyor. Aradaki topic'i başka ekipler de okuyabilir.",
          "The database and the search index know nothing of each other. Other teams can read the topic in between too.",
        ),
      ],
    },
    {
      short: l("SMT", "SMT"),
      tag: "how",
      title: l("Yolda küçük bir değişiklik: SMT", "A small change on the way: SMT"),
      predict: {
        question: l(
          "Siparişlerde kart numarası var. Source connector'a bir \"mask\" dönüşümü ekledik. Yeni sipariş topic'e nasıl yazılır?",
          "Orders contain a card number. We added a \"mask\" transform to the source connector. How does a new order land in the topic?",
        ),
        options: [
          l("Kart numarası açık, maskeyi indeks yapar", "With the card number in clear; the index masks it"),
          l("Kart numarası `****` olarak, Kafka'ya girmeden maskelenmiş", "With the card as `****`, masked before it enters Kafka"),
          l("Kayıt hiç yazılmaz", "The record is not written at all"),
        ],
        answer: 1,
        why: l(
          "Source tarafındaki SMT, kayıt Kafka'ya girmeden önce çalışır. Açık kart numarası ne topic'e ne de ondan okuyan hiçbir sisteme ulaşır.",
          "An SMT on the source side runs before the record enters Kafka. The clear card number reaches neither the topic nor anything that reads from it.",
        ),
      },
      body: [
        l(
          "Yeni sipariş (#4) topic'e mavi bir koli olarak girdi: kart numarası `**** ****` oldu. İndekse de maskeli hâli yazıldı.",
          "The new order (#4) entered the topic as a blue parcel, with the card number turned into `**** ****`. The index got the masked version too.",
        ),
        l(
          "Bunu yapan, kayıtları tek tek değiştiren küçük bir dönüşüm: [[smt]]. Alan maskelemek, alan eklemek ya da çıkarmak, kaydı başka bir topic'e yönlendirmek için kullanılır.",
          "What did it is a small transform that changes records one by one: an [[smt]]. It is used to mask, add or drop fields, or to route a record to another topic.",
        ),
        l(
          "Bir de [[converter]] var: Connect'in iç veri biçimini Kafka'daki byte'lara çevirir. Örneğin `AvroConverter`, şemayı Schema Registry'ye kaydedip kayıtları Avro olarak yazar.",
          "There is also a [[converter]]: it turns Connect's internal data into the bytes in Kafka. `AvroConverter`, for example, registers the schema in a Schema Registry and writes records as Avro.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "SMT'ler tek bir kayda bakar. Birleştirme, toplama veya birden çok kayıt arasında hesap gerekiyorsa doğru araç Kafka Streams gibi bir stream işleme kütüphanesidir.",
            "SMTs look at one record at a time. For joins, aggregations or anything across several records, the right tool is a stream processing library such as Kafka Streams.",
          ),
        },
      ],
    },
    {
      short: l("Kaldığı yer", "Its place"),
      tag: "how",
      title: l("Connect kaldığı yeri Kafka'da tutar", "Connect keeps its place in Kafka"),
      predict: {
        question: l(
          "Source task'ı \"en son 4 numaralı satırı kopyaladım\" bilgisini kaydedecek. Bu bilgi nereye yazılır?",
          "The source task is about to save \"the last row I copied was 4\". Where does that go?",
        ),
        options: [
          l("Veritabanındaki bir tabloya", "Into a table in the database"),
          l("Kafka'daki `connect-offsets` topic'ine", "Into the `connect-offsets` topic in Kafka"),
          l("Sadece worker'ın belleğine", "Only into the worker's memory"),
        ],
        answer: 1,
        why: l(
          "Connect, source offset'lerini Kafka'daki bir iç topic'te saklar. Böylece görev hangi worker'da başlarsa başlasın aynı bilgiyi bulur.",
          "Connect stores source offsets in an internal topic in Kafka, so the task finds the same information whichever worker it starts on.",
        ),
      },
      body: [
        l(
          "Source task'ı kaldığı yeri kaydetti: **son id 4**. Bu bilgi `connect-offsets` adlı bir Kafka topic'ine yazıldı (ortadaki kart).",
          "The source task saved its place: **last id 4**. It went into a Kafka topic called `connect-offsets` (the card in the middle).",
        ),
        l(
          "Sink tarafı ise sıradan bir consumer gibi offset'ini commit etti: 4. Kaydedilmeden önce \"nerede kaldım\" bilgisi sadece task'ın belleğindedir; kartta kırmızıyla görünür.",
          "The sink committed its offset like any consumer: 4. Until it is saved, \"where was I\" lives only in the task's memory; the card shows that in red.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Worker'lar offset'leri burada düğmeyle değil, `offset.flush.interval.ms` aralığında (varsayılan 60 saniye) kendileri kaydeder. Connect ayrıca connector ayarlarını ve durumlarını da iki iç topic'te tutar.",
            "Workers do not save offsets on a button press but on their own, every `offset.flush.interval.ms` (60 seconds by default). Connect also keeps connector configs and statuses in two more internal topics.",
          ),
        },
      ],
    },
    {
      short: l("Worker çöktü", "Worker down"),
      tag: "problem",
      title: l("Worker kaydetmeden çöktü", "A worker dies before saving"),
      predict: {
        question: l(
          "İki yeni satır (#5, #6) Kafka'ya kopyalandı ama Worker 1 offset'i kaydetmeden çöktü. Source task'ı Worker 2'de yeniden başlayınca ne olur?",
          "Two new rows (#5, #6) were copied into Kafka, but Worker 1 died before saving its offset. What happens when the source task restarts on Worker 2?",
        ),
        options: [
          l("Kaldığı yerden devam eder, tekrar olmaz", "It carries on where it was; nothing repeats"),
          l("#5 ve #6 topic'e ikinci kez yazılır", "#5 and #6 are written to the topic a second time"),
          l("#5 ve #6 hiç kopyalanmaz", "#5 and #6 are never copied"),
        ],
        answer: 1,
        why: l(
          "Yeni worker sadece kaydedilmiş yeri, yani son id 4'ü bilir. 4'ten büyük satırları yeniden sorar ve #5, #6 bir kez daha gider.",
          "The new worker only knows the saved place, last id 4. It asks again for rows above 4, and #5 and #6 go out once more.",
        ),
      },
      body: [
        l(
          "Worker 1 çöktü. Source task'ı otomatik olarak Worker 2'ye taşındı. Ama son kayıtlı yer 4'tü, bu yüzden #5 ve #6'yı **ikinci kez** topic'e yazdı. Kolilerin üstündeki \"2×\" bunu gösteriyor.",
          "Worker 1 died. The source task moved to Worker 2 on its own. But the last saved place was 4, so it wrote #5 and #6 into the topic **a second time**. The \"2×\" on the parcels shows that.",
        ),
        l(
          "Bu, ikinci dersteki commit'ten önce çöken consumer'ın aynısı: hiçbir satır kaybolmadı ama bazıları iki kez gitti. Connect'in varsayılan garantisi **at-least-once**.",
          "This is the consumer that crashed before committing in the second lesson: no row was lost, but some went twice. Connect's default guarantee is **at-least-once**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada task'lar hemen taşınıyor. Gerçekte cluster, giden bir worker'ın geri gelmesini bir süre bekler (`scheduled.rebalance.max.delay.ms`, varsayılan 5 dakika), sonra task'larını başkasına verir.",
            "Here tasks move at once. In reality the cluster waits a while for a departed worker to come back (`scheduled.rebalance.max.delay.ms`, 5 minutes by default) before handing its tasks to someone else.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Kafka 3.3'ten beri source connector'lar için exactly-once desteği var (`exactly.once.source.support`). Bunu connector'ın da desteklemesi gerekir.",
            "Since Kafka 3.3, source connectors can run exactly-once (`exactly.once.source.support`). The connector has to support it too.",
          ),
        },
      ],
    },
    {
      short: l("Distributed", "Distributed"),
      tag: "how",
      title: l("Worker geri gelince iş yeniden paylaşılır", "When the worker returns, the work is shared again"),
      body: [
        l(
          "Worker 1 geri geldi. Cluster task'ları yeniden dağıttı: source tekrar Worker 1'de, sink Worker 2'de.",
          "Worker 1 is back. The cluster spread the tasks again: source on Worker 1, sink on Worker 2.",
        ),
        l(
          "Task, çalışan bir worker'dan alınırken önce düzgünce durdurulur ve offset'i kaydedilir. Bu yüzden bu sefer hiçbir şey tekrar etmedi.",
          "A task taken from a running worker is stopped cleanly first, which saves its offset. That is why nothing repeated this time.",
        ),
        l(
          "Buna **distributed mode** denir: aynı `group.id` ile başlayan worker'lar bir cluster oluşturur, işi paylaşır ve biri düşerse diğerleri devralır. Tek süreçlik **standalone mode** ise denemeler içindir.",
          "This is **distributed mode**: workers started with the same `group.id` form a cluster, share the work, and take over when one falls. Single-process **standalone mode** is for experiments.",
        ),
      ],
    },
    {
      short: l("Sink'te tekrar", "Repeats at the sink"),
      tag: "experiment",
      title: l("Tekrarlar sink'te zararsız olabilir", "Repeats can be harmless at the sink"),
      predict: {
        question: l(
          "Topic'te #5 ve #6 ikişer kez var. Sink **upsert** modunda: her kaydı id'sine göre yazar. İndekste #5'ten kaç tane olur?",
          "#5 and #6 are in the topic twice each. The sink runs in **upsert** mode: it writes each record by its id. How many #5 documents end up in the index?",
        ),
        options: [l("1", "1"), l("2", "2"), l("0", "0")],
        answer: 0,
        why: l(
          "Upsert, aynı id'li belge varsa onun üstüne yazar. İkinci #5 yeni bir belge oluşturmaz, var olanı aynı değerle günceller.",
          "Upsert overwrites the document with the same id if one exists. The second #5 does not create a new document; it rewrites the existing one with the same value.",
        ),
      },
      body: [
        l(
          "Sink 4 kaydı okudu: #5, #6, #5, #6. İndekste yine de her siparişten **tek** belge var. Tekrar gelen kayıtlar aynı belgenin üstüne yazıldı.",
          "The sink read 4 records: #5, #6, #5, #6. The index still has **one** document per order; the repeats overwrote the same documents.",
        ),
        l(
          "Sink **insert** modunda olsaydı her kayıt yeni bir belge olurdu ve #5 ile #6 indekste ikişer kez görünürdü.",
          "In **insert** mode every record would have become a new document, and #5 and #6 would show up twice in the index.",
        ),
        l(
          "Ders şu: at-least-once bir hattın sonunda tekrarları **idempotent** bir yazmayla, yani aynı işi iki kez yapmanın zarar vermediği bir yazmayla etkisiz hale getirirsin.",
          "The lesson: at the end of an at-least-once pipeline you neutralise repeats with an **idempotent** write, one where doing it twice does no harm.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In practice"),
      tag: "reality",
      title: l("Gerçek hayatta Connect", "Connect in real life"),
      body: [
        l(
          "Yüzlerce hazır connector var: JDBC, Debezium (CDC), Elasticsearch, S3, BigQuery, Snowflake… Çoğu Apache Kafka'nın değil, onları yazan şirketlerin ya da toplulukların projesi; lisansları farklı olabilir.",
          "There are hundreds of ready-made connectors: JDBC, Debezium (CDC), Elasticsearch, S3, BigQuery, Snowflake… Most are not part of Apache Kafka but projects of the companies or communities behind them, with their own licences.",
        ),
        l(
          "Bir kayıt sink'te sürekli hata veriyorsa bütün hattı durdurmak istemezsin. `errors.tolerance=all` ve `errors.deadletterqueue.topic.name` ile bu kayıtları bir **dead letter queue** topic'ine ayırabilirsin.",
          "If one record keeps failing at the sink, you do not want the whole pipeline to stop. With `errors.tolerance=all` and `errors.deadletterqueue.topic.name` you can set such records aside in a **dead letter queue** topic.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu derste bir source ve bir sink task'ı var. Gerçekte bir connector `tasks.max` kadar task'a bölünebilir; örneğin her tablo ya da her partition için bir task.",
            "This lesson has one source task and one sink task. A real connector can be split into up to `tasks.max` tasks, for example one per table or per partition.",
          ),
        },
      ],
    },
    {
      short: l("Sıra sende", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda docker-compose ile kurulu bir Connect hattı var: Postgres → `db-source` → `payments` topic'i → `search-sink` → Elasticsearch, iki worker üstünde. Connector ayarları `db-source.json` ve `search-sink.json`'da; değişikliği Connect'in REST API'sine `curl -X PUT ... /connectors/<ad>/config` ile gönderirsin.",
          "Your turn. Below is a Connect pipeline set up with docker-compose: Postgres → `db-source` → topic `payments` → `search-sink` → Elasticsearch, on two workers. The connector settings live in `db-source.json` and `search-sink.json`; send a change to Connect's REST API with `curl -X PUT ... /connectors/<name>/config`.",
        ),
        l(
          "Worker'ları `docker stop`, `kill`, `start` ve `restart` ile yönetirsin; `sleep 60` offset'lerin kaydedilmesini bekler. Görevler yeni satırları ve kayıtları kendiliğinden toplar. **4 senaryo** var; az komutla bitirirsen 3 yıldız.",
          "Manage the workers with `docker stop`, `kill`, `start` and `restart`; `sleep 60` waits for the offsets to be saved. The tasks pick up new rows and records on their own. There are **4 scenarios**; few commands earn 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Gerçekte worker'lar offset'leri bir zamanlayıcıyla kaydeder (`offset.flush.interval.ms`, varsayılan 60 sn) ve ölen bir worker'ın görevleri, grup bunu fark edince taşınır. Burada taşıma anında olur.",
            "In real life workers save offsets on a timer (`offset.flush.interval.ms`, 60 s by default), and a dead worker's tasks move once the group notices. Here they move at once.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[kafkaConnect]], Kafka ile dış sistemler arasında veri taşımayı kod yerine ayarla yapar.",
      "[[kafkaConnect]] moves data between Kafka and other systems with config instead of code.",
    ),
    l(
      "[[sourceConnector|Source connector]] dışarıdan Kafka'ya, [[sinkConnector|sink connector]] Kafka'dan dışarıya yazar.",
      "A [[sourceConnector]] writes from outside into Kafka; a [[sinkConnector]] writes from Kafka out.",
    ),
    l(
      "[[smt|SMT]]'ler kayıtları tek tek değiştirir; [[converter|converter]]'lar veriyi byte'lara çevirir.",
      "[[smt|SMTs]] change records one by one; [[converter|converters]] turn data into bytes.",
    ),
    l(
      "Connect kaldığı yeri Kafka'daki iç topic'lerde tutar, bu yüzden task'lar worker değiştirebilir.",
      "Connect keeps its place in internal Kafka topics, so tasks can move between workers.",
    ),
    l(
      "Offset kaydedilmeden çöken bir worker, satırların tekrar gönderilmesine yol açar (at-least-once).",
      "A worker that dies before saving its offset causes rows to be sent again (at-least-once).",
    ),
    l(
      "Sink'te upsert gibi idempotent bir yazma, tekrarları zararsız hale getirir.",
      "An idempotent write at the sink, such as upsert, makes repeats harmless.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Kafka Connect ile bir PostgreSQL tablosunu Kafka'ya taşımak için genellikle ne yaparsın?",
        "To move a PostgreSQL table into Kafka with Kafka Connect, what do you usually do?",
      ),
      options: [
        l("Kendi producer'ını yazarsın", "Write your own producer"),
        l("Hazır bir source connector'ı JSON ayarıyla çalıştırırsın", "Run a ready-made source connector with a JSON config"),
        l("Bir sink connector kurarsın", "Set up a sink connector"),
        l("Kafka broker'ına tabloyu eklersin", "Add the table to the Kafka broker"),
      ],
      answer: 1,
      explain: l(
        "Veriyi dışarıdan Kafka'ya getiren, source connector'dır. Kod yerine REST API'ye bir ayar gönderirsin.",
        "Bringing data from outside into Kafka is a source connector's job. Instead of code, you send a config to the REST API.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "Bir source connector \"en son nereye kadar kopyaladım\" bilgisini nerede saklar?",
        "Where does a source connector keep \"how far have I copied\"?",
      ),
      options: [
        l("Kaynak veritabanında", "In the source database"),
        l("Kafka'daki bir iç topic'te (`connect-offsets`)", "In an internal Kafka topic (`connect-offsets`)"),
        l("Worker'ın yerel dosyasında, distributed mode'da bile", "In the worker's local file, even in distributed mode"),
        l("Hiçbir yerde", "Nowhere"),
      ],
      answer: 1,
      explain: l(
        "Distributed mode'da source offset'leri bir Kafka topic'inde durur. Task başka bir worker'da başlasa bile aynı yeri bulur.",
        "In distributed mode, source offsets live in a Kafka topic, so a task finds the same place even on another worker.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Bir worker satırları Kafka'ya yazdıktan sonra, offset'i kaydetmeden çöktü. Görev başka worker'da başlayınca ne olur?",
        "A worker wrote rows into Kafka, then died before saving its offset. What happens when the task starts on another worker?",
      ),
      options: [
        l("O satırlar kaybolur", "Those rows are lost"),
        l("O satırlar Kafka'ya ikinci kez yazılabilir", "Those rows may be written to Kafka a second time"),
        l("Connect durur ve elle başlatılması gerekir", "Connect stops and needs a manual restart"),
        l("Hiçbir şey olmaz", "Nothing happens"),
      ],
      answer: 1,
      explain: l(
        "Yeni task sadece son kaydedilen yeri bilir ve oradan devam eder. Arada yazılmış satırlar tekrar gider: at-least-once.",
        "The new task only knows the last saved place and resumes there. Rows written in between go again: at-least-once.",
      ),
      reviewStep: 6,
    },
    {
      question: l("SMT (Single Message Transform) ne yapar?", "What does an SMT (Single Message Transform) do?"),
      options: [
        l("İki topic'i birleştirir", "Joins two topics"),
        l("Kayıtları tek tek, Kafka'ya girerken veya çıkarken değiştirir", "Changes records one at a time, on their way into or out of Kafka"),
        l("Kayıtları sayar ve toplar", "Counts and sums records"),
        l("Worker'ları yeniden başlatır", "Restarts workers"),
      ],
      answer: 1,
      explain: l(
        "SMT tek bir kayda bakar: bir alanı maskeler, ekler, çıkarır ya da kaydı başka topic'e yönlendirir. Birden çok kayıt üzerinde hesap için stream işleme gerekir.",
        "An SMT looks at one record: it masks, adds or drops a field, or routes the record elsewhere. Work across several records needs stream processing.",
      ),
      reviewStep: 4,
    },
  ],
};
