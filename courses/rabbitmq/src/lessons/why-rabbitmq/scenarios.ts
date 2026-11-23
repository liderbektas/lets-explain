import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const QUEUE = "emails";

/** The shop's email pipeline: a durable `emails` queue, an order service, and a mail worker. */
export const FILES: Files = {
  "setup.js": script(`await ch.assertQueue("${QUEUE}");`),
  "order.js": script(`ch.sendToQueue("${QUEUE}", Buffer.from("order 1001"));`),
  "orders.js": script(`
for (const n of [1001, 1002, 1003]) {
  ch.sendToQueue("${QUEUE}", Buffer.from(\`order \${n}\`));
}
`),
  "black_friday.js": script(`
for (let n = 0; n < 6; n++) {
  ch.sendToQueue("${QUEUE}", Buffer.from(\`order \${2000 + n}\`));
}
`),
  // A mail worker sends one email a second and holds one at a time.
  "mailer.js": `import amqp from "amqplib";
import { setTimeout as sleep } from "node:timers/promises";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();

await ch.prefetch(1);
await ch.consume("${QUEUE}", async (msg) => {
  console.log(\` [x] Sending email for \${msg.content}\`);
  await sleep(1000);
  ch.ack(msg);
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`,
};

/** Free play: the queue exists, nobody is listening yet. */
export const FREE = projectAfter(FILES, ["node setup.js"]);

/** Emails finished (acked) during the scenario. */
const sent = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids)).size;
const ticks = (ctx: RabbitCtx) => ctx.actions.filter((a) => a.type === "tick").length;
const drained = (ctx: RabbitCtx) => (ctx.state.queues[QUEUE] ? depth(ctx.state, QUEUE).total === 0 : false);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "after-outage",
    title: l("Kesintiden sonra", "After the outage"),
    story: l(
      "E-posta servisi gece bakım için kapalıydı. Bu sırada sipariş servisi çalışmaya devam etti ve 3 sipariş geldi. Kimse e-posta almadı ama hiçbir sipariş de hata vermedi. Bakım bitti; `mailer.js` tekrar çalıştırılmayı bekliyor.",
      "The email service was down overnight for maintenance. The order service kept running and 3 orders came in. Nobody got an email, but no order failed either. Maintenance is over; `mailer.js` is waiting to be started again.",
    ),
    goal: l("Bekleyen 3 siparişin e-postası gönderilsin, kuyruk boşalsın, hiçbiri kaybolmasın.", "The 3 waiting orders get their emails, the queue empties, none is lost."),
    start: projectAfter(FILES, ["node setup.js", "node orders.js"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages` ile bak: siparişler kuyrukta bekliyor. Kuyruk, okuyan biri gelene kadar onları tutar.",
        "Look with `rabbitmqctl list_queues name messages`: the orders are waiting in the queue. A queue keeps them until someone reads.",
      ),
      l(
        "E-posta servisini başlat. Her e-posta bir saniye sürüyor; zamanı `sleep` ile ilerletebilirsin.",
        "Start the email service. Each email takes a second; move time forward with `sleep`.",
      ),
      l("`node mailer.js`, `sleep 3`", "`node mailer.js`, `sleep 3`"),
    ],
    par: 2,
    check: (ctx) => sent(ctx) >= 3 && drained(ctx) && lostSince(ctx).length === 0,
  },
  {
    id: "new-server",
    title: l("Yeni sunucu", "The new server"),
    story: l(
      "Uygulamayı boş bir RabbitMQ sunucusuna taşıyorsun. Kurulum (`setup.js`), sipariş servisi (`order.js`) ve e-posta servisi (`mailer.js`) hazır. Geçen sefer sıralama yanlıştı ve ilk siparişler iz bırakmadan kayboldu.",
      "You're moving the app to an empty RabbitMQ server. The setup (`setup.js`), the order service (`order.js`) and the email service (`mailer.js`) are ready. Last time the order was wrong and the first orders vanished without a trace.",
    ),
    goal: l("Bir siparişin e-postası gönderilsin ve **hiçbir sipariş kaybolmasın**.", "An order's email goes out and **no order is lost**."),
    start: projectAfter(FILES),
    hints: [
      l(
        "Default exchange mesajı adı routing key olan kuyruğa koyar. O kuyruk henüz yoksa mesaj sessizce atılır.",
        "The default exchange puts a message into the queue named by its routing key. If that queue doesn't exist yet, the message is silently dropped.",
      ),
      l("Önce kuyruğu kur (`node setup.js`), sonra servisleri çalıştır.", "Set up the queue first (`node setup.js`), then run the services."),
      l("`node setup.js`, `node mailer.js`, `node order.js`, `sleep 1`", "`node setup.js`, `node mailer.js`, `node order.js`, `sleep 1`"),
    ],
    par: 4,
    check: (ctx) => sent(ctx) >= 1 && lostSince(ctx).length === 0,
  },
  {
    id: "black-friday",
    title: l("Kara Cuma", "Black Friday"),
    story: l(
      "Kara Cuma kampanyası başladı: 6 sipariş aynı anda geldi. Tek e-posta servisi saniyede bir e-posta gönderiyor ve müşteriler onay e-postasını bekliyor. Ekip, birikmenin **3 saniye** içinde erimesini istiyor.",
      "The Black Friday sale started: 6 orders came in at once. The single email service sends one email a second, and customers are waiting for their confirmation. The team wants the backlog gone within **3 seconds**.",
    ),
    goal: l("Kuyruk en fazla 3 saniyede boşalsın; hiçbir sipariş kaybolmasın.", "The queue empties in at most 3 seconds; no order is lost."),
    start: projectAfter(FILES, ["node setup.js", "node mailer.js", "node black_friday.js"]),
    hints: [
      l("Tek işçi saniyede bir e-posta: 6 e-posta 6 saniye sürer.", "One worker sends one email a second: 6 emails take 6 seconds."),
      l(
        "Aynı kuyruğu dinleyen ikinci bir işçi işi paylaşır. `mailer.js`'yi bir kez daha çalıştırmak ikinci bir işçi başlatır.",
        "A second worker on the same queue shares the work. Running `mailer.js` once more starts a second worker.",
      ),
      l("`node mailer.js`, `sleep 3`", "`node mailer.js`, `sleep 3`"),
    ],
    par: 2,
    check: (ctx) => drained(ctx) && ticks(ctx) <= 3 && sent(ctx) >= 6 && lostSince(ctx).length === 0,
  },
  {
    id: "maintenance",
    title: l("Bakım arası", "Maintenance break"),
    story: l(
      "E-posta servisinin çalıştığı makineye güncelleme gelecek; servisi durdurup yeniden başlatman gerekiyor. Tam şu an elinde bir e-posta var ve kuyrukta iki tane daha bekliyor. Müşteriler yine de her e-postayı almalı.",
      "The machine the email service runs on needs an update; you have to stop the service and start it again. Right now it's holding one email and two more are waiting in the queue. Customers must still get every email.",
    ),
    goal: l("Servisi bir kez **durdur**, sonra yeniden başlat; 3 e-postanın hepsi gönderilsin, hiçbiri kaybolmasın.", "**Stop** the service once, then start it again; all 3 emails go out, none is lost."),
    start: projectAfter(FILES, ["node setup.js", "node mailer.js", "node orders.js"]),
    hints: [
      l(
        "Onaylanmamış (ack'lenmemiş) mesaj, işçi ayrılınca kuyruğa geri döner. Durdurmak güvenli.",
        "A message that wasn't acked goes back to the queue when its worker leaves. Stopping is safe.",
      ),
      l("Arka planda çalışan servisi `pkill -f mailer.js` durdurur.", "`pkill -f mailer.js` stops the service running in the background."),
      l("`pkill -f mailer.js`, `node mailer.js`, `sleep 3`", "`pkill -f mailer.js`, `node mailer.js`, `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => eventsOf(ctx, "consumerGone").length >= 1 && sent(ctx) >= 3 && drained(ctx) && lostSince(ctx).length === 0,
  },
];
