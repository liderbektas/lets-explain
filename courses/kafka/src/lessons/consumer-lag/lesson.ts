import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, ConsumerLagScene } from "./Scene";

export const consumerLag: Lesson = {
  slug: "consumer-lag",
  title: l("Consumer lag", "Consumer Lag"),
  summary: l(
    "Consumer'lar ne kadar geride? Lag'in nasıl hesaplandığı, neden büyüdüğü ve nasıl eritileceği.",
    "How far behind are the consumers? How lag is computed, why it grows and how to work it off.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: ConsumerLagScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Lag'i log-end offset ve committed offset'ten hesaplamak", "Compute lag from the log-end and committed offsets"), step: 0 },
    { text: l("Lag'in neden büyüdüğünü görmek", "See why lag grows"), step: 2 },
    { text: l("Consumer eklemenin ne zaman işe yaradığını öğrenmek", "Learn when adding consumers helps"), step: 4 },
    { text: l("Partition sayısından fazla consumer'ın boşta kaldığını görmek", "See consumers beyond the partition count sit idle"), step: 5 },
    { text: l("Sıcak partition'ı ve çözümlerini tanımak", "Recognise a hot partition and its fixes"), step: 7 },
    { text: l("Retention'ın okunmamış kayıtları sildiğini ve lag'in nasıl izlendiğini görmek", "See retention delete unread records, and how lag is monitored"), step: 9 },
  ],
  steps: [
    {
      short: l("Lag nedir?", "What is lag?"),
      tag: "how",
      title: l("Lag: yazılan ile işlenen arasındaki fark", "Lag: the gap between written and handled"),
      body: [
        l(
          "Tıklama servisi `clicks` topic'ine 6 kayıt yazdı. `analytics` group'undaki Analitik-1 bunlardan 2'sini işledi ve commit etti.",
          "The click service wrote 6 records to the `clicks` topic. Analytics-1 in the `analytics` group handled 2 of them and committed.",
        ),
        l(
          "Sıradaki kaydın offset'i 6: buna [[logEndOffset]] denir. Analitik-1'in bayrağı commit ettiği offset'te, yani 2'de duruyor.",
          "The next record will get offset 6: that is the [[logEndOffset]]. Analytics-1's flag stands at its committed offset, 2.",
        ),
        l(
          "[[lag|Consumer lag]] bu ikisinin farkıdır: **lag = log-end offset − committed offset = 6 − 2 = 4.** Yani 4 kayıt yazılmış ama henüz işlenmemiş.",
          "[[lag|Consumer lag]] is the difference: **lag = log-end offset − committed offset = 6 − 2 = 4.** Four records are written but not handled yet.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Lag ne kadar küçükse consumer o kadar \"canlı\". Büyük lag, consumer'ın olaylara dakikalar hatta saatler geriden baktığı demek.",
            "The smaller the lag, the more \"live\" the consumer. A large lag means it sees events minutes or even hours late.",
          ),
        },
      ],
    },
    {
      short: l("Aynı hızda", "Same pace"),
      tag: "how",
      predict: {
        question: l(
          "Producer 3 kayıt daha yazacak, Analitik-1 de aynı sürede 3 kayıt işleyip commit edecek. Lag ne olur?",
          "The producer will write 3 more records, and in the same time Analytics-1 will handle and commit 3. What happens to the lag?",
        ),
        options: [l("4'te kalır", "It stays at 4"), l("1'e düşer", "It drops to 1"), l("7'ye çıkar", "It grows to 7")],
        answer: 0,
        why: l(
          "Lag yazılan ile işlenen arasındaki farktır. İkisi de 3 arttı, fark değişmedi: 9 − 5 = 4.",
          "Lag is the gap between written and handled. Both grew by 3, so the gap stayed the same: 9 − 5 = 4.",
        ),
      },
      title: l("Aynı hızda giderse", "Keeping pace"),
      body: [
        l(
          "Producer 3 kayıt yazdı, Analitik-1 de 3 kayıt işledi. Log-end offset 9'a, committed offset 5'e çıktı. Lag yine **4**.",
          "The producer wrote 3 records and Analytics-1 handled 3. The log-end offset rose to 9 and the committed offset to 5. Lag is still **4**.",
        ),
        l(
          "Lag'in kendisi tek başına iyi ya da kötü değil. Önemli olan **yönü**: sabit duran küçük bir lag, consumer'ın yetiştiği anlamına gelir.",
          "Lag on its own is neither good nor bad. What matters is its **direction**: a small, steady lag means the consumer keeps up.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada lag'i commit edilmiş offset'ten hesaplıyoruz, Kafka araçları da öyle yapar. Consumer bir kaydı okuyup henüz commit etmediyse, o kayıt lag'de hâlâ görünür.",
            "Here lag is computed from the committed offset, as Kafka's tools do. If a consumer has read a record but not committed yet, it still shows in the lag.",
          ),
        },
      ],
    },
    {
      short: l("Yavaş consumer", "Slow consumer"),
      tag: "problem",
      title: l("Yavaş consumer: lag büyür", "A slow consumer: lag grows"),
      body: [
        l(
          "Trafik arttı: her turda 2 kayıt geliyor ama Analitik-1 hâlâ 1 kayıt işleyebiliyor.",
          "Traffic grew: each round 2 records arrive, but Analytics-1 can still only handle 1.",
        ),
        l(
          "Her turda lag 1 büyüdü: 4'ten **7**'ye. Bu böyle giderse lag hiç durmadan büyür.",
          "Every round the lag grew by 1: from 4 to **7**. If this goes on, it never stops growing.",
        ),
        l(
          "Kural basit: **gelen hız, işleme hızından büyükse lag büyür.** Çözüm ya işleme gücünü artırmak ya da her kaydı daha hızlı işlemek.",
          "The rule is simple: **if records arrive faster than they are handled, lag grows.** The fix is more processing power or handling each record faster.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bandın soluna kayıp giden koliler de retention: log her partition'da sadece en yeni kayıtları tutuyor. Lag bu sınırı geçerse ne olacağını birazdan göreceğiz.",
            "The parcels sliding off the left end are retention: the log keeps only the newest records per partition. Soon we'll see what happens if the lag goes past that.",
          ),
        },
      ],
    },
    {
      short: l("Partition başına", "Per partition"),
      tag: "how",
      title: l("Lag partition başına sayılır", "Lag is counted per partition"),
      body: [
        l(
          "Artık `clicks` topic'inin 3 partition'ı var ve hepsini tek consumer, Analitik-1 okuyor. Her partition'ın kendi log-end offset'i, kendi committed offset'i ve kendi lag'i var.",
          "The `clicks` topic now has 3 partitions, all read by one consumer, Analytics-1. Each partition has its own log-end offset, committed offset and lag.",
        ),
        l(
          "Her saniye her partition'a 1 kayıt geliyor, yani toplam **3 kayıt/sn**. Analitik-1 saniyede sadece **2** kayıt işleyebiliyor.",
          "Every second each partition gets 1 record, **3 records/s** in total. Analytics-1 handles only **2** a second.",
        ),
        l(
          "Group'un toplam lag'i partition lag'lerinin toplamı. Her saniye 1 büyüyor: 9'dan **12**'ye.",
          "The group's total lag is the sum of the partition lags. It grows by 1 every second: from 9 to **12**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek bir consumer'ın hızı sabit değil; kayıt boyutuna, veritabanı gecikmesine, ağa göre değişir. Burada her consumer saniyede tam 2 kayıt işliyor ki hesap kolay görünsün.",
            "A real consumer's speed is not fixed; it depends on record size, database latency, the network. Here each consumer handles exactly 2 records a second so the arithmetic stays visible.",
          ),
        },
      ],
    },
    {
      short: l("Consumer ekle", "Add consumers"),
      tag: "idea",
      predict: {
        question: l(
          "Group'a iki consumer daha ekliyoruz: 3 partition, 3 consumer. Her biri saniyede 2 kayıt işliyor, her partition'a saniyede 1 kayıt geliyor. Lag ne olur?",
          "We add two more consumers: 3 partitions, 3 consumers. Each handles 2 records a second, and each partition gets 1 a second. What happens to the lag?",
        ),
        options: [
          l("Azalır, her consumer kendi partition'ını eritir", "It shrinks: each consumer works off its own partition"),
          l("Aynı kalır", "It stays the same"),
          l("Yine büyür", "It still grows"),
        ],
        answer: 0,
        why: l(
          "Her partition'a saniyede 1 kayıt geliyor ama sahibi 2 kayıt işleyebiliyor. Her saniye her partition'ın lag'i 1 azalır.",
          "Each partition gets 1 record a second but its owner can handle 2, so every partition's lag drops by 1 each second.",
        ),
      },
      title: l("Daha çok consumer, daha çok işleme gücü", "More consumers, more processing power"),
      body: [
        l(
          "Analitik-2 ve Analitik-3 group'a katıldı. Kafka partition'ları yeniden dağıttı ([[rebalance]]): artık her consumer'ın tek bir partition'ı var.",
          "Analytics-2 and Analytics-3 joined the group. Kafka handed the partitions out again ([[rebalance]]): now each consumer has one partition.",
        ),
        l(
          "İşleme gücü saniyede 2'den **6** kayda çıktı, gelen trafik ise 3. Lag her saniye 3 azalıyor: 12'den **3**'e indi.",
          "Processing power went from 2 to **6** records a second, while 3 arrive. Lag drops by 3 every second: from 12 down to **3**.",
        ),
        l(
          "Consumer group'ların asıl gücü bu: aynı işi yapan consumer'ları artırarak bir topic'i paralel okuyabilirsin.",
          "This is the real power of consumer groups: add consumers doing the same job and you read a topic in parallel.",
        ),
      ],
    },
    {
      short: l("Fazla consumer", "Too many"),
      tag: "problem",
      predict: {
        question: l(
          "3 partition var, group'ta 3 consumer var. 4. consumer'ı eklersen ne olur?",
          "There are 3 partitions and 3 consumers in the group. What happens if you add a 4th consumer?",
        ),
        options: [
          l("Her consumer biraz daha hızlanır", "Every consumer gets a little faster"),
          l("4. consumer boşta bekler, ona partition düşmez", "The 4th consumer sits idle; it gets no partition"),
          l("Bir partition iki consumer arasında bölünür", "One partition is split between two consumers"),
        ],
        answer: 1,
        why: l(
          "Bir group'ta bir partition'ı aynı anda tek bir consumer okur. 3 partition 3 consumer'a dağıtıldı; 4. consumer'a verilecek partition kalmadı.",
          "Within a group, a partition is read by one consumer at a time. The 3 partitions went to 3 consumers; none is left for the 4th.",
        ),
      },
      title: l("Partition'dan fazla consumer", "More consumers than partitions"),
      body: [
        l(
          "Analitik-4 katıldı ama rebalance'tan eli boş çıktı. Kenarda duruyor: hiçbir partition'ı yok, hiçbir şey okumuyor.",
          "Analytics-4 joined but came out of the rebalance empty-handed. It stands aside: no partition, reading nothing.",
        ),
        l(
          "Lag yine de sıfıra indi, ama bunu ilk üç consumer yaptı. Analitik-4'ün katkısı **sıfır**.",
          "Lag still went to zero, but the first three consumers did that. Analytics-4 added **nothing**.",
        ),
        l(
          "Bir group'taki paralellik partition sayısıyla sınırlıdır. Daha çok paralellik istiyorsan önce daha çok partition gerekir.",
          "A group's parallelism is capped by the partition count. For more parallelism you first need more partitions.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Boşta bekleyen consumer yine de işe yarar: biri çökerse, rebalance'ta onun partition'ını hemen devralır.",
            "An idle consumer is still useful: if another one crashes, it takes over that partition at the next rebalance.",
          ),
        },
      ],
    },
    {
      short: l("Sıcak partition", "Hot partition"),
      tag: "problem",
      predict: {
        question: l(
          "Bütün tıklamalar key = \"istanbul\" ile yazılmaya başladı ve hepsi partition 2'ye gidiyor. Group'a 4. consumer'ı eklemek partition 2'nin lag'ine yardım eder mi?",
          "Every click is now written with key = \"istanbul\" and all of them go to partition 2. Will adding a 4th consumer help partition 2's lag?",
        ),
        options: [
          l("Evet, partition 2'nin işi ikiye bölünür", "Yes, partition 2's work is split in two"),
          l("Hayır, partition 2'yi group'tan yine tek bir consumer okur", "No, partition 2 is still read by one consumer in the group"),
          l("Evet, lag hemen sıfırlanır", "Yes, the lag resets at once"),
        ],
        answer: 1,
        why: l(
          "Yeni consumer'a partition kalmadı ve partition 2'yi Analitik-3'ten başkası okuyamaz. Sorun consumer sayısında değil, trafiğin tek partition'a yığılmasında.",
          "No partition is left for the new consumer, and nobody but Analytics-3 can read partition 2. The problem is not the consumer count but all the traffic piling into one partition.",
        ),
      },
      title: l("Sıcak partition", "A hot partition"),
      body: [
        l(
          "Bir kampanya yüzünden tıklamaların hepsi aynı key'le, `\"istanbul\"` ile geliyor. Aynı key aynı partition'a gittiği için trafiğin tamamı partition 2'ye yığıldı: bir [[hotPartition]].",
          "Because of a campaign, every click comes with the same key, `\"istanbul\"`. The same key goes to the same partition, so all traffic piled into partition 2: a [[hotPartition]].",
        ),
        l(
          "Partition 2'ye saniyede 3 kayıt geliyor, Analitik-3 ise 2 kayıt işleyebiliyor. Diğer iki consumer'ın işi yok. Analitik-4'ü eklemek de bir şey değiştirmedi: boşta duruyor.",
          "Partition 2 gets 3 records a second while Analytics-3 handles 2. The other two consumers have nothing to do. Adding Analytics-4 changed nothing: it is idle.",
        ),
        l(
          "Toplam işleme gücü bol, ama yanlış yerde. Partition 2'nin lag'i her saniye büyüyor.",
          "There is plenty of processing power in total, but in the wrong place. Partition 2's lag grows every second.",
        ),
      ],
    },
    {
      short: l("Hızlandır", "Speed up"),
      tag: "idea",
      title: l("Sıcak partition'ı eritmek", "Working off a hot partition"),
      body: [
        l(
          "Boşta duran Analitik-4 ayrıldı ve consumer kodu hızlandırıldı: örneğin veritabanına kayıtları tek tek değil, toplu yazmak. Artık her consumer saniyede **4** kayıt işliyor.",
          "Idle Analytics-4 left and the consumer code got faster, for example by writing to the database in batches instead of one by one. Each consumer now handles **4** records a second.",
        ),
        l(
          "Partition 2'ye hâlâ saniyede 3 kayıt geliyor ama Analitik-3 4 tane işleyebiliyor. Lag her saniye 1 azalıyor: 4'ten **1**'e indi.",
          "Partition 2 still gets 3 records a second, but Analytics-3 can handle 4. The lag drops by 1 each second: from 4 down to **1**.",
        ),
        l(
          "Kalıcı çözüm genelde key'i değiştirmek: şehir yerine kullanıcı kimliği gibi, trafiği partition'lara eşit dağıtan bir key seçmek. Ama key, sıra garantisinin de temeli; değiştirirken hangi olayların sırası önemli, ona dikkat et.",
          "The lasting fix is usually a different key: one that spreads traffic evenly, such as the user id instead of the city. But the key is also the basis of ordering, so check which events need their order kept before you change it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Klasik consumer group'larda bir partition'ı aynı anda tek consumer okur. Kafka 4.0'da deneme olarak gelen share group'lar (KIP-932) birden çok consumer'ın aynı partition'ı paylaşmasına izin veriyor, ama bunun bedeli sıra garantisini kaybetmek.",
            "In classic consumer groups one consumer reads a partition at a time. Share groups (KIP-932), which arrived in Kafka 4.0 as an early-access feature, let several consumers share a partition, at the cost of ordering.",
          ),
        },
      ],
    },
    {
      short: l("Retention", "Retention"),
      tag: "reality",
      title: l("Retention lag'i beklemez", "Retention doesn't wait for lag"),
      body: [
        l(
          "Analitik servisi bir bakım yüzünden durduruldu. Group'ta kimse yok, ama tıklamalar gelmeye devam ediyor ve lag her partition'da her saniye 1 büyüyor.",
          "The analytics service was stopped for maintenance. Nobody is in the group, but clicks keep coming, and every partition's lag grows by 1 each second.",
        ),
        l(
          "Bu sahnede log her partition'da sadece en yeni 8 kaydı tutuyor. Lag 8'i geçince en eski kayıt [[retention]] ile silindi, ve o kayıt **hiç okunmamıştı**. Sayaç 3 kayıp gösteriyor.",
          "In this scene the log keeps only the newest 8 records per partition. When the lag passed 8, the oldest record was deleted by [[retention]], and it had **never been read**. The counter shows 3 lost.",
        ),
        l(
          "Group geri geldiğinde silinen kayıtları okuyamaz. [[autoOffsetReset]] ayarına göre kalan en eski kayıttan ya da en yeniden devam eder.",
          "When the group comes back it can never read the deleted records. Depending on [[autoOffsetReset]], it continues from the oldest record left or from the newest.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek retention kayıt sayısına göre değil, zamana (`retention.ms`, varsayılan 7 gün) veya boyuta (`retention.bytes`) göre çalışır ve segment segment siler. Fikir aynı: lag retention süresinden uzun sürerse veri kaybolur.",
            "Real retention works on time (`retention.ms`, 7 days by default) or size (`retention.bytes`), not record count, and deletes whole segments. The idea is the same: if lag lasts longer than retention, data is lost.",
          ),
        },
      ],
    },
    {
      short: l("İzlemek", "Monitoring"),
      tag: "reality",
      title: l("Lag'i izlemek", "Monitoring lag"),
      body: [
        l(
          "Gerçek bir cluster'da lag'e Kafka'nın komut satırı aracıyla bakılır: `kafka-consumer-groups.sh --describe --group analytics`.",
          "On a real cluster you check lag with Kafka's command-line tool: `kafka-consumer-groups.sh --describe --group analytics`.",
        ),
        l(
          "Çıktıda her partition için bir satır var. **CURRENT-OFFSET** group'un commit ettiği offset, **LOG-END-OFFSET** sıradaki yazılacak offset, **LAG** de ikisinin farkı.",
          "The output has one row per partition. **CURRENT-OFFSET** is the group's committed offset, **LOG-END-OFFSET** the next offset to be written, and **LAG** the difference.",
        ),
        l(
          "Burada partition 2 geride: lag 8. Partition 1 tamamen yetişmiş. Toplam lag'e bakıp geçmek yerine partition'lara tek tek bakmak, sıcak partition'ı hemen gösterir.",
          "Here partition 2 is behind: lag 8. Partition 1 has fully caught up. Looking at each partition instead of only the total points straight at a hot partition.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Üretimde lag sürekli izlenir ve büyüyünce alarm çalar. Consumer'ın kendi `records-lag-max` metriği ya da cluster'ı dışarıdan izleyen araçlar (örneğin Burrow) kullanılır. Kayıt sayısı kadar \"kaç saniye geride\" bilgisi de önemlidir.",
            "In production, lag is watched all the time and raises an alert when it grows. People use the consumer's own `records-lag-max` metric or tools that watch the cluster from outside, such as Burrow. \"How many seconds behind\" matters as much as the record count.",
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
          "Sahnenin altındaki düğmelerle zamanı saniye saniye ilerletebilir, group'a consumer ekleyip çıkarabilir, sıcak key'i açıp kapatabilir ve consumer kodunu hızlandırabilirsin.",
          "With the buttons under the scene you can move time on a second at a time, add and remove consumers, turn the hot key on and off, and speed up the consumer code.",
        ),
        l(
          "Her saniye: normalde her partition'a 1 kayıt gelir (sıcak key açıkken 3 kayıt partition 2'ye gider), her consumer 2 kayıt işler (hızlıyken 4), retention da her partition'da en yeni 8 kaydı tutar.",
          "Each second: normally every partition gets 1 record (with the hot key on, 3 go to partition 2), every consumer handles 2 (4 when fast), and retention keeps the newest 8 per partition.",
        ),
        l(
          "**3 görev** var: lag'i sıfırlamak, sıcak partition'ı eritmek ve retention'a kayıt kaybettirmek. Az hamleyle bitirirsen 3 yıldız alırsın.",
          "There are **3 missions**: clear the lag, work off a hot partition, and get retention to lose a record. Few moves earn 3 stars.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Üstteki \"Gelen\" ve \"İşleme gücü\" sayaçlarını karşılaştır. İşleme gücü gelen trafikten azsa lag büyür. Ama dikkat: boşta duran ya da yanlış partition'da duran güç sayılmaz.",
            "Compare the \"Incoming\" and \"Capacity\" counters. If capacity is below incoming, lag grows. But careful: idle power, or power on the wrong partition, doesn't count.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[lag|Lag]] = [[logEndOffset]] − committed offset, her partition için ayrı. Group'un lag'i partition lag'lerinin toplamı.",
      "[[lag|Lag]] = [[logEndOffset]] − committed offset, per partition. A group's lag is the sum over its partitions.",
    ),
    l(
      "Kayıtlar işlenmekten hızlı geliyorsa lag büyür. Önemli olan lag'in büyüklüğünden çok yönü.",
      "If records arrive faster than they are handled, lag grows. Its direction matters more than its size.",
    ),
    l(
      "Consumer eklemek işleme gücünü artırır, ama bir group'ta partition sayısından fazla consumer boşta kalır.",
      "Adding consumers adds processing power, but consumers beyond the partition count sit idle.",
    ),
    l(
      "Bir [[hotPartition]] tek consumer'a yüklenir; consumer eklemek ona yardım etmez. Çözüm daha hızlı işlemek ya da trafiği dağıtan bir key.",
      "A [[hotPartition]] loads one consumer; adding consumers does not help it. The fix is faster processing or a key that spreads traffic.",
    ),
    l(
      "Lag retention süresini geçerse okunmamış kayıtlar silinir ve bir daha okunamaz.",
      "If lag outlasts retention, unread records are deleted and can never be read.",
    ),
    l(
      "Lag'i `kafka-consumer-groups.sh --describe` ile partition partition görürsün; üretimde sürekli izlenir.",
      "`kafka-consumer-groups.sh --describe` shows lag partition by partition; in production it is watched all the time.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir partition'ın log-end offset'i 120, group'un o partition'daki committed offset'i 95. Lag kaç?",
        "A partition's log-end offset is 120 and the group's committed offset there is 95. What is the lag?",
      ),
      options: [l("95", "95"), l("25", "25"), l("120", "120"), l("215", "215")],
      answer: 1,
      explain: l("Lag = log-end offset − committed offset = 120 − 95 = 25.", "Lag = log-end offset − committed offset = 120 − 95 = 25."),
      reviewStep: 0,
    },
    {
      question: l(
        "Topic'in 6 partition'ı var ve group'ta 6 consumer var. Lag büyüyor. 4 consumer daha eklemek işe yarar mı?",
        "A topic has 6 partitions and the group has 6 consumers. Lag is growing. Will adding 4 more consumers help?",
      ),
      options: [
        l("Evet, işleme gücü %66 artar", "Yes, processing power rises by 66%"),
        l("Hayır, yeni 4 consumer boşta kalır; önce partition sayısı artmalı", "No, the 4 new ones sit idle; the partition count has to grow first"),
        l("Evet, ama sadece key'siz kayıtlar için", "Yes, but only for records without a key"),
        l("Hayır, consumer eklemek lag'i her zaman artırır", "No, adding consumers always increases lag"),
      ],
      answer: 1,
      explain: l(
        "Bir group'ta bir partition'ı aynı anda tek consumer okur. 6 partition'dan fazla consumer'a iş düşmez.",
        "Within a group, one consumer reads a partition at a time. Consumers beyond the 6 partitions get no work.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Lag'in neredeyse tamamı tek bir partition'da ve diğer consumer'lar boş duruyor. En olası sebep nedir?",
        "Nearly all the lag is in one partition while the other consumers are idle. What is the most likely cause?",
      ),
      options: [
        l("Retention çok uzun", "Retention is too long"),
        l("Çok sık kullanılan bir key trafiği tek partition'a yığıyor", "A very common key piles traffic into one partition"),
        l("auto.offset.reset yanlış ayarlı", "auto.offset.reset is set wrong"),
        l("Topic'in çok fazla partition'ı var", "The topic has too many partitions"),
      ],
      answer: 1,
      explain: l(
        "Aynı key aynı partition'a gider. Bir key trafiğin çoğunu taşıyorsa o partition sıcaklaşır ve tek consumer'a yüklenir.",
        "The same key goes to the same partition. If one key carries most of the traffic, that partition gets hot and loads a single consumer.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Bir group 10 gün boyunca durdu. Topic'in retention'ı 7 gün. Group geri gelince ne olur?",
        "A group was stopped for 10 days. The topic's retention is 7 days. What happens when the group comes back?",
      ),
      options: [
        l("Kaldığı yerden devam eder, hiçbir şey kaybolmaz", "It continues where it left off; nothing is lost"),
        l("İlk 3 günün okunmamış kayıtları silinmiştir, onları hiç okuyamaz", "The unread records of the first 3 days are gone and can never be read"),
        l("Kafka group geri gelene kadar silmeyi bekler", "Kafka waits for the group before deleting"),
        l("Topic tamamen silinir", "The whole topic is deleted"),
      ],
      answer: 1,
      explain: l(
        "Retention okuyucuları beklemez. 7 günden eski kayıtlar silindi; group kalan en eski ya da en yeni kayıttan devam eder (auto.offset.reset'e göre).",
        "Retention waits for no reader. Records older than 7 days were deleted; the group continues from the oldest or newest left (per auto.offset.reset).",
      ),
      reviewStep: 8,
    },
  ],
};
