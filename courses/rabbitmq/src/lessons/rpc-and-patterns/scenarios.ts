import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** The request queue `rpc` and the web client's reply queue `replies` (and any more reply queues). */
const setup = (...replyQueues: string[]) =>
  script(["rpc", "replies", ...replyQueues].map((q) => `ch.queue_declare(queue="${q}", durable=True)`).join("\n"));

/** A price server. `publish` is its answer line, so a scenario can start from a broken one. */
const server = (publish: string) => `import pika

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def on_request(ch, method, props, body):
    print(f" [.] price for {body.decode()}")
    ${publish}
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="rpc", on_message_callback=on_request)
print(" [x] Awaiting RPC requests")
ch.start_consuming()`;

const GOOD_ANSWER = 'ch.basic_publish(exchange="", routing_key=props.reply_to, properties=pika.BasicProperties(correlation_id=props.correlation_id), body=b"42.90")';

/** A client asking for a price; the answer is to go to `replyTo`, tagged with `corr`. */
const client = (replyTo: string, corr: string, extra = "") =>
  script(`ch.basic_publish(exchange="", routing_key="rpc", properties=pika.BasicProperties(reply_to="${replyTo}", correlation_id="${corr}"${extra}), body=b"sku-${corr}")`);

/** Free play: the queues, a working server and a client. */
export const FREE = projectAfter({ "setup.py": setup(), "server.py": server(GOOD_ANSWER), "client.py": client("replies", "c1") }, ["python setup.py"]);

/* ----------------------------------------------------------------- checks */

/** An answer reached `queue` carrying this correlation id. */
const answered = (ctx: RabbitCtx, queue: string, corr: string) =>
  eventsOf(ctx, "routed").some((e) => e.queues.includes(queue) && e.message.correlationId === corr);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "no-server",
    title: l("Kimse cevap vermiyor", "Nobody answers"),
    story: l(
      "Ödeme sayfası fiyat sorduğunda zaman aşımına düşüyor. İstek `rpc` kuyruğunda bekliyor ama `rabbitmqctl list_queues name messages consumers` acı gerçeği gösteriyor: fiyat sunucusu bu sabahki deploy'dan beri çalışmıyor.",
      "The checkout page times out when it asks for a price. The request is waiting in the `rpc` queue, but `rabbitmqctl list_queues name messages consumers` shows the sad truth: the price server hasn't run since this morning's deploy.",
    ),
    goal: l("Bekleyen `c1` isteğinin cevabı `replies` kuyruğuna ulaşsın.", "The answer to the waiting request `c1` reaches the `replies` queue."),
    start: projectAfter({ "setup.py": setup(), "server.py": server(GOOD_ANSWER), "client.py": client("replies", "c1") }, ["python setup.py", "python client.py"]),
    hints: [
      l("`consumers` sütunu 0: istek kuyrukta bekliyor, kimse almıyor.", "The `consumers` column is 0: the request waits in the queue and nobody takes it."),
      l("Sunucu bir Python dosyası; başlatınca arka planda çalışır ve bekleyen isteği hemen alır.", "The server is a Python file; started, it runs in the background and picks up the waiting request at once."),
      l("`python server.py`", "`python server.py`"),
    ],
    par: 1,
    check: (ctx) => answered(ctx, "replies", "c1"),
  },
  {
    id: "wrong-reply-queue",
    title: l("Başkasının kutusu", "Someone else's mailbox"),
    story: l(
      "Mobil uygulama artık kendi cevap kuyruğunu (`replies-mobile`) kullanıyor ve isteğinde `reply_to` ile bunu söylüyor. Ama mobil kullanıcılar hiç fiyat görmüyor: sunucu cevabı her zaman `replies`'a yazıyor. Mobilin `c7` isteği `rpc`'de bekliyor; sunucu şu an kapalı.",
      "The mobile app now uses its own reply queue (`replies-mobile`) and says so in its request with `reply_to`. But mobile users never see a price: the server always writes the answer to `replies`. The mobile request `c7` is waiting in `rpc`; the server is down right now.",
    ),
    goal: l("`c7`'nin cevabı `replies-mobile`'a ulaşsın.", "The answer to `c7` reaches `replies-mobile`."),
    start: projectAfter(
      {
        "setup.py": setup("replies-mobile"),
        "server.py": server('ch.basic_publish(exchange="", routing_key="replies", properties=pika.BasicProperties(correlation_id=props.correlation_id), body=b"42.90")'),
        "mobile.py": client("replies-mobile", "c7"),
      },
      ["python setup.py", "python mobile.py"],
    ),
    hints: [
      l("RPC'de cevabın nereye gideceğini istemci söyler, sunucu değil.", "In RPC the client says where the answer goes, not the server."),
      l("Sunucu, `routing_key` olarak sabit bir kuyruk yerine isteğin `props.reply_to`'sunu kullanmalı.", "The server should use the request's `props.reply_to` as its `routing_key`, not a fixed queue."),
      l("`nano server.py` (`routing_key=props.reply_to`), `python server.py`", "`nano server.py` (`routing_key=props.reply_to`), `python server.py`"),
    ],
    par: 2,
    check: (ctx) => answered(ctx, "replies-mobile", "c7"),
  },
  {
    id: "lost-correlation",
    title: l("Hangi cevap kimin?", "Whose answer is it?"),
    story: l(
      "İstemci aynı anda iki fiyat soruyor (`c1` ve `c2`) ve cevapları correlation id'ye bakarak eşleştiriyor. Yeni sunucu kodu cevap veriyor ama correlation id'yi koymuyor: istemci gelen cevabın hangi soruya ait olduğunu bilemiyor ve ikisini de atıyor. İki istek `rpc`'de bekliyor.",
      "The client asks for two prices at once (`c1` and `c2`) and matches the answers by correlation id. The new server code answers but leaves the correlation id out: the client can't tell which question an answer belongs to and throws both away. Both requests are waiting in `rpc`.",
    ),
    goal: l("`replies`'a `c1` ve `c2` correlation id'li iki cevap ulaşsın.", "Two answers, with correlation ids `c1` and `c2`, reach `replies`."),
    start: projectAfter(
      {
        "setup.py": setup(),
        "server.py": server('ch.basic_publish(exchange="", routing_key=props.reply_to, body=b"42.90")'),
        "client.py": script(`for c in ["c1", "c2"]:\n    ch.basic_publish(exchange="", routing_key="rpc", properties=pika.BasicProperties(reply_to="replies", correlation_id=c), body=b"sku")`),
      },
      ["python setup.py", "python client.py"],
    ),
    hints: [
      l("Correlation id isteğin `props`'unda geliyor; sunucunun onu cevaba aynen koyması gerekir.", "The correlation id arrives in the request's `props`; the server must put it on the answer as is."),
      l("Cevabın `basic_publish`'ine `properties=pika.BasicProperties(correlation_id=props.correlation_id)` ekle ve sunucuyu başlat.", "Add `properties=pika.BasicProperties(correlation_id=props.correlation_id)` to the answer's `basic_publish` and start the server."),
      l("`nano server.py`, `python server.py`", "`nano server.py`, `python server.py`"),
    ],
    par: 2,
    check: (ctx) => answered(ctx, "replies", "c1") && answered(ctx, "replies", "c2"),
  },
  {
    id: "stale-requests",
    title: l("Bayat istekler", "Stale requests"),
    story: l(
      "Fiyat sunucuları gece bakımda. Ödeme sayfası 5 saniye sonra zaten vazgeçiyor, ama istekler `rpc`'de birikiyor ve sabah sunucular açılınca saatlerce eski fiyatlar hesaplanıyor. 5 saniyede cevaplanmayan istek kendiliğinden kaybolsun.",
      "The price servers are down for maintenance tonight. The checkout page gives up after 5 seconds anyway, but requests pile up in `rpc`, and in the morning the servers spend hours computing stale prices. A request not answered within 5 seconds should disappear on its own.",
    ),
    goal: l(
      "`client.py`'nin isteği 5 saniye içinde cevapsız kalınca `rpc`'den kendiliğinden silinsin; sonunda `rpc` boş olsun.",
      "When `client.py`'s request goes unanswered for 5 seconds, it leaves `rpc` on its own; `rpc` is empty at the end.",
    ),
    start: projectAfter({ "setup.py": setup(), "client.py": client("replies", "c9") }, ["python setup.py"]),
    hints: [
      l("Bir mesaj kendi ömrünü taşıyabilir: `expiration` özelliği, milisaniye cinsinden, metin olarak.", "A message can carry its own lifetime: the `expiration` property, in milliseconds, as a string."),
      l("İstemcinin `BasicProperties`'ine `expiration=\"5000\"` ekle, gönder ve zamanın geçmesini bekle.", "Add `expiration=\"5000\"` to the client's `BasicProperties`, send, and let the time pass."),
      l("`nano client.py` (`expiration=\"5000\"`), `python client.py`, `sleep 5`", "`nano client.py` (`expiration=\"5000\"`), `python client.py`, `sleep 5`"),
    ],
    par: 3,
    check: (ctx) =>
      eventsOf(ctx, "routed").some((e) => e.queues.includes("rpc")) &&
      eventsOf(ctx, "deadLettered").some((e) => e.from === "rpc" && e.reason === "expired") &&
      depth(ctx.state, "rpc").total === 0,
  },
];
