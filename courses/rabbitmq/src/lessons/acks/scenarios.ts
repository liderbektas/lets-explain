import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const SETUP = script(`
await ch.assertExchange("dlx", "fanout");
await ch.assertQueue("dead");
await ch.bindQueue("dead", "dlx", "");
await ch.assertQueue("orders", { deadLetterExchange: "dlx" });
`);

const SEND = script(`
for (const n of [1001, 1002, 1003]) {
  ch.sendToQueue("orders", Buffer.from(\`order \${n}\`));
}
`);

const top = `import amqp from "amqplib";
import { setTimeout as sleep } from "node:timers/promises";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
`;

const WAITING = `console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

/** A worker that takes a second per order and lets the broker forget each one on delivery. */
export const AUTO_WORKER = `${top}
await ch.consume("orders", async (msg) => {
  console.log(\` [x] Processing \${msg.content}\`);
  await sleep(1000);
}, { noAck: true });
${WAITING}`;

/** The same worker with manual acks: the broker keeps each order until it hears back. */
export const MANUAL_WORKER = `${top}
await ch.consume("orders", async (msg) => {
  console.log(\` [x] Processing \${msg.content}\`);
  await sleep(1000);
  ch.ack(msg);
});
${WAITING}`;

/** A worker that can't parse a broken order and turns it back with the given requeue. */
const poisonWorker = (requeue: boolean) => `${top}
await ch.consume("orders", (msg) => {
  console.log(\` [x] Received \${msg.content}\`);
  if (msg.content.toString() === "BROKEN") {
    ch.nack(msg, false, ${requeue});
  } else {
    ch.ack(msg);
  }
});
${WAITING}`;

const FILES: Files = { "setup.js": SETUP, "send.js": SEND, "worker.js": MANUAL_WORKER };

/** Free play: the orders queue with its dead letter queue, and the manual-ack worker. */
export const FREE = projectAfter(FILES, ["node setup.js"]);

const acked = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));
const empty = (ctx: RabbitCtx, q: string) => (ctx.state.queues[q] ? depth(ctx.state, q).total === 0 : false);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "reproduce-loss",
    title: l("Kaybı yeniden üret", "Reproduce the loss"),
    story: l(
      "Gece işçi çöktü ve izleme 2 siparişin hiç işlenmediğini söylüyor; kuyrukta da yoklar. Ekip inanmıyor. Test ortamında olanı yeniden üret: `worker.js` `noAck: true` ile çalışıyor ve her sipariş bir saniye sürüyor.",
      "The worker crashed overnight and monitoring says 2 orders were never processed; they're not in the queue either. The team doesn't believe it. Reproduce it on staging: `worker.js` runs with `noAck: true`, and each order takes a second.",
    ),
    goal: l("Test ortamında auto-ack yüzünden en az bir siparişin kaybolduğunu göster.", "On staging, show at least one order being lost because of auto-ack."),
    start: projectAfter({ ...FILES, "worker.js": AUTO_WORKER }, ["node setup.js"]),
    hints: [
      l(
        "auto-ack'te broker mesajı teslim ettiği an siler; işlenmemiş mesajlar sadece işçinin belleğinde durur.",
        "With auto-ack the broker deletes a message the moment it hands it over; unprocessed ones live only in the worker's memory.",
      ),
      l(
        "İşçiyi başlat, siparişleri gönder ve işçi bitirmeden onu **sert** öldür (`kill -9`), çöker gibi. Normal `pkill` işçiye kapanma fırsatı verir.",
        "Start the worker, send the orders, and kill it **hard** (`kill -9`) before it finishes, like a crash. A plain `pkill` lets the worker shut down cleanly.",
      ),
      l("`node worker.js`, `node send.js`, `kill -9 worker.js`", "`node worker.js`, `node send.js`, `kill -9 worker.js`"),
    ],
    par: 3,
    check: (ctx) => lostSince(ctx).some((x) => x.reason === "auto-ack-crash"),
  },
  {
    id: "manual-ack",
    title: l("Manuel ack'e geç", "Switch to manual ack"),
    story: l(
      "Kaybın sebebi belli: `noAck: true`. Bugünün 3 siparişi kuyrukta bekliyor; işçiyi başlatmadan önce düzelt ki broker her siparişi işçi bitirip haber verene kadar saklasın.",
      "The cause of the loss is clear: `noAck: true`. Today's 3 orders are waiting in the queue; fix the worker before starting it, so the broker keeps each order until the worker finishes and says so.",
    ),
    goal: l("3 siparişin her biri işçi tarafından **onaylansın** (ack) ve kuyruk boşalsın.", "Each of the 3 orders is **acked** by the worker and the queue empties."),
    start: projectAfter({ ...FILES, "worker.js": AUTO_WORKER }, ["node setup.js", "node send.js"]),
    hints: [
      l(
        "Manuel ack'te broker mesajı \"onay bekleyen\" olarak tutar; işçi çökerse mesaj kuyruğa döner.",
        "With manual acks the broker keeps a message as \"unacked\"; if the worker crashes, the message goes back to the queue.",
      ),
      l(
        "`noAck: true`'yu kaldır ve callback'in sonunda, iş bittikten sonra `ch.ack(msg)` çağır. Her sipariş bir saniye sürer.",
        "Remove `noAck: true` and call `ch.ack(msg)` at the end of the callback, after the work is done. Each order takes a second.",
      ),
      l(
        "`nano worker.js` (`, { noAck: true }` sil; `await sleep(1000);`'in altına `ch.ack(msg);`), `node worker.js`, `sleep 3`",
        "`nano worker.js` (delete `, { noAck: true }`; under `await sleep(1000);`: `ch.ack(msg);`), `node worker.js`, `sleep 3`",
      ),
    ],
    par: 3,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx, "orders") && lostSince(ctx).length === 0,
  },
  {
    id: "poison-order",
    title: l("Bozuk sipariş", "The broken order"),
    story: l(
      "Kuyrukta okunamayan bir sipariş var (`BROKEN`). İşçi onu `ch.nack(msg, false, true)` ile (requeue açık) geri çeviriyor; sipariş hemen geri geliyor, tekrar geri çevriliyor ve işlemci yüzde yüzde. Arkasındaki siparişler de bekliyor. Bozuk sipariş elle incelenmek üzere `dead` kuyruğuna gitmeli.",
      "There's an order in the queue that can't be parsed (`BROKEN`). The worker turns it back with `ch.nack(msg, false, true)` (requeue on); it comes straight back, gets turned back again, and the CPU sits at 100%. The orders behind it are waiting too. The broken order should go to the `dead` queue for someone to look at.",
    ),
    goal: l("`BROKEN` `dead` kuyruğuna düşsün, diğer siparişler işlensin, kısır döngü olmasın.", "`BROKEN` lands in `dead`, the other orders get processed, and there's no endless loop."),
    start: projectAfter(
      {
        ...FILES,
        "worker.js": poisonWorker(true),
        "send.js": script(`
for (const body of ["order 1001", "BROKEN", "order 1002"]) {
  ch.sendToQueue("orders", Buffer.from(body));
}
`),
      },
      ["node setup.js", "node send.js"],
    ),
    hints: [
      l(
        "`orders` kuyruğunun bir dead letter exchange'i var (`setup.js`'ye bak): geri çevrilen ama kuyruğa **dönmeyen** mesajlar oraya gider.",
        "The `orders` queue has a dead letter exchange (look at `setup.js`): messages turned back but **not** requeued go there.",
      ),
      l(
        "Bozuk siparişi requeue kapalıyken geri çevir (`nack`'in üçüncü argümanı `false`): o zaman kuyruğa dönmez, dead letter'a gider.",
        "Turn the broken order back with requeue off (`nack`'s third argument `false`): then it doesn't return to the queue, it's dead-lettered.",
      ),
      l(
        "`nano worker.js` (`ch.nack(msg, false, true)` → `ch.nack(msg, false, false)`), `node worker.js`",
        "`nano worker.js` (`ch.nack(msg, false, true)` → `ch.nack(msg, false, false)`), `node worker.js`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      (ctx.state.queues.dead?.ready ?? []).some((m) => m.body === "BROKEN") &&
      acked(ctx).size >= 2 &&
      empty(ctx, "orders") &&
      eventsOf(ctx, "requeued").filter((e) => e.why === "nack").length === 0,
  },
  {
    id: "safe-deploy",
    title: l("Güvenli deploy", "A safe deploy"),
    story: l(
      "Manuel ack'li işçinin yeni sürümü çıktı ve hemen yeniden başlatılmalı. Şu an elinde 3 sipariş var, hiçbirini bitirmedi. Bu sefer hiçbiri kaybolmamalı.",
      "A new version of the manual-ack worker is out and it must restart now. It's holding 3 orders and hasn't finished any of them. This time none may be lost.",
    ),
    goal: l("İşçiyi durdurup yeniden başlat; elindeki 3 sipariş yeniden teslim edilip onaylansın, hiçbiri kaybolmasın.", "Stop the worker and start it again; the 3 orders it held are redelivered and acked, none is lost."),
    start: projectAfter(FILES, ["node setup.js", "node worker.js", "node send.js"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged`: 3 sipariş onay bekliyor. Onay gelmeden işçi giderse broker onları kuyruğa geri koyar.",
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged`: 3 orders are unacked. If the worker leaves before acking, the broker puts them back in the queue.",
      ),
      l("Durdur (`pkill -f worker.js`), yeniden başlat ve her biri bir saniye sürdüğü için zamanı ilerlet.", "Stop it (`pkill -f worker.js`), start it again, and move time forward since each takes a second."),
      l("`pkill -f worker.js`, `node worker.js`, `sleep 3`", "`pkill -f worker.js`, `node worker.js`, `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => {
      const done = acked(ctx);
      return eventsOf(ctx, "delivered").filter((d) => d.redelivered && done.has(d.id)).length >= 3 && empty(ctx, "orders") && lostSince(ctx).length === 0;
    },
  },
];
