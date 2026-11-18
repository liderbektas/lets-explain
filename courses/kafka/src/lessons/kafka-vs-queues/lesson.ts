import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, KafkaVsQueuesScene } from "./Scene";

export const kafkaVsQueues: Lesson = {
  slug: "kafka-vs-queues",
  title: l("Kafka ve klasik kuyruklar", "Kafka vs. Classic Queues"),
  summary: l(
    "Klasik bir kuyruk mesajı tek bir worker'a verir ve onaylanınca siler. Kafka kayıtları saklar; her group kendi konumundan okur ve geçmişi yeniden oynatabilir.",
    "A classic queue hands a message to one worker and deletes it on ack. Kafka keeps records; every group reads from its own position and can replay history.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: KafkaVsQueuesScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kuyrukta onaylanan mesajın silindiğini görmek", "See that an acknowledged message is deleted from a queue"), step: 1 },
    { text: l("Kuyruğa sonradan bağlanan servisin neden geçmişi göremediğini görmek", "See why a service that joins a queue late sees no history"), step: 3 },
    { text: l("Kafka'da her group'un aynı kayıtları kendi hızında okuduğunu görmek", "See that in Kafka every group reads the same records at its own pace"), step: 6 },
    { text: l("Group içindeki işin partition'larla paylaşıldığını anlamak", "Understand that work inside a group is shared by partition"), step: 7 },
    { text: l("Hangi işe hangisinin uyduğuna karar verebilmek", "Be able to choose which one fits a job"), step: 8 },
    { text: l("Kafka'nın share group'larını tanımak", "Know about Kafka's share groups"), step: 9 },
  ],
  steps: [
    {
      short: l("Kuyruk", "A queue"),
      tag: "how",
      title: l("Klasik bir mesaj kuyruğu", "A classic message queue"),
      body: [
        l(
          "Kafka'dan önce, servisler arasına konan en yaygın şey bir [[messageQueue]] idi. Sipariş servisi üç siparişi kuyruğa koydu.",
          "Before Kafka, the most common thing to put between services was a [[messageQueue]]. The order service put three orders into the queue.",
        ),
        l(
          "Kuyruğun önünde iki worker bekliyor. Kuyruk, posta kutusu gibi bir \"yapılacak işler\" listesidir: her mesaj bir iştir ve biri onu yapınca listeden çıkar.",
          "Two workers wait in front of the queue. A queue is a to-do list, like a mailbox: every message is a task, and once someone does it, it leaves the list.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ, ActiveMQ ve Amazon SQS bu tür sistemlere örnek. Her birinin ayrıntıları farklıdır; burada ortak temel davranışı gösteriyoruz.",
            "RabbitMQ, ActiveMQ and Amazon SQS are examples. Each differs in detail; here we show the basic behaviour they share.",
          ),
        },
      ],
    },
    {
      short: l("Onay = sil", "Ack = delete"),
      tag: "how",
      predict: {
        question: l(
          "Worker A ilk mesajı aldı, işledi ve kuyruğa \"tamam\" dedi (ack). O mesaja ne olur?",
          "Worker A took the first message, handled it and told the queue \"done\" (ack). What happens to that message?",
        ),
        options: [
          l("Kuyrukta kalır, başkaları da okuyabilir", "It stays in the queue for others to read"),
          l("Kuyruktan silinir", "It is deleted from the queue"),
          l("Worker B'ye de gönderilir", "It is also sent to worker B"),
        ],
        answer: 1,
        why: l(
          "Kuyruk için onaylanan mesajın işi bitmiştir, bu yüzden silinir. Bir daha kimse onu göremez.",
          "For a queue, an acknowledged message is finished, so it is deleted. Nobody can see it again.",
        ),
      },
      title: l("Al, işle, onayla: mesaj silinir", "Take, handle, ack: the message is deleted"),
      body: [
        l(
          "Worker A mesaj 0'ı aldı. Aldığı andan itibaren mesaj onundur; diğer worker'lar onu görmez.",
          "Worker A took message 0. From that moment the message is its own; the other workers do not see it.",
        ),
        l(
          "İşi bitince kuyruğa onay (ack) gönderdi ve mesaj **silindi**: öğütücüye düştü.",
          "When it finished, it sent the queue an ack and the message was **deleted**: it fell into the shredder.",
        ),
      ],
    },
    {
      short: l("Rekabet", "Competing"),
      tag: "how",
      title: l("İşi paylaşan worker'lar", "Workers that share the work"),
      body: [
        l(
          "Worker A ve B aynı anda birer mesaj aldı. Her mesaj **sadece bir** worker'a gitti, ikisi de onaylayınca ikisi de silindi.",
          "Workers A and B each took one message at the same time. Every message went to **only one** worker, and both were deleted once acknowledged.",
        ),
        l(
          "Bu düzene [[competingConsumers]] denir. İş çoğalırsa yeni bir worker eklersin ve kuyruk işi kendiliğinden aralarında dağıtır.",
          "This setup is called [[competingConsumers]]. When the work grows, you add a worker and the queue spreads the work among them by itself.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kuyrukların en güçlü yanı bu: \"bu işi biri yapsın\" demek çok kolay. Resim küçültme, e-posta gönderme gibi işler için biçilmiş kaftan.",
            "This is what queues do best: \"someone, do this task\" is very easy. A great fit for jobs like resizing images or sending emails.",
          ),
        },
      ],
    },
    {
      short: l("Geçmiş yok", "No history"),
      tag: "problem",
      predict: {
        question: l(
          "İki sipariş daha gelip işlendi. Şimdi Analitik servisi geçmiş siparişleri incelemek için aynı kuyruğa bağlanıyor. Ne görür?",
          "Two more orders came in and were handled. Now the analytics service connects to the same queue to study past orders. What does it see?",
        ),
        options: [
          l("Beş siparişin hepsini", "All five orders"),
          l("Hiçbirini: kuyruk boş", "None of them: the queue is empty"),
          l("Sadece son siparişi", "Only the last order"),
        ],
        answer: 1,
        why: l(
          "Onaylanan her mesaj silindi. Kuyruk sadece bekleyen işleri tutar, geçmişi tutmaz.",
          "Every acknowledged message was deleted. A queue only holds waiting tasks, not history.",
        ),
      },
      title: l("Kuyruk geçmişi unutur", "A queue forgets the past"),
      body: [
        l(
          "İki sipariş daha işlendi ve silindi. Sonra Analitik kuyruğa bağlandı ve bir mesaj istedi: **kuyruk boştu**. Önceki siparişlerin hiçbir izi yok.",
          "Two more orders were handled and deleted. Then analytics connected and asked for a message: **the queue was empty**. No trace of the earlier orders remains.",
        ),
        l(
          "Bir de şunu düşün: yeni siparişler gelseydi, Analitik bir worker gibi davranıp onları diğer worker'ların elinden **kapacaktı**. Kuyrukta bir mesajı iki farklı servis okumaz; bunun için her servise ayrı bir kuyruk kurman gerekir.",
          "And consider this: had new orders come in, analytics would have acted like another worker and **taken** them away from the others. In a queue two different services do not read the same message; you need a separate queue per service for that.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ gibi sistemlerde bir mesajı birden çok servise dağıtmak için exchange'ler ve servis başına kuyruklar kurulur. Ama bu kuyruklar ancak kurulduktan sonra gelen mesajları alır; geçmişi yine göremezler.",
            "Systems like RabbitMQ fan a message out to several services with exchanges and one queue per service. But each queue only gets messages that arrive after it exists; it still cannot see the past.",
          ),
        },
      ],
    },
    {
      short: l("Yeniden teslim", "Redelivery"),
      tag: "reality",
      predict: {
        question: l(
          "Worker A bir mesajı aldı ama onaylamadan çöktü. O mesaja ne olur?",
          "Worker A took a message but crashed before acking it. What happens to that message?",
        ),
        options: [
          l("Kaybolur", "It is lost"),
          l("Kuyruğa geri döner ve başka bir worker alır", "It goes back to the queue and another worker takes it"),
          l("Silinir, çünkü alınmıştı", "It is deleted, because it was taken"),
        ],
        answer: 1,
        why: l(
          "Kuyruk onay almadığı için mesajın işlendiğini bilmez ve onu yeniden teslim eder. Bu, Kafka'daki at-least-once davranışın kuyruktaki karşılığı.",
          "Without an ack, the queue cannot know the message was handled, so it delivers it again. That is the queue version of at-least-once in Kafka.",
        ),
      },
      title: l("Worker çökerse: yeniden teslim", "If a worker crashes: redelivery"),
      body: [
        l(
          "Yeni bir sipariş geldi ve Worker A onu aldı, ama onaylayamadan çöktü. Kuyruk onay görmediği için mesajı **geri** koydu ve Worker B aldı.",
          "A new order arrived and worker A took it, but crashed before acking. The queue saw no ack, so it put the message **back**, and worker B took it.",
        ),
        l(
          "Bir mesaj böylece birden fazla kez işlenebilir. Kuyrukta da tekrarı zararsız yapan (idempotent) işleme gerekir.",
          "So a message can be handled more than once. Queues also need processing that makes repeats harmless (idempotent).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada mesaj anında geri dönüyor. Gerçekte RabbitMQ worker'ın bağlantısı kopunca, SQS ise *visibility timeout* süresi dolunca mesajı yeniden teslim eder.",
            "Here the message comes back at once. In reality RabbitMQ redelivers when the worker's connection drops, and SQS when the *visibility timeout* expires.",
          ),
        },
      ],
    },
    {
      short: l("Kafka", "Kafka"),
      tag: "idea",
      title: l("Kafka'da kayıtlar kalır", "In Kafka, records stay"),
      body: [
        l(
          "Aslında sipariş servisi aynı altı siparişi baştan beri bir Kafka [[topic]]'ine de yazıyordu. Şimdi o tarafa bakalım.",
          "In fact the order service has been writing the same six orders to a Kafka [[topic]] all along. Let's look at that side now.",
        ),
        l(
          "Fatura group'u altı kaydın hepsini okudu ve commit etti. Log'a bak: **hiçbiri silinmedi**. Okumak kayda dokunmaz; sadece Fatura'nın konumu ilerledi.",
          "The billing group read all six records and committed. Look at the log: **none were deleted**. Reading does not touch a record; only billing's position moved.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kuyrukta \"mesajın durumu\" broker'dadır (alındı, onaylandı, silindi). Kafka'da durum okuyucudadır: her group sadece bir sayı, yani kendi offset'ini tutar.",
            "In a queue, the broker tracks each message's state (taken, acked, deleted). In Kafka the state lives with the reader: each group keeps a single number, its offset.",
          ),
        },
      ],
    },
    {
      short: l("Her group", "Every group"),
      tag: "how",
      predict: {
        question: l(
          "Fatura altı siparişi okudu ve commit etti. Analitik group'u şimdi `earliest` ile Kafka'ya bağlanıyor. Kaç sipariş okur?",
          "Billing read the six orders and committed. The analytics group now connects to Kafka with `earliest`. How many orders does it read?",
        ),
        options: [l("Hiç", "None"), l("Altısını da", "All six"), l("Sadece sonuncuyu", "Only the last one")],
        answer: 1,
        why: l(
          "Kayıtlar log'da duruyor ve Analitik'in kendi konumu var. `earliest` ile en baştan başlar ve hepsini okur.",
          "The records are still on the log and analytics has its own position. With `earliest` it starts at the beginning and reads them all.",
        ),
      },
      title: l("Her group kendi konumundan okur", "Every group reads from its own position"),
      body: [
        l(
          "Analitik group'u bağlandı ve **altı siparişin hepsini** okudu, Fatura'nın onları çoktan okumuş olmasına rağmen. Kuyruktaki Analitik hiçbir şey görememişti.",
          "The analytics group connected and read **all six orders**, even though billing had already read them. The analytics service on the queue saw nothing.",
        ),
        l(
          "Yeni bir servis eklemek için kimseye bir şey kurdurmana gerek yok; topic'i okumaya başlaması yeterli. Bir hata düzelttikten sonra geçmişi baştan oynatmak da mümkün.",
          "Adding a new service needs nobody to set anything up: it just starts reading the topic. Replaying history after fixing a bug is possible too.",
        ),
      ],
    },
    {
      short: l("Partition", "Partitions"),
      tag: "how",
      predict: {
        question: l(
          "Topic'in 2 partition'ı var ve Fatura group'unda 2 üye çalışıyor. Group'a üçüncü bir üye ekleniyor. Üçüncü üye ne yapar?",
          "The topic has 2 partitions and the billing group has 2 members. A third member joins the group. What does it do?",
        ),
        options: [
          l("İşi diğer ikisiyle eşit paylaşır", "Shares the work equally with the other two"),
          l("Boşta bekler: ona verilecek partition yok", "Waits idle: there is no partition for it"),
          l("Aynı kayıtları bir kez daha okur", "Reads the same records once more"),
        ],
        answer: 1,
        why: l(
          "Bir group içinde her partition aynı anda sadece bir üyeye verilir. 2 partition varsa en fazla 2 üye çalışır.",
          "Inside a group, each partition goes to only one member at a time. With 2 partitions, at most 2 members work.",
        ),
      },
      title: l("Group içinde iş paylaşımı: partition'lar", "Sharing work inside a group: partitions"),
      body: [
        l(
          "Kuyruktaki \"rekabet eden worker\" fikrinin Kafka'daki karşılığı, bir [[consumerGroup]]'un üyeleridir. Ama Kafka işi mesaj mesaj değil, [[partition]] partition dağıtır.",
          "Kafka's answer to the queue's competing workers is the members of a [[consumerGroup]]. But Kafka hands out work by [[partition]], not message by message.",
        ),
        l(
          "Her partition group içinde aynı anda tek bir üyeye verilir. Üçüncü üye katıldı ama 2 partition olduğu için **boşta kaldı**. Daha fazla paralellik için daha fazla partition gerekir.",
          "Each partition goes to a single member of the group at a time. The third member joined, but with 2 partitions it **stayed idle**. More parallelism needs more partitions.",
        ),
        l(
          "Bunun iyi bir yanı var: bir partition'ın kayıtlarını hep aynı üye sırayla işler. Kuyruklarda paralel worker'lar varken sıra kolayca bozulur.",
          "There is an upside: one member handles a partition's records in order. With parallel workers on a queue, order is easily lost.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Partition'ları ve group atamasını (rebalance) Çekirdek bölümünde ayrıntılı göreceğiz.",
            "Partitions and group assignment (rebalancing) are covered in detail in the Core chapter.",
          ),
        },
      ],
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "idea",
      title: l("Hangisini ne zaman seçmeli?", "Which one, and when?"),
      body: [
        l(
          "**Kuyruk** iş dağıtmak için iyidir: \"bu görevi biri yapsın\", her mesaj ayrı onaylanır, takılan bir mesaj diğerlerini bekletmez ve geçmişe ihtiyaç yoktur.",
          "A **queue** is good for handing out tasks: \"someone do this\", each message is acknowledged on its own, one stuck message does not hold up the others, and no history is needed.",
        ),
        l(
          "**Kafka** olay akışları için iyidir: aynı olayları birçok bağımsız servis okur, geçmiş saklanır ve yeniden oynatılabilir, key'e göre sıra korunur ve çok yüksek hızlara çıkılır.",
          "**Kafka** is good for event streams: many independent services read the same events, history is kept and can be replayed, order is kept per key, and it scales to very high rates.",
        ),
        l(
          "Birçok şirket ikisini birlikte kullanır: olaylar Kafka'da akar, bazı görevler bir kuyruğa dağıtılır.",
          "Many companies use both: events flow through Kafka, and some tasks are handed out through a queue.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Kafka'da bir consumer işleyemediği bir kayda takılırsa, o partition'daki sonraki kayıtlar da bekler; çünkü konum tek bir sayıdır ve sırayla ilerler. Çözüm genelde kaydı ayrı bir [[deadLetter]] topic'ine yazıp devam etmektir.",
            "In Kafka, if a consumer gets stuck on a record it cannot process, the records after it in that partition wait too, because the position is a single number that moves in order. The usual fix is to write the record to a separate [[deadLetter]] topic and move on.",
          ),
        },
      ],
    },
    {
      short: l("Share group", "Share groups"),
      tag: "reality",
      title: l("Kafka'ya kuyruk geliyor: share group'lar", "Queues come to Kafka: share groups"),
      body: [
        l(
          "Kafka 4.0 ile yeni bir okuma modu geldi: [[shareGroup]] (KIP-932, \"Queues for Kafka\"). Bir share group'ta kayıtlar tek tek alınır ve tek tek onaylanır, tıpkı bir kuyrukta olduğu gibi.",
          "Kafka 4.0 brought a new way of reading: the [[shareGroup]] (KIP-932, \"Queues for Kafka\"). In a share group, records are taken and acknowledged one by one, just like in a queue.",
        ),
        l(
          "Bu sayede bir partition'ı birden çok consumer paylaşabilir ve partition sayısından fazla consumer çalışabilir. Kayıtlar yine log'da kalır; normal consumer group'lar onları her zamanki gibi okumaya devam eder.",
          "That lets several consumers share one partition and more consumers than partitions do work. The records still stay on the log, and ordinary consumer groups keep reading them as usual.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Share group'lar Kafka 4.0'da erken erişim (early access) olarak geldi ve sonraki sürümlerde olgunlaştırılıyor. Üretimde kullanmadan önce kendi Kafka sürümündeki durumunu dokümandan kontrol et. Share group'ta bir partition içindeki sıra garantisi yoktur.",
            "Share groups arrived in Kafka 4.0 as early access and are being matured in later releases. Check their status for your Kafka version in the docs before using them in production. A share group gives no ordering guarantee within a partition.",
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
          "Kuyrukta bir sipariş bekliyor. Üstteki **Görünüm** düğmeleriyle kuyruk ve Kafka arasında geçebilirsin; \"Sipariş yaz\" ikisine birden yazar.",
          "One order is waiting in the queue. Use the **View** buttons to switch between the queue and Kafka; \"Write order\" writes to both.",
        ),
        l(
          "Sahnenin altında **3 görev** var: bir mesajı yeniden teslim ettirmek, aynı siparişi iki dünyada izlemek ve Kafka'da geçmişi yeniden okumak.",
          "There are **3 missions** under the scene: get a message redelivered, follow one order through both worlds, and replay history in Kafka.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir görev seçince sahne o görevin dünyasına geçer. Olay listesindeki \"Kafka ·\" satırları Kafka tarafında olanları gösterir.",
            "Picking a mission switches the stage to its world. Lines starting with \"Kafka ·\" in the event list are what happened on the Kafka side.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Klasik bir [[messageQueue|kuyruk]] her mesajı tek bir worker'a verir ve onaylanınca siler.",
      "A classic [[messageQueue|queue]] hands each message to one worker and deletes it once acknowledged.",
    ),
    l(
      "Kuyrukta geçmiş yoktur: sonradan bağlanan bir servis eski mesajları göremez ve aynı mesajı iki servis okuyamaz.",
      "A queue has no history: a service that connects later cannot see old messages, and two services cannot read the same message.",
    ),
    l(
      "Onaylanmadan çöken bir worker'ın mesajı yeniden teslim edilir; kuyrukta da işleme idempotent olmalı.",
      "A worker that crashes before acking gets its message redelivered; processing on a queue must be idempotent too.",
    ),
    l(
      "Kafka kayıtları saklar. Her [[consumerGroup]] kendi konumundan okur; yeni servisler geçmişi okuyabilir, geçmiş yeniden oynatılabilir.",
      "Kafka keeps records. Every [[consumerGroup]] reads from its own position; new services can read history, and history can be replayed.",
    ),
    l(
      "Bir group içinde iş partition'larla paylaşılır: partition sayısından fazla üye boşta kalır, ama her partition sırayla işlenir.",
      "Inside a group, work is shared by partition: members beyond the partition count stay idle, but each partition is handled in order.",
    ),
    l(
      "Kafka 4.0'daki [[shareGroup|share group'lar]] kuyruk gibi kayıt başına onay getiriyor; erken erişim aşamasında başladılar.",
      "Kafka 4.0's [[shareGroup|share groups]] bring queue-style per-record acks; they started as early access.",
    ),
  ],
  quiz: [
    {
      question: l("Klasik bir kuyrukta bir worker mesajı onaylayınca (ack) ne olur?", "In a classic queue, what happens when a worker acks a message?"),
      options: [
        l("Mesaj silinir", "The message is deleted"),
        l("Mesaj diğer worker'lara da gönderilir", "The message is sent to the other workers too"),
        l("Mesaj bir offset alır ve saklanır", "The message gets an offset and is kept"),
        l("Mesaj sıranın sonuna gider", "The message goes to the back of the line"),
      ],
      answer: 0,
      explain: l("Kuyruk için onaylanan mesajın işi bitmiştir ve silinir.", "For a queue, an acknowledged message is done, and it is deleted."),
      reviewStep: 1,
    },
    {
      question: l(
        "Yeni bir analitik servisi geçen haftanın bütün siparişlerini incelemek istiyor. Hangisi bunu doğrudan sağlar?",
        "A new analytics service wants to study all of last week's orders. Which one gives that directly?",
      ),
      options: [
        l("Klasik kuyruğa yeni bir worker olarak bağlanmak", "Connecting to the classic queue as a new worker"),
        l("Kafka'da `earliest` ile yeni bir consumer group açmak", "Starting a new consumer group in Kafka with `earliest`"),
        l("Kuyruğa yeni bir exchange eklemek", "Adding a new exchange to the queue"),
        l("Hiçbiri", "Neither"),
      ],
      answer: 1,
      explain: l(
        "Kafka kayıtları retention süresince saklar; yeni bir group en baştan okuyabilir. Kuyrukta onaylanan mesajlar çoktan silinmiştir.",
        "Kafka keeps records for the retention period, and a new group can read from the start. In a queue, acknowledged messages are long gone.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Bir topic'in 4 partition'ı var ve bir consumer group'ta 6 consumer çalışıyor. Kaç tanesi boşta kalır?",
        "A topic has 4 partitions and a consumer group runs 6 consumers. How many sit idle?",
      ),
      options: [l("0", "0"), l("2", "2"), l("4", "4"), l("6", "6")],
      answer: 1,
      explain: l(
        "Bir group içinde her partition aynı anda tek bir consumer'a verilir. 4 partition, en fazla 4 consumer çalıştırır; 2'si boşta bekler.",
        "Inside a group each partition goes to one consumer at a time. 4 partitions keep at most 4 consumers busy; 2 wait idle.",
      ),
      reviewStep: 7,
    },
    {
      question: l("Kafka'daki share group'lar (KIP-932) neyi değiştirir?", "What do Kafka's share groups (KIP-932) change?"),
      options: [
        l("Kayıtları okununca siler", "They delete records once read"),
        l("Kayıtların tek tek onaylanmasını ve partition'dan çok consumer çalışmasını sağlar", "They allow per-record acks and more consumers than partitions"),
        l("Partition içinde sırayı garanti eder", "They guarantee order within a partition"),
        l("Retention'ı kapatır", "They turn off retention"),
      ],
      answer: 1,
      explain: l(
        "Share group'lar kuyruk gibi kayıt başına onay getirir ve bir partition'ı birden çok consumer'a paylaştırır. Kayıtlar yine log'da kalır ve partition içi sıra garantisi yoktur.",
        "Share groups bring queue-style per-record acks and let several consumers share a partition. Records still stay on the log, and there is no ordering guarantee within a partition.",
      ),
      reviewStep: 9,
    },
  ],
};
