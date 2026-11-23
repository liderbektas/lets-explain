import { l } from "@lets-explain/core/i18n";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { CONNECT, eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** setup.js: an `orders` fanout exchange with these queues declared and bound. */
export const ordersSetup = (queues: string[]) =>
  script(`
await ch.assertExchange("orders", "fanout");
${queues.map((q) => `await ch.assertQueue("${q}");\nawait ch.bindQueue("${q}", "orders", "");`).join("\n")}
`);

const ORDER = script(`ch.publish("orders", "", Buffer.from("order 1001"));`);

/** A service that reads `queue`, prints and acks. */
const service = (name: string, queue: string) => `${CONNECT}
await ch.consume("${queue}", (msg) => {
  console.log(\` [${name}] \${msg.content}\`);
  ch.ack(msg);
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

const FILES: Files = { "setup.js": ordersSetup(["email", "sms"]), "order.js": ORDER };

/** Free play: email and SMS subscribed to `orders`. */
export const FREE = projectAfter(FILES, ["node setup.js"]);

/** One message went from `orders` into every one of `inQ` and none of `outQ`. */
const fannedTo = (ctx: RabbitCtx, inQ: string[], outQ: string[] = []) =>
  eventsOf(ctx, "routed").some((e) => e.exchange === "orders" && inQ.every((q) => e.queues.includes(q)) && outQ.every((q) => !e.queues.includes(q)));

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "new-subscriber",
    title: l("Yeni abone", "A new subscriber"),
    story: l(
      "Analitik ekibi her siparişi kendi `analytics` kuyruğunda görmek istiyor. Sipariş servisi (`order.js`) başka bir ekibin; ona dokunulmadan e-posta ve SMS de eskisi gibi almaya devam etmeli.",
      "The analytics team wants every order in its own `analytics` queue. The order service (`order.js`) belongs to another team; without touching it, email and SMS must keep getting orders as before.",
    ),
    goal: l("Bir sonraki sipariş `email`, `sms` **ve** `analytics`'e gitsin; `order.js` değişmesin.", "The next order reaches `email`, `sms` **and** `analytics`; `order.js` stays unchanged."),
    start: projectAfter(FILES, ["node setup.js"]),
    hints: [
      l("Fanout exchange her mesajın kopyasını bağlı **her** kuyruğa koyar. Yeni abone = yeni kuyruk + yeni binding.", "A fanout exchange copies each message into **every** bound queue. A new subscriber is a new queue plus a new binding."),
      l("`setup.js`'ye `analytics` için bir `assertQueue` ve bir `bindQueue` ekle; gönderen tarafa dokunma.", "Add an `assertQueue` and a `bindQueue` for `analytics` to `setup.js`; leave the sender alone."),
      l(
        "`nano setup.js` (ekle: `await ch.assertQueue(\"analytics\");` ve `await ch.bindQueue(\"analytics\", \"orders\", \"\");`), `node setup.js`, `node order.js`",
        "`nano setup.js` (add: `await ch.assertQueue(\"analytics\");` and `await ch.bindQueue(\"analytics\", \"orders\", \"\");`), `node setup.js`, `node order.js`",
      ),
    ],
    par: 3,
    check: (ctx) => fannedTo(ctx, ["email", "sms", "analytics"]) && ctx.project.files["order.js"] === ctx.startProject.files["order.js"],
  },
  {
    id: "sms-off",
    title: l("SMS kapanıyor", "SMS switched off"),
    story: l(
      "SMS sağlayıcısıyla sözleşme bugün bitti. `sms` kuyruğunda artık kimsenin okumayacağı siparişler birikiyor. Kuyruk kalsın (eski mesajlar denetim için lazım) ama yeni sipariş almasın; e-posta etkilenmesin.",
      "The contract with the SMS provider ended today. Orders nobody will ever read are piling up in `sms`. The queue stays (the old messages are needed for an audit), but it gets no new orders; email isn't affected.",
    ),
    goal: l("Bir sonraki sipariş `email`'e gitsin, `sms`'e **gitmesin**; `sms` kuyruğu silinmesin.", "The next order reaches `email` and **not** `sms`; the `sms` queue isn't deleted."),
    start: projectAfter(FILES, ["node setup.js", "node order.js"]),
    hints: [
      l(
        "Dikkat: `setup.js`'den binding satırını silip tekrar çalıştırmak var olan binding'i kaldırmaz. Declare ve bind sadece ekler.",
        "Careful: deleting the bind line from `setup.js` and running it again doesn't remove the existing binding. Declare and bind only ever add.",
      ),
      l("Binding'i kaldıran çağrı `unbindQueue`.", "The call that removes a binding is `unbindQueue`."),
      l(
        "`nano setup.js` (`ch.bindQueue(\"sms\", \"orders\", \"\")` → `ch.unbindQueue(\"sms\", \"orders\", \"\")`), `node setup.js`, `node order.js`",
        "`nano setup.js` (`ch.bindQueue(\"sms\", \"orders\", \"\")` → `ch.unbindQueue(\"sms\", \"orders\", \"\")`), `node setup.js`, `node order.js`",
      ),
    ],
    par: 3,
    check: (ctx) => fannedTo(ctx, ["email"], ["sms"]) && Boolean(ctx.state.queues.sms),
  },
  {
    id: "own-queue",
    title: l("Kendi kuyruğu", "Its own queue"),
    story: l(
      "Yeni bildirim servisi `push.js` her siparişte telefona bildirim gönderecek. Geliştirici onu `email` kuyruğunu dinleyecek şekilde yazmış: artık siparişlerin yarısı e-posta, yarısı bildirim alıyor, hiçbiri ikisini birden almıyor.",
      "The new notification service `push.js` should send a phone notification for every order. Its developer wrote it to listen to the `email` queue: now half the orders get an email and half a notification, none gets both.",
    ),
    goal: l("Bir sonraki sipariş hem e-posta servisine hem bildirim servisine teslim edilsin.", "The next order is delivered to both the email service and the notification service."),
    start: projectAfter({ ...FILES, "mailer.js": service("email", "email"), "push.js": service("push", "email") }, ["node setup.js", "node mailer.js", "node push.js"]),
    hints: [
      l(
        "Aynı kuyruğu dinleyen iki servis işi **bölüşür**; her mesaj birine gider. Her abonenin kendi kuyruğu olmalı.",
        "Two services on the same queue **share** the work; each message goes to one of them. Every subscriber needs its own queue.",
      ),
      l(
        "`push.js` kendi kuyruğunu tanımlasın, `orders`'a bağlasın ve onu dinlesin. Sonra eskisini durdurup yenisini başlat.",
        "Have `push.js` declare its own queue, bind it to `orders` and listen to it. Then stop the old one and start the new one.",
      ),
      l(
        "`nano push.js` (`ch.consume`'dan önce: `await ch.assertQueue(\"push\");` ve `await ch.bindQueue(\"push\", \"orders\", \"\");`; `ch.consume(\"push\", …)`), `pkill -f push.js`, `node push.js`, `node order.js`",
        "`nano push.js` (before `ch.consume`: `await ch.assertQueue(\"push\");` and `await ch.bindQueue(\"push\", \"orders\", \"\");`; `ch.consume(\"push\", …)`), `pkill -f push.js`, `node push.js`, `node order.js`",
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
      "Pazarlama bir bülteni sadece e-posta abonelerine göndermek istedi. Bir arkadaşın `newsletter.js`'yi `orders`'a routing key `\"email\"` ile gönderecek şekilde yazdı, ama SMS müşterileri de bülteni aldı. Abonelikleri bozmak yok: siparişler eskisi gibi akmalı.",
      "Marketing wanted to send a newsletter to email subscribers only. A colleague wrote `newsletter.js` to send it to `orders` with the routing key `\"email\"`, but SMS customers got it too. No touching the subscriptions: orders must keep flowing as before.",
    ),
    goal: l("Bülten sadece `email` kuyruğuna gitsin, `sms`'e gitmesin; hiçbir binding değişmesin.", "The newsletter reaches only the `email` queue, not `sms`; no binding changes."),
    start: projectAfter(
      { ...FILES, "newsletter.js": script(`ch.publish("orders", "email", Buffer.from("newsletter: winter sale"));`) },
      ["node setup.js"],
    ),
    hints: [
      l("Fanout routing key'e hiç bakmaz: `orders`'a giden her mesaj bağlı her kuyruğa kopyalanır.", "Fanout never looks at the routing key: every message sent to `orders` is copied into every bound queue."),
      l(
        "Tek bir kuyruğa göndermek için `orders`'ı atla: default exchange (`\"\"`) mesajı adı routing key olan kuyruğa koyar.",
        "To reach one queue, skip `orders`: the default exchange (`\"\"`) puts a message into the queue named by the routing key.",
      ),
      l(
        "`nano newsletter.js` (`ch.publish(\"orders\",` → `ch.publish(\"\",`), `node newsletter.js`",
        "`nano newsletter.js` (`ch.publish(\"orders\",` → `ch.publish(\"\",`), `node newsletter.js`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.message.body.startsWith("newsletter") && e.queues.includes("email") && !e.queues.includes("sms")) &&
      !eventsOf(ctx, "routed").some((e) => e.message.body.startsWith("newsletter") && e.queues.includes("sms")) &&
      ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
