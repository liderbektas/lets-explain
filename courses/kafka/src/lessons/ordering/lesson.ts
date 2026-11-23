import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, OrderingScene } from "./Scene";

export const ordering: Lesson = {
  slug: "ordering",
  title: l("Sıralama garantileri", "Ordering Guarantees"),
  summary: l(
    "Kafka sırayı nerede korur, nerede korumaz? Key, partition ve producer retry'larının sıraya etkisi.",
    "Where does Kafka keep order, and where not? How keys, partitions and producer retries affect it.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: OrderingScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Key'siz olayların partition'lara dağıldığını görmek", "See events without a key spread over partitions"), step: 1 },
    { text: l("Partition'lar arasında neden sıra garantisi olmadığını anlamak", "Understand why there is no order across partitions"), step: 2 },
    { text: l("Key ile aynı siparişin olaylarını aynı partition'a toplamak", "Use a key to keep one order's events in one partition"), step: 3 },
    { text: l("Partition eklemenin key eşlemesini nasıl bozduğunu görmek", "See how adding partitions breaks the key mapping"), step: 6 },
    { text: l("Producer retry'larının sırayı nasıl bozabildiğini ve idempotence'ı öğrenmek", "Learn how producer retries can reorder, and how idempotence helps"), step: 8 },
  ],
  steps: [
    {
      short: l("Neden sıra?", "Why order?"),
      tag: "how",
      title: l("Sıra neden önemli?", "Why does order matter?"),
      body: [
        l(
          "Bir siparişin hayatı üç olaydan oluşuyor: **1 oluşturuldu**, **2 ödendi**, **3 kargolandı**. Kargo servisi bir paketi ancak ödeme alındıktan sonra yola çıkarmalı.",
          "An order's life is three events: **1 created**, **2 paid**, **3 shipped**. The shipping service may only send a parcel once it has been paid for.",
        ),
        l(
          "Kargo servisi \"kargolandı\" olayını \"ödendi\"den önce görürse, ödenmemiş bir paketi yola çıkarabilir. Yani olayların **yazıldığı sırayla** işlenmesi gerekiyor.",
          "If shipping sees \"shipped\" before \"paid\", it might send out an unpaid parcel. The events have to be handled **in the order they were written**.",
        ),
        l(
          "Sahnede `orders` [[topic]]'inin üç [[partition]]'ı var. Her rayın başında bir Kargo [[consumer]]'ı duruyor. Üçü aynı [[consumerGroup|consumer group]]'ta ve partition'ları aralarında paylaşıyorlar.",
          "The stage shows the `orders` [[topic]] with three [[partition|partitions]]. A shipping [[consumer]] stands at the start of each track. All three are in one [[consumerGroup|consumer group]] and share the partitions between them.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bu dersin tek sorusu şu: bir consumer, bir siparişin sonraki olayını öncekinden önce hiç işleyebilir mi? Sağdaki \"İşlenme sırası\" kartı bunu her an gösteriyor.",
            "This lesson keeps asking one question: can a consumer ever handle an order's later event before an earlier one? The \"Order handled\" card on the right shows it at every moment.",
          ),
        },
      ],
    },
    {
      short: l("Key'siz", "No key"),
      tag: "problem",
      title: l("Key olmadan yazınca", "Writing without a key"),
      body: [
        l(
          "Sipariş servisi 1042'nin üç olayını yazdı, ama kayıtlara bir [[key]] vermedi.",
          "The order service wrote order 1042's three events but gave the records no [[key]].",
        ),
        l(
          "Key yoksa producer kaydı istediği partition'a koyabilir. Burada olaylar sırayla dağıldı: **1** partition 0'a, **2** partition 1'e, **3** partition 2'ye.",
          "Without a key, the producer may put a record in any partition. Here the events were spread in turn: **1** to partition 0, **2** to partition 1, **3** to partition 2.",
        ),
        l(
          "Her partition kendi başına sıralı bir log. Ama artık 1042'nin olayları üç ayrı log'a bölündü.",
          "Each partition is an ordered log of its own. But order 1042's events are now split over three separate logs.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada key'siz kayıtları sırayla (round-robin) dağıtıyoruz. Gerçek producer \"sticky\" davranır: bir batch dolana kadar aynı partition'a yazar, sonra başkasına geçer. Sonuç yine aynı: aynı siparişin olayları farklı partition'lara düşebilir.",
            "Here records without a key go round-robin. A real producer is \"sticky\": it fills a batch for one partition, then moves on to another. The result is the same: one order's events can land in different partitions.",
          ),
        },
      ],
    },
    {
      short: l("Kim önce?", "Who first?"),
      tag: "problem",
      predict: {
        question: l(
          "1042'nin üç olayı üç ayrı partition'da ve her birini başka bir consumer okuyor. Kargo-3, \"kargolandı\" olayını diğer ikisinden önce işleyebilir mi?",
          "Order 1042's three events sit in three partitions, each read by a different consumer. Can Shipping-3 handle \"shipped\" before the other two?",
        ),
        options: [
          l("Hayır, Kafka bir topic'teki bütün olayların sırasını korur", "No, Kafka keeps the order of every event in a topic"),
          l("Evet, partition'lar arasında sıra garantisi yok", "Yes, there is no order across partitions"),
          l("Hayır, consumer'lar birbirini bekler", "No, consumers wait for each other"),
        ],
        answer: 1,
        why: l(
          "Kafka sırayı sadece bir partition'ın içinde garanti eder. Farklı partition'ları okuyan consumer'lar birbirini beklemez, kim önce davranırsa onun olayı önce işlenir.",
          "Kafka only guarantees order inside one partition. Consumers reading different partitions never wait for each other; whoever moves first handles its event first.",
        ),
      },
      title: l("Kim önce işler?", "Who handles first?"),
      body: [
        l(
          "Kargo-3 o an boştaydı ve partition 2'deki \"kargolandı\"yı hemen işledi. Kargo-2 \"ödendi\"yi ondan sonra, Kargo-1 \"oluşturuldu\"yu en son işledi.",
          "Shipping-3 was free and handled \"shipped\" from partition 2 right away. Shipping-2 handled \"paid\" after that, and Shipping-1 handled \"created\" last.",
        ),
        l(
          "Sağdaki kart 1042 için **3, 2, 1** gösteriyor: tam ters sıra. Ödenmemiş bir paket yola çıktı!",
          "The card on the right shows **3, 2, 1** for 1042: exactly backwards. An unpaid parcel went out!",
        ),
        l(
          "Kafka'nın sıra garantisi **partition içindedir**, topic'in tamamı için değil. Farklı partition'lar paralel ve birbirinden habersiz ilerler.",
          "Kafka's ordering guarantee is **within a partition**, not across the whole topic. Different partitions move in parallel and know nothing about each other.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bu bir hata değil, tasarım: partition'lar birbirini beklemediği için Kafka bu kadar çok consumer'la paralel çalışabiliyor.",
            "This is not a bug but the design: because partitions never wait for each other, Kafka can run with many consumers in parallel.",
          ),
        },
      ],
    },
    {
      short: l("Key ile", "With a key"),
      tag: "idea",
      predict: {
        question: l(
          "Bu sefer 1043'ün üç olayını key = \"1043\" ile yazıyoruz. Olaylar nereye düşer?",
          "This time order 1043's three events are written with key = \"1043\". Where do they land?",
        ),
        options: [
          l("Üçü farklı partition'lara", "Each in a different partition"),
          l("Üçü de aynı partition'a", "All three in the same partition"),
          l("Rastgele dağılır, her seferinde farklı", "Randomly, different each time"),
        ],
        answer: 1,
        why: l(
          "Key'li bir kaydın partition'ı key'den hesaplanır. Aynı key her seferinde aynı sonucu verir, bu yüzden 1043'ün bütün olayları aynı partition'a gider.",
          "A keyed record's partition is computed from the key. The same key gives the same answer every time, so all of 1043's events go to one partition.",
        ),
      },
      title: l("Key ile yazınca", "Writing with a key"),
      body: [
        l(
          "Sipariş servisi bu sefer her olaya sipariş numarasını key olarak verdi. 1043'ün üç olayı da **partition 0**'a düştü.",
          "This time the order service gave every event its order number as the key. All three of 1043's events landed in **partition 0**.",
        ),
        l(
          "Producer'daki [[partitioner]] key'in hash'ini alıp partition sayısına böler: `hash(\"1043\") % 3 = 0`. Aynı key her zaman aynı sonucu verir.",
          "The producer's [[partitioner]] hashes the key and takes the remainder by the partition count: `hash(\"1043\") % 3 = 0`. The same key always gives the same result.",
        ),
        l(
          "Siparişi key yapmak, \"bu siparişin olayları birbirine bağlı, ayırma\" demenin yolu.",
          "Making the order the key is how you say \"these events belong together; don't split them\".",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka'nın varsayılan partitioner'ı key'in murmur2 hash'ini kullanır. Burada da aynı formülü çalıştırıyoruz, yani sahnedeki partition'lar gerçek Kafka'nınkilerle aynı.",
            "Kafka's default partitioner uses the murmur2 hash of the key. We run the same formula here, so the partitions on stage match real Kafka.",
          ),
        },
      ],
    },
    {
      short: l("Partition içi", "In a partition"),
      tag: "how",
      title: l("Partition içinde sıra garantili", "Order is guaranteed inside a partition"),
      body: [
        l(
          "Kargo-1 partition 0'ı okudu ve 1043'ü **1, 2, 3** sırasıyla işledi.",
          "Shipping-1 read partition 0 and handled 1043 in the order **1, 2, 3**.",
        ),
        l(
          "Bir partition'da offset'ler yazılış sırasıdır ve consumer onları offset sırasıyla okur. Aynı partition'daki iki olayın sırası asla değişmez.",
          "In a partition, offsets are the writing order and the consumer reads in offset order. Two events in the same partition never swap places.",
        ),
        l(
          "Bir group'ta bir partition'ı aynı anda **tek bir consumer** okur. Partition 0'ı Kargo-1'den başkası okumadığı için onun olaylarını iki kişi yarıştırmıyor.",
          "Within a group, a partition is read by **one consumer** at a time. Nobody but Shipping-1 reads partition 0, so no two readers race over its events.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kural şu: sırası önemli olan olaylar aynı key'i taşımalı. Aynı key → aynı partition → tek consumer → doğru sıra.",
            "The rule: events whose order matters must share a key. Same key → same partition → one consumer → right order.",
          ),
        },
      ],
    },
    {
      short: l("Paralel", "In parallel"),
      tag: "how",
      title: l("Farklı key'ler paralel ilerler", "Different keys move in parallel"),
      body: [
        l(
          "İki yeni sipariş geldi: 1045 partition 1'e, 1048 partition 2'ye düştü. Kargo-2 ve Kargo-3 onları aynı anda işliyor.",
          "Two new orders arrived: 1045 went to partition 1, 1048 to partition 2. Shipping-2 and Shipping-3 work on them at the same time.",
        ),
        l(
          "Her siparişin kendi içindeki sırası korunuyor, ama farklı siparişler birbirini beklemiyor. Kargo-2 biraz yavaş: 1045'in \"ödendi\" olayı hâlâ sırada bekliyor.",
          "Each order keeps its own sequence, but different orders never wait for each other. Shipping-2 is a little slow: 1045's \"paid\" event is still waiting.",
        ),
        l(
          "Bu, Kafka'da istenen dengedir: **key başına sıra, key'ler arasında paralellik.** Bütün topic için tek bir sıra isteseydik, her şeyi tek partition'a koymak ve tek consumer'la okumak zorunda kalırdık.",
          "This is the balance Kafka aims for: **order per key, parallelism across keys.** A single order for the whole topic would mean one partition and one consumer.",
        ),
      ],
    },
    {
      short: l("Partition ekle", "Add partition"),
      tag: "problem",
      predict: {
        question: l(
          "Topic'e 4. partition eklendi. 1045'in yeni olayı yine key = \"1045\" ile yazılıyor. Nereye düşer?",
          "A 4th partition was added. Order 1045's next event is again written with key = \"1045\". Where does it land?",
        ),
        options: [
          l("Önceki olaylarıyla aynı partition'a (partition 1)", "In the same partition as its earlier events (partition 1)"),
          l("Başka bir partition'a gidebilir", "It may go to another partition"),
          l("Yazılamaz, önce eski olaylar silinmeli", "It can't be written until the old events are deleted"),
        ],
        answer: 1,
        why: l(
          "Partition, hash(key) % partition sayısı ile seçilir. Sayı 3'ten 4'e çıkınca sonuç da değişebilir: 1045 artık partition 0'a gidiyor.",
          "The partition is hash(key) % partition count. When the count goes from 3 to 4 the result can change: 1045 now goes to partition 0.",
        ),
      },
      title: l("Partition eklersen", "If you add a partition"),
      body: [
        l(
          "Trafik arttı ve topic'e bir partition eklendi. Kafka group'u yeniden dağıttı ([[rebalance]]): Kargo-1 artık partition 0 ve 1'i okuyor.",
          "Traffic grew and a partition was added. Kafka handed the partitions out again ([[rebalance]]): Shipping-1 now reads partitions 0 and 1.",
        ),
        l(
          "1045'in \"kargolandı\" olayı `hash(\"1045\") % 4 = 0` ile **partition 0**'a düştü, oysa önceki olayları partition 1'deydi. Kargo-1 onu hemen işledi.",
          "1045's \"shipped\" event landed in **partition 0** through `hash(\"1045\") % 4 = 0`, while its earlier events are in partition 1. Shipping-1 handled it at once.",
        ),
        l(
          "Ama 1045'in \"ödendi\" olayı hâlâ partition 1'de bekliyor. Sıra bozuldu: kargo, ödemeden önce işlendi.",
          "But 1045's \"paid\" event is still waiting in partition 1. The order broke: shipping was handled before payment.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka partition sayısını artırmana izin verir ama azaltmana izin vermez. Key'e göre sıra önemliyse partition sayısını baştan bol seç. Sonradan artırman gerekirse, eski partition'lardaki olayların işlenmesini bekleyip öyle artır.",
            "Kafka lets you increase the partition count but never decrease it. If per-key order matters, choose plenty of partitions up front. If you must increase it later, wait for the old partitions' events to be handled first.",
          ),
        },
      ],
    },
    {
      short: l("Retry", "Retries"),
      tag: "reality",
      predict: {
        question: l(
          "Producer \"oluşturuldu\" ve \"ödendi\"yi beklemeden arka arkaya gönderdi. İlk istek zaman aşımına uğrayıp tekrar gönderildi, ikincisi ilk denemede yazıldı. Log'daki sıra ne olur?",
          "The producer sent \"created\" and \"paid\" back to back without waiting. The first request timed out and was sent again; the second landed on the first try. What is the order in the log?",
        ),
        options: [
          l("Önce oluşturuldu, sonra ödendi", "Created, then paid"),
          l("Önce ödendi, sonra oluşturuldu", "Paid, then created"),
          l("İkisi de kaybolur", "Both are lost"),
        ],
        answer: 1,
        why: l(
          "Broker kayıtları geldikleri sırayla yazar. İkinci istek önce vardı, tekrar denenen ilk istek ondan sonra geldi. Log'da sıra ters döndü.",
          "The broker writes records in the order they arrive. The second request got there first and the retried first one came after it, so the log has them reversed.",
        ),
      },
      title: l("Producer tekrar denerse", "When the producer retries"),
      body: [
        l(
          "Sıra bozulmasının bir yolu da producer'ın kendisi. Producer hızlı olmak için cevap beklemeden birkaç isteği aynı anda yolda tutar. Bu sayı [[maxInFlight]] ayarıyla belirlenir, varsayılanı 5.",
          "The producer itself can break the order too. To be fast, it keeps several requests on the way without waiting for answers. [[maxInFlight]] sets how many; the default is 5.",
        ),
        l(
          "İlk istek ağda takıldı ve tekrar gönderildi. Bu arada ikinci istek çoktan yazılmıştı. Log artık \"ödendi\"yi offset 0'da, \"oluşturuldu\"yu offset 1'de tutuyor.",
          "The first request got stuck on the network and was sent again. Meanwhile the second had already been written. The log now holds \"paid\" at offset 0 and \"created\" at offset 1.",
        ),
        l(
          "Bu olaylar aynı partition'da, ama yanlış sırayla yazıldılar. Consumer onları sadık bir şekilde bu yanlış sırayla okuyacak.",
          "These events are in the same partition, but they were written in the wrong order, and the consumer will faithfully read them in that wrong order.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sorun idempotence kapalıyken olur. Kafka 3.0'dan beri producer'da idempotence varsayılan olarak açık, bu yüzden güncel bir producer'da bunu görmek için onu kapatmış olman gerekir.",
            "This happens with idempotence turned off. Since Kafka 3.0 the producer has idempotence on by default, so with a current producer you would have to switch it off to see this.",
          ),
        },
      ],
    },
    {
      short: l("Idempotence", "Idempotence"),
      tag: "idea",
      title: l("Idempotence sırayı korur", "Idempotence keeps the order"),
      body: [
        l(
          "[[idempotence|Idempotent]] producer her partition'a giden batch'lere bir sıra numarası (`seq`) verir. Broker her partition için sıradaki numarayı bekler.",
          "An [[idempotence|idempotent]] producer gives every batch for a partition a sequence number (`seq`). The broker expects the next number for each partition.",
        ),
        l(
          "seq 0 zaman aşımına uğradı. seq 1 geldiğinde broker \"henüz 0'ı almadım\" deyip onu reddetti. Producer ikisini sırasıyla yeniden gönderdi ve log doğru sırada kaldı: **oluşturuldu**, sonra **ödendi**.",
          "seq 0 timed out. When seq 1 arrived, the broker said \"I haven't got 0 yet\" and refused it. The producer sent both again in order and the log stayed right: **created**, then **paid**.",
        ),
        l(
          "Aynı numaralar sayesinde, tekrar gönderilen bir batch zaten yazılmışsa broker onu ikinci kez yazmaz. Yani idempotence hem sırayı hem de tekrarsız yazmayı sağlar.",
          "Thanks to the same numbers, if a resent batch was already written the broker does not write it twice. So idempotence gives both order and no duplicate writes.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Idempotence `acks=all` ve en fazla 5 in-flight istek gerektirir; ikisi de Kafka 3.0'dan beri varsayılan. Idempotence olmadan sırayı korumanın tek yolu `max.in.flight.requests.per.connection=1`, bu da producer'ı yavaşlatır.",
            "Idempotence needs `acks=all` and at most 5 requests in flight; both are defaults since Kafka 3.0. Without idempotence, the only way to keep order is `max.in.flight.requests.per.connection=1`, which slows the producer down.",
          ),
        },
        {
          kind: "insight",
          text: l(
            "Idempotence tek bir producer oturumu içinde ve partition başına çalışır. Partition'lar arasındaki sıraya dokunmaz; o iş hâlâ key'in.",
            "Idempotence works per partition, within one producer session. It does nothing for order across partitions; that is still the key's job.",
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
          "Sıra sende. Aşağıda 3 partition'lı `orders` topic'i, arka planda çalışan üç kargo instance'ı (`%1`, `%2`, `%3`) ve gerçek işten **4 senaryo** var. Olayları `kafka-console-producer.sh` ile **kendin** yaz: `1043:created` gibi satırlar, `--property parse.key=true --property key.separator=:` ile key'li.",
          "Your turn. Below are the 3-partition `orders` topic, three shipping instances running in the background (`%1`, `%2`, `%3`) and **4 scenarios** from real work. Write the events **yourself** with `kafka-console-producer.sh`: lines like `1043:created`, keyed with `--property parse.key=true --property key.separator=:`.",
        ),
        l(
          "Zaman kendiliğinden akmaz: `sleep 1` her çalışan instance'a bir olay işletir. Yavaş ya da takılmış bir consumer'ı `kill -STOP %1` taklit eder, `kill -CONT %1` devam ettirir. Sağdaki \"İşlenme sırası\" kartında kırmızı daire, kendinden önceki olaydan önce işlenmiş bir olay demek.",
          "Time doesn't move by itself: `sleep 1` has every running instance handle one event. `kill -STOP %1` acts out a slow or stuck consumer, and `kill -CONT %1` resumes it. In the \"Order handled\" card on the right, a red circle means an event handled before an earlier one.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Her instance o an ilgilendiği partition'dan bir sonraki olayı alır; birden çok partition'ı olan instance, partition'larını sırayla dolaşır.",
            "Each instance takes the next event from the partition it is on; an instance with several partitions takes them in turn.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Kafka sırayı sadece **bir [[partition]] içinde** garanti eder. Partition'lar arasında sıra yoktur.",
      "Kafka guarantees order only **within one [[partition]]**. There is no order across partitions.",
    ),
    l(
      "Sırası önemli olan olaylar aynı [[key]]'i taşımalı: aynı key → aynı partition → tek consumer → doğru sıra.",
      "Events whose order matters must share a [[key]]: same key → same partition → one consumer → right order.",
    ),
    l(
      "Key'siz kayıtlar farklı partition'lara dağılabilir; farklı consumer'lar onları herhangi bir sırayla işleyebilir.",
      "Records without a key can spread over partitions, and different consumers may handle them in any order.",
    ),
    l(
      "Partition sayısını değiştirmek `hash(key) % n` sonucunu değiştirir; aynı key'in yeni olayları başka partition'a gidebilir.",
      "Changing the partition count changes `hash(key) % n`, so new events for the same key may go to another partition.",
    ),
    l(
      "Idempotence kapalıyken ve birden çok istek yoldayken retry'lar log'daki sırayı bozabilir.",
      "With idempotence off and several requests in flight, retries can reorder the log.",
    ),
    l(
      "[[idempotence|Idempotent]] producer (Kafka 3.0'dan beri varsayılan) sıra numaralarıyla partition içindeki sırayı korur ve tekrar yazmayı önler.",
      "The [[idempotence|idempotent]] producer (the default since Kafka 3.0) keeps order within a partition with sequence numbers and prevents duplicate writes.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir topic'in 6 partition'ı var. Kafka hangi sırayı garanti eder?",
        "A topic has 6 partitions. Which order does Kafka guarantee?",
      ),
      options: [
        l("Topic'teki bütün kayıtların yazılış sırasını", "The writing order of every record in the topic"),
        l("Her partition'ın kendi içindeki sırayı", "The order inside each partition"),
        l("Sadece aynı producer'dan gelenlerin sırasını, hangi partition'da olurlarsa olsunlar", "Only the order of one producer's records, whatever their partition"),
        l("Hiçbir sıra garantisi yoktur", "No order at all"),
      ],
      answer: 1,
      explain: l(
        "Sıra partition başınadır. Farklı partition'lardaki kayıtların birbirine göre sırası garanti edilmez.",
        "Order is per partition. Records in different partitions have no guaranteed order relative to each other.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "Bir kullanıcının bütün olaylarının sırayla işlenmesini istiyorsun. Ne yaparsın?",
        "You want all events of one user handled in order. What do you do?",
      ),
      options: [
        l("Kayıtları key'siz yazarım", "Write the records without a key"),
        l("Kullanıcı kimliğini key yaparım", "Use the user id as the key"),
        l("Group'a daha çok consumer eklerim", "Add more consumers to the group"),
        l("Her olayı ayrı bir topic'e yazarım", "Write each event to its own topic"),
      ],
      answer: 1,
      explain: l(
        "Aynı key aynı partition'a gider ve o partition'ı group'ta tek bir consumer okur; böylece kullanıcının olayları sırayla işlenir.",
        "The same key goes to the same partition, which one consumer in the group reads, so the user's events are handled in order.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "Key'li bir topic'in partition sayısını 4'ten 8'e çıkardın. Ne olabilir?",
        "You raise a keyed topic's partition count from 4 to 8. What can happen?",
      ),
      options: [
        l("Hiçbir şey, key'ler hep aynı partition'da kalır", "Nothing; keys always stay in the same partition"),
        l("Eski kayıtlar yeni partition'lara taşınır", "Old records are moved into the new partitions"),
        l("Bir key'in yeni kayıtları eskilerinden farklı bir partition'a gidebilir", "A key's new records can go to a different partition than its old ones"),
        l("Kafka buna izin vermez", "Kafka does not allow it"),
      ],
      answer: 2,
      explain: l(
        "Eski kayıtlar yerinde kalır ama `hash(key) % 8`, `hash(key) % 4` ile aynı olmayabilir. Aynı key'in yeni kayıtları başka bir partition'a gidebilir ve sıra bozulabilir.",
        "Old records stay where they are, but `hash(key) % 8` may differ from `hash(key) % 4`. New records for a key can go elsewhere, and order can break.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Idempotence kapalı, `max.in.flight.requests.per.connection=5`. Sıranın retry'larla bozulmaması için en basit çözüm nedir?",
        "Idempotence is off and `max.in.flight.requests.per.connection=5`. What is the simplest way to stop retries from reordering?",
      ),
      options: [
        l("`enable.idempotence=true` yapmak", "Set `enable.idempotence=true`"),
        l("`acks=0` yapmak", "Set `acks=0`"),
        l("Daha çok partition eklemek", "Add more partitions"),
        l("Retry'ları kapatıp kayıpları kabul etmek", "Turn off retries and accept losses"),
      ],
      answer: 0,
      explain: l(
        "Idempotent producer sıra numaralarıyla 5'e kadar in-flight istekte bile partition içindeki sırayı korur. Kafka 3.0'dan beri zaten varsayılan.",
        "The idempotent producer uses sequence numbers to keep order within a partition even with up to 5 requests in flight. It is the default since Kafka 3.0.",
      ),
      reviewStep: 8,
    },
  ],
};
