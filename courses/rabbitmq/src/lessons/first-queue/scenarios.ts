import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const TASKS = "tasks";

/** A photo service: a `tasks` queue fed by `send.js` and read by `worker.js`. */
const worker = (ack: boolean, sleep = 0) => `import amqp from "amqplib";
${sleep ? 'import { setTimeout as sleep } from "node:timers/promises";\n' : ""}
const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();

await ch.consume("${TASKS}", async (msg) => {
  console.log(\` [x] Resizing \${msg.content}\`);
${sleep ? `  await sleep(${sleep * 1000});\n` : ""}${ack ? "  ch.ack(msg);\n" : ""}});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

export const FILES: Files = {
  "setup.js": script(`await ch.assertQueue("${TASKS}");`),
  "send.js": script(`
for (const photo of ["photo-1.jpg", "photo-2.jpg", "photo-3.jpg"]) {
  ch.sendToQueue("${TASKS}", Buffer.from(photo));
}
`),
  "worker.js": worker(true),
};

/** Free play: the queue exists, nobody is listening yet. */
export const FREE = projectAfter(FILES, ["node setup.js"]);

/** Every message id acked during the scenario. */
const acked = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));
const empty = (ctx: RabbitCtx) => (ctx.state.queues[TASKS] ? depth(ctx.state, TASKS).total === 0 : false);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "morning-queue",
    title: l("Sabah kuyruğu", "The morning queue"),
    story: l(
      "Gece yüklenen 3 fotoğraf `tasks` kuyruğunda boyutlandırılmayı bekliyor; işçi sunucusu yeniden başlatıldıktan sonra kimse onu açmamış.",
      "Three photos uploaded overnight are waiting in the `tasks` queue to be resized; after the worker server rebooted, nobody started the worker again.",
    ),
    goal: l("Bekleyen 3 iş de işlensin (ack'lensin), kuyruk boş kalsın.", "All 3 waiting tasks get processed (acked) and the queue is left empty."),
    start: projectAfter(FILES, ["node setup.js", "node send.js"]),
    hints: [
      l("`rabbitmqctl list_queues name messages` ile bak: işler kuyrukta seni bekliyor.", "Look with `rabbitmqctl list_queues name messages`: the tasks are waiting for you in the queue."),
      l("Kuyruğu dinleyen bir işçi başlat; `worker.js` her işi bitirince ack gönderir.", "Start a worker that listens to the queue; `worker.js` sends an ack after each task."),
      l("`node worker.js`", "`node worker.js`"),
    ],
    par: 1,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx),
  },
  {
    id: "forgot-ack",
    title: l("Unutulan ack", "The forgotten ack"),
    story: l(
      "`worker.js` bütün gün çalıştı ve her fotoğraf için \"Resizing\" yazdı. Ama `rabbitmqctl` hâlâ 3 mesajın onay beklediğini söylüyor: RabbitMQ işlerin bittiğinden habersiz. Yeni gelen işçiler de bu işleri alamıyor.",
      "`worker.js` ran all day and printed \"Resizing\" for every photo. Yet `rabbitmqctl` still says 3 messages are unacknowledged: RabbitMQ has no idea the work is done. New workers can't get those tasks either.",
    ),
    goal: l("3 işin hepsi onaylansın (ack), kuyruk boşalsın, hiçbir iş kaybolmasın.", "All 3 tasks are acked, the queue empties, and no task is lost."),
    start: projectAfter({ ...FILES, "worker.js": worker(false) }, ["node setup.js", "node worker.js", "node send.js"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged` ile bak. `cat worker.js`: callback hiç `ch.ack` çağırmıyor.",
        "Look with `rabbitmqctl list_queues name messages_ready messages_unacknowledged`. `cat worker.js`: the callback never calls `ch.ack`.",
      ),
      l(
        "Callback'e ack ekle, eski işçiyi durdur (elindeki işler kuyruğa döner) ve düzeltilmiş halini başlat.",
        "Add the ack to the callback, stop the old worker (what it holds goes back to the queue) and start the fixed one.",
      ),
      l(
        "`nano worker.js` (callback'in sonuna: `ch.ack(msg);`), `pkill -f worker.js`, `node worker.js`",
        "`nano worker.js` (at the end of the callback: `ch.ack(msg);`), `pkill -f worker.js`, `node worker.js`",
      ),
    ],
    par: 3,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx) && lostSince(ctx).length === 0,
  },
  {
    id: "lunch-rush",
    title: l("Öğle yoğunluğu", "Lunch rush"),
    story: l(
      "Öğle saatinde yüklemeler ikiye katlanıyor ve tek işçi yetişemiyor. Ekip, aynı kuyruğu dinleyen ikinci bir işçiyle işin paylaşılmasını istiyor; sonra yeni bir parti fotoğraf gelecek (`send.js`).",
      "At lunchtime uploads double and one worker can't keep up. The team wants a second worker on the same queue to share the work; then a new batch of photos comes in (`send.js`).",
    ),
    goal: l("Yeni partideki işler **iki işçiye** dağılsın (ikisi de en az bir iş alsın) ve hepsi bitsin.", "The new batch is split across **two workers** (each gets at least one task) and all of it gets done."),
    start: projectAfter(FILES, ["node setup.js", "node worker.js"]),
    hints: [
      l("Aynı kuyruğu birden fazla işçi dinleyince mesajlar sırayla dağıtılır; her mesaj tek işçiye gider.", "When several workers listen to one queue, messages take turns; each message goes to one worker."),
      l("`worker.js`'yi bir kez daha çalıştırmak ikinci bir işçi başlatır. Sonra partiyi gönder.", "Running `worker.js` once more starts a second worker. Then send the batch."),
      l("`node worker.js`, `node send.js`", "`node worker.js`, `node send.js`"),
    ],
    par: 2,
    check: (ctx) => new Set(eventsOf(ctx, "delivered").map((d) => d.tag)).size >= 2 && acked(ctx).size >= 3 && empty(ctx),
  },
  {
    id: "stuck-worker",
    title: l("Takılan işçi", "The stuck worker"),
    story: l(
      "Deneme için açılan `slow_worker.js` üç işi birden kaptı ve ilkinde, devasa bir dosyada takıldı. Sağlıklı `worker.js` ise boşta bekliyor. İşler kaybolmamalı.",
      "`slow_worker.js`, started for a test, grabbed all three tasks and is stuck on the first, a huge file. The healthy `worker.js` sits idle. The tasks must not be lost.",
    ),
    goal: l("Takılan işler sağlıklı işçide bitsin; hiçbiri kaybolmasın.", "The stuck tasks get finished by the healthy worker; none is lost."),
    start: projectAfter({ ...FILES, "slow_worker.js": worker(true, 30) }, ["node setup.js", "node slow_worker.js", "node send.js", "node worker.js"]),
    hints: [
      l(
        "`jobs` arka planda neyin çalıştığını gösterir. Onaylanmamış işler, işçi bağlantısı kapanınca kuyruğa geri döner.",
        "`jobs` shows what runs in the background. Unacked tasks go back to the queue when their worker's connection closes.",
      ),
      l("Takılan işçiyi durdur: elindekiler kuyruğa döner ve boştaki işçiye gider.", "Stop the stuck worker: what it holds goes back and on to the idle one."),
      l("`pkill -f slow_worker.js`", "`pkill -f slow_worker.js`"),
    ],
    par: 1,
    check: (ctx) => {
      const done = acked(ctx);
      return eventsOf(ctx, "delivered").filter((d) => d.redelivered && done.has(d.id)).length >= 3 && lostSince(ctx).length === 0;
    },
  },
];
