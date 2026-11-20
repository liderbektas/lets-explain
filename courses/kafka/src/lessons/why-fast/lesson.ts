import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { WhyFastScene } from "./Scene";

export const whyFast: Lesson = {
  slug: "why-fast",
  title: l("Kafka neden hızlı?", "Why Is Kafka Fast?"),
  summary: l(
    "Diske yazan bir sistem nasıl saniyede milyonlarca kaydı taşır: sıralı yazma, page cache, zero-copy, batch, sıkıştırma ve partition'lar.",
    "How a system that writes to disk moves millions of records a second: sequential writes, the page cache, zero-copy, batching, compression and partitions.",
  ),
  minutes: 11,
  level: l("Orta", "Intermediate"),
  Scene: WhyFastScene,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Sıralı yazmanın neden hızlı olduğunu görmek", "See why sequential writes are fast"), step: 1 },
    { text: l("Page cache'in okuma ve yazmayı nasıl hızlandırdığını anlamak", "Understand how the page cache speeds up reads and writes"), step: 2 },
    { text: l("Zero-copy ile verinin JVM'e girmeden gönderildiğini görmek", "See data sent without entering the JVM, with zero-copy"), step: 3 },
    { text: l("Batch ve sıkıştırmanın etkisini ölçmek", "Measure the effect of batching and compression"), step: 5 },
    { text: l("Partition'ların paralel okumayı nasıl sağladığını görmek", "See how partitions allow parallel reading"), step: 6 },
  ],
  steps: [
    {
      short: l("Merak", "The puzzle"),
      tag: "problem",
      title: l("Diske yazıyor, yine de çok hızlı", "It writes to disk, yet it is very fast"),
      body: [
        l(
          "Kafka her kaydı diske yazar ve günlerce saklar. \"Disk yavaştır\" diye öğrendik; yine de sıradan sunuculardan oluşan bir Kafka cluster'ı saniyede milyonlarca kaydı taşıyabilir.",
          "Kafka writes every record to disk and keeps it for days. We learned that \"disks are slow\", yet a Kafka cluster of ordinary servers can move millions of records a second.",
        ),
        l(
          "Bunun tek bir sihri yok; birkaç basit fikir üst üste biniyor. Sahnede yolun tamamını görüyorsun: producer, broker (bellekteki önbelleği ve diskiyle), partition bantları ve consumer'lar.",
          "There is no single trick; a few simple ideas stack up. The scene shows the whole road: the producer, the broker (with its memory cache and disk), the partition belts and the consumers.",
        ),
        l(
          "Üstteki sayaçlar bu küçük modelin sayıları: saniyede kaç kayıt yazılıyor, kaç istek gidiyor, ağ ne kadar dolu ve consumer'lar ne kadar okuyabiliyor.",
          "The counters on top are this small model's numbers: records written per second, requests sent, how full the network is, and how much the consumers can read.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu dersteki sayılar yuvarlak ve basit bir modelden geliyor: her kayıt 1 KB, ağ 100 MB/sn, her istek 1 ms bekliyor. Amaç her ayarın etkisini tek başına görmek, gerçek bir benchmark değil.",
            "This lesson's numbers come from a simple model with round values: every record is 1 KB, the network carries 100 MB/s, every request waits 1 ms. The point is to see each setting's effect on its own, not to benchmark.",
          ),
        },
      ],
    },
    {
      short: l("Sıralı yazma", "Sequential"),
      tag: "how",
      predict: {
        question: l(
          "Bir disk aynı miktarda veriyi iki şekilde yazabilir: hep sona ekleyerek ya da diskin rastgele yerlerine. Hangisi daha hızlı?",
          "A disk can write the same amount of data two ways: always appending at the end, or into random places. Which is faster?",
        ),
        options: [
          l("Rastgele yazmak, çünkü boş bir yer hemen bulunur", "Random, because a free spot is found right away"),
          l("Sıralı yazmak, hep sona eklemek", "Sequential: always appending at the end"),
          l("Fark etmez, veri miktarı aynı", "No difference: it is the same amount of data"),
        ],
        answer: 1,
        why: l(
          "Rastgele yazarken disk kafası her seferinde başka bir yere gitmek zorunda. Sona eklerken hiç beklemeden yazmaya devam eder. Fark yüzlerce kat olabilir.",
          "Writing at random, the disk head must travel somewhere else each time. Appending, it just keeps writing without waiting. The difference can be hundreds of times.",
        ),
      },
      title: l("Hep sona yazmak çok hızlıdır", "Always appending is very fast"),
      body: [
        l(
          "Soldaki disk her kaydı bir öncekinin hemen arkasına yazıyor; turuncu ok, yani disk kafası, sadece bir adım ilerliyor. Sağdaki disk her kayıtta başka bir yere zıplıyor.",
          "The disk on the left writes each record right after the previous one; the orange arrow, the disk head, moves just one step. The disk on the right jumps somewhere else for every record.",
        ),
        l(
          "Kafka'nın log'u sadece sona eklenir. Yani Kafka diske hep soldaki gibi yazar. Klasik bir döner diskte (HDD) bu, rastgele yazmaya göre yüzlerce kat hızlıdır.",
          "Kafka's log is append-only, so Kafka always writes like the disk on the left. On a classic spinning disk (HDD) that is hundreds of times faster than random writes.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "SSD'lerde fark daha küçüktür ama sıralı yazma yine öndedir ve diski daha az yıpratır. Okuma da aynı: consumer'lar log'u sırayla okuduğu için işletim sistemi sıradaki veriyi önceden okuyabilir (read-ahead).",
            "On SSDs the gap is smaller, but sequential writes still win and wear the disk less. Reads benefit too: consumers read the log in order, so the operating system can read ahead.",
          ),
        },
      ],
    },
    {
      short: l("Page cache", "Page cache"),
      tag: "how",
      predict: {
        question: l(
          "Bir consumer, birkaç saniye önce yazılmış bir kaydı okuyor. Broker bu kaydı büyük ihtimalle nereden verir?",
          "A consumer reads a record written a few seconds ago. Where does the broker most likely serve it from?",
        ),
        options: [
          l("Diskten okuyarak", "By reading it from disk"),
          l("İşletim sisteminin bellekteki önbelleğinden (page cache)", "From the operating system's memory cache (the page cache)"),
          l("Doğrudan producer'dan", "Straight from the producer"),
        ],
        answer: 1,
        why: l(
          "Yeni yazılan veri önce işletim sisteminin belleğine, page cache'e gider. Geride kalmayan bir consumer onu oradan, diske hiç dokunmadan okur.",
          "Newly written data goes into the operating system's memory, the page cache, first. A consumer that is not behind reads it from there without touching the disk.",
        ),
      },
      title: l("Yeni veri bellekten okunur", "New data is read from memory"),
      body: [
        l(
          "Kafka bir kaydı \"diske yazdığında\", kayıt önce işletim sisteminin bellekteki önbelleğine düşer: [[pageCache|page cache]]. İşletim sistemi onu biraz sonra, kendi uygun zamanında diske yazar.",
          "When Kafka \"writes a record to disk\", it first lands in the operating system's memory cache: the [[pageCache|page cache]]. The OS writes it to disk a little later, when it suits it.",
        ),
        l(
          "Çoğu consumer yazılandan çok geride değildir. Bu yüzden okudukları veri hâlâ bellekte durur ve disk hiç devreye girmez.",
          "Most consumers are not far behind the writes, so the data they read is still in memory and the disk never gets involved.",
        ),
        l(
          "Kafka bu önbelleği kendi tutmaz, işletim sistemine bırakır. Böylece broker yeniden başlasa bile önbellek sıcak kalır ve Java'nın çöp toplayıcısına yük olmaz.",
          "Kafka does not keep this cache itself; it leaves it to the operating system. So the cache stays warm even if the broker restarts, and it puts no load on Java's garbage collector.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka varsayılan olarak her kayıttan sonra diske \"hemen yaz\" (fsync) demez. Kayıtların güvenliği için replikasyona güvenir: aynı veri birkaç broker'da durur. Bunu replikasyon dersinde göreceğiz.",
            "By default Kafka does not force each record to disk (fsync). For safety it relies on replication: the same data sits on several brokers. The replication lesson covers this.",
          ),
        },
      ],
    },
    {
      short: l("Zero-copy", "Zero-copy"),
      tag: "how",
      predict: {
        question: l(
          "Broker bir kaydı consumer'a gönderirken veriyi kendi uygulama belleğine (JVM) kaç kez kopyalar?",
          "When the broker sends a record to a consumer, how many times does it copy the data into its own application memory (the JVM)?",
        ),
        options: [l("İki kez", "Twice"), l("Bir kez", "Once"), l("Hiç kopyalamaz", "Never")],
        answer: 2,
        why: l(
          "Kafka işletim sisteminin `sendfile` çağrısını kullanır: veri page cache'ten doğrudan ağ kartına gider, JVM'e hiç girmez. Buna zero-copy denir.",
          "Kafka uses the operating system's `sendfile` call: data goes straight from the page cache to the network card and never enters the JVM. This is called zero-copy.",
        ),
      },
      title: l("Zero-copy: veri uygulamaya hiç girmez", "Zero-copy: data never enters the application"),
      body: [
        l(
          "Klasik bir sunucu dosyadan veri gönderirken gri yolu izler: disk → page cache → uygulamanın belleği → socket buffer → ağ kartı. Ortadaki adımlarda veri işlemci tarafından kopyalanır.",
          "A classic server sending data from a file follows the grey path: disk → page cache → application memory → socket buffer → network card. In the middle steps the CPU copies the data.",
        ),
        l(
          "Kafka yeşil yolu kullanır. Diskte duran veri ile consumer'a giden veri aynı biçimdedir, yani Kafka'nın veriyi açıp değiştirmesi gerekmez. Bu yüzden işletim sistemine \"bu dosyanın şu kısmını şu bağlantıya gönder\" der ve gerisine karışmaz.",
          "Kafka takes the green path. The data on disk and the data sent to consumers are in the same format, so Kafka never needs to open or change it. It tells the OS \"send this part of this file to that connection\" and stays out of the way.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bağlantı TLS (SSL) ile şifreliyse zero-copy kullanılamaz, çünkü veri gönderilmeden önce uygulama içinde şifrelenmelidir. Yine de Kafka TLS ile de hızlıdır, ama biraz daha fazla işlemci harcar.",
            "If the connection uses TLS (SSL), zero-copy cannot be used, because the data must be encrypted inside the application before it is sent. Kafka is still fast with TLS, at the cost of some extra CPU.",
          ),
        },
      ],
    },
    {
      short: l("Batch", "Batching"),
      tag: "experiment",
      predict: {
        question: l(
          "Producer 1.000 kaydı tek tek değil, 100'lük paketler hâlinde gönderiyor. Kaç istek yapar?",
          "The producer sends 1,000 records not one by one but in packs of 100. How many requests does it make?",
        ),
        options: [l("1.000", "1,000"), l("100", "100"), l("10", "10")],
        answer: 2,
        why: l(
          "1.000 ÷ 100 = 10 istek. Her isteğin sabit bir bekleme maliyeti var; paketlemek bu maliyeti 100 kayıt arasında paylaştırır.",
          "1,000 ÷ 100 = 10 requests. Every request has a fixed waiting cost; packing shares that cost among 100 records.",
        ),
      },
      title: l("Kayıtları paketlemek: batch", "Packing records together: batching"),
      body: [
        l(
          "Başta her kayıt kendi isteğiyle gidiyordu. Her istek gidip gelirken 1 ms bekliyor, bu yüzden 8 partition'la bile saniyede sadece 7.920 kayıt yazılabiliyordu.",
          "At first every record travelled in its own request. Each request waits 1 ms for the round trip, so even with 8 partitions only 7,920 records a second could be written.",
        ),
        l(
          "Producer'ı 100 kaydı bir [[batch]]'te gönderecek şekilde ayarladık. Bekleme süresi artık 100 kayda bölünüyor ve yazma hızı 100.000'e çıktı. Şimdi sınır ağ: 100 MB/sn doldu.",
          "We set the producer to send 100 records per [[batch]]. The wait is now split across 100 records, and writes jumped to 100,000 a second. Now the limit is the network: 100 MB/s is full.",
        ),
        l(
          "Broker da batch'i olduğu gibi diske yazar ve consumer'a da batch olarak gönderir. Yol boyunca her şey paketler hâlinde akar.",
          "The broker also writes the batch to disk as it is and sends it to consumers as a batch. Everything flows in packs along the way.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Batch boyutunu iki ayar belirler: `batch.size` (varsayılan 16 KB) bir paketin en fazla ne kadar büyüyeceğini, `linger.ms` (Kafka 4.0'dan beri varsayılan 5 ms) dolmasını en fazla ne kadar bekleyeceğini söyler.",
            "Two settings shape a batch: `batch.size` (16 KB by default) caps how big a pack grows, and `linger.ms` (5 ms by default since Kafka 4.0) caps how long to wait for it to fill.",
          ),
        },
      ],
    },
    {
      short: l("Sıkıştırma", "Compression"),
      tag: "experiment",
      changes: [
        { kind: "change", text: l("Sıkıştırma: yok → lz4", "Compression: none → lz4") },
        { kind: "good", text: l("Her kayıt ağda yarı yer kaplıyor", "Each record takes half the space on the network") },
        { kind: "good", text: l("Yazma hızı: 100.000 → 200.000 /sn", "Writes: 100,000 → 200,000 /s") },
      ],
      title: l("Batch'i sıkıştırmak", "Compressing the batch"),
      body: [
        l(
          "Ağ doluydu: 100 MB/sn'den fazla veri geçmiyor. Producer'a batch'leri `lz4` ile sıkıştırmasını söyledik. Koliler küçüldü (mavi) ve aynı ağdan iki kat kayıt geçmeye başladı.",
          "The network was full: no more than 100 MB/s gets through. We told the producer to compress batches with `lz4`. The parcels shrank (blue) and twice as many records began to fit through the same network.",
        ),
        l(
          "Sıkıştırma kayıt kayıt değil, bütün batch üzerinde yapılır. Benzer kayıtlar bir arada olduğu için çok daha iyi sıkışır.",
          "Compression works on the whole batch, not record by record. Similar records sitting together compress much better.",
        ),
        l(
          "Broker batch'i açmaz; sıkıştırılmış hâliyle diske yazar ve consumer'a da öyle gönderir. Açma işini consumer yapar. Diskte de daha az yer kaplar.",
          "The broker does not unpack the batch: it writes it to disk compressed and sends it to consumers that way. The consumer does the unpacking. It takes less disk space too.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka'nın desteklediği sıkıştırmalar: `gzip`, `snappy`, `lz4` ve `zstd`. Producer'da varsayılan `none`. Gerçek sıkıştırma oranı verine bağlıdır; JSON gibi tekrar eden metinler çok iyi sıkışır.",
            "Kafka supports `gzip`, `snappy`, `lz4` and `zstd`. The producer default is `none`. The real ratio depends on your data; repetitive text such as JSON compresses very well.",
          ),
        },
      ],
    },
    {
      short: l("Partition'lar", "Partitions"),
      tag: "experiment",
      predict: {
        question: l(
          "Tek bir consumer saniyede 25.000 kayıt işleyebiliyor ve geride kalıyor. Topic'i 4 partition'a çıkarıp aynı group'a 5 consumer koyacağız. Kaç consumer iş yapar?",
          "One consumer handles 25,000 records a second and falls behind. We will raise the topic to 4 partitions and put 5 consumers in the same group. How many consumers do work?",
        ),
        options: [
          l("5, iş eşit bölünür", "5: the work is split evenly"),
          l("4; biri boşta bekler", "4; one sits idle"),
          l("1; diğerleri yedekte bekler", "1; the others wait as backups"),
        ],
        answer: 1,
        why: l(
          "Bir group içinde her partition'ı tek bir consumer okur. 4 partition varsa en fazla 4 consumer çalışır; beşinci boşta kalır.",
          "Within a group, each partition is read by a single consumer. With 4 partitions, at most 4 consumers work; the fifth sits idle.",
        ),
      },
      title: l("Partition'lar paralellik demektir", "Partitions mean parallelism"),
      body: [
        l(
          "Tek partition ve tek consumer ile yazma saniyede 50.000, okuma ise sadece 25.000'di; consumer her saniye biraz daha geride kalıyordu.",
          "With one partition and one consumer, writes ran at 50,000 a second but reads at only 25,000; the consumer fell further behind every second.",
        ),
        l(
          "Topic'i 4 partition'a çıkardık ve group'a 5 consumer koyduk. Her partition'ı bir consumer okuyor; okuma 100.000'e çıktı ve yazmaya yetişiyor. Beşinci consumer'a partition kalmadı, boşta bekliyor.",
          "We raised the topic to 4 partitions and put 5 consumers in the group. Each partition is read by one consumer; reads rose to 100,000 and keep up with writes. The fifth consumer got no partition and sits idle.",
        ),
        l(
          "Partition'lar farklı broker'lara da dağılabilir. Böylece yazma ve okuma tek bir makinenin sınırına takılmaz.",
          "Partitions can also be spread over different brokers, so writes and reads are not stuck with one machine's limits.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir topic'in partition sayısı, bir group'ta aynı anda çalışabilecek consumer sayısının üst sınırıdır. Ölçeklemeyi düşünürken partition sayısını buna göre seç.",
            "A topic's partition count is the upper limit on how many consumers in a group can work at once. Pick it with your scaling plans in mind.",
          ),
        },
      ],
    },
    {
      short: l("Bedeli", "The trade-offs"),
      tag: "reality",
      title: l("Her hızlandırmanın bir bedeli var", "Every speed-up has a cost"),
      body: [
        l(
          "Sahnede her şey açık: 1.000'lik batch'ler, lz4 ve 8 partition. Ama gerçekte bu ayarlar bedava değildir.",
          "The scene has everything turned up: batches of 1,000, lz4 and 8 partitions. In reality these settings are not free.",
        ),
        l(
          "**Büyük batch** daha çok bekleme demektir: kayıt, paket dolana kadar (`linger.ms`) producer'da durur, yani gecikme artar. **Sıkıştırma** producer'da ve consumer'da işlemci harcar. **Çok partition** daha çok dosya, daha çok bağlantı ve daha uzun rebalance demektir.",
          "**Big batches** mean more waiting: a record sits in the producer until the pack fills (`linger.ms`), so latency grows. **Compression** costs CPU on the producer and the consumer. **Many partitions** mean more files, more connections and longer rebalances.",
        ),
        l(
          "Kafka'nın gücü, bu dengeyi kendi ihtiyacına göre kurabilmen: düşük gecikme mi, yüksek hacim mi?",
          "Kafka's strength is that you can set this balance for your own needs: low latency, or high volume?",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda `events` hattının projesi var: producer ayarları `producer.properties`'te (`batch.size` bayt cinsinden, kayıtlar 1 KB; `compression.type`). Partition'ları `kafka-topics.sh --alter` ile, consumer sayısını `docker compose up -d --scale processor=N` ile değiştirirsin.",
          "Your turn. Below is the `events` pipeline's project: the producer settings are in `producer.properties` (`batch.size` in bytes, records are 1 KB; `compression.type`). Change the partitions with `kafka-topics.sh --alter` and the number of consumers with `docker compose up -d --scale processor=N`.",
        ),
        l(
          "Ölçmek için Kafka'nın kendi aracını kullan: `kafka-producer-perf-test.sh ... --producer.config producer.properties`. Sahne son ölçtüğün düzeni gösterir. **4 senaryo** var; az komutla bitirirsen 3 yıldız.",
          "Measure with Kafka's own tool: `kafka-producer-perf-test.sh ... --producer.config producer.properties`. The scene shows the last setup you measured. There are **4 scenarios**; few commands earn 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bu bir benchmark değil, sayılar bilerek yuvarlak. Tam yükte batch'ler `linger.ms` olmadan da dolar; trafik azken `linger.ms` onların dolmasını bekler.",
            "This is not a benchmark: the numbers are round on purpose. Under full load batches fill without `linger.ms`; with light traffic `linger.ms` waits for them to fill.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Kafka diske hep sona ekleyerek yazar; sıralı yazma rastgele yazmadan kat kat hızlıdır.",
      "Kafka always appends to disk, and sequential writes are many times faster than random ones.",
    ),
    l(
      "Yeni yazılan veri işletim sisteminin page cache'inde durur; geride kalmayan consumer'lar onu bellekten okur.",
      "Newly written data sits in the OS page cache, and consumers that keep up read it from memory.",
    ),
    l(
      "Zero-copy (`sendfile`) ile veri page cache'ten doğrudan ağa gider, uygulamanın belleğine hiç girmez.",
      "With zero-copy (`sendfile`), data goes from the page cache straight to the network, never entering the application's memory.",
    ),
    l(
      "Batch'ler istek başına bekleme maliyetini birçok kayıt arasında paylaştırır; sıkıştırma bütün batch'i küçültür.",
      "Batches share each request's waiting cost among many records, and compression shrinks the whole batch.",
    ),
    l(
      "Partition'lar paralellik sağlar: bir group'ta en fazla partition sayısı kadar consumer çalışır.",
      "Partitions give parallelism: in a group, at most as many consumers work as there are partitions.",
    ),
    l(
      "Her hızlandırmanın bir bedeli vardır: gecikme, işlemci ya da yönetim yükü.",
      "Every speed-up has a cost: latency, CPU, or operational load.",
    ),
  ],
  quiz: [
    {
      question: l("Kafka'nın log'u diske neden hızlı yazılır?", "Why is Kafka's log fast to write to disk?"),
      options: [
        l("Her kaydı ayrı bir dosyaya yazdığı için", "Because it writes each record to its own file"),
        l("Sadece sona eklediği için yazma sıralıdır", "Because it only appends, so writes are sequential"),
        l("Veriyi hiç diske yazmadığı için", "Because it never writes data to disk"),
        l("Rastgele yerlere dağıttığı için", "Because it spreads data to random places"),
      ],
      answer: 1,
      explain: l(
        "Log sadece sona eklenir; disk kafası zıplamadan yazmaya devam eder.",
        "The log is append-only, so the disk keeps writing without jumping around.",
      ),
      reviewStep: 1,
    },
    {
      question: l(
        "Producer saniyede 40.000 kaydı 200'lük batch'lerle gönderiyor. Saniyede kaç istek yapar?",
        "The producer sends 40,000 records a second in batches of 200. How many requests a second?",
      ),
      options: [l("40.000", "40,000"), l("2.000", "2,000"), l("200", "200"), l("20", "20")],
      answer: 2,
      explain: l("40.000 ÷ 200 = 200 istek.", "40,000 ÷ 200 = 200 requests."),
      reviewStep: 4,
    },
    {
      question: l(
        "6 partition'lı bir topic'i aynı group'taki 10 consumer okuyor. Kaç consumer iş yapar?",
        "10 consumers in the same group read a topic with 6 partitions. How many do work?",
      ),
      options: [l("10", "10"), l("6", "6"), l("1", "1"), l("5", "5")],
      answer: 1,
      explain: l(
        "Her partition'ı group'tan tek bir consumer okur. 6 partition varsa 6 consumer çalışır, 4'ü boşta kalır.",
        "Each partition is read by one consumer in the group. With 6 partitions, 6 work and 4 sit idle.",
      ),
      reviewStep: 6,
    },
    {
      question: l("Zero-copy hangi durumda kullanılamaz?", "When can zero-copy not be used?"),
      options: [
        l("Consumer geride kaldığında", "When the consumer is behind"),
        l("Bağlantı TLS ile şifrelendiğinde", "When the connection is encrypted with TLS"),
        l("Batch boyutu büyük olduğunda", "When the batch size is large"),
        l("Topic'te birden çok partition olduğunda", "When the topic has several partitions"),
      ],
      answer: 1,
      explain: l(
        "TLS'te veri gönderilmeden önce uygulama içinde şifrelenmelidir, bu yüzden doğrudan dosyadan ağa gönderilemez.",
        "With TLS the data must be encrypted inside the application before sending, so it cannot go straight from the file to the network.",
      ),
      reviewStep: 3,
    },
  ],
};
