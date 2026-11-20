import { l } from "@lets-explain/core/i18n";
import type { DeathReason } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** A fanout dead letter exchange `dlx` with a `dead` queue, and a `work` queue declared as given. */
const setup = (work: string) =>
  script(`
ch.exchange_declare(exchange="dlx", exchange_type="fanout", durable=True)
ch.queue_declare(queue="dead", durable=True)
ch.queue_bind(queue="dead", exchange="dlx")
${work}
`);

/** A worker that rejects what it can't parse (without requeue) and acks the rest. */
const worker = (queue: string, bad: string) => `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def handle(ch, method, properties, body):
    if body == b"${bad}":
        ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    else:
        ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="${queue}", on_message_callback=handle)
ch.start_consuming()`;

const send = (queue: string, body: string) => script(`ch.basic_publish(exchange="", routing_key="${queue}", body=b"${body}")`);

/** Free play: `work` with a rejecting worker and `dead` next to it. */
export const FREE = projectAfter(
  { "setup.py": setup(`ch.queue_declare(queue="work", durable=True, arguments={"x-dead-letter-exchange": "dlx"})`), "worker.py": worker("work", "bad"), "send_bad.py": send("work", "bad"), "send.py": send("work", "ok") },
  ["python setup.py", "python worker.py"],
);

/* ----------------------------------------------------------------- checks */

/** A message from `from` was dead-lettered for this reason and reached `to`. */
const died = (ctx: RabbitCtx, from: string, reason: DeathReason, to: string) => eventsOf(ctx, "deadLettered").some((e) => e.from === from && e.reason === reason && e.to === to);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "rejected",
    title: l("Reddedilenler nerede?", "Where did the rejects go?"),
    story: l(
      "İşçi okuyamadığı siparişleri `requeue=False` ile reddediyor; doğru, çünkü tekrar denemek işe yaramaz. Ama bu mesajlar iz bırakmadan yok oluyor ve destek ekibi hangi siparişlerin bozuk geldiğini göremiyor. `work` canlıda ve dolu; kodda değişiklik bugün mümkün değil.",
      "The worker rejects orders it can't read with `requeue=False`, which is right: retrying won't help. But those messages vanish without a trace and support can't see which orders came in broken. `work` is live and busy; changing the code isn't possible today.",
    ),
    goal: l("`send_bad.py`'nin gönderdiği bozuk mesaj reddedilince `dead` kuyruğuna düşsün.", "When the broken message from `send_bad.py` is rejected, it lands in the `dead` queue."),
    start: projectAfter(
      { "setup.py": setup(`ch.queue_declare(queue="work", durable=True)`), "worker.py": worker("work", "bad"), "send_bad.py": send("work", "bad") },
      ["python setup.py", "python worker.py"],
    ),
    hints: [
      l("Reddedilen bir mesaj, kuyruğun bir **dead letter exchange**'i varsa oraya gider; yoksa atılır.", "A rejected message goes to the queue's **dead letter exchange** if it has one; otherwise it is dropped."),
      l(
        "Çalışan bir kuyruğa DLX vermenin kod gerektirmeyen yolu bir policy: `rabbitmqctl set_policy`, JSON'da `dead-letter-exchange`.",
        "The no-code way to give a running queue a DLX is a policy: `rabbitmqctl set_policy`, with `dead-letter-exchange` in the JSON.",
      ),
      l(
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python send_bad.py`",
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python send_bad.py`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "work", "rejected", "dead"),
  },
  {
    id: "expired",
    title: l("Bayat hatırlatmalar", "Stale reminders"),
    story: l(
      "`reminders` kuyruğundaki hatırlatmalar 3 saniyeden eskiyse işe yaramıyor: kullanıcıya geç giden bir \"toplantın başlıyor\" mesajı kafa karıştırıyor. Bayatlayanlar atılmasın, denetim için `dead`'e gitsin. Şu an `reminders`'ı okuyan kimse yok.",
      "Reminders in the `reminders` queue are useless after 3 seconds: a late \"your meeting is starting\" just confuses people. Stale ones shouldn't be thrown away but kept in `dead` for auditing. Nobody is reading `reminders` right now.",
    ),
    goal: l("`remind.py`'nin gönderdiği hatırlatmanın süresi dolsun ve `dead`'e gitsin.", "The reminder sent by `remind.py` expires and goes to `dead`."),
    start: projectAfter({ "setup.py": setup(`ch.queue_declare(queue="reminders", durable=True)`), "remind.py": send("reminders", "meeting at 10:00") }, ["python setup.py"]),
    hints: [
      l("İki ayar lazım: bir süre (TTL) ve süresi dolanın gideceği yer (DLX). Biri eksikse mesaj ya sonsuza kadar bekler ya da atılır.", "You need two settings: a time limit (TTL) and where expired messages go (DLX). Miss one and the message either waits forever or is dropped."),
      l(
        "Policy JSON'unda ikisi birden olabilir: `message-ttl` milisaniye cinsinden, `dead-letter-exchange` exchange'in adı. Süre geçsin diye `sleep`.",
        "A policy's JSON can hold both: `message-ttl` in milliseconds, `dead-letter-exchange` the exchange's name. Let the time pass with `sleep`.",
      ),
      l(
        "`rabbitmqctl set_policy stale \"^reminders$\" '{\"message-ttl\":3000,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python remind.py`, `sleep 3`",
        "`rabbitmqctl set_policy stale \"^reminders$\" '{\"message-ttl\":3000,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python remind.py`, `sleep 3`",
      ),
    ],
    par: 3,
    check: (ctx) => died(ctx, "reminders", "expired", "dead"),
  },
  {
    id: "overflow",
    title: l("Taşan kampanya", "The overflowing sale"),
    story: l(
      "`work` en fazla 2 bekleyen mesaj tutacak şekilde kurulmuş (`x-max-length`). İşçi bakımda; kampanya başlayınca taşan en eski siparişler sessizce atılıyor. Atılmasınlar, `dead`'e gitsinler: işçi dönünce oradan elle işlenecekler.",
      "`work` is set to hold at most 2 waiting messages (`x-max-length`). The worker is down for maintenance; when the sale starts, the oldest orders are silently dropped as the queue overflows. They should go to `dead` instead, to be handled by hand when the worker is back.",
    ),
    goal: l("`burst.py`'nin 3 siparişinden taşan en eskisi `dead`'e gitsin; hiçbir sipariş kaybolmasın.", "Of `burst.py`'s 3 orders, the oldest one that overflows goes to `dead`; no order is lost."),
    start: projectAfter(
      {
        "setup.py": setup(`ch.queue_declare(queue="work", durable=True, arguments={"x-max-length": 2})`),
        "burst.py": script(`for n in ["o1", "o2", "o3"]:\n    ch.basic_publish(exchange="", routing_key="work", body=n)`),
      },
      ["python setup.py"],
    ),
    hints: [
      l("Sınırı aşınca baştaki mesaj çıkar (drop-head). DLX varsa oraya gider, yoksa kaybolur.", "Past the cap, the head message leaves (drop-head). With a DLX it goes there; without one it is lost."),
      l("Kuyruğun argümanı değişemez ama bir policy DLX ekleyebilir; sınırı argüman koymaya devam eder.", "The queue's arguments can't change, but a policy can add the DLX; the argument keeps setting the cap."),
      l(
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python burst.py`",
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python burst.py`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "work", "maxlen", "dead") && lostSince(ctx).length === 0,
  },
  {
    id: "dlx-key",
    title: l("Yanlış adres", "Wrong address"),
    story: l(
      "Reddedilen ödemeler `errors-x` exchange'ine dead letter oluyor; `errors` kuyruğu oraya `payment.failed` key'iyle bağlı. Yine de `errors` hep boş. Ödemeler `payments` key'iyle gönderiliyor ve dead letter olurken bu key'i taşıyorlar.",
      "Declined payments are dead-lettered to the `errors-x` exchange, where the `errors` queue is bound with the key `payment.failed`. Still, `errors` is always empty. Payments are sent with the key `payments`, and they keep that key when dead-lettered.",
    ),
    goal: l("`declined.py`'nin gönderdiği ödeme reddedilince `errors` kuyruğuna ulaşsın.", "When the payment sent by `declined.py` is declined, it reaches the `errors` queue."),
    start: projectAfter(
      {
        "setup.py": script(`
ch.exchange_declare(exchange="errors-x", exchange_type="direct", durable=True)
ch.queue_declare(queue="errors", durable=True)
ch.queue_bind(queue="errors", exchange="errors-x", routing_key="payment.failed")
ch.queue_declare(queue="payments", durable=True, arguments={"x-dead-letter-exchange": "errors-x"})
`),
        "worker.py": worker("payments", "declined"),
        "declined.py": send("payments", "declined"),
      },
      ["python setup.py", "python worker.py"],
    ),
    hints: [
      l(
        "Dead letter olan mesaj, aksi söylenmedikçe kendi routing key'iyle gider. `errors-x` direct bir exchange: `payments` key'ini tanımıyor.",
        "A dead-lettered message keeps its own routing key unless told otherwise. `errors-x` is a direct exchange: it doesn't know the key `payments`.",
      ),
      l("Ölen mesajın key'ini değiştiren ayar `dead-letter-routing-key`; bir policy ile verebilirsin.", "The setting that changes a dead message's key is `dead-letter-routing-key`; a policy can set it."),
      l(
        "`rabbitmqctl set_policy dlk \"^payments$\" '{\"dead-letter-routing-key\":\"payment.failed\"}' --apply-to queues`, `python declined.py`",
        "`rabbitmqctl set_policy dlk \"^payments$\" '{\"dead-letter-routing-key\":\"payment.failed\"}' --apply-to queues`, `python declined.py`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "payments", "rejected", "errors"),
  },
];
