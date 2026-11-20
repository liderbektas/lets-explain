import { l } from "@lets-explain/core/i18n";
import type { DeathReason } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** The parking lot: a fanout `dlx` with a `parking` queue, plus whatever queue `rest` declares. */
const setup = (rest: string) =>
  script(`
ch.exchange_declare(exchange="dlx", exchange_type="fanout", durable=True)
ch.queue_declare(queue="parking", durable=True)
ch.queue_bind(queue="parking", exchange="dlx")
${rest.trim()}
`);

const QUORUM = `ch.queue_declare(queue="orders", durable=True, arguments={"x-queue-type": "quorum"})`;

/** A worker that fails on one body: puts it back (requeue) or turns it away (reject), and acks the rest. */
const worker = (queue: string, bad: string, onFail: string) => `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def handle(ch, method, properties, body):
    if body == b"${bad}":
        print(f" [!] cannot handle {body.decode()}")
        ${onFail}
    else:
        ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="${queue}", on_message_callback=handle)
ch.start_consuming()`;

const REQUEUE = "ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)";
const REJECT = "ch.basic_reject(delivery_tag=method.delivery_tag, requeue=False)";

const send = (queue: string, body: string) => script(`ch.basic_publish(exchange="", routing_key="${queue}", body=b"${body}")`);

/** Free play: a quorum `orders` limited to 3 deliveries, parked in `parking`, with a requeueing worker. */
export const FREE = projectAfter(
  {
    "setup.py": setup(`ch.queue_declare(queue="orders", durable=True, arguments={"x-queue-type": "quorum", "x-delivery-limit": 3, "x-dead-letter-exchange": "dlx"})`),
    "worker.py": worker("orders", "bad", REQUEUE),
    "send_bad.py": send("orders", "bad"),
    "send.py": send("orders", "ok"),
  },
  ["python setup.py", "python worker.py"],
);

/* ----------------------------------------------------------------- checks */

/** The message with this body sits in `parking`, dead for this reason. */
const parked = (ctx: RabbitCtx, body: string, reason: DeathReason) =>
  (ctx.state.queues.parking?.ready ?? []).some((m) => m.body === body && m.deaths.some((d) => d.reason === reason));

/** How many times messages with this body were delivered during the scenario. */
function deliveries(ctx: RabbitCtx, body: string): number {
  const ids = new Set(eventsOf(ctx, "routed").filter((e) => e.message.body === body).map((e) => e.id));
  return eventsOf(ctx, "delivered").filter((d) => ids.has(d.id)).length;
}

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "endless-retries",
    title: l("Bitmeyen deneme", "Endless retries"),
    story: l(
      "Bozuk bir sipariş geldiğinde işçi onu `requeue=True` ile geri koyuyor; geçici hatalar için doğru, ama bozuk mesaj için değil. `orders` bir quorum kuyruğu: RabbitMQ 20 denemeden sonra mesajı bırakıyor, ama DLX olmadığı için iz bırakmadan siliyor. Ekip bunun yerine 3 denemeden sonra `parking`'e park edilmesini istiyor.",
      "When a broken order arrives, the worker puts it back with `requeue=True`: right for a passing error, wrong for a broken message. `orders` is a quorum queue: RabbitMQ gives up after 20 deliveries, but with no DLX it deletes the message without a trace. The team wants it parked in `parking` after 3 tries instead.",
    ),
    goal: l("`send_bad.py`'nin bozuk mesajı en fazla 4 teslimden sonra `parking`'e düşsün.", "The broken message from `send_bad.py` lands in `parking` after at most 4 deliveries."),
    start: projectAfter({ "setup.py": setup(QUORUM), "worker.py": worker("orders", "bad", REQUEUE), "send_bad.py": send("orders", "bad") }, ["python setup.py", "python worker.py"]),
    hints: [
      l("Quorum kuyrukları her mesajın kaç kez geri döndüğünü sayar: `delivery-limit`. Sınırı aşan mesaj dead letter olur.", "Quorum queues count how often each message came back: `delivery-limit`. A message past the limit is dead-lettered."),
      l(
        "Canlı kuyruğa bir policy ile iki ayar ver: `delivery-limit` ve `dead-letter-exchange`.",
        "Give the live queue two settings with a policy: `delivery-limit` and `dead-letter-exchange`.",
      ),
      l(
        "`rabbitmqctl set_policy limits \"^orders$\" '{\"delivery-limit\":3,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python send_bad.py`",
        "`rabbitmqctl set_policy limits \"^orders$\" '{\"delivery-limit\":3,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `python send_bad.py`",
      ),
    ],
    par: 2,
    check: (ctx) => parked(ctx, "bad", "delivery_limit") && deliveries(ctx, "bad") <= 4,
  },
  {
    id: "no-retry",
    title: l("Denemeye değmez", "Not worth a retry"),
    story: l(
      "Bozuk JSON hiçbir zaman düzelmeyecek, ama işçi onu yine de 3 kez deneyip loglara 3 hata yazıyor, sonra `parking`'e park ediliyor. Okunamayan bir mesaj ilk denemede park edilsin; sağlam mesajlar onaylanmaya devam etsin.",
      "Broken JSON will never get better, yet the worker still tries it 3 times, writing 3 errors to the logs, before it's parked. A message that can't be read should be parked on the first failure; good messages keep being acked.",
    ),
    goal: l(
      "Bozuk mesaj **tek teslimde** `parking`'e gitsin ve bir sağlam mesaj onaylansın (`send.py`).",
      "The broken message goes to `parking` after **a single delivery**, and a good message is acked (`send.py`).",
    ),
    start: projectAfter(
      {
        "setup.py": setup(`ch.queue_declare(queue="orders", durable=True, arguments={"x-queue-type": "quorum", "x-delivery-limit": 3, "x-dead-letter-exchange": "dlx"})`),
        "worker.py": worker("orders", "bad", REQUEUE),
        "send_bad.py": send("orders", "bad"),
        "send.py": send("orders", "ok"),
      },
      ["python setup.py", "python worker.py"],
    ),
    hints: [
      l("Kalıcı bir hata için geri koymak (`requeue=True`) sadece zaman kaybı. Geri koymadan reddetmek mesajı doğrudan DLX'e gönderir.", "Putting back (`requeue=True`) on a permanent failure only wastes time. Rejecting without requeue sends it straight to the DLX."),
      l(
        "`worker.py`'de `basic_nack(..., requeue=True)` yerine `basic_reject(..., requeue=False)`. Çalışan işçi eski kodu çalıştırıyor: durdurup yeniden başlat.",
        "In `worker.py`, use `basic_reject(..., requeue=False)` instead of `basic_nack(..., requeue=True)`. The running worker runs the old code: stop it and start it again.",
      ),
      l(
        "`nano worker.py`, `pkill -f worker.py`, `python worker.py`, `python send_bad.py`, `python send.py`",
        "`nano worker.py`, `pkill -f worker.py`, `python worker.py`, `python send_bad.py`, `python send.py`",
      ),
    ],
    par: 5,
    check: (ctx) =>
      parked(ctx, "bad", "rejected") &&
      deliveries(ctx, "bad") === 1 &&
      eventsOf(ctx, "acked").some((e) => e.ids.some((id) => eventsOf(ctx, "routed").some((r) => r.id === id && r.message.body === "ok"))),
  },
  {
    id: "retry-later",
    title: l("Biraz sonra tekrar", "Try again later"),
    story: l(
      "Ödeme sağlayıcısı arada bir birkaç saniyeliğine düşüyor. İşçi o anda gelen mesajı `requeue=False` ile reddediyor ve mesaj kayboluyor. Hemen geri koymak da işe yaramaz: sağlayıcı hâlâ kapalıyken saniyede yüzlerce deneme olur. `retry-x` exchange'i ve `retry` kuyruğu hazır.",
      "The payment provider drops out for a few seconds now and then. The worker rejects whatever arrives at that moment with `requeue=False`, and the message is lost. Putting it straight back won't help either: hundreds of retries a second while the provider is still down. The `retry-x` exchange and the `retry` queue are ready.",
    ),
    goal: l(
      "Reddedilen `late` mesajı `retry`'da 2 saniye beklesin, sonra `orders`'a dönüp işçiye **yeniden** teslim edilsin.",
      "The rejected `late` message waits 2 seconds in `retry`, then goes back to `orders` and is delivered to the worker **again**.",
    ),
    start: projectAfter(
      {
        "setup.py": script(`
ch.exchange_declare(exchange="retry-x", exchange_type="fanout", durable=True)
ch.queue_declare(queue="retry", durable=True)
ch.queue_bind(queue="retry", exchange="retry-x")
${QUORUM}
`),
        "worker.py": worker("orders", "late", REJECT),
        "send_late.py": send("orders", "late"),
      },
      ["python setup.py", "python worker.py"],
    ),
    hints: [
      l(
        "Bekleme odası deseni: `orders` reddettiğini `retry-x`'e dead letter etsin; `retry` mesajı bir TTL boyunca tutsun ve süresi dolunca `orders`'a geri dead letter etsin.",
        "The waiting-room pattern: `orders` dead-letters its rejects to `retry-x`; `retry` holds a message for a TTL and, when it expires, dead-letters it back to `orders`.",
      ),
      l(
        "İki policy: `orders` için `dead-letter-exchange: retry-x`; `retry` için `message-ttl: 2000`, `dead-letter-exchange: \"\"` (varsayılan exchange) ve `dead-letter-routing-key: orders`. Sonra gönder ve `sleep`.",
        "Two policies: for `orders`, `dead-letter-exchange: retry-x`; for `retry`, `message-ttl: 2000`, `dead-letter-exchange: \"\"` (the default exchange) and `dead-letter-routing-key: orders`. Then send and `sleep`.",
      ),
      l(
        "`rabbitmqctl set_policy to-retry \"^orders$\" '{\"dead-letter-exchange\":\"retry-x\"}' --apply-to queues`, `rabbitmqctl set_policy back \"^retry$\" '{\"message-ttl\":2000,\"dead-letter-exchange\":\"\",\"dead-letter-routing-key\":\"orders\"}' --apply-to queues`, `python send_late.py`, `sleep 2`",
        "`rabbitmqctl set_policy to-retry \"^orders$\" '{\"dead-letter-exchange\":\"retry-x\"}' --apply-to queues`, `rabbitmqctl set_policy back \"^retry$\" '{\"message-ttl\":2000,\"dead-letter-exchange\":\"\",\"dead-letter-routing-key\":\"orders\"}' --apply-to queues`, `python send_late.py`, `sleep 2`",
      ),
    ],
    par: 4,
    check: (ctx) => eventsOf(ctx, "deadLettered").some((e) => e.from === "retry" && e.reason === "expired" && e.to === "orders") && deliveries(ctx, "late") >= 2,
  },
  {
    id: "classic-ignores",
    title: l("Classic dinlemiyor", "Classic doesn't listen"),
    story: l(
      "Bir takım arkadaşın `jobs` için `delivery-limit` ve DLX içeren bir policy kurmuş, ama bozuk mesaj yine sonsuza kadar dönüyor. `rabbitmqctl list_queues name type policy` sebebi gösteriyor: `jobs` bir classic kuyruk ve classic kuyruklar teslim sayısını tutmaz. Kuyruk şu an boş.",
      "A teammate set a policy with `delivery-limit` and a DLX for `jobs`, but the broken message still goes round forever. `rabbitmqctl list_queues name type policy` shows why: `jobs` is a classic queue, and classic queues don't count deliveries. The queue is empty right now.",
    ),
    goal: l("`jobs`'a gelen bozuk mesaj tekrar denemelerden sonra `parking`'e düşsün.", "A broken message sent to `jobs` ends up in `parking` after its retries."),
    start: projectAfter(
      { "setup.py": setup(`ch.queue_declare(queue="jobs", durable=True)`), "worker.py": worker("jobs", "bad", REQUEUE), "send_bad.py": send("jobs", "bad") },
      ["python setup.py", `rabbitmqctl set_policy limits "^jobs$" '{"delivery-limit":2,"dead-letter-exchange":"dlx"}' --apply-to queues`, "python worker.py"],
    ),
    hints: [
      l("Teslim sayısını tutan ve `delivery-limit`'i uygulayan, quorum kuyruğudur. Kuyruğun türü sonradan değişmez.", "It's the quorum queue that counts deliveries and applies `delivery-limit`. A queue's type can't change later."),
      l(
        "Kuyruk boş: `setup.py`'de quorum yap, eski kuyruğu sil, yeniden kur. Silinen kuyruğun tüketicisi de gider: işçiyi yeniden başlat.",
        "The queue is empty: make it quorum in `setup.py`, delete the old one, set it up again. Deleting a queue drops its consumer too: start the worker again.",
      ),
      l(
        "`nano setup.py` (`arguments={\"x-queue-type\": \"quorum\"}`), `rabbitmqctl delete_queue jobs`, `python setup.py`, `python worker.py`, `python send_bad.py`",
        "`nano setup.py` (`arguments={\"x-queue-type\": \"quorum\"}`), `rabbitmqctl delete_queue jobs`, `python setup.py`, `python worker.py`, `python send_bad.py`",
      ),
    ],
    par: 5,
    check: (ctx) => ctx.state.queues.jobs?.type === "quorum" && parked(ctx, "bad", "delivery_limit"),
  },
];
