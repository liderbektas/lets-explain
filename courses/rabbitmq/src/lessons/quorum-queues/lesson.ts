import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const quorumQueues: Lesson = {
  slug: "quorum-queues",
  title: l("Quorum queue'lar", "Quorum queues"),
  summary: l(
    "Bir node çöktüğünde classic kuyruk onunla birlikte gider. Quorum kuyruğu üç node'a kopyalanır, leader değiştirir ve çoğunluk varken çalışmaya devam eder.",
    "When a node goes down, a classic queue goes with it. A quorum queue is copied to three nodes, switches leader, and keeps working while a majority is up.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Classic kuyruğun tek bir node'da yaşadığını görmek", "See that a classic queue lives on one node"), step: 2 },
    { text: l("Quorum kuyruğunda leader'ın başka node'a geçtiğini görmek", "See a quorum queue's leader move to another node"), step: 2 },
    { text: l("Çoğunluk kaybolunca quorum kuyruğunun mesaj reddettiğini görmek", "See a quorum queue refuse messages without a majority"), step: 4 },
    { text: l("Hangi kuyruk türünü ne zaman seçeceğini bilmek", "Know which queue type to pick when"), step: 7 },
  ],
  steps: [
    {
      short: l("Cluster", "Cluster"),
      tag: "how",
      title: l("Üç node, iki çeşit kuyruk", "Three nodes, two kinds of queue"),
      body: [
        l(
          "Burada RabbitMQ tek bir sunucu değil, birlikte çalışan üç sunucu: `rabbit@1`, `rabbit@2` ve `rabbit@3`. Buna cluster denir, her sunucuya da node.",
          "Here RabbitMQ is not one server but three working together: `rabbit@1`, `rabbit@2` and `rabbit@3`. That is a cluster, and each server is a node.",
        ),
        l(
          "`cache` bir **classic** kuyruk: tek bir kopyası var ve o kopya `rabbit@1`'de duruyor. `orders` ise bir **quorum** kuyruğu: üç node'un hepsinde bir kopyası var. Biri **leader** (yazmaları kabul eden), diğerleri **follower** (onu takip eden).",
          "`cache` is a **classic** queue: it has one copy, on `rabbit@1`. `orders` is a **quorum** queue: every node holds a copy. One is the **leader** (it accepts writes), the others are **followers** (they keep up with it).",
        ),
        l(
          "Alttaki üç kart node'ları gösteriyor. Her kartta, o node'un hangi kuyruğun hangi kopyasını tuttuğu yazıyor.",
          "The three cards at the bottom are the nodes. Each card shows which copy of which queue that node holds.",
        ),
      ],
      practice: {
        intro: l("Üç node'luk bir cluster kurmak için, aynı Docker ağında `rabbit1`, `rabbit2` ve `rabbit3` adlı üç container açtıktan sonra:", "To build a three-node cluster, after starting three containers named `rabbit1`, `rabbit2` and `rabbit3` on one Docker network:"),
        commands: [
          { cmd: "docker exec rabbit2 rabbitmqctl stop_app" },
          { cmd: "docker exec rabbit2 rabbitmqctl reset" },
          {
            cmd: "docker exec rabbit2 rabbitmqctl join_cluster rabbit@rabbit1",
            note: l(
              "Node'lar aynı Erlang cookie'yi (`/var/lib/rabbitmq/.erlang.cookie`) paylaşmalı ve birbirine host adıyla ulaşabilmeli. Aynısını `rabbit3` için de yap.",
              "The nodes must share the same Erlang cookie (`/var/lib/rabbitmq/.erlang.cookie`) and reach each other by host name. Do the same for `rabbit3`.",
            ),
          },
          { cmd: "docker exec rabbit2 rabbitmqctl start_app" },
          { cmd: "docker exec rabbit1 rabbitmqctl cluster_status", note: l("Üç node'u da listelemeli.", "Should list all three nodes.") },
        ],
      },
    },
    {
      short: l("Gönder", "Send"),
      tag: "how",
      title: l("İki kuyruğa da mesaj", "Messages into both queues"),
      body: [
        l(
          "Uygulama iki kuyruğa da ikişer mesaj gönderdi. Görünüşte fark yok: ikisi de mesajları sıraya koydu.",
          "The app sent two messages to each queue. On the surface nothing differs: both lined them up.",
        ),
        l(
          "Arkada fark büyük. `cache`'e giden mesaj sadece `rabbit@1`'in diskine yazıldı. `orders`'a giden mesajı leader, follower'lara da gönderdi ve **çoğunluk** (üç kopyadan en az ikisi) yazdığında kabul etti. Bu oylama yöntemine **Raft** denir.",
          "Behind the scenes the difference is big. The message for `cache` was written only to `rabbit@1`'s disk. The message for `orders` was sent by the leader to the followers too, and accepted once a **majority** (at least two of three copies) had it. This voting method is called **Raft**.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Node.js · quorum kuyruğu",
            code: 'await ch.assertQueue("orders", {\n  durable: true,\n  arguments: { "x-queue-type": "quorum" },\n});',
            note: l("Kuyruk türü tanımlanırken seçilir ve sonradan değiştirilemez. Quorum kuyrukları her zaman durable'dır.", "The type is chosen when the queue is declared and cannot change later. Quorum queues are always durable."),
          },
        ],
      },
    },
    {
      short: l("Node çöktü", "Node down"),
      tag: "problem",
      predict: {
        question: l("`rabbit@1` çökecek. Hangi kuyruk çalışmaya devam eder?", "`rabbit@1` is about to go down. Which queue keeps working?"),
        options: [l("İkisi de", "Both"), l("Sadece `orders` (quorum)", "Only `orders` (quorum)"), l("Hiçbiri", "Neither")],
        answer: 1,
        why: l(
          "`cache`'in tek kopyası `rabbit@1`'deydi, onunla birlikte erişilemez oldu. `orders`'ın iki kopyası hâlâ çalışıyor: kalan node'lar yeni bir leader seçti.",
          "`cache`'s only copy was on `rabbit@1`, so it became unreachable with it. Two copies of `orders` are still up, and the remaining nodes elected a new leader.",
        ),
      },
      title: l("Classic kuyruk node'uyla birlikte gider", "A classic queue goes down with its node"),
      body: [
        l(
          "`rabbit@1` çöktü. `cache` kuyruğu \"kapalı\" görünüyor: tek kopyası o node'daydı. Mesajları diskte duruyor ama node geri gelene kadar kimse onlara ulaşamaz.",
          "`rabbit@1` went down. The `cache` queue shows \"down\": its only copy was on that node. Its messages are on disk, but nobody can reach them until the node is back.",
        ),
        l(
          "`orders` ise çalışmaya devam ediyor. Kalan iki node aralarında oylayıp `rabbit@2`'yi yeni leader yaptı. Kartlarda leader etiketi `rabbit@2`'ye geçti.",
          "`orders` keeps working. The two remaining nodes voted and made `rabbit@2` the new leader. On the cards, the leader label moved to `rabbit@2`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec rabbit2 rabbitmq-queues quorum_status orders", note: l("Quorum kuyruğunun üyelerini ve şu anki leader'ını gösterir.", "Shows the quorum queue's members and its current leader.") },
          { cmd: "docker exec rabbit2 rabbitmqctl list_queues name type leader members", note: l("Her kuyruğun türünü, leader'ını ve kopyalarını listeler.", "Lists every queue's type, leader and copies.") },
        ],
      },
    },
    {
      short: l("Arıza anı", "During the outage"),
      tag: "experiment",
      predict: {
        question: l("`rabbit@1` hâlâ kapalı. İki kuyruğa da birer mesaj göndereceğiz. Ne olur?", "`rabbit@1` is still down. We will send one message to each queue. What happens?"),
        options: [
          l("İkisi de kuyrukta bekler", "Both wait in their queues"),
          l("`cache`'e giden kaybolur, `orders`'a giden kabul edilir", "The one for `cache` is lost, the one for `orders` is accepted"),
          l("İkisi de kaybolur", "Both are lost"),
        ],
        answer: 1,
        why: l(
          "Mesajın gideceği classic kuyruk ulaşılamaz durumda, o mesajı tutacak bir yer yok. Quorum kuyruğunun ise çoğunluğu ayakta, mesajı normal şekilde kabul eder.",
          "The classic queue the message is routed to is unreachable, so there is nowhere to keep it. The quorum queue still has its majority and accepts the message as usual.",
        ),
      },
      title: l("Arıza sırasında gelen mesajlar", "Messages that arrive during the outage"),
      body: [
        l(
          "`cache` için gönderilen `c3` kayboldu: sayaçta \"Kayıp: 1\" yazıyor. `orders`'a giden `o3` ise kuyrukta, diğerlerinin yanında.",
          "`c3`, sent for `cache`, is lost: the counter says \"Lost: 1\". `o3`, sent to `orders`, is in the queue with the others.",
        ),
        l(
          "Uygulama açısından fark şu: classic kuyruk tek bir node'un sağlığına bağlı. Quorum kuyruğu, node'lardan biri düşse de işine devam eder.",
          "From the app's point of view: a classic queue depends on one node's health. A quorum queue carries on when one of the nodes falls over.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte, ulaşılamayan bir classic kuyruğa yönlenen mesajlar için ne olacağı ayarlara bağlıdır. Publisher confirms ve `mandatory` kullanırsan bunu fark edebilirsin, ama kuyruk node'u geri gelene kadar kullanılamaz. Sahnede bu mesaj doğrudan kaybolmuş gösteriliyor.",
            "In reality, what happens to messages routed to an unreachable classic queue depends on settings. With publisher confirms and `mandatory` you can notice, but the queue is unusable until its node returns. The scene simply shows the message as lost.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "docker stop rabbit1", note: l("Kendi cluster'ında bir node'u durdurup aynı şeyi dene.", "Stop a node in your own cluster and try the same.") }] },
    },
    {
      short: l("Çoğunluk", "Majority"),
      tag: "how",
      predict: {
        question: l(
          "Şimdi `rabbit@2` de çökecek, sadece `rabbit@3` kalacak. `orders`'a mesaj gönderince ne olur?",
          "Now `rabbit@2` goes down too, leaving only `rabbit@3`. What happens when we send to `orders`?",
        ),
        options: [
          l("`rabbit@3` leader olur ve mesajı kabul eder", "`rabbit@3` becomes leader and accepts it"),
          l("Broker mesajı reddeder (nack)", "The broker refuses the message (nack)"),
          l("Mesaj kuyrukta bekler ama kimse okuyamaz", "The message waits in the queue but nobody can read it"),
        ],
        answer: 1,
        why: l(
          "Üç kopyadan biri çoğunluk değil. Tek başına kalan node kimseyle oylayamaz, bu yüzden leader seçilemez ve yazma kabul edilmez. Broker publisher'a nack döner.",
          "One copy of three is not a majority. A lone node has nobody to vote with, so no leader can be elected and no write is accepted. The broker nacks the publisher.",
        ),
      },
      title: l("Çoğunluk yoksa yazma da yok", "No majority, no writes"),
      body: [
        l(
          "Üç node'dan sadece biri çalışıyor. `orders` artık \"kapalı\": çoğunluğu kaybetti. Gönderilen `o4`'ü broker **reddetti** (nack) ve kuyruğa koymadı.",
          "Only one of three nodes is up. `orders` is now \"down\": it lost its majority. The broker **refused** `o4` (nack) and did not store it.",
        ),
        l(
          "Bu bir hata değil, bir tercih: quorum kuyruğu, emin olamadığı bir mesajı \"kabul ettim\" deyip sonra kaybetmektense hiç kabul etmemeyi seçer. Nack alan uygulama mesajı sonra tekrar gönderebilir.",
          "This is not a bug but a choice: rather than say \"accepted\" and maybe lose it later, a quorum queue would rather not accept the message at all. An app that gets a nack can send it again later.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Üç kopya bir node kaybını, beş kopya iki node kaybını kaldırır. Kural hep aynı: yarıdan fazlası ayakta olmalı. Bu yüzden cluster'lar tek sayıda node ile kurulur.",
            "Three copies survive losing one node; five survive losing two. The rule is always the same: more than half must be up. That is why clusters have an odd number of nodes.",
          ),
        },
      ],
    },
    {
      short: l("Geri dönüş", "Recovery"),
      tag: "how",
      title: l("Node'lar geri gelince", "When the nodes come back"),
      body: [
        l(
          "Önce `rabbit@2`, sonra `rabbit@1` geri geldi. `orders` yeniden çoğunluğa kavuştu ve `rabbit@2` leader olarak devam ediyor. Geri gelen kopyalar, kaçırdıklarını leader'dan alıp yetişir.",
          "First `rabbit@2`, then `rabbit@1` came back. `orders` has its majority again, with `rabbit@2` still leading. The returning copies fetch what they missed from the leader and catch up.",
        ),
        l(
          "`cache` de geri döndü ve eski iki mesajı (`c1`, `c2`) yerinde. Onlar durable bir kuyrukta persistent mesajlardı, diske yazılmışlardı. Sadece arıza sırasında gelen `c3` gitti.",
          "`cache` is back too, with its two old messages (`c1`, `c2`) in place. They were persistent messages in a durable queue, written to disk. Only `c3`, which arrived during the outage, is gone.",
        ),
      ],
      practice: { commands: [{ cmd: "docker exec rabbit1 rabbitmqctl list_queues name type leader members", note: l("Leader'ın kim olduğunu tekrar kontrol et.", "Check who leads now.") }] },
    },
    {
      short: l("Tüket", "Consume"),
      tag: "how",
      title: l("Consumer için fark yok", "No difference for consumers"),
      body: [
        l(
          "İki kuyruğu da birer işçi okudu: `cache`'ten 2, `orders`'tan 3 mesaj. Consumer kodu kuyruğun türünü bilmek zorunda değil; ack, nack ve prefetch aynı çalışır.",
          "A worker read each queue: 2 messages from `cache`, 3 from `orders`. Consumer code does not need to know the queue type; ack, nack and prefetch work the same.",
        ),
        l(
          "Bir fark var: quorum kuyrukları bir mesajın kaç kez geri döndüğünü sayar. RabbitMQ 4'ten beri **varsayılan teslim sınırı 20**. Bir mesaj 20 kez requeue edilirse kuyruk onu dead letter yapar ya da atar. Zehirli mesajlar dersinde bunu ayrıntılı göreceğiz.",
          "One difference: quorum queues count how often a message came back. Since RabbitMQ 4 the **default delivery limit is 20**. A message requeued 20 times gets dead-lettered or dropped. The poison messages lesson covers this in detail.",
        ),
      ],
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "reality",
      title: l("Classic mi, quorum mu?", "Classic or quorum?"),
      body: [
        l(
          "Kaybedilmemesi gereken iş mesajları (siparişler, ödemeler, görevler) için **quorum** kuyruğu seç. Bir node düşse de çalışır ve mesajlar en az iki diskte durur.",
          "For business messages that must not be lost (orders, payments, jobs), pick a **quorum** queue. It keeps working when a node falls over, and messages live on at least two disks.",
        ),
        l(
          "**Classic** kuyruk, kısa ömürlü ya da kaybolsa da sorun olmayan veriler için hâlâ iyi: geçici cevap kuyrukları, önbellek bildirimleri, tek node'luk geliştirme ortamları. Hem daha hafif hem de geçici (non-durable) olabilir.",
          "A **classic** queue is still fine for short-lived or expendable data: temporary reply queues, cache notices, single-node dev setups. It is lighter and can be non-durable.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Eskiden classic kuyruklar \"mirrored\" yapılarak kopyalanabiliyordu. Bu özellik RabbitMQ 4.0'da tamamen kaldırıldı; kopyalanan kuyruk istiyorsan artık quorum kuyruğu (ya da stream) kullanmalısın.",
            "Classic queues used to be copied by making them \"mirrored\". That feature was removed completely in RabbitMQ 4.0; for replicated queues you now use quorum queues (or streams).",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Sahnede quorum kuyruğu her zaman üç kopyalı ve leader seçimi anında oluyor. Gerçekte kopya sayısı `x-quorum-initial-group-size` ile ayarlanır (varsayılan 3, ya da cluster daha küçükse cluster boyutu) ve seçim birkaç saniye sürebilir.",
            "Here a quorum queue always has three copies and elections are instant. In reality the copy count comes from `x-quorum-initial-group-size` (3 by default, or the cluster size if smaller) and an election can take a few seconds.",
          ),
        },
      ],
      practice: {
        commands: [
          {
            cmd: "docker exec rabbit1 rabbitmq-queues check_if_node_is_quorum_critical",
            note: l("Bakım için bir node'u kapatmadan önce: kapatırsan çoğunluğunu kaybedecek quorum kuyruğu var mı?", "Before taking a node down for maintenance: would any quorum queue lose its majority?"),
          },
          { cmd: "docker exec rabbit1 rabbitmq-diagnostics check_running", note: l("Node'un ayakta ve çalışır olduğunu doğrular.", "Checks the node is up and running.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda üç node'luk bir cluster ve gerçek işten **4 senaryo** var: bakım için node durdurmak, yanlış türde tanımlanmış bir kuyruk, ve bir leader'ı taşımak. Node'lar Docker container'ı: `rabbit1`, `rabbit2`, `rabbit3`.",
          "Your turn. Below is a three-node cluster and **4 scenarios** from real work: stopping nodes for maintenance, a queue declared with the wrong type, and moving a leader. The nodes are Docker containers: `rabbit1`, `rabbit2`, `rabbit3`.",
        ),
        l(
          "`docker stop`, `docker start`, `docker restart` ve `docker ps -a` ile node'ları yönet; `docker exec rabbit1 rabbitmq-queues quorum_status orders` ile kopyalara, `rabbitmqctl list_queues name type leader members` ile kuyruklara bak.",
          "Manage the nodes with `docker stop`, `docker start`, `docker restart` and `docker ps -a`; look at the copies with `docker exec rabbit1 rabbitmq-queues quorum_status orders` and at the queues with `rabbitmqctl list_queues name type leader members`.",
        ),
      ],
    },
  ],
  recap: [
    l("Classic kuyruğun tek kopyası vardır ve tek bir node'da yaşar; node düşerse kuyruk da kullanılamaz.", "A classic queue has one copy on one node; when the node falls over, the queue is unusable."),
    l("Quorum kuyruğu birden fazla node'a kopyalanır (varsayılan 3) ve Raft ile çalışır: bir leader ve follower'lar.", "A quorum queue is copied to several nodes (3 by default) and runs on Raft: one leader and followers."),
    l("Leader'ın node'u düşerse kalanlar yeni bir leader seçer; kuyruk çalışmaya devam eder.", "If the leader's node falls over, the rest elect a new leader and the queue carries on."),
    l("Quorum kuyruğu çoğunluk ister: üç kopyadan en az ikisi ayakta değilse yazma kabul etmez, publisher'a nack döner.", "A quorum queue needs a majority: with fewer than two of three copies up it accepts no writes and nacks the publisher."),
    l("Quorum kuyrukları hep durable'dır, RabbitMQ 4'te varsayılan teslim sınırı 20'dir; mirrored classic kuyruklar 4.0'da kaldırıldı.", "Quorum queues are always durable, with a default delivery limit of 20 in RabbitMQ 4; mirrored classic queues were removed in 4.0."),
  ],
  quiz: [
    {
      question: l("Beş node'luk bir cluster'da 5 kopyalı bir quorum kuyruğu var. Aynı anda en fazla kaç node düşerse kuyruk çalışmaya devam eder?", "A quorum queue has 5 copies in a five-node cluster. How many nodes can be down at once with the queue still working?"),
      options: [l("1", "1"), l("2", "2"), l("3", "3"), l("4", "4")],
      answer: 1,
      explain: l("Çoğunluk 5'in yarısından fazlası, yani 3. İki node düşse de 3 kopya ayakta kalır.", "A majority of 5 is 3. With two nodes down, 3 copies are still up."),
      reviewStep: 4,
    },
    {
      question: l("Bir classic kuyruğun node'u çöktü. Kuyruktaki persistent mesajlara ne olur?", "A classic queue's node crashed. What happens to the persistent messages in it?"),
      options: [
        l("Başka bir node'a kopyalanır", "They are copied to another node"),
        l("Diskte durur ama node geri gelene kadar ulaşılamaz", "They stay on disk, unreachable until the node returns"),
        l("Hemen silinir", "They are deleted at once"),
        l("Quorum kuyruğuna taşınır", "They move to a quorum queue"),
      ],
      answer: 1,
      explain: l("Classic kuyruğun tek kopyası o node'daydı. Mesajlar diskte güvende ama node dönene kadar kimse okuyamaz.", "The classic queue's only copy was on that node. The messages are safe on disk, but nobody can read them until it returns."),
      reviewStep: 2,
    },
    {
      question: l("Çoğunluğunu kaybetmiş bir quorum kuyruğuna mesaj gönderilirse ne olur?", "What happens when a message is sent to a quorum queue that lost its majority?"),
      options: [
        l("Kalan tek node kabul eder", "The one remaining node accepts it"),
        l("Broker nack döner, mesaj saklanmaz", "The broker nacks it and does not store it"),
        l("Mesaj sessizce kaybolur ve uygulama bunu hiç bilemez", "It is silently lost and the app can never know"),
        l("Mesaj bir classic kuyruğa düşer", "It falls into a classic queue"),
      ],
      answer: 1,
      explain: l("Quorum kuyruğu emin olamadığı yazmayı kabul etmez. Publisher confirms açıksa uygulama nack'i görür ve tekrar deneyebilir.", "A quorum queue does not accept a write it cannot be sure of. With publisher confirms on, the app sees the nack and can retry."),
      reviewStep: 4,
    },
    {
      question: l("RabbitMQ 4.x'te kopyalanan (replicated), kaybolmaması gereken iş mesajları için hangi kuyruk türü önerilir?", "In RabbitMQ 4.x, which queue type is recommended for replicated business messages that must not be lost?"),
      options: [l("Mirrored classic", "Mirrored classic"), l("Quorum", "Quorum"), l("Geçici (non-durable) classic", "Transient classic"), l("Fark etmez", "It does not matter")],
      answer: 1,
      explain: l("Mirrored classic kuyruklar 4.0'da kaldırıldı. Kopyalanan kuyruk için quorum kuyruğu kullanılır.", "Mirrored classic queues were removed in 4.0. Replicated queues are quorum queues."),
      reviewStep: 7,
    },
  ],
};
