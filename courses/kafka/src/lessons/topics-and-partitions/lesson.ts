import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, TopicsAndPartitionsScene } from "./Scene";

export const topicsAndPartitions: Lesson = {
  slug: "topics-and-partitions",
  title: l("Topic ve Partition", "Topics & Partitions"),
  summary: l(
    "Bir topic'i partition'lara bölmek: yükü paylaştırmak, aynı anda okumak ve sıranın nerede bittiğini görmek.",
    "Splitting a topic into partitions: sharing the load, reading in parallel, and seeing where ordering ends.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: TopicsAndPartitionsScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Topic ile partition arasındaki farkı görmek", "See the difference between a topic and a partition"), step: 0 },
    { text: l("Tek partition'ın neden darboğaz olduğunu anlamak", "Understand why one partition is a bottleneck"), step: 1 },
    { text: l("Her partition'ın kendi offset'lerini saydığını görmek", "See that every partition counts its own offsets"), step: 3 },
    { text: l("Sıranın sadece partition içinde garanti olduğunu öğrenmek", "Learn that order is guaranteed only within a partition"), step: 4 },
    { text: l("Partition sayısının okuma paralelliğini nasıl sınırladığını görmek", "See how the partition count limits parallel reading"), step: 7 },
  ],
  steps: [
    {
      short: l("Topic", "Topic"),
      tag: "how",
      title: l("Topic: event'lerin isimli adresi", "A topic: the named home of events"),
      body: [
        l(
          "Önceki derste tek bir log vardı. Gerçek bir sistemde siparişler, ödemeler, kargolar gibi farklı türde event'ler olur. Kafka her tür için ayrı, isimli bir log tutar ve buna [[topic]] der.",
          "Last lesson had a single log. A real system has many kinds of events: orders, payments, shipments. Kafka keeps a separate, named log for each kind and calls it a [[topic]].",
        ),
        l(
          "Burada `orders` adında bir topic var. Sipariş servisi üç sipariş yazdı. Bandın solundaki **P0** etiketi bir şeyi daha söylüyor: bu bant topic'in kendisi değil, topic'in ilk ve şimdilik tek [[partition]]'ı.",
          "Here is a topic called `orders`. The order service wrote three orders. The **P0** tag at the left of the belt says one more thing: this belt is not the topic itself but the topic's first, and so far only, [[partition]].",
        ),
        l(
          "Bir topic bir ya da daha fazla partition'dan oluşur. Her partition, önceki dersteki gibi sadece sonuna yazılan sıralı bir log'dur.",
          "A topic is made of one or more partitions. Each partition is an ordered, append-only log, just like in the last lesson.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Topic bir otoyolun adı, partition'lar onun şeritleri gibi. Herkes \"E-5'ten git\" der ama araçlar farklı şeritlerde ilerler.",
            "A topic is like a highway's name and partitions are its lanes. Everyone says \"take the E-5\", but cars move along different lanes.",
          ),
        },
      ],
    },
    {
      short: l("Tek şerit", "One lane"),
      tag: "problem",
      title: l("Tek şerit, tek okuyucu", "One lane, one reader"),
      body: [
        l(
          "Fatura servisi okumaya başladı ama siparişler okuduğundan hızlı geliyor. İki sipariş okuyabildi, bu sırada dört yenisi geldi. Bekleyen kayıt sayısı ([[lag]]) büyüyor.",
          "The billing service started reading, but orders arrive faster than it reads. It managed two while four more came in. The number of waiting records ([[lag]]) keeps growing.",
        ),
        l(
          "\"İkinci bir Fatura okuyucusu çalıştıralım\" diye düşünebilirsin. Ama Kafka'nın bir kuralı var: aynı group içinde bir partition'ı **aynı anda sadece bir okuyucu** okuyabilir. Tek partition, en fazla bir okuyucu demek.",
          "You might think \"let's run a second billing reader\". But Kafka has a rule: within one group, a partition is read by **only one reader at a time**. One partition means at most one reader.",
        ),
        l(
          "Yani tek partition'lı bir topic, ne kadar okuyucu eklersen ekle, bir okuyucunun hızına takılır.",
          "So a topic with a single partition is stuck at the speed of one reader, however many readers you add.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu kural consumer group'lar içindir; group'ları iki ders sonra ayrıntılı göreceğiz. Kafka 4.0 ile erken erişim olarak gelen share group'lar (KIP-932) bir partition'ı birden çok okuyucuya paylaştırabiliyor; ona kuyruklar dersinde değineceğiz.",
            "This rule is for consumer groups, which get their own lesson two lessons from now. Share groups, in early access since Kafka 4.0 (KIP-932), can split one partition across several readers; the queues lesson touches on them.",
          ),
        },
      ],
    },
    {
      short: l("Bölmek", "Splitting"),
      tag: "idea",
      predict: {
        question: l(
          "`orders` topic'i 1 partition'dan 3'e çıkarılacak. P0'da duran 7 kayda ne olacak?",
          "The `orders` topic will grow from 1 partition to 3. What happens to the 7 records in P0?",
        ),
        options: [
          l("3 partition'a eşit olarak dağıtılacak", "They are spread evenly over the 3 partitions"),
          l("P0'da kalacak; yeni partition'lar boş başlayacak", "They stay in P0; the new partitions start empty"),
          l("Silinecek, topic baştan başlayacak", "They are deleted and the topic starts over"),
        ],
        answer: 1,
        why: l(
          "Kafka var olan kayıtlara dokunmaz: kayıtlar değiştirilmez ve taşınmaz. Yeni partition'lar boş başlar ve sadece bundan sonra yazılanları alır.",
          "Kafka never touches existing records: they are not changed and not moved. New partitions start empty and only get what is written from now on.",
        ),
      },
      title: l("Topic'i partition'lara bölmek", "Splitting the topic into partitions"),
      body: [
        l(
          "Çözüm topic'i bölmek: `orders` artık 3 partition'lı. Sahnede P1 ve P2 adında iki yeni bant belirdi.",
          "The fix is to split the topic: `orders` now has 3 partitions. Two new belts, P1 and P2, appear on the stage.",
        ),
        l(
          "P0'daki 7 kayıt olduğu yerde kaldı. Yeni partition'lar boş başladı. Kafka kayıtları değiştirmediği gibi partition'lar arasında taşımaz da.",
          "The 7 records in P0 stayed where they were. The new partitions started empty. Just as Kafka never changes records, it never moves them between partitions either.",
        ),
        l(
          "Fatura'nın şimdilik tek okuyucusu olduğu için üç partition'ın üçü de ona verildi. Okuyucu her partition'a ayrı bir bayrak dikiyor.",
          "Billing has only one reader so far, so all three partitions went to it. The reader plants a separate flag on each partition.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Partition sayısı topic oluşturulurken verilir; sonradan `kafka-topics.sh --alter --partitions` ile artırılabilir. Azaltmak mümkün değildir: daha az partition için yeni bir topic açıp veriyi oraya kopyalamak gerekir.",
            "The partition count is set when the topic is created and can be raised later with `kafka-topics.sh --alter --partitions`. It can never be lowered: for fewer partitions you create a new topic and copy the data over.",
          ),
        },
      ],
    },
    {
      short: l("Kendi offset'i", "Own offsets"),
      tag: "how",
      predict: {
        question: l(
          "Şimdi key'siz 6 sipariş yazılacak ve partition'lara sırayla dağılacak. P1'e düşen ilk kaydın offset'i kaç olacak?",
          "Now 6 orders without a key will be written and spread over the partitions in turn. What offset will the first record in P1 get?",
        ),
        options: [
          l("7, çünkü P0 6'da kalmıştı", "7, because P0 was at 6"),
          l("0, çünkü her partition kendi sayacını tutar", "0, because every partition keeps its own counter"),
          l("1", "1"),
        ],
        answer: 1,
        why: l(
          "Offset'ler partition başına sayılır. P1 boş başladığı için ilk kaydı offset 0 olur, P0'nun numaralarıyla hiçbir ilgisi yoktur.",
          "Offsets are counted per partition. P1 started empty, so its first record gets offset 0, unrelated to P0's numbers.",
        ),
      },
      title: l("Her partition kendi numarasını sayar", "Every partition counts on its own"),
      body: [
        l(
          "Altı yeni sipariş geldi. Hiçbirinin [[key|key]]'i olmadığı için Kafka onları partition'lara sırayla dağıttı: P1, P2, P0, P1, P2, P0.",
          "Six new orders arrived. None has a [[key]], so Kafka spread them over the partitions in turn: P1, P2, P0, P1, P2, P0.",
        ),
        l(
          "P1 ve P2'deki numaralara bak: ikisi de 0'dan başladı. P0 ise kaldığı yerden, 7'den devam etti. Her partition'ın kendi sayacı var.",
          "Look at the numbers in P1 and P2: both started at 0. P0 carried on from where it was, at 7. Each partition has its own counter.",
        ),
        l(
          "Bu yüzden bir kaydın tam adresi \"offset 1\" değil, **\"P2'deki offset 1\"** olur. Kafka araçları bunu `orders-2@1` gibi yazar.",
          "So a record's full address is not \"offset 1\" but **\"offset 1 in P2\"**. Kafka tools print it like `orders-2@1`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada key'siz kayıtlar tek tek sırayla dağılıyor ki takip edebilesin. Gerçek producer (Kafka 3.3'ten beri, KIP-794) bir partition için bir batch doldurur, sonra başka bir partition'a geçer ve daha az yüklü partition'ları tercih eder. Uzun vadede dağılım yine dengelidir.",
            "Here keyless records go one by one in turn so you can follow along. A real producer (since Kafka 3.3, KIP-794) fills a batch for one partition, then moves to another, preferring less loaded ones. Over time the spread is still even.",
          ),
        },
      ],
    },
    {
      short: l("Sıra nerede?", "Where's order?"),
      tag: "how",
      predict: {
        question: l(
          "Fatura P0'da geride kaldı, P1 ve P2'de ise yeni kayıtlar var. P2'ye en son yazılan sipariş, P0'da bekleyen daha eski siparişlerden önce okunabilir mi?",
          "Billing is behind on P0, while P1 and P2 have new records. Can the order written last to P2 be read before older orders still waiting in P0?",
        ),
        options: [
          l("Hayır, Kafka siparişleri her zaman yazıldığı sırayla verir", "No, Kafka always hands out orders in the order they were written"),
          l("Evet, sıra sadece bir partition'ın içinde garanti", "Yes, order is only guaranteed inside one partition"),
          l("P2 hiç okunmaz, önce P0 bitmeli", "P2 is never read until P0 is done"),
        ],
        answer: 1,
        why: l(
          "Kafka her partition'ı kendi içinde sıralı tutar ama partition'lar arasında ortak bir sıra yoktur. Okuyucu her partition'da kendi konumundan ilerler.",
          "Kafka keeps each partition in order, but there is no shared order across partitions. The reader moves forward on each partition from its own position.",
        ),
      },
      title: l("Sıra sadece partition içinde", "Order only exists within a partition"),
      body: [
        l(
          "Fatura iki kez okudu. Her seferinde her partition'dan bir kayıt aldı: P0'dan 2 ve 3'ü, P1'den 0 ve 1'i, P2'den 0 ve 1'i.",
          "Billing read twice. Each time it took one record from each partition: 2 and 3 from P0, 0 and 1 from P1, 0 and 1 from P2.",
        ),
        l(
          "P2'nin offset 1'i birkaç saniye önce yazıldı ve **okundu**. P0'nun offset 4'ü çok daha önce yazıldı ama hâlâ bekliyor. Topic'in tamamında \"yazılış sırası\" diye bir şey yok.",
          "P2's offset 1 was written seconds ago and is **already read**. P0's offset 4 was written much earlier and is still waiting. Across the whole topic, there is no \"order of writing\".",
        ),
        l(
          "Kafka'nın sözü şu: **aynı partition'daki** kayıtlar her okuyucuya yazıldıkları sırayla gelir. Hangi kayıtların birbirine göre sıralı olması gerektiğini seçmenin yolu, onları aynı partition'a yazmaktır. Bunu bir sonraki derste key'lerle yapacağız.",
          "Kafka's promise is this: records **in the same partition** reach every reader in the order they were written. The way to keep certain records in order relative to each other is to write them to the same partition. The next lesson does that with keys.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada okuyucu partition'ları sırayla dolaşıyor. Gerçek consumer birçok partition'dan aynı anda veri çeker; hangisinin önce geleceği ağ ve broker hızına bağlıdır. Sonuç aynı: partition'lar arasında sıra yok.",
            "Here the reader visits the partitions in turn. A real consumer fetches from many partitions at once, and which arrives first depends on network and broker speed. The result is the same: no order across partitions.",
          ),
        },
      ],
    },
    {
      short: l("Paralel", "Parallel"),
      tag: "idea",
      predict: {
        question: l(
          "Fatura group'una 2 okuyucu daha katılacak. 3 partition 3 okuyucu arasında nasıl paylaşılır?",
          "Two more readers will join the billing group. How are 3 partitions shared among 3 readers?",
        ),
        options: [
          l("Her okuyucu üç partition'ın hepsini okur", "Each reader reads all three partitions"),
          l("Her okuyucuya bir partition düşer", "Each reader gets one partition"),
          l("İlk okuyucu hepsini tutar, diğerleri bekler", "The first reader keeps them all; the others wait"),
        ],
        answer: 1,
        why: l(
          "Group içinde her partition tek bir okuyucuya verilir. 3 partition ve 3 okuyucu varsa her birine bir tane düşer ve üçü aynı anda çalışır.",
          "Within a group every partition goes to exactly one reader. With 3 partitions and 3 readers, each gets one and all three work at once.",
        ),
      },
      title: l("Üç partition, üç okuyucu, aynı anda", "Three partitions, three readers, at once"),
      body: [
        l(
          "Altı sipariş daha geldi, sonra Fatura 2 ve Fatura 3 group'a katıldı. Kafka partition'ları yeniden paylaştırdı: her okuyucu artık bir partition'dan sorumlu.",
          "Six more orders arrived, then Billing 2 and Billing 3 joined the group. Kafka shared the partitions out again: each reader is now responsible for one partition.",
        ),
        l(
          "Üçü de aynı anda ikişer kayıt okudu. Tek okuyucunun sırayla yapacağı işi üç okuyucu paralel yaptı. Bu, partition'ların asıl gücü: yazma ve okuma işi parçalara bölünüp aynı anda yürür.",
          "All three read two records each, at the same time. Work a single reader would do one after another, three readers did in parallel. That is the real power of partitions: the writing and reading work is cut into pieces that run at once.",
        ),
        l(
          "Okuyucular kaldıkları yeri commit ettikleri için yeniden paylaştırma sırasında hiçbir kayıt ikinci kez okunmadı.",
          "The readers had committed their positions, so no record was read twice while the partitions were shared out again.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Partition'ların yeniden paylaştırılmasına rebalance denir. Ne zaman ve nasıl olduğunu consumer group dersinde ayrıntılı göreceğiz.",
            "Sharing partitions out again is called a rebalance. The consumer group lesson shows when and how it happens.",
          ),
        },
      ],
    },
    {
      short: l("Broker'lar", "Brokers"),
      tag: "reality",
      title: l("Partition'lar broker'lara dağılır", "Partitions are spread over brokers"),
      body: [
        l(
          "Bu bölmenin bir faydası daha var. Kafka bir sunucu değil, birlikte çalışan sunuculardan oluşan bir cluster'dır. Her sunucuya [[broker]] denir.",
          "Splitting has one more benefit. Kafka is not one server but a cluster of servers working together. Each server is called a [[broker]].",
        ),
        l(
          "Etiketlere bak: P0 broker 1'de, P1 broker 2'de, P2 broker 3'te (B1, B2, B3). Her partition'ın yazma ve okuma işini kendi broker'ı yapar. Buna o partition'ın [[leader]]'ı denir.",
          "Look at the tags: P0 is on broker 1, P1 on broker 2, P2 on broker 3 (B1, B2, B3). Each partition's writes and reads are handled by its own broker, called that partition's [[leader]].",
        ),
        l(
          "Böylece tek bir topic tek bir makinenin diskine ve ağına sığmak zorunda kalmaz. Broker ekledikçe topic'in taşıyabileceği yük de büyür.",
          "So one topic never has to fit on one machine's disk and network. As you add brokers, the load a topic can carry grows too.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte her partition'ın başka broker'larda kopyaları da (replica) bulunur; leader'ın broker'ı çökerse bir kopya leader olur. Bunu Güvenilirlik bölümünde göreceğiz.",
            "In reality each partition also has copies (replicas) on other brokers; if the leader's broker fails, a copy takes over as leader. The Reliability chapter covers this.",
          ),
        },
      ],
    },
    {
      short: l("Sınır", "The limit"),
      tag: "reality",
      predict: {
        question: l(
          "3 partition'lı topic'i okuyan Fatura group'una 4. bir okuyucu katılacak. Ne olacak?",
          "A 4th reader will join the billing group, which reads a 3-partition topic. What happens?",
        ),
        options: [
          l("Bir partition'ı ikiye bölüp bir yarısını alır", "It splits one partition and takes half"),
          l("Hiç partition alamaz ve boşta bekler", "It gets no partition and waits idle"),
          l("En yavaş okuyucuya yardım eder, aynı partition'ı birlikte okurlar", "It helps the slowest reader; they read the same partition together"),
        ],
        answer: 1,
        why: l(
          "Bir partition group içinde tek okuyucuya verilir ve bölünmez. 3 partition varsa en fazla 3 okuyucu çalışır; fazlası boşta yedek olarak bekler.",
          "A partition goes to a single reader in the group and is never split. With 3 partitions at most 3 readers work; the rest wait idle as spares.",
        ),
      },
      title: l("Partition sayısı paralelliğin sınırıdır", "The partition count is the limit on parallelism"),
      body: [
        l(
          "Fatura 4 group'a katıldı ama paylaşılacak partition kalmadı. Okumaya çalıştı ve hiçbir şey alamadı. Şimdilik boşta, ancak biri ayrılırsa ya da çökerse onun işini devralabilir.",
          "Billing 4 joined the group, but there was no partition left to share. It tried to read and got nothing. For now it is idle, though it can take over if someone leaves or crashes.",
        ),
        l(
          "Bu yüzden partition sayısını seçmek önemli bir karardır. Bir group'ta aynı anda çalışabilecek en fazla okuyucu sayısı, topic'in partition sayısı kadardır.",
          "That makes choosing the partition count an important decision. The most readers that can work at once in a group equals the topic's number of partitions.",
        ),
        l(
          "Çok partition da bedavaya gelmez: her biri diskte ayrı dosyalar, broker'da bellek, çökmelerde ayrı bir leader seçimi ve daha uzun rebalance'lar demektir. Genelde beklenen en yüksek okuyucu sayısına ve yük hedefine göre seçilir.",
          "Many partitions are not free either: each one means separate files on disk, memory on the broker, its own leader election on failures and longer rebalances. It is usually chosen for the highest expected reader count and throughput target.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Otomatik oluşturulan topic'lerin varsayılan partition sayısı `num.partitions` ayarından gelir ve varsayılanı 1'dir. Partition eklemek sonradan mümkündür ama key'li kayıtların hangi partition'a düştüğünü değiştirir; bunu bir sonraki derste göreceğiz.",
            "Auto-created topics get their partition count from `num.partitions`, which defaults to 1. Adding partitions later is possible but changes which partition keyed records land in; the next lesson shows this.",
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
          "Bu sefer topic tek partition'la ve tek okuyucuyla başlıyor. P0'da henüz okunmamış 4 sipariş var.",
          "This time the topic starts with one partition and one reader. P0 holds 4 orders nobody has read yet.",
        ),
        l(
          "Düğmelerle key'siz sipariş yazabilir, partition ekleyebilir (en fazla 4), Fatura group'una okuyucu ekleyip çıkarabilir ve **\"Herkes 1 okusun\"** ile bir tur okutabilirsin. Bir turda her okuyucu en fazla bir kayıt okur ve commit eder.",
          "With the buttons you can write keyless orders, add partitions (up to 4), add and remove billing readers, and run a round with **\"Everyone reads 1\"**. In one round each reader reads at most one record and commits.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Ne kadar az hamleyle bitirirsen o kadar çok yıldız alırsın.",
          "There are **3 missions** under the scene. The fewer moves you use, the more stars you get.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sağ alttaki olay listesi her düğmeden sonra hangi kaydın hangi partition'a gittiğini ve rebalance'ta kimin neyi aldığını yazar.",
            "The event list at the bottom right shows which partition each record went to and who got what in each rebalance.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Bir [[topic]], bir ya da daha fazla [[partition]]'dan oluşur. Her partition kendi başına sıralı, sadece sonuna yazılan bir log'dur.",
      "A [[topic]] is made of one or more [[partition|partitions]]. Each partition is an ordered, append-only log of its own.",
    ),
    l(
      "Her partition offset'lerini 0'dan ayrı sayar. Bir kaydın tam adresi partition + offset'tir.",
      "Each partition counts its offsets from 0 on its own. A record's full address is partition + offset.",
    ),
    l(
      "Sıra sadece bir partition'ın içinde garanti edilir; topic'in tamamında ortak bir sıra yoktur.",
      "Order is guaranteed only within a partition; there is no shared order across the topic.",
    ),
    l(
      "Bir group içinde her partition'ı tek bir okuyucu okur. Partition sayısı, aynı anda çalışabilecek okuyucu sayısının sınırıdır.",
      "Within a group each partition is read by one reader. The partition count caps how many readers can work at once.",
    ),
    l(
      "Partition'lar broker'lara dağılır, böylece bir topic tek makineye sığmak zorunda kalmaz.",
      "Partitions are spread over brokers, so a topic never has to fit on one machine.",
    ),
    l(
      "Partition eklenebilir ama çıkarılamaz. Eklemek eski kayıtları taşımaz; yeni partition'lar boş başlar.",
      "Partitions can be added but never removed. Adding them moves no old records; new partitions start empty.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir topic'in 4 partition'ı var. Onu okuyan consumer group'ta 6 okuyucu çalışıyor. Kaç okuyucu kayıt okuyabilir?",
        "A topic has 4 partitions. The consumer group reading it runs 6 readers. How many readers can read records?",
      ),
      options: [l("6", "6"), l("4; 2'si boşta bekler", "4; 2 wait idle"), l("1", "1"), l("24", "24")],
      answer: 1,
      explain: l(
        "Group içinde her partition tek okuyucuya verilir. 4 partition en fazla 4 okuyucuyu çalıştırır.",
        "Within a group each partition goes to one reader. 4 partitions keep at most 4 readers busy.",
      ),
      reviewStep: 7,
    },
    {
      question: l(
        "P0'daki offset 5 ile P1'deki offset 5 hakkında hangisi doğru?",
        "Which is true about offset 5 in P0 and offset 5 in P1?",
      ),
      options: [
        l("Aynı kayıttır", "They are the same record"),
        l("Farklı kayıtlardır ve aralarında bir sıra garantisi yoktur", "They are different records with no ordering guarantee between them"),
        l("P0'daki her zaman önce yazılmıştır", "The one in P0 was always written first"),
        l("Bir topic'te aynı offset iki kez olamaz", "A topic cannot have the same offset twice"),
      ],
      answer: 1,
      explain: l(
        "Her partition kendi offset'lerini sayar. İki farklı partition'daki aynı numara iki ayrı kayıttır ve sıraları hakkında bir şey söylemez.",
        "Each partition counts its own offsets. The same number in two partitions is two separate records and says nothing about their order.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "Bir topic 2 partition'dan 4'e çıkarıldı. Var olan kayıtlara ne olur?",
        "A topic grows from 2 partitions to 4. What happens to the existing records?",
      ),
      options: [
        l("4 partition'a yeniden dağıtılır", "They are redistributed over the 4 partitions"),
        l("Bulundukları partition'da kalır; yeni partition'lar boş başlar", "They stay in their partitions; the new ones start empty"),
        l("Silinir", "They are deleted"),
        l("Yeni partition'lara kopyalanır", "They are copied into the new partitions"),
      ],
      answer: 1,
      explain: l(
        "Kafka kayıtları taşımaz. Partition eklemek sadece bundan sonraki yazmaları etkiler.",
        "Kafka never moves records. Adding partitions only affects writes from then on.",
      ),
      reviewStep: 2,
    },
    {
      question: l("Kafka hangi sıralama garantisini verir?", "Which ordering guarantee does Kafka give?"),
      options: [
        l("Bir topic'teki bütün kayıtlar yazılış sırasıyla okunur", "All records in a topic are read in the order written"),
        l("Aynı partition'daki kayıtlar yazılış sırasıyla okunur", "Records in the same partition are read in the order written"),
        l("Hiçbir sıra garantisi yoktur", "There is no ordering guarantee at all"),
        l("Kayıtlar boyutlarına göre sıralanır", "Records are sorted by size"),
      ],
      answer: 1,
      explain: l(
        "Sıra partition başınadır. Birbirine göre sıralı kalması gereken kayıtlar aynı partition'a yazılmalıdır.",
        "Order is per partition. Records that must stay in order relative to each other must go to the same partition.",
      ),
      reviewStep: 4,
    },
  ],
};
