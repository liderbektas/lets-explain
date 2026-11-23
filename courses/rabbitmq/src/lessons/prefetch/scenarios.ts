import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const QUEUE = "jobs";

const top = `import amqp from "amqplib";
import { setTimeout as sleep } from "node:timers/promises";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.createChannel();
`;

const WAITING = `console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

/** The fast worker finishes a report at once. */
const FAST = `${top}
await ch.consume("${QUEUE}", (msg) => {
  console.log(\` [fast] \${msg.content} done\`);
  ch.ack(msg);
});
${WAITING}`;

/** The slow worker, on an old machine, takes ten seconds a report. `qos` says where its prefetch goes, if anywhere. */
export const slowWorker = (qos: "none" | "before" | "after") => `${top}
${qos === "before" ? "await ch.prefetch(1);\n" : ""}await ch.consume("${QUEUE}", async (msg) => {
  console.log(\` [slow] \${msg.content} done\`);
  await sleep(10000);
  ch.ack(msg);
});${qos === "after" ? "\nawait ch.prefetch(1);" : ""}
${WAITING}`;

const SEND = (n: number) =>
  script(`
for (let i = 0; i < ${n}; i++) {
  ch.sendToQueue("${QUEUE}", Buffer.from(\`report \${i + 1}\`));
}
`);

const FILES: Files = { "setup.js": script(`await ch.assertQueue("${QUEUE}");`), "send.js": SEND(6), "fast_worker.js": FAST, "slow_worker.js": slowWorker("none") };

/** Free play: both workers listening, the slow one with no limit. */
export const FREE = projectAfter(FILES, ["node setup.js", "node fast_worker.js", "node slow_worker.js"]);

const isSlow = (tag: string) => tag.startsWith("slow_worker");
const isFast = (tag: string) => tag.startsWith("fast_worker");
/** The most jobs the slow worker ever held at once during the scenario. */
const slowHeldMost = (ctx: RabbitCtx) =>
  Math.max(0, ...ctx.states.flatMap((b) => Object.values(b.consumers).filter((c) => isSlow(c.tag)).map((c) => c.unacked.length)));
/** Jobs the fast worker finished. */
const fastDone = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").filter((e) => isFast(e.tag)).flatMap((e) => e.ids)).size;
const ticks = (ctx: RabbitCtx) => ctx.actions.filter((a) => a.type === "tick").length;

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "hoarding",
    title: l("İstifçi", "The hoarder"),
    story: l(
      "Raporlar çok gecikiyor. Eski makinedeki `slow_worker.js` her raporu 10 saniyede bitiriyor ama her partide işlerin yarısını kapıp elinde tutuyor; hızlı işçi o sırada boşta bekliyor. Birazdan 6 raporluk yeni bir parti gelecek (`send.js`).",
      "Reports are running late. `slow_worker.js`, on an old machine, takes 10 seconds a report, yet grabs half of every batch and sits on it while the fast worker idles. A new batch of 6 reports is coming (`send.js`).",
    ),
    goal: l("Yeni partide yavaş işçi aynı anda **en fazla 1** iş tutsun; hızlı işçi en az 5'ini bitirsin.", "In the new batch the slow worker holds **at most 1** job at a time; the fast worker finishes at least 5."),
    start: projectAfter(FILES, ["node setup.js", "node fast_worker.js", "node slow_worker.js"]),
    hints: [
      l(
        "Prefetch sınırı olmayan işçi, broker'ın ona sırayla verdiği her şeyi alır; ne kadar yavaş olduğuna bakılmaz.",
        "A worker with no prefetch limit takes everything the broker hands it in turn, however slow it is.",
      ),
      l(
        "`ch.prefetch(1)` işçiye aynı anda tek onaylanmamış iş verir. Tüketmeye başlamadan önce çağrılmalı; sonra işçiyi yeniden başlat.",
        "`ch.prefetch(1)` gives the worker one unacked job at a time. Call it before consuming starts; then restart the worker.",
      ),
      l(
        "`nano slow_worker.js` (`ch.consume`'dan önce: `await ch.prefetch(1);`), `pkill -f slow_worker.js`, `node slow_worker.js`, `node send.js`",
        "`nano slow_worker.js` (before `ch.consume`: `await ch.prefetch(1);`), `pkill -f slow_worker.js`, `node slow_worker.js`, `node send.js`",
      ),
    ],
    par: 4,
    check: (ctx) => slowHeldMost(ctx) <= 1 && fastDone(ctx) >= 5 && lostSince(ctx).length === 0,
  },
  {
    id: "qos-too-late",
    title: l("Geç gelen prefetch", "The prefetch came too late"),
    story: l(
      "Bir arkadaşın `slow_worker.js`'ye `ch.prefetch(1)` ekledi ve işçiyi yeniden başlattı, ama yavaş işçi hâlâ partinin yarısını kapıyor. Bir şey yanlış yerde.",
      "A colleague added `ch.prefetch(1)` to `slow_worker.js` and restarted it, but the slow worker still grabs half of each batch. Something is in the wrong place.",
    ),
    goal: l("Yeni 6 raporluk partide yavaş işçi aynı anda en fazla 1 iş tutsun; hızlı işçi en az 5'ini bitirsin.", "In the new batch of 6, the slow worker holds at most 1 job at a time; the fast worker finishes at least 5."),
    start: projectAfter({ ...FILES, "slow_worker.js": slowWorker("after") }, ["node setup.js", "node fast_worker.js", "node slow_worker.js"]),
    hints: [
      l("`cat slow_worker.js`: `ch.prefetch` hangi satırdan sonra geliyor?", "`cat slow_worker.js`: which line does `ch.prefetch` come after?"),
      l(
        "Prefetch, kanalda **sonradan** açılan consumer'lara uygulanır. `ch.consume`'dan sonra çağrılan `prefetch` o consumer'ı değiştirmez.",
        "Prefetch applies to consumers created on the channel **afterwards**. A `prefetch` called after `ch.consume` doesn't change that consumer.",
      ),
      l(
        "`nano slow_worker.js` (`await ch.prefetch(1);` satırını `ch.consume`'un üstüne taşı), `pkill -f slow_worker.js`, `node slow_worker.js`, `node send.js`",
        "`nano slow_worker.js` (move the `await ch.prefetch(1);` line above `ch.consume`), `pkill -f slow_worker.js`, `node slow_worker.js`, `node send.js`",
      ),
    ],
    par: 4,
    check: (ctx) => slowHeldMost(ctx) <= 1 && fastDone(ctx) >= 5 && lostSince(ctx).length === 0,
  },
  {
    id: "rescue",
    title: l("Kurtarma", "The rescue"),
    story: l(
      "Yavaş işçi az önce 3 raporu kaptı ve ilkinde bile daha 10 saniyesi var. Bir müşteri o raporlardan birini **şimdi** bekliyor; hızlı işçi boşta.",
      "The slow worker just grabbed 3 reports and still has 10 seconds to go on the first one. A customer is waiting for one of them **now**; the fast worker is idle.",
    ),
    goal: l("Zaman geçmeden yavaşın elindeki 3 rapor hızlı işçide bitsin; hiçbiri kaybolmasın.", "Without any time passing, the 3 reports the slow worker holds get finished by the fast one; none is lost."),
    start: projectAfter(FILES, ["node setup.js", "node fast_worker.js", "node slow_worker.js", "node send.js"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_unacknowledged`: o 3 rapor broker'da \"onay bekleyen\" olarak duruyor.",
        "`rabbitmqctl list_queues name messages_unacknowledged`: those 3 reports sit with the broker as \"unacked\".",
      ),
      l("Onaylamadan ayrılan işçinin işleri kuyruğa döner ve boştaki işçiye gider.", "When a worker leaves without acking, its jobs go back to the queue and on to the idle worker."),
      l("`pkill -f slow_worker.js`", "`pkill -f slow_worker.js`"),
    ],
    par: 1,
    check: (ctx) => {
      const done = new Set(eventsOf(ctx, "acked").filter((e) => isFast(e.tag)).flatMap((e) => e.ids));
      return eventsOf(ctx, "delivered").filter((d) => d.redelivered && isFast(d.tag) && done.has(d.id)).length >= 3 && ticks(ctx) === 0 && lostSince(ctx).length === 0;
    },
  },
  {
    id: "backlog",
    title: l("Birikmiş iş", "The backlog"),
    story: l(
      "Hızlı işçinin sunucusu gece kapandı. Bu sırada 20 rapor geldi; prefetch 1 ile çalışan yavaş işçi bunlardan sadece birini tuttu, gerisi kuyrukta. Hızlı sunucu geri geldi.",
      "The fast worker's server went down overnight. Meanwhile 20 reports came in; the slow worker, running with prefetch 1, holds just one of them and the rest wait in the queue. The fast server is back.",
    ),
    goal: l("Zaman geçmeden kuyrukta bekleyen tüm raporlar bitsin.", "Without any time passing, every report waiting in the queue gets done."),
    start: projectAfter({ ...FILES, "slow_worker.js": slowWorker("before"), "send.js": SEND(20) }, ["node setup.js", "node slow_worker.js", "node send.js"]),
    hints: [
      l(
        "Yavaş işçi prefetch 1 ile çalıştığı için birikmeyi kapamadı: işler kuyrukta, kim gelirse onun.",
        "The slow worker runs with prefetch 1, so it didn't grab the backlog: the jobs are in the queue for whoever comes.",
      ),
      l("Hızlı işçiyi yeniden başlat.", "Start the fast worker again."),
      l("`node fast_worker.js`", "`node fast_worker.js`"),
    ],
    par: 1,
    check: (ctx) => Boolean(ctx.state.queues[QUEUE]) && depth(ctx.state, QUEUE).ready === 0 && fastDone(ctx) >= 19 && ticks(ctx) === 0,
  },
];
