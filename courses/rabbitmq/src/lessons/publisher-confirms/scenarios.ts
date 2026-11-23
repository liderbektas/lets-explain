import { l } from "@lets-explain/core/i18n";
import { createBroker } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { CONNECT, eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** The shop: an `orders` exchange, a plain `billing` queue and a small `limited` one that refuses when full. */
export const SETUP = script(`
await ch.assertExchange("orders", "direct");
await ch.assertQueue("billing");
await ch.bindQueue("billing", "orders", "order");
await ch.assertQueue("limited", { maxLength: 2, arguments: { "x-overflow": "reject-publish" } });
await ch.bindQueue("limited", "orders", "limited");
`);

/** A publisher on a confirm channel: `waitForConfirms` rejects when the broker said no to a message. */
const confirmed = (body: string) => script(`${body.trim()}\nawait ch.waitForConfirms();\nconsole.log("sent");`, { confirm: true });

/** Prints what the broker hands back (a mandatory message no queue took). */
const ON_RETURN = 'ch.on("return", (msg) => console.log(`returned: ${msg.content}`));\n';

const WORKER = `${CONNECT}
await ch.prefetch(1);
await ch.consume("limited", (msg) => {
  console.log(\` [x] \${msg.content}\`);
  ch.ack(msg);
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

const BURST = `for (const n of ["l1", "l2", "l3"]) {\n  ch.publish("orders", "limited", Buffer.from(n));\n}`;

/** Free play: the shop with a few senders. */
export const FREE = projectAfter(
  {
    "setup.js": SETUP,
    "order.js": confirmed(`ch.publish("orders", "order", Buffer.from("order-1"));`),
    "refund.js": confirmed(`${ON_RETURN}ch.publish("orders", "refund", Buffer.from("refund-1"), { mandatory: true });`),
    "burst.js": confirmed(BURST),
    "worker.js": WORKER,
  },
  ["node setup.js"],
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
      "Muhasebe soruyor: iadeler nereye gidiyor? `refund.js` her seferinde \"sent\" yazıyor ve confirm'ler açık, ama `refund` key'i için hiçbir kuyruk yok. Broker bu mesajları **ack**'leyip atıyor; script hiçbir şey fark etmiyor.",
      "Accounting asks where the refunds go. `refund.js` prints \"sent\" every time and confirms are on, but no queue is bound for the key `refund`. The broker **acks** those messages and drops them; the script never notices.",
    ),
    goal: l("Gidecek yeri olmayan iade sessizce kaybolmasın, **producer'a geri dönsün**.", "A refund with nowhere to go is not silently dropped: it is **returned to the producer**."),
    start: projectAfter(
      { "setup.js": SETUP, "refund.js": confirmed(`${ON_RETURN}ch.publish("orders", "refund", Buffer.from("refund-17"));`) },
      ["node setup.js"],
    ),
    hints: [
      l("Bir confirm, \"broker sorumluluğu aldı\" demek; mesajın bir kuyruğa ulaştığı anlamına gelmez.", "A confirm means \"the broker took responsibility\", not that the message reached a queue."),
      l("Yönlendirilemeyen mesajı geri istemek için yayına bir seçenek ekle: `mandatory`.", "To get an unroutable message back, add an option to the publish: `mandatory`."),
      l(
        "`nano refund.js` (`ch.publish(..., { mandatory: true })`), `node refund.js`: broker mesajı geri verir ve `return` dinleyicisi onu yazar.",
        "`nano refund.js` (`ch.publish(..., { mandatory: true })`), `node refund.js`: the broker hands it back and the `return` listener prints it.",
      ),
    ],
    par: 2,
    check: (ctx) => eventsOf(ctx, "unroutable").some((e) => e.returned && e.message.body === "refund-17") && !lostSince(ctx).some((x) => x.reason === "unroutable"),
  },
  {
    id: "burst-nacked",
    title: l("Üçüncü sipariş", "The third order"),
    story: l(
      "`limited` kuyruğu belleği korumak için bilerek en fazla 2 mesaj tutuyor ve doluyken yeni geleni reddediyor. Kampanya başladı: `burst.js` 3 sipariş gönderiyor ve üçüncüsü nack aldığı için `Error: message nacked` ile düşüyor. Kuyruğu boşaltan `worker.js` bu sabah başlatılmamış.",
      "The `limited` queue deliberately holds at most 2 messages to protect memory, and refuses new ones when full. The sale has started: `burst.js` sends 3 orders and crashes with `Error: message nacked`, because the third was nacked. `worker.js`, which drains the queue, wasn't started this morning.",
    ),
    goal: l("`burst.js`'nin 3 siparişi de broker'dan **ack** alsın; hiç nack ve kayıp olmasın.", "All 3 of `burst.js`'s orders get an **ack** from the broker, with no nack and nothing lost."),
    start: projectAfter(
      { "setup.js": SETUP, "burst.js": confirmed(BURST), "worker.js": WORKER },
      ["node setup.js"],
    ),
    hints: [
      l("Nack, kuyruğun dolu olduğunu söylüyor. Sınırı kaldırmak yerine kuyruğun boşalmasını sağla.", "The nack says the queue is full. Rather than lifting the cap, get the queue drained."),
      l("Önce tüketiciyi başlat, sonra gönder.", "Start the consumer first, then send."),
      l("`node worker.js`, `node burst.js`", "`node worker.js`, `node burst.js`"),
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
      "Gece üç node'luk cluster'ın ikisi (`rabbit2` ve `rabbit3`) kapandı. Ödemeler üç kopyalı bir quorum kuyruğuna gidiyor ve `pay.js` artık her ödemede `Error: message nacked` ile düşüyor.",
      "Overnight, two of the three cluster nodes (`rabbit2` and `rabbit3`) went down. Payments go to a three-copy quorum queue, and `pay.js` now fails with `Error: message nacked` for every payment.",
    ),
    goal: l("Bir ödeme `payments` kuyruğuna girsin ve broker'dan **ack** alsın.", "A payment gets into the `payments` queue with an **ack** from the broker."),
    start: projectAfter(
      {
        "setup.js": script(`
await ch.assertExchange("orders", "direct");
await ch.assertQueue("payments", { arguments: { "x-queue-type": "quorum" } });
await ch.bindQueue("payments", "orders", "pay");
`),
        "pay.js": confirmed(`ch.publish("orders", "pay", Buffer.from("payment-9"));`),
      },
      ["node setup.js", "docker stop rabbit2", "docker stop rabbit3"],
      createBroker({ nodes: 3 }),
    ),
    hints: [
      l("`docker ps -a` hangi node'ların kapalı olduğunu gösterir. Üç kopyalı bir quorum kuyruğu en az iki çalışan node ister.", "`docker ps -a` shows which nodes are down. A three-copy quorum queue needs at least two nodes up."),
      l("Bir node'u geri getirmek yeter: `docker start`.", "Bringing one node back is enough: `docker start`."),
      l("`docker start rabbit2`, `node pay.js`", "`docker start rabbit2`, `node pay.js`"),
    ],
    par: 2,
    check: (ctx) => answersFor(ctx, "payments").some(Boolean),
  },
  {
    id: "acked-then-lost",
    title: l("Ack aldı, yine kayboldu", "Acked, then lost"),
    story: l(
      "Mağaza bir sipariş gönderdi, broker ack verdi, hemen ardından broker yeniden başladı ve sipariş `billing`'den kayboldu. `order.js`'de confirm'ler açık; eksik olan başka bir şey.",
      "The shop sent an order, the broker acked it, then the broker restarted and the order was gone from `billing`. `order.js` has confirms on; something else is missing.",
    ),
    goal: l("`order.js`'nin gönderdiği sipariş bir broker restart'ından sonra `billing`'de dursun.", "The order sent by `order.js` is still in `billing` after a broker restart."),
    start: projectAfter({ "setup.js": SETUP, "order.js": confirmed(`ch.publish("orders", "order", Buffer.from("order-55"));`) }, ["node setup.js"]),
    hints: [
      l("Ack \"kuyruğa koydum\" der. Geçici (transient) bir mesaj yalnızca bellekte durur; restart onu siler.", "An ack says \"queued\". A transient message lives only in memory; a restart wipes it."),
      l("Mesajı persistent gönder: `{ persistent: true }`.", "Send it persistent: `{ persistent: true }`."),
      l(
        "`nano order.js` (`ch.publish(\"orders\", \"order\", Buffer.from(\"order-55\"), { persistent: true })`), `node order.js`, `docker restart rabbitmq`",
        "`nano order.js` (`ch.publish(\"orders\", \"order\", Buffer.from(\"order-55\"), { persistent: true })`), `node order.js`, `docker restart rabbitmq`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const restarted = ctx.events.map((evs) => evs.some((e) => e.type === "restarted")).lastIndexOf(true);
      return restarted >= 0 && (ctx.state.queues.billing?.ready ?? []).some((m) => m.body === "order-55");
    },
  },
];
