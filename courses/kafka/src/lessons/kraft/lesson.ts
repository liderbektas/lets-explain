import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, KraftScene } from "./Scene";

export const kraft: Lesson = {
  slug: "kraft",
  title: l("KRaft ve Controller", "KRaft & the Controller"),
  summary: l(
    "Leader'ları kim seçer? Controller quorum, metadata log ve çoğunluğun neden şart olduğu.",
    "Who picks the leaders? The controller quorum, the metadata log, and why a majority is a must.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: KraftScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Metadata'nın ne olduğunu ve kimin yönettiğini öğrenmek", "Learn what metadata is and who manages it"), step: 0 },
    { text: l("ZooKeeper'dan KRaft'a geçişi bilmek", "Know about the move from ZooKeeper to KRaft"), step: 1 },
    { text: l("Metadata log'un nasıl kopyalandığını görmek", "See how the metadata log is replicated"), step: 3 },
    { text: l("Broker çökünce controller'ın ne yaptığını görmek", "See what the controller does when a broker dies"), step: 4 },
    { text: l("Çoğunluk gidince cluster'ın neden donduğunu görmek", "See why the cluster freezes without a majority"), step: 7 },
  ],
  steps: [
    {
      short: l("Kim yönetiyor?", "Who's in charge?"),
      tag: "problem",
      title: l("Cluster'ı kim yönetiyor?", "Who runs the cluster?"),
      body: [
        l(
          "Önceki derslerde bir leader çökünce \"yeni leader seçildi\" dedik. Ama kim seçti? Birinin hangi broker'ların ayakta olduğunu, hangi topic'lerin var olduğunu ve her partition'ın lideri kim olduğunu bilmesi gerek.",
          "In earlier lessons we said \"a new leader was chosen\" when one died. But who chose it? Someone has to know which brokers are up, which topics exist, and who leads each partition.",
        ),
        l(
          "Bu bilgilere [[metadata]] denir ve onu yöneten role [[controller]] denir. Üstte üç controller var; altta veriyi taşıyan üç broker.",
          "This information is the [[metadata]], and the role that manages it is the [[controller]]. There are three controllers on top and three data brokers below.",
        ),
        l(
          "Her controller'ın bandında aynı kayıtlar var: üç broker'ın kaydı ve `orders` topic'i. Bu bant, cluster'ın değişiklik defteri.",
          "Each controller's belt holds the same records: three broker registrations and the `orders` topic. This belt is the cluster's change book.",
        ),
      ],
    },
    {
      short: l("ZooKeeper", "ZooKeeper"),
      tag: "reality",
      title: l("Eskiden: ZooKeeper", "It used to be ZooKeeper"),
      body: [
        l(
          "Kafka uzun yıllar metadata'yı [[zookeeper]] adında ayrı bir sistemde tuttu. Yani bir Kafka cluster'ı çalıştırmak için iki ayrı sistemi kurmak, izlemek ve güncellemek gerekiyordu.",
          "For many years Kafka kept its metadata in a separate system called [[zookeeper]]. Running a Kafka cluster meant installing, watching and upgrading two different systems.",
        ),
        l(
          "[[kraft]] (Kafka Raft) bunu değiştirdi: metadata artık Kafka'nın kendi içinde, Raft algoritmasıyla yönetiliyor. KRaft 3.3'te üretime hazır ilan edildi, ZooKeeper 3.5'te kullanımdan kaldırılacağı duyuruldu ve 4.0'da tamamen çıkarıldı.",
          "[[kraft]] (Kafka Raft) changed that: metadata now lives inside Kafka itself, managed with the Raft algorithm. KRaft was declared production-ready in 3.3, ZooKeeper was deprecated in 3.5 and removed in 4.0.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bugün yeni kurulan her cluster KRaft kullanır. ZooKeeper'lı eski bir cluster'ı 4.0'a geçirmek için önce 3.x sürümünde KRaft'a taşımak gerekir.",
            "Every new cluster today uses KRaft. To bring an old ZooKeeper cluster to 4.0, you first migrate it to KRaft on a 3.x release.",
          ),
        },
      ],
    },
    {
      short: l("Quorum", "Quorum"),
      tag: "how",
      title: l("Controller quorum: biri aktif, diğerleri hazır", "The controller quorum: one active, the others ready"),
      body: [
        l(
          "Üç controller birlikte bir [[quorum]] oluşturur. Biri **aktif** controller'dır (çatısının üstündeki etikete bak): bütün kararları o verir ve deftere o yazar.",
          "The three controllers form a [[quorum]]. One is the **active** controller (see the tag above its roof): it makes every decision and writes it into the book.",
        ),
        l(
          "Diğer ikisi takipçi. Aktif controller'ın yazdığı her kaydı kopyalarlar; böylece aktif olan çökerse biri hemen devralabilir.",
          "The other two are followers. They copy every record the active controller writes, so if it dies one of them can take over at once.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bir toplantının tutanak yazarı gibi: tek kişi yazar, iki kişi aynı tutanağın kopyasını tutar. Yazan giderse kopyası olan biri kaldığı yerden devam eder.",
            "Like the note-taker of a meeting: one person writes, two others keep a copy of the same notes. If the writer leaves, someone with a copy carries on.",
          ),
        },
      ],
    },
    {
      short: l("Metadata log", "Metadata log"),
      tag: "how",
      predict: {
        question: l("Yönetici `payments` adında yeni bir topic oluşturacak. Bu bilgi nereye yazılır?", "An admin will create a new topic called `payments`. Where is that written?"),
        options: [
          l("Her broker'ın kendi dosyasına ayrı ayrı", "Into each broker's own file, separately"),
          l("Aktif controller'ın metadata log'una; diğerleri kopyalar", "Into the active controller's metadata log; the others copy it"),
          l("ZooKeeper'a", "Into ZooKeeper"),
        ],
        answer: 1,
        why: l(
          "Her değişiklik aktif controller'ın [[metadataLog]]'una bir kayıt olarak eklenir. Çoğunluk kopyalayınca commit edilir ve broker'lar bu log'u okuyarak haberdar olur.",
          "Every change is appended to the active controller's [[metadataLog]] as a record. Once a majority has copied it, it is committed, and brokers learn about it by reading that log.",
        ),
      },
      title: l("Her değişiklik bir kayıt: metadata log", "Every change is a record: the metadata log"),
      body: [
        l(
          "`payments` topic'i oluşturuldu. Aktif controller bunu kendi bandına yeni bir kayıt (offset 4) olarak ekledi, diğer iki controller hemen kopyaladı.",
          "The `payments` topic was created. The active controller appended it to its belt as a new record (offset 4), and the other two copied it at once.",
        ),
        l(
          "Bu bant aslında bir Kafka topic'i: [[metadataLog]] (`__cluster_metadata`). Kafka kendi metadata'sını, tıpkı senin verin gibi, sadece sonuna yazılan bir log'da tutuyor.",
          "That belt is a Kafka topic itself: the [[metadataLog]] (`__cluster_metadata`). Kafka keeps its own metadata the way it keeps your data: in an append-only log.",
        ),
        l(
          "Broker'lar da bu log'u takip eder. Altta her broker'ın altında \"metadata @ 5\" yazıyor: hepsi log'u 5 kayda kadar okudu ve haritaları güncel.",
          "Brokers follow this log too. Under each broker it says \"metadata @ 5\": all of them have read the log up to 5 records and their maps are current.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir kayıt, controller'ların **çoğunluğu** (3'te 2) onu kopyalayınca commit edilir. HW direği bu sınırı gösteriyor.",
            "A record is committed once a **majority** of controllers (2 of 3) has copied it. The HW post marks that line.",
          ),
        },
      ],
    },
    {
      short: l("Broker çöktü", "Broker down"),
      tag: "how",
      predict: {
        question: l(
          "Broker 2 çökecek ve heartbeat göndermeyi bırakacak. P1'in yeni leader'ını kim belirler?",
          "Broker 2 will crash and stop sending heartbeats. Who decides P1's new leader?",
        ),
        options: [
          l("Producer'lar oylar", "The producers vote"),
          l("Aktif controller; kararı metadata log'a yazar", "The active controller, writing the decision into the metadata log"),
          l("Kalan broker'lar kendi aralarında anlaşır", "The remaining brokers agree among themselves"),
        ],
        answer: 1,
        why: l(
          "Broker'lar controller'a düzenli heartbeat gönderir. Kesilince aktif controller broker'ı [[fenced|fenced]] işaretler, liderliklerini başka broker'lara verir ve bunları log'a yazar.",
          "Brokers send the controller regular heartbeats. When they stop, the active controller marks the broker [[fenced]], hands its leaderships to other brokers and writes all that into the log.",
        ),
      },
      title: l("Broker çökünce controller karar verir", "When a broker dies, the controller decides"),
      body: [
        l(
          "Broker 2 çöktü. Aktif controller heartbeat'lerin kesildiğini fark etti ve iki kayıt yazdı: \"broker 2 fenced\" ve \"P1 leader: broker 2 → broker 3\".",
          "Broker 2 crashed. The active controller noticed its heartbeats stopped and wrote two records: \"broker 2 fenced\" and \"P1 leader: broker 2 → broker 3\".",
        ),
        l(
          "Broker 3 bu kaydı okudu ve P1'in yeni lideri olduğunu öğrendi. Producer'lar da metadata'yı tazeleyince yeni lidere yazar.",
          "Broker 3 read the record and learned it is now P1's leader. Producers write to it once they refresh their metadata.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte controller bir broker'ı `broker.session.timeout.ms` (varsayılan 9 saniye) boyunca heartbeat almazsa fenced sayar. Yeni leader de partition'ın ISR listesinden seçilir; burada ISR'yi göstermedik.",
            "In reality the controller fences a broker after no heartbeat for `broker.session.timeout.ms` (9 seconds by default). The new leader also comes from the partition's ISR, which we leave out here.",
          ),
        },
      ],
    },
    {
      short: l("Broker döndü", "Broker back"),
      tag: "how",
      title: l("Dönen broker yeniden kaydolur", "A returning broker registers again"),
      body: [
        l(
          "Broker 2 yeniden açıldı ve aktif controller'a kaydoldu. Controller \"broker 2 yeniden kullanılabilir\" kaydını yazdı.",
          "Broker 2 came back up and registered with the active controller, which wrote \"broker 2 usable again\".",
        ),
        l(
          "Ama P1'in lideri hâlâ broker 3. Liderlik geri taşınmaz; broker 2 şimdilik sadece follower olarak çalışıyor.",
          "But P1 is still led by broker 3. Leadership is not moved back; broker 2 works only as a follower for now.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Replikasyon dersindeki \"preferred leader\" kuralı bir süre sonra liderliği broker 2'ye geri verir. Bu da yine aktif controller'ın log'a yazdığı bir karardır.",
            "The \"preferred leader\" rule from the replication lesson hands leadership back to broker 2 after a while. That, too, is a decision the active controller writes into the log.",
          ),
        },
      ],
    },
    {
      short: l("Controller çöktü", "Controller down"),
      tag: "problem",
      predict: {
        question: l(
          "Aktif controller (C1) çökecek. 3 controller'dan 2'si ayakta kalacak. Ne olur?",
          "The active controller (C1) is about to crash. Two of the three controllers stay up. What happens?",
        ),
        options: [
          l("Kalan ikisi yeni bir aktif controller seçer, iş sürer", "The remaining two elect a new active controller and work goes on"),
          l("Cluster durur", "The cluster stops"),
          l("Broker'lardan biri controller olur", "One of the brokers becomes the controller"),
        ],
        answer: 0,
        why: l(
          "İki controller hâlâ çoğunluk (3'te 2). Aralarında oylama yaparlar, güncel log'a sahip olan aktif olur ve kaldığı yerden devam eder.",
          "Two controllers are still a majority (2 of 3). They hold a vote, one with an up-to-date log becomes active, and it carries on from there.",
        ),
      },
      title: l("Aktif controller çöktü: oylama", "The active controller died: a vote"),
      body: [
        l(
          "C1 çöktü. Ayakta kalan C2 ve C3 bir oylama yaptı ve C2 yeni aktif controller oldu. Epoch sayısı arttı: yeni bir yönetim dönemi başladı.",
          "C1 crashed. The two left, C2 and C3, held a vote and C2 became the new active controller. The epoch went up: a new term has begun.",
        ),
        l(
          "Hiçbir metadata kaybolmadı, çünkü C2'nin log'u C1'inkiyle aynıydı. Broker'lar ve veri trafiği bu değişimi neredeyse hiç fark etmedi.",
          "No metadata was lost, because C2's log matched C1's. The brokers and the data traffic barely noticed the change.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Raft'ta en güncel log'a sahip olmayan bir controller oylamayı kazanamaz. Bu kural, commit edilmiş hiçbir kararın yeni aktif controller tarafından unutulmamasını sağlar.",
            "In Raft, a controller without the most up-to-date log cannot win a vote. That rule ensures the new active controller never forgets a committed decision.",
          ),
        },
      ],
    },
    {
      short: l("Çoğunluk gitti", "No majority"),
      tag: "problem",
      predict: {
        question: l(
          "Bir controller daha (C2) çökecek; 3'ten sadece 1'i kalacak. Bu sırada broker 3 de çökerse ne olur?",
          "Another controller (C2) will crash, leaving only 1 of 3. If broker 3 crashes meanwhile, what happens?",
        ),
        options: [
          l("Kalan controller yeni leader'ları seçer", "The remaining controller picks new leaders"),
          l("Kimse karar yazamaz; broker 3'ün partition'ları leader'sız kalır", "Nobody can write decisions; broker 3's partitions are left without a leader"),
          l("Broker 1 controller'lığı devralır", "Broker 1 takes over as controller"),
        ],
        answer: 1,
        why: l(
          "Tek controller çoğunluk değil, o yüzden hiçbir kaydı commit edemez ve aktif olamaz. Broker 3'ün çöktüğünü bilse de yeni leader kararını yazamaz.",
          "One controller is not a majority, so it cannot commit any record or become active. Even knowing broker 3 died, it cannot write a new-leader decision.",
        ),
      },
      title: l("Çoğunluk yoksa karar da yok", "No majority, no decisions"),
      body: [
        l(
          "C2 de çöktü; sadece C3 ayakta. Tek başına çoğunluk olmadığı için aktif olamıyor: metadata dondu.",
          "C2 crashed too; only C3 is up. Alone it is not a majority, so it cannot become active: the metadata is frozen.",
        ),
        l(
          "Sonra broker 3 çöktü. Normalde controller onun liderliklerini başkasına verirdi, ama karar yazacak kimse yok. P1 ve P2'nin lideri hâlâ çökmüş broker 3: bu iki partition'a kimse yazamıyor.",
          "Then broker 3 crashed. Normally the controller would hand its leaderships to others, but nobody can write decisions. P1 and P2 are still led by the crashed broker 3: nobody can write to them.",
        ),
        l(
          "Dikkat: P0 çalışmaya devam ediyor. Controller'lar gidince veri trafiği durmaz; sadece **değişiklik** yapılamaz.",
          "Note that P0 keeps working. Losing the controllers does not stop data traffic; only **changes** are impossible.",
        ),
      ],
    },
    {
      short: l("Çoğunluk döndü", "Majority back"),
      tag: "how",
      title: l("Çoğunluk dönünce cluster toparlanır", "With a majority back, the cluster recovers"),
      body: [
        l(
          "C1 yeniden açıldı. C1 ve C3 artık çoğunluk; oylama yapıldı ve C1 aktif oldu.",
          "C1 came back up. C1 and C3 are a majority again; they held a vote and C1 became active.",
        ),
        l(
          "Yeni aktif controller ilk iş olarak yokken olanları fark etti: broker 3'ü fenced yaptı, P1'i broker 2'ye ve P2'yi broker 1'e verdi. Sahipsiz partition kalmadı.",
          "The new active controller first caught up with what happened while nobody was in charge: it fenced broker 3 and gave P1 to broker 2 and P2 to broker 1. No partition is stranded any more.",
        ),
      ],
    },
    {
      short: l("Neden 3?", "Why 3?"),
      tag: "reality",
      title: l("Neden 3 ya da 5 controller?", "Why 3 or 5 controllers?"),
      body: [
        l(
          "Karar için çoğunluk gerekir. **3** controller'da çoğunluk 2'dir; yani 1 çökmeye dayanır. **5** controller'da çoğunluk 3'tür; 2 çökmeye dayanır.",
          "Decisions need a majority. With **3** controllers the majority is 2, so it survives 1 failure. With **5** the majority is 3, so it survives 2.",
        ),
        l(
          "**4** controller'ın çoğunluğu 3'tür; yine sadece 1 çökmeye dayanır. Yani çift sayı bir şey kazandırmaz, sadece fazladan bir makine demektir.",
          "**4** controllers need 3 for a majority, which still survives only 1 failure. An even number buys nothing; it is just one more machine.",
        ),
        l(
          "Üretimde genelde broker'lardan ayrı 3 controller kullanılır. Geliştirme ortamında tek bir süreç hem broker hem controller olabilir (`process.roles=broker,controller`).",
          "Production usually runs 3 controllers apart from the brokers. In development, a single process can be both broker and controller (`process.roles=broker,controller`).",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Her şey yeniden ayakta ve C1 aktif. Düğmelerle controller'ları ve broker'ları çökertip başlatabilir, yeni topic oluşturabilirsin.",
          "Everything is running again and C1 is active. With the buttons you can crash and start controllers and brokers, and create topics.",
        ),
        l(
          "**4 görev** var: aktif controller'ı değiştirmek, metadata'yı dondurmak, bir partition'ı sahipsiz bırakmak ve cluster'ı kurtarmak.",
          "There are **4 missions**: changing the active controller, freezing the metadata, stranding a partition, and rescuing the cluster.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Üstteki \"Çoğunluk\" sayacı her şeyi anlatır: \"yok\" olduğu sürece hiçbir değişiklik yazılamaz.",
            "The \"Majority\" counter on top tells the whole story: while it says \"no\", no change can be written.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "[[metadata|Metadata]] cluster'ın haritasıdır ve onu [[controller]] yönetir: broker'ları izler, leader seçer, topic kaydeder.",
      "[[metadata|Metadata]] is the cluster's map, and the [[controller]] manages it: it watches brokers, picks leaders and records topics.",
    ),
    l(
      "[[kraft|KRaft]] ile metadata Kafka'nın içinde, Raft ile yönetilir; [[zookeeper|ZooKeeper]] Kafka 4.0'da tamamen kaldırıldı.",
      "With [[kraft]], metadata is managed inside Kafka using Raft; [[zookeeper]] was removed entirely in Kafka 4.0.",
    ),
    l(
      "Her değişiklik [[metadataLog]]'a bir kayıt olarak yazılır; controller'ların çoğunluğu kopyalayınca commit edilir ve broker'lar okur.",
      "Every change is a record in the [[metadataLog]]; it is committed once a majority of controllers has it, and brokers read it.",
    ),
    l(
      "Bir broker'ın heartbeat'i kesilince aktif controller onu [[fenced|fenced]] yapar ve liderliklerini başka broker'lara verir.",
      "When a broker's heartbeats stop, the active controller marks it [[fenced]] and moves its leaderships to other brokers.",
    ),
    l(
      "Aktif controller çökerse kalan çoğunluk yenisini seçer. Çoğunluk ([[quorum]]) yoksa metadata donar: veri akar ama değişiklik yapılamaz.",
      "If the active controller dies, the remaining majority picks a new one. Without a majority ([[quorum]]) metadata freezes: data flows, but nothing can change.",
    ),
  ],
  quiz: [
    {
      question: l("Bir partition'ın leader'ı çökünce yeni leader'ı kim seçer?", "When a partition's leader dies, who picks the new one?"),
      options: [
        l("Producer", "The producer"),
        l("Aktif controller", "The active controller"),
        l("Consumer group", "The consumer group"),
        l("Çöken broker, yeniden açılınca", "The crashed broker, once it restarts"),
      ],
      answer: 1,
      explain: l(
        "Aktif controller broker'ları heartbeat ile izler, yeni leader'ı seçer ve kararı metadata log'a yazar.",
        "The active controller watches brokers through heartbeats, picks the new leader and writes the decision into the metadata log.",
      ),
      reviewStep: 4,
    },
    {
      question: l("5 controller'lı bir quorum aynı anda kaç controller'ın çökmesine dayanır?", "How many controllers can fail at once in a 5-controller quorum?"),
      options: [l("1", "1"), l("2", "2"), l("3", "3"), l("4", "4")],
      answer: 1,
      explain: l(
        "Çoğunluk 3'tür. 2 controller çökerse 3 kalır ve karar verilebilir; 3 çökerse çoğunluk gider.",
        "The majority is 3. With 2 down, 3 remain and decisions can be made; with 3 down, the majority is gone.",
      ),
      reviewStep: 9,
    },
    {
      question: l(
        "3 controller'dan 2'si çöktü. Hangisi doğru?",
        "Two of three controllers are down. Which is true?",
      ),
      options: [
        l("Bütün okuma ve yazmalar durur", "All reads and writes stop"),
        l("Mevcut leader'larla veri akmaya devam eder ama yeni topic ve leader değişimi yapılamaz", "Data keeps flowing through current leaders, but no new topics or leader changes"),
        l("Kalan controller tek başına karar verir", "The remaining controller decides alone"),
        l("Broker'lar ZooKeeper'a geri döner", "The brokers fall back to ZooKeeper"),
      ],
      answer: 1,
      explain: l(
        "Çoğunluk yoksa metadata commit edilemez, yani değişiklik olmaz. Ama ayakta olan leader'lar veri taşımaya devam eder.",
        "Without a majority nothing can be committed, so nothing changes. But leaders that are up keep serving data.",
      ),
      reviewStep: 7,
    },
    {
      question: l("Kafka 4.0'da metadata nerede tutulur?", "Where is metadata kept in Kafka 4.0?"),
      options: [
        l("ZooKeeper'da", "In ZooKeeper"),
        l("Her broker'ın ayrı bir dosyasında", "In a separate file on each broker"),
        l("Controller'ların Raft ile kopyaladığı `__cluster_metadata` log'unda", "In the `__cluster_metadata` log, replicated by the controllers with Raft"),
        l("Producer'ların belleğinde", "In the producers' memory"),
      ],
      answer: 2,
      explain: l(
        "Kafka 4.0 sadece KRaft ile çalışır: metadata, controller'ların kopyaladığı `__cluster_metadata` log'undadır.",
        "Kafka 4.0 runs only with KRaft: metadata lives in the `__cluster_metadata` log that the controllers replicate.",
      ),
      reviewStep: 3,
    },
  ],
};
