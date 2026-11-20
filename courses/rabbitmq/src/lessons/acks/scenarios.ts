import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const SETUP = script(`
ch.exchange_declare(exchange="dlx", exchange_type="fanout", durable=True)
ch.queue_declare(queue="dead", durable=True)
ch.queue_bind(exchange="dlx", queue="dead")
ch.queue_declare(queue="orders", durable=True, arguments={"x-dead-letter-exchange": "dlx"})
`);

const SEND = script(`
for n in [1001, 1002, 1003]:
    ch.basic_publish(exchange="", routing_key="orders", body=f"order {n}")
`);

const top = `import pika
import time

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()
`;

/** A worker that takes a second per order and lets the broker forget each one on delivery. */
export const AUTO_WORKER = `${top}
def process(ch, method, properties, body):
    print(f" [x] Processing {body.decode()}")
    time.sleep(1)

ch.basic_consume(queue="orders", on_message_callback=process, auto_ack=True)
ch.start_consuming()`;

/** The same worker with manual acks: the broker keeps each order until it hears back. */
export const MANUAL_WORKER = `${top}
def process(ch, method, properties, body):
    print(f" [x] Processing {body.decode()}")
    time.sleep(1)
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_consume(queue="orders", on_message_callback=process)
ch.start_consuming()`;

/** A worker that can't parse a broken order and turns it back with the given requeue. */
const poisonWorker = (requeue: boolean) => `${top}
def process(ch, method, properties, body):
    print(f" [x] Received {body.decode()}")
    if body == b"BROKEN":
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=${requeue ? "True" : "False"})
    else:
        ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_consume(queue="orders", on_message_callback=process)
ch.start_consuming()`;

const FILES: Files = { "setup.py": SETUP, "send.py": SEND, "worker.py": MANUAL_WORKER };

/** Free play: the orders queue with its dead letter queue, and the manual-ack worker. */
export const FREE = projectAfter(FILES, ["python setup.py"]);

const acked = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));
const empty = (ctx: RabbitCtx, q: string) => (ctx.state.queues[q] ? depth(ctx.state, q).total === 0 : false);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "reproduce-loss",
    title: l("Kaybı yeniden üret", "Reproduce the loss"),
    story: l(
      "Gece işçi çöktü ve izleme 2 siparişin hiç işlenmediğini söylüyor; kuyrukta da yoklar. Ekip inanmıyor. Test ortamında olanı yeniden üret: `worker.py` `auto_ack=True` ile çalışıyor ve her sipariş bir saniye sürüyor.",
      "The worker crashed overnight and monitoring says 2 orders were never processed; they're not in the queue either. The team doesn't believe it. Reproduce it on staging: `worker.py` runs with `auto_ack=True`, and each order takes a second.",
    ),
    goal: l("Test ortamında auto-ack yüzünden en az bir siparişin kaybolduğunu göster.", "On staging, show at least one order being lost because of auto-ack."),
    start: projectAfter({ ...FILES, "worker.py": AUTO_WORKER }, ["python setup.py"]),
    hints: [
      l(
        "auto-ack'te broker mesajı teslim ettiği an siler; işlenmemiş mesajlar sadece işçinin belleğinde durur.",
        "With auto-ack the broker deletes a message the moment it hands it over; unprocessed ones live only in the worker's memory.",
      ),
      l(
        "İşçiyi başlat, siparişleri gönder ve işçi bitirmeden onu **sert** öldür (`kill -9`), çöker gibi. Normal `pkill` işçiye kapanma fırsatı verir.",
        "Start the worker, send the orders, and kill it **hard** (`kill -9`) before it finishes, like a crash. A plain `pkill` lets the worker shut down cleanly.",
      ),
      l("`python worker.py`, `python send.py`, `kill -9 worker.py`", "`python worker.py`, `python send.py`, `kill -9 worker.py`"),
    ],
    par: 3,
    check: (ctx) => lostSince(ctx).some((x) => x.reason === "auto-ack-crash"),
  },
  {
    id: "manual-ack",
    title: l("Manuel ack'e geç", "Switch to manual ack"),
    story: l(
      "Kaybın sebebi belli: `auto_ack=True`. Bugünün 3 siparişi kuyrukta bekliyor; işçiyi başlatmadan önce düzelt ki broker her siparişi işçi bitirip haber verene kadar saklasın.",
      "The cause of the loss is clear: `auto_ack=True`. Today's 3 orders are waiting in the queue; fix the worker before starting it, so the broker keeps each order until the worker finishes and says so.",
    ),
    goal: l("3 siparişin her biri işçi tarafından **onaylansın** (ack) ve kuyruk boşalsın.", "Each of the 3 orders is **acked** by the worker and the queue empties."),
    start: projectAfter({ ...FILES, "worker.py": AUTO_WORKER }, ["python setup.py", "python send.py"]),
    hints: [
      l(
        "Manuel ack'te broker mesajı \"onay bekleyen\" olarak tutar; işçi çökerse mesaj kuyruğa döner.",
        "With manual acks the broker keeps a message as \"unacked\"; if the worker crashes, the message goes back to the queue.",
      ),
      l(
        "`auto_ack=True`'yu kaldır ve callback'in sonunda, iş bittikten sonra `basic_ack` çağır. Her sipariş bir saniye sürer.",
        "Remove `auto_ack=True` and call `basic_ack` at the end of the callback, after the work is done. Each order takes a second.",
      ),
      l(
        "`nano worker.py` (`, auto_ack=True` sil; `time.sleep(1)`'in altına `ch.basic_ack(delivery_tag=method.delivery_tag)`), `python worker.py`, `sleep 3`",
        "`nano worker.py` (delete `, auto_ack=True`; under `time.sleep(1)`: `ch.basic_ack(delivery_tag=method.delivery_tag)`), `python worker.py`, `sleep 3`",
      ),
    ],
    par: 3,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx, "orders") && lostSince(ctx).length === 0,
  },
  {
    id: "poison-order",
    title: l("Bozuk sipariş", "The broken order"),
    story: l(
      "Kuyrukta okunamayan bir sipariş var (`BROKEN`). İşçi onu `requeue=True` ile geri çeviriyor; sipariş hemen geri geliyor, tekrar geri çevriliyor ve işlemci yüzde yüzde. Arkasındaki siparişler de bekliyor. Bozuk sipariş elle incelenmek üzere `dead` kuyruğuna gitmeli.",
      "There's an order in the queue that can't be parsed (`BROKEN`). The worker turns it back with `requeue=True`; it comes straight back, gets turned back again, and the CPU sits at 100%. The orders behind it are waiting too. The broken order should go to the `dead` queue for someone to look at.",
    ),
    goal: l("`BROKEN` `dead` kuyruğuna düşsün, diğer siparişler işlensin, kısır döngü olmasın.", "`BROKEN` lands in `dead`, the other orders get processed, and there's no endless loop."),
    start: projectAfter(
      {
        ...FILES,
        "worker.py": poisonWorker(true),
        "send.py": script(`
for body in ["order 1001", "BROKEN", "order 1002"]:
    ch.basic_publish(exchange="", routing_key="orders", body=body)
`),
      },
      ["python setup.py", "python send.py"],
    ),
    hints: [
      l(
        "`orders` kuyruğunun bir dead letter exchange'i var (`setup.py`'ye bak): geri çevrilen ama kuyruğa **dönmeyen** mesajlar oraya gider.",
        "The `orders` queue has a dead letter exchange (look at `setup.py`): messages turned back but **not** requeued go there.",
      ),
      l("Bozuk siparişi `requeue=False` ile geri çevir: o zaman kuyruğa dönmez, dead letter'a gider.", "Turn the broken order back with `requeue=False`: then it doesn't return to the queue, it's dead-lettered."),
      l("`nano worker.py` (`requeue=True` → `requeue=False`), `python worker.py`", "`nano worker.py` (`requeue=True` → `requeue=False`), `python worker.py`"),
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
    start: projectAfter(FILES, ["python setup.py", "python worker.py", "python send.py"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged`: 3 sipariş onay bekliyor. Onay gelmeden işçi giderse broker onları kuyruğa geri koyar.",
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged`: 3 orders are unacked. If the worker leaves before acking, the broker puts them back in the queue.",
      ),
      l("Durdur (`pkill -f worker.py`), yeniden başlat ve her biri bir saniye sürdüğü için zamanı ilerlet.", "Stop it (`pkill -f worker.py`), start it again, and move time forward since each takes a second."),
      l("`pkill -f worker.py`, `python worker.py`, `sleep 3`", "`pkill -f worker.py`, `python worker.py`, `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => {
      const done = acked(ctx);
      return eventsOf(ctx, "delivered").filter((d) => d.redelivered && done.has(d.id)).length >= 3 && empty(ctx, "orders") && lostSince(ctx).length === 0;
    },
  },
];
