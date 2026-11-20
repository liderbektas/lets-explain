import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { BrokersScene, changesFor } from "./Scene";

export const brokersAndClusters: Lesson = {
  slug: "brokers-and-clusters",
  title: l("Broker ve Cluster", "Brokers & Clusters"),
  summary: l(
    "Kafka tek bir sunucu değil: partition'lar birçok broker'a dağılır, her partition'ın bir evi vardır.",
    "Kafka is not one server: partitions are spread over many brokers, and each partition has a home.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: BrokersScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Broker'ın ne olduğunu ve neyi sakladığını görmek", "See what a broker is and what it stores"), step: 0 },
    { text: l("Partition'ların cluster'a nasıl dağıldığını görmek", "See how partitions are spread over a cluster"), step: 1 },
    { text: l("Producer'ın hangi broker'a yazacağını nereden bildiğini öğrenmek", "Learn how a producer knows which broker to write to"), step: 3 },
    { text: l("Yeni broker eklemenin neyi değiştirip neyi değiştirmediğini görmek", "See what adding a broker does and does not change"), step: 5 },
    { text: l("Tek kopyalı bir partition'ın broker çökünce ne yaşadığını görmek", "See what happens to a single-copy partition when its broker dies"), step: 7 },
  ],
  steps: [
    {
      short: l("Broker", "Broker"),
      tag: "how",
      title: l("Kafka'yı çalıştıran sunucu: broker", "The server that runs Kafka: a broker"),
      body: [
        l(
          "Şimdiye kadar log'ları bantlar olarak çizdik. Peki bu bantlar nerede duruyor? Bir sunucunun diskinde. Kafka çalıştıran her sunucuya [[broker]] denir.",
          "So far we have drawn logs as belts. Where do those belts actually live? On a server's disk. Every server that runs Kafka is called a [[broker]].",
        ),
        l(
          "Burada `orders` topic'inin üç [[partition]]'ı var: P0, P1 ve P2. Üçü de tek broker'da duruyor ve sipariş servisi her birine birer sipariş yazdı.",
          "Here the `orders` topic has three [[partition|partitions]]: P0, P1 and P2. All three live on one broker, and the order service wrote one order to each.",
        ),
        l(
          "Tek bir sunucunun sınırları var: diski dolar, ağ kartı ve işlemcisi bir yere kadar yetişir. Ve o sunucu kapanırsa her şey durur.",
          "One server has limits: its disk fills up, and its network card and CPU only go so far. And if that server goes down, everything stops.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bir broker binlerce partition taşıyabilir. Topic'lerin partition'larını şimdilik hazır kabul ediyoruz; nasıl seçildiklerini Topic ve Partition dersi anlatıyor.",
            "One broker can hold thousands of partitions. For now we take the partitions as given; the Topics & Partitions lesson covers how they are chosen.",
          ),
        },
      ],
    },
    {
      short: l("Cluster", "Cluster"),
      tag: "idea",
      title: l("Birden çok broker: cluster", "Several brokers: a cluster"),
      body: [
        l(
          "Çözüm daha büyük bir sunucu değil, daha çok sunucu. Birlikte çalışan broker'ların bütününe [[cluster]] denir.",
          "The fix is not a bigger server but more servers. Brokers working together form a [[cluster]].",
        ),
        l(
          "İki broker ekledik ve partition'ları dağıttık: P0 broker 1'de kaldı, P1 broker 2'ye, P2 broker 3'e taşındı. Kayıtlar da onlarla birlikte gitti.",
          "We added two brokers and spread the partitions: P0 stayed on broker 1, P1 moved to broker 2 and P2 to broker 3. The records moved with them.",
        ),
        l(
          "Artık iş üç makineye bölünüyor. Her broker sadece kendi partition'larının disk ve ağ yükünü taşıyor.",
          "Now the work is split over three machines. Each broker carries only the disk and network load of its own partitions.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte yeni bir topic oluşturduğunda Kafka partition'ları broker'lara kendisi dağıtır. Taşıma işini burada göstermek için elle yaptık.",
            "In reality, when you create a topic Kafka spreads its partitions over the brokers by itself. We moved them by hand here to show it.",
          ),
        },
      ],
    },
    {
      short: l("Partition'ın evi", "A home"),
      tag: "how",
      predict: {
        question: l("Sipariş servisi P2'ye iki sipariş yazacak. Kayıtlar hangi broker'a gider?", "The order service will write two orders to P2. Which broker do the records go to?"),
        options: [
          l("Broker 1'e; ilk broker her şeyi karşılar", "Broker 1: the first broker takes everything"),
          l("Broker 3'e; P2 orada duruyor", "Broker 3: that is where P2 lives"),
          l("Üç broker'a birden", "All three brokers at once"),
        ],
        answer: 1,
        why: l(
          "Her partition'ın bir [[leader]] broker'ı vardır ve producer kaydı doğrudan ona gönderir. P2'nin lideri broker 3.",
          "Every partition has a [[leader]] broker, and the producer sends records straight to it. P2's leader is broker 3.",
        ),
      },
      title: l("Her partition'ın bir evi var", "Every partition has a home"),
      body: [
        l(
          "İki sipariş de broker 3'e gitti, çünkü P2 orada duruyor. Bir partition'ın yazma ve okumalarını karşılayan broker'a o partition'ın [[leader]]'ı denir.",
          "Both orders went to broker 3, because that is where P2 lives. The broker that serves a partition's writes and reads is that partition's [[leader]].",
        ),
        l(
          "Producer'lar kaydı aracı olmadan doğrudan liderine gönderir. Consumer'lar da okurken doğrudan lidere bağlanır. Arada her şeyi toplayan bir merkez yok.",
          "Producers send a record straight to its leader with no middleman. Consumers also read straight from the leader. There is no central hub that everything passes through.",
        ),
        l(
          "Etiketlerdeki \"leader\" yazısı bunu gösteriyor. Şimdilik her partition'ın tek kopyası var, o yüzden her kopya kendi partition'ının lideri.",
          "The \"leader\" on each label shows this. For now each partition has a single copy, so every copy is its partition's leader.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Merkez olmaması Kafka'nın ölçeklenme sırrı: daha çok broker, daha çok partition lideri, daha çok paralel yazma demek.",
            "No hub is Kafka's scaling secret: more brokers means more partition leaders, which means more writes in parallel.",
          ),
        },
      ],
    },
    {
      short: l("Metadata", "Metadata"),
      tag: "how",
      title: l("Producer nereye yazacağını nereden biliyor?", "How does the producer know where to write?"),
      body: [
        l(
          "Producer başlarken sadece birkaç broker adresi bilir. Bu listeye [[bootstrapServers]] denir. Herhangi birine bağlanır ve sorar: \"Kim neyin lideri?\"",
          "When the producer starts it only knows a few broker addresses. That list is called [[bootstrapServers]]. It connects to any one of them and asks: \"Who leads what?\"",
        ),
        l(
          "Her broker cluster'ın haritasını bilir ve cevap verir. Bu haritaya [[metadata]] denir: hangi broker'lar var, her partition'ın lideri kim.",
          "Every broker knows the cluster's map and answers. That map is called [[metadata]]: which brokers exist and who leads each partition.",
        ),
        l(
          "Producer haritayı saklar ve kayıtları doğrudan liderlere gönderir. Lider değişirse broker \"ben lider değilim\" der, producer da haritayı tazeler.",
          "The producer keeps the map and sends records straight to the leaders. If a leader changes, the broker replies \"I am not the leader\" and the producer refreshes its map.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`bootstrap.servers` listesine bütün broker'ları yazmak gerekmez ama tek bir tane yazmak da riskli: o kapalıysa client hiç başlayamaz. Genelde 2–3 adres yazılır.",
            "You do not need to list every broker in `bootstrap.servers`, but listing only one is risky: if it is down, the client cannot start at all. Two or three addresses is typical.",
          ),
        },
      ],
    },
    {
      short: l("Yük paylaşılır", "Shared load"),
      tag: "how",
      title: l("Yük broker'lara paylaşılır", "The load is shared"),
      body: [
        l(
          "Sipariş servisi bu sefer partition seçmeden altı sipariş yazdı. Kayıtlar P0, P1 ve P2'ye sırayla dağıldı.",
          "This time the order service wrote six orders without picking a partition. The records went to P0, P1 and P2 in turn.",
        ),
        l(
          "Her partition ayrı bir broker'da olduğu için her broker sadece iki kayıt aldı. Trafik ikiye katlanırsa partition ve broker ekleyerek yine paylaştırabiliriz.",
          "Since each partition is on a different broker, each broker received just two records. If traffic doubled, we could share it again by adding partitions and brokers.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte key'siz kayıtlar sırayla tek tek dağıtılmaz. Producer bir partition için bir batch doldurur, sonra diğerine geçer (sticky partitioner). Uzun vadede sonuç yine dengeli olur.",
            "In reality records without a key are not spread one by one. The producer fills a batch for one partition, then moves on (the sticky partitioner). Over time the result is still balanced.",
          ),
        },
      ],
    },
    {
      short: l("Yeni broker", "New broker"),
      tag: "problem",
      predict: {
        question: l("Cluster'a broker 4 eklenecek. Mevcut partition'lardan kaçı ona kendiliğinden taşınır?", "Broker 4 is about to join the cluster. How many existing partitions move to it on their own?"),
        options: [
          l("Hiçbiri; yeni broker boş bekler", "None: the new broker sits empty"),
          l("Bir tanesi, yük dengelensin diye", "One, to balance the load"),
          l("Hepsi baştan dağıtılır", "All of them are spread out again"),
        ],
        answer: 0,
        why: l(
          "Kafka mevcut partition'ları kendiliğinden taşımaz, çünkü taşımak veri kopyalamak demek ve bu pahalıdır. Yeni broker sadece bundan sonra oluşturulan partition'ları alabilir, ya da sen taşırsın.",
          "Kafka does not move existing partitions on its own, because moving means copying data, which is expensive. A new broker only gets partitions created from now on, or ones you move.",
        ),
      },
      title: l("Yeni broker geldi ama boş", "A new broker arrives, empty"),
      body: [
        l(
          "Broker 4 cluster'a katıldı ama üzerinde hiç partition yok. Mevcut üç partition yerinde kaldı.",
          "Broker 4 joined the cluster but holds no partition. The three existing partitions stayed where they were.",
        ),
        l(
          "Bu bilinçli bir tercih. Bir partition'ı taşımak, içindeki bütün kayıtları ağ üzerinden kopyalamak demek. Kafka bunu sen istemeden yapmaz.",
          "This is on purpose. Moving a partition means copying every record in it over the network. Kafka does not do that unless you ask.",
        ),
      ],
    },
    {
      short: l("Taşımak", "Moving"),
      tag: "how",
      title: l("Partition'ı başka broker'a taşımak", "Moving a partition to another broker"),
      body: [
        l(
          "P2'yi broker 3'ten broker 4'e taşıdık. Buna [[reassignment]] denir. Önce kayıtlar yeni broker'a kopyalanır, sonra eski kopya silinir.",
          "We moved P2 from broker 3 to broker 4. This is called [[reassignment]]. First the records are copied to the new broker, then the old copy is removed.",
        ),
        l(
          "P2'nin bütün kayıtları offset'leriyle birlikte geldi. Offset'ler partition'a aittir, broker'a değil; taşıyınca değişmezler.",
          "All of P2's records arrived with their offsets. Offsets belong to the partition, not the broker, so moving does not change them.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu iş `kafka-reassign-partitions.sh` aracıyla yapılır. Büyük partition'larda saatler sürebilir, o yüzden kopyalama hızına bir sınır (throttle) konur. Cruise Control gibi araçlar bu dengelemeyi otomatikleştirir.",
            "This is done with the `kafka-reassign-partitions.sh` tool. For large partitions it can take hours, so the copy speed is throttled. Tools like Cruise Control automate the balancing.",
          ),
        },
      ],
    },
    {
      short: l("Çökme", "Crash"),
      tag: "problem",
      predict: {
        question: l(
          "Broker 2 çökecek. Her partition'ın sadece tek kopyası var. Ne olur?",
          "Broker 2 is about to crash. Each partition has only one copy. What happens?",
        ),
        options: [
          l("Hiçbir şey; Kafka P1'i önceden başka yere kopyalamıştı", "Nothing: Kafka had already copied P1 elsewhere"),
          l("Sadece P1 kullanılamaz; P0 ve P2 çalışmaya devam eder", "Only P1 is unavailable; P0 and P2 keep working"),
          l("Bütün topic durur", "The whole topic stops"),
        ],
        answer: 1,
        why: l(
          "P1'in tek kopyası broker 2'deydi. O broker yokken P1'e kimse yazamaz ve kimse ondan okuyamaz. Diğer partition'lar başka broker'larda olduğu için etkilenmez.",
          "P1's only copy was on broker 2. While that broker is gone, nobody can write to or read from P1. The other partitions live on other brokers, so they are fine.",
        ),
      },
      title: l("Bir broker çöktü", "A broker went down"),
      body: [
        l(
          "Broker 2 çöktü. Sipariş servisi P1'e yazmaya çalıştı ve yazamadı: P1'in tek kopyası o broker'daydı. Sayaçta \"Çalışan partition: 2/3\" yazıyor.",
          "Broker 2 crashed. The order service tried to write to P1 and could not: P1's only copy was on that broker. The counter reads \"Partitions online: 2/3\".",
        ),
        l(
          "P0'a yazma ise sorunsuz geçti. Bir broker'ın çökmesi sadece onun taşıdığı partition'ları etkiler.",
          "The write to P0 went through without trouble. A broker crash only affects the partitions it holds.",
        ),
        l(
          "Bu iyi bir haber ama yeterli değil: P1'deki siparişler şu an erişilemez ve yeni P1 siparişleri reddediliyor.",
          "That is good news, but not good enough: the orders in P1 are out of reach right now, and new P1 orders are refused.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Key'i olmayan kayıtları producer çalışan partition'lara yönlendirebilir. Ama key'i P1'e düşen kayıtlar (örneğin aynı müşterinin siparişleri) başka yere gidemez, beklemek zorunda kalır.",
            "Records without a key can be routed to partitions that work. But records whose key maps to P1 (say, the same customer's orders) cannot go anywhere else and have to wait.",
          ),
        },
      ],
    },
    {
      short: l("Geri dönüş", "Back up"),
      tag: "how",
      predict: {
        question: l("Broker 2 yeniden açılacak. P1'deki eski siparişlere ne olur?", "Broker 2 is about to restart. What happens to the old orders in P1?"),
        options: [
          l("Diskte duruyorlar, P1 onlarla geri gelir", "They are on disk, and P1 comes back with them"),
          l("Silindiler, P1 boş başlar", "They are gone; P1 starts empty"),
          l("Başka bir broker'dan geri kopyalanırlar", "They are copied back from another broker"),
        ],
        answer: 0,
        why: l(
          "Broker kayıtları diske yazar, bu yüzden yeniden başlamak veriyi silmez. Ama başka bir yerde kopyası olmadığı için disk bozulsaydı geri getirecek bir yer de olmazdı.",
          "A broker writes records to disk, so a restart does not erase them. But since no other copy exists, if the disk itself had died there would be nowhere to bring them back from.",
        ),
      },
      title: l("Broker geri geldi", "The broker is back"),
      body: [
        l(
          "Broker 2 açıldı ve P1 eski kayıtlarıyla birlikte geri geldi. Yeni bir sipariş de P1'e sorunsuz yazıldı.",
          "Broker 2 came up and P1 returned with its old records. A new order was written to P1 without trouble.",
        ),
        l(
          "Ama şunu düşün: Broker 2'nin diski bozulsaydı ne olurdu? P1'in tek kopyası sonsuza kadar giderdi.",
          "But think about this: what if broker 2's disk had failed? P1's only copy would be gone forever.",
        ),
        l(
          "Bu yüzden gerçek cluster'larda her partition'ın birkaç broker'da kopyası tutulur. Bir sonraki ders bunu anlatıyor: replikasyon.",
          "That is why real clusters keep copies of every partition on several brokers. The next lesson covers exactly this: replication.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Tek kopyalı (replication.factor=1) topic'ler sadece kaybı göze alınabilen veriler, örneğin geliştirme ortamı için uygundur.",
            "Single-copy topics (replication.factor=1) only suit data you can afford to lose, such as a development setup.",
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
          "Sıra sende. Bu cluster bir docker-compose geliştirme ortamı: broker N, `kafka-N` container'ında çalışıyor. Aşağıda gerçek işten **4 senaryo** var; komutları terminale **kendin yaz**, sahne her komutta ne olduğunu gösterir.",
          "Your turn. This cluster is a docker-compose dev setup: broker N runs in container `kafka-N`. Below are **4 scenarios** from real work; **type the commands yourself** in the terminal and the scene shows what each one does.",
        ),
        l(
          "`kafka-topics.sh --describe` kimin neyin lideri olduğunu söyler; `docker stop` / `docker start` broker'ı kapatıp açar; bir partition'ı taşımak için `kafka-reassign-partitions.sh` bir JSON planı ister (`nano move.json`). `help` hepsini listeler.",
          "`kafka-topics.sh --describe` tells you who leads what; `docker stop` / `docker start` stop and start a broker; to move a partition `kafka-reassign-partitions.sh` takes a JSON plan (`nano move.json`). `help` lists everything.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sağdaki liste her komuttan sonra ne olduğunu sade bir dille yazar. Bir şeyi bozarsan **Son komutu geri al** ya da **Baştan başla**.",
            "The list on the right says in plain words what each command did. If you break something, use **Undo last command** or **Start over**.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Kafka çalıştıran her sunucu bir [[broker]]'dır; birlikte çalışan broker'lar bir [[cluster]] oluşturur.",
      "Every server running Kafka is a [[broker]]; brokers working together form a [[cluster]].",
    ),
    l(
      "Bir topic'in partition'ları broker'lara dağılır. Her partition'ın yazma ve okumalarını onun [[leader]]'ı karşılar.",
      "A topic's partitions are spread over the brokers. Each partition's writes and reads are served by its [[leader]].",
    ),
    l(
      "Client'lar [[bootstrapServers]] ile herhangi bir broker'a bağlanır, [[metadata]] alır ve sonra doğrudan liderlere konuşur.",
      "Clients connect to any broker via [[bootstrapServers]], fetch [[metadata]], and then talk straight to the leaders.",
    ),
    l(
      "Yeni broker eklemek mevcut partition'ları taşımaz; bunun için [[reassignment]] gerekir.",
      "Adding a broker does not move existing partitions; that takes a [[reassignment]].",
    ),
    l(
      "Tek kopyalı bir partition, broker'ı çökünce erişilemez olur; disk bozulursa veri tamamen gider.",
      "A single-copy partition becomes unavailable when its broker goes down, and is gone for good if the disk fails.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir producer P1'e yazmak istiyor. Kaydı hangi broker'a gönderir?",
        "A producer wants to write to P1. Which broker does it send the record to?",
      ),
      options: [
        l("`bootstrap.servers` listesindeki ilk broker'a", "The first broker in `bootstrap.servers`"),
        l("P1'in leader'ı olan broker'a", "The broker that leads P1"),
        l("Bütün broker'lara", "Every broker"),
        l("Rastgele bir broker'a, o yönlendirir", "A random broker, which forwards it"),
      ],
      answer: 1,
      explain: l(
        "Producer metadata ile her partition'ın liderini öğrenir ve kaydı doğrudan ona gönderir.",
        "The producer learns each partition's leader from metadata and sends the record straight to it.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "3 broker'lı bir cluster'a 4. broker eklendi. Hemen ardından ne olur?",
        "A fourth broker joins a 3-broker cluster. What happens right after?",
      ),
      options: [
        l("Partition'lar otomatik olarak dört broker'a yeniden dağılır", "Partitions are automatically spread over all four"),
        l("Yeni broker boş durur; mevcut partition'lar yerinde kalır", "The new broker stays empty; existing partitions stay put"),
        l("Cluster yeniden başlatılmalıdır", "The cluster has to be restarted"),
        l("Bütün topic'ler yeni broker'a kopyalanır", "Every topic is copied to the new broker"),
      ],
      answer: 1,
      explain: l(
        "Kafka mevcut partition'ları kendiliğinden taşımaz. Taşımak için reassignment yapman gerekir.",
        "Kafka does not move existing partitions by itself. You have to run a reassignment.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "replication.factor=1 olan bir topic'in partition'larından birinin broker'ı çöktü. Ne olur?",
        "A topic has replication.factor=1, and the broker of one of its partitions crashes. What happens?",
      ),
      options: [
        l("O partition'a yazılamaz ve ondan okunamaz; diğerleri çalışır", "That partition cannot be written or read; the others work"),
        l("Bütün topic durur", "The whole topic stops"),
        l("Kafka partition'ı hemen başka bir broker'da yeniden oluşturur, veriyle birlikte", "Kafka recreates the partition on another broker at once, data included"),
        l("Hiçbir şey olmaz", "Nothing happens"),
      ],
      answer: 0,
      explain: l(
        "Tek kopya o broker'daydı. Diğer partition'lar başka broker'larda olduğu için etkilenmez.",
        "The only copy was on that broker. The other partitions live elsewhere, so they are unaffected.",
      ),
      reviewStep: 7,
    },
    {
      question: l(
        "`bootstrap.servers` listesi için en iyi seçim hangisi?",
        "Which is the best choice for `bootstrap.servers`?",
      ),
      options: [
        l("Sadece tek bir broker adresi", "Just one broker address"),
        l("Mutlaka bütün broker'ların adresi", "Every single broker, always"),
        l("Birkaç broker adresi; biri kapalıysa diğeri cevap verir", "A few broker addresses, so another answers if one is down"),
        l("Hiçbiri; client broker'ları kendisi bulur", "None: the client finds brokers on its own"),
      ],
      answer: 2,
      explain: l(
        "Herhangi bir broker bütün haritayı verebilir, o yüzden hepsini yazmak gerekmez. Ama tek bir adres, o broker kapalıyken client'ın hiç başlayamaması demek.",
        "Any broker can hand out the whole map, so you do not need them all. But a single address means the client cannot start while that broker is down.",
      ),
      reviewStep: 3,
    },
  ],
};
