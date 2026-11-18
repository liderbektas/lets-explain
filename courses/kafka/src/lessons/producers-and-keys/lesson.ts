import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, ProducersAndKeysScene } from "./Scene";

export const producersAndKeys: Lesson = {
  slug: "producers-and-keys",
  title: l("Producer ve Key'ler", "Producers & Keys"),
  summary: l(
    "Producer bir kaydı hangi partition'a yazar? Key'ler sırayı nasıl korur ve partition eklemek neyi bozar?",
    "Which partition does a producer write a record to? How keys keep order, and what adding partitions breaks.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: ProducersAndKeysScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir kaydın parçalarını tanımak: key, value, timestamp, headers", "Know a record's parts: key, value, timestamp, headers"), step: 0 },
    { text: l("Key'siz olayların neden sırasını kaybettiğini görmek", "See why keyless events lose their order"), step: 1 },
    { text: l("Aynı key'in hep aynı partition'a gittiğini görmek", "See that the same key always goes to the same partition"), step: 2 },
    { text: l("Sıcak key'in yükü nasıl tek partition'a yığdığını görmek", "See how a hot key piles load onto one partition"), step: 5 },
    { text: l("Partition eklemenin key'leri neden taşıdığını anlamak", "Understand why adding partitions moves keys"), step: 6 },
  ],
  steps: [
    {
      short: l("Kayıt", "Record"),
      tag: "how",
      title: l("Producer ve gönderdiği kayıt", "The producer and the record it sends"),
      body: [
        l(
          "Kafka'ya yazan uygulamaya [[producer]] denir. Burada sipariş servisi bir producer ve 3 partition'lı `orders` topic'ine üç sipariş yazdı.",
          "An application that writes to Kafka is a [[producer]]. Here the order service is a producer, and it wrote three orders to the 3-partition `orders` topic.",
        ),
        l(
          "Her [[record]] dört parçadan oluşur: isteğe bağlı bir **key**, asıl içerik olan **value**, bir **timestamp** ve isteğe bağlı **headers**. Bu üç siparişin key'i yok, o yüzden üç partition'a sırayla dağıldılar.",
          "Every [[record]] has four parts: an optional **key**, the **value** that carries the content, a **timestamp**, and optional **headers**. These three orders have no key, so they were spread over the three partitions in turn.",
        ),
        l(
          "Önemli bir ayrıntı: kaydın hangi partition'a gideceğine broker değil, **producer** karar verir. Broker sadece kendisine gelen kaydı o partition'ın sonuna ekler.",
          "An important detail: it is the **producer**, not the broker, that decides which partition a record goes to. The broker just appends what it receives to the end of that partition.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka için key ve value sadece byte dizisidir. Producer onları bir serializer ile byte'a çevirir: düz metin için `StringSerializer`, JSON ya da Avro için başka serializer'lar. Şemaları Ekosistem bölümündeki Schema Registry dersinde göreceğiz.",
            "To Kafka, key and value are just bytes. The producer turns them into bytes with a serializer: `StringSerializer` for plain text, others for JSON or Avro. Schemas come in the Schema Registry lesson of the Ecosystem chapter.",
          ),
        },
      ],
    },
    {
      short: l("Sıra karışır", "Order breaks"),
      tag: "problem",
      title: l("Ali'nin olayları dağıldı", "Ali's events got scattered"),
      body: [
        l(
          "Ali bir sipariş verdi, sonra teslimat adresini değiştirdi, en sonunda da siparişi iptal etti. Üç olay sırayla yazıldı ama key'leri olmadığı için P0, P1 ve P2'ye ayrı ayrı düştüler.",
          "Ali placed an order, then changed the delivery address, and finally cancelled the order. The three events were written in order, but with no key they landed separately in P0, P1 and P2.",
        ),
        l(
          "Önceki dersten hatırla: sıra sadece **bir partition'ın içinde** garanti edilir. Kargo servisi P2'deki \"iptal\"i, P0'daki \"sipariş\"ten önce okuyabilir. O zaman iptal edilecek bir sipariş bulamaz, sonra siparişi görür ve paketi yola çıkarır.",
          "Remember the last lesson: order is only guaranteed **within one partition**. The shipping service may read the \"cancel\" in P2 before the \"order\" in P0. Then it finds no order to cancel, sees the order afterwards, and ships the parcel.",
        ),
        l(
          "Birbirine göre sıralı kalması gereken olayları aynı partition'a koymanın bir yoluna ihtiyacımız var.",
          "We need a way to put events that must stay in order relative to each other into the same partition.",
        ),
      ],
    },
    {
      short: l("Key", "Key"),
      tag: "idea",
      predict: {
        question: l(
          "Ali'nin üç olayı bu sefer `key = ali` ile yazılacak. Nereye düşecekler?",
          "This time Ali's three events will be written with `key = ali`. Where will they land?",
        ),
        options: [
          l("Yine üç farklı partition'a, sırayla", "Again into three different partitions, in turn"),
          l("Üçü de aynı partition'a", "All three into the same partition"),
          l("Her seferinde rastgele bir partition'a", "Into a random partition each time"),
        ],
        answer: 1,
        why: l(
          "Producer key'den partition'ı hesaplar ve aynı key her seferinde aynı sonucu verir. Bu yüzden Ali'nin bütün olayları aynı partition'a, yazıldıkları sırayla düşer.",
          "The producer works out the partition from the key, and the same key always gives the same answer. So all of Ali's events go to the same partition, in the order they were written.",
        ),
      },
      title: l("Key: aynı müşteri, aynı partition", "A key: same customer, same partition"),
      body: [
        l(
          "Bu sefer üç olay da key olarak müşteri numarasını taşıyor: `ali`. Üçü de P0'a düştü ve offset 2, 3, 4 olarak art arda dizildi.",
          "This time all three events carry the customer id as their key: `ali`. All three landed in P0 and lined up as offsets 2, 3 and 4.",
        ),
        l(
          "Artık Ali'nin olaylarını okuyan herkes onları doğru sırayla görür: önce sipariş, sonra adres, en son iptal. Diğer müşterilerin olayları başka partition'larda paralel akmaya devam eder.",
          "Now anyone reading Ali's events sees them in the right order: order, then address, then cancel. Other customers' events keep flowing in parallel in other partitions.",
        ),
        l(
          "[[key|Key]] seçmek, \"hangi olaylar birbirine göre sıralı olmalı?\" sorusunun cevabıdır. Genelde bu bir varlığın kimliğidir: müşteri numarası, sipariş numarası, cihaz numarası.",
          "Choosing a [[key]] answers the question \"which events must stay in order relative to each other?\". Usually it is an entity's id: a customer id, an order id, a device id.",
        ),
      ],
    },
    {
      short: l("Hash", "Hash"),
      tag: "how",
      title: l("Partition nasıl hesaplanır?", "How the partition is worked out"),
      body: [
        l(
          "Mehmet ve Zeynep de sipariş verdi. Mehmet'in iki olayı P1'e, Zeynep'inki P2'ye gitti.",
          "Mehmet and Zeynep placed orders too. Mehmet's two events went to P1, Zeynep's to P2.",
        ),
        l(
          "Producer bunu şöyle hesaplar: key'in byte'larından **murmur2** adlı bir hash fonksiyonuyla bir sayı üretir ve bu sayının partition sayısına bölümünden kalanı alır. Sahnenin üstündeki formül bu: `murmur2(key) % 3`.",
          "The producer works it out like this: it turns the key's bytes into a number with a hash function called **murmur2**, then takes the remainder after dividing by the number of partitions. That is the formula above the stage: `murmur2(key) % 3`.",
        ),
        l(
          "Hash her seferinde aynı sonucu verir, o yüzden kimseye sormaya gerek kalmaz: hangi producer yazarsa yazsın `mehmet` P1'e gider. Ama formülde partition sayısı da var. Bunu aklında tut.",
          "The hash gives the same answer every time, so nobody needs to be asked: whichever producer writes it, `mehmet` goes to P1. But the formula also contains the number of partitions. Keep that in mind.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Java client murmur2 kullanır. librdkafka tabanlı client'lar (örneğin Python ve Go için confluent-kafka) varsayılan olarak başka bir hash kullanır (`consistent_random`, CRC32). Aynı topic'e farklı dillerde yazıyorsan, aynı key'in aynı partition'a gitmesi için `partitioner=murmur2_random` ayarlamalısın.",
            "The Java client uses murmur2. librdkafka-based clients (such as confluent-kafka for Python and Go) default to a different hash (`consistent_random`, CRC32). If you write to one topic from several languages, set `partitioner=murmur2_random` so the same key lands in the same partition.",
          ),
        },
      ],
    },
    {
      short: l("Ortak partition", "Shared"),
      tag: "how",
      predict: {
        question: l(
          "Can adında yeni bir müşteri ilk siparişini verecek. Can için ne olur?",
          "A new customer called Can will place a first order. What happens for Can?",
        ),
        options: [
          l("Can için yeni bir partition açılır", "A new partition is opened for Can"),
          l("Hash'i mevcut partition'lardan birine düşer; orada başka müşteriler de olabilir", "The hash lands in one of the existing partitions, which can hold other customers too"),
          l("Kayıt reddedilir, çünkü partition'lar dolu", "The record is rejected because the partitions are full"),
        ],
        answer: 1,
        why: l(
          "Partition sayısı sabittir; key'ler bu partition'lara hash ile dağılır. Bir partition'da çok sayıda farklı key bulunur. Can'ın hash'i P0'a düştü, yani Ali ile aynı partition'ı paylaşıyor.",
          "The partition count is fixed, and keys are spread over those partitions by hash. One partition holds many different keys. Can's hash landed in P0, so he shares a partition with Ali.",
        ),
      },
      title: l("Bir partition, birçok key", "One partition, many keys"),
      body: [
        l(
          "Can'ın siparişi P0'a, Ali'nin olaylarının arkasına düştü. Key partition'ı seçer ama partition'ı sahiplenmez: milyonlarca müşteri sadece birkaç partition'ı paylaşır.",
          "Can's order landed in P0, behind Ali's events. A key picks a partition but does not own it: millions of customers share just a few partitions.",
        ),
        l(
          "Bu bir sorun değil. Ali'nin olayları kendi aralarında, Can'ınkiler de kendi aralarında sırayla kalır. İki müşterinin olayları arasındaki sıranın bir önemi yok.",
          "That is not a problem. Ali's events stay in order among themselves, and so do Can's. The order between two customers' events does not matter.",
        ),
      ],
    },
    {
      short: l("Sıcak key", "Hot key"),
      tag: "problem",
      title: l("Sıcak key: yük tek partition'a yığılıyor", "A hot key: load piles onto one partition"),
      body: [
        l(
          "Can aslında büyük bir şirket hesabı ve dakikalar içinde beş sipariş daha verdi. Hepsi aynı key'le P0'a gitti. Kargo servisinin üç okuyucusu partition'ları paylaştı ve aynı hızda okudu.",
          "Can is actually a big business account and placed five more orders within minutes. All of them went to P0 with the same key. The shipping service's three readers shared the partitions and read at the same speed.",
        ),
        l(
          "P1 ve P2'nin okuyucuları bitirip boşta beklerken P0'ın okuyucusu geride kaldı. Sayaçlara bak: P0'da 11, P1'de 4, P2'de 3 kayıt var. Bütün lag tek bir partition'da.",
          "The readers of P1 and P2 finished and sit idle, while P0's reader fell behind. Look at the counters: 11 records in P0, 4 in P1, 3 in P2. All the lag is in a single partition.",
        ),
        l(
          "Buna **sıcak key** (hot key) ya da sıcak partition denir. Partition eklemek de işe yaramaz: Can'ın bütün olayları yine tek bir partition'a gider.",
          "This is called a **hot key**, or a hot partition. Adding partitions does not help either: all of Can's events still go to one partition.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Key'i seçerken iki şeyi dengele: sırası korunması gereken olaylar aynı key'i paylaşmalı, ama key'in çok sayıda farklı değeri olmalı. Can'ın siparişleri birbirinden bağımsızsa, key olarak müşteri yerine sipariş numarasını kullanmak yükü dağıtır.",
            "Balance two things when choosing a key: events that must stay in order should share a key, but the key should have many different values. If Can's orders are independent of each other, using the order id instead of the customer id as the key spreads the load.",
          ),
        },
      ],
    },
    {
      short: l("Partition ekle", "Add partition"),
      tag: "reality",
      predict: {
        question: l(
          "Topic 3'ten 4 partition'a çıkarılacak, sonra Ali yeni bir sipariş verecek. Ali'nin yeni siparişi nereye gider?",
          "The topic will grow from 3 to 4 partitions, then Ali will place a new order. Where does Ali's new order go?",
        ),
        options: [
          l("Yine P0'a, eski olaylarının yanına", "To P0 again, next to the old events"),
          l("Hash yeni partition sayısıyla hesaplanır; başka bir partition'a gidebilir", "The hash is worked out with the new partition count, so it may go elsewhere"),
          l("Yeni partition'lara hiçbir key gitmez", "No key ever goes to the new partitions"),
        ],
        answer: 1,
        why: l(
          "Formül `murmur2(key) % partition sayısı`. Partition sayısı 3'ten 4'e çıkınca sonuç değişebilir. `ali` için şimdi P3 çıkıyor; eski olayları ise P0'da kaldı.",
          "The formula is `murmur2(key) % partition count`. When the count goes from 3 to 4 the result can change. For `ali` it is now P3, while the old events stayed in P0.",
        ),
      },
      title: l("Partition eklemek key'leri taşır", "Adding partitions moves keys"),
      body: [
        l(
          "Topic 4 partition'a çıktı ve Ali yeni bir sipariş verdi. Sipariş P0'a değil, yeni açılan **P3**'e gitti. Ali'nin eski olayları ise P0'da duruyor.",
          "The topic grew to 4 partitions, and Ali placed a new order. It went not to P0 but to the brand new **P3**. Ali's old events are still in P0.",
        ),
        l(
          "Artık Ali'nin olayları iki partition'a dağılmış durumda. Bir okuyucu P3'teki yeni siparişi, P0'daki eski iptalden önce görebilir. Key'lerin sağladığı sıra garantisi bu geçişte bozuldu.",
          "Ali's events are now split across two partitions. A reader may see the new order in P3 before the old cancel in P0. The ordering guarantee that keys gave us broke during the change.",
        ),
        l(
          "Kargo'nun üç okuyucusu da dört partition'ı yeniden paylaştı: Kargo 1 artık P0 ve P1'i birlikte okuyor.",
          "Shipping's three readers shared out the four partitions again: Shipping 1 now reads P0 and P1 together.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu yüzden key'li topic'lerde partition sayısı baştan, büyümeyi hesaba katarak seçilir. Sonradan artırmak gerekirse, eski partition'lar boşalana kadar beklemek ya da veriyi yeni bir topic'e taşımak gibi yollar izlenir.",
            "That is why the partition count of keyed topics is chosen up front, with growth in mind. If it must go up later, teams wait for the old partitions to drain or move the data to a new topic.",
          ),
        },
      ],
    },
    {
      short: l("Kurallar", "The rules"),
      tag: "how",
      predict: {
        question: l(
          "Producer bir kaydı `key = mehmet` ile ama `partition = 0` diye elle seçerek gönderecek. Kayıt nereye gider?",
          "The producer will send a record with `key = mehmet`, but with `partition = 0` chosen by hand. Where does the record go?",
        ),
        options: [
          l("Key'in hash'inin gösterdiği yere (şimdi P2)", "Where the key's hash points (now P2)"),
          l("Elle seçilen P0'a", "To P0, chosen by hand"),
          l("Hata verir, çünkü key ve partition çelişiyor", "It fails, because the key and partition disagree"),
        ],
        answer: 1,
        why: l(
          "Elle verilen partition her zaman kazanır. Producer key'e ancak partition verilmemişse bakar.",
          "A partition given by hand always wins. The producer only looks at the key if no partition was given.",
        ),
      },
      title: l("Producer partition'ı hangi sırayla seçer?", "How the producer picks a partition"),
      body: [
        l(
          "Kayıt P0'a gitti, Mehmet'in key'inin hash'i P2'yi gösterse bile. Producer partition'ı şu sırayla seçer:",
          "The record went to P0, even though Mehmet's key hashes to P2. The producer picks the partition in this order:",
        ),
        l(
          "**1.** Kayıtta partition elle verilmişse oraya. **2.** Kendi yazdığın bir partitioner (`partitioner.class`) varsa onun seçtiğine. **3.** Key varsa `murmur2(key) % partition sayısı`. **4.** Key yoksa \"yapışkan\" (sticky) dağıtım: bir partition için bir batch doldurulur, sonra başka bir partition'a geçilir.",
          "**1.** If the record names a partition, there. **2.** If you wrote your own partitioner (`partitioner.class`), wherever it says. **3.** If there is a key, `murmur2(key) % partition count`. **4.** With no key, \"sticky\" spreading: a batch is filled for one partition, then the producer moves to another.",
        ),
        l(
          "Gündelik kullanımda neredeyse her zaman 3. ve 4. kural geçerlidir. Elle partition seçmek nadiren gerekir ve partition sayısı değişirse kırılır.",
          "In everyday use, rules 3 and 4 nearly always apply. Choosing a partition by hand is rarely needed and breaks if the partition count changes.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka 3.3'ten beri (KIP-794) key'siz kayıtların yapışkan dağıtımı producer'ın içinde yerleşik ve daha az yüklü partition'ları tercih ediyor. `partitioner.ignore.keys=true` ayarı key'leri dağıtımda tamamen yok sayar.",
            "Since Kafka 3.3 (KIP-794) sticky spreading of keyless records is built into the producer and prefers less loaded partitions. Setting `partitioner.ignore.keys=true` ignores keys for spreading altogether.",
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
          "Topic 3 boş partition'la başlıyor. Dört müşterinin her biri için key'li sipariş yazabilir, key'siz sipariş yazabilir ve partition ekleyebilirsin (en fazla 4).",
          "The topic starts with 3 empty partitions. You can write a keyed order for each of four customers, write a keyless order, and add partitions (up to 4).",
        ),
        l(
          "Her yazmadan sonra olay listesi kaydın hangi partition'a ve neden gittiğini söyler. **3 görev** var; az hamleyle bitirirsen 3 yıldız alırsın.",
          "After each write the event list says which partition the record went to and why. There are **3 missions**; finish with few moves for 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "İpucu: 3 partition'da Ali ve Can P0'a, Mehmet P1'e, Zeynep P2'ye gider. Partition sayısı değişince bu tablo da değişir.",
            "Tip: with 3 partitions Ali and Can go to P0, Mehmet to P1, Zeynep to P2. When the partition count changes, so does this table.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Bir [[record]] key, value, timestamp ve headers'tan oluşur. Hangi partition'a gideceğine producer karar verir.",
      "A [[record]] has a key, a value, a timestamp and headers. The producer decides which partition it goes to.",
    ),
    l(
      "Aynı [[key]], partition sayısı değişmediği sürece hep aynı partition'a gider: `murmur2(key) % partition sayısı`.",
      "The same [[key]] always goes to the same partition while the partition count stays the same: `murmur2(key) % partition count`.",
    ),
    l(
      "Birbirine göre sıralı kalması gereken olaylara aynı key'i ver; genelde bu bir müşteri ya da sipariş numarasıdır.",
      "Give the same key to events that must stay in order relative to each other; usually a customer or order id.",
    ),
    l(
      "Bir partition birçok key taşır. Trafiğin çoğu tek bir key'den gelirse o partition sıcaklaşır ve geride kalır.",
      "One partition carries many keys. If most traffic comes from one key, that partition runs hot and falls behind.",
    ),
    l(
      "Partition eklemek key'lerin gittiği yeri değiştirir; key'li topic'lerde partition sayısını baştan iyi seç.",
      "Adding partitions changes where keys go; for keyed topics, choose the partition count well up front.",
    ),
    l(
      "Seçim sırası: elle verilen partition, özel partitioner, key'in hash'i, key yoksa sticky dağıtım.",
      "The order of choice: partition given by hand, a custom partitioner, the key's hash, and sticky spreading if there is no key.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Partition sayısı değişmediği sürece, aynı key'le yazılan iki kayıt için hangisi doğrudur?",
        "While the partition count stays the same, what is true of two records written with the same key?",
      ),
      options: [
        l("Farklı partition'lara dağılırlar", "They are spread over different partitions"),
        l("Aynı partition'a, yazıldıkları sırayla düşerler", "They land in the same partition, in the order written"),
        l("İkincisi birincinin üzerine yazılır", "The second overwrites the first"),
        l("Hangi partition'a gideceklerini broker rastgele seçer", "The broker picks their partition at random"),
      ],
      answer: 1,
      explain: l(
        "Producer partition'ı key'in hash'inden hesaplar; aynı key aynı sonucu verir. Log'a ekleme yapıldığı için ikisi de saklanır.",
        "The producer works out the partition from the key's hash, and the same key gives the same result. The log only appends, so both are kept.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "Key'li bir topic 6'dan 8 partition'a çıkarıldı. `user-42` key'li yeni kayıtlara ne olabilir?",
        "A keyed topic grows from 6 to 8 partitions. What can happen to new records with key `user-42`?",
      ),
      options: [
        l("Eski kayıtlarıyla aynı partition'a gitmeleri garanti", "They are guaranteed to go to the same partition as the old ones"),
        l("Eski kayıtlarından farklı bir partition'a gidebilirler", "They may go to a different partition than the old ones"),
        l("Yazılamazlar", "They cannot be written"),
        l("Eski kayıtlar yeni partition'a taşınır", "The old records move to the new partition"),
      ],
      answer: 1,
      explain: l(
        "Hash'in bölündüğü sayı değişti, bu yüzden key başka bir partition'a düşebilir. Eski kayıtlar ise olduğu yerde kalır.",
        "The number the hash is divided by changed, so the key may land in another partition. The old records stay where they are.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Her müşterinin olaylarının sırayla işlenmesi gerekiyor. Producer'da ne yapmalısın?",
        "Each customer's events must be processed in order. What should the producer do?",
      ),
      options: [
        l("Key vermemeli, Kafka sırayı korur", "Leave out the key; Kafka keeps the order"),
        l("Key olarak müşteri numarasını kullanmalı", "Use the customer id as the key"),
        l("Her olayı farklı bir partition'a elle göndermeli", "Send each event to a different partition by hand"),
        l("Topic'i 1 partition'la sınırlamak tek yoldur", "Limiting the topic to 1 partition is the only way"),
      ],
      answer: 1,
      explain: l(
        "Müşteri numarası key olursa bir müşterinin bütün olayları aynı partition'da sıralı kalır, farklı müşteriler ise paralel işlenir. Tek partition da sırayı korur ama paralelliği yok eder.",
        "With the customer id as key, each customer's events stay in order in one partition, while different customers are processed in parallel. One partition also keeps order but kills parallelism.",
      ),
      reviewStep: 2,
    },
    {
      question: l("Hangisi sıcak (hot) bir partition'a yol açar?", "Which of these causes a hot partition?"),
      options: [
        l("Trafiğin çoğunun tek bir key'den gelmesi", "Most of the traffic coming from a single key"),
        l("Çok sayıda farklı key kullanmak", "Using many different keys"),
        l("Key'siz kayıtlar", "Records without a key"),
        l("Okuyucuların commit etmesi", "Readers committing"),
      ],
      answer: 0,
      explain: l(
        "Aynı key'in bütün kayıtları aynı partition'a gider. Bir key çok yoğunsa yükü o partition ve onun tek okuyucusu taşır.",
        "All records with one key go to one partition. If one key is very busy, that partition and its single reader carry the load.",
      ),
      reviewStep: 5,
    },
  ],
};
