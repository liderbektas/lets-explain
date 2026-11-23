import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const poisonMessages: Lesson = {
  slug: "poison-messages",
  title: l("Zehirli mesajlar", "Poison messages"),
  summary: l(
    "Her seferinde hata veren bir mesaj sonsuza kadar geri dönebilir. Quorum queue'ların teslim sınırını, park kuyruğunu ve gecikmeli yeniden denemeyi gör.",
    "A message that fails every time can come back forever. See quorum queues' delivery limit, a parking queue, and retrying after a delay.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Requeue'nun bozuk mesajı sonsuz döngüye soktuğunu görmek", "See requeue trap a broken message in a loop"), step: 1 },
    { text: l("Quorum queue'nun teslim sayısını tutup mesajı park ettiğini görmek", "See a quorum queue count deliveries and park the message"), step: 4 },
    { text: l("Geçici ve kalıcı hatayı ayırmak", "Tell temporary failures from permanent ones"), step: 2 },
    { text: l("TTL + DLX ile gecikmeli yeniden deneme kurmak", "Build a delayed retry with TTL + DLX"), step: 6 },
  ],
  steps: [
    {
      short: l("Bozuk mesaj", "A bad message"),
      tag: "problem",
      title: l("Hep hata veren mesaj", "The message that always fails"),
      body: [
        l(
          "Bazı mesajlar hiçbir zaman işlenemez: eksik bir alan, bozuk bir JSON, artık var olmayan bir müşteri. İşçi bunu her denediğinde hata alır. Bunlara **zehirli mesaj** (poison message) denir.",
          "Some messages can never be processed: a missing field, broken JSON, a customer who no longer exists. Every attempt fails. These are called **poison messages**.",
        ),
        l(
          "Sahnede klasik bir `orders-v1` kuyruğu ve onu dinleyen dikkatli bir işçi var (prefetch 1, manuel ack). Turuncu zarf bozuk mesaj olacak.",
          "On stage is a classic `orders-v1` queue and a careful worker on it (prefetch 1, manual ack). The orange envelope will be the bad message.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_queues name type messages_ready messages_unacknowledged", note: l("`type` sütunu kuyruğun classic mi quorum mu olduğunu gösterir.", "The `type` column shows whether a queue is classic or quorum.") }],
      },
    },
    {
      short: l("Döngü", "The loop"),
      tag: "experiment",
      predict: {
        question: l(
          "İşçi bozuk mesajı her seferinde `nack(requeue=True)` ile geri veriyor. Bu böyle giderse ne olur?",
          "The worker hands the bad message back with `nack(requeue=True)` every time. If this goes on, what happens?",
        ),
        options: [
          l("Birkaç denemeden sonra RabbitMQ onu kendisi siler", "After a few tries RabbitMQ deletes it by itself"),
          l("Mesaj sonsuza kadar geri gelir ve işçiyi meşgul eder", "It comes back forever and keeps the worker busy"),
          l("Mesaj başka bir kuyruğa geçer", "It moves to another queue"),
        ],
        answer: 1,
        why: l(
          "Klasik bir kuyruk bir mesajın kaç kez geri verildiğini saymaz. Requeue edilen mesaj başa döner, tekrar teslim edilir, yine hata verir: sonsuz döngü.",
          "A classic queue does not count how often a message was handed back. A requeued message goes to the front, is delivered again, fails again: an endless loop.",
        ),
      },
      title: l("Requeue'nun tuzağı: sonsuz döngü", "The requeue trap: an endless loop"),
      body: [
        l(
          "Bozuk mesaj dört kez teslim edildi, dördünde de geri verildi. Üstünde \"4×\" damgası var ve sayaç \"En çok teslim edilen: 4\" diyor. Bu böyle sonsuza kadar gidebilir.",
          "The bad message was delivered four times and handed back each time. It carries a \"4×\" postmark and the counter says \"Most deliveries: 4\". This could go on forever.",
        ),
        l(
          "Daha kötüsü: prefetch 1 olan işçi bu mesajla uğraşırken arkasındaki sağlam mesajlara hiç sıra gelmez. Tek bir bozuk mesaj bütün kuyruğu kilitleyebilir.",
          "Worse: while the prefetch-1 worker is busy with it, the good messages behind never get a turn. One bad message can block the whole queue.",
        ),
      ],
    },
    {
      short: l("Kalıcı hata", "Permanent"),
      tag: "how",
      predict: {
        question: l(
          "İşçi hatanın kalıcı olduğunu anladı ve mesajı `requeue=False` ile reddedecek. `orders-v1`'in DLX'i yok. Ne olur?",
          "The worker sees the failure is permanent and will reject with `requeue=False`. `orders-v1` has no DLX. What happens?",
        ),
        options: [l("Mesaj silinir", "The message is deleted"), l("Mesaj park kuyruğuna gider", "It goes to a parking queue"), l("Mesaj yine geri gelir", "It comes back again")],
        answer: 0,
        why: l("Gidecek bir dead letter exchange'i olmayan kuyrukta reddedilen mesaj silinir. Döngü bitti ama mesaj da gitti.", "On a queue with no dead letter exchange, a rejected message is deleted. The loop is over, but the message is gone too."),
      },
      title: l("Geçici mi, kalıcı mı?", "Temporary or permanent?"),
      body: [
        l(
          "İşçi mesajı requeue olmadan reddetti ve mesaj silindi: \"Kayıp: 1\". Döngü durdu, ama o siparişe ne olduğunu artık kimse bilmiyor.",
          "The worker rejected the message without requeue, and it was deleted: \"Lost: 1\". The loop stopped, but nobody knows what happened to that order now.",
        ),
        l(
          "Kural basit: hata **geçiciyse** (veritabanı bir an yok, ağ koptu) requeue et. **Kalıcıysa** (veri bozuk) requeue etme. Ama mesajı silmek yerine incelenebileceği bir yere koy. Bunu şimdi kuracağız.",
          "The rule is simple: if the failure is **temporary** (database briefly away, network blip), requeue. If it is **permanent** (bad data), do not. But instead of deleting the message, put it somewhere it can be looked at. That is what we build next.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · hatayı ayır",
            code: 'def handle(ch, method, props, body):\n    try:\n        process(body)\n        ch.basic_ack(delivery_tag=method.delivery_tag)\n    except TemporaryError:\n        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)\n    except Exception:\n        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Quorum + DLX", "Quorum + DLX"),
      tag: "idea",
      title: l("Sayan bir kuyruk ve bir park yeri", "A queue that counts, and a place to park"),
      body: [
        l(
          "Yeni bir `orders` kuyruğu kurduk, bu sefer **quorum** türünde. Quorum queue'lar her mesajın kaç kez başarısız teslim edildiğini sayar ve `x-delivery-limit`'i aşanı bir daha teslim etmez.",
          "We set up a new `orders` queue, this time of type **quorum**. Quorum queues count how many times each message was delivered without success, and stop delivering one that passes `x-delivery-limit`.",
        ),
        l(
          "Sınırı aşan mesaj kuyruğun [[dlx]]'ine gönderilir. Bizimki `dlx` exchange'i ve arkasındaki `parking` kuyruğu: bozuk mesajların bekleyip incelendiği \"park yeri\".",
          "A message past the limit goes to the queue's [[dlx]]. Ours is the `dlx` exchange with the `parking` queue behind it: the \"parking lot\" where bad messages wait to be inspected.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ 4.0'dan beri quorum queue'larda varsayılan delivery limit **20**. Burada 3 kullanıyoruz ki 21 kez nack göndermek zorunda kalmayalım. Klasik kuyruklarda bu sınır yoktur.",
            "Since RabbitMQ 4.0 the default delivery limit on quorum queues is **20**. We use 3 here so we do not have to nack 21 times. Classic queues have no such limit.",
          ),
        },
      ],
      practice: {
        snippets: [
          {
            label: "Python · quorum + delivery limit",
            code: 'ch.exchange_declare(exchange="dlx", exchange_type="fanout")\nch.queue_declare(queue="parking", durable=True)\nch.queue_bind(queue="parking", exchange="dlx")\nch.queue_declare(queue="orders", durable=True, arguments={\n    "x-queue-type": "quorum",\n    "x-delivery-limit": 3,\n    "x-dead-letter-exchange": "dlx",\n})',
          },
        ],
        commands: [
          {
            cmd: "docker exec rabbitmq rabbitmqctl set_policy --apply-to queues orders-limits \"^orders$\" '{\"delivery-limit\":3,\"dead-letter-exchange\":\"dlx\"}'",
            note: l("Aynı ayarları koda yazmak yerine bir policy ile vermek: sonradan kodu değiştirmeden ayarlayabilirsin.", "The same settings as a policy instead of in code: you can change them later without touching the code."),
          },
        ],
      },
    },
    {
      short: l("Sınır", "The limit"),
      tag: "experiment",
      predict: {
        question: l(
          "Delivery limit 3. İşçi bozuk mesajı her seferinde requeue ile geri verecek. Mesaj park kuyruğuna ne zaman düşer?",
          "The delivery limit is 3. The worker will hand the bad message back with requeue each time. When does it land in parking?",
        ),
        options: [
          l("3. geri vermeden sonra", "After the 3rd hand-back"),
          l("4. geri vermeden sonra (sınır aşılınca)", "After the 4th hand-back (once the limit is passed)"),
          l("Hiçbir zaman, requeue edildiği sürece", "Never, as long as it is requeued"),
        ],
        answer: 1,
        why: l(
          "Limit, izin verilen başarısız teslim sayısıdır. Mesaj 3 kez başarısız olabilir; 4. başarısızlıkta sınır aşılır ve mesaj DLX'e gider.",
          "The limit is how many failed deliveries are allowed. The message may fail 3 times; on the 4th failure the limit is passed and it goes to the DLX.",
        ),
      },
      title: l("Sınır aşıldı: park yerine", "Over the limit: into parking"),
      body: [
        l(
          "Bozuk mesaj dört kez teslim edildi ve dördünde de geri verildi. Dördüncüden sonra quorum queue onu bir daha teslim etmedi ve `parking`'e gönderdi.",
          "The bad message was delivered four times and handed back each time. After the fourth, the quorum queue stopped delivering it and sent it to `parking`.",
        ),
        l(
          "Mesaj kaybolmadı ve kuyruk artık kilitli değil. Üstündeki `x-death` header'ında nedeni yazıyor: `delivery_limit`.",
          "The message is not lost and the queue is no longer blocked. Its `x-death` header says why: `delivery_limit`.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · kaçıncı deneme?",
            code: 'def handle(ch, method, props, body):\n    tries = (props.headers or {}).get("x-delivery-count", 0)\n    print("attempt", tries + 1)',
            note: l("Quorum queue'lar yeniden teslim edilen mesaja `x-delivery-count` header'ı ekler.", "Quorum queues add an `x-delivery-count` header to redelivered messages."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Sağlam olan", "The good one"),
      tag: "how",
      title: l("Kuyruk yine akıyor", "The queue flows again"),
      body: [
        l(
          "Sağlam bir mesaj geldi; işçi onu hemen aldı, işledi ve onayladı. Bozuk mesaj artık yolunu tıkamıyor.",
          "A good message arrived; the worker took it right away, processed it and acked it. The bad message no longer blocks the way.",
        ),
        l(
          "Park kuyruğunu bir ekip arkadaşın inceler: veriyi düzeltip mesajı yeniden gönderebilir ya da gerçekten çöp olanı silebilir.",
          "A teammate looks at the parking queue: they can fix the data and send the message again, or delete what really is junk.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec rabbitmq rabbitmqctl list_queues name messages", note: l("`parking` kuyruğunda kaç mesaj biriktiğini izle; artıyorsa bir sorun var.", "Watch how many pile up in `parking`; if it keeps growing, something is wrong.") },
        ],
      },
    },
    {
      short: l("Sonra dene", "Retry later"),
      tag: "how",
      predict: {
        question: l(
          "`retry` kuyruğunun TTL'i 2 tur ve DLX'i mesajı `orders`'a geri yollayacak şekilde ayarlı. Bir mesaj `retry`'a düştü. 2 tur sonra ne olur?",
          "The `retry` queue has a TTL of 2 ticks and a DLX set to send messages back to `orders`. A message landed in `retry`. What happens after 2 ticks?",
        ),
        options: [
          l("Silinir", "It is deleted"),
          l("Süresi dolar ve `orders`'a geri döner", "It expires and returns to `orders`"),
          l("`parking`'e gider", "It goes to `parking`"),
        ],
        answer: 1,
        why: l(
          "Süresi dolan mesaj kuyruğun DLX'ine gider. DLX olarak default exchange'i ve routing key olarak `orders`'ı verdik, yani mesaj `orders`'a geri döner: gecikmeli bir yeniden deneme.",
          "An expired message goes to its queue's DLX. We set the default exchange as the DLX with `orders` as the routing key, so the message returns to `orders`: a delayed retry.",
        ),
      },
      title: l("Gecikmeli yeniden deneme: TTL + DLX", "A delayed retry: TTL + DLX"),
      body: [
        l(
          "Geçici hatada hemen requeue etmek bazen işe yaramaz: hata birkaç saniye sürüyorsa mesaj aynı hatayı hemen tekrar yaşar. Daha iyisi biraz **beklemek**.",
          "Requeueing a temporary failure right away sometimes does not help: if the problem lasts a few seconds, the message hits it again at once. Better to **wait** a little.",
        ),
        l(
          "`retry` kuyruğunu dinleyen kimse yok. Mesaj orada TTL kadar bekledi, süresi dolunca DLX ile `orders`'a döndü ve işçiye yeniden teslim edildi.",
          "Nobody listens to `retry`. The message waited there for its TTL, then expired and went back to `orders` through the DLX, and was delivered to the worker again.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · bekleme kuyruğu",
            code: 'ch.queue_declare(queue="retry", durable=True, arguments={\n    "x-message-ttl": 5000,               # wait 5 seconds\n    "x-dead-letter-exchange": "",         # then the default exchange…\n    "x-dead-letter-routing-key": "orders",  # …puts it back in orders\n})\n\n# on a temporary failure: ack the original and park a copy in retry\nch.basic_publish(exchange="", routing_key="retry", body=body)\nch.basic_ack(delivery_tag=method.delivery_tag)',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projelerde", "In real projects"),
      body: [
        l(
          "İş yapan her kuyruğa bir DLX ve bir park kuyruğu ver. Quorum queue kullanıyorsan delivery limit zaten açık (varsayılan 20); kendi işine göre ayarla.",
          "Give every working queue a DLX and a parking queue. If you use quorum queues, the delivery limit is already on (20 by default); tune it for your workload.",
        ),
        l(
          "Park kuyruğundaki mesaj sayısını izle ve artınca alarm kur. Gecikmeli denemeler için birkaç farklı TTL'li bekleme kuyruğu (5 sn, 1 dk, 10 dk) kurmak yaygın bir desendir.",
          "Watch the parking queue's size and alert when it grows. For delayed retries, a few waiting queues with different TTLs (5 s, 1 min, 10 min) is a common pattern.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede zaman turla ilerler ve süresi dolan mesajlar tur başında temizlenir. Gerçekte TTL milisaniye cinsindendir ve mesajlar kuyruğun başına geldiklerinde süreleri kontrol edilir.",
            "Time moves in ticks here, and expired messages are cleared at the start of a tick. In reality TTLs are in milliseconds, and a message's expiry is checked when it reaches the head of the queue.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Gecikmeli mesajlar için bir eklenti de var (`rabbitmq_delayed_message_exchange`), ama TTL + DLX hiçbir eklenti gerektirmez.",
            "There is also a plugin for delayed messages (`rabbitmq_delayed_message_exchange`), but TTL + DLX needs no plugin at all.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_policies", note: l("Kuyruklara uygulanmış DLX ve limit policy'lerini gösterir.", "Shows the DLX and limit policies applied to queues.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: sonsuza kadar dönen ya da iz bırakmadan kaybolan bozuk mesajlar. Bir işçi arka planda çalışıyor; bir mesajı onaylıyor, geri koyuyor ya da reddediyor. Kodunu değiştirirsen yeniden başlatman gerekir (`pkill -f worker.py`, sonra `python worker.py`).",
          "Your turn. Below are **4 scenarios** from real work: broken messages that go round forever or vanish without a trace. A worker runs in the background, acking, requeueing or rejecting each message. If you change its code, restart it (`pkill -f worker.py`, then `python worker.py`).",
        ),
        l(
          "`rabbitmqctl set_policy` ile limit ve DLX ver, `list_queues name type messages` ile bak, `python` ile mesaj gönder. Sahnedeki sayaç bir mesajın kaç kez teslim edildiğini gösterir.",
          "Set limits and a DLX with `rabbitmqctl set_policy`, look with `list_queues name type messages`, send with `python`. The counter on the scene shows how often a message was delivered.",
        ),
      ],
    },
  ],
  recap: [
    l("Hep hata veren mesaj requeue ile sonsuza kadar döner ve arkasındaki mesajları bekletir.", "A message that always fails loops forever with requeue and holds up the messages behind it."),
    l("Geçici hatada requeue et, kalıcı hatada etme: ama mesajı silmek yerine bir DLX ile park kuyruğuna gönder.", "Requeue temporary failures, not permanent ones; and instead of deleting, send the message to a parking queue through a DLX."),
    l("Quorum queue'lar başarısız teslimleri sayar; `x-delivery-limit` aşılınca mesajı DLX'e gönderir (RabbitMQ 4'te varsayılan 20).", "Quorum queues count failed deliveries and send a message to the DLX once `x-delivery-limit` is passed (20 by default in RabbitMQ 4)."),
    l("Park kuyruğundaki mesaj `x-death` header'ında neden orada olduğunu taşır.", "A parked message carries why it is there in its `x-death` header."),
    l("TTL'li bir bekleme kuyruğu ve DLX ile gecikmeli yeniden deneme kurulur, eklenti gerekmez.", "A waiting queue with a TTL plus a DLX gives a delayed retry, no plugin needed."),
  ],
  quiz: [
    {
      question: l("Klasik bir kuyrukta işçi bozuk bir mesajı hep `requeue=True` ile geri veriyor. Ne olur?", "On a classic queue, a worker keeps handing a bad message back with `requeue=True`. What happens?"),
      options: [
        l("20 denemeden sonra silinir", "It is deleted after 20 tries"),
        l("Sonsuza kadar döner", "It loops forever"),
        l("Otomatik olarak DLX'e gider", "It goes to the DLX automatically"),
        l("Kuyruğun sonuna gider ve bir daha gelmez", "It goes to the back and never returns"),
      ],
      answer: 1,
      explain: l("Klasik kuyruklar teslim sayısını tutmaz; sınır sadece quorum queue'larda var.", "Classic queues do not count deliveries; the limit exists only on quorum queues."),
      reviewStep: 1,
    },
    {
      question: l("Delivery limit 5 olan bir quorum queue'da mesaj kaç başarısız teslimden sonra DLX'e gider?", "On a quorum queue with a delivery limit of 5, after how many failed deliveries does a message go to the DLX?"),
      options: [l("5", "5"), l("6", "6"), l("4", "4"), l("Hiç", "Never")],
      answer: 1,
      explain: l("5 başarısızlığa izin verilir; 6. başarısızlıkta sınır aşılır.", "5 failures are allowed; the 6th passes the limit."),
      reviewStep: 4,
    },
    {
      question: l("Mesajdaki bir alan eksik ve hiçbir zaman işlenemeyecek. İşçi ne yapmalı?", "A field is missing from the message and it can never be processed. What should the worker do?"),
      options: [
        l("`nack(requeue=True)`", "`nack(requeue=True)`"),
        l("`reject(requeue=False)` ve kuyrukta bir DLX olsun", "`reject(requeue=False)`, with a DLX on the queue"),
        l("Hiç cevap vermemek", "Not answer at all"),
        l("auto-ack'e geçmek", "Switch to auto-ack"),
      ],
      answer: 1,
      explain: l("Kalıcı hata: requeue etme, ama mesaj kaybolmasın diye DLX ile park et.", "A permanent failure: do not requeue, but park it through a DLX so it is not lost."),
      reviewStep: 2,
    },
    {
      question: l("Gecikmeli yeniden deneme için hangisi gerekir?", "What does a delayed retry need?"),
      options: [
        l("TTL'li bir bekleme kuyruğu ve asıl kuyruğa dönen bir DLX", "A waiting queue with a TTL and a DLX back to the main queue"),
        l("Daha yüksek bir prefetch", "A higher prefetch"),
        l("auto-ack", "auto-ack"),
        l("Bir stream", "A stream"),
      ],
      answer: 0,
      explain: l("Mesaj bekleme kuyruğunda TTL kadar durur, sonra DLX ile asıl kuyruğa geri döner.", "The message waits in the waiting queue for its TTL, then the DLX sends it back to the main queue."),
      reviewStep: 6,
    },
  ],
};
