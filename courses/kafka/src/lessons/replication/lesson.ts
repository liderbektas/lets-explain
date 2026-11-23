import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { changesFor, ReplicationScene } from "./Scene";

export const replication: Lesson = {
  slug: "replication",
  title: l("Replikasyon", "Replication"),
  summary: l(
    "Her partition'ın birkaç broker'da kopyası: leader, follower'lar, ISR ve high watermark.",
    "Copies of every partition on several brokers: the leader, followers, the ISR and the high watermark.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: ReplicationScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("replication.factor'ün ne kopyaladığını görmek", "See what replication.factor copies"), step: 1 },
    { text: l("Leader ile follower'ın işini ayırmak", "Tell the leader's job from a follower's"), step: 2 },
    { text: l("ISR listesini ve neden önemli olduğunu öğrenmek", "Learn the ISR and why it matters"), step: 3 },
    { text: l("High watermark'ın consumer'ları nasıl koruduğunu görmek", "See how the high watermark protects consumers"), step: 4 },
    { text: l("Leader çökünce yeni leader'ın nasıl seçildiğini görmek", "See how a new leader is chosen when one dies"), step: 7 },
    { text: l("Unclean leader election'ın bedelini anlamak", "Understand the price of unclean leader election"), step: 9 },
  ],
  steps: [
    {
      short: l("Tek kopya", "One copy"),
      tag: "problem",
      title: l("Tek kopya, tek risk", "One copy, one risk"),
      body: [
        l(
          "Önceki derste bir broker çökünce partition'ının erişilemez olduğunu gördük. Broker geri gelince veri de geldi, çünkü diskteydi.",
          "In the last lesson we saw a partition go unreachable when its broker crashed. The data came back with the broker because it was on disk.",
        ),
        l(
          "Ama diskler bozulur, makineler yanar, bir veri merkezinin elektriği kesilir. P0'ın tek kopyası broker 1'de ve şu an üç sipariş taşıyor. O disk giderse siparişler de gider.",
          "But disks fail, machines burn out, a data centre loses power. P0's only copy is on broker 1 and holds three orders right now. If that disk goes, the orders go with it.",
        ),
      ],
    },
    {
      short: l("3 kopya", "3 copies"),
      tag: "idea",
      title: l("Fikir: her partition'ı birkaç broker'da tut", "The idea: keep every partition on several brokers"),
      body: [
        l(
          "P0'ı üç broker'a kopyaladık. Bir partition'ın kaç kopyası olacağına [[replicationFactor]] denir; burada 3.",
          "We copied P0 onto three brokers. How many copies a partition has is its [[replicationFactor]]; here it is 3.",
        ),
        l(
          "Her kopyaya [[replica]] denir. Aynı kayıtlar, aynı offset'lerle üç yerde duruyor. Artık bir disk bozulsa bile veri iki yerde daha var.",
          "Each copy is a [[replica]]. The same records, with the same offsets, now live in three places. Even if one disk fails, the data is still in two others.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Replication factor topic oluşturulurken seçilir (`--replication-factor 3`). Kafka kopyaları farklı broker'lara, ayarlıysa farklı rack'lere koyar; aynı broker'a iki kopya konmaz.",
            "The replication factor is chosen when a topic is created (`--replication-factor 3`). Kafka puts the copies on different brokers, and on different racks if configured; two copies never share a broker.",
          ),
        },
      ],
    },
    {
      short: l("Leader ve follower", "Leader & followers"),
      tag: "how",
      predict: {
        question: l("Producer iki sipariş daha yazacak. Kayıtlar önce nereye yazılır?", "The producer will write two more orders. Where are they written first?"),
        options: [
          l("Üç broker'a aynı anda; producer üçüne de gönderir", "All three brokers at once: the producer sends to each"),
          l("Sadece leader'a; follower'lar ondan kopyalar", "Only to the leader; the followers copy from it"),
          l("Rastgele bir follower'a", "A random follower"),
        ],
        answer: 1,
        why: l(
          "Producer sadece leader ile konuşur. [[follower|Follower]]'lar leader'dan sürekli yeni kayıt çeker ve kendi kopyalarına ekler.",
          "The producer only talks to the leader. [[follower|Followers]] keep fetching new records from the leader and appending them to their own copy.",
        ),
      },
      title: l("Leader yazar, follower'lar kopyalar", "The leader writes, followers copy"),
      body: [
        l(
          "İki sipariş broker 1'e, yani leader'a yazıldı. Hemen ardından broker 2 ve 3 onları kendi kopyalarına çekti: olay listesindeki \"kopyaladı\" satırları bu.",
          "Both orders were written to broker 1, the leader. Right after, brokers 2 and 3 pulled them into their own copies: that is the \"copied\" lines in the events.",
        ),
        l(
          "Kopyalar arasında bir sıra var: biri leader, diğerleri [[follower]]. Producer'lar ve consumer'lar leader ile konuşur, follower'lar sadece kopyalar.",
          "The copies have roles: one leader, the rest [[follower|followers]]. Producers and consumers talk to the leader; followers only copy.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada follower'lar anında kopyalıyor. Gerçekte sürekli fetch isteği atarlar ve leader'ın milisaniyeler gerisinden gelirler. Kafka 2.4'ten beri consumer'lar, rack ayarı varsa en yakın follower'dan da okuyabilir.",
            "Here followers copy instantly. In reality they keep sending fetch requests and trail the leader by milliseconds. Since Kafka 2.4, consumers can also read from the nearest follower if racks are configured.",
          ),
        },
      ],
    },
    {
      short: l("ISR", "ISR"),
      tag: "how",
      title: l("ISR: yetişenler listesi", "The ISR: the copies that keep up"),
      body: [
        l(
          "Leader, kendisine yetişen kopyaların listesini tutar. Bu listeye [[isr]] (in-sync replicas) denir. Şu an üç kopya da yetişik: ISR = [1, 2, 3].",
          "The leader keeps a list of the copies that keep up with it. That list is the [[isr]] (in-sync replicas). Right now all three are caught up: ISR = [1, 2, 3].",
        ),
        l(
          "ISR iki iş görür. Bir: leader çökerse yenisi **sadece bu listeden** seçilir, çünkü sadece onlar bütün kayıtlara sahip. İki: bir kayıt ISR'deki herkese ulaşınca \"güvende\" sayılır.",
          "The ISR does two jobs. First, if the leader dies, a new one is picked **only from this list**, because only those copies have every record. Second, a record counts as \"safe\" once everyone in the ISR has it.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Leader da ISR'nin bir üyesidir. ISR'de en az bir kopya, yani leader'ın kendisi hep bulunur.",
            "The leader is a member of the ISR too. The ISR always holds at least one copy: the leader itself.",
          ),
        },
      ],
    },
    {
      short: l("High watermark", "High watermark"),
      tag: "experiment",
      predict: {
        question: l(
          "Broker 3 yavaşlayacak ve kopyalamayı bırakacak. Sonra leader'a 2 sipariş daha yazılacak. Consumer'lar en fazla hangi offset'i okuyabilir?",
          "Broker 3 will slow down and stop copying. Then 2 more orders go to the leader. Up to which offset can consumers read?",
        ),
        options: [
          l("Offset 6'ya kadar; leader'da ne varsa", "Up to offset 6: whatever the leader has"),
          l("Offset 4'e kadar; broker 3'ün de sahip olduğu son kayıt", "Up to offset 4: the last record broker 3 also has"),
          l("Hiçbirini; yazma durur", "None: writing stops"),
        ],
        answer: 1,
        why: l(
          "Consumer'lar sadece ISR'deki **bütün** kopyalarda bulunan kayıtları görür. Broker 3 hâlâ ISR'de ve offset 4'ten sonrasını almadı, o yüzden sınır 5'te kalır.",
          "Consumers only see records that **every** ISR copy has. Broker 3 is still in the ISR and missed everything after offset 4, so the line stays at 5.",
        ),
      },
      title: l("High watermark: okunabilir sınır", "The high watermark: the readable line"),
      body: [
        l(
          "Broker 3 yavaşladı; yeni kayıtlar (offset 5 ve 6) sadece broker 1 ve 2'de. Rayda \"HW 5\" yazan direk bu sınırı gösteriyor ve soluk vagonlar henüz okunamıyor.",
          "Broker 3 slowed down; the new records (offsets 5 and 6) are only on brokers 1 and 2. The \"HW 5\" post on the track marks the line, and the faded wagons cannot be read yet.",
        ),
        l(
          "Bu sınıra [[highWatermark]] denir: ISR'deki bütün kopyaların sahip olduğu son kaydın bir sonrası. Consumer'lar sadece altındaki kayıtları görür.",
          "This line is the [[highWatermark]]: one past the last record every ISR copy has. Consumers only see what is below it.",
        ),
        l(
          "Neden? Leader şimdi çökse ve broker 3 leader olsa, 5 ve 6 kaybolurdu. Bir consumer onları çoktan okumuş olsaydı, var olmayan kayıtları işlemiş olurdu. HW bunu engeller.",
          "Why? If the leader died now and broker 3 took over, offsets 5 and 6 would vanish. A consumer that had already read them would have acted on records that no longer exist. The HW prevents that.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sayaçtaki \"Onay bekleyen: 2\" de aynı sebepten. Producer `acks=all` ile yazdığı için kayıtlar bütün ISR'ye ulaşana kadar onay alamıyor. Bunu acks dersinde açacağız.",
            "The \"Waiting for ack: 2\" counter has the same cause. The producer writes with `acks=all`, so it gets no ack until the records reach the whole ISR. The acks lesson covers this.",
          ),
        },
      ],
    },
    {
      short: l("ISR'den çıkış", "Leaving the ISR"),
      tag: "how",
      predict: {
        question: l(
          "Broker 3 hâlâ geride ve 30 saniye (replica.lag.time.max.ms) dolmak üzere. Ne olur?",
          "Broker 3 is still behind, and 30 seconds (replica.lag.time.max.ms) are about to pass. What happens?",
        ),
        options: [
          l("Broker 3 ISR'den çıkar ve HW 7'ye ilerler", "Broker 3 leaves the ISR and the HW moves to 7"),
          l("Leader broker 3'ü beklemeye devam eder; HW 5'te kalır", "The leader keeps waiting for broker 3; the HW stays at 5"),
          l("Broker 3 cluster'dan atılır ve kopyası silinir", "Broker 3 is thrown out of the cluster and its copy deleted"),
        ],
        answer: 0,
        why: l(
          "Bir follower `replica.lag.time.max.ms` boyunca yetişemezse leader onu ISR'den çıkarır. Kopyası silinmez; sadece artık beklenmez. HW kalan ISR'ye göre ilerler.",
          "If a follower cannot catch up within `replica.lag.time.max.ms`, the leader drops it from the ISR. Its copy is not deleted; it is just no longer waited for. The HW moves on with the remaining ISR.",
        ),
      },
      title: l("Yetişemeyen ISR'den çıkar", "A copy that cannot keep up leaves the ISR"),
      body: [
        l(
          "30 saniye geçti ve broker 3 hâlâ geride. Leader onu ISR'den çıkardı: ISR = [1, 2]. Etiketinde artık \"ISR dışı\" yazıyor.",
          "30 seconds passed and broker 3 is still behind. The leader dropped it from the ISR: ISR = [1, 2]. Its label now says \"out of ISR\".",
        ),
        l(
          "HW hemen 7'ye ilerledi, çünkü ISR'de kalan iki kopyanın ikisi de 5 ve 6'ya sahip. Bekleyen onaylar da geldi.",
          "The HW jumped to 7 at once, because both remaining ISR copies have offsets 5 and 6. The waiting acks arrived as well.",
        ),
        l(
          "Bu bir denge: tek bir yavaş broker bütün cluster'ı yavaşlatamaz. Bedeli ise o an elimizde bir eksik güvenli kopya olması.",
          "It is a trade-off: one slow broker cannot slow the whole cluster down. The price is one fewer safe copy for the moment.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`replica.lag.time.max.ms` varsayılan olarak 30 saniye (30000). Burada \"zaman geçti\" adımıyla bir anda gösterdik.",
            "`replica.lag.time.max.ms` defaults to 30 seconds (30000). Here we show it as one \"time passes\" move.",
          ),
        },
      ],
    },
    {
      short: l("Geri katılım", "Rejoining"),
      tag: "how",
      title: l("Yetişen kopya ISR'ye geri döner", "A copy that catches up rejoins the ISR"),
      body: [
        l(
          "Broker 3 normale döndü, eksik kayıtları (5 ve 6) kopyaladı ve leader'a yetişti. Leader onu ISR'ye geri aldı: ISR = [1, 2, 3].",
          "Broker 3 is back to normal. It copied the records it missed (5 and 6) and caught up with the leader, which took it back into the ISR: ISR = [1, 2, 3].",
        ),
        l(
          "ISR sabit bir liste değil; broker'lar yavaşladıkça çıkar, yetiştikçe girer. Sağlıklı bir cluster'da ISR çoğu zaman bütün kopyaları içerir.",
          "The ISR is not a fixed list: brokers leave as they slow down and return as they catch up. In a healthy cluster the ISR holds every copy most of the time.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "ISR'si replication factor'ünden küçük partition'lara \"under-replicated\" denir. `UnderReplicatedPartitions` metriği izlenmesi gereken ilk alarmlardandır.",
            "Partitions whose ISR is smaller than their replication factor are \"under-replicated\". The `UnderReplicatedPartitions` metric is one of the first alerts worth having.",
          ),
        },
      ],
    },
    {
      short: l("Leader çöktü", "Leader down"),
      tag: "problem",
      predict: {
        question: l("Leader broker 1 çökecek. Ne olur?", "Broker 1, the leader, is about to crash. What happens?"),
        options: [
          l("P0 durur; broker 1 dönene kadar beklenir", "P0 stops until broker 1 comes back"),
          l("ISR'deki bir follower (broker 2) yeni leader olur; yazmalar devam eder", "A follower in the ISR (broker 2) becomes the leader; writes carry on"),
          l("Producer kayıtları doğrudan follower'lara yazmaya başlar", "The producer starts writing straight to the followers"),
        ],
        answer: 1,
        why: l(
          "ISR'deki her kopya bütün onaylı kayıtlara sahip, o yüzden herhangi biri leader olabilir. Kafka ISR'den birini seçer ve partition birkaç saniyede yeniden çalışır.",
          "Every ISR copy has all acknowledged records, so any of them can lead. Kafka picks one from the ISR and the partition is working again within seconds.",
        ),
      },
      title: l("Leader çöktü, follower devraldı", "The leader died, a follower took over"),
      body: [
        l(
          "Broker 1 çöktü. ISR'deki broker 2 yeni leader oldu ve bir sonraki sipariş doğrudan ona yazıldı. Hiçbir kayıt kaybolmadı.",
          "Broker 1 crashed. Broker 2, in the ISR, became the new leader and the next order went straight to it. No record was lost.",
        ),
        l(
          "Sağ alttaki \"leader epoch\" sayacı da arttı. Her leader değişiminde artar ve eski leader'ın geç kalmış yazmalarının yeni dönemle karışmasını önler.",
          "The \"leader epoch\" counter at the bottom right went up too. It grows with every leader change and keeps late writes from an old leader from mixing into the new era.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Yeni leader'ı cluster'ın controller'ı seçer ve haber verir; bunu KRaft dersinde göreceğiz. Producer'lar \"NotLeaderOrFollower\" hatası alır, metadata'yı tazeler ve yeni leader'a yazar.",
            "The cluster's controller picks the new leader and announces it; the KRaft lesson shows how. Producers get a \"NotLeaderOrFollower\" error, refresh their metadata and write to the new leader.",
          ),
        },
      ],
    },
    {
      short: l("Eski lider döner", "Old leader returns"),
      tag: "how",
      title: l("Eski leader follower olarak döner", "The old leader returns as a follower"),
      body: [
        l(
          "Broker 1 yeniden açıldı ama leader'lığı geri almadı. Follower olarak döndü, kaçırdığı kaydı kopyaladı ve ISR'ye girdi.",
          "Broker 1 came back up but did not take the lead back. It returned as a follower, copied the record it missed and joined the ISR.",
        ),
        l(
          "Etiketlere bak: P0'ın leader'ı hâlâ broker 2. Bir partition'ın leader'ının hangi broker olduğu zamanla değişebilir.",
          "Look at the labels: P0 is still led by broker 2. Which broker leads a partition can change over time.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Replica listesinin ilk broker'ına \"preferred leader\" denir. `auto.leader.rebalance.enable` (varsayılan açık) bir süre sonra leader'lığı ona geri verir, böylece yük broker'lara dengeli dağılır.",
            "The first broker in the replica list is the \"preferred leader\". `auto.leader.rebalance.enable` (on by default) hands leadership back to it after a while, so the load stays balanced.",
          ),
        },
      ],
    },
    {
      short: l("Hepsi çökerse", "All down"),
      tag: "reality",
      predict: {
        question: l(
          "Broker 3 yine geride kalıp ISR'den çıktı. Sonra ISR'deki iki broker da çöktü. Ayakta sadece geride kalmış broker 3 var. Ne olur?",
          "Broker 3 fell behind and left the ISR again. Then both ISR brokers crashed. Only broker 3, the one that fell behind, is up. What happens?",
        ),
        options: [
          l("Broker 3 hemen leader olur", "Broker 3 becomes the leader at once"),
          l("P0 offline olur; senkron bir kopya dönene kadar bekler", "P0 goes offline and waits for an in-sync copy to return"),
          l("Kafka eksik kayıtları broker 3'e kendisi tamamlar", "Kafka fills in broker 3's missing records by itself"),
        ],
        answer: 1,
        why: l(
          "Broker 3 onaylanmış bir kaydı kaçırdı. Onu leader yapmak o kaydı silmek demek. Kafka varsayılan olarak veri kaybı yerine beklemeyi seçer.",
          "Broker 3 missed an acknowledged record. Making it leader would mean erasing that record. By default, Kafka chooses waiting over losing data.",
        ),
      },
      title: l("Hepsi çökerse: beklemek mi, kaybetmek mi?", "When every in-sync copy is down: wait or lose?"),
      body: [
        l(
          "P0 offline. Broker 3 ayakta ama son siparişi almadan ISR'den çıkmıştı. Kafka onu leader yapmıyor, ISR'deki bir broker'ın dönmesini bekliyor.",
          "P0 is offline. Broker 3 is up, but it left the ISR before receiving the last order. Kafka does not make it leader; it waits for an ISR broker to come back.",
        ),
        l(
          "İstersen bunun yerine geride kalmış kopyayı leader yapabilirsin. Buna [[uncleanElection]] denir: partition hemen açılır ama broker 3'te olmayan onaylı kayıtlar sonsuza kadar kaybolur.",
          "You could make the copy that fell behind the leader instead. That is called [[uncleanElection]]: the partition opens at once, but acknowledged records broker 3 does not have are lost forever.",
        ),
        l(
          "Sıradaki adımda kendin deneyebilirsin. Görevlerden biri tam olarak bu kaybı yaşatmanı istiyor.",
          "You can try it yourself in the next step. One of the scenarios asks you to cause exactly this loss.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`unclean.leader.election.enable` varsayılan olarak `false`. Bazı ekipler log veya metrik gibi kaybı tolere edilebilen topic'lerde açar; para ve sipariş gibi verilerde kapalı kalmalı.",
            "`unclean.leader.election.enable` defaults to `false`. Some teams turn it on for topics that can tolerate loss, such as logs or metrics; for money or orders it should stay off.",
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
          "Sıra sende. Cluster yeniden sağlıklı ve bir docker-compose geliştirme ortamında çalışıyor: broker N, `kafka-N` container'ında. Aşağıda gerçek işten **5 senaryo** var; komutları terminale **kendin yaz**.",
          "Your turn. The cluster is healthy again and runs as a docker-compose dev setup: broker N lives in container `kafka-N`. Below are **5 scenarios** from real work; **type the commands yourself**.",
        ),
        l(
          "`docker stop` / `start` bir broker'ı kapatıp açar, `docker pause` onu dondurur (yavaş bir disk gibi kopyalamayı bırakır), `sleep 30` zamanı ilerletir. `kafka-topics.sh --describe` Leader, Replicas ve Isr'yi gösterir. Üstteki sayaçlar ISR'yi, HW'yi ve kaybı izler.",
          "`docker stop` / `start` stop and start a broker, `docker pause` freezes it (it stops copying, like a slow disk), `sleep 30` moves the clock. `kafka-topics.sh --describe` shows Leader, Replicas and Isr. The counters on top track the ISR, the HW and any loss.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "`sleep 30` gerçekten 30 saniye bekletmez: `replica.lag.time.max.ms` (30 sn) dolmuş olur ve geride kalan follower'lar ISR'den çıkar.",
            "`sleep 30` does not really make you wait: `replica.lag.time.max.ms` (30 s) runs out and followers that are behind leave the ISR.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[replicationFactor|Replication factor]], her partition'ın kaç broker'da kopyası olacağını belirler; üretimde genelde 3.",
      "The [[replicationFactor]] sets how many brokers hold a copy of each partition; 3 is usual in production.",
    ),
    l(
      "Her partition'ın bir leader'ı vardır; producer'lar ona yazar, [[follower]]'lar ondan kopyalar.",
      "Each partition has one leader; producers write to it and [[follower|followers]] copy from it.",
    ),
    l(
      "[[isr|ISR]], leader'a yetişen kopyaların listesidir. Geride kalan follower `replica.lag.time.max.ms` sonra listeden çıkar, yetişince geri girer.",
      "The [[isr]] is the list of copies keeping up with the leader. A follower that lags leaves after `replica.lag.time.max.ms` and rejoins once caught up.",
    ),
    l(
      "[[highWatermark|High watermark]], ISR'nin tamamında bulunan kayıtların sınırıdır; consumer'lar sadece altını okur.",
      "The [[highWatermark]] marks the records the whole ISR has; consumers only read below it.",
    ),
    l(
      "Leader çökünce yeni leader ISR'den seçilir ve onaylı kayıtların hiçbiri kaybolmaz.",
      "When the leader dies, a new one is chosen from the ISR and no acknowledged record is lost.",
    ),
    l(
      "ISR'nin tamamı çökerse partition varsayılan olarak bekler. [[uncleanElection|Unclean leader election]] onu açar ama veri kaybettirir.",
      "If the whole ISR is down, the partition waits by default. [[uncleanElection]] reopens it at the cost of lost data.",
    ),
  ],
  quiz: [
    {
      question: l(
        "replication.factor=3 olan bir partition'ın kaç kopyası leader'dır?",
        "A partition has replication.factor=3. How many of its copies are leaders?",
      ),
      options: [l("1", "1"), l("2", "2"), l("3", "3"), l("Hiçbiri; hepsi eşit", "None: they are all equal")],
      answer: 0,
      explain: l(
        "Her partition'ın her an tek bir leader'ı vardır; diğer iki kopya follower'dır.",
        "A partition has exactly one leader at a time; the other two copies are followers.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "Leader'da offset 0–9 var. Follower A'da 0–9, follower B'de 0–6 var ve ikisi de ISR'de. High watermark kaçtır?",
        "The leader has offsets 0–9. Follower A has 0–9, follower B has 0–6, and both are in the ISR. What is the high watermark?",
      ),
      options: [l("10", "10"), l("7", "7"), l("6", "6"), l("0", "0")],
      answer: 1,
      explain: l(
        "HW, ISR'deki bütün kopyalarda bulunan son kaydın bir sonrasıdır. B'de 6'ya kadar var, yani HW = 7. Consumer'lar 0–6'yı okuyabilir.",
        "The HW is one past the last record every ISR copy has. B has up to 6, so HW = 7. Consumers can read 0–6.",
      ),
      reviewStep: 4,
    },
    {
      question: l(
        "Bir follower 30 saniyeden uzun süre leader'a yetişemiyor. Ne olur?",
        "A follower cannot catch up with the leader for more than 30 seconds. What happens?",
      ),
      options: [
        l("Kopyası silinir", "Its copy is deleted"),
        l("ISR'den çıkar; yetişince geri girer", "It leaves the ISR and rejoins once it catches up"),
        l("Leader onu beklemek için yazmaları durdurur", "The leader stops writes to wait for it"),
        l("Otomatik olarak yeni leader olur", "It automatically becomes the leader"),
      ],
      answer: 1,
      explain: l(
        "`replica.lag.time.max.ms` aşılınca follower ISR'den çıkarılır. Kopyası durur, yetişince listeye geri alınır.",
        "Past `replica.lag.time.max.ms` the follower is dropped from the ISR. Its copy stays, and it is taken back once it catches up.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "ISR'deki bütün broker'lar çöktü; sadece geride kalmış bir follower ayakta. Varsayılan ayarlarla ne olur?",
        "Every ISR broker is down; only a follower that fell behind is up. What happens with default settings?",
      ),
      options: [
        l("Geride kalan follower leader olur, eksik kayıtlar kaybolur", "The lagging follower leads and the missing records are lost"),
        l("Partition offline kalır, bir ISR üyesinin dönmesini bekler", "The partition stays offline and waits for an ISR member"),
        l("Kafka kayıtları producer'dan yeniden ister", "Kafka asks the producer to resend the records"),
        l("Topic silinir", "The topic is deleted"),
      ],
      answer: 1,
      explain: l(
        "`unclean.leader.election.enable=false` varsayılandır: Kafka veri kaybetmektense bekler.",
        "`unclean.leader.election.enable=false` is the default: Kafka would rather wait than lose data.",
      ),
      reviewStep: 9,
    },
  ],
};
