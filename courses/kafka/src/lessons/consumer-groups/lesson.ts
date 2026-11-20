import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, ConsumerGroupsScene } from "./Scene";

export const consumerGroups: Lesson = {
  slug: "consumer-groups",
  title: l("Consumer Group'lar", "Consumer Groups"),
  summary: l(
    "Okuyucular bir topic'i nasıl paylaşır, biri çökünce iş kime geçer ve iki farklı servis aynı olayları nasıl ayrı ayrı okur?",
    "How readers share a topic, who takes over when one crashes, and how two services read the same events separately.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: ConsumerGroupsScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir group'un partition'ları üyelerine nasıl paylaştırdığını görmek", "See how a group shares partitions among its members"), step: 1 },
    { text: l("Çöken üyenin işinin commit'ten devralındığını görmek", "See a crashed member's work taken over from the commit"), step: 2 },
    { text: l("Farklı group'ların birbirinden bağımsız okuduğunu görmek", "See that different groups read independently"), step: 3 },
    { text: l("Rebalance'ın ne zaman olduğunu ve bedelini öğrenmek", "Learn when a rebalance happens and what it costs"), step: 5 },
    { text: l("Commit'lerin nerede tutulduğunu öğrenmek", "Learn where commits are kept"), step: 7 },
  ],
  steps: [
    {
      short: l("Group", "Group"),
      tag: "how",
      title: l("Consumer group: aynı işi paylaşan takım", "A consumer group: a team sharing one job"),
      body: [
        l(
          "Fatura servisinin her kopyası aynı `group.id` ile çalışır: `billing`. Aynı group.id'yi taşıyan okuyuculara birlikte bir [[consumerGroup]] denir.",
          "Every copy of the billing service runs with the same `group.id`: `billing`. Readers that share a group.id are together called a [[consumerGroup]].",
        ),
        l(
          "Şimdilik takımda tek kişi var: Fatura 1. Topic'in üç partition'ının üçü de ona verildi. Altı siparişin hepsini okudu ve commit etti; bantların önündeki mühürler commit edilen yerleri gösteriyor.",
          "For now the team has one member: Billing 1. All three of the topic's partitions went to it. It read all six orders and committed; the seals in front of the belts show the committed positions.",
        ),
        l(
          "Group'un iki görevi var: işi üyeler arasında **paylaştırmak** ve ilerlemeyi **group adına** hatırlamak. Commit edilen offset bir okuyucuya değil, group'a aittir.",
          "A group has two jobs: **sharing** the work among its members and remembering progress **on behalf of the group**. A committed offset belongs to the group, not to one reader.",
        ),
      ],
    },
    {
      short: l("Paylaşım", "Sharing"),
      tag: "how",
      predict: {
        question: l(
          "Fatura group'una ikinci bir okuyucu katılacak. 3 partition 2 okuyucuya nasıl paylaşılır?",
          "A second reader will join the billing group. How are 3 partitions shared between 2 readers?",
        ),
        options: [
          l("Biri 2, diğeri 1 partition alır", "One gets 2 partitions, the other gets 1"),
          l("İkisi de 3 partition'ı okur ve kayıtları yarı yarıya bölüşür", "Both read all 3 partitions and split the records in half"),
          l("İkinci okuyucu, ilki bitirene kadar bekler", "The second reader waits until the first is done"),
        ],
        answer: 0,
        why: l(
          "Bir partition group içinde tek bir okuyucuya verilir ve bölünmez. 3 partition 2 okuyucuya 2 + 1 olarak dağılır.",
          "Within a group a partition goes to a single reader and is never split. 3 partitions over 2 readers come out as 2 + 1.",
        ),
      },
      title: l("Yeni üye katılınca: rebalance", "A new member joins: a rebalance"),
      body: [
        l(
          "Üç sipariş daha geldi ve Fatura 2 group'a katıldı. Kafka partition'ları yeniden dağıttı: Fatura 1 P0 ve P1'i, Fatura 2 P2'yi aldı. Bu yeniden dağıtıma [[rebalance]] denir.",
          "Three more orders arrived and Billing 2 joined the group. Kafka shared the partitions out again: Billing 1 took P0 and P1, Billing 2 took P2. This redistribution is called a [[rebalance]].",
        ),
        l(
          "Fatura 2, P2'yi okumaya sıfırdan değil, group'un commit ettiği yerden başladı. İlerleme group'un olduğu için yeni gelen üye kaldığı yeri bilir.",
          "Billing 2 did not start P2 from scratch but from where the group had committed. Progress belongs to the group, so a newcomer knows where things stand.",
        ),
        l(
          "Hangi okuyucunun hangi partition'ı alacağını bir **assignor** belirler. Burada \"range\" kullanılıyor: okuyucular isme göre sıralanır ve partition'lar sırayla dilimlenir.",
          "An **assignor** decides which reader gets which partition. Here it is \"range\": readers are sorted by name and the partitions are sliced in order.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Java consumer'da `partition.assignment.strategy` varsayılanı `[RangeAssignor, CooperativeStickyAssignor]` listesidir, yani range kullanılır. Kafka 4.0'da kullanıma hazır olan yeni group protokolünde (KIP-848, `group.protocol=consumer`) dağıtımı client değil broker yapar.",
            "In the Java consumer, `partition.assignment.strategy` defaults to the list `[RangeAssignor, CooperativeStickyAssignor]`, so range is used. In the new group protocol, production-ready since Kafka 4.0 (KIP-848, `group.protocol=consumer`), the broker does the assignment instead of the client.",
          ),
        },
      ],
    },
    {
      short: l("Çökme", "Crash"),
      tag: "problem",
      predict: {
        question: l(
          "Fatura 2, P2'den iki yeni kayıt okuyacak ve commit etmeden çökecek. P2'ye ne olur?",
          "Billing 2 will read two new records from P2 and crash before committing. What happens to P2?",
        ),
        options: [
          l("Fatura 2 dönene kadar kimse P2'yi okumaz", "Nobody reads P2 until Billing 2 comes back"),
          l("Fatura 1 devralır ve son commit'ten okur; o iki kayıt tekrar okunur", "Billing 1 takes over and reads from the last commit, so those two records are read again"),
          l("Fatura 1 devralır ve Fatura 2'nin kaldığı yerden devam eder", "Billing 1 takes over and carries on exactly where Billing 2 stopped"),
        ],
        answer: 1,
        why: l(
          "Rebalance P2'yi Fatura 1'e verir. Fatura 1, Fatura 2'nin belleğindeki konumu bilemez; group'un commit ettiği offset'ten başlar. Commit'ten sonra okunan iki kayıt ikinci kez işlenir.",
          "The rebalance gives P2 to Billing 1. Billing 1 cannot know the position in Billing 2's memory; it starts from the offset the group committed. The two records read after that commit are processed a second time.",
        ),
      },
      title: l("Bir üye çöktü: iş devredildi", "A member crashed: its work was handed over"),
      body: [
        l(
          "Altı yeni sipariş geldi. Fatura 2, P2'deki iki yeni kaydı (offset 3 ve 4) okudu ama commit etmeye fırsat bulamadan çöktü.",
          "Six new orders arrived. Billing 2 read the two new records on P2 (offsets 3 and 4) but crashed before it could commit.",
        ),
        l(
          "Group bunu fark etti ve bir rebalance yaptı: artık üç partition'ın hepsi Fatura 1'de. Fatura 1, P2'yi commit edilmiş offset 3'ten okudu, yani 3 ve 4 **ikinci kez** okundu.",
          "The group noticed and ran a rebalance: all three partitions are now with Billing 1. Billing 1 read P2 from the committed offset 3, so 3 and 4 were read **a second time**.",
        ),
        l(
          "İş kaybolmadı, bu iyi haber. Ama bazı kayıtlar iki kez işlendi. Bu, log dersinde gördüğümüz at-least-once davranışının group'lardaki karşılığı.",
          "No work was lost, which is the good news. But some records were processed twice. This is the group version of the at-least-once behaviour from the log lesson.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada çökme anında fark ediliyor. Gerçekte okuyucular düzenli heartbeat gönderir; `session.timeout.ms` (varsayılan 45 saniye) boyunca sesi çıkmayan üye çökmüş sayılır. Ayrıca iki `poll()` arası `max.poll.interval.ms`'i (varsayılan 5 dakika) aşan üye de group'tan atılır.",
            "Here the crash is noticed instantly. In reality readers send regular heartbeats; a member silent for `session.timeout.ms` (45 seconds by default) is considered dead. A member that goes longer than `max.poll.interval.ms` (5 minutes by default) between `poll()` calls is also removed.",
          ),
        },
      ],
    },
    {
      short: l("İki group", "Two groups"),
      tag: "how",
      predict: {
        question: l(
          "Analitik servisi kendi group'uyla (`analytics`) aynı topic'i okumaya başlayacak. Fatura'nın zaten okuduğu kayıtlara ne olur?",
          "The analytics service will start reading the same topic with its own group (`analytics`). What about the records billing has already read?",
        ),
        options: [
          l("Analitik onları göremez, çünkü Fatura okudu", "Analytics cannot see them because billing read them"),
          l("Analitik de hepsini okur; iki group birbirini etkilemez", "Analytics reads them all too; the two groups do not affect each other"),
          l("Analitik, Fatura'nın kaldığı yerden başlar", "Analytics starts where billing stopped"),
        ],
        answer: 1,
        why: l(
          "Her group kendi commit'lerini tutar ve partition'ları kendi üyelerine dağıtır. Okumak bir kaydı silmediği için yeni group bütün geçmişi okuyabilir.",
          "Each group keeps its own commits and shares the partitions among its own members. Reading never deletes a record, so a new group can read the whole history.",
        ),
      },
      title: l("Farklı group, bağımsız okuma", "A different group reads independently"),
      body: [
        l(
          "Sağda Analitik belirdi. Kendi group'u olduğu için üç partition'ın üçü de ona verildi ve 15 kaydın hepsini baştan okudu.",
          "Analytics appeared on the right. It has its own group, so all three partitions went to it and it read all 15 records from the start.",
        ),
        l(
          "Bu sırada Fatura'nın mühürleri hiç kıpırdamadı. **Group içinde** okuyucular işi bölüşür; **group'lar arasında** ise her group bütün kayıtları kendisi alır.",
          "Meanwhile billing's seals did not move at all. **Within a group** readers split the work; **across groups** each group gets every record for itself.",
        ),
        l(
          "İlk dersteki \"herkes kendi hızında okur\" fikrinin tam karşılığı bu: her servis kendi group.id'siyle çalışır.",
          "This is exactly the \"everyone reads at their own pace\" idea from the first lesson: each service runs with its own group.id.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bir gazeteyi düşün. Bir ailenin bireyleri sayfaları bölüşerek okur; komşu aile ise kendi gazetesini baştan sona okur.",
            "Think of a newspaper. Members of one family split the pages between them; the family next door reads its own copy cover to cover.",
          ),
        },
      ],
    },
    {
      short: l("Geri dönüş", "Coming back"),
      tag: "how",
      title: l("Çöken üye geri döndü", "The crashed member came back"),
      body: [
        l(
          "Fatura 2 yeniden başladı ve group'a katıldı. Bir rebalance daha oldu ve P2 ona geri verildi.",
          "Billing 2 restarted and joined the group. Another rebalance happened and P2 went back to it.",
        ),
        l(
          "Bu sefer hiçbir kayıt tekrar okunmadı. Fatura 1, P2'yi devraldığında okuduklarını commit etmişti, Fatura 2 de o commit'ten devam etti.",
          "This time no record was read twice. When Billing 1 took over P2, it committed what it read, and Billing 2 continued from that commit.",
        ),
        l(
          "Kural basit: rebalance'tan önce commit edilmiş ilerleme hiçbir zaman kaybolmaz, commit edilmemiş ilerleme ise tekrar okunur.",
          "The rule is simple: progress committed before a rebalance is never lost, and uncommitted progress is read again.",
        ),
      ],
    },
    {
      short: l("Bedel", "The cost"),
      tag: "reality",
      title: l("Rebalance'ın bedeli", "What a rebalance costs"),
      body: [
        l(
          "Fatura 3 de katıldı. Range assignor partition'ları baştan dağıttı: artık herkesin bir partition'ı var. Ama dikkat et, Fatura 2'nin partition'ı P2'den P1'e değişti.",
          "Billing 3 joined too. The range assignor shared the partitions out from scratch: everyone has one now. But notice Billing 2's partition changed from P2 to P1.",
        ),
        l(
          "Klasik protokolde (\"eager\") her rebalance'ta bütün üyeler bütün partition'larını bırakır, yeni dağıtımı bekler ve sonra devam eder. Bu kısa an boyunca group hiç okuma yapmaz. Büyük group'larda ve sık rebalance'ta bu ciddi bir duraklamadır.",
          "In the classic (\"eager\") protocol, on every rebalance all members give up all their partitions, wait for the new assignment, then carry on. For that moment the group reads nothing. In big groups with frequent rebalances this is a serious pause.",
        ),
        l(
          "Bu yüzden iki iyileştirme var. `CooperativeStickyAssignor` sadece yer değiştirmesi gereken partition'ları bırakır ve gerisini olduğu yerde tutar. Kafka 4.0'daki yeni protokol (KIP-848) ise dağıtımı broker'a taşır ve üyeleri tek tek, durdurmadan günceller.",
          "So there are two improvements. `CooperativeStickyAssignor` only gives up the partitions that must move and keeps the rest in place. The new protocol in Kafka 4.0 (KIP-848) moves assignment to the broker and updates members one by one, without stopping them.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Rebalance'ı tetikleyen şeyler: bir üyenin katılması, ayrılması ya da çökmesi, topic'in partition sayısının değişmesi ve group'un abone olduğu topic'lerin değişmesi.",
            "What triggers a rebalance: a member joining, leaving or crashing, the topic's partition count changing, and the group's subscribed topics changing.",
          ),
        },
      ],
    },
    {
      short: l("Yedek", "Spare"),
      tag: "how",
      predict: {
        question: l(
          "Fatura 4 katılınca boşta kalacak, çünkü 3 partition var. Sonra Fatura 1 çökecek. Ne olur?",
          "Billing 4 will join and stay idle, since there are only 3 partitions. Then Billing 1 will crash. What happens?",
        ),
        options: [
          l("Fatura 1'in partition'ı sahipsiz kalır", "Billing 1's partition is left without an owner"),
          l("Rebalance olur ve boştaki Fatura 4 de bir partition alır", "A rebalance happens and idle Billing 4 gets a partition too"),
          l("Fatura 4 boşta kalmaya devam eder", "Billing 4 stays idle"),
        ],
        answer: 1,
        why: l(
          "Çökme bir rebalance tetikler. Artık üç üye ve üç partition var, o yüzden yedekte bekleyen Fatura 4 de iş alır.",
          "The crash triggers a rebalance. Now there are three members and three partitions, so Billing 4, waiting as a spare, gets work too.",
        ),
      },
      title: l("Boştaki üye yedek oyuncudur", "An idle member is a substitute"),
      body: [
        l(
          "Fatura 4 katıldı ama paylaşılacak partition yoktu, bu yüzden boşta bekledi. Sonra Fatura 1 çöktü.",
          "Billing 4 joined, but there was no partition to share, so it waited idle. Then Billing 1 crashed.",
        ),
        l(
          "Rebalance yeni bir dağıtım yaptı: Fatura 2 P0'ı, Fatura 3 P1'i, Fatura 4 de P2'yi aldı. Fatura 1 commit etmiş olduğu için hiçbir kayıt tekrar okunmadı.",
          "The rebalance made a new assignment: Billing 2 took P0, Billing 3 took P1, and Billing 4 took P2. Billing 1 had committed, so no record was read twice.",
        ),
        l(
          "Partition'dan fazla okuyucu çalıştırmak okumayı hızlandırmaz, ama bir üye düştüğünde işin hemen devralınmasını sağlar.",
          "Running more readers than partitions does not speed up reading, but it means work is taken over right away when a member goes down.",
        ),
      ],
    },
    {
      short: l("Kim tutuyor?", "Who keeps it?"),
      tag: "reality",
      title: l("Commit'ler nerede saklanır?", "Where are commits kept?"),
      body: [
        l(
          "Sahnenin üstünde iki group'un commit'leri yazıyor. Fatura her partition'da 8'de, Analitik ise 5'te: yeni siparişleri henüz okumadı.",
          "The commits of both groups are shown above the stage. Billing is at 8 on every partition, while analytics is at 5: it has not read the new orders yet.",
        ),
        l(
          "Kafka bu commit'leri kendi içindeki özel bir topic'te tutar: `__consumer_offsets`. Her commit aslında bu topic'e yazılan küçük bir kayıttır: \"billing, orders P2, offset 8\".",
          "Kafka keeps these commits in a special internal topic: `__consumer_offsets`. Every commit is really a small record written to that topic: \"billing, orders P2, offset 8\".",
        ),
        l(
          "Her group'un bir **group coordinator**'ı vardır. Bu, group'un `__consumer_offsets` partition'ının leader broker'ıdır. Üyelerin heartbeat'lerini dinler, rebalance'ları yönetir ve commit'leri saklar.",
          "Every group has a **group coordinator**: the broker that leads the group's partition of `__consumer_offsets`. It listens to members' heartbeats, runs rebalances and stores commits.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bir group'un durumuna `kafka-consumer-groups.sh --describe --group billing` komutuyla bakılır. Komut her partition için commit edilmiş offset'i, log'un sonunu ve aradaki lag'i gösterir. Lag'i Pratikte bölümünde ayrıca ele alacağız.",
            "You check a group with `kafka-consumer-groups.sh --describe --group billing`. It shows, for each partition, the committed offset, the end of the log and the lag in between. Lag gets its own lesson in the In Practice chapter.",
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
          "Sıra sende. `orders` topic'inde 3 partition ve gerçek işten **5 senaryo** var. Okuyucuları Kafka'nın kendi aracıyla **kendin** başlat: `kafka-console-consumer.sh --group billing` bir group üyesi olarak okur ve commit eder; sonuna `&` koyarsan arka planda çalışmaya devam eder, `kill %1` (ya da çökme gibi `kill -9 %1`) onu durdurur.",
          "Your turn. The `orders` topic has 3 partitions, and there are **5 scenarios** from real work. Start readers **yourself** with Kafka's own tool: `kafka-console-consumer.sh --group billing` reads and commits as a group member; with `&` at the end it keeps running in the background, and `kill %1` (or `kill -9 %1`, like a crash) stops it.",
        ),
        l(
          "`kafka-consumer-groups.sh --describe --group billing` kimin hangi partition'da olduğunu ve LAG'i gösterir; `--reset-offsets` group'un commit'lerini taşır. Takılırsan `help` yaz; ipuçları adım adım açılır.",
          "`kafka-consumer-groups.sh --describe --group billing` shows who is on which partition, and the LAG; `--reset-offsets` moves the group's commits. If you're stuck, type `help`; hints open one at a time.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "Aynı `group.id`'yi taşıyan okuyucular bir [[consumerGroup]] oluşturur ve topic'in partition'larını paylaşır; her partition'ı tek bir üye okur.",
      "Readers sharing a `group.id` form a [[consumerGroup]] and share the topic's partitions; each partition is read by one member.",
    ),
    l(
      "Üye katılınca, ayrılınca ya da çökünce bir [[rebalance]] olur ve partition'lar yeniden dağıtılır.",
      "When a member joins, leaves or crashes, a [[rebalance]] happens and the partitions are shared out again.",
    ),
    l(
      "Partition'ı devralan üye group'un commit ettiği offset'ten başlar; commit edilmemiş ilerleme tekrar okunur.",
      "The member that takes over a partition starts from the group's committed offset; uncommitted progress is read again.",
    ),
    l(
      "Farklı group'lar birbirinden bağımsızdır: her group bütün kayıtları kendi hızında okur.",
      "Different groups are independent: each group reads every record at its own pace.",
    ),
    l(
      "Klasik rebalance group'u kısa süre durdurur; cooperative-sticky assignor ve KIP-848 protokolü bu duraklamayı azaltır.",
      "A classic rebalance pauses the group briefly; the cooperative-sticky assignor and the KIP-848 protocol reduce that pause.",
    ),
    l(
      "Commit'ler `__consumer_offsets` topic'inde saklanır ve group coordinator tarafından yönetilir.",
      "Commits are stored in the `__consumer_offsets` topic and managed by the group coordinator.",
    ),
  ],
  quiz: [
    {
      question: l(
        "İki farklı group aynı topic'i okuyor. Topic'e yazılan bir kayıt toplam kaç kez işlenir (çökme olmadan)?",
        "Two different groups read the same topic. How many times in total is a record processed (with no crashes)?",
      ),
      options: [l("1 kez", "Once"), l("Her group'ta bir kez, toplam 2", "Once per group, 2 in total"), l("Group'taki üye sayısı kadar", "Once per member of each group"), l("Hiç, çünkü çakışırlar", "Never, because they clash")],
      answer: 1,
      explain: l(
        "Group içinde her kayıt bir üyeye gider; ama her group bütün kayıtları ayrı ayrı alır.",
        "Within a group each record goes to one member, but each group gets every record separately.",
      ),
      reviewStep: 3,
    },
    {
      question: l(
        "Bir üye P1'den offset 20–29'u okudu, son commit'i 20'ydi ve commit etmeden çöktü. P1'i devralan üye nereden başlar?",
        "A member read offsets 20–29 from P1, its last commit was 20, and it crashed before committing again. Where does the member taking over P1 start?",
      ),
      options: [l("30", "30"), l("20", "20"), l("0", "0"), l("29", "29")],
      answer: 1,
      explain: l(
        "Yeni sahip group'un commit ettiği offset'ten, 20'den başlar. 20–29 ikinci kez okunur.",
        "The new owner starts from the group's committed offset, 20. Records 20–29 are read a second time.",
      ),
      reviewStep: 2,
    },
    {
      question: l("Hangisi bir rebalance'ı tetiklemez?", "Which of these does NOT trigger a rebalance?"),
      options: [
        l("Group'a yeni bir üye katılması", "A new member joining the group"),
        l("Bir üyenin çökmesi", "A member crashing"),
        l("Topic'e yeni bir kayıt yazılması", "A new record being written to the topic"),
        l("Topic'e partition eklenmesi", "Partitions being added to the topic"),
      ],
      answer: 2,
      explain: l(
        "Kayıt yazmak sadece log'u uzatır. Rebalance üyelik ya da partition sayısı değişince olur.",
        "Writing a record only makes the log longer. A rebalance happens when membership or the partition count changes.",
      ),
      reviewStep: 5,
    },
    {
      question: l("Bir group'un commit ettiği offset'ler nerede saklanır?", "Where are a group's committed offsets stored?"),
      options: [
        l("Her okuyucunun kendi diskinde", "On each reader's own disk"),
        l("Kafka'nın `__consumer_offsets` topic'inde", "In Kafka's `__consumer_offsets` topic"),
        l("Okunan kaydın içinde", "Inside the record that was read"),
        l("Hiçbir yerde, sadece bellekte", "Nowhere, only in memory"),
      ],
      answer: 1,
      explain: l(
        "Commit'ler Kafka'nın iç topic'i `__consumer_offsets`'e yazılır; group coordinator onları yönetir. Bu yüzden okuyucu değişse de ilerleme kalır.",
        "Commits are written to Kafka's internal topic `__consumer_offsets`, managed by the group coordinator. That is why progress survives a change of reader.",
      ),
      reviewStep: 7,
    },
  ],
};
