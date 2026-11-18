import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

const LIST = "docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged";

export const acks: Lesson = {
  slug: "acks",
  title: l("Ack, nack, requeue", "Ack, nack, requeue"),
  summary: l(
    "Bir işçi mesajı aldığında broker'a ne zaman \"bitti\" der? auto-ack ile manuel ack farkını, nack ile geri çevirmeyi ve reddedilen mesajın nereye gittiğini gör.",
    "When does a worker tell the broker \"done\"? See auto-ack vs manual ack, handing a message back with nack, and where a rejected message goes.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("auto-ack'in çökmede mesaj kaybettirdiğini görmek", "See auto-ack lose messages on a crash"), step: 2 },
    { text: l("nack + requeue ile mesajı geri vermek", "Hand a message back with nack + requeue"), step: 4 },
    { text: l("requeue=False ile reddedilenin DLX'e gittiğini görmek", "See a message rejected with requeue=False go to the DLX"), step: 5 },
    { text: l("Tek ack ile birden çok mesajı onaylamak", "Ack several messages with one ack"), step: 6 },
  ],
  steps: [
    {
      short: l("Onay", "Acks"),
      tag: "how",
      title: l("Broker \"bitti\" sözünü bekler", "The broker waits for \"done\""),
      body: [
        l(
          "Bir işçi mesajı aldığında broker onu hemen silmez; işçinin bir [[ack]] göndermesini bekler. İşçinin mesajla ne yapacağına göre üç cevabı var:",
          "When a worker gets a message, the broker does not delete it right away; it waits for an [[ack]]. Depending on what the worker does, there are three answers:",
        ),
        l(
          "**ack**: \"bitti, silebilirsin\". **nack + requeue**: \"şimdi yapamadım, geri al, başkası denesin\". **reject** (ya da nack, requeue olmadan): \"bu mesaj hiç işlenemez, kenara ayır\".",
          "**ack**: \"done, delete it\". **nack + requeue**: \"I could not do it now, take it back so someone can try again\". **reject** (or nack without requeue): \"this message can never be processed, set it aside\".",
        ),
        l(
          "Sahnede `orders` kuyruğu var. Arkasında bir [[dlx]] ve onun `dead` kuyruğu duruyor: reddedilen mesajlar oraya düşecek.",
          "On stage is the `orders` queue. Behind it is a [[dlx]] with its `dead` queue: rejected messages will land there.",
        ),
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("`messages_unacknowledged`: teslim edilmiş ama henüz ack gelmemiş mesajlar.", "`messages_unacknowledged`: delivered but not yet acked.") }],
      },
    },
    {
      short: l("auto-ack", "auto-ack"),
      tag: "how",
      title: l("auto-ack: teslim ettiğin an unut", "auto-ack: forget it on delivery"),
      body: [
        l(
          "Bir işçi `auto_ack=True` ile bağlandı. Bu modda işçi hiç ack göndermez: broker mesajı teslim ettiği **anda** bitmiş sayar ve siler.",
          "A worker connected with `auto_ack=True`. In this mode the worker never acks: the broker counts a message as done **the moment** it delivers it, and deletes it.",
        ),
        l(
          "Üç mesaj geldi ve broker üçünü birden işçiye itti. Kuyrukta ne hazır ne de onay bekleyen mesaj var. İşçi bir tur içinde birini işledi; ikisi hâlâ sadece **işçinin belleğinde** duruyor.",
          "Three messages arrived and the broker pushed all three to the worker at once. The queue has nothing ready and nothing unacked. The worker processed one in a tick; two exist **only in the worker's memory** now.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · auto-ack",
            code: 'ch.basic_consume(queue="orders", on_message_callback=handle, auto_ack=True)',
            note: l("Kolay görünür ama tehlikelidir: bir sonraki adıma bak.", "Looks easy, but it is risky: see the next step."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Çökme", "Crash"),
      tag: "experiment",
      predict: {
        question: l(
          "Auto-ack işçinin belleğinde işlenmemiş 2 mesaj var. İşçi şimdi çökecek. Bu iki mesaja ne olur?",
          "The auto-ack worker holds 2 unprocessed messages in memory. It will crash now. What happens to them?",
        ),
        options: [
          l("Kuyruğa geri dönerler", "They go back to the queue"),
          l("Kaybolurlar", "They are lost"),
          l("Dead letter kuyruğuna düşerler", "They land in the dead letter queue"),
        ],
        answer: 1,
        why: l(
          "Broker bu mesajları teslim ederken zaten silmişti. Geri verecek bir şeyi yok: işçiyle birlikte kayboldular.",
          "The broker deleted them when it delivered them. It has nothing to give back: they died with the worker.",
        ),
      },
      title: l("auto-ack'in bedeli: sessiz kayıp", "The price of auto-ack: silent loss"),
      body: [
        l(
          "İşçi çöktü ve elindeki iki mesaj kayboldu. Sayaçta \"Kayıp: 2\" yazıyor. Hata mesajı yok, uyarı yok: sadece iki sipariş hiç işlenmedi.",
          "The worker crashed, and the two messages it held are gone. The counter says \"Lost: 2\". No error, no warning: two orders were simply never processed.",
        ),
        l(
          "auto-ack sadece bir mesajı kaybetmenin hiçbir zararı olmadığı yerlerde uygundur (örneğin anlık bir ekran güncellemesi). İş yapan her consumer'da manuel ack kullan.",
          "auto-ack is only fine where losing a message does no harm (a live dashboard tick, say). Use manual acks for every consumer that does real work.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_consumers", note: l("`ack_required` sütunu `false` ise o consumer auto-ack kullanıyor.", "If the `ack_required` column is `false`, that consumer uses auto-ack.") }],
      },
    },
    {
      short: l("Manuel ack", "Manual ack"),
      tag: "how",
      title: l("Manuel ack: işi bitirince söyle", "Manual ack: say so when the work is done"),
      body: [
        l(
          "Yeni bir işçi manuel ack ile bağlandı ve üç mesaj aldı. Bu sefer kuyruğun altında \"onay bekleyen\" sayısı artıyor: broker mesajları hâlâ tutuyor.",
          "A new worker connected with manual acks and got three messages. This time the \"unacked\" count under the queue goes up: the broker still holds them.",
        ),
        l(
          "İşçi ilk mesajı bitirdi ve ack gönderdi. Broker sadece onu sildi; diğer ikisi onay bekliyor. İşçi şimdi çökse bu ikisi kuyruğa geri dönerdi.",
          "The worker finished the first message and acked it. The broker deleted only that one; the other two are still unacked. If the worker crashed now, those two would go back to the queue.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · manuel ack",
            code: 'def handle(ch, method, props, body):\n    process(body)                       # do the work first\n    ch.basic_ack(delivery_tag=method.delivery_tag)\n\nch.basic_consume(queue="orders", on_message_callback=handle)',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("nack", "nack"),
      tag: "how",
      predict: {
        question: l(
          "İşçi bir mesajı şimdi işleyemiyor (örneğin veritabanı bir anlığına yanıt vermiyor) ve `nack(requeue=True)` gönderecek. Mesaj nereye gider?",
          "The worker cannot process a message right now (say the database is briefly down) and will send `nack(requeue=True)`. Where does the message go?",
        ),
        options: [
          l("Silinir", "It is deleted"),
          l("Kuyruğun başına döner ve yeniden teslim edilir", "Back to the front of the queue, delivered again"),
          l("Kuyruğun sonuna eklenir", "To the back of the queue"),
        ],
        answer: 1,
        why: l(
          "Requeue edilen mesaj kuyruğun başına döner, yani bir sonraki teslim edilecek odur. `redelivered` işaretiyle gelir.",
          "A requeued message goes back to the front, so it is the next one delivered. It comes back marked `redelivered`.",
        ),
      },
      title: l("nack + requeue: \"şimdi değil\"", "nack + requeue: \"not now\""),
      body: [
        l(
          "İşçi en eski mesajını nack ile geri verdi. Mesaj kuyruğun başına döndü ve hemen aynı işçiye yeniden teslim edildi; üstünde \"2×\" işareti var.",
          "The worker handed its oldest message back with nack. It returned to the front of the queue and was delivered to the same worker again right away; it shows \"2×\".",
        ),
        l(
          "Bu, geçici hatalar için doğru cevap: biraz sonra tekrar denendiğinde iş büyük ihtimalle başarılı olur. Ama hata kalıcıysa mesaj sonsuza kadar dönebilir. Bunu \"Zehirli mesajlar\" dersinde çözeceğiz.",
          "That is the right answer for a temporary failure: a retry a little later will probably work. But if the failure is permanent, the message can loop forever. The \"Poison messages\" lesson fixes that.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · nack", code: "ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)" }],
        commands: [],
      },
    },
    {
      short: l("reject", "reject"),
      tag: "how",
      predict: {
        question: l(
          "İşçi bir mesajı **hiç işlenemez** buldu ve `requeue=False` ile reddedecek. Kuyruğun bir DLX'i var. Mesaj nereye gider?",
          "The worker finds a message that can **never** be processed and will reject it with `requeue=False`. The queue has a DLX. Where does it go?",
        ),
        options: [
          l("Kuyruğun başına", "To the front of the queue"),
          l("DLX üzerinden `dead` kuyruğuna", "Through the DLX into the `dead` queue"),
          l("Producer'a geri", "Back to the producer"),
        ],
        answer: 1,
        why: l(
          "requeue=False olan mesaj kuyruktan çıkar. Kuyruğun bir dead letter exchange'i varsa oraya gönderilir; yoksa silinir.",
          "A message turned down with requeue=False leaves the queue. If the queue has a dead letter exchange, it goes there; otherwise it is deleted.",
        ),
      },
      title: l("reject: kenara ayır", "reject: set it aside"),
      body: [
        l(
          "İşçi en eski mesajını requeue olmadan reddetti. Mesaj `orders`'tan çıktı, `dlx` exchange'inden geçti ve `dead` kuyruğuna düştü.",
          "The worker rejected its oldest message without requeue. It left `orders`, passed through the `dlx` exchange and landed in `dead`.",
        ),
        l(
          "Dead letter kuyruğundaki mesaj kaybolmadı: neden oraya düştüğü (`x-death` header'ı: reason `rejected`) üstünde yazıyor. Daha sonra bakıp düzeltebilir ya da yeniden gönderebilirsin.",
          "The message in the dead letter queue is not lost: why it landed there is written on it (the `x-death` header: reason `rejected`). You can look at it later, fix it, or send it again.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Kuyruğun DLX'i yoksa `requeue=False` mesajı **siler**. Bir mesajı reddetmeden önce gidecek bir yeri olduğundan emin ol.",
            "Without a DLX, `requeue=False` **deletes** the message. Before rejecting, make sure it has somewhere to go.",
          ),
        },
      ],
      practice: {
        snippets: [
          { label: "Python · reject", code: "ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)" },
          {
            label: "Python · DLX'li kuyruk",
            code: 'ch.exchange_declare(exchange="dlx", exchange_type="fanout")\nch.queue_declare(queue="dead", durable=True)\nch.queue_bind(queue="dead", exchange="dlx")\nch.queue_declare(queue="orders", durable=True,\n                 arguments={"x-dead-letter-exchange": "dlx"})',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("multiple", "multiple"),
      tag: "how",
      title: l("Tek ack ile hepsi", "One ack for all of them"),
      body: [
        l(
          "İki yeni mesaj geldi; işçinin elinde üç mesaj var. İşçi `multiple=True` ile tek bir ack gönderdi ve broker üçünü birden sildi.",
          "Two new messages arrived; the worker holds three. It sent one ack with `multiple=True`, and the broker deleted all three.",
        ),
        l(
          "`multiple` \"bu delivery tag'e kadar olanların hepsi bitti\" demek. Çok sayıda küçük mesaj işleyen consumer'larda ağ trafiğini azaltır. Ama işçi aralardan birini bitirmediyse onu da bitmiş saydırır, dikkatli kullan.",
          "`multiple` means \"everything up to this delivery tag is done\". It cuts network traffic for consumers handling many small messages. But it also marks as done anything in between you did not finish, so use it carefully.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · multiple", code: "ch.basic_ack(delivery_tag=method.delivery_tag, multiple=True)" }],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("En az bir kez teslim", "At-least-once delivery"),
      body: [
        l(
          "Manuel ack ile hiçbir mesaj kaybolmaz, ama bir mesaj **birden fazla kez** gelebilir: işçi işi bitirip ack'i gönderemeden çökerse, mesaj tekrar teslim edilir. Buna **at-least-once** teslim denir.",
          "With manual acks no message is lost, but a message may arrive **more than once**: if the worker finishes the work and crashes before the ack goes out, it is delivered again. This is **at-least-once** delivery.",
        ),
        l(
          "Bu yüzden işleyen kodu tekrara dayanıklı (idempotent) yaz: \"bu sipariş zaten işlendi mi?\" diye bak, ya da mesajın bir kimliğini saklayıp ikinci kez geleni atla.",
          "So write handlers that survive repeats (idempotent): check \"was this order already handled?\", or store each message's id and skip the second copy.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ bir mesajın ack'ini sonsuza kadar beklemez: varsayılan `consumer_timeout` 30 dakika. Bu süre içinde ack gelmezse broker kanalı kapatır ve mesajları geri kuyruğa koyar. Uzun süren işler için bu ayarı `rabbitmq.conf`'ta değiştirebilirsin.",
            "RabbitMQ does not wait forever for an ack: the default `consumer_timeout` is 30 minutes. If no ack arrives in that time, the broker closes the channel and requeues the messages. For long jobs you can change it in `rabbitmq.conf`.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Bu sahnede zaman \"tur\" ile ilerler ve auto-ack işçisi turda bir mesaj işler. Gerçekte broker auto-ack consumer'a mesajları ağın taşıyabildiği hızda iter; işçinin belleğinde çok daha fazlası birikebilir.",
            "Time moves in ticks here, and the auto-ack worker processes one message per tick. In reality the broker pushes to an auto-ack consumer as fast as the network allows, so far more can pile up in its memory.",
          ),
        },
      ],
      practice: {
        snippets: [
          {
            label: "Python · tekrara dayanıklı işçi",
            code: 'def handle(ch, method, props, body):\n    if already_done(props.message_id):\n        ch.basic_ack(delivery_tag=method.delivery_tag)\n        return\n    process(body)\n    mark_done(props.message_id)\n    ch.basic_ack(delivery_tag=method.delivery_tag)',
          },
          {
            label: "rabbitmq.conf",
            code: "consumer_timeout = 3600000",
            note: l("Ack bekleme süresini 1 saate çıkarır (milisaniye). Broker yeniden başlayınca geçerli olur.", "Raises the ack timeout to 1 hour (milliseconds). Takes effect after a broker restart."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Boş bir `orders` kuyruğu ve arkasında `dead` kuyruğu var. İşçiyi manuel ack ya da auto-ack ile bağlayabilir; ack, nack, reject gönderebilir ve çökertebilirsin. \"Bir tur bekle\" zamanı ilerletir.",
          "There is an empty `orders` queue with a `dead` queue behind it. Connect the worker with manual ack or auto-ack; send ack, nack, reject, or crash it. \"Wait one tick\" moves time.",
        ),
        l("Sahnenin altında **3 görev** var.", "Under the scene there are **3 missions**."),
      ],
    },
  ],
  recap: [
    l("auto-ack'te broker mesajı teslim ettiği an siler; işçi çökerse işlenmemiş mesajlar sessizce kaybolur.", "With auto-ack the broker deletes a message on delivery; if the worker crashes, unprocessed messages vanish silently."),
    l("Manuel ack'te mesaj, işçi ack gönderene kadar broker'da \"onay bekleyen\" olarak durur.", "With manual acks a message stays \"unacked\" with the broker until the worker acks it."),
    l("nack + requeue mesajı kuyruğun başına geri koyar; geçici hatalar içindir.", "nack + requeue puts the message back at the front; it is for temporary failures."),
    l("requeue=False ile reddedilen mesaj DLX'e gider; DLX yoksa silinir.", "A message rejected with requeue=False goes to the DLX, or is deleted if there is none."),
    l("Manuel ack at-least-once teslim verir: işleyen kod aynı mesajı iki kez görebileceğini bilmeli.", "Manual acks give at-least-once delivery: handlers must expect to see a message twice."),
  ],
  quiz: [
    {
      question: l(
        "Auto-ack kullanan bir işçi 10 mesaj aldı, 4'ünü işledi ve çöktü. Kaç mesaj kuyruğa geri döner?",
        "An auto-ack worker got 10 messages, processed 4 and crashed. How many go back to the queue?",
      ),
      options: [l("0", "0"), l("4", "4"), l("6", "6"), l("10", "10")],
      answer: 0,
      explain: l("Auto-ack'te broker mesajları teslim ederken siler. Geri dönecek bir şey yok; işlenmemiş 6 mesaj kaybolur.", "With auto-ack the broker deletes messages on delivery. Nothing comes back; the 6 unprocessed ones are lost."),
      reviewStep: 2,
    },
    {
      question: l(
        "Veritabanı birkaç saniyeliğine yanıt vermiyor. İşçi o anki mesaj için ne göndermeli?",
        "The database is unreachable for a few seconds. What should the worker send for the current message?",
      ),
      options: [l("ack", "ack"), l("nack, requeue=True", "nack, requeue=True"), l("reject, requeue=False", "reject, requeue=False"), l("Hiçbir şey", "Nothing")],
      answer: 1,
      explain: l("Hata geçici: mesajı geri ver ki biraz sonra yeniden denensin.", "The failure is temporary: hand the message back so it is tried again shortly."),
      reviewStep: 4,
    },
    {
      question: l(
        "DLX'i **olmayan** bir kuyrukta `basic_reject(requeue=False)` çağrılırsa mesaja ne olur?",
        "What happens to a message rejected with `requeue=False` on a queue **without** a DLX?",
      ),
      options: [l("Kuyruğun başına döner", "It goes back to the front"), l("Silinir", "It is deleted"), l("Producer'a döner", "It returns to the producer"), l("Başka bir işçiye gider", "It goes to another worker")],
      answer: 1,
      explain: l("Gidecek bir dead letter exchange'i yoksa reddedilen mesaj silinir.", "With no dead letter exchange to go to, a rejected message is deleted."),
      reviewStep: 5,
    },
    {
      question: l("Manuel ack kullanan bir sistemde hangisi doğrudur?", "Which is true for a system using manual acks?"),
      options: [
        l("Her mesaj tam olarak bir kez işlenir", "Every message is processed exactly once"),
        l("Mesaj kaybolmaz ama birden fazla kez gelebilir", "No message is lost, but one may arrive more than once"),
        l("Mesajlar kaybolabilir ama asla tekrar gelmez", "Messages may be lost but never repeat"),
        l("Broker ack'i sonsuza kadar bekler", "The broker waits for an ack forever"),
      ],
      answer: 1,
      explain: l(
        "Ack gönderilmeden önce çökme olursa mesaj tekrar teslim edilir: at-least-once. Ayrıca `consumer_timeout` (varsayılan 30 dk) ack beklemeyi sınırlar.",
        "A crash before the ack means redelivery: at-least-once. And `consumer_timeout` (30 min by default) limits how long the broker waits.",
      ),
      reviewStep: 7,
    },
  ],
};
