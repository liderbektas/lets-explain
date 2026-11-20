import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** setup.py for the shop: a `shop` direct exchange, `billing` and `shipping` queues, and the given bindings. */
export const shopSetup = (bindings: [queue: string, key: string][]) =>
  script(`
ch.exchange_declare(exchange="shop", exchange_type="direct", durable=True)
ch.queue_declare(queue="billing", durable=True)
ch.queue_declare(queue="shipping", durable=True)
${bindings.map(([q, k]) => `ch.queue_bind(queue="${q}", exchange="shop", routing_key="${k}")`).join("\n")}
`);

const PAY = script(`ch.basic_publish(exchange="shop", routing_key="order.paid", body=b"order 1001 paid")`);

/** Free play: the shop with no bindings yet. */
export const FREE = projectAfter({ "setup.py": shopSetup([]), "pay.py": PAY }, ["python setup.py"]);

/** A message with this key went through the `shop` exchange into all these queues at once. */
const routedVia = (ctx: RabbitCtx, exchange: string, key: string, queues: string[]) =>
  eventsOf(ctx, "routed").some((e) => e.exchange === exchange && e.routingKey === key && queues.every((q) => e.queues.includes(q)));

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "no-payments",
    title: l("Ödeme gelmiyor", "No payments"),
    story: l(
      "Yeni kurulum dün canlıya çıktı ve fatura ekibi o zamandan beri tek bir ödeme görmedi. Ödeme servisi (`pay.py`) mesajları `shop` exchange'ine `order.paid` key'iyle gönderiyor. Kurulum `setup.py`'de.",
      "The new setup went live yesterday and the billing team hasn't seen a single payment since. The payment service (`pay.py`) sends to the `shop` exchange with the key `order.paid`. The setup lives in `setup.py`.",
    ),
    goal: l("`pay.py`'nin mesajı `shop` exchange'i üzerinden `billing` kuyruğuna ulaşsın.", "The message from `pay.py` reaches the `billing` queue through the `shop` exchange."),
    start: projectAfter({ "setup.py": shopSetup([]), "pay.py": PAY }, ["python setup.py"]),
    hints: [
      l(
        "`rabbitmqctl list_bindings source_name destination_name routing_key` ile bak: `shop` hiçbir kuyruğa bağlı değil. Exchange, kuralı olmayan kuyruğa mesaj koymaz.",
        "Look with `rabbitmqctl list_bindings source_name destination_name routing_key`: `shop` isn't bound to any queue. An exchange never puts a message into a queue it has no rule for.",
      ),
      l("Eksik olan bir binding: `setup.py`'ye `queue_bind` ekle ve kurulumu yeniden çalıştır.", "What's missing is a binding: add a `queue_bind` to `setup.py` and run the setup again."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"billing\", exchange=\"shop\", routing_key=\"order.paid\")`), `python setup.py`, `python pay.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"billing\", exchange=\"shop\", routing_key=\"order.paid\")`), `python setup.py`, `python pay.py`",
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
    start: projectAfter({ "setup.py": shopSetup([["billing", "order.paid"]]), "pay.py": PAY }, ["python setup.py"]),
    hints: [
      l("Aynı key ile birden fazla kuyruk bağlanabilir; exchange her birine kendi kopyasını koyar.", "Several queues can be bound with the same key; the exchange puts a copy into each."),
      l("`shipping`'i de `order.paid` ile bağla; `pay.py`'ye dokunmana gerek yok.", "Bind `shipping` with `order.paid` too; you don't need to touch `pay.py`."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"shipping\", exchange=\"shop\", routing_key=\"order.paid\")`), `python setup.py`, `python pay.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"shipping\", exchange=\"shop\", routing_key=\"order.paid\")`), `python setup.py`, `python pay.py`",
      ),
    ],
    par: 3,
    check: (ctx) => routedVia(ctx, "shop", "order.paid", ["billing", "shipping"]),
  },
  {
    id: "refused-declare",
    title: l("Reddedilen declare", "The refused declare"),
    story: l(
      "Fatura servisini (`invoice.py`) başka bir geliştirici yazdı ve servis açılır açılmaz `PRECONDITION_FAILED` hatasıyla çöküyor. Kuyruk `setup.py`'de kalıcı (durable) olarak tanımlı ve içinde bekleyen işler var; silinmemeli.",
      "Another developer wrote the invoicing service (`invoice.py`), and it crashes on startup with `PRECONDITION_FAILED`. The queue is declared durable in `setup.py` and has work waiting in it; it must not be deleted.",
    ),
    goal: l("`invoice.py` hatasız çalışsın ve mesajı `billing`'e ulaşsın; `billing` durable kalsın.", "`invoice.py` runs without an error and its message reaches `billing`; `billing` stays durable."),
    start: projectAfter(
      {
        "setup.py": shopSetup([["billing", "order.paid"]]),
        "invoice.py": script(`
ch.queue_declare(queue="billing")
ch.basic_publish(exchange="shop", routing_key="order.paid", body=b"invoice 77")
`),
      },
      ["python setup.py"],
    ),
    hints: [
      l(
        "`python invoice.py` çalıştırıp hatayı oku: aynı kuyruğu farklı ayarlarla tekrar declare etmek reddedilir. Aynı ayarlarla declare etmek ise zararsızdır.",
        "Run `python invoice.py` and read the error: declaring the same queue again with other settings is refused. Declaring it with the same settings is harmless.",
      ),
      l("`invoice.py`'deki declare, `setup.py`'dekiyle aynı ayarı taşımalı: `durable=True`.", "The declare in `invoice.py` must carry the same setting as the one in `setup.py`: `durable=True`."),
      l(
        "`nano invoice.py` (`queue_declare(queue=\"billing\")` → `queue_declare(queue=\"billing\", durable=True)`), `python invoice.py`",
        "`nano invoice.py` (`queue_declare(queue=\"billing\")` → `queue_declare(queue=\"billing\", durable=True)`), `python invoice.py`",
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
      "Depo ekibi `shipping` kuyruğunu dinleyen işçiyi denemek istiyor. `test_ship.py` bir test mesajı gönderiyor ama mesaj kayboluyor. Binding'lerle oynamak yasak: canlı trafiği etkiler.",
      "The warehouse team wants to try the worker that listens to `shipping`. `test_ship.py` sends a test message, but it gets lost. Touching the bindings is off limits: it would affect live traffic.",
    ),
    goal: l("Test mesajı `shipping` kuyruğuna ulaşsın; hiçbir binding eklenmesin.", "The test message reaches the `shipping` queue, with no binding added."),
    start: projectAfter(
      {
        "setup.py": shopSetup([["billing", "order.paid"]]),
        "test_ship.py": script(`ch.basic_publish(exchange="shop", routing_key="shipping", body=b"test parcel")`),
      },
      ["python setup.py"],
    ),
    hints: [
      l(
        "`shop` exchange'inde `shipping` diye bir key bağlı değil. Ama her kuyruk, adıyla **default exchange**'e (adı boş: `\"\"`) kendiliğinden bağlıdır.",
        "No `shipping` key is bound on the `shop` exchange. But every queue is bound by its own name to the **default exchange** (the one with an empty name: `\"\"`).",
      ),
      l("Mesajı default exchange'e, routing key olarak kuyruğun adıyla gönder.", "Send the message to the default exchange, with the queue's name as the routing key."),
      l("`nano test_ship.py` (`exchange=\"shop\"` → `exchange=\"\"`), `python test_ship.py`", "`nano test_ship.py` (`exchange=\"shop\"` → `exchange=\"\"`), `python test_ship.py`"),
    ],
    par: 2,
    check: (ctx) => routedVia(ctx, "", "shipping", ["shipping"]) && ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
