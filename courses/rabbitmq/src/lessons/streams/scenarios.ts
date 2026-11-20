import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

const SETUP = script(`ch.queue_declare(queue="events", durable=True, arguments={"x-queue-type": "stream"})`);

/** Three events already in the stream. */
const SEED = script(`for e in ["signup:ada", "order:1001", "refund:77"]:\n    ch.basic_publish(exchange="", routing_key="events", body=e)`);

const EMIT = script(`ch.basic_publish(exchange="", routing_key="events", body=b"order:1002")`);

/**
 * A stream reader. `qos` false leaves out the prefetch (which streams require); `offset` adds
 * the `x-stream-offset` argument.
 */
export const reader = (opts: { qos?: boolean; offset?: string } = {}) => `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def handle(ch, method, properties, body):
    print(f" [x] {body.decode()}")
    ch.basic_ack(delivery_tag=method.delivery_tag)
${opts.qos === false ? "" : "\nch.basic_qos(prefetch_count=100)"}
ch.basic_consume(queue="events", on_message_callback=handle${opts.offset ? `, arguments={"x-stream-offset": ${opts.offset}}` : ""})
ch.start_consuming()`;

/** Free play: the stream with three events and a reader that starts at the beginning. */
export const FREE = projectAfter({ "setup.py": SETUP, "seed.py": SEED, "emit.py": EMIT, "reader.py": reader({ offset: '"first"' }) }, ["python setup.py", "python seed.py"]);

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
      "Yeni analitik servisi bugün devreye giriyor ve `events` stream'indeki **bütün** geçmişi işlemesi gerekiyor. `analytics.py`'yi çalıştırınca hiçbir şey okumuyor: sadece bundan sonra gelecek event'leri bekliyor.",
      "The new analytics service goes live today and has to process **all** the history in the `events` stream. Run `analytics.py` and it reads nothing: it only waits for events still to come.",
    ),
    goal: l("`analytics` stream'de zaten duran üç event'i okuyup ack'lesin.", "`analytics` reads and acks the three events already in the stream."),
    start: projectAfter({ "setup.py": SETUP, "seed.py": SEED, "analytics.py": reader() }, ["python setup.py", "python seed.py"]),
    hints: [
      l(
        "Bir stream okuyucusu nereden başlayacağını bağlanırken söyler; söylemezse `next`: sadece yeni gelenler.",
        "A stream reader says where to start when it connects; if it doesn't, it's `next`: only what comes next.",
      ),
      l("`basic_consume`'a `arguments={\"x-stream-offset\": \"first\"}` ekle.", "Add `arguments={\"x-stream-offset\": \"first\"}` to `basic_consume`."),
      l("`nano analytics.py` (`x-stream-offset`: `\"first\"`), `python analytics.py`", "`nano analytics.py` (`x-stream-offset`: `\"first\"`), `python analytics.py`"),
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
      "Fatura ekibi `billing.py`'yi bir classic kuyruk okuyucusundan kopyalayıp stream'e çevirdi. Çalıştırınca RabbitMQ bağlantıyı kapatıyor. Fatura servisi bundan sonra gelen siparişleri okumalı.",
      "The billing team copied `billing.py` from a classic queue reader and pointed it at the stream. When it runs, RabbitMQ closes the channel. Billing should read the orders that come in from now on.",
    ),
    goal: l("`billing` stream'e bağlansın ve `emit.py`'nin gönderdiği yeni event'i alsın.", "`billing` connects to the stream and receives the new event sent by `emit.py`."),
    start: projectAfter({ "setup.py": SETUP, "seed.py": SEED, "emit.py": EMIT, "billing.py": reader({ qos: false }) }, ["python setup.py", "python seed.py"]),
    hints: [
      l("Hata mesajını oku: RabbitMQ stream okuyucularından bir şey istiyor.", "Read the error: RabbitMQ asks stream readers for something."),
      l("Stream okuyucusu bir prefetch ayarlamak zorunda: `ch.basic_qos(prefetch_count=…)`, `basic_consume`'dan önce.", "A stream reader must set a prefetch: `ch.basic_qos(prefetch_count=…)`, before `basic_consume`."),
      l("`nano billing.py` (`ch.basic_qos(prefetch_count=100)` ekle), `python billing.py`, `python emit.py`", "`nano billing.py` (add `ch.basic_qos(prefetch_count=100)`), `python billing.py`, `python emit.py`"),
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
      "`analytics` bütün event'leri baştan okuyup toplamları hesapladı, ama hesapta bir hata vardı. Düzeltme `analytics.py`'ye çoktan yazıldı; çalışan süreç hâlâ eski kodu kullanıyor. Toplamların yeniden hesaplanması için aynı event'ler yeniden okunmalı.",
      "`analytics` read every event from the start and computed totals, but the maths had a bug. The fix is already in `analytics.py`; the running process still has the old code. To recompute the totals, the same events have to be read again.",
    ),
    goal: l(
      "`analytics` daha önce okuduğu event'leri **yeniden** okusun; sonunda sadece bir `analytics` okuyucusu çalışsın.",
      "`analytics` reads the events it already read **again**; at the end only one `analytics` reader is running.",
    ),
    start: projectAfter({ "setup.py": SETUP, "seed.py": SEED, "analytics.py": reader({ offset: '"first"' }) }, ["python setup.py", "python seed.py", "python analytics.py"]),
    hints: [
      l("Bir kuyrukta okunan mesaj gider; stream'de kalır. Ack hiçbir şeyi silmez.", "In a queue a read message is gone; in a stream it stays. An ack deletes nothing."),
      l("Eski süreci durdur ve okuyucuyu yeniden başlat: `first` yine baştan okur.", "Stop the old process and start the reader again: `first` reads from the beginning again."),
      l("`pkill -f analytics.py`, `python analytics.py`", "`pkill -f analytics.py`, `python analytics.py`"),
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
      "Denetim servisinin sadece üçüncü event'ten (offset 2) itibaren her şeyi görmesi gerekiyor; ilk ikisi zaten başka yerde denetlendi. `audit.py` şu an en baştan okuyacak şekilde yazılmış.",
      "The audit service only needs everything from the third event on (offset 2); the first two were audited elsewhere. `audit.py` is written to read from the very beginning.",
    ),
    goal: l("`audit` okumaya offset 2'deki event'ten başlasın, ondan öncekileri hiç almasın.", "`audit` starts reading at the event at offset 2 and never gets the ones before it."),
    start: projectAfter({ "setup.py": SETUP, "seed.py": SEED, "audit.py": reader({ offset: '"first"' }) }, ["python setup.py", "python seed.py"]),
    hints: [
      l("`x-stream-offset` sadece `first`, `last`, `next` değil, bir sayı da olabilir.", "`x-stream-offset` can be a number too, not just `first`, `last` or `next`."),
      l("Sayıyı tırnaksız yaz: `2`.", "Write the number without quotes: `2`."),
      l("`nano audit.py` (`\"x-stream-offset\": 2`), `python audit.py`", "`nano audit.py` (`\"x-stream-offset\": 2`), `python audit.py`"),
    ],
    par: 2,
    check: (ctx) => {
      const log = startLog(ctx);
      const got = deliveredTo(ctx, "audit");
      return log.length >= 3 && got[0] === log[2] && !got.includes(log[0]!) && !got.includes(log[1]!);
    },
  },
];
