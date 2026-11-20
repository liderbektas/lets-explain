import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const TASKS = "tasks";

/** A photo service: a `tasks` queue fed by `send.py` and read by `worker.py`. */
const worker = (ack: boolean, sleep = 0) => `import pika
${sleep ? "import time\n" : ""}
connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def resize(ch, method, properties, body):
    print(f" [x] Resizing {body.decode()}")
${sleep ? `    time.sleep(${sleep})\n` : ""}${ack ? "    ch.basic_ack(delivery_tag=method.delivery_tag)\n" : ""}
ch.basic_consume(queue="${TASKS}", on_message_callback=resize)
ch.start_consuming()`;

export const FILES: Files = {
  "setup.py": script(`ch.queue_declare(queue="${TASKS}", durable=True)`),
  "send.py": script(`
for photo in ["photo-1.jpg", "photo-2.jpg", "photo-3.jpg"]:
    ch.basic_publish(exchange="", routing_key="${TASKS}", body=photo)
`),
  "worker.py": worker(true),
};

/** Free play: the queue exists, nobody is listening yet. */
export const FREE = projectAfter(FILES, ["python setup.py"]);

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
    start: projectAfter(FILES, ["python setup.py", "python send.py"]),
    hints: [
      l("`rabbitmqctl list_queues name messages` ile bak: işler kuyrukta seni bekliyor.", "Look with `rabbitmqctl list_queues name messages`: the tasks are waiting for you in the queue."),
      l("Kuyruğu dinleyen bir işçi başlat; `worker.py` her işi bitirince ack gönderir.", "Start a worker that listens to the queue; `worker.py` sends an ack after each task."),
      l("`python worker.py`", "`python worker.py`"),
    ],
    par: 1,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx),
  },
  {
    id: "forgot-ack",
    title: l("Unutulan ack", "The forgotten ack"),
    story: l(
      "`worker.py` bütün gün çalıştı ve her fotoğraf için \"Resizing\" yazdı. Ama `rabbitmqctl` hâlâ 3 mesajın onay beklediğini söylüyor: RabbitMQ işlerin bittiğinden habersiz. Yeni gelen işçiler de bu işleri alamıyor.",
      "`worker.py` ran all day and printed \"Resizing\" for every photo. Yet `rabbitmqctl` still says 3 messages are unacknowledged: RabbitMQ has no idea the work is done. New workers can't get those tasks either.",
    ),
    goal: l("3 işin hepsi onaylansın (ack), kuyruk boşalsın, hiçbir iş kaybolmasın.", "All 3 tasks are acked, the queue empties, and no task is lost."),
    start: projectAfter({ ...FILES, "worker.py": worker(false) }, ["python setup.py", "python worker.py", "python send.py"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages_ready messages_unacknowledged` ile bak. `cat worker.py`: callback hiç `basic_ack` çağırmıyor.",
        "Look with `rabbitmqctl list_queues name messages_ready messages_unacknowledged`. `cat worker.py`: the callback never calls `basic_ack`.",
      ),
      l(
        "Callback'e ack ekle, eski işçiyi durdur (elindeki işler kuyruğa döner) ve düzeltilmiş halini başlat.",
        "Add the ack to the callback, stop the old worker (what it holds goes back to the queue) and start the fixed one.",
      ),
      l(
        "`nano worker.py` (callback'in sonuna: `ch.basic_ack(delivery_tag=method.delivery_tag)`), `pkill -f worker.py`, `python worker.py`",
        "`nano worker.py` (at the end of the callback: `ch.basic_ack(delivery_tag=method.delivery_tag)`), `pkill -f worker.py`, `python worker.py`",
      ),
    ],
    par: 3,
    check: (ctx) => acked(ctx).size >= 3 && empty(ctx) && lostSince(ctx).length === 0,
  },
  {
    id: "lunch-rush",
    title: l("Öğle yoğunluğu", "Lunch rush"),
    story: l(
      "Öğle saatinde yüklemeler ikiye katlanıyor ve tek işçi yetişemiyor. Ekip, aynı kuyruğu dinleyen ikinci bir işçiyle işin paylaşılmasını istiyor; sonra yeni bir parti fotoğraf gelecek (`send.py`).",
      "At lunchtime uploads double and one worker can't keep up. The team wants a second worker on the same queue to share the work; then a new batch of photos comes in (`send.py`).",
    ),
    goal: l("Yeni partideki işler **iki işçiye** dağılsın (ikisi de en az bir iş alsın) ve hepsi bitsin.", "The new batch is split across **two workers** (each gets at least one task) and all of it gets done."),
    start: projectAfter(FILES, ["python setup.py", "python worker.py"]),
    hints: [
      l("Aynı kuyruğu birden fazla işçi dinleyince mesajlar sırayla dağıtılır; her mesaj tek işçiye gider.", "When several workers listen to one queue, messages take turns; each message goes to one worker."),
      l("`worker.py`'yi bir kez daha çalıştırmak ikinci bir işçi başlatır. Sonra partiyi gönder.", "Running `worker.py` once more starts a second worker. Then send the batch."),
      l("`python worker.py`, `python send.py`", "`python worker.py`, `python send.py`"),
    ],
    par: 2,
    check: (ctx) => new Set(eventsOf(ctx, "delivered").map((d) => d.tag)).size >= 2 && acked(ctx).size >= 3 && empty(ctx),
  },
  {
    id: "stuck-worker",
    title: l("Takılan işçi", "The stuck worker"),
    story: l(
      "Deneme için açılan `slow_worker.py` üç işi birden kaptı ve ilkinde, devasa bir dosyada takıldı. Sağlıklı `worker.py` ise boşta bekliyor. İşler kaybolmamalı.",
      "`slow_worker.py`, started for a test, grabbed all three tasks and is stuck on the first, a huge file. The healthy `worker.py` sits idle. The tasks must not be lost.",
    ),
    goal: l("Takılan işler sağlıklı işçide bitsin; hiçbiri kaybolmasın.", "The stuck tasks get finished by the healthy worker; none is lost."),
    start: projectAfter({ ...FILES, "slow_worker.py": worker(true, 30) }, ["python setup.py", "python slow_worker.py", "python send.py", "python worker.py"]),
    hints: [
      l(
        "`jobs` arka planda neyin çalıştığını gösterir. Onaylanmamış işler, işçi bağlantısı kapanınca kuyruğa geri döner.",
        "`jobs` shows what runs in the background. Unacked tasks go back to the queue when their worker's connection closes.",
      ),
      l("Takılan işçiyi durdur: elindekiler kuyruğa döner ve boştaki işçiye gider.", "Stop the stuck worker: what it holds goes back and on to the idle one."),
      l("`pkill -f slow_worker.py`", "`pkill -f slow_worker.py`"),
    ],
    par: 1,
    check: (ctx) => {
      const done = acked(ctx);
      return eventsOf(ctx, "delivered").filter((d) => d.redelivered && done.has(d.id)).length >= 3 && lostSince(ctx).length === 0;
    },
  },
];
