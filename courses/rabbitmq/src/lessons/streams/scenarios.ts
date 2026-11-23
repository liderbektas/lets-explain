import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { CONNECT, eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

const SETUP = script(`await ch.assertQueue("events", { arguments: { "x-queue-type": "stream" } });`);

/** Three events already in the stream. */
const SEED = script(`for (const e of ["signup:ada", "order:1001", "refund:77"]) {\n  ch.sendToQueue("events", Buffer.from(e));\n}`);

const EMIT = script(`ch.sendToQueue("events", Buffer.from("order:1002"));`);

/**
 * A stream reader. `qos` false leaves out the prefetch (which streams require); `offset` adds
 * the `x-stream-offset` argument.
 */
export const reader = (opts: { qos?: boolean; offset?: string } = {}) => `${CONNECT}
${opts.qos === false ? "" : "await ch.prefetch(100);\n"}await ch.consume("events", (msg) => {
  console.log(\` [x] \${msg.content}\`);
  ch.ack(msg);
}${opts.offset ? `, { arguments: { "x-stream-offset": ${opts.offset} } }` : ""});
console.log(" [*] Waiting for messages. To exit press CTRL+C");`;

/** Free play: the stream with three events and a reader that starts at the beginning. */
export const FREE = projectAfter({ "setup.js": SETUP, "seed.js": SEED, "emit.js": EMIT, "reader.js": reader({ offset: '"first"' }) }, ["node setup.js", "node seed.js"]);

/* ----------------------------------------------------------------- checks */

/** Message ids delivered to a reader, in order. */
const deliveredTo = (ctx: RabbitCtx, tag: string) => eventsOf(ctx, "delivered").filter((d) => d.tag === tag).map((d) => d.id);
const ackedBy = (ctx: RabbitCtx, tag: string) => new Set(eventsOf(ctx, "acked").filter((e) => e.tag === tag).flatMap((e) => e.ids));
/** The ids in the stream's log when the scenario started. */
const startLog = (ctx: RabbitCtx) => ctx.start.queues.events?.log.map((m) => m.id) ?? [];

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "from-the-start",
    title: l("Geçmişi de oku", "Read the past too"),
    story: l(
      "Yeni analitik servisi bugün devreye giriyor ve `events` stream'indeki **bütün** geçmişi işlemesi gerekiyor. `analytics.js`'yi çalıştırınca hiçbir şey okumuyor: sadece bundan sonra gelecek event'leri bekliyor.",
      "The new analytics service goes live today and has to process **all** the history in the `events` stream. Run `analytics.js` and it reads nothing: it only waits for events still to come.",
    ),
    goal: l("`analytics` stream'de zaten duran üç event'i okuyup ack'lesin.", "`analytics` reads and acks the three events already in the stream."),
    start: projectAfter({ "setup.js": SETUP, "seed.js": SEED, "analytics.js": reader() }, ["node setup.js", "node seed.js"]),
    hints: [
      l(
        "Bir stream okuyucusu nereden başlayacağını bağlanırken söyler; söylemezse `next`: sadece yeni gelenler.",
        "A stream reader says where to start when it connects; if it doesn't, it's `next`: only what comes next.",
      ),
      l(
        "`ch.consume`'a seçenek olarak `{ arguments: { \"x-stream-offset\": \"first\" } }` ver.",
        "Give `ch.consume` the options `{ arguments: { \"x-stream-offset\": \"first\" } }`.",
      ),
      l("`nano analytics.js` (`x-stream-offset`: `\"first\"`), `node analytics.js`", "`nano analytics.js` (`x-stream-offset`: `\"first\"`), `node analytics.js`"),
    ],
    par: 2,
    check: (ctx) => {
      const acked = ackedBy(ctx, "analytics");
      return startLog(ctx).length > 0 && startLog(ctx).every((id) => acked.has(id));
    },
  },
  {
    id: "no-prefetch",
    title: l("Prefetch nerede?", "Where's the prefetch?"),
    story: l(
      "Fatura ekibi `billing.js`'yi bir classic kuyruk okuyucusundan kopyalayıp stream'e çevirdi. Çalıştırınca RabbitMQ bağlantıyı kapatıyor. Fatura servisi bundan sonra gelen siparişleri okumalı.",
      "The billing team copied `billing.js` from a classic queue reader and pointed it at the stream. When it runs, RabbitMQ closes the channel. Billing should read the orders that come in from now on.",
    ),
    goal: l("`billing` stream'e bağlansın ve `emit.js`'nin gönderdiği yeni event'i alsın.", "`billing` connects to the stream and receives the new event sent by `emit.js`."),
    start: projectAfter({ "setup.js": SETUP, "seed.js": SEED, "emit.js": EMIT, "billing.js": reader({ qos: false }) }, ["node setup.js", "node seed.js"]),
    hints: [
      l("Hata mesajını oku: RabbitMQ stream okuyucularından bir şey istiyor.", "Read the error: RabbitMQ asks stream readers for something."),
      l("Stream okuyucusu bir prefetch ayarlamak zorunda: `await ch.prefetch(…)`, `ch.consume`'dan önce.", "A stream reader must set a prefetch: `await ch.prefetch(…)`, before `ch.consume`."),
      l("`nano billing.js` (`await ch.prefetch(100);` ekle), `node billing.js`, `node emit.js`", "`nano billing.js` (add `await ch.prefetch(100);`), `node billing.js`, `node emit.js`"),
    ],
    par: 3,
    check: (ctx) => {
      const fresh = new Set(eventsOf(ctx, "routed").map((e) => e.id));
      return deliveredTo(ctx, "billing").some((id) => fresh.has(id));
    },
  },
  {
    id: "replay",
    title: l("Yeniden hesapla", "Recompute"),
    story: l(
      "`analytics` bütün event'leri baştan okuyup toplamları hesapladı, ama hesapta bir hata vardı. Düzeltme `analytics.js`'ye çoktan yazıldı; çalışan süreç hâlâ eski kodu kullanıyor. Toplamların yeniden hesaplanması için aynı event'ler yeniden okunmalı.",
      "`analytics` read every event from the start and computed totals, but the maths had a bug. The fix is already in `analytics.js`; the running process still has the old code. To recompute the totals, the same events have to be read again.",
    ),
    goal: l(
      "`analytics` daha önce okuduğu event'leri **yeniden** okusun; sonunda sadece bir `analytics` okuyucusu çalışsın.",
      "`analytics` reads the events it already read **again**; at the end only one `analytics` reader is running.",
    ),
    start: projectAfter({ "setup.js": SETUP, "seed.js": SEED, "analytics.js": reader({ offset: '"first"' }) }, ["node setup.js", "node seed.js", "node analytics.js"]),
    hints: [
      l("Bir kuyrukta okunan mesaj gider; stream'de kalır. Ack hiçbir şeyi silmez.", "In a queue a read message is gone; in a stream it stays. An ack deletes nothing."),
      l("Eski süreci durdur ve okuyucuyu yeniden başlat: `first` yine baştan okur.", "Stop the old process and start the reader again: `first` reads from the beginning again."),
      l("`pkill -f analytics.js`, `node analytics.js`", "`pkill -f analytics.js`, `node analytics.js`"),
    ],
    par: 2,
    check: (ctx) => {
      const before = new Set(ctx.start.deliveries.filter((d) => d.tag === "analytics").map((d) => d.id));
      const again = deliveredTo(ctx, "analytics").some((id) => before.has(id));
      const readers = Object.values(ctx.state.consumers).filter((c) => c.queue === "events").length;
      return again && readers === 1;
    },
  },
  {
    id: "from-an-offset",
    title: l("Belli bir yerden", "From a given point"),
    story: l(
      "Denetim servisinin sadece üçüncü event'ten (offset 2) itibaren her şeyi görmesi gerekiyor; ilk ikisi zaten başka yerde denetlendi. `audit.js` şu an en baştan okuyacak şekilde yazılmış.",
      "The audit service only needs everything from the third event on (offset 2); the first two were audited elsewhere. `audit.js` is written to read from the very beginning.",
    ),
    goal: l("`audit` okumaya offset 2'deki event'ten başlasın, ondan öncekileri hiç almasın.", "`audit` starts reading at the event at offset 2 and never gets the ones before it."),
    start: projectAfter({ "setup.js": SETUP, "seed.js": SEED, "audit.js": reader({ offset: '"first"' }) }, ["node setup.js", "node seed.js"]),
    hints: [
      l("`x-stream-offset` sadece `first`, `last`, `next` değil, bir sayı da olabilir.", "`x-stream-offset` can be a number too, not just `first`, `last` or `next`."),
      l("Sayıyı tırnaksız yaz: `2`.", "Write the number without quotes: `2`."),
      l("`nano audit.js` (`\"x-stream-offset\": 2`), `node audit.js`", "`nano audit.js` (`\"x-stream-offset\": 2`), `node audit.js`"),
    ],
    par: 2,
    check: (ctx) => {
      const log = startLog(ctx);
      const got = deliveredTo(ctx, "audit");
      return log.length >= 3 && got[0] === log[2] && !got.includes(log[0]!) && !got.includes(log[1]!);
    },
  },
];
