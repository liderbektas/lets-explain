import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, reached, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** setup.py for a `tasks` direct exchange with an images queue and an emails queue. */
export const tasksSetup = (imageKey: string) =>
  script(`
ch.exchange_declare(exchange="tasks", exchange_type="direct", durable=True)
ch.queue_declare(queue="images", durable=True)
ch.queue_declare(queue="emails", durable=True)

ch.queue_bind(queue="images", exchange="tasks", routing_key="${imageKey}")
ch.queue_bind(queue="emails", exchange="tasks", routing_key="email")
`);

const publish = (exchange: string, key: string, body: string) => script(`ch.basic_publish(exchange="${exchange}", routing_key="${key}", body=b"${body}")`);

/** setup.py for the lesson's `logs` exchange: errors takes errors, all-logs takes info, warning and error. */
export const LOGS_SETUP = script(`
ch.exchange_declare(exchange="logs", exchange_type="direct", durable=True)
ch.queue_declare(queue="errors", durable=True)
ch.queue_declare(queue="all-logs", durable=True)

ch.queue_bind(queue="errors", exchange="logs", routing_key="error")
for sev in ["info", "warning", "error"]:
    ch.queue_bind(queue="all-logs", exchange="logs", routing_key=sev)
`);

/** The logs project, as free play starts it. */
export const LOGS = projectAfter(
  {
    "setup.py": LOGS_SETUP,
    "log_error.py": publish("logs", "error", "disk full"),
    "log_info.py": publish("logs", "info", "user signed in"),
  },
  ["python setup.py"],
);

const bound = (ctx: RabbitCtx, exchange: string, queue: string, key: string) =>
  ctx.state.bindings.some((b) => b.exchange === exchange && b.queue === queue && b.key === key);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "idle-worker",
    title: l("Boşta duran işçi", "The idle worker"),
    story: l(
      "Resim işçisi bütün gün boş bekliyor. Yükleme servisi resimleri `tasks` exchange'ine `image` key'iyle gönderiyor, ama mesajlar `images` kuyruğuna hiç düşmüyor. Kurulum `setup.py`'de.",
      "The image worker sits idle all day. The upload service sends pictures to the `tasks` exchange with the key `image`, but nothing ever lands in the `images` queue. The setup lives in `setup.py`.",
    ),
    goal: l("`upload.py`'nin gönderdiği bir `image` mesajı `images` kuyruğuna ulaşsın.", "An `image` message sent by `upload.py` reaches the `images` queue."),
    start: projectAfter({ "setup.py": tasksSetup("images"), "upload.py": publish("tasks", "image", "cat.jpg") }, ["python setup.py"]),
    hints: [
      l(
        "Önce bak: `rabbitmqctl list_bindings source_name destination_name routing_key` hangi key'lerin bağlı olduğunu gösterir. Direct exchange birebir eşleşme ister.",
        "Look first: `rabbitmqctl list_bindings source_name destination_name routing_key` shows which keys are bound. A direct exchange needs an exact match.",
      ),
      l(
        "Binding key'inde bir harf fazla: `images`. `nano setup.py` ile `image` yap, kurulumu yeniden çalıştır, sonra yüklemeyi tekrar dene.",
        "The binding key has one letter too many: `images`. Make it `image` with `nano setup.py`, run the setup again, then retry the upload.",
      ),
      l(
        "`nano setup.py` (`routing_key=\"images\"` → `routing_key=\"image\"`), `python setup.py`, `python upload.py`",
        "`nano setup.py` (`routing_key=\"images\"` → `routing_key=\"image\"`), `python setup.py`, `python upload.py`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "image", "images"),
  },
  {
    id: "videos-too",
    title: l("Videolar da", "Videos too"),
    story: l(
      "Ürün ekibi artık video da yüklüyor; videolar `video` key'iyle gidiyor ve iz bırakmadan kayboluyor. Resim işçisi videoları da işleyebiliyor, yeni bir kuyruk istemiyorlar.",
      "The product team now uploads videos too; they go out with the key `video` and vanish without a trace. The image worker can handle videos as well, and nobody wants a new queue.",
    ),
    goal: l("Bir `video` mesajı **mevcut** `images` kuyruğuna ulaşsın; `image` mesajları da gitmeye devam etsin.", "A `video` message reaches the **existing** `images` queue, while `image` messages keep arriving there too."),
    start: projectAfter(
      { "setup.py": tasksSetup("image"), "upload.py": publish("tasks", "image", "cat.jpg"), "upload_video.py": publish("tasks", "video", "intro.mp4") },
      ["python setup.py"],
    ),
    hints: [
      l("Bir kuyruk birden fazla key ile bağlanabilir: her binding ayrı bir kapı.", "One queue can be bound with several keys: each binding is its own door."),
      l("`setup.py`'ye ikinci bir `queue_bind` satırı ekle, bu sefer `routing_key=\"video\"`.", "Add a second `queue_bind` line to `setup.py`, this time with `routing_key=\"video\"`."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"images\", exchange=\"tasks\", routing_key=\"video\")`), `python setup.py`, `python upload_video.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"images\", exchange=\"tasks\", routing_key=\"video\")`), `python setup.py`, `python upload_video.py`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "video", "images") && bound(ctx, "tasks", "images", "image") && Object.keys(ctx.state.queues).length === Object.keys(ctx.start.queues).length,
  },
  {
    id: "shouting-service",
    title: l("Bağıran servis", "The shouting service"),
    story: l(
      "Yeni ödeme servisi hatalarını `ERROR` key'iyle (büyük harf) `logs`'a gönderiyor; alarm sistemi bu yüzden hiç çalmıyor. Servis başka bir ekibin, bugün koduna dokunamıyorsun.",
      "The new payment service sends its errors to `logs` with the key `ERROR`, in capitals, so the alarms never go off. The service belongs to another team; you can't touch its code today.",
    ),
    goal: l("`payments.py`'nin gönderdiği `ERROR` mesajı `errors` kuyruğuna ulaşsın; `payments.py` değişmesin.", "The `ERROR` message from `payments.py` reaches the `errors` queue, with `payments.py` unchanged."),
    start: projectAfter({ "setup.py": LOGS_SETUP, "payments.py": publish("logs", "ERROR", "card declined") }, ["python setup.py"]),
    hints: [
      l("Routing key büyük-küçük harfe duyarlı: `ERROR` ile `error` iki ayrı key.", "Routing keys are case-sensitive: `ERROR` and `error` are two different keys."),
      l("Servisi değiştiremiyorsan kuyruğu o key'e de bağla.", "If you can't change the service, bind the queue to that key as well."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"errors\", exchange=\"logs\", routing_key=\"ERROR\")`), `python setup.py`, `python payments.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"errors\", exchange=\"logs\", routing_key=\"ERROR\")`), `python setup.py`, `python payments.py`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "ERROR", "errors") && ctx.project.files["payments.py"] === ctx.startProject.files["payments.py"],
  },
  {
    id: "keep-debug",
    title: l("Debug da kalsın", "Keep debug too"),
    story: l(
      "Bir hatayı ararken debug loglarına baktın ve hiçbirinin saklanmadığını gördün: `debug` key'li mesajlar hiçbir kuyruğa gitmiyor, sessizce atılıyor. Ekip bundan sonra `all-logs`'un her şeyi, debug dahil, tutmasını istiyor.",
      "While hunting a bug you went to read the debug logs and found none were kept: messages with the key `debug` reach no queue and are silently dropped. From now on the team wants `all-logs` to keep everything, debug included.",
    ),
    goal: l("Bir `debug` mesajı `all-logs`'a ulaşsın ve bu sırada **hiçbir mesaj kaybolmasın**.", "A `debug` message reaches `all-logs`, and **no message is lost** along the way."),
    start: projectAfter({ "setup.py": LOGS_SETUP, "debug.py": publish("logs", "debug", "cache miss for user 42") }, ["python setup.py"]),
    hints: [
      l("Direct exchange tahmin yürütmez: `debug` için bir binding yoksa mesaj düşer. Önce binding'i kur, sonra gönder.", "A direct exchange doesn't guess: with no binding for `debug`, the message drops. Set up the binding first, then send."),
      l("`setup.py`'deki döngüdeki listeye `\"debug\"` eklemek yeter.", "Adding `\"debug\"` to the list in the loop in `setup.py` is enough."),
      l(
        "`nano setup.py` (`[\"info\", \"warning\", \"error\"]` → `[\"debug\", \"info\", \"warning\", \"error\"]`), `python setup.py`, `python debug.py`",
        "`nano setup.py` (`[\"info\", \"warning\", \"error\"]` → `[\"debug\", \"info\", \"warning\", \"error\"]`), `python setup.py`, `python debug.py`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "debug", "all-logs") && lostSince(ctx).length === 0,
  },
  {
    id: "wrong-key",
    title: l("Yanlış key", "The wrong key"),
    story: l(
      "Sipariş onay e-postaları gitmiyor. Kurulum doğru: `emails` kuyruğu herkesin kullandığı `email` key'iyle bağlı. Sorun bu sefer senin yazdığın `checkout.py`'de.",
      "Order confirmation emails aren't going out. The setup is right: the `emails` queue is bound with `email`, the key everyone uses. This time the problem is in `checkout.py`, which you wrote.",
    ),
    goal: l(
      "`checkout.py`'nin gönderdiği mesaj `emails` kuyruğuna ulaşsın; kuruluma yeni bir binding **eklenmesin**.",
      "The message `checkout.py` sends reaches the `emails` queue, **without** adding a binding to the setup.",
    ),
    start: projectAfter({ "setup.py": tasksSetup("image"), "checkout.py": publish("tasks", "mail", "order 1001 confirmed") }, ["python setup.py"]),
    hints: [
      l("`cat checkout.py` ile hangi key'le gönderdiğine bak, sonra `list_bindings` ile karşılaştır.", "Check which key it sends with (`cat checkout.py`), then compare with `list_bindings`."),
      l("Herkesin kullandığı key doğruysa düzeltilecek olan gönderen taraf: `nano checkout.py`.", "If the key everyone uses is right, the sender is what needs fixing: `nano checkout.py`."),
      l("`nano checkout.py` (`routing_key=\"mail\"` → `routing_key=\"email\"`), `python checkout.py`", "`nano checkout.py` (`routing_key=\"mail\"` → `routing_key=\"email\"`), `python checkout.py`"),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.queues.includes("emails") && e.message.body.includes("order 1001")) && ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
