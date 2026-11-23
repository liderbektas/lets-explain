import { l } from "@lets-explain/core/i18n";
import type { DeathReason } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { CONNECT, eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** A fanout dead letter exchange `dlx` with a `dead` queue, and a `work` queue declared as given. */
const setup = (work: string) =>
  script(`
await ch.assertExchange("dlx", "fanout");
await ch.assertQueue("dead");
await ch.bindQueue("dead", "dlx", "");
${work}
`);

/** A worker that rejects what it can't parse (without requeue) and acks the rest. */
const worker = (queue: string, bad: string) => `${CONNECT}
await ch.prefetch(1);
await ch.consume("${queue}", (msg) => {
  if (msg.content.toString() === "${bad}") {
    ch.reject(msg, false);
  } else {
    ch.ack(msg);
  }
});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

const send = (queue: string, body: string) => script(`ch.sendToQueue("${queue}", Buffer.from("${body}"));`);

/** Free play: `work` with a rejecting worker and `dead` next to it. */
export const FREE = projectAfter(
  { "setup.js": setup(`await ch.assertQueue("work", { deadLetterExchange: "dlx" });`), "worker.js": worker("work", "bad"), "send_bad.js": send("work", "bad"), "send.js": send("work", "ok") },
  ["node setup.js", "node worker.js"],
);

/* ----------------------------------------------------------------- checks */

/** A message from `from` was dead-lettered for this reason and reached `to`. */
const died = (ctx: RabbitCtx, from: string, reason: DeathReason, to: string) => eventsOf(ctx, "deadLettered").some((e) => e.from === from && e.reason === reason && e.to === to);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "rejected",
    title: l("Reddedilenler nerede?", "Where did the rejects go?"),
    story: l(
      "İşçi okuyamadığı siparişleri `ch.reject(msg, false)` ile, kuyruğa geri koymadan reddediyor; doğru, çünkü tekrar denemek işe yaramaz. Ama bu mesajlar iz bırakmadan yok oluyor ve destek ekibi hangi siparişlerin bozuk geldiğini göremiyor. `work` canlıda ve dolu; kodda değişiklik bugün mümkün değil.",
      "The worker rejects orders it can't read with `ch.reject(msg, false)`, without requeueing, which is right: retrying won't help. But those messages vanish without a trace and support can't see which orders came in broken. `work` is live and busy; changing the code isn't possible today.",
    ),
    goal: l("`send_bad.js`'nin gönderdiği bozuk mesaj reddedilince `dead` kuyruğuna düşsün.", "When the broken message from `send_bad.js` is rejected, it lands in the `dead` queue."),
    start: projectAfter(
      { "setup.js": setup(`await ch.assertQueue("work");`), "worker.js": worker("work", "bad"), "send_bad.js": send("work", "bad") },
      ["node setup.js", "node worker.js"],
    ),
    hints: [
      l("Reddedilen bir mesaj, kuyruğun bir **dead letter exchange**'i varsa oraya gider; yoksa atılır.", "A rejected message goes to the queue's **dead letter exchange** if it has one; otherwise it is dropped."),
      l(
        "Çalışan bir kuyruğa DLX vermenin kod gerektirmeyen yolu bir policy: `rabbitmqctl set_policy`, JSON'da `dead-letter-exchange`.",
        "The no-code way to give a running queue a DLX is a policy: `rabbitmqctl set_policy`, with `dead-letter-exchange` in the JSON.",
      ),
      l(
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node send_bad.js`",
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node send_bad.js`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "work", "rejected", "dead"),
  },
  {
    id: "expired",
    title: l("Bayat hatırlatmalar", "Stale reminders"),
    story: l(
      "`reminders` kuyruğundaki hatırlatmalar 3 saniyeden eskiyse işe yaramıyor: kullanıcıya geç giden bir \"toplantın başlıyor\" mesajı kafa karıştırıyor. Bayatlayanlar atılmasın, denetim için `dead`'e gitsin. Şu an `reminders`'ı okuyan kimse yok.",
      "Reminders in the `reminders` queue are useless after 3 seconds: a late \"your meeting is starting\" just confuses people. Stale ones shouldn't be thrown away but kept in `dead` for auditing. Nobody is reading `reminders` right now.",
    ),
    goal: l("`remind.js`'nin gönderdiği hatırlatmanın süresi dolsun ve `dead`'e gitsin.", "The reminder sent by `remind.js` expires and goes to `dead`."),
    start: projectAfter({ "setup.js": setup(`await ch.assertQueue("reminders");`), "remind.js": send("reminders", "meeting at 10:00") }, ["node setup.js"]),
    hints: [
      l("İki ayar lazım: bir süre (TTL) ve süresi dolanın gideceği yer (DLX). Biri eksikse mesaj ya sonsuza kadar bekler ya da atılır.", "You need two settings: a time limit (TTL) and where expired messages go (DLX). Miss one and the message either waits forever or is dropped."),
      l(
        "Policy JSON'unda ikisi birden olabilir: `message-ttl` milisaniye cinsinden, `dead-letter-exchange` exchange'in adı. Süre geçsin diye `sleep`.",
        "A policy's JSON can hold both: `message-ttl` in milliseconds, `dead-letter-exchange` the exchange's name. Let the time pass with `sleep`.",
      ),
      l(
        "`rabbitmqctl set_policy stale \"^reminders$\" '{\"message-ttl\":3000,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node remind.js`, `sleep 3`",
        "`rabbitmqctl set_policy stale \"^reminders$\" '{\"message-ttl\":3000,\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node remind.js`, `sleep 3`",
      ),
    ],
    par: 3,
    check: (ctx) => died(ctx, "reminders", "expired", "dead"),
  },
  {
    id: "overflow",
    title: l("Taşan kampanya", "The overflowing sale"),
    story: l(
      "`work` en fazla 2 bekleyen mesaj tutacak şekilde kurulmuş (`x-max-length`). İşçi bakımda; kampanya başlayınca taşan en eski siparişler sessizce atılıyor. Atılmasınlar, `dead`'e gitsinler: işçi dönünce oradan elle işlenecekler.",
      "`work` is set to hold at most 2 waiting messages (`x-max-length`). The worker is down for maintenance; when the sale starts, the oldest orders are silently dropped as the queue overflows. They should go to `dead` instead, to be handled by hand when the worker is back.",
    ),
    goal: l("`burst.js`'nin 3 siparişinden taşan en eskisi `dead`'e gitsin; hiçbir sipariş kaybolmasın.", "Of `burst.js`'s 3 orders, the oldest one that overflows goes to `dead`; no order is lost."),
    start: projectAfter(
      {
        "setup.js": setup(`await ch.assertQueue("work", { maxLength: 2 });`),
        "burst.js": script(`for (const n of ["o1", "o2", "o3"]) {\n  ch.sendToQueue("work", Buffer.from(n));\n}`),
      },
      ["node setup.js"],
    ),
    hints: [
      l("Sınırı aşınca baştaki mesaj çıkar (drop-head). DLX varsa oraya gider, yoksa kaybolur.", "Past the cap, the head message leaves (drop-head). With a DLX it goes there; without one it is lost."),
      l("Kuyruğun argümanı değişemez ama bir policy DLX ekleyebilir; sınırı argüman koymaya devam eder.", "The queue's arguments can't change, but a policy can add the DLX; the argument keeps setting the cap."),
      l(
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node burst.js`",
        "`rabbitmqctl set_policy DLX \"^work$\" '{\"dead-letter-exchange\":\"dlx\"}' --apply-to queues`, `node burst.js`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "work", "maxlen", "dead") && lostSince(ctx).length === 0,
  },
  {
    id: "dlx-key",
    title: l("Yanlış adres", "Wrong address"),
    story: l(
      "Reddedilen ödemeler `errors-x` exchange'ine dead letter oluyor; `errors` kuyruğu oraya `payment.failed` key'iyle bağlı. Yine de `errors` hep boş. Ödemeler `payments` key'iyle gönderiliyor ve dead letter olurken bu key'i taşıyorlar.",
      "Declined payments are dead-lettered to the `errors-x` exchange, where the `errors` queue is bound with the key `payment.failed`. Still, `errors` is always empty. Payments are sent with the key `payments`, and they keep that key when dead-lettered.",
    ),
    goal: l("`declined.js`'nin gönderdiği ödeme reddedilince `errors` kuyruğuna ulaşsın.", "When the payment sent by `declined.js` is declined, it reaches the `errors` queue."),
    start: projectAfter(
      {
        "setup.js": script(`
await ch.assertExchange("errors-x", "direct");
await ch.assertQueue("errors");
await ch.bindQueue("errors", "errors-x", "payment.failed");
await ch.assertQueue("payments", { deadLetterExchange: "errors-x" });
`),
        "worker.js": worker("payments", "declined"),
        "declined.js": send("payments", "declined"),
      },
      ["node setup.js", "node worker.js"],
    ),
    hints: [
      l(
        "Dead letter olan mesaj, aksi söylenmedikçe kendi routing key'iyle gider. `errors-x` direct bir exchange: `payments` key'ini tanımıyor.",
        "A dead-lettered message keeps its own routing key unless told otherwise. `errors-x` is a direct exchange: it doesn't know the key `payments`.",
      ),
      l("Ölen mesajın key'ini değiştiren ayar `dead-letter-routing-key`; bir policy ile verebilirsin.", "The setting that changes a dead message's key is `dead-letter-routing-key`; a policy can set it."),
      l(
        "`rabbitmqctl set_policy dlk \"^payments$\" '{\"dead-letter-routing-key\":\"payment.failed\"}' --apply-to queues`, `node declined.js`",
        "`rabbitmqctl set_policy dlk \"^payments$\" '{\"dead-letter-routing-key\":\"payment.failed\"}' --apply-to queues`, `node declined.js`",
      ),
    ],
    par: 2,
    check: (ctx) => died(ctx, "payments", "rejected", "errors"),
  },
];
