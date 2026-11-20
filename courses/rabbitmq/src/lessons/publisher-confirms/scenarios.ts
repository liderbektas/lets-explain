import { l } from "@lets-explain/core/i18n";
import { createBroker } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** The shop: an `orders` exchange, a plain `billing` queue and a small `limited` one that refuses when full. */
export const SETUP = script(`
ch.exchange_declare(exchange="orders", exchange_type="direct", durable=True)
ch.queue_declare(queue="billing", durable=True)
ch.queue_bind(queue="billing", exchange="orders", routing_key="order")
ch.queue_declare(queue="limited", durable=True, arguments={"x-max-length": 2, "x-overflow": "reject-publish"})
ch.queue_bind(queue="limited", exchange="orders", routing_key="limited")
`);

/** A publisher with confirms on: `basic_publish` raises when the broker says no. */
const confirmed = (body: string) => script(`ch.confirm_delivery()\n\n${body.trim()}\nprint("sent")`);

const WORKER = `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def handle(ch, method, properties, body):
    print(f" [x] {body.decode()}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="limited", on_message_callback=handle)
ch.start_consuming()`;

/** Free play: the shop with a few senders. */
export const FREE = projectAfter(
  {
    "setup.py": SETUP,
    "order.py": confirmed(`ch.basic_publish(exchange="orders", routing_key="order", body=b"order-1")`),
    "refund.py": confirmed(`ch.basic_publish(exchange="orders", routing_key="refund", body=b"refund-1", mandatory=True)`),
    "burst.py": confirmed(`for n in ["l1", "l2", "l3"]:\n    ch.basic_publish(exchange="orders", routing_key="limited", body=n)`),
    "worker.py": WORKER,
  },
  ["python setup.py"],
);

/* ----------------------------------------------------------------- checks */

/** The confirm for each message routed to `queue`. */
function answersFor(ctx: RabbitCtx, queue: string): boolean[] {
  const ids = new Set(eventsOf(ctx, "routed").filter((e) => e.queues.includes(queue)).map((e) => e.id));
  return eventsOf(ctx, "confirmed").filter((c) => ids.has(c.id)).map((c) => c.ok);
}

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "refund-nowhere",
    title: l("Kaybolan iadeler", "Vanishing refunds"),
    story: l(
      "Muhasebe soruyor: iadeler nereye gidiyor? `refund.py` her seferinde \"sent\" yazıyor ve confirm'ler açık, ama `refund` key'i için hiçbir kuyruk yok. Broker bu mesajları **ack**'leyip atıyor; script hiçbir şey fark etmiyor.",
      "Accounting asks where the refunds go. `refund.py` prints \"sent\" every time and confirms are on, but no queue is bound for the key `refund`. The broker **acks** those messages and drops them; the script never notices.",
    ),
    goal: l("Gidecek yeri olmayan iade sessizce kaybolmasın, **producer'a geri dönsün**.", "A refund with nowhere to go is not silently dropped: it is **returned to the producer**."),
    start: projectAfter(
      { "setup.py": SETUP, "refund.py": confirmed(`ch.basic_publish(exchange="orders", routing_key="refund", body=b"refund-17")`) },
      ["python setup.py"],
    ),
    hints: [
      l("Bir confirm, \"broker sorumluluğu aldı\" demek; mesajın bir kuyruğa ulaştığı anlamına gelmez.", "A confirm means \"the broker took responsibility\", not that the message reached a queue."),
      l("Yönlendirilemeyen mesajı geri istemek için yayına bir bayrak ekle: `mandatory`.", "To get an unroutable message back, add a flag to the publish: `mandatory`."),
      l(
        "`nano refund.py` (`basic_publish(..., mandatory=True)`), `python refund.py`: artık `UnroutableError` alırsın.",
        "`nano refund.py` (`basic_publish(..., mandatory=True)`), `python refund.py`: now you get an `UnroutableError`.",
      ),
    ],
    par: 2,
    check: (ctx) => eventsOf(ctx, "unroutable").some((e) => e.returned && e.message.body === "refund-17") && !lostSince(ctx).some((x) => x.reason === "unroutable"),
  },
  {
    id: "burst-nacked",
    title: l("Üçüncü sipariş", "The third order"),
    story: l(
      "`limited` kuyruğu belleği korumak için bilerek en fazla 2 mesaj tutuyor ve doluyken yeni geleni reddediyor. Kampanya başladı: `burst.py` 3 sipariş gönderiyor ve üçüncüde `NackError` ile düşüyor. Kuyruğu boşaltan `worker.py` bu sabah başlatılmamış.",
      "The `limited` queue deliberately holds at most 2 messages to protect memory, and refuses new ones when full. The sale has started: `burst.py` sends 3 orders and crashes on the third with a `NackError`. `worker.py`, which drains the queue, wasn't started this morning.",
    ),
    goal: l("`burst.py`'nin 3 siparişi de broker'dan **ack** alsın; hiç nack ve kayıp olmasın.", "All 3 of `burst.py`'s orders get an **ack** from the broker, with no nack and nothing lost."),
    start: projectAfter(
      { "setup.py": SETUP, "burst.py": confirmed(`for n in ["l1", "l2", "l3"]:\n    ch.basic_publish(exchange="orders", routing_key="limited", body=n)`), "worker.py": WORKER },
      ["python setup.py"],
    ),
    hints: [
      l("Nack, kuyruğun dolu olduğunu söylüyor. Sınırı kaldırmak yerine kuyruğun boşalmasını sağla.", "The nack says the queue is full. Rather than lifting the cap, get the queue drained."),
      l("Önce tüketiciyi başlat, sonra gönder.", "Start the consumer first, then send."),
      l("`python worker.py`, `python burst.py`", "`python worker.py`, `python burst.py`"),
    ],
    par: 2,
    check: (ctx) => {
      const answers = answersFor(ctx, "limited");
      return answers.length >= 3 && answers.every(Boolean) && eventsOf(ctx, "confirmed").every((c) => c.ok) && lostSince(ctx).length === 0;
    },
  },
  {
    id: "no-majority",
    title: l("Çoğunluk yok", "No majority"),
    story: l(
      "Gece üç node'luk cluster'ın ikisi (`rabbit2` ve `rabbit3`) kapandı. Ödemeler üç kopyalı bir quorum kuyruğuna gidiyor ve `pay.py` artık her ödemede `NackError` alıyor.",
      "Overnight, two of the three cluster nodes (`rabbit2` and `rabbit3`) went down. Payments go to a three-copy quorum queue, and `pay.py` now gets a `NackError` for every payment.",
    ),
    goal: l("Bir ödeme `payments` kuyruğuna girsin ve broker'dan **ack** alsın.", "A payment gets into the `payments` queue with an **ack** from the broker."),
    start: projectAfter(
      {
        "setup.py": script(`
ch.exchange_declare(exchange="orders", exchange_type="direct", durable=True)
ch.queue_declare(queue="payments", durable=True, arguments={"x-queue-type": "quorum"})
ch.queue_bind(queue="payments", exchange="orders", routing_key="pay")
`),
        "pay.py": confirmed(`ch.basic_publish(exchange="orders", routing_key="pay", body=b"payment-9")`),
      },
      ["python setup.py", "docker stop rabbit2", "docker stop rabbit3"],
      createBroker({ nodes: 3 }),
    ),
    hints: [
      l("`docker ps -a` hangi node'ların kapalı olduğunu gösterir. Üç kopyalı bir quorum kuyruğu en az iki çalışan node ister.", "`docker ps -a` shows which nodes are down. A three-copy quorum queue needs at least two nodes up."),
      l("Bir node'u geri getirmek yeter: `docker start`.", "Bringing one node back is enough: `docker start`."),
      l("`docker start rabbit2`, `python pay.py`", "`docker start rabbit2`, `python pay.py`"),
    ],
    par: 2,
    check: (ctx) => answersFor(ctx, "payments").some(Boolean),
  },
  {
    id: "acked-then-lost",
    title: l("Ack aldı, yine kayboldu", "Acked, then lost"),
    story: l(
      "Mağaza bir sipariş gönderdi, broker ack verdi, hemen ardından broker yeniden başladı ve sipariş `billing`'den kayboldu. `order.py`'de confirm'ler açık; eksik olan başka bir şey.",
      "The shop sent an order, the broker acked it, then the broker restarted and the order was gone from `billing`. `order.py` has confirms on; something else is missing.",
    ),
    goal: l("`order.py`'nin gönderdiği sipariş bir broker restart'ından sonra `billing`'de dursun.", "The order sent by `order.py` is still in `billing` after a broker restart."),
    start: projectAfter({ "setup.py": SETUP, "order.py": confirmed(`ch.basic_publish(exchange="orders", routing_key="order", body=b"order-55")`) }, ["python setup.py"]),
    hints: [
      l("Ack \"kuyruğa koydum\" der. Geçici (transient) bir mesaj yalnızca bellekte durur; restart onu siler.", "An ack says \"queued\". A transient message lives only in memory; a restart wipes it."),
      l("Mesajı persistent gönder: `delivery_mode=pika.DeliveryMode.Persistent`.", "Send it persistent: `delivery_mode=pika.DeliveryMode.Persistent`."),
      l(
        "`nano order.py` (`properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent)`), `python order.py`, `docker restart rabbitmq`",
        "`nano order.py` (`properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent)`), `python order.py`, `docker restart rabbitmq`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const restarted = ctx.events.map((evs) => evs.some((e) => e.type === "restarted")).lastIndexOf(true);
      return restarted >= 0 && (ctx.state.queues.billing?.ready ?? []).some((m) => m.body === "order-55");
    },
  },
];
