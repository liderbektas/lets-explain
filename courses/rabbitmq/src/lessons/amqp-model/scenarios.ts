import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** setup.js for the shop: a `shop` direct exchange, `billing` and `shipping` queues, and the given bindings. */
export const shopSetup = (bindings: [queue: string, key: string][]) =>
  script(`
await ch.assertExchange("shop", "direct");
await ch.assertQueue("billing");
await ch.assertQueue("shipping");
${bindings.map(([q, k]) => `await ch.bindQueue("${q}", "shop", "${k}");`).join("\n")}
`);

const PAY = script(`ch.publish("shop", "order.paid", Buffer.from("order 1001 paid"));`);

/** Free play: the shop with no bindings yet. */
export const FREE = projectAfter({ "setup.js": shopSetup([]), "pay.js": PAY }, ["node setup.js"]);

/** A message with this key went through the `shop` exchange into all these queues at once. */
const routedVia = (ctx: RabbitCtx, exchange: string, key: string, queues: string[]) =>
  eventsOf(ctx, "routed").some((e) => e.exchange === exchange && e.routingKey === key && queues.every((q) => e.queues.includes(q)));

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "no-payments",
    title: l("Ödeme gelmiyor", "No payments"),
    story: l(
      "Yeni kurulum dün canlıya çıktı ve fatura ekibi o zamandan beri tek bir ödeme görmedi. Ödeme servisi (`pay.js`) mesajları `shop` exchange'ine `order.paid` key'iyle gönderiyor. Kurulum `setup.js`'de.",
      "The new setup went live yesterday and the billing team hasn't seen a single payment since. The payment service (`pay.js`) sends to the `shop` exchange with the key `order.paid`. The setup lives in `setup.js`.",
    ),
    goal: l("`pay.js`'nin mesajı `shop` exchange'i üzerinden `billing` kuyruğuna ulaşsın.", "The message from `pay.js` reaches the `billing` queue through the `shop` exchange."),
    start: projectAfter({ "setup.js": shopSetup([]), "pay.js": PAY }, ["node setup.js"]),
    hints: [
      l(
        "`rabbitmqctl list_bindings source_name destination_name routing_key` ile bak: `shop` hiçbir kuyruğa bağlı değil. Exchange, kuralı olmayan kuyruğa mesaj koymaz.",
        "Look with `rabbitmqctl list_bindings source_name destination_name routing_key`: `shop` isn't bound to any queue. An exchange never puts a message into a queue it has no rule for.",
      ),
      l("Eksik olan bir binding: `setup.js`'ye bir `bindQueue` ekle ve kurulumu yeniden çalıştır.", "What's missing is a binding: add a `bindQueue` to `setup.js` and run the setup again."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"billing\", \"shop\", \"order.paid\");`), `node setup.js`, `node pay.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"billing\", \"shop\", \"order.paid\");`), `node setup.js`, `node pay.js`",
      ),
    ],
    par: 3,
    check: (ctx) => routedVia(ctx, "shop", "order.paid", ["billing"]),
  },
  {
    id: "pack-on-payment",
    title: l("Ödenince paketle", "Pack when paid"),
    story: l(
      "Depo, sipariş ödenir ödenmez paketlemeye başlamak istiyor. Şu an `order.paid` sadece `billing`'e gidiyor. Ödeme servisi aynı mesajı iki kere göndermek zorunda kalmamalı.",
      "The warehouse wants to start packing as soon as an order is paid. Right now `order.paid` only goes to `billing`. The payment service shouldn't have to send the same message twice.",
    ),
    goal: l("**Tek bir** `order.paid` mesajı hem `billing`'e hem `shipping`'e gitsin.", "**One** `order.paid` message goes to both `billing` and `shipping`."),
    start: projectAfter({ "setup.js": shopSetup([["billing", "order.paid"]]), "pay.js": PAY }, ["node setup.js"]),
    hints: [
      l("Aynı key ile birden fazla kuyruk bağlanabilir; exchange her birine kendi kopyasını koyar.", "Several queues can be bound with the same key; the exchange puts a copy into each."),
      l("`shipping`'i de `order.paid` ile bağla; `pay.js`'ye dokunmana gerek yok.", "Bind `shipping` with `order.paid` too; you don't need to touch `pay.js`."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"shipping\", \"shop\", \"order.paid\");`), `node setup.js`, `node pay.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"shipping\", \"shop\", \"order.paid\");`), `node setup.js`, `node pay.js`",
      ),
    ],
    par: 3,
    check: (ctx) => routedVia(ctx, "shop", "order.paid", ["billing", "shipping"]),
  },
  {
    id: "refused-declare",
    title: l("Reddedilen declare", "The refused declare"),
    story: l(
      "Fatura servisini (`invoice.js`) başka bir geliştirici yazdı ve servis açılır açılmaz `PRECONDITION_FAILED` hatasıyla çöküyor. Kuyruk `setup.js`'de kalıcı (durable) olarak tanımlı ve içinde bekleyen işler var; silinmemeli.",
      "Another developer wrote the invoicing service (`invoice.js`), and it crashes on startup with `PRECONDITION_FAILED`. The queue is declared durable in `setup.js` and has work waiting in it; it must not be deleted.",
    ),
    goal: l("`invoice.js` hatasız çalışsın ve mesajı `billing`'e ulaşsın; `billing` durable kalsın.", "`invoice.js` runs without an error and its message reaches `billing`; `billing` stays durable."),
    start: projectAfter(
      {
        "setup.js": shopSetup([["billing", "order.paid"]]),
        "invoice.js": script(`
await ch.assertQueue("billing", { durable: false });
ch.publish("shop", "order.paid", Buffer.from("invoice 77"));
`),
      },
      ["node setup.js"],
    ),
    hints: [
      l(
        "`node invoice.js` çalıştırıp hatayı oku: aynı kuyruğu farklı ayarlarla tekrar declare etmek reddedilir. Aynı ayarlarla declare etmek ise zararsızdır.",
        "Run `node invoice.js` and read the error: declaring the same queue again with other settings is refused. Declaring it with the same settings is harmless.",
      ),
      l(
        "`invoice.js`'deki declare, `setup.js`'dekiyle aynı ayarı taşımalı: `durable: true` (amqplib'in varsayılanı da bu).",
        "The declare in `invoice.js` must carry the same setting as the one in `setup.js`: `durable: true` (amqplib's default, too).",
      ),
      l(
        "`nano invoice.js` (`{ durable: false }` → `{ durable: true }`), `node invoice.js`",
        "`nano invoice.js` (`{ durable: false }` → `{ durable: true }`), `node invoice.js`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.message.body === "invoice 77" && e.queues.includes("billing")) && ctx.state.queues.billing?.durable === true,
  },
  {
    id: "straight-to-queue",
    title: l("Doğrudan kuyruğa", "Straight to the queue"),
    story: l(
      "Depo ekibi `shipping` kuyruğunu dinleyen işçiyi denemek istiyor. `test_ship.js` bir test mesajı gönderiyor ama mesaj kayboluyor. Binding'lerle oynamak yasak: canlı trafiği etkiler.",
      "The warehouse team wants to try the worker that listens to `shipping`. `test_ship.js` sends a test message, but it gets lost. Touching the bindings is off limits: it would affect live traffic.",
    ),
    goal: l("Test mesajı `shipping` kuyruğuna ulaşsın; hiçbir binding eklenmesin.", "The test message reaches the `shipping` queue, with no binding added."),
    start: projectAfter(
      {
        "setup.js": shopSetup([["billing", "order.paid"]]),
        "test_ship.js": script(`ch.publish("shop", "shipping", Buffer.from("test parcel"));`),
      },
      ["node setup.js"],
    ),
    hints: [
      l(
        "`shop` exchange'inde `shipping` diye bir key bağlı değil. Ama her kuyruk, adıyla **default exchange**'e (adı boş: `\"\"`) kendiliğinden bağlıdır.",
        "No `shipping` key is bound on the `shop` exchange. But every queue is bound by its own name to the **default exchange** (the one with an empty name: `\"\"`).",
      ),
      l("Mesajı default exchange'e, routing key olarak kuyruğun adıyla gönder.", "Send the message to the default exchange, with the queue's name as the routing key."),
      l(
        "`nano test_ship.js` (`ch.publish(\"shop\",` → `ch.publish(\"\",`), `node test_ship.js`",
        "`nano test_ship.js` (`ch.publish(\"shop\",` → `ch.publish(\"\",`), `node test_ship.js`",
      ),
    ],
    par: 2,
    check: (ctx) => routedVia(ctx, "", "shipping", ["shipping"]) && ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
