import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const CONFIRM = `ch.confirm_delivery()

try:
    ch.basic_publish(
        exchange="orders",
        routing_key="order",
        body=b"o1",
        properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent),
        mandatory=True,
    )
    print("broker confirmed")
except pika.exceptions.UnroutableError:
    print("no queue matched: returned")
except pika.exceptions.NackError:
    print("broker refused: send again later")`;

export const publisherConfirms: Lesson = {
  slug: "publisher-confirms",
  title: l("Publisher confirms", "Publisher confirms"),
  summary: l(
    "Mesajın broker'a gerçekten ulaşıp ulaşmadığını nereden bilirsin? Ack, nack, mandatory ve yeniden göndermenin getirdiği tekrarları gör.",
    "How do you know a message really reached the broker? See ack, nack, mandatory, and the duplicates that resending brings.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Broker'ın her mesaja ack ya da nack verdiğini görmek", "See the broker answer every message with an ack or a nack"), step: 1 },
    { text: l("Kuyruğa ulaşmayan mesajın bile ack aldığını ve `mandatory`'nin işini görmek", "See that even a message reaching no queue is acked, and what `mandatory` does"), step: 2 },
    { text: l("Nack'in hangi durumlarda geldiğini görmek", "See when a nack comes"), step: 4 },
    { text: l("Yeniden göndermenin tekrar ürettiğini görmek", "See that resending can create duplicates"), step: 6 },
  ],
  steps: [
    {
      short: l("Soru", "The question"),
      tag: "problem",
      title: l("\"Gönderdim\" demek \"ulaştı\" demek değil", "\"I sent it\" is not \"it arrived\""),
      body: [
        l(
          "`basic_publish` çağrısı döndüğünde mesaj belki hâlâ ağda, belki broker'ın belleğinde, belki diskte. Broker o anda çökerse mesaj gidebilir ve uygulaman bunu hiç fark etmez.",
          "When `basic_publish` returns, the message may still be on the network, in the broker's memory, or on disk. If the broker crashes right then, the message can be lost and your app never notices.",
        ),
        l(
          "**Publisher confirms** bu boşluğu kapatır: broker, sorumluluğu aldığı her mesaj için producer'a bir **ack**, alamadığı için bir **nack** gönderir.",
          "**Publisher confirms** close that gap: for every message it takes responsibility for, the broker sends the producer an **ack**, and a **nack** for one it could not take.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "İadeli taahhütlü mektup gibi: postaya vermek yetmez, imzalı alındı belgesi gelince içinin rahatlar.",
            "Like registered mail with a receipt: handing it to the post office is not enough; you relax when the signed receipt comes back.",
          ),
        },
      ],
      practice: {
        snippets: [
          {
            label: "Python · confirm modunu aç",
            code: "ch = conn.channel()\nch.confirm_delivery()",
            note: l("Bir kez açılır ve o kanaldaki her yayın için geçerlidir. pika'nın BlockingConnection'ında `basic_publish` artık onayı bekler.", "Turned on once, it applies to every publish on that channel. With pika's BlockingConnection, `basic_publish` now waits for the answer."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Ack", "Ack"),
      tag: "how",
      title: l("Ack: broker sorumluluğu aldı", "Ack: the broker took responsibility"),
      body: [
        l(
          "Mağaza `order` key'iyle `o1`'i gönderdi. Exchange onu `billing`'e yönlendirdi ve broker **ack** verdi: üstteki sayaçta \"ack ✓\" yazıyor.",
          "The shop sent `o1` with key `order`. The exchange routed it to `billing` and the broker answered **ack**: the counter on top says \"ack ✓\".",
        ),
        l(
          "Persistent bir mesaj için ack, mesajın diske yazıldığı anlamına gelir; quorum queue için de node'ların çoğunluğuna kopyalandığı anlamına.",
          "For a persistent message, an ack means it was written to disk; for a quorum queue, that it was copied to a majority of nodes.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · onaylı gönderim", code: CONFIRM }],
        commands: [],
      },
    },
    {
      short: l("Kuyruksuz", "No queue"),
      tag: "experiment",
      predict: {
        question: l(
          "`refund` key'iyle bir mesaj göndereceğiz; bu key'e bağlı **hiçbir kuyruk yok**. Confirm açıkken broker ne cevap verir?",
          "We will send a message with key `refund`; **no queue** is bound to that key. With confirms on, what does the broker answer?",
        ),
        options: [
          l("Nack: mesaj teslim edilemedi", "Nack: the message could not be delivered"),
          l("Ack, ve mesaj sessizce atılır", "Ack, and the message is silently dropped"),
          l("Hata fırlatır ve bağlantıyı kapatır", "It raises an error and closes the connection"),
        ],
        answer: 1,
        why: l(
          "Broker mesajı aldı ve kurallara göre işledi; kurallar \"hiçbir yere\" dedi. Bu onun için başarı sayılır, ack gelir. Mesaj ise kaybolur.",
          "The broker took the message and applied the rules, and the rules said \"nowhere\". To the broker that counts as success, so it acks. The message is gone.",
        ),
      },
      title: l("Ack geldi ama mesaj gitti", "Acked, but the message is gone"),
      body: [
        l(
          "`r1` hiçbir kuyruğa uymadı ve atıldı. Yine de broker **ack** verdi. Sayaçta \"Kaybolan: 1\" yazıyor.",
          "`r1` matched no queue and was dropped. Still, the broker answered **ack**. The counter says \"Lost: 1\".",
        ),
        l(
          "Confirm, \"mesaj bir kuyruğa ulaştı\" demek değil, \"broker mesajı işledi\" demek. Yanlış yazılmış bir routing key'i sana söylemez.",
          "A confirm does not mean \"the message reached a queue\"; it means \"the broker handled it\". It will not tell you about a mistyped routing key.",
        ),
      ],
      practice: { commands: [] },
    },
    {
      short: l("mandatory", "mandatory"),
      tag: "how",
      title: l("mandatory: kuyruk yoksa bana geri ver", "mandatory: give it back if there is no queue"),
      body: [
        l(
          "Bu sefer `r2`'yi `mandatory=True` ile gönderdik. Yine hiçbir kuyruk yok, ama bu sefer broker mesajı **producer'a geri döndürdü** (basic.return).",
          "This time we sent `r2` with `mandatory=True`. Still no queue, but now the broker **returned it to the producer** (basic.return).",
        ),
        l(
          "pika'da bu `UnroutableError` olarak gelir. Böylece yanlış key'i ya da eksik binding'i hemen fark edersin.",
          "In pika this arrives as `UnroutableError`, so you notice a wrong key or a missing binding at once.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Diğer seçenek, exchange'e bir alternate exchange vermek: kuyruğu bulunamayan mesajlar oraya düşer. Bunu Yönlendirme bölümünde gördük.",
            "The other option is giving the exchange an alternate exchange, where unroutable messages land. We saw that in the Routing chapter.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Python · mandatory", code: 'ch.basic_publish(exchange="orders", routing_key="refund", body=b"r2", mandatory=True)' }],
        commands: [],
      },
    },
    {
      short: l("Nack", "Nack"),
      tag: "experiment",
      predict: {
        question: l(
          "`limited` en fazla 2 mesaj alıyor ve `x-overflow: reject-publish` ayarlı. Üçüncü mesaj gelince ne olur?",
          "`limited` holds at most 2 messages and has `x-overflow: reject-publish`. What happens when a third arrives?",
        ),
        options: [
          l("En eski mesaj atılır, yenisi girer", "The oldest is dropped and the new one goes in"),
          l("Yeni mesaj reddedilir ve producer nack alır", "The new message is refused and the producer gets a nack"),
          l("Mesaj yer açılana kadar bekler", "The message waits until there is room"),
        ],
        answer: 1,
        why: l(
          "`reject-publish` dolu kuyruğa yeni mesajı almaz ve producer'a nack gönderir. Varsayılan `drop-head` ise en eskiyi atardı; o zaman producer hiçbir şey fark etmezdi.",
          "`reject-publish` refuses the new message into a full queue and nacks the producer. The default, `drop-head`, would drop the oldest instead, and the producer would notice nothing.",
        ),
      },
      title: l("Nack: broker alamadı", "Nack: the broker could not take it"),
      body: [
        l(
          "`l1` ve `l2` kuyruğa girdi, `l3` reddedildi: sayaçta \"nack ✗\" görünüyor. Mesaj kuyruğa hiç girmedi.",
          "`l1` and `l2` went in and `l3` was refused: the counter shows \"nack ✗\". That message never entered the queue.",
        ),
        l(
          "Nack aldığında mesaj senin elinde: biraz bekleyip yeniden gönderebilir, kaydedip sonra deneyebilir ya da kullanıcıya hata gösterebilirsin. Önemli olan sessizce kaybolmaması.",
          "When you get a nack the message is still yours: wait and resend, save it and retry later, or show the user an error. What matters is that it is not lost silently.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · reject-publish", code: 'ch.queue_declare(\n    queue="limited",\n    durable=True,\n    arguments={"x-max-length": 2, "x-overflow": "reject-publish"},\n)' }],
        commands: [],
      },
    },
    {
      short: l("Çoğunluk yok", "No majority"),
      tag: "experiment",
      predict: {
        question: l(
          "`payments` 3 node'a kopyalanan bir quorum queue. 3 node'dan **2'si kapandı**. Ona gönderilen mesaj ne olur?",
          "`payments` is a quorum queue copied to 3 nodes. **2 of the 3** nodes are down. What happens to a message sent to it?",
        ),
        options: [
          l("Kalan node'a yazılır, ack gelir", "It is written to the last node and acked"),
          l("Reddedilir, nack gelir", "It is refused with a nack"),
          l("Sessizce kaybolur ama ack gelir", "It is silently lost but acked"),
        ],
        answer: 1,
        why: l(
          "Quorum queue bir mesajı ancak node'ların çoğunluğu kaydettiğinde kabul eder. Tek node çoğunluk değil, bu yüzden broker mesajı alamaz ve nack verir.",
          "A quorum queue accepts a message only once a majority of nodes has stored it. One node is not a majority, so the broker cannot take it and nacks.",
        ),
      },
      title: l("Çoğunluk yoksa güvence yok", "No majority, no promise"),
      body: [
        l(
          "İki node kapandı ve `payments` için çoğunluk kalmadı. `p1` reddedildi. Kuyruğun etiketinde \"kapalı\" yazıyor.",
          "Two nodes went down and `payments` lost its majority. `p1` was refused. The queue is marked \"down\".",
        ),
        l(
          "Nack burada iyi haber: broker \"saklayamam\" diye dürüstçe söyledi. Confirm kullanmasaydın bu mesaj sessizce kaybolurdu.",
          "Here a nack is good news: the broker honestly said \"I cannot store this\". Without confirms, the message would have been lost silently.",
        ),
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmq-queues quorum_status payments", note: l("Bir quorum queue'nun üyelerini ve leader'ını gösterir (cluster'da).", "Shows a quorum queue's members and leader (in a cluster).") }] },
    },
    {
      short: l("Tekrar gönder", "Resend"),
      tag: "how",
      title: l("Yeniden göndermek tekrar üretir", "Resending creates duplicates"),
      body: [
        l(
          "Bir node geri geldi, çoğunluk sağlandı ve `p1`'i yeniden gönderdik: bu sefer ack geldi. Sonra `o2`'yi gönderdik ve cevabı beklerken bağlantı koptuğunu varsayıp **bir kez daha** gönderdik.",
          "One node came back, the majority returned, and we resent `p1`: this time it was acked. Then we sent `o2` and, pretending the connection dropped while waiting for the answer, sent it **once more**.",
        ),
        l(
          "`billing`'de artık iki tane `o2` var. Cevap gelmediğinde yeniden göndermek doğru; ama ilk gönderim aslında ulaşmış olabilir. Bu yüzden confirm, **at-least-once** verir: hiçbir mesaj kaybolmaz, bazıları iki kez gelebilir.",
          "`billing` now holds two `o2`s. Resending when no answer comes is right, but the first send may have arrived after all. So confirms give **at-least-once**: nothing is lost, but some messages can arrive twice.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Her mesaja benzersiz bir `message_id` koy ve consumer'da \"bunu gördüm mü?\" diye kontrol et. Tekrarı producer'da değil, consumer'da çözmek en sağlam yoldur.",
            "Put a unique `message_id` on every message and check \"have I seen this?\" in the consumer. Handling duplicates in the consumer, not the producer, is the most robust way.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Python · message_id", code: 'import uuid\n\nprops = pika.BasicProperties(\n    delivery_mode=pika.DeliveryMode.Persistent,\n    message_id=str(uuid.uuid4()),\n)' }],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Tek tek mi, toplu mu?", "One by one, or in batches?"),
      body: [
        l(
          "Her mesajdan sonra cevabı beklemek en basit yol ama en yavaşı: her gönderim bir gidiş-dönüş süresi kadar bekler. Saniyede yüzlerce mesaj için yeterli, binlerce için değil.",
          "Waiting for the answer after every message is the simplest way and the slowest: each publish waits one round trip. Fine for hundreds per second, not thousands.",
        ),
        l(
          "Hızlı yol: mesajları art arda gönder, cevapları **asenkron** dinle ve gelmeyenleri sonra yeniden gönder. Ya da bir grup gönderip grubun tamamının onayını bekle.",
          "The fast way: publish back to back, listen for the answers **asynchronously**, and resend the ones that never got an ack. Or send a batch and wait for the whole batch.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede cevap her gönderimden hemen sonra gelir. Gerçekte cevap gecikebilir ve hiç gelmeyebilir (bağlantı kopması): bir zaman aşımı koy ve süresi dolanı nack gibi say.",
            "Here the answer comes right after each publish. In reality it can be late or never come (a dropped connection): set a timeout and treat an expired one like a nack.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "pip install aio-pika", note: l("Asenkron confirm'ler için asyncio tabanlı istemci; birçok mesajı onay beklemeden gönderebilir.", "An asyncio client for async confirms; it can publish many messages without waiting for each answer.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: sessizce kaybolan mesajlar, dolu bir kuyruktan gelen nack, çoğunluğunu kaybetmiş bir cluster ve ack almasına rağmen kaybolan bir sipariş. Script'lerde `ch.confirm_delivery()` açık: broker hayır derse `basic_publish` hata fırlatır.",
          "Your turn. Below are **4 scenarios** from real work: messages that vanish silently, a nack from a full queue, a cluster that lost its majority, and an order lost despite its ack. The scripts have `ch.confirm_delivery()` on: when the broker says no, `basic_publish` raises.",
        ),
        l(
          "`nano` ile kodu düzelt, `python` ile çalıştır; `docker ps -a`, `docker start` ve `rabbitmqctl` ile broker'a bak. Az komutla bitirirsen 3 yıldız.",
          "Fix the code with `nano`, run it with `python`; look at the broker with `docker ps -a`, `docker start` and `rabbitmqctl`. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`confirm_delivery()` açıkken broker her mesaja ack (aldım) ya da nack (alamadım) ile cevap verir.", "With `confirm_delivery()` on, the broker answers every message with an ack (taken) or a nack (refused)."),
    l("Hiçbir kuyruğa uymayan mesaj da ack alır ve atılır; `mandatory=True` onu geri döndürür.", "A message matching no queue is acked and dropped too; `mandatory=True` returns it instead."),
    l("Nack, örneğin dolu bir `reject-publish` kuyruğunda ya da çoğunluğu kalmamış bir quorum queue'da gelir.", "A nack comes, for example, from a full `reject-publish` queue or a quorum queue that lost its majority."),
    l("Nack ya da zaman aşımında mesajı yeniden gönder; bu tekrar üretebilir (at-least-once).", "Resend on a nack or a timeout; that can create duplicates (at-least-once)."),
    l("Tekrarları consumer'da `message_id` ile ayıkla.", "Filter duplicates in the consumer with a `message_id`."),
  ],
  quiz: [
    {
      question: l("Confirm açık. Hiçbir kuyruğa bağlı olmayan bir key ile mesaj gönderdin (`mandatory` yok). Ne olur?", "Confirms are on. You send with a key bound to no queue (no `mandatory`). What happens?"),
      options: [l("Nack gelir", "You get a nack"), l("Ack gelir, mesaj atılır", "You get an ack and the message is dropped"), l("Mesaj bekler", "The message waits"), l("Bağlantı kapanır", "The connection closes")],
      answer: 1,
      explain: l("Broker mesajı işledi; kuralların hiçbir kuyruk vermemesi onun için hata değil.", "The broker handled the message; rules that match no queue are not an error to it."),
      reviewStep: 2,
    },
    {
      question: l("Bir kuyruk `x-overflow: reject-publish` ile dolu. Yeni bir mesaj gönderirsen?", "A queue with `x-overflow: reject-publish` is full. You publish a new message. What happens?"),
      options: [l("En eski mesaj silinir", "The oldest is deleted"), l("Yeni mesaj reddedilir, nack gelir", "The new one is refused with a nack"), l("Kuyruk büyür", "The queue grows"), l("Dead letter olur", "It is dead-lettered")],
      answer: 1,
      explain: l("reject-publish yeni mesajı almaz ve producer'a nack gönderir.", "reject-publish refuses the new message and nacks the producer."),
      reviewStep: 4,
    },
    {
      question: l("Bir mesaj gönderdin ve cevap gelmeden bağlantı koptu. Doğru davranış ne?", "You sent a message and the connection dropped before the answer. What is the right move?"),
      options: [
        l("Gönderildi say, devam et", "Count it as sent and move on"),
        l("Yeniden gönder ve consumer'ın tekrarı kaldırmasını sağla", "Resend it and make sure the consumer copes with a duplicate"),
        l("Kuyruğu sil", "Delete the queue"),
        l("Mesajı persistent yap, yeter", "Making it persistent is enough"),
      ],
      answer: 1,
      explain: l("Ulaşıp ulaşmadığını bilemezsin; yeniden göndermek kaybı önler, tekrarı da consumer çözer.", "You cannot know if it arrived; resending prevents loss and the consumer handles the repeat."),
      reviewStep: 6,
    },
    {
      question: l("Quorum queue'nun 3 node'undan 2'si kapalıyken gönderilen mesaja ne olur?", "What happens to a message sent to a quorum queue while 2 of its 3 nodes are down?"),
      options: [l("Ack gelir", "It is acked"), l("Nack gelir", "It is nacked"), l("Sessizce kaybolur", "It is silently lost"), l("Classic queue'ya taşınır", "It moves to a classic queue")],
      answer: 1,
      explain: l("Çoğunluk olmadan quorum queue mesajı güvenle saklayamaz, bu yüzden nack verir.", "Without a majority the quorum queue cannot store the message safely, so it nacks."),
      reviewStep: 5,
    },
  ],
};
