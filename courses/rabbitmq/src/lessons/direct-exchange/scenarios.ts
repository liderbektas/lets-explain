import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, reached, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** setup.js for a `tasks` direct exchange with an images queue and an emails queue. */
export const tasksSetup = (imageKey: string) =>
  script(`
await ch.assertExchange("tasks", "direct");
await ch.assertQueue("images");
await ch.assertQueue("emails");

await ch.bindQueue("images", "tasks", "${imageKey}");
await ch.bindQueue("emails", "tasks", "email");
`);

const publish = (exchange: string, key: string, body: string) => script(`ch.publish("${exchange}", "${key}", Buffer.from("${body}"));`);

/** setup.js for the lesson's `logs` exchange: errors takes errors, all-logs takes info, warning and error. */
export const LOGS_SETUP = script(`
await ch.assertExchange("logs", "direct");
await ch.assertQueue("errors");
await ch.assertQueue("all-logs");

await ch.bindQueue("errors", "logs", "error");
for (const sev of ["info", "warning", "error"]) {
  await ch.bindQueue("all-logs", "logs", sev);
}
`);

/** The logs project, as free play starts it. */
export const LOGS = projectAfter(
  {
    "setup.js": LOGS_SETUP,
    "log_error.js": publish("logs", "error", "disk full"),
    "log_info.js": publish("logs", "info", "user signed in"),
  },
  ["node setup.js"],
);

const bound = (ctx: RabbitCtx, exchange: string, queue: string, key: string) =>
  ctx.state.bindings.some((b) => b.exchange === exchange && b.queue === queue && b.key === key);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "idle-worker",
    title: l("Boşta duran işçi", "The idle worker"),
    story: l(
      "Resim işçisi bütün gün boş bekliyor. Yükleme servisi resimleri `tasks` exchange'ine `image` key'iyle gönderiyor, ama mesajlar `images` kuyruğuna hiç düşmüyor. Kurulum `setup.js`'de.",
      "The image worker sits idle all day. The upload service sends pictures to the `tasks` exchange with the key `image`, but nothing ever lands in the `images` queue. The setup lives in `setup.js`.",
    ),
    goal: l("`upload.js`'nin gönderdiği bir `image` mesajı `images` kuyruğuna ulaşsın.", "An `image` message sent by `upload.js` reaches the `images` queue."),
    start: projectAfter({ "setup.js": tasksSetup("images"), "upload.js": publish("tasks", "image", "cat.jpg") }, ["node setup.js"]),
    hints: [
      l(
        "Önce bak: `rabbitmqctl list_bindings source_name destination_name routing_key` hangi key'lerin bağlı olduğunu gösterir. Direct exchange birebir eşleşme ister.",
        "Look first: `rabbitmqctl list_bindings source_name destination_name routing_key` shows which keys are bound. A direct exchange needs an exact match.",
      ),
      l(
        "Binding key'inde bir harf fazla: `images`. `nano setup.js` ile `image` yap, kurulumu yeniden çalıştır, sonra yüklemeyi tekrar dene.",
        "The binding key has one letter too many: `images`. Make it `image` with `nano setup.js`, run the setup again, then retry the upload.",
      ),
      l(
        "`nano setup.js` (`bindQueue(\"images\", \"tasks\", \"images\")` → `bindQueue(\"images\", \"tasks\", \"image\")`), `node setup.js`, `node upload.js`",
        "`nano setup.js` (`bindQueue(\"images\", \"tasks\", \"images\")` → `bindQueue(\"images\", \"tasks\", \"image\")`), `node setup.js`, `node upload.js`",
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
      { "setup.js": tasksSetup("image"), "upload.js": publish("tasks", "image", "cat.jpg"), "upload_video.js": publish("tasks", "video", "intro.mp4") },
      ["node setup.js"],
    ),
    hints: [
      l("Bir kuyruk birden fazla key ile bağlanabilir: her binding ayrı bir kapı.", "One queue can be bound with several keys: each binding is its own door."),
      l("`setup.js`'ye ikinci bir `bindQueue` satırı ekle, bu sefer key `\"video\"`.", "Add a second `bindQueue` line to `setup.js`, this time with the key `\"video\"`."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"images\", \"tasks\", \"video\");`), `node setup.js`, `node upload_video.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"images\", \"tasks\", \"video\");`), `node setup.js`, `node upload_video.js`",
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
    goal: l("`payments.js`'nin gönderdiği `ERROR` mesajı `errors` kuyruğuna ulaşsın; `payments.js` değişmesin.", "The `ERROR` message from `payments.js` reaches the `errors` queue, with `payments.js` unchanged."),
    start: projectAfter({ "setup.js": LOGS_SETUP, "payments.js": publish("logs", "ERROR", "card declined") }, ["node setup.js"]),
    hints: [
      l("Routing key büyük-küçük harfe duyarlı: `ERROR` ile `error` iki ayrı key.", "Routing keys are case-sensitive: `ERROR` and `error` are two different keys."),
      l("Servisi değiştiremiyorsan kuyruğu o key'e de bağla.", "If you can't change the service, bind the queue to that key as well."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"errors\", \"logs\", \"ERROR\");`), `node setup.js`, `node payments.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"errors\", \"logs\", \"ERROR\");`), `node setup.js`, `node payments.js`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "ERROR", "errors") && ctx.project.files["payments.js"] === ctx.startProject.files["payments.js"],
  },
  {
    id: "keep-debug",
    title: l("Debug da kalsın", "Keep debug too"),
    story: l(
      "Bir hatayı ararken debug loglarına baktın ve hiçbirinin saklanmadığını gördün: `debug` key'li mesajlar hiçbir kuyruğa gitmiyor, sessizce atılıyor. Ekip bundan sonra `all-logs`'un her şeyi, debug dahil, tutmasını istiyor.",
      "While hunting a bug you went to read the debug logs and found none were kept: messages with the key `debug` reach no queue and are silently dropped. From now on the team wants `all-logs` to keep everything, debug included.",
    ),
    goal: l("Bir `debug` mesajı `all-logs`'a ulaşsın ve bu sırada **hiçbir mesaj kaybolmasın**.", "A `debug` message reaches `all-logs`, and **no message is lost** along the way."),
    start: projectAfter({ "setup.js": LOGS_SETUP, "debug.js": publish("logs", "debug", "cache miss for user 42") }, ["node setup.js"]),
    hints: [
      l("Direct exchange tahmin yürütmez: `debug` için bir binding yoksa mesaj düşer. Önce binding'i kur, sonra gönder.", "A direct exchange doesn't guess: with no binding for `debug`, the message drops. Set up the binding first, then send."),
      l("`setup.js`'deki döngüdeki listeye `\"debug\"` eklemek yeter.", "Adding `\"debug\"` to the list in the loop in `setup.js` is enough."),
      l(
        "`nano setup.js` (`[\"info\", \"warning\", \"error\"]` → `[\"debug\", \"info\", \"warning\", \"error\"]`), `node setup.js`, `node debug.js`",
        "`nano setup.js` (`[\"info\", \"warning\", \"error\"]` → `[\"debug\", \"info\", \"warning\", \"error\"]`), `node setup.js`, `node debug.js`",
      ),
    ],
    par: 3,
    check: (ctx) => reached(ctx, "debug", "all-logs") && lostSince(ctx).length === 0,
  },
  {
    id: "wrong-key",
    title: l("Yanlış key", "The wrong key"),
    story: l(
      "Sipariş onay e-postaları gitmiyor. Kurulum doğru: `emails` kuyruğu herkesin kullandığı `email` key'iyle bağlı. Sorun bu sefer senin yazdığın `checkout.js`'de.",
      "Order confirmation emails aren't going out. The setup is right: the `emails` queue is bound with `email`, the key everyone uses. This time the problem is in `checkout.js`, which you wrote.",
    ),
    goal: l(
      "`checkout.js`'nin gönderdiği mesaj `emails` kuyruğuna ulaşsın; kuruluma yeni bir binding **eklenmesin**.",
      "The message `checkout.js` sends reaches the `emails` queue, **without** adding a binding to the setup.",
    ),
    start: projectAfter({ "setup.js": tasksSetup("image"), "checkout.js": publish("tasks", "mail", "order 1001 confirmed") }, ["node setup.js"]),
    hints: [
      l("`cat checkout.js` ile hangi key'le gönderdiğine bak, sonra `list_bindings` ile karşılaştır.", "Check which key it sends with (`cat checkout.js`), then compare with `list_bindings`."),
      l("Herkesin kullandığı key doğruysa düzeltilecek olan gönderen taraf: `nano checkout.js`.", "If the key everyone uses is right, the sender is what needs fixing: `nano checkout.js`."),
      l(
        "`nano checkout.js` (`ch.publish(\"tasks\", \"mail\", …)` → `ch.publish(\"tasks\", \"email\", …)`), `node checkout.js`",
        "`nano checkout.js` (`ch.publish(\"tasks\", \"mail\", …)` → `ch.publish(\"tasks\", \"email\", …)`), `node checkout.js`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.queues.includes("emails") && e.message.body.includes("order 1001")) && ctx.state.bindings.length === ctx.start.bindings.length,
  },
];
