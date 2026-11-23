import { l } from "@lets-explain/core/i18n";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** Every key the app sends: `<thing>.<event>.<region>`, and one longer VIP key. */
export const KEYS = ["order.created.eu", "order.paid.eu", "order.created.us", "order.paid.eu.vip", "user.signup.eu"];

/** setup.js: an `events` topic exchange, these queues, and these bindings. */
export const topicSetup = (queues: string[], bindings: [queue: string, pattern: string][]) =>
  script(`
await ch.assertExchange("events", "topic");
${queues.map((q) => `await ch.assertQueue("${q}");`).join("\n")}
${bindings.map(([q, p]) => `await ch.bindQueue("${q}", "events", "${p}");`).join("\n")}
`);

/** The app's traffic for a minute: one of each key. */
const EVENTS = script(`
for (const key of [${KEYS.map((k) => `"${k}"`).join(", ")}]) {
  ch.publish("events", key, Buffer.from(key));
}
`);

const files = (queues: string[], bindings: [string, string][]): Files => ({ "setup.js": topicSetup(queues, bindings), "events.js": EVENTS });

/** Free play: the lesson's three queues. */
export const FREE = projectAfter(
  files(
    ["eu-orders", "warehouse", "audit"],
    [
      ["eu-orders", "order.*.eu"],
      ["warehouse", "order.#"],
      ["audit", "#"],
    ],
  ),
  ["node setup.js"],
);

/** The keys that reached a queue during the scenario (each message's body is its key). */
const got = (ctx: RabbitCtx, queue: string) => new Set(eventsOf(ctx, "routed").filter((e) => e.queues.includes(queue)).map((e) => e.message.body));
const exactly = (ctx: RabbitCtx, queue: string, keys: string[]) => {
  const g = got(ctx, queue);
  return g.size === keys.length && keys.every((k) => g.has(k));
};

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "eu-worker",
    title: l("AB işçisi", "The EU worker"),
    story: l(
      "Avrupa siparişlerini işleyen servis hiç sipariş görmüyor. Uygulama key'leri `<şey>.<olay>.<bölge>` biçiminde gönderiyor (`order.created.eu` gibi); `eu-orders` kuyruğu ise `order.eu` kalıbıyla bağlı.",
      "The service that handles European orders never sees one. The app sends keys shaped `<thing>.<event>.<region>` (like `order.created.eu`); the `eu-orders` queue is bound with the pattern `order.eu`.",
    ),
    goal: l(
      "`events.js`'nin gönderdiklerinden `eu-orders`'a **tam olarak** `order.created.eu` ve `order.paid.eu` gitsin; ABD siparişleri, VIP ve kullanıcı olayları gitmesin.",
      "Of what `events.js` sends, `eu-orders` gets **exactly** `order.created.eu` and `order.paid.eu`; no US orders, no VIP, no user events.",
    ),
    start: projectAfter(files(["eu-orders"], [["eu-orders", "order.eu"]]), ["node setup.js"]),
    hints: [
      l(
        "Topic kalıbında her nokta bir kelime ayırır. `order.eu` sadece tam olarak iki kelimelik `order.eu` key'ine uyar.",
        "In a topic pattern every dot separates a word. `order.eu` only matches the two-word key `order.eu` itself.",
      ),
      l("Ortadaki olay kelimesi ne olursa olsun: `*` tam bir kelime yerine geçer.", "Whatever the event word in the middle is: `*` stands for exactly one word."),
      l(
        "`nano setup.js` (`\"events\", \"order.eu\"` → `\"events\", \"order.*.eu\"`), `node setup.js`, `node events.js`",
        "`nano setup.js` (`\"events\", \"order.eu\"` → `\"events\", \"order.*.eu\"`), `node setup.js`, `node events.js`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "eu-orders", ["order.created.eu", "order.paid.eu"]),
  },
  {
    id: "warehouse",
    title: l("Veri ambarı", "The data warehouse"),
    story: l(
      "Veri ambarı ekibi `warehouse` kuyruğunda **her** sipariş olayını istiyor: her bölgeden ve `order.paid.eu.vip` gibi daha uzun key'ler dahil. Kullanıcı olayları onları ilgilendirmiyor. Şu an kuyruk `order.*` ile bağlı ve hiçbir şey gelmiyor.",
      "The data warehouse team wants **every** order event in the `warehouse` queue: from every region, longer keys like `order.paid.eu.vip` included. User events are of no interest to them. Right now the queue is bound with `order.*` and nothing arrives.",
    ),
    goal: l("`warehouse` 4 sipariş olayının hepsini alsın, `user.signup.eu`'yu almasın.", "`warehouse` gets all 4 order events and not `user.signup.eu`."),
    start: projectAfter(files(["warehouse"], [["warehouse", "order.*"]]), ["node setup.js"]),
    hints: [
      l("`order.*` tam iki kelimeye uyar; key'ler üç ya da dört kelimeli.", "`order.*` matches exactly two words; the keys have three or four."),
      l("`#` sıfır ya da daha fazla kelime yerine geçer.", "`#` stands for zero or more words."),
      l(
        "`nano setup.js` (`\"events\", \"order.*\"` → `\"events\", \"order.#\"`), `node setup.js`, `node events.js`",
        "`nano setup.js` (`\"events\", \"order.*\"` → `\"events\", \"order.#\"`), `node setup.js`, `node events.js`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "warehouse", KEYS.filter((k) => k.startsWith("order."))),
  },
  {
    id: "audit",
    title: l("Denetim kaydı", "The audit trail"),
    story: l(
      "Uyum ekibi bir kural koydu: `events` exchange'ine giden **her** mesajın, key'i ne olursa olsun, `audit` kuyruğunda kopyası olmalı. Kuyruk tanımlı ama hiçbir şeye bağlı değil.",
      "Compliance set a rule: **every** message sent to the `events` exchange, whatever its key, must have a copy in the `audit` queue. The queue is declared but bound to nothing.",
    ),
    goal: l("`events.js`'nin gönderdiği 5 mesajın hepsi `audit`'e ulaşsın.", "All 5 messages `events.js` sends reach `audit`."),
    start: projectAfter(files(["audit"], []), ["node setup.js"]),
    hints: [
      l("Her key'e uyan tek bir kalıp var: kaç kelime olursa olsun.", "There's one pattern that matches every key, however many words it has."),
      l("`#` tek başına her şeye uyar: o binding'le topic exchange fanout gibi davranır.", "`#` on its own matches everything: with that binding the topic exchange acts like fanout."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"audit\", \"events\", \"#\");`), `node setup.js`, `node events.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"audit\", \"events\", \"#\");`), `node setup.js`, `node events.js`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "audit", KEYS),
  },
  {
    id: "us-marketing",
    title: l("ABD pazarlaması", "US marketing"),
    story: l(
      "ABD pazarlama ekibi `us-marketing` kuyruğuna iki şey istiyor: ABD'deki her olay ve hangi bölgeden olursa olsun her yeni kullanıcı kaydı. Avrupa siparişleri onları ilgilendirmiyor.",
      "The US marketing team wants two things in the `us-marketing` queue: every event in the US, and every new user signup from any region. European orders are of no interest to them.",
    ),
    goal: l(
      "`us-marketing` **tam olarak** `order.created.us` ve `user.signup.eu`'yu alsın.",
      "`us-marketing` gets **exactly** `order.created.us` and `user.signup.eu`.",
    ),
    start: projectAfter(files(["us-marketing"], []), ["node setup.js"]),
    hints: [
      l(
        "Tek kalıp ikisini birden tutmaz; bir kuyruğa birden fazla binding eklenebilir ve mesaj herhangi birine uyarsa gelir.",
        "No single pattern covers both; a queue can have several bindings, and a message comes if it matches any of them.",
      ),
      l("Biri son kelimesi `us` olan üç kelimelik key'ler için, biri `user` ile başlayan her şey için.", "One for three-word keys ending in `us`, one for everything starting with `user`."),
      l(
        "`nano setup.js` (ekle: `await ch.bindQueue(\"us-marketing\", \"events\", \"*.*.us\");` ve `await ch.bindQueue(\"us-marketing\", \"events\", \"user.#\");`), `node setup.js`, `node events.js`",
        "`nano setup.js` (add: `await ch.bindQueue(\"us-marketing\", \"events\", \"*.*.us\");` and `await ch.bindQueue(\"us-marketing\", \"events\", \"user.#\");`), `node setup.js`, `node events.js`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "us-marketing", ["order.created.us", "user.signup.eu"]),
  },
];
