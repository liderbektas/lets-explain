import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

const PERSISTENT = "{ persistent: true }";

/** setup.js with `orders` declared the given way. */
export const ordersSetup = (declare: string) => script(declare);

const send = (queue: string, body: string, persistent: boolean) =>
  script(`ch.sendToQueue("${queue}", Buffer.from("${body}")${persistent ? `, ${PERSISTENT}` : ""});`);

/** Free play: an empty broker, a setup that declares `jobs` and two senders. */
export const FREE = projectAfter({
  "setup.js": ordersSetup(`await ch.assertQueue("jobs");`),
  "send.js": send("jobs", "job-1", false),
  "send_persistent.js": send("jobs", "job-2", true),
});

/* ----------------------------------------------------------------- checks */

/** Index of the last broker restart in the run, or -1. */
const lastRestart = (ctx: RabbitCtx) => ctx.events.map((evs) => evs.some((e) => e.type === "restarted")).lastIndexOf(true);

/** Bodies waiting in a queue at the end. */
const bodiesIn = (ctx: RabbitCtx, queue: string) => (ctx.state.queues[queue]?.ready ?? []).map((m) => m.body);

/** A message with this body reached the queue before the last restart, and is still there after it. */
function keptThroughRestart(ctx: RabbitCtx, queue: string, body: string): boolean {
  const r = lastRestart(ctx);
  if (r < 0) return false;
  const sentBefore = ctx.events.slice(0, r).some((evs) => evs.some((e) => e.type === "routed" && e.queues.includes(queue) && e.message.body === body));
  return sentBefore && bodiesIn(ctx, queue).includes(body);
}

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "queue-vanished",
    title: l("Kuyruk kayboldu", "The queue vanished"),
    story: l(
      "Dün gece bakım için yapılan bir restart'tan sonra `orders` kuyruğu içindekilerle birlikte yok oldu. `setup.js`'ye bakınca sebep belli: kuyruk `durable: false` ile tanımlanmış. Gönderen `order.js` zaten persistent mesaj yolluyor.",
      "After last night's maintenance restart, the `orders` queue was gone, along with everything in it. One look at `setup.js` shows why: the queue is declared with `durable: false`. The sender, `order.js`, already sends persistent messages.",
    ),
    goal: l(
      "Bir sipariş gönder, broker'ı yeniden başlat (`docker restart rabbitmq`): restart'tan sonra `orders` yerinde dursun ve sipariş içinde olsun.",
      "Send an order and restart the broker (`docker restart rabbitmq`): afterwards `orders` still exists with the order in it.",
    ),
    start: projectAfter(
      { "setup.js": ordersSetup(`await ch.assertQueue("orders", { durable: false });`), "order.js": send("orders", "order-1001", true) },
      ["node setup.js"],
    ),
    hints: [
      l(
        "`rabbitmqctl list_queues name durable` ile bak. amqplib'de `durable` varsayılan olarak `true`'dur, ama burada açıkça `false` yazılmış. Var olan bir kuyruğun ayarı yeniden tanımlayarak değişmez: RabbitMQ 406 PRECONDITION_FAILED der.",
        "Look with `rabbitmqctl list_queues name durable`. In amqplib `durable` defaults to `true`, but here it is set to `false` on purpose. Declaring an existing queue again does not change its settings: RabbitMQ answers 406 PRECONDITION_FAILED.",
      ),
      l(
        "`setup.js`'de `durable: true` yap, eski kuyruğu `rabbitmqctl delete_queue orders` ile sil (boş, kaybedecek bir şey yok), kurulumu yeniden çalıştır; sonra gönder ve restart et.",
        "Make it `durable: true` in `setup.js`, delete the old queue with `rabbitmqctl delete_queue orders` (it is empty, nothing to lose), run the setup again; then send and restart.",
      ),
      l(
        "`nano setup.js` (`{ durable: false }` → `{ durable: true }`), `rabbitmqctl delete_queue orders`, `node setup.js`, `node order.js`, `docker restart rabbitmq`",
        "`nano setup.js` (`{ durable: false }` → `{ durable: true }`), `rabbitmqctl delete_queue orders`, `node setup.js`, `node order.js`, `docker restart rabbitmq`",
      ),
    ],
    par: 5,
    check: (ctx) => Boolean(ctx.state.queues.orders?.durable) && keptThroughRestart(ctx, "orders", "order-1001"),
  },
  {
    id: "empty-after-restart",
    title: l("Kuyruk var, içi boş", "Queue there, empty"),
    story: l(
      "Bu sefer `orders` durable ve restart'tan sağ çıkıyor, ama içi hep boş geliyor: restart öncesi bekleyen siparişler kayboluyor. `order.js`'ye bir bak.",
      "This time `orders` is durable and survives restarts, but it always comes back empty: the orders waiting before the restart are lost. Have a look at `order.js`.",
    ),
    goal: l("`order.js`'nin gönderdiği sipariş bir broker restart'ından sonra `orders`'ta dursun.", "The order sent by `order.js` is still in `orders` after a broker restart."),
    start: projectAfter(
      { "setup.js": ordersSetup(`await ch.assertQueue("orders");`), "order.js": send("orders", "order-1002", false) },
      ["node setup.js"],
    ),
    hints: [
      l("Durable kuyruk sadece kuyruğun **tanımını** korur. Mesajın kendisinin diske yazılmasını gönderen seçer.", "A durable queue only keeps the queue's **definition**. Whether a message is written to disk is the sender's choice."),
      l(
        "`sendToQueue`'ya seçenek olarak `{ persistent: true }` ver.",
        "Pass `{ persistent: true }` as the options of `sendToQueue`.",
      ),
      l(
        "`nano order.js` (persistent yap), `node order.js`, `docker restart rabbitmq`",
        "`nano order.js` (make it persistent), `node order.js`, `docker restart rabbitmq`",
      ),
    ],
    par: 3,
    check: (ctx) => keptThroughRestart(ctx, "orders", "order-1002"),
  },
  {
    id: "quorum-payments",
    title: l("Ödemeler için quorum", "Quorum for payments"),
    story: l(
      "Ödeme ekibi yeni bir `payments` kuyruğu istiyor ve hiçbir ödemenin restart'ta kaybolmasını istemiyor. Ödemeleri gönderen `pay.js`'ye dokunamıyorsun: mesajları persistent işaretlemiyor.",
      "The payments team wants a new `payments` queue and no payment may ever be lost in a restart. You can't touch `pay.js`, which sends the payments: it doesn't mark them persistent.",
    ),
    goal: l(
      "`payments` bir **quorum** kuyruğu olsun; `pay.js`'nin gönderdiği ödeme bir restart'tan sonra içinde dursun, `pay.js` değişmesin.",
      "`payments` is a **quorum** queue; the payment sent by `pay.js` is still in it after a restart, with `pay.js` unchanged.",
    ),
    start: projectAfter(
      { "setup.js": ordersSetup(`await ch.assertQueue("orders");`), "pay.js": send("payments", "payment-77", false) },
      ["node setup.js"],
    ),
    hints: [
      l("Quorum kuyruğu her mesajı diske yazar ve kopyalar; mesajın persistent olup olmamasına bakmaz.", "A quorum queue writes and replicates every message, whatever the message's own persistence."),
      l(
        "`setup.js`'ye `await ch.assertQueue(\"payments\", { arguments: { \"x-queue-type\": \"quorum\" } });` ekle.",
        "Add `await ch.assertQueue(\"payments\", { arguments: { \"x-queue-type\": \"quorum\" } });` to `setup.js`.",
      ),
      l(
        "`nano setup.js` (quorum `payments` ekle), `node setup.js`, `node pay.js`, `docker restart rabbitmq`",
        "`nano setup.js` (add the quorum `payments`), `node setup.js`, `node pay.js`, `docker restart rabbitmq`",
      ),
    ],
    par: 4,
    check: (ctx) =>
      ctx.state.queues.payments?.type === "quorum" &&
      keptThroughRestart(ctx, "payments", "payment-77") &&
      ctx.project.files["pay.js"] === ctx.startProject.files["pay.js"],
  },
  {
    id: "cap-by-policy",
    title: l("Kodsuz sınır", "A cap without code"),
    story: l(
      "Geçen hafta tüketici çöktü ve `orders` milyonlarca mesajla şişip broker'ın belleğini bitirdi. Kuyruk canlıda duruyor ve doluyor; bugün deploy yok, yani `setup.js` değişemez.",
      "Last week the consumer died and `orders` ballooned to millions of messages until the broker ran out of memory. The queue is live and in use; there's no deploy today, so `setup.js` can't change.",
    ),
    goal: l(
      "`orders`'ta en fazla **2** mesaj beklesin: `burst.js`'nin 3 siparişinden sonra kuyrukta 2 mesaj kalsın. `setup.js` değişmesin.",
      "`orders` holds at most **2** waiting messages: after `burst.js`'s 3 orders, 2 are left in the queue. `setup.js` stays unchanged.",
    ),
    start: projectAfter(
      {
        "setup.js": ordersSetup(`await ch.assertQueue("orders");`),
        "burst.js": script(`for (const n of ["o1", "o2", "o3"]) {\n  ch.sendToQueue("orders", Buffer.from(n), ${PERSISTENT});\n}`),
      },
      ["node setup.js"],
    ),
    hints: [
      l(
        "Var olan bir kuyruğun `x-max-length` argümanı sonradan değişmez, ama bir **policy** çalışan kuyruğa da uygulanır.",
        "An existing queue's `x-max-length` argument can't change later, but a **policy** applies to a running queue too.",
      ),
      l(
        "`rabbitmqctl set_policy <ad> <kuyruk-deseni> '<json>' --apply-to queues`, JSON'da `max-length`.",
        "`rabbitmqctl set_policy <name> <queue-pattern> '<json>' --apply-to queues`, with `max-length` in the JSON.",
      ),
      l(
        "`rabbitmqctl set_policy max-orders \"^orders$\" '{\"max-length\":2}' --apply-to queues`, `node burst.js`",
        "`rabbitmqctl set_policy max-orders \"^orders$\" '{\"max-length\":2}' --apply-to queues`, `node burst.js`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").filter((e) => e.queues.includes("orders")).length >= 3 &&
      (ctx.state.queues.orders?.ready.length ?? 0) === 2 &&
      ctx.project.files["setup.js"] === ctx.startProject.files["setup.js"],
  },
];
