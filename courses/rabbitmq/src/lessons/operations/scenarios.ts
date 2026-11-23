import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

const SETUP = script(`await ch.assertQueue("orders");`);

const orders = (...bodies: string[]) => script(`for (const o of [${bodies.map((b) => `"${b}"`).join(", ")}]) {\n  ch.sendToQueue("orders", Buffer.from(o));\n}`);

/** The order worker. `ack` false is the bug where the callback never acks; `slow` adds a sleep (seconds) per order. */
export const worker = (opts: { ack?: boolean; slow?: number; prefetch?: number } = {}) => `import amqp from "amqplib";
${opts.slow ? 'import { setTimeout as sleep } from "node:timers/promises";\n' : ""}
const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();

await ch.prefetch(${opts.prefetch ?? 1});
await ch.consume("orders", async (msg) => {
  console.log(\` [x] shipping \${msg.content}\`);${opts.slow ? `\n  await sleep(${opts.slow * 1000});` : ""}${opts.ack === false ? "" : "\n  ch.ack(msg);"}
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

/** Free play: a few orders and a worker that keeps up. */
export const FREE = projectAfter({ "setup.js": SETUP, "orders.js": orders("o1", "o2", "o3"), "worker.js": worker() }, ["node setup.js"]);

/* ----------------------------------------------------------------- checks */

/** Every order that was in `orders` at the start (waiting or held) was acked by some worker. */
function allStartOrdersAcked(ctx: RabbitCtx): boolean {
  const q = ctx.start.queues.orders;
  const held = Object.values(ctx.start.consumers).filter((c) => c.queue === "orders").flatMap((c) => c.unacked);
  const ids = [...(q?.ready ?? []), ...held].map((m) => m.id);
  const acked = new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));
  return ids.length > 0 && ids.every((id) => acked.has(id));
}

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "zero-consumers",
    title: l("Sıfır consumer", "Zero consumers"),
    story: l(
      "Müşteriler siparişlerinin kargoya verilmediğini söylüyor. `rabbitmqctl list_queues name messages consumers` her şeyi anlatıyor: `orders`'ta bekleyen siparişler var ve `consumers` 0. İşçi gece bir deploy sırasında durmuş ve kimse fark etmemiş.",
      "Customers say their orders haven't shipped. `rabbitmqctl list_queues name messages consumers` tells the whole story: orders are waiting in `orders` and `consumers` is 0. The worker stopped during a deploy last night and nobody noticed.",
    ),
    goal: l("Bekleyen bütün siparişler işlensin (ack'lensin) ve `orders` boşalsın.", "Every waiting order is processed (acked) and `orders` is empty."),
    start: projectAfter({ "setup.js": SETUP, "orders.js": orders("o1", "o2", "o3"), "worker.js": worker() }, ["node setup.js", "node orders.js"]),
    hints: [
      l("`consumers` 0 olan bir kuyruk sadece büyür. Önce tüketiciyi geri getir.", "A queue with 0 `consumers` only grows. Bring the consumer back first."),
      l("İşçi `worker.js`; başlatınca arka planda çalışır.", "The worker is `worker.js`; started, it keeps running in the background."),
      l("`node worker.js`", "`node worker.js`"),
    ],
    par: 1,
    check: (ctx) => depth(ctx.state, "orders").total === 0 && allStartOrdersAcked(ctx),
  },
  {
    id: "stuck-worker",
    title: l("Takılan işçi", "The stuck worker"),
    story: l(
      "İşçi çalışıyor, `consumers` 1, ama `messages_unacknowledged` saatlerdir 2'de duruyor ve kuyruk eriymiyor. `worker.js`'ye bakınca sebep çıkıyor: son değişiklikte callback'teki ack satırı silinmiş. İşçi elindeki iki siparişi bitirdi ama broker bunu hiç duymadı.",
      "The worker is running, `consumers` is 1, but `messages_unacknowledged` has sat at 2 for hours and the queue doesn't drain. One look at `worker.js` shows why: the last change deleted the ack line in the callback. The worker finished the two orders it holds, but the broker never heard about it.",
    ),
    goal: l("Bütün siparişler ack'lensin, hazır ve onay bekleyen 0 olsun; hiçbir sipariş kaybolmasın.", "Every order is acked, ready and unacked are both 0, and no order is lost."),
    start: projectAfter({ "setup.js": SETUP, "orders.js": orders("o1", "o2", "o3", "o4"), "worker.js": worker({ ack: false, prefetch: 2 }) }, ["node setup.js", "node worker.js", "node orders.js"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers` ile bak. Ack'lenmemiş mesajlar, onları tutan tüketici gidince kuyruğa geri döner.",
        "Look with `rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers`. Unacked messages go back to the queue when the consumer holding them goes away.",
      ),
      l("Ack satırını geri ekle, sonra eski süreci durdurup düzeltilmiş işçiyi başlat.", "Put the ack line back, then stop the old process and start the fixed worker."),
      l(
        "`nano worker.js` (`ch.ack(msg);`), `pkill -f worker.js`, `node worker.js`",
        "`nano worker.js` (`ch.ack(msg);`), `pkill -f worker.js`, `node worker.js`",
      ),
    ],
    par: 3,
    check: (ctx) => depth(ctx.state, "orders").total === 0 && lostSince(ctx).length === 0 && allStartOrdersAcked(ctx),
  },
  {
    id: "scale-out",
    title: l("Daha çok işçi", "More workers"),
    story: l(
      "Kampanya başladı ve `orders`'ta 6 sipariş birikti. İşçi her siparişte 2 saniye harcıyor (kargo firmasının API'si yavaş), yani tek başına bitirmesi 12 saniye sürer. Kargo kesimi 4 saniye sonra.",
      "The sale has started and 6 orders have piled up in `orders`. The worker spends 2 seconds on each (the courier's API is slow), so on its own it needs 12 seconds. The courier cut-off is in 4 seconds.",
    ),
    goal: l("Bütün siparişler **4 saniye içinde** işlensin: zaman 4 saniye ilerlediğinde `orders` boş olsun.", "Every order is processed **within 4 seconds**: when 4 seconds have passed, `orders` is empty."),
    start: projectAfter(
      { "setup.js": SETUP, "orders.js": orders("o1", "o2", "o3", "o4", "o5", "o6"), "worker.js": worker({ slow: 2 }) },
      ["node setup.js", "node orders.js", "node worker.js"],
    ),
    hints: [
      l("Aynı kuyruğa bağlı işçiler işi paylaşır (round-robin). İki kat işçi, iki kat hız.", "Workers on the same queue share the work (round-robin). Twice the workers, twice the speed."),
      l("6 sipariş × 2 saniye = 12 işçi-saniye. 4 saniyede bitirmek için 3 işçi lazım: iki tane daha başlat, sonra zamanın geçmesini bekle.", "6 orders × 2 seconds = 12 worker-seconds. To finish in 4 seconds you need 3 workers: start two more, then let the time pass."),
      l("`node worker.js`, `node worker.js`, `sleep 4`", "`node worker.js`, `node worker.js`, `sleep 4`"),
    ],
    par: 3,
    check: (ctx) => depth(ctx.state, "orders").total === 0 && ctx.state.time - ctx.start.time <= 4 && lostSince(ctx).length === 0,
  },
  {
    id: "purge-test",
    title: l("Test artıkları", "Test leftovers"),
    story: l(
      "Dünkü yük testi `orders-test` kuyruğunu çöp mesajla doldurmuş ve izleme ekranı alarm veriyor. Kuyruk test ortamının bir parçası; kalmalı, sadece içi boşalmalı. Yanındaki `orders`'ta gerçek siparişler bekliyor.",
      "Yesterday's load test filled the `orders-test` queue with junk and the monitoring dashboard is alarming. The queue is part of the test setup and must stay; only its contents should go. Right next to it, real orders are waiting in `orders`.",
    ),
    goal: l("`orders-test` boşalsın ama silinmesin; `orders`'taki gerçek siparişlere dokunulmasın.", "`orders-test` is emptied but not deleted; the real orders in `orders` are left alone."),
    start: projectAfter(
      {
        "setup.js": script(`await ch.assertQueue("orders");\nawait ch.assertQueue("orders-test");`),
        "orders.js": orders("o1", "o2"),
        "loadtest.js": script(`for (let n = 0; n < 5; n++) {\n  ch.sendToQueue("orders-test", Buffer.from("junk"));\n}`),
      },
      ["node setup.js", "node orders.js", "node loadtest.js"],
    ),
    hints: [
      l("Kuyruğu silmek ile boşaltmak farklı şeyler: silinen kuyruk tanımıyla ve binding'leriyle gider.", "Deleting a queue and emptying it are different: a deleted queue takes its definition and bindings with it."),
      l("`rabbitmqctl`'in bir kuyruğun içindekileri silen komutu var.", "`rabbitmqctl` has a command that deletes a queue's contents."),
      l("`rabbitmqctl purge_queue orders-test`", "`rabbitmqctl purge_queue orders-test`"),
    ],
    par: 1,
    check: (ctx) => Boolean(ctx.state.queues["orders-test"]) && depth(ctx.state, "orders-test").total === 0 && depth(ctx.state, "orders").ready === 2,
  },
];
