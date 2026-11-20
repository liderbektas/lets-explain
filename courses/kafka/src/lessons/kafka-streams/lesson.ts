import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, KafkaStreamsScene } from "./Scene";

export const kafkaStreams: Lesson = {
  slug: "kafka-streams",
  title: l("Kafka Streams", "Kafka Streams"),
  summary: l(
    "Akan veriyle canlı hesap yapmak: KStream ve KTable, state store, changelog ve exactly-once işleme.",
    "Computing live results from flowing data: KStream and KTable, state stores, changelogs and exactly-once processing.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: KafkaStreamsScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kafka Streams'in bir kütüphane olduğunu anlamak", "Understand that Kafka Streams is a library"), step: 1 },
    { text: l("KStream ile KTable'ı ayırt etmek", "Tell a KStream from a KTable"), step: 3 },
    { text: l("State store'un changelog'dan nasıl geri geldiğini görmek", "See how a state store comes back from its changelog"), step: 5 },
    { text: l("at_least_once'ta çift sayımın nasıl olduğunu görmek", "See how at_least_once can count twice"), step: 6 },
    { text: l("exactly_once_v2'nin bunu nasıl önlediğini görmek", "See how exactly_once_v2 prevents it"), step: 8 },
  ],
  steps: [
    {
      short: l("Canlı sayım", "Live count"),
      tag: "problem",
      title: l("Hangi şehirden kaç sipariş geldi?", "How many orders from each city?"),
      changes: [{ kind: "add", text: l("+3 sipariş topic'e yazıldı", "+3 orders written to the topic") }],
      body: [
        l(
          "Yönetim, her şehirden kaç sipariş geldiğini **canlı** görmek istiyor. Siparişler `orders` topic'ine akıyor (soldaki bant). Renkler şehirleri gösteriyor.",
          "Management wants to see **live** how many orders come from each city. Orders flow into the `orders` topic (the belt on the left), coloured by city.",
        ),
        l(
          "Bir consumer yazıp sayıları bellekte tutabiliriz. Ama uygulama çökünce sayılar ne olacak? İki kopya çalıştırırsak sayıları nasıl paylaşacağız? Bir siparişi iki kez saymamayı nasıl garanti edeceğiz?",
          "We could write a consumer and keep the counts in memory. But what happens to them when the app crashes? How do two copies share the counts? How do we make sure no order is counted twice?",
        ),
      ],
    },
    {
      short: l("Bir kütüphane", "A library"),
      tag: "idea",
      title: l("Kafka Streams: uygulamanın içindeki kütüphane", "Kafka Streams: a library inside your app"),
      body: [
        l(
          "[[kafkaStreams]], bu soruların cevabını hazır getiren bir Java kütüphanesi. Ortadaki mor çatılı bina sıradan bir uygulama; kütüphane onun **içinde** çalışıyor.",
          "[[kafkaStreams]] is a Java library that answers these questions for you. The purple-roofed building in the middle is an ordinary app, and the library runs **inside** it.",
        ),
        l(
          "Ayrı bir işleme cluster'ı kurmazsın. Daha fazla güç gerekirse aynı uygulamadan bir kopya daha başlatırsın; aynı `application.id`'yi kullanan kopyalar işi kendi aralarında paylaşır.",
          "There is no separate processing cluster to run. For more power you start another copy of the same app; copies with the same `application.id` share the work between them.",
        ),
        l(
          "Kodu birkaç satır: `orders` topic'ini oku, şehre göre grupla, say, sonucu `orders-per-city` topic'ine yaz.",
          "The code is a few lines: read `orders`, group by city, count, and write the result to `orders-per-city`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka Streams JVM dillerinde (Java, Kotlin, Scala) çalışır. Aynı fikri SQL ile yazmak istersen ksqlDB, Apache Flink gibi araçlar da var.",
            "Kafka Streams runs on the JVM (Java, Kotlin, Scala). If you would rather write the same idea in SQL, there are tools such as ksqlDB and Apache Flink.",
          ),
        },
      ],
    },
    {
      short: l("Topoloji", "Topology"),
      tag: "how",
      title: l("Oku, grupla, say, yaz", "Read, group, count, write"),
      body: [
        l(
          "Uygulama ilk iki siparişi işledi. Her sipariş için ilgili şehrin sayısını bir artırdı ve yeni sayıyı sonuç topic'ine yazdı.",
          "The app processed the first two orders. For each one it added one to that city's count and wrote the new count to the result topic.",
        ),
        l(
          "Bayrak sıradaki işlenecek offset'i gösteriyor. Sağ üstte iki görünüm var: **KStream** her güncellemeyi sırayla listeler, **KTable** her şehrin sadece son değerini.",
          "The flag shows the next offset to process. At the top right there are two views: the **KStream** lists every update in order, the **KTable** only each city's latest value.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Siparişlerin key'i müşteriyse, şehre göre gruplamak için kayıtların şehir key'iyle yeniden dağıtılması gerekir. Kafka Streams bunu bir **repartition topic** ile kendisi yapar. Bu sahnede o ara adımı çizmiyoruz.",
            "If orders are keyed by customer, grouping by city means re-sending records keyed by city. Kafka Streams does this itself through a **repartition topic**. This scene skips drawing that middle step.",
          ),
        },
      ],
    },
    {
      short: l("KStream, KTable", "KStream, KTable"),
      tag: "how",
      title: l("Aynı veri, iki bakış", "The same data, two views"),
      predict: {
        question: l(
          "Üçüncü sipariş de İstanbul'dan. Uygulama onu işleyince sağdaki iki kartta ne olur?",
          "The third order is from Istanbul too. When the app processes it, what happens in the two cards on the right?",
        ),
        options: [
          l("KStream'e yeni bir güncelleme eklenir, KTable'da İstanbul satırı 2 olur", "The KStream gets a new update, and the KTable's Istanbul row becomes 2"),
          l("KTable'a ikinci bir İstanbul satırı eklenir", "The KTable gets a second Istanbul row"),
          l("Hiçbir şey; KTable sadece ilk değeri tutar", "Nothing; the KTable keeps only the first value"),
        ],
        answer: 0,
        why: l(
          "KStream'de her kayıt yeni bir olaydır, yani listeye eklenir. KTable'da ise aynı key'in yeni değeri eskisinin yerine geçer.",
          "In a KStream every record is a new event, so it is appended. In a KTable, a key's new value replaces the old one.",
        ),
      },
      body: [
        l(
          "KStream kartında artık üç güncelleme var: `İst=1`, `Ank=1`, `İst=2`. KTable kartında ise iki satır: İstanbul 2, Ankara 1.",
          "The KStream card now has three updates: `İst=1`, `Ank=1`, `İst=2`. The KTable card has two rows: Istanbul 2, Ankara 1.",
        ),
        l(
          "[[kstream]] her kaydı ayrı bir olay olarak görür. [[ktable]] ise aynı akışı bir tablo gibi okur: her key'in sadece en son değeri önemlidir.",
          "A [[kstream]] treats every record as a separate event. A [[ktable]] reads the same flow as a table: only each key's latest value matters.",
        ),
        l(
          "`count()` bir KTable üretir. Biz onun değişikliklerini topic'e yazıyoruz; topic'i okuyan biri isterse olay listesi, isterse tablo gibi kullanır.",
          "`count()` produces a KTable. We write its changes to a topic; whoever reads that topic can treat it as a list of events or as a table.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka Streams varsayılan olarak küçük bir önbellek kullanır ve kısa sürede gelen güncellemeleri birleştirir. Bu yüzden gerçekte topic'e her ara değer değil, bazen sadece son değer yazılır.",
            "By default Kafka Streams uses a small cache that merges updates arriving close together. So in reality the topic sometimes gets only the latest value, not every step in between.",
          ),
        },
      ],
    },
    {
      short: l("State store", "State store"),
      tag: "how",
      title: l("Sayımlar nerede duruyor?", "Where do the counts live?"),
      body: [
        l(
          "İki sipariş daha işlendi ve uygulama commit etti. Sayımlar uygulamanın yanındaki [[stateStore]] kartında duruyor: yerel diskte, hızlı erişilen bir depo.",
          "Two more orders were processed and the app committed. The counts live in the [[stateStore]] card next to the app: a fast store on the local disk.",
        ),
        l(
          "Ama yerel disk her an gidebilir. Bu yüzden store'daki her değişiklik Kafka'daki bir [[changelogTopic]]'e de yazılır (ortadaki kart). Changelog, store'un yedeği gibidir.",
          "But a local disk can vanish at any moment. So every change to the store is also written to a [[changelogTopic]] in Kafka (the middle card). The changelog is like the store's backup.",
        ),
        l(
          "Commit ise iki şeyi kaydeder: input topic'te nerede kalındığını (mühür) ve o ana kadar yazılanları.",
          "A commit saves two things: where the app is in the input topic (the seal), and everything written up to that point.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Varsayılan store RocksDB'dir. Changelog topic'leri compacted'dır: her key'in sadece son değeri tutulur, böylece geri yükleme hızlı kalır.",
            "The default store is RocksDB. Changelog topics are compacted: only each key's latest value is kept, which keeps restoring fast.",
          ),
        },
      ],
    },
    {
      short: l("Disk gitti", "Disk lost"),
      tag: "experiment",
      title: l("Uygulama çöktü, store yeniden kuruldu", "The app crashed, and its store was rebuilt"),
      predict: {
        question: l(
          "Uygulama çöktü ve başka bir makinede yeniden açıldı; yerel diski boş. Sayımlara ne olur?",
          "The app crashed and restarted on another machine with an empty local disk. What happens to the counts?",
        ),
        options: [
          l("Sıfırdan başlar, eski sayımlar kaybolur", "They start from zero; the old counts are lost"),
          l("Changelog topic'inden geri yüklenir", "They are restored from the changelog topic"),
          l("Bütün siparişler offset 0'dan yeniden işlenir", "Every order is processed again from offset 0"),
        ],
        answer: 1,
        why: l(
          "Store'daki her değişiklik changelog'a yazılmıştı. Yeni makinedeki uygulama changelog'u okuyup store'u aynı hâline getirir, sonra commit edilen offset'ten devam eder.",
          "Every change to the store was written to the changelog. The app on the new machine reads the changelog, rebuilds the store exactly, then continues from the committed offset.",
        ),
      },
      body: [
        l(
          "Uygulama çöktü ve state store'u boşaldı. Yeniden başlayınca changelog'u baştan okudu ve sayımları geri yükledi: İstanbul 3, Ankara 1, İzmir 1.",
          "The app crashed and its state store was emptied. On restart it read the changelog and restored the counts: Istanbul 3, Ankara 1, Izmir 1.",
        ),
        l(
          "Input topic'i baştan işlemesine gerek kalmadı: commit edilen offset'ten (5) devam edecek.",
          "It did not need to process the input topic again: it continues from the committed offset (5).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada her çökmede disk kayboluyor. Aynı makinede yeniden başlayan bir uygulama yerel store'unu kullanır ve sadece aradaki farkı changelog'dan alır. `num.standby.replicas` ile başka bir kopyada hazır bir yedek de tutabilirsin.",
            "Here every crash loses the disk. An app that restarts on the same machine reuses its local store and only reads the gap from the changelog. With `num.standby.replicas` you can also keep a warm copy on another instance.",
          ),
        },
      ],
    },
    {
      short: l("Çift sayım", "Double count"),
      tag: "problem",
      title: l("Commit'ten önce çökmek: çift sayım", "Crashing before a commit: counting twice"),
      predict: {
        question: l(
          "Garanti at_least_once. İki yeni İstanbul siparişi işlendi ama uygulama commit etmeden çöktü. Yeniden başlayınca ne olur?",
          "The guarantee is at_least_once. Two new Istanbul orders were processed, but the app crashed before committing. What happens on restart?",
        ),
        options: [
          l("İstanbul sayımı doğru kalır", "The Istanbul count stays right"),
          l("Bu iki sipariş iki kez sayılır", "These two orders are counted twice"),
          l("Bu iki sipariş hiç sayılmaz", "These two orders are never counted"),
        ],
        answer: 1,
        why: l(
          "Yeni sayımlar changelog'a yazılmıştı, store onlarla geri geldi. Ama input offset'i commit edilmemişti, bu yüzden uygulama aynı iki siparişi yeniden işleyip bir kez daha saydı.",
          "The new counts were already in the changelog, so the store came back with them. But the input offset was not committed, so the app processed the same two orders again and counted them once more.",
        ),
      },
      body: [
        l(
          "Uygulama iki siparişi saydı (İstanbul 5) ve commit etmeden çöktü. Store changelog'dan **5** olarak geri geldi. Ama commit edilen offset 5'ti; uygulama 5 ve 6'yı yeniden işledi ve İstanbul **7** oldu.",
          "The app counted two orders (Istanbul 5) and crashed before committing. The store came back from the changelog as **5**. But the committed offset was 5, so the app processed 5 and 6 again and Istanbul became **7**.",
        ),
        l(
          "Doğrusu 5. Tablodaki kırmızı satır ve \"Fazla sayım: 2\" bunu gösteriyor. Kafka Streams'in varsayılan garantisi **at_least_once**: hiçbir şey kaybolmaz ama bazı şeyler iki kez sayılabilir.",
          "The right answer is 5. The red table row and \"Over-counted: 2\" show it. Kafka Streams' default guarantee is **at_least_once**: nothing is lost, but some things can be counted twice.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka Streams commit'i bir düğmeyle değil, `commit.interval.ms` aralığında (at_least_once'ta varsayılan 30 saniye) kendisi yapar. Çökme bu aralığın içine düşerse aradaki her şey tekrar işlenir.",
            "Kafka Streams commits on its own every `commit.interval.ms` (30 seconds by default under at_least_once), not on a button. If a crash lands inside that window, everything since is processed again.",
          ),
        },
      ],
    },
    {
      short: l("exactly_once_v2", "exactly_once_v2"),
      tag: "how",
      title: l("Tek ayar: exactly_once_v2", "One setting: exactly_once_v2"),
      body: [
        l(
          "Önce uygulamayı sıfırladık ve her şeyi baştan saydık; tablo yine doğru (İstanbul 5). Sonra tek bir ayarı değiştirdik: `processing.guarantee=exactly_once_v2`.",
          "First we reset the app and recounted everything; the table is right again (Istanbul 5). Then we changed one setting: `processing.guarantee=exactly_once_v2`.",
        ),
        l(
          "Artık okuma, store güncellemesi, changelog ve sonuç yazma ile input offset'inin commit'i **tek bir transaction**'da birlikte yapılıyor. Ya hepsi olur ya hiçbiri.",
          "Now reading, updating the store, writing the changelog and the result, and committing the input offset all happen in **one transaction**. Either all of it happens or none of it does.",
        ),
        l(
          "Commit'i bekleyen güncellemeler kesikli çerçeveyle görünüyor. `read_committed` ile okuyan biri, transaction tamamlanana kadar onları görmez.",
          "Updates waiting for the commit have a dashed outline. A reader using `read_committed` does not see them until the transaction completes.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Uygulamayı sıfırlamak için Kafka ile gelen `kafka-streams-application-reset` aracı kullanılır: input offset'lerini başa alır ve iç topic'leri siler.",
            "To reset an app you use the `kafka-streams-application-reset` tool that ships with Kafka: it rewinds the input offsets and deletes the internal topics.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "exactly_once_v2'de commit aralığı varsayılan olarak 100 ms'dir; sonuçlar biraz gecikmeyle görünür. Eski `exactly_once` ayarı Kafka 4.0'da kaldırıldı.",
            "Under exactly_once_v2 the commit interval defaults to 100 ms, so results appear with a small delay. The old `exactly_once` setting was removed in Kafka 4.0.",
          ),
        },
      ],
    },
    {
      short: l("Aynı çöküş", "Same crash"),
      tag: "experiment",
      title: l("Aynı çöküş, bu sefer sayım doğru", "The same crash, and this time the count is right"),
      predict: {
        question: l(
          "Aynı deney, bu sefer exactly_once_v2 ile: iki Ankara siparişi işlendi, uygulama commit'ten önce çöktü. Ne olur?",
          "The same experiment, now with exactly_once_v2: two Ankara orders were processed, and the app crashed before the commit. What happens?",
        ),
        options: [
          l("Yine ikisi de iki kez sayılır", "Both are counted twice again"),
          l("Yarım kalan transaction iptal edilir ve sayım doğru kalır", "The open transaction is aborted and the count stays right"),
          l("İki sipariş kaybolur", "The two orders are lost"),
        ],
        answer: 1,
        why: l(
          "Çökme, transaction tamamlanmadan oldu. Changelog'a ve sonuç topic'ine yazılanlar iptal edildi, store commit edilmiş hâliyle geri geldi. Siparişler yeniden işlendi ve tam bir kez sayıldı.",
          "The crash came before the transaction completed. What it wrote to the changelog and the result topic was aborted, and the store came back as committed. The orders were processed again and counted exactly once.",
        ),
      },
      body: [
        l(
          "Uygulama Ankara'yı 3'e çıkardı ve commit etmeden çöktü. Bu güncellemeler yarım kalan bir transaction'daydı: changelog'da ve sonuç topic'inde kırmızı ve üstü çizili, yani **iptal edildi**.",
          "The app took Ankara up to 3 and crashed before committing. Those updates were in an open transaction: they are red and struck through in the changelog and the result topic, meaning **aborted**.",
        ),
        l(
          "Store commit edilmiş değerle (Ankara 1) geri geldi. Uygulama iki siparişi yeniden işledi, commit etti ve Ankara doğru şekilde **3** oldu. Fazla sayım yok.",
          "The store came back with the committed value (Ankara 1). The app processed the two orders again, committed, and Ankara correctly became **3**. Nothing over-counted.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Exactly-once, kaydın **etkisi** için geçerli: kayıt yine iki kez işlendi ama ilk denemenin izleri iptal edildi. Kafka dışındaki bir sisteme (örneğin e-posta) yapılan yan etkileri bu garanti kapsamaz.",
            "Exactly-once is about a record's **effect**: the record was still processed twice, but the first attempt's traces were aborted. Side effects outside Kafka, such as sending an email, are not covered.",
          ),
        },
      ],
    },
    {
      short: l("Gerçekte", "In practice"),
      tag: "reality",
      title: l("Gerçek hayatta Kafka Streams", "Kafka Streams in real life"),
      body: [
        l(
          "**Ölçekleme:** iş, input topic'in partition'larına göre task'lara bölünür. 6 partition varsa en fazla 6 kopya aynı anda çalışabilir; biri düşerse task'ları diğerlerine geçer.",
          "**Scaling:** the work is split into tasks by the input topic's partitions. With 6 partitions, at most 6 copies work at once; if one falls, its tasks move to the others.",
        ),
        l(
          "**Pencereler:** \"son 5 dakikada kaç sipariş?\" gibi sorular için sayımı zaman pencerelerine bölebilirsin: tumbling, hopping, sliding ve session pencereleri.",
          "**Windows:** for questions such as \"how many orders in the last 5 minutes?\" you can split counts into time windows: tumbling, hopping, sliding and session windows.",
        ),
        l(
          "**Birleştirme:** iki akışı ya da bir akışla bir tabloyu join edebilirsin; örneğin siparişleri müşteri tablosuyla zenginleştirmek.",
          "**Joins:** you can join two streams, or a stream with a table, for example to enrich orders with the customer table.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Interactive Queries ile bir uygulamanın state store'unu doğrudan sorgulayabilirsin: sayımları okumak için sonuç topic'ini okuman gerekmez.",
            "With Interactive Queries you can query an app's state store directly; you do not have to read the result topic to get the counts.",
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
          "Sıra sende. Aşağıda şehir başına sipariş sayan Kafka Streams uygulamasının projesi var. Ayarları `streams.properties`'te (`processing.guarantee`); `./run-app.sh` uygulamayı başlatır, bekleyen siparişleri sayar ve commit eder. `./place-order.sh İzmir` sipariş ekler.",
          "Your turn. Below is the project of the Kafka Streams app that counts orders per city. Its settings are in `streams.properties` (`processing.guarantee`); `./run-app.sh` starts it, counts the waiting orders and commits. `./place-order.sh İzmir` adds an order.",
        ),
        l(
          "Çıktıyı `kafka-console-consumer.sh` ile `orders-per-city` topic'inden okursun; durmuş bir uygulamayı `kafka-streams-application-reset.sh` başa sarar. Planlanan arıza gizli `.chaos` dosyasında (`ls -a`). **4 senaryo** var; az komutla bitirirsen 3 yıldız.",
          "Read the output from the `orders-per-city` topic with `kafka-console-consumer.sh`; `kafka-streams-application-reset.sh` rewinds a stopped app. The planned failure is in the hidden `.chaos` file (`ls -a`). There are **4 scenarios**; few commands earn 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Burada her çöküş yerel diski de götürür, store hep changelog'dan kurulur. Gerçekte disk kalırsa Kafka Streams yerel store'u kullanır ve sadece aradaki farkı okur.",
            "Here every crash takes the local disk too, so the store is always rebuilt from the changelog. In real life, if the disk survives, Kafka Streams reuses the local store and only reads what it missed.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[kafkaStreams]] uygulamanın içinde çalışan bir kütüphanedir; ölçeklemek için uygulamanın yeni bir kopyasını başlatırsın.",
      "[[kafkaStreams]] is a library inside your app; to scale, you start another copy of the app.",
    ),
    l(
      "[[kstream|KStream]]'de her kayıt ayrı bir olaydır; [[ktable|KTable]] her key'in sadece son değerini tutar.",
      "In a [[kstream]] every record is a separate event; a [[ktable]] keeps only each key's latest value.",
    ),
    l(
      "Sayım gibi ara sonuçlar yerel bir [[stateStore|state store]]'da durur ve her değişiklik bir [[changelogTopic|changelog topic]]'e yazılır.",
      "Intermediate results such as counts live in a local [[stateStore]], and every change is written to a [[changelogTopic]].",
    ),
    l(
      "Disk kaybolursa store changelog'dan yeniden kurulur ve uygulama commit edilen offset'ten devam eder.",
      "If the disk is lost, the store is rebuilt from the changelog and the app continues from the committed offset.",
    ),
    l(
      "at_least_once'ta commit'ten önce çökmek, bazı kayıtların iki kez sayılmasına yol açar.",
      "Under at_least_once, crashing before a commit can count some records twice.",
    ),
    l(
      "[[exactlyOnceV2|exactly_once_v2]] okuma, işleme ve yazmayı tek transaction'da yapar; yarım kalan iş iptal edilir.",
      "[[exactlyOnceV2]] does reading, processing and writing in one transaction; unfinished work is aborted.",
    ),
  ],
  quiz: [
    {
      question: l("Kafka Streams uygulaması nerede çalışır?", "Where does a Kafka Streams app run?"),
      options: [
        l("Kafka broker'larının içinde", "Inside the Kafka brokers"),
        l("Ayrı bir Streams cluster'ında", "In a separate Streams cluster"),
        l("Senin uygulamanın içinde, bir kütüphane olarak", "Inside your own app, as a library"),
        l("Schema Registry'de", "In the Schema Registry"),
      ],
      answer: 2,
      explain: l(
        "Kafka Streams bir kütüphanedir. Uygulamanı nasıl çalıştırıyorsan öyle çalışır; daha fazla güç için kopya başlatırsın.",
        "Kafka Streams is a library. It runs however you run your app; for more power you start more copies.",
      ),
      reviewStep: 1,
    },
    {
      question: l(
        "Bir KTable'a aynı key ile yeni bir kayıt gelince ne olur?",
        "What happens when a new record with an existing key reaches a KTable?",
      ),
      options: [
        l("Yeni bir satır olarak eklenir", "It is added as a new row"),
        l("O key'in önceki değerinin yerine geçer", "It replaces that key's previous value"),
        l("Görmezden gelinir", "It is ignored"),
        l("Hata verir", "It raises an error"),
      ],
      answer: 1,
      explain: l(
        "KTable her key'in son değerini tutar. Aynı key'li yeni kayıt bir güncellemedir.",
        "A KTable keeps each key's latest value. A new record for the same key is an update.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "Bir Kafka Streams uygulaması yerel diskini kaybetti. State store nereden geri gelir?",
        "A Kafka Streams app lost its local disk. Where does its state store come back from?",
      ),
      options: [
        l("Input topic baştan işlenerek", "By processing the input topic from the start"),
        l("Store'un changelog topic'inden", "From the store's changelog topic"),
        l("Schema Registry'den", "From the Schema Registry"),
        l("Geri gelmez, sıfırdan başlar", "It does not; it starts from zero"),
      ],
      answer: 1,
      explain: l(
        "Store'daki her değişiklik changelog topic'ine yazılır. Uygulama onu okuyup store'u yeniden kurar.",
        "Every change to the store is written to its changelog topic. The app reads it and rebuilds the store.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Bir çökmeden sonra bazı siparişlerin iki kez sayılmasını önleyen ayar hangisi?",
        "Which setting stops some orders from being counted twice after a crash?",
      ),
      options: [
        l("`auto.offset.reset=earliest`", "`auto.offset.reset=earliest`"),
        l("`processing.guarantee=exactly_once_v2`", "`processing.guarantee=exactly_once_v2`"),
        l("`num.standby.replicas=1`", "`num.standby.replicas=1`"),
        l("`retention.ms=-1`", "`retention.ms=-1`"),
      ],
      answer: 1,
      explain: l(
        "exactly_once_v2, işleme ve commit'i tek transaction'da yapar. Yarım kalan iş iptal edilir ve kayıtların etkisi tam bir kez görünür.",
        "exactly_once_v2 processes and commits in one transaction. Unfinished work is aborted, and each record's effect shows exactly once.",
      ),
      reviewStep: 8,
    },
  ],
};
