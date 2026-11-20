import { l } from "@lets-explain/core/i18n";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** setup.py: an `orders` fanout exchange with these queues declared and bound. */
export const ordersSetup = (queues: string[]) =>
  script(`
ch.exchange_declare(exchange="orders", exchange_type="fanout", durable=True)
${queues.map((q) => `ch.queue_declare(queue="${q}", durable=True)\nch.queue_bind(exchange="orders", queue="${q}")`).join("\n")}
`);

const ORDER = script(`ch.basic_publish(exchange="orders", routing_key="", body=b"order 1001")`);

/** A service that reads `queue`, prints and acks. */
const service = (name: string, queue: string) => `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def handle(ch, method, properties, body):
    print(f" [${name}] {body.decode()}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_consume(queue="${queue}", on_message_callback=handle)
ch.start_consuming()`;

const FILES: Files = { "setup.py": ordersSetup(["email", "sms"]), "order.py": ORDER };

/** Free play: email and SMS subscribed to `orders`. */
export const FREE = projectAfter(FILES, ["python setup.py"]);

/** One message went from `orders` into every one of `inQ` and none of `outQ`. */
const fannedTo = (ctx: RabbitCtx, inQ: string[], outQ: string[] = []) =>
  eventsOf(ctx, "routed").some((e) => e.exchange === "orders" && inQ.every((q) => e.queues.includes(q)) && outQ.every((q) => !e.queues.includes(q)));

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "new-subscriber",
    title: l("Yeni abone", "A new subscriber"),
    story: l(
      "Analitik ekibi her siparişi kendi `analytics` kuyruğunda görmek istiyor. Sipariş servisi (`order.py`) başka bir ekibin; ona dokunulmadan e-posta ve SMS de eskisi gibi almaya devam etmeli.",
      "The analytics team wants every order in its own `analytics` queue. The order service (`order.py`) belongs to another team; without touching it, email and SMS must keep getting orders as before.",
    ),
    goal: l("Bir sonraki sipariş `email`, `sms` **ve** `analytics`'e gitsin; `order.py` değişmesin.", "The next order reaches `email`, `sms` **and** `analytics`; `order.py` stays unchanged."),
    start: projectAfter(FILES, ["python setup.py"]),
    hints: [
      l("Fanout exchange her mesajın kopyasını bağlı **her** kuyruğa koyar. Yeni abone = yeni kuyruk + yeni binding.", "A fanout exchange copies each message into **every** bound queue. A new subscriber is a new queue plus a new binding."),
      l("`setup.py`'ye `analytics` için bir `queue_declare` ve bir `queue_bind` ekle; gönderen tarafa dokunma.", "Add a `queue_declare` and a `queue_bind` for `analytics` to `setup.py`; leave the sender alone."),
      l(
        "`nano setup.py` (ekle: `ch.queue_declare(queue=\"analytics\", durable=True)` ve `ch.queue_bind(exchange=\"orders\", queue=\"analytics\")`), `python setup.py`, `python order.py`",
        "`nano setup.py` (add: `ch.queue_declare(queue=\"analytics\", durable=True)` and `ch.queue_bind(exchange=\"orders\", queue=\"analytics\")`), `python setup.py`, `python order.py`",
      ),
    ],
    par: 3,
    check: (ctx) => fannedTo(ctx, ["email", "sms", "analytics"]) && ctx.project.files["order.py"] === ctx.startProject.files["order.py"],
  },
  {
    id: "sms-off",
    title: l("SMS kapanıyor", "SMS switched off"),
    story: l(
      "SMS sağlayıcısıyla sözleşme bugün bitti. `sms` kuyruğunda artık kimsenin okumayacağı siparişler birikiyor. Kuyruk kalsın (eski mesajlar denetim için lazım) ama yeni sipariş almasın; e-posta etkilenmesin.",
      "The contract with the SMS provider ended today. Orders nobody will ever read are piling up in `sms`. The queue stays (the old messages are needed for an audit), but it gets no new orders; email isn't affected.",
    ),
    goal: l("Bir sonraki sipariş `email`'e gitsin, `sms`'e **gitmesin**; `sms` kuyruğu silinmesin.", "The next order reaches `email` and **not** `sms`; the `sms` queue isn't deleted."),
    start: projectAfter(FILES, ["python setup.py", "python order.py"]),
    hints: [
      l(
        "Dikkat: `setup.py`'den binding satırını silip tekrar çalıştırmak var olan binding'i kaldırmaz. Declare ve bind sadece ekler.",
        "Careful: deleting the bind line from `setup.py` and running it again doesn't remove the existing binding. Declare and bind only ever add.",
      ),
      l("Binding'i kaldıran çağrı `queue_unbind`.", "The call that removes a binding is `queue_unbind`."),
      l(
        "`nano setup.py` (`ch.queue_bind(exchange=\"orders\", queue=\"sms\")` → `ch.queue_unbind(exchange=\"orders\", queue=\"sms\")`), `python setup.py`, `python order.py`",
        "`nano setup.py` (`ch.queue_bind(exchange=\"orders\", queue=\"sms\")` → `ch.queue_unbind(exchange=\"orders\", queue=\"sms\")`), `python setup.py`, `python order.py`",
      ),
    ],
    par: 3,
    check: (ctx) => fannedTo(ctx, ["email"], ["sms"]) && Boolean(ctx.state.queues.sms),
  },
  {
    id: "own-queue",
    title: l("Kendi kuyruğu", "Its own queue"),
    story: l(
      "Yeni bildirim servisi `push.py` her siparişte telefona bildirim gönderecek. Geliştirici onu `email` kuyruğunu dinleyecek şekilde yazmış: artık siparişlerin yarısı e-posta, yarısı bildirim alıyor, hiçbiri ikisini birden almıyor.",
      "The new notification service `push.py` should send a phone notification for every order. Its developer wrote it to listen to the `email` queue: now half the orders get an email and half a notification, none gets both.",
    ),
    goal: l("Bir sonraki sipariş hem e-posta servisine hem bildirim servisine teslim edilsin.", "The next order is delivered to both the email service and the notification service."),
    start: projectAfter({ ...FILES, "mailer.py": service("email", "email"), "push.py": service("push", "email") }, ["python setup.py", "python mailer.py", "python push.py"]),
    hints: [
      l(
        "Aynı kuyruğu dinleyen iki servis işi **bölüşür**; her mesaj birine gider. Her abonenin kendi kuyruğu olmalı.",
        "Two services on the same queue **share** the work; each message goes to one of them. Every subscriber needs its own queue.",
      ),
      l(
        "`push.py` kendi kuyruğunu tanımlasın, `orders`'a bağlasın ve onu dinlesin. Sonra eskisini durdurup yenisini başlat.",
        "Have `push.py` declare its own queue, bind it to `orders` and listen to it. Then stop the old one and start the new one.",
      ),
      l(
        "`nano push.py` (`basic_consume`'dan önce: `ch.queue_declare(queue=\"push\", durable=True)` ve `ch.queue_bind(exchange=\"orders\", queue=\"push\")`; `basic_consume(queue=\"push\", …)`), `pkill -f push.py`, `python push.py`, `python order.py`",
        "`nano push.py` (before `basic_consume`: `ch.queue_declare(queue=\"push\", durable=True)` and `ch.queue_bind(exchange=\"orders\", queue=\"push\")`; `basic_consume(queue=\"push\", …)`), `pkill -f push.py`, `python push.py`, `python order.py`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const delivered = eventsOf(ctx, "delivered");
      return delivered.some((d) => d.tag === "mailer" && delivered.some((p) => p.id === d.id && p.tag.startsWith("push") && p.queue !== "email"));
    },
  },
  {
    id: "key-ignored",
    title: l("Key'e bakmıyor", "It ignores the key"),
    story: l(
      "Pazarlama bir bülteni sadece e-posta abonelerine göndermek istedi. Bir arkadaşın `newsletter.py`'yi `orders`'a `routing_key=\"email\"` ile gönderecek şekilde yazdı, ama SMS müşterileri de bülteni aldı. Abonelikleri bozmak yok: siparişler eskisi gibi akmalı.",
      "Marketing wanted to send a newsletter to email subscribers only. A colleague wrote `newsletter.py` to send it to `orders` with `routing_key=\"email\"`, but SMS customers got it too. No touching the subscriptions: orders must keep flowing as before.",
    ),
    goal: l("Bülten sadece `email` kuyruğuna gitsin, `sms`'e gitmesin; hiçbir binding değişmesin.", "The newsletter reaches only the `email` queue, not `sms`; no binding changes."),
    start: projectAfter(
      { ...FILES, "newsletter.py": script(`ch.basic_publish(exchange="orders", routing_key="email", body=b"newsletter: winter sale")`) },
      ["python setup.py"],
    ),
    hints: [
      l("Fanout routing key'e hiç bakmaz: `orders`'a giden her mesaj bağlı her kuyruğa kopyalanır.", "Fanout never looks at the routing key: every message sent to `orders` is copied into every bound queue."),
      l(
        "Tek bir kuyruğa göndermek için `orders`'ı atla: default exchange (`\"\"`) mesajı adı routing key olan kuyruğa koyar.",
        "To reach one queue, skip `orders`: the default exchange (`\"\"`) puts a message into the queue named by the routing key.",
      ),
      l("`nano newsletter.py` (`exchange=\"orders\"` → `exchange=\"\"`), `python newsletter.py`", "`nano newsletter.py` (`exchange=\"orders\"` → `exchange=\"\"`), `python newsletter.py`"),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.message.body.startsWith("newsletter") && e.queues.includes("email") && !e.queues.includes("sms")) &&
      !eventsOf(ctx, "routed").some((e) => e.message.body.startsWith("newsletter") && e.queues.includes("sms")) &&
      ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
