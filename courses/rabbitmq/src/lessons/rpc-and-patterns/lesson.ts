import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const CLIENT = `import pika, uuid

conn = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = conn.channel()

# A private, auto-named queue for this client's answers.
result = ch.queue_declare(queue="", exclusive=True)
reply_queue = result.method.queue

corr_id = str(uuid.uuid4())
ch.basic_publish(
    exchange="",
    routing_key="rpc",
    properties=pika.BasicProperties(reply_to=reply_queue, correlation_id=corr_id),
    body=b"fib 30",
)`;

const SERVER = `def on_request(ch, method, props, body):
    answer = handle(body)
    ch.basic_publish(
        exchange="",
        routing_key=props.reply_to,
        properties=pika.BasicProperties(correlation_id=props.correlation_id),
        body=answer,
    )
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.queue_declare(queue="rpc", durable=True)
ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="rpc", on_message_callback=on_request)
ch.start_consuming()`;

const MATCH = `answers = {}

def on_answer(ch, method, props, body):
    answers[props.correlation_id] = body   # match by id, not by order
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_consume(queue=reply_queue, on_message_callback=on_answer)`;

const TIMEOUT = `ch.basic_publish(
    exchange="", routing_key="rpc", body=b"fib 30",
    properties=pika.BasicProperties(
        reply_to=reply_queue, correlation_id=corr_id,
        expiration="5000",          # ms, as a string: drop it if nobody takes it in 5 s
    ),
)
conn.process_data_events(time_limit=5)   # wait at most 5 s for the answer
if corr_id not in answers:
    raise TimeoutError("no answer from the rpc server")`;

const DIRECT = `# Consume first, in no-ack mode: direct reply-to requires it.
ch.basic_consume(queue="amq.rabbitmq.reply-to", on_message_callback=on_answer, auto_ack=True)
ch.basic_publish(
    exchange="", routing_key="rpc", body=b"fib 30",
    properties=pika.BasicProperties(reply_to="amq.rabbitmq.reply-to", correlation_id=corr_id),
)`;

export const rpcAndPatterns: Lesson = {
  slug: "rpc-and-patterns",
  title: l("RPC ve desenler", "RPC and patterns"),
  summary: l(
    "Kuyruklar üzerinden soru sor, cevap al: reply_to, correlation_id ve zaman aşımı. Sonra bütün desenleri yan yana gör: work queue, pub/sub, routing, RPC.",
    "Ask and answer over queues: reply_to, correlation_id and timeouts. Then see all the patterns side by side: work queue, pub/sub, routing, RPC.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("İsteğin cevabın nereye gideceğini (reply_to) taşıdığını görmek", "See a request carry where its answer goes (reply_to)"), step: 1 },
    { text: l("Cevapları sıraya değil correlation id'ye göre eşleştirmek", "Match answers by correlation id, not by order"), step: 4 },
    { text: l("Cevapsız kalan isteğe zaman aşımı koymak", "Put a timeout on a request nobody answers"), step: 5 },
    { text: l("Hangi desenin ne zaman kullanılacağını bilmek", "Know which pattern to use when"), step: 7 },
  ],
  steps: [
    {
      short: l("Soru-cevap", "Ask and answer"),
      tag: "how",
      title: l("Kuyruk üzerinden soru sormak", "Asking a question over a queue"),
      body: [
        l(
          "Şimdiye kadar mesajlar tek yönlüydü: gönderen cevap beklemiyordu. Bazen bir cevap gerekir: \"bu siparişin vergisini hesapla ve bana söyle\". Buna RPC (remote procedure call) denir.",
          "So far messages went one way: the sender expected no answer. Sometimes you need one: \"work out this order's tax and tell me\". That is RPC (remote procedure call).",
        ),
        l(
          "Sahnede iki kuyruk var: istekler için `rpc`, cevaplar için istemcinin kendi `reply` kuyruğu. İki sunucu `rpc`'yi dinliyor, istemci de `reply`'ı. Aynı istemci solda istek gönderen, sağda cevap alan olarak görünüyor.",
          "There are two queues: `rpc` for requests and the client's own `reply` queue for answers. Two servers listen to `rpc`, the client listens to `reply`. The same client appears on the left sending and on the right receiving.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_queues name messages consumers", note: l("İstek kuyruğunu ve kaç sunucunun dinlediğini gösterir.", "Shows the request queue and how many servers listen to it.") }],
      },
    },
    {
      short: l("İstek", "Request"),
      tag: "how",
      predict: {
        question: l(
          "İstemci bir istek gönderdi ve Sunucu 1 aldı. Sunucu cevabı **nereye** göndereceğini nereden bilir?",
          "The client sent a request and Server 1 got it. How does the server know **where** to send the answer?",
        ),
        options: [
          l("Her zaman `rpc` kuyruğuna geri yazar", "It always writes back to the `rpc` queue"),
          l("İsteğin üstündeki `reply_to` alanından", "From the request's `reply_to` field"),
          l("İstemciye doğrudan bağlanır", "It connects to the client directly"),
        ],
        answer: 1,
        why: l(
          "İstek kendi dönüş adresini taşır: `reply_to=\"reply\"`. Sunucu istemciyi tanımak zorunda değil; sadece o adrese yazar.",
          "The request carries its own return address: `reply_to=\"reply\"`. The server does not need to know the client; it just writes to that address.",
        ),
      },
      title: l("İstek, dönüş adresini taşır", "A request carries its return address"),
      body: [
        l(
          "İstemci `r1` isteğini `rpc` kuyruğuna gönderdi. Mesajın üstünde iki özellik var: `reply_to=\"reply\"` (cevabı nereye yaz) ve `correlation_id=\"c1\"` (bu hangi soru).",
          "The client sent request `r1` to the `rpc` queue. It carries two properties: `reply_to=\"reply\"` (where to write the answer) and `correlation_id=\"c1\"` (which question this is).",
        ),
        l(
          "Sunucu 1 isteği aldı ve elinde tutuyor (prefetch 1). Ack'lemeden önce cevabı gönderecek.",
          "Server 1 took the request and holds it (prefetch 1). It will send the answer before acking.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · istemci (istek)", code: CLIENT, note: l("`queue=\"\"` ve `exclusive=True`: RabbitMQ bu bağlantıya özel, adını kendisi veren (`amq.gen-…`) bir kuyruk açar; bağlantı kapanınca silinir.", "`queue=\"\"` with `exclusive=True`: RabbitMQ opens a queue just for this connection, with a generated name (`amq.gen-…`); it is deleted when the connection closes.") }],
      },
    },
    {
      short: l("Cevap", "Answer"),
      tag: "how",
      title: l("Sunucu cevabı istemcinin kuyruğuna yazar", "The server writes the answer to the client's queue"),
      body: [
        l(
          "Sunucu işini yaptı ve cevabı `reply_to`'daki kuyruğa, default exchange üzerinden gönderdi. Cevaba isteğin `correlation_id`'sini (`c1`) aynen kopyaladı.",
          "The server did its work and sent the answer to the `reply_to` queue through the default exchange. It copied the request's `correlation_id` (`c1`) onto the answer.",
        ),
        l(
          "Sonra isteği ack'ledi. Sıra önemli: önce cevap, sonra ack. Ack'ten önce çökerse istek kuyruğa döner ve başka bir sunucu cevaplar.",
          "Then it acked the request. The order matters: answer first, then ack. If it crashes before acking, the request goes back and another server answers it.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · sunucu", code: SERVER }],
      },
    },
    {
      short: l("Eşleştir", "Match"),
      tag: "how",
      title: l("İstemci cevabı alır", "The client gets the answer"),
      body: [
        l(
          "Cevap `reply` kuyruğundan istemciye geldi; istemci `correlation_id`'ye baktı: `c1`, yani sorduğu soru. Ack'ledi ve iş bitti.",
          "The answer came to the client from `reply`; it checked the `correlation_id`: `c1`, the question it asked. It acked, and the round trip is done.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · cevapları eşleştir", code: MATCH }],
      },
    },
    {
      short: l("Sıra", "Order"),
      tag: "experiment",
      predict: {
        question: l(
          "İstemci peş peşe iki istek gönderecek: `c2` ve `c3`. Biri Sunucu 2'ye, diğeri Sunucu 1'e gidecek; Sunucu 1 daha hızlı. Cevaplar hangi sırayla gelir?",
          "The client will send two requests in a row: `c2` and `c3`. One goes to Server 2, the other to Server 1, and Server 1 is quicker. In which order do the answers arrive?",
        ),
        options: [
          l("Her zaman gönderildiği sırayla: önce c2", "Always in sending order: c2 first"),
          l("Hızlı sunucunun cevabı önce: c3, sonra c2", "The quick server's first: c3, then c2"),
          l("Aynı anda tek mesaj olarak", "Together as one message"),
        ],
        answer: 1,
        why: l(
          "Cevaplar, sunucular bitirdikçe gelir. Bu yüzden istemci cevabı sırasına bakarak değil, `correlation_id`'ye bakarak eşleştirmeli.",
          "Answers arrive as servers finish. That is why the client must match each answer by its `correlation_id`, not by its position.",
        ),
      },
      title: l("Cevaplar sırayla gelmek zorunda değil", "Answers do not have to arrive in order"),
      body: [
        l(
          "`c2` Sunucu 2'ye, `c3` Sunucu 1'e gitti. Sunucu 1 önce bitirdi: istemcinin eline önce `c3`'ün cevabı, sonra `c2`'ninki geldi.",
          "`c2` went to Server 2 and `c3` to Server 1. Server 1 finished first: the client got `c3`'s answer, then `c2`'s.",
        ),
        l(
          "Cevapları gelme sırasına göre okuyan istemci, yanlış soruya yanlış cevabı yapıştırırdı. `correlation_id` bu yüzden var.",
          "A client that read answers by arrival order would pin the wrong answer to the wrong question. That is why `correlation_id` exists.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · üretmek", code: "corr_id = str(uuid.uuid4())   # a new, unique id per request" }],
      },
    },
    {
      short: l("Zaman aşımı", "Timeout"),
      tag: "experiment",
      predict: {
        question: l(
          "İki sunucu da kapandı. İstemci TTL'i 3 olan bir istek gönderiyor. 3 tick sonra istek ne olur?",
          "Both servers are gone. The client sends a request with a TTL of 3. What happens to it after 3 ticks?",
        ),
        options: [
          l("Sonsuza kadar kuyrukta bekler", "It waits in the queue forever"),
          l("Süresi dolar ve kuyruktan atılır", "It expires and is dropped from the queue"),
          l("İstemciye boş bir cevap gider", "An empty answer goes to the client"),
        ],
        answer: 1,
        why: l(
          "Mesajın TTL'i (`expiration`) dolunca broker onu kuyruktan atar. Kimse cevap vermez; istemci de kendi tarafında beklemeyi bırakmalı.",
          "When the message's TTL (`expiration`) runs out, the broker drops it. Nobody answers; the client must stop waiting on its own side too.",
        ),
      },
      title: l("Cevap gelmezse: zaman aşımı", "When no answer comes: timeouts"),
      body: [
        l(
          "Sunucular kapandı ve yeni istek `rpc` kuyruğunda kaldı. TTL'i 3 tick'ti: süresi dolunca broker onu attı. Sayaçta \"Kayıp: 1\" yazıyor.",
          "The servers went away and the new request sat in `rpc`. Its TTL was 3 ticks: when it ran out, the broker dropped it. The counter says \"Lost: 1\".",
        ),
        l(
          "RPC'de her zaman **iki** zaman aşımı koy: isteğe `expiration` (bayat istek boşuna işlenmesin) ve istemcinin bekleme süresine bir sınır (sonsuza kadar asılı kalmasın).",
          "With RPC always set **two** timeouts: an `expiration` on the request (so a stale one is not processed for nothing) and a limit on how long the client waits (so it never hangs forever).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada zaman tick'lerle ilerliyor. Gerçekte `expiration` milisaniye cinsinden bir yazıdır (`\"5000\"`) ve mesajlar yalnızca kuyruğun başına gelince atılır.",
            "Time moves in ticks here. In reality `expiration` is a string of milliseconds (`\"5000\"`), and messages are only dropped when they reach the head of the queue.",
          ),
        },
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · iki zaman aşımı", code: TIMEOUT }],
      },
    },
    {
      short: l("Direct reply-to", "Direct reply-to"),
      tag: "reality",
      title: l("Her istemciye kuyruk açmadan: direct reply-to", "Without a queue per client: direct reply-to"),
      body: [
        l(
          "Her istemcinin kendi cevap kuyruğunu açması, çok sayıda kısa ömürlü istemcide broker'ı yorar. RabbitMQ'nun kısayolu: `reply_to=\"amq.rabbitmq.reply-to\"`.",
          "Every client opening its own reply queue strains the broker when there are many short-lived clients. RabbitMQ's shortcut: `reply_to=\"amq.rabbitmq.reply-to\"`.",
        ),
        l(
          "Bu sahte bir kuyruk adı: cevap kuyruk açılmadan doğrudan istemcinin kanalına gider. Şartı var: istemci önce bu adı **no-ack** (auto-ack) ile dinlemeli, istek de aynı kanaldan gönderilmeli.",
          "It is a pseudo-queue: the answer goes straight to the client's channel without a real queue. There is a catch: the client must first consume this name in **no-ack** (auto-ack) mode, and send the request on the same channel.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · direct reply-to", code: DIRECT }],
      },
    },
    {
      short: l("Desenler", "Patterns"),
      tag: "idea",
      title: l("Dört desen, bir bakışta", "Four patterns at a glance"),
      body: [
        l(
          "Bu kursta gördüğümüz her şey dört desene iner. **Work queue**: bir kuyruk, çok işçi; her iş bir kez yapılır. **Pub/Sub**: fanout ile her servisin kendi kuyruğu; herkes her olayı duyar.",
          "Everything in this course comes down to four patterns. **Work queue**: one queue, many workers; each job done once. **Pub/Sub**: a fanout with a queue per service; everyone hears every event.",
        ),
        l(
          "**Routing**: direct ya da topic exchange ile sadece ilgilenen kuyruklar alır. **RPC**: istek + `reply_to` + `correlation_id`; cevap gerekiyorsa ve beklemek sorun değilse.",
          "**Routing**: a direct or topic exchange so only interested queues receive. **RPC**: request + `reply_to` + `correlation_id`; when you need an answer and waiting is fine.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_exchanges name type", note: l("Kendi sisteminde hangi desenleri kurduğunu exchange türlerinden okuyabilirsin.", "You can read which patterns you built from your exchange types.") }],
      },
    },
    {
      short: l("Ne zaman değil", "When not to"),
      tag: "reality",
      title: l("RPC'yi ne zaman kullanmamalı?", "When not to use RPC"),
      body: [
        l(
          "Mesajlaşmanın gücü beklememek: producer gönderir ve işine devam eder. RPC bunu geri getirir, istemci yine bekler. Cevabı **hemen** bekleyen bir kullanıcı varsa düz bir HTTP/gRPC çağrısı genelde daha basit ve hızlıdır.",
          "The power of messaging is not waiting: the producer sends and moves on. RPC brings waiting back. If a user is waiting for the answer **right now**, a plain HTTP/gRPC call is usually simpler and faster.",
        ),
        l(
          "RPC'yi mesajla yapmak şu durumlarda mantıklı: sunucular gelip gidiyorsa, yük dalgalanıyorsa ve istekler bir süre kuyrukta bekleyebiliyorsa. Ama \"cevap gelecek mi?\" sorusunu her zaman zaman aşımıyla yanıtla.",
          "RPC over messaging makes sense when servers come and go, load swings, and requests can wait in a queue for a while. But always answer \"will a reply come?\" with a timeout.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Çoğu zaman en iyi çözüm cevabı beklemek değil, bir olay yayınlamaktır: \"vergi hesaplandı\" olayını isteyen servis dinler. Böylece kimse kimseyi beklemez.",
            "Often the best answer is not to wait at all but to publish an event: \"tax calculated\", which the interested service listens for. Then nobody waits for anybody.",
          ),
        },
      ],
      practice: {
        commands: [],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda bir fiyat servisi ve gerçek işten **4 senaryo** var: istekler `rpc` kuyruğuna gidiyor, sunucu cevabı isteğin `reply_to`'suna, aynı `correlation_id` ile yazıyor. Senaryolarda bu zincirin bir halkası kopuk.",
          "Your turn. Below is a price service and **4 scenarios** from real work: requests go to the `rpc` queue, and the server writes each answer to the request's `reply_to`, with the same `correlation_id`. In each scenario one link of that chain is broken.",
        ),
        l(
          "`rabbitmqctl list_queues name messages consumers` ile bak, `nano` ile `server.py` ya da `client.py`'yi düzelt, `python` ile çalıştır. Sunucu başlatılınca arka planda çalışır.",
          "Look with `rabbitmqctl list_queues name messages consumers`, fix `server.py` or `client.py` with `nano`, run with `python`. Once started, the server keeps running in the background.",
        ),
      ],
    },
  ],
  recap: [
    l("RPC'de istek, cevabın gideceği kuyruğu (`reply_to`) ve kendi kimliğini (`correlation_id`) taşır.", "In RPC a request carries the queue for its answer (`reply_to`) and its own id (`correlation_id`)."),
    l("Sunucu cevabı default exchange ile `reply_to` kuyruğuna yazar, sonra isteği ack'ler.", "The server writes the answer to the `reply_to` queue via the default exchange, then acks the request."),
    l("Cevaplar sırasız gelebilir: istemci onları `correlation_id` ile eşleştirir.", "Answers can arrive out of order: the client matches them by `correlation_id`."),
    l("Her zaman iki zaman aşımı koy: isteğe `expiration` ve istemcinin beklemesine bir sınır.", "Always set two timeouts: `expiration` on the request and a limit on the client's wait."),
    l("`amq.rabbitmq.reply-to` her istemciye kuyruk açmadan cevap almayı sağlar (no-ack ile).", "`amq.rabbitmq.reply-to` delivers answers without a queue per client (in no-ack mode)."),
    l("Dört desen: work queue, pub/sub, routing, RPC. Kullanıcı cevabı hemen bekliyorsa RPC yerine düz bir çağrı düşün.", "Four patterns: work queue, pub/sub, routing, RPC. If a user waits for the answer right now, consider a plain call instead of RPC."),
  ],
  quiz: [
    {
      question: l("Sunucu cevabı hangi kuyruğa göndereceğini nereden bilir?", "How does the server know which queue to send the answer to?"),
      options: [l("`correlation_id`'den", "From `correlation_id`"), l("İsteğin `reply_to` özelliğinden", "From the request's `reply_to` property"), l("Exchange'in adından", "From the exchange's name"), l("Her zaman `rpc` kuyruğuna yazar", "It always writes to `rpc`")],
      answer: 1,
      explain: l("`reply_to` dönüş adresidir; `correlation_id` ise hangi soruya ait olduğunu söyler.", "`reply_to` is the return address; `correlation_id` says which question it belongs to."),
      reviewStep: 1,
    },
    {
      question: l("İstemci 3 istek gönderdi; cevaplar c2, c3, c1 sırasıyla geldi. İstemci ne yapmalı?", "A client sent 3 requests; answers came as c2, c3, c1. What should it do?"),
      options: [
        l("İlk gelen cevabı ilk isteğe yazmak", "Pin the first answer to the first request"),
        l("Her cevabı `correlation_id`'sine göre doğru isteğe eşlemek", "Match each answer to its request by `correlation_id`"),
        l("Cevapları atıp istekleri yeniden göndermek", "Throw them away and resend"),
        l("Sunucuya hata bildirmek", "Report an error to the server"),
      ],
      answer: 1,
      explain: l("Cevaplar sunucular bitirdikçe gelir; sıra garantisi yoktur.", "Answers arrive as servers finish; there is no order guarantee."),
      reviewStep: 4,
    },
    {
      question: l("Hiçbir sunucu ayakta değilken, `expiration` koymadan gönderilen bir isteğe ne olur?", "With no server up, what happens to a request sent without an `expiration`?"),
      options: [
        l("Kuyrukta bekler; sunucu dönünce, belki çok geç, işlenir", "It waits; when a server returns it is processed, maybe far too late"),
        l("Hemen silinir", "It is deleted at once"),
        l("İstemciye hata döner", "An error goes back to the client"),
        l("Başka bir kuyruğa taşınır", "It moves to another queue"),
      ],
      answer: 0,
      explain: l("Süresi olmayan mesaj sonsuza kadar bekler. İstemci çoktan vazgeçmiş olsa bile sunucu onu sonra işler.", "A message with no expiry waits forever. The server processes it later even if the client gave up long ago."),
      reviewStep: 5,
    },
    {
      question: l("Hangi durumda RPC yerine bir olay yayınlamak daha iyidir?", "When is publishing an event better than RPC?"),
      options: [
        l("Gönderenin cevabı beklemesi gerekmiyorsa", "When the sender does not need to wait for an answer"),
        l("Cevap hemen gerekiyorsa", "When the answer is needed at once"),
        l("Tek bir sunucu varsa", "When there is only one server"),
        l("Mesajlar büyükse", "When messages are large"),
      ],
      answer: 0,
      explain: l("Cevap beklenmiyorsa RPC gereksiz bir bekleme ekler; olay yayınlayıp devam etmek daha esnektir.", "If no answer is needed, RPC adds pointless waiting; publish an event and move on."),
      reviewStep: 8,
    },
  ],
};
