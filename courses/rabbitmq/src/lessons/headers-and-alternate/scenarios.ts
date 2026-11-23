import { l } from "@lets-explain/core/i18n";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/**
 * setup.js: an `unrouted` fanout exchange with a `lost-found` queue, and a `docs` headers
 * exchange whose `pdf` queue takes every PDF. `extra` adds lines at the end.
 */
export const docsSetup = (opts: { alternate?: boolean; queues?: string[]; extra?: string } = {}) =>
  script(`
await ch.assertExchange("unrouted", "fanout");
await ch.assertQueue("lost-found");
await ch.bindQueue("lost-found", "unrouted", "");

await ch.assertExchange("docs", "headers"${opts.alternate ? ', { alternateExchange: "unrouted" }' : ""});
await ch.assertQueue("pdf");
await ch.bindQueue("pdf", "docs", "", { "x-match": "all", format: "pdf" });
${(opts.queues ?? []).map((q) => `await ch.assertQueue("${q}");`).join("\n")}
${opts.extra ?? ""}
`);

/** The archive uploads one document of each kind, labelled `format/region`. */
const doc = (format: string, region: string) =>
  `ch.publish("docs", "", Buffer.from("${format}/${region}"), { headers: { format: "${format}", region: "${region}" } });`;
const UPLOAD = script([doc("pdf", "eu"), doc("pdf", "us"), doc("csv", "eu"), doc("csv", "us")].join("\n"));

/** Free play: the docs project with its alternate already set. */
export const FREE = projectAfter({ "setup.js": docsSetup({ alternate: true, queues: ["pdf-eu"] }), "upload.js": UPLOAD }, ["node setup.js"]);

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
    goal: l("`upload.js`'nin 4 belgesinden `pdf-eu`'ya **sadece** `pdf/eu` gitsin.", "Of the 4 documents `upload.js` sends, **only** `pdf/eu` reaches `pdf-eu`."),
    start: projectAfter({ "setup.js": docsSetup({ queues: ["pdf-eu"] }), "upload.js": UPLOAD }, ["node setup.js"]),
    hints: [
      l(
        "Headers binding'i `bindQueue`'nun son argümanıyla kurulur: header'lar ve bir `x-match` kuralı. `pdf` kuyruğunun binding'ine bak.",
        "A headers binding is made with `bindQueue`'s last argument: the headers and an `x-match` rule. Look at the `pdf` queue's binding.",
      ),
      l("İki header'ın **ikisi de** uymalı: `x-match` `all` olmalı.", "**Both** headers must match: `x-match` must be `all`."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"pdf-eu\", \"docs\", \"\", { \"x-match\": \"all\", format: \"pdf\", region: \"eu\" });`), `node setup.js`, `node upload.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"pdf-eu\", \"docs\", \"\", { \"x-match\": \"all\", format: \"pdf\", region: \"eu\" });`), `node setup.js`, `node upload.js`",
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
    start: projectAfter({ "setup.js": docsSetup({ queues: ["review"] }), "upload.js": UPLOAD }, ["node setup.js"]),
    hints: [
      l("Aynı header listesi, farklı `x-match` ile bambaşka sonuç verir.", "The same header list with a different `x-match` gives a very different result."),
      l("Header'lardan **biri** uysa yeter: `x-match: any`.", "**One** matching header is enough: `x-match: any`."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"review\", \"docs\", \"\", { \"x-match\": \"any\", format: \"pdf\", region: \"eu\" });`), `node setup.js`, `node upload.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"review\", \"docs\", \"\", { \"x-match\": \"any\", format: \"pdf\", region: \"eu\" });`), `node setup.js`, `node upload.js`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "review", ["pdf/eu", "pdf/us", "csv/eu"]),
  },
  {
    id: "lost-and-found",
    title: l("Kayıp eşya", "Lost and found"),
    story: l(
      "`docs` bugün yeni sunucuda canlıya çıkacak; kurulum henüz çalıştırılmadı. Testte ABD'den gelen CSV'ler hiçbir binding'e uymadığı için iz bırakmadan kayboldu. `setup.js` bir `unrouted` exchange'i ve `lost-found` kuyruğu kuruyor ama `docs` onlara bağlı değil.",
      "`docs` goes live on the new server today; the setup hasn't run yet. In testing, US CSVs matched no binding and vanished without a trace. `setup.js` builds an `unrouted` exchange and a `lost-found` queue, but `docs` isn't connected to them.",
    ),
    goal: l("Canlıya çık ve yüklemeyi çalıştır: `csv/us` `lost-found`'a düşsün, hiçbir belge kaybolmasın.", "Go live and run the upload: `csv/us` lands in `lost-found` and no document is lost."),
    start: projectAfter({ "setup.js": docsSetup(), "upload.js": UPLOAD }),
    hints: [
      l(
        "Bir exchange'e **alternate exchange** verilirse, hiçbir binding'e uymayan mesajlar oraya gider. Bu, exchange tanımlanırken verilir: amqplib'de `alternateExchange` seçeneği.",
        "Give an exchange an **alternate exchange** and messages that match no binding go there instead. It's set when the exchange is declared: amqplib's `alternateExchange` option.",
      ),
      l(
        "Önce `setup.js`'yi düzelt, **sonra** çalıştır: var olan bir exchange'i farklı argümanlarla yeniden tanımlamak reddedilir.",
        "Fix `setup.js` first, **then** run it: redeclaring an existing exchange with different arguments is refused.",
      ),
      l(
        "`nano setup.js` (`assertExchange(\"docs\", \"headers\")` → `assertExchange(\"docs\", \"headers\", { alternateExchange: \"unrouted\" })`), `node setup.js`, `node upload.js`",
        "`nano setup.js` (`assertExchange(\"docs\", \"headers\")` → `assertExchange(\"docs\", \"headers\", { alternateExchange: \"unrouted\" })`), `node setup.js`, `node upload.js`",
      ),
    ],
    par: 3,
    check: (ctx) => got(ctx, "lost-found").has("csv/us") && got(ctx, "pdf").has("pdf/eu") && lostSince(ctx).length === 0,
  },
  {
    id: "returned-refund",
    title: l("Geri dönen iade", "The returned refund"),
    story: l(
      "`send_refund.js` iadeleri `orders` exchange'ine `refund` key'iyle gönderiyor ama bu key'e bağlı bir kuyruk yok: iadeler sessizce kayboluyor ve kimse fark etmiyor. Fatura ekibi kuyruğunu yarın kuracak; o zamana kadar betik en azından mesajın bir yere ulaşmadığını **öğrenmeli**.",
      "`send_refund.js` sends refunds to the `orders` exchange with the key `refund`, but no queue is bound to that key: refunds vanish silently and nobody notices. The billing team will set up their queue tomorrow; until then the script must at least **find out** the message reached nowhere.",
    ),
    goal: l("İade mesajı sessizce atılmasın, broker onu gönderene geri versin.", "The refund isn't silently dropped; the broker hands it back to the sender."),
    start: projectAfter(
      {
        "setup.js": script(`
await ch.assertExchange("orders", "direct");
await ch.assertQueue("billing");
await ch.bindQueue("billing", "orders", "invoice");
`),
        "send_refund.js": script(`
ch.on("return", (msg) => console.log(\`returned: \${msg.content}\`));
ch.publish("orders", "refund", Buffer.from("refund for order 1001"));
`),
      },
      ["node setup.js"],
    ),
    hints: [
      l("Varsayılan olarak yönlendirilemeyen mesaj atılır ve gönderen bunu bilmez.", "By default an unroutable message is dropped and the sender never knows."),
      l(
        "`ch.publish`'in seçeneklerine `mandatory: true` verilirse broker mesajı geri döndürür; amqplib onu kanalın `return` dinleyicisine verir (`ch.on(\"return\", …)`, dosyada zaten var).",
        "With `mandatory: true` in `ch.publish`'s options, the broker returns the message; amqplib hands it to the channel's `return` listener (`ch.on(\"return\", …)`, already in the file).",
      ),
      l(
        "`nano send_refund.js` (`Buffer.from(\"refund for order 1001\"))` → `Buffer.from(\"refund for order 1001\"), { mandatory: true })`), `node send_refund.js`",
        "`nano send_refund.js` (`Buffer.from(\"refund for order 1001\"))` → `Buffer.from(\"refund for order 1001\"), { mandatory: true })`), `node send_refund.js`",
      ),
    ],
    par: 2,
    check: (ctx) => eventsOf(ctx, "unroutable").some((e) => e.returned && e.message.body.startsWith("refund")) && lostSince(ctx).length === 0,
  },
];
