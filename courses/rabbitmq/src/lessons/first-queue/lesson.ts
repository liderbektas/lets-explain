import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const LIST = "docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged";

export const firstQueue: Lesson = {
  slug: "first-queue",
  title: l("İlk kuyruk", "Your first queue"),
  summary: l(
    "Bir mesaj gönder, kuyrukta bekleyişini izle, bir işçiye ver ve onaylat. Ack gelmezse ne olduğunu gör.",
    "Send a message, watch it wait in a queue, hand it to a worker and have it acked. See what happens when the ack never comes.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kuyrukta dinleyen yokken mesajların beklediğini görmek", "See messages wait when nobody is listening"), step: 1 },
    { text: l("Teslim edilen mesajın ack gelene kadar broker'da durduğunu görmek", "See a delivered message stay with the broker until acked"), step: 2 },
    { text: l("Ack gelmeden çöken işçinin mesajlarının geri döndüğünü görmek", "See a crashed worker's unacked messages come back"), step: 4 },
    { text: l("Birden fazla işçinin işi sırayla paylaştığını görmek", "See several workers take turns"), step: 6 },
  ],
  steps: [
    {
      short: l("Kuyruk", "A queue"),
      tag: "how",
      title: l("Bir uygulama, bir kuyruk", "An app and a queue"),
      body: [
        l(
          "Solda mesaj gönderecek bir uygulama, ortada `hello` adında boş bir [[queue]] var. Kuyruk, mesajların biri onları alana kadar beklediği yer. Hepsini [[broker]] tutar: burada RabbitMQ.",
          "On the left is an app that will send messages; in the middle is an empty [[queue]] called `hello`. A queue is where messages wait until someone takes them. The [[broker]] holds it all: RabbitMQ here.",
        ),
        l(
          "Henüz kuyruğu dinleyen kimse yok. Uygulama mesajını doğrudan kuyruğa göndermiyor: aradaki kesikli çizgi \"default exchange\". Bunu bu dersin sonunda açacağız.",
          "Nobody is listening to the queue yet. The app does not send straight into the queue: the dashed line is the \"default exchange\". We open that up at the end of this lesson.",
        ),
      ],
      practice: {
        intro: l("Bilgisayarında bir RabbitMQ açmak için (Docker gerekir):", "To start a RabbitMQ on your machine (needs Docker):"),
        commands: [
          {
            cmd: "docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:4-management",
            note: l("5672 uygulamaların bağlandığı port, 15672 yönetim paneli: http://localhost:15672 (kullanıcı ve şifre `guest`).", "5672 is the port apps connect to, 15672 is the management UI: http://localhost:15672 (user and password `guest`)."),
          },
          { cmd: "npm install amqplib", note: l("Örneklerde kullanacağımız Node.js istemcisi.", "The Node.js client the examples use.") },
        ],
      },
    },
    {
      short: l("Gönder", "Send"),
      tag: "how",
      predict: {
        question: l("Kuyruğu dinleyen kimse yokken 3 mesaj göndereceğiz. Mesajlara ne olur?", "We will send 3 messages while nobody is listening. What happens to them?"),
        options: [l("Kaybolurlar, alan kimse yok", "They are lost: nobody takes them"), l("Kuyrukta beklerler", "They wait in the queue"), l("Uygulama biri bağlanana kadar bekler", "The app waits until someone connects")],
        answer: 1,
        why: l(
          "Kuyruk tam olarak bunun için var: gönderen ile alan aynı anda ayakta olmak zorunda değil. Mesajlar biri gelene kadar bekler.",
          "That is exactly what a queue is for: the sender and the receiver do not need to be up at the same time. Messages wait until someone comes.",
        ),
      },
      title: l("Mesajlar kuyrukta bekler", "Messages wait in the queue"),
      body: [
        l(
          "Uygulama üç mesaj gönderdi ve işine devam etti. Mesajlar `hello` kuyruğunda sıraya girdi: en eskisi sağda, sıradaki teslim edilecek olan o.",
          "The app sent three messages and went on with its work. They lined up in `hello`: the oldest on the right, the next one to be delivered.",
        ),
        l(
          "Sayaçta \"Kuyrukta hazır: 3\" yazıyor. [[producer|Producer]] kimin okuyacağını bilmek zorunda değil; onun işi bitti.",
          "The counter says \"Ready: 3\". The [[producer]] does not need to know who will read them; its part is done.",
        ),
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("Kuyrukları ve içlerindeki mesaj sayısını listeler.", "Lists queues and how many messages they hold.") }],
      },
    },
    {
      short: l("Teslim", "Deliver"),
      tag: "how",
      predict: {
        question: l(
          "Bir işçi kuyruğa bağlanacak ve üç mesajı alacak. Mesajlar o anda kuyruktan silinir mi?",
          "A worker will connect and get all three messages. Are they deleted from the queue at that moment?",
        ),
        options: [
          l("Evet, teslim edilince silinir", "Yes, delivery deletes them"),
          l("Hayır: işçi \"bitti\" diyene kadar broker onları tutar", "No: the broker keeps them until the worker says \"done\""),
          l("Hayır, kuyrukta kalır ve işçi kopyasını alır", "No, they stay in the queue and the worker gets copies"),
        ],
        answer: 1,
        why: l(
          "Teslim edilen mesaj \"onay bekleyen\" (unacked) olur. Broker onu, işçi ack gönderene kadar saklar; işçi bitiremezse geri alabilsin diye.",
          "A delivered message becomes \"unacked\". The broker keeps it until the worker sends an ack, so it can take it back if the worker fails.",
        ),
      },
      title: l("Teslim edildi ama henüz bitmedi", "Delivered, but not finished yet"),
      body: [
        l(
          "İşçi 1 bağlandı ve broker üç mesajı hemen ona itti. Mesajlar işçinin elinde; kuyruğun altında \"onay bekleyen 3\" yazıyor.",
          "Worker 1 connected, and the broker pushed all three messages to it right away. They are in the worker's hands; under the queue it says \"unacked 3\".",
        ),
        l(
          "Broker bu mesajları henüz silmedi. İşçinin bir [[ack]] göndermesini, yani \"bunu bitirdim\" demesini bekliyor.",
          "The broker has not deleted them yet. It is waiting for the worker to send an [[ack]]: \"I am done with this\".",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Node.js · gönder ve dinle",
            code: 'await ch.assertQueue("hello");\nch.sendToQueue("hello", Buffer.from("a1"));\n\nawait ch.consume("hello", (msg) => {\n  console.log(msg.content.toString());\n  ch.ack(msg); // after the work is done\n}, { noAck: false });',
            note: l("`assertQueue` kuyruk yoksa oluşturur, varsa hiçbir şey yapmaz. İşi bitirdikten **sonra** `ack` çağrılır; ack'i işten önce göndermek, işçi çökerse mesajı kaybettirir.", "`assertQueue` creates the queue if it is missing and does nothing otherwise. Call `ack` **after** the work is done; acking first loses the message if the worker crashes."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Ack", "Ack"),
      tag: "how",
      title: l("Ack: mesaj artık gidebilir", "Ack: the message can go now"),
      body: [
        l(
          "İşçi her mesajı işleyip ack gönderdi. Broker her ack'ten sonra o mesajı sildi; kuyruk ve işçinin eli boş.",
          "The worker processed each message and acked it. After each ack the broker deleted that message; the queue and the worker's hands are empty.",
        ),
        l(
          "Burası Kafka'dan önemli bir fark: RabbitMQ'da onaylanan mesaj **gider**. Geri sarıp yeniden okuyamazsın. Bunun için Stream'ler var, onları ileride göreceğiz.",
          "This is a key difference from Kafka: in RabbitMQ an acked message is **gone**. You cannot rewind and read it again. Streams exist for that; we get to them later.",
        ),
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("`messages_unacknowledged` sütunu elde tutulan, henüz ack'lenmemiş mesajlar.", "The `messages_unacknowledged` column counts messages held but not yet acked.") }],
      },
    },
    {
      short: l("Çökme", "Crash"),
      tag: "experiment",
      predict: {
        question: l(
          "İki yeni mesaj işçiye gitti. İşçi ack göndermeden çökecek. Mesajlara ne olur?",
          "Two new messages went to the worker. It will crash before acking. What happens to them?",
        ),
        options: [
          l("İşçiyle birlikte kaybolurlar", "They are lost with the worker"),
          l("Kuyruğa geri dönerler ve yeniden teslim edilirler", "They go back to the queue and are delivered again"),
          l("Broker onları bitmiş sayar", "The broker counts them as done"),
        ],
        answer: 1,
        why: l(
          "Ack gelmeyen mesaj broker'da hâlâ \"onay bekleyen\" durumdaydı. Bağlantı kopunca broker onları kuyruğun başına koyar ve \"redelivered\" işaretler.",
          "An unacked message was still with the broker. When the connection drops, the broker puts it back at the front of the queue, marked \"redelivered\".",
        ),
      },
      title: l("Ack gelmezse mesaj geri döner", "No ack, so the message comes back"),
      body: [
        l(
          "İşçi 1 iki mesajı aldı ve ack göndermeden çöktü. Broker bağlantının koptuğunu gördü ve iki mesajı kuyruğun başına geri koydu.",
          "Worker 1 took two messages and crashed before acking. The broker saw the connection drop and put both back at the front of the queue.",
        ),
        l(
          "Zarfların üstünde \"2×\" damgası var: bu mesajlar artık `redelivered` işaretli. Hiçbir şey kaybolmadı, ama bir sonraki işçi aynı mesajı **ikinci kez** görebilir.",
          "The envelopes carry a \"2×\" postmark: these messages are now marked `redelivered`. Nothing is lost, but the next worker may see the same message **a second time**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "İşçi mesajı yarıya kadar işleyip çökmüş olabilir. Bu yüzden işleyen kodu, aynı mesajı iki kez görmek sorun çıkarmayacak şekilde yaz (idempotent). `redelivered` işareti \"dikkat, bu daha önce verildi\" demektir.",
            "The worker may have half-processed the message before crashing. So write handlers that cope with seeing a message twice (idempotent). `redelivered` means \"careful, this was handed out before\".",
          ),
        },
      ],
    },
    {
      short: l("Devralma", "Pick up"),
      tag: "how",
      title: l("Başka bir işçi devralır", "Another worker picks them up"),
      body: [
        l(
          "İşçi 2 bağlandı. Broker geri dönen iki mesajı ona verdi ve İşçi 2 ikisini birden onayladı.",
          "Worker 2 connected. The broker gave it the two returned messages, and Worker 2 acked both at once.",
        ),
        l(
          "Tek bir ack ile birden fazla mesaj onaylanabilir (`ch.ack(msg, true)`): \"buna kadar olanların hepsi bitti\" demek.",
          "One ack can cover several messages (`ch.ack(msg, true)`): it means \"everything up to this one is done\".",
        ),
      ],
    },
    {
      short: l("Paylaşma", "Share"),
      tag: "how",
      title: l("İki işçi, bir kuyruk: sırayla", "Two workers, one queue: they take turns"),
      body: [
        l(
          "İşçi 1 yeniden bağlandı ve dört yeni mesaj geldi. Broker onları iki işçiye **sırayla** dağıttı: ikişer tane.",
          "Worker 1 reconnected and four new messages arrived. The broker handed them out to the two workers **in turn**: two each.",
        ),
        l(
          "Buna \"competing consumers\" denir: aynı kuyruğu dinleyen işçiler işi paylaşır, her mesaj sadece **birine** gider. İş artarsa yeni bir işçi açmak yeter.",
          "This is called \"competing consumers\": workers on the same queue share the work, and each message goes to **one** of them. More work? Start another worker.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sırayla dağıtım, işçilerin aynı hızda olduğunu varsayar. Biri yavaşsa elinde iş birikir. Bunu `prefetch` ile çözeceğiz (Tüketiciler bölümü).",
            "Taking turns assumes equally fast workers. A slow one piles up work. We fix that with `prefetch` in the Consumers chapter.",
          ),
        },
      ],
      practice: {
        intro: l("İki terminalde aynı consumer kodunu çalıştır, sonra mesaj gönder:", "Run the same consumer code in two terminals, then send messages:"),
        commands: [
          { cmd: "node worker.js", note: l("İlk terminal.", "First terminal.") },
          { cmd: "node worker.js", note: l("İkinci terminal: mesajlar ikisine sırayla dağılır.", "Second terminal: messages alternate between the two.") },
        ],
      },
    },
    {
      short: l("Default exchange", "Default exchange"),
      tag: "reality",
      title: l("Aslında doğrudan kuyruğa göndermedik", "We never really sent straight to the queue"),
      body: [
        l(
          "RabbitMQ'da producer'lar her zaman bir [[exchange]]'e gönderir. Bu derste kullandığımız `sendToQueue`, adı boş (`\"\"`) olan **default exchange**'e gönderir: o exchange her kuyruğa, kuyruğun kendi adıyla otomatik bağlıdır.",
          "In RabbitMQ producers always send to an [[exchange]]. The `sendToQueue` we used sends to the **default exchange**, the one with an empty name (`\"\"`): every queue is bound to it automatically by its own name.",
        ),
        l(
          "Yani `ch.sendToQueue(\"hello\", …)`, yani `ch.publish(\"\", \"hello\", …)` demek, \"`hello` kuyruğuna koy\" demek. Kısayol olarak güzel, ama gerçek projelerde mesajları adı olan exchange'lere gönderip kuralları onlara bırakırız. Sonraki bölüm tam olarak bu.",
          "So `ch.sendToQueue(\"hello\", …)`, which is `ch.publish(\"\", \"hello\", …)`, means \"put it in the `hello` queue\". Handy as a shortcut, but real projects send to named exchanges and leave the rules to them. That is the next chapter.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede mesajlar her adımdan hemen sonra itilir ve ağ gecikmesi yok. Gerçekte bir consumer'ın bağlantısı koptuğunu broker heartbeat ya da TCP ile fark eder; bu birkaç saniye sürebilir.",
            "Here messages are pushed right after each step, with no network delay. In reality the broker notices a dead consumer through heartbeats or TCP, which can take a few seconds.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_bindings", note: l("Default exchange'in her kuyruğa otomatik binding'ini de gösterir.", "Shows the default exchange's automatic binding to every queue too.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bir fotoğraf servisi var: `send.js` `tasks` kuyruğuna iş gönderir, `worker.js` her işi bitirince ack'ler. Aşağıda gerçek işten **4 senaryo** var.",
          "Your turn. There's a photo service: `send.js` sends work to the `tasks` queue, and `worker.js` acks each task once it's done. Below are **4 scenarios** from real work.",
        ),
        l(
          "`rabbitmqctl list_queues name messages_ready messages_unacknowledged` kuyruğun durumunu gösterir. İşçiler arka planda çalışır: `jobs` listeler, `pkill -f worker.js` durdurur. Az komutla bitirirsen 3 yıldız.",
          "`rabbitmqctl list_queues name messages_ready messages_unacknowledged` shows the queue's state. Workers run in the background: `jobs` lists them, `pkill -f worker.js` stops them. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("[[queue|Kuyruk]], mesajların biri alana kadar beklediği yer; gönderen ve alan aynı anda ayakta olmak zorunda değil.", "A [[queue]] is where messages wait; sender and receiver do not have to be up at the same time."),
    l("Teslim edilen mesaj ack gelene kadar broker'da \"onay bekleyen\" olarak durur.", "A delivered message stays with the broker as \"unacked\" until the ack."),
    l("Ack'lenen mesaj silinir: RabbitMQ kuyruğu geri sarılamaz.", "An acked message is deleted: a RabbitMQ queue cannot be rewound."),
    l("Ack gelmeden kopan işçinin mesajları kuyruğa döner ve `redelivered` işaretlenir; işleyen kod tekrarı kaldırmalı.", "A worker that disconnects before acking hands its messages back, marked `redelivered`; handlers must cope with repeats."),
    l("Aynı kuyruğu dinleyen işçiler işi sırayla paylaşır; her mesaj tek bir işçiye gider.", "Workers on one queue take turns; each message goes to one worker."),
  ],
  quiz: [
    {
      question: l("Bir işçi 5 mesaj aldı, 2'sini ack'ledi ve çöktü. Kaç mesaj kuyruğa geri döner?", "A worker got 5 messages, acked 2 and crashed. How many go back to the queue?"),
      options: [l("0", "0"), l("2", "2"), l("3", "3"), l("5", "5")],
      answer: 2,
      explain: l("Ack'lenen 2 mesaj silindi. Kalan 3'ü onay bekliyordu; bağlantı kopunca geri döner.", "The 2 acked ones are deleted. The other 3 were unacked and come back when the connection drops."),
      reviewStep: 4,
    },
    {
      question: l("`ack` işi bitirmeden **önce** çağrılırsa ve işçi o sırada çökerse ne olur?", "What happens if `ack` is called **before** the work and the worker then crashes?"),
      options: [l("Mesaj tekrar teslim edilir", "The message is redelivered"), l("Mesaj kaybolur", "The message is lost"), l("Broker çöker", "The broker crashes"), l("Hiçbir şey", "Nothing")],
      answer: 1,
      explain: l("Broker ack'i aldığı an mesajı siler. İş yarım kaldıysa onu geri getirecek kimse yok.", "The broker deletes the message the moment it gets the ack. If the work was unfinished, nothing brings it back."),
      reviewStep: 2,
    },
    {
      question: l("Üç işçi aynı kuyruğu dinliyor ve 6 mesaj geliyor. Her mesaj kaç işçiye gider?", "Three workers listen to one queue and 6 messages arrive. How many workers get each message?"),
      options: [l("Üçüne de", "All three"), l("Birine", "One"), l("İkisine", "Two"), l("Rastgele", "Random")],
      answer: 1,
      explain: l("Aynı kuyruğun işçileri işi paylaşır: her mesaj tek bir işçiye gider (burada ikişer tane).", "Workers on one queue share work: each message goes to one worker (two each here)."),
      reviewStep: 6,
    },
    {
      question: l("`ch.publish(\"\", \"hello\", …)` ile, yani boş exchange adı ve `hello` routing key'iyle gönderilen mesaj nereye gider?", "Where does a message sent with `ch.publish(\"\", \"hello\", …)`, an empty exchange name and the routing key `hello`, go?"),
      options: [l("Hiçbir yere, exchange adı boş", "Nowhere, the exchange has no name"), l("`hello` adlı kuyruğa", "To the queue named `hello`"), l("Bütün kuyruklara", "To every queue"), l("`hello` adlı exchange'e", "To an exchange named `hello`")],
      answer: 1,
      explain: l("Default exchange her kuyruğa adıyla bağlıdır: routing key kuyruğun adıdır.", "The default exchange is bound to every queue by name: the routing key is the queue's name."),
      reviewStep: 7,
    },
  ],
};
