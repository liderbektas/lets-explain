import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/**
 * setup.py: an `unrouted` fanout exchange with a `lost-found` queue, and a `docs` headers
 * exchange whose `pdf` queue takes every PDF. `extra` adds lines at the end.
 */
export const docsSetup = (opts: { alternate?: boolean; queues?: string[]; extra?: string } = {}) =>
  script(`
ch.exchange_declare(exchange="unrouted", exchange_type="fanout", durable=True)
ch.queue_declare(queue="lost-found", durable=True)
ch.queue_bind(exchange="unrouted", queue="lost-found")

ch.exchange_declare(exchange="docs", exchange_type="headers", durable=True${opts.alternate ? ', arguments={"alternate-exchange": "unrouted"}' : ""})
ch.queue_declare(queue="pdf", durable=True)
ch.queue_bind(exchange="docs", queue="pdf", arguments={"x-match": "all", "format": "pdf"})
${(opts.queues ?? []).map((q) => `ch.queue_declare(queue="${q}", durable=True)`).join("\n")}
${opts.extra ?? ""}
`);

/** The archive uploads one document of each kind, labelled `format/region`. */
const doc = (format: string, region: string) =>
  `ch.basic_publish(exchange="docs", routing_key="", body=b"${format}/${region}", properties=pika.BasicProperties(headers={"format": "${format}", "region": "${region}"}))`;
const UPLOAD = script([doc("pdf", "eu"), doc("pdf", "us"), doc("csv", "eu"), doc("csv", "us")].join("\n"));

/** Free play: the docs project with its alternate already set. */
export const FREE = projectAfter({ "setup.py": docsSetup({ alternate: true, queues: ["pdf-eu"] }), "upload.py": UPLOAD }, ["python setup.py"]);

/** Documents that reached a queue during the scenario. */
const got = (ctx: RabbitCtx, queue: string) => new Set(eventsOf(ctx, "routed").filter((e) => e.queues.includes(queue)).map((e) => e.message.body));
const exactly = (ctx: RabbitCtx, queue: string, docs: string[]) => {
  const g = got(ctx, queue);
  return g.size === docs.length && docs.every((d) => g.has(d));
};

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "eu-pdfs",
    title: l("Sadece AB PDF'leri", "EU PDFs only"),
    story: l(
      "Hukuk ekibi yeni `pdf-eu` kuyruğunda yalnızca Avrupa'dan gelen PDF'leri görmek istiyor. Belgeler `docs` headers exchange'ine `format` ve `region` header'larıyla geliyor; routing key boş. Kuyruk tanımlı ama henüz bağlı değil.",
      "The legal team wants only PDFs from Europe in the new `pdf-eu` queue. Documents come to the `docs` headers exchange with `format` and `region` headers; the routing key is empty. The queue is declared but not bound yet.",
    ),
    goal: l("`upload.py`'nin 4 belgesinden `pdf-eu`'ya **sadece** `pdf/eu` gitsin.", "Of the 4 documents `upload.py` sends, **only** `pdf/eu` reaches `pdf-eu`."),
    start: projectAfter({ "setup.py": docsSetup({ queues: ["pdf-eu"] }), "upload.py": UPLOAD }, ["python setup.py"]),
    hints: [
      l(
        "Headers binding'i `arguments` ile kurulur: header'lar ve bir `x-match` kuralı. `pdf` kuyruğunun binding'ine bak.",
        "A headers binding is made with `arguments`: the headers and an `x-match` rule. Look at the `pdf` queue's binding.",
      ),
      l("İki header'ın **ikisi de** uymalı: `x-match` `all` olmalı.", "**Both** headers must match: `x-match` must be `all`."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(exchange=\"docs\", queue=\"pdf-eu\", arguments={\"x-match\": \"all\", \"format\": \"pdf\", \"region\": \"eu\"})`), `python setup.py`, `python upload.py`",
        "`nano setup.py` (add: `ch.queue_bind(exchange=\"docs\", queue=\"pdf-eu\", arguments={\"x-match\": \"all\", \"format\": \"pdf\", \"region\": \"eu\"})`), `python setup.py`, `python upload.py`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "pdf-eu", ["pdf/eu"]),
  },
  {
    id: "gdpr-review",
    title: l("KVKK incelemesi", "GDPR review"),
    story: l(
      "Uyum ekibi `review` kuyruğuna inceleme için iki tür belge istiyor: her PDF (imzalı olabilir) ve Avrupa'dan gelen her belge (kişisel veri olabilir). İkisi de olmayan, yani ABD'den gelen CSV'ler onları ilgilendirmiyor.",
      "Compliance wants two kinds of documents in the `review` queue: every PDF (it may be signed) and every document from Europe (it may hold personal data). Ones that are neither, US CSVs, are of no interest.",
    ),
    goal: l("`review`'a `pdf/eu`, `pdf/us` ve `csv/eu` gitsin, `csv/us` gitmesin.", "`review` gets `pdf/eu`, `pdf/us` and `csv/eu`, but not `csv/us`."),
    start: projectAfter({ "setup.py": docsSetup({ queues: ["review"] }), "upload.py": UPLOAD }, ["python setup.py"]),
    hints: [
      l("Aynı header listesi, farklı `x-match` ile bambaşka sonuç verir.", "The same header list with a different `x-match` gives a very different result."),
      l("Header'lardan **biri** uysa yeter: `x-match: any`.", "**One** matching header is enough: `x-match: any`."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(exchange=\"docs\", queue=\"review\", arguments={\"x-match\": \"any\", \"format\": \"pdf\", \"region\": \"eu\"})`), `python setup.py`, `python upload.py`",
        "`nano setup.py` (add: `ch.queue_bind(exchange=\"docs\", queue=\"review\", arguments={\"x-match\": \"any\", \"format\": \"pdf\", \"region\": \"eu\"})`), `python setup.py`, `python upload.py`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "review", ["pdf/eu", "pdf/us", "csv/eu"]),
  },
  {
    id: "lost-and-found",
    title: l("Kayıp eşya", "Lost and found"),
    story: l(
      "`docs` bugün yeni sunucuda canlıya çıkacak; kurulum henüz çalıştırılmadı. Testte ABD'den gelen CSV'ler hiçbir binding'e uymadığı için iz bırakmadan kayboldu. `setup.py` bir `unrouted` exchange'i ve `lost-found` kuyruğu kuruyor ama `docs` onlara bağlı değil.",
      "`docs` goes live on the new server today; the setup hasn't run yet. In testing, US CSVs matched no binding and vanished without a trace. `setup.py` builds an `unrouted` exchange and a `lost-found` queue, but `docs` isn't connected to them.",
    ),
    goal: l("Canlıya çık ve yüklemeyi çalıştır: `csv/us` `lost-found`'a düşsün, hiçbir belge kaybolmasın.", "Go live and run the upload: `csv/us` lands in `lost-found` and no document is lost."),
    start: projectAfter({ "setup.py": docsSetup(), "upload.py": UPLOAD }),
    hints: [
      l(
        "Bir exchange'e **alternate exchange** verilirse, hiçbir binding'e uymayan mesajlar oraya gider. Bu, exchange tanımlanırken `arguments` ile verilir.",
        "Give an exchange an **alternate exchange** and messages that match no binding go there instead. It's set with `arguments` when the exchange is declared.",
      ),
      l(
        "Önce `setup.py`'yi düzelt, **sonra** çalıştır: var olan bir exchange'i farklı argümanlarla yeniden tanımlamak reddedilir.",
        "Fix `setup.py` first, **then** run it: redeclaring an existing exchange with different arguments is refused.",
      ),
      l(
        "`nano setup.py` (`exchange_type=\"headers\", durable=True)` → `exchange_type=\"headers\", durable=True, arguments={\"alternate-exchange\": \"unrouted\"})`), `python setup.py`, `python upload.py`",
        "`nano setup.py` (`exchange_type=\"headers\", durable=True)` → `exchange_type=\"headers\", durable=True, arguments={\"alternate-exchange\": \"unrouted\"})`), `python setup.py`, `python upload.py`",
      ),
    ],
    par: 3,
    check: (ctx) => got(ctx, "lost-found").has("csv/us") && got(ctx, "pdf").has("pdf/eu") && lostSince(ctx).length === 0,
  },
  {
    id: "returned-refund",
    title: l("Geri dönen iade", "The returned refund"),
    story: l(
      "`send_refund.py` iadeleri `orders` exchange'ine `refund` key'iyle gönderiyor ama bu key'e bağlı bir kuyruk yok: iadeler sessizce kayboluyor ve kimse fark etmiyor. Fatura ekibi kuyruğunu yarın kuracak; o zamana kadar betik en azından mesajın bir yere ulaşmadığını **öğrenmeli**.",
      "`send_refund.py` sends refunds to the `orders` exchange with the key `refund`, but no queue is bound to that key: refunds vanish silently and nobody notices. The billing team will set up their queue tomorrow; until then the script must at least **find out** the message reached nowhere.",
    ),
    goal: l("İade mesajı sessizce atılmasın, broker onu gönderene geri versin.", "The refund isn't silently dropped; the broker hands it back to the sender."),
    start: projectAfter(
      {
        "setup.py": script(`
ch.exchange_declare(exchange="orders", exchange_type="direct", durable=True)
ch.queue_declare(queue="billing", durable=True)
ch.queue_bind(queue="billing", exchange="orders", routing_key="invoice")
`),
        "send_refund.py": script(`ch.basic_publish(exchange="orders", routing_key="refund", body=b"refund for order 1001")`),
      },
      ["python setup.py"],
    ),
    hints: [
      l("Varsayılan olarak yönlendirilemeyen mesaj atılır ve gönderen bunu bilmez.", "By default an unroutable message is dropped and the sender never knows."),
      l(
        "`basic_publish`'e `mandatory=True` verilirse broker mesajı geri döndürür. `ch.confirm_delivery()` açıksa pika bunu `UnroutableError` olarak fırlatır.",
        "With `mandatory=True` on `basic_publish`, the broker returns the message. With `ch.confirm_delivery()` on, pika raises it as an `UnroutableError`.",
      ),
      l(
        "`nano send_refund.py` (`body=b\"refund for order 1001\")` → `body=b\"refund for order 1001\", mandatory=True)`, istersen önüne `ch.confirm_delivery()`), `python send_refund.py`",
        "`nano send_refund.py` (`body=b\"refund for order 1001\")` → `body=b\"refund for order 1001\", mandatory=True)`, with `ch.confirm_delivery()` before it if you like), `python send_refund.py`",
      ),
    ],
    par: 2,
    check: (ctx) => eventsOf(ctx, "unroutable").some((e) => e.returned && e.message.body.startsWith("refund")) && lostSince(ctx).length === 0,
  },
];
