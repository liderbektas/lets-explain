import { l } from "@lets-explain/core/i18n";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

/** Every key the app sends: `<thing>.<event>.<region>`, and one longer VIP key. */
export const KEYS = ["order.created.eu", "order.paid.eu", "order.created.us", "order.paid.eu.vip", "user.signup.eu"];

/** setup.py: an `events` topic exchange, these queues, and these bindings. */
export const topicSetup = (queues: string[], bindings: [queue: string, pattern: string][]) =>
  script(`
ch.exchange_declare(exchange="events", exchange_type="topic", durable=True)
${queues.map((q) => `ch.queue_declare(queue="${q}", durable=True)`).join("\n")}
${bindings.map(([q, p]) => `ch.queue_bind(queue="${q}", exchange="events", routing_key="${p}")`).join("\n")}
`);

/** The app's traffic for a minute: one of each key. */
const EVENTS = script(`
for key in [${KEYS.map((k) => `"${k}"`).join(", ")}]:
    ch.basic_publish(exchange="events", routing_key=key, body=key)
`);

const files = (queues: string[], bindings: [string, string][]): Files => ({ "setup.py": topicSetup(queues, bindings), "events.py": EVENTS });

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
  ["python setup.py"],
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
      "`events.py`'nin gönderdiklerinden `eu-orders`'a **tam olarak** `order.created.eu` ve `order.paid.eu` gitsin; ABD siparişleri, VIP ve kullanıcı olayları gitmesin.",
      "Of what `events.py` sends, `eu-orders` gets **exactly** `order.created.eu` and `order.paid.eu`; no US orders, no VIP, no user events.",
    ),
    start: projectAfter(files(["eu-orders"], [["eu-orders", "order.eu"]]), ["python setup.py"]),
    hints: [
      l(
        "Topic kalıbında her nokta bir kelime ayırır. `order.eu` sadece tam olarak iki kelimelik `order.eu` key'ine uyar.",
        "In a topic pattern every dot separates a word. `order.eu` only matches the two-word key `order.eu` itself.",
      ),
      l("Ortadaki olay kelimesi ne olursa olsun: `*` tam bir kelime yerine geçer.", "Whatever the event word in the middle is: `*` stands for exactly one word."),
      l(
        "`nano setup.py` (`routing_key=\"order.eu\"` → `routing_key=\"order.*.eu\"`), `python setup.py`, `python events.py`",
        "`nano setup.py` (`routing_key=\"order.eu\"` → `routing_key=\"order.*.eu\"`), `python setup.py`, `python events.py`",
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
    start: projectAfter(files(["warehouse"], [["warehouse", "order.*"]]), ["python setup.py"]),
    hints: [
      l("`order.*` tam iki kelimeye uyar; key'ler üç ya da dört kelimeli.", "`order.*` matches exactly two words; the keys have three or four."),
      l("`#` sıfır ya da daha fazla kelime yerine geçer.", "`#` stands for zero or more words."),
      l(
        "`nano setup.py` (`routing_key=\"order.*\"` → `routing_key=\"order.#\"`), `python setup.py`, `python events.py`",
        "`nano setup.py` (`routing_key=\"order.*\"` → `routing_key=\"order.#\"`), `python setup.py`, `python events.py`",
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
    goal: l("`events.py`'nin gönderdiği 5 mesajın hepsi `audit`'e ulaşsın.", "All 5 messages `events.py` sends reach `audit`."),
    start: projectAfter(files(["audit"], []), ["python setup.py"]),
    hints: [
      l("Her key'e uyan tek bir kalıp var: kaç kelime olursa olsun.", "There's one pattern that matches every key, however many words it has."),
      l("`#` tek başına her şeye uyar: o binding'le topic exchange fanout gibi davranır.", "`#` on its own matches everything: with that binding the topic exchange acts like fanout."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"audit\", exchange=\"events\", routing_key=\"#\")`), `python setup.py`, `python events.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"audit\", exchange=\"events\", routing_key=\"#\")`), `python setup.py`, `python events.py`",
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
    start: projectAfter(files(["us-marketing"], []), ["python setup.py"]),
    hints: [
      l(
        "Tek kalıp ikisini birden tutmaz; bir kuyruğa birden fazla binding eklenebilir ve mesaj herhangi birine uyarsa gelir.",
        "No single pattern covers both; a queue can have several bindings, and a message comes if it matches any of them.",
      ),
      l("Biri son kelimesi `us` olan üç kelimelik key'ler için, biri `user` ile başlayan her şey için.", "One for three-word keys ending in `us`, one for everything starting with `user`."),
      l(
        "`nano setup.py` (ekle: `ch.queue_bind(queue=\"us-marketing\", exchange=\"events\", routing_key=\"*.*.us\")` ve `ch.queue_bind(queue=\"us-marketing\", exchange=\"events\", routing_key=\"user.#\")`), `python setup.py`, `python events.py`",
        "`nano setup.py` (add: `ch.queue_bind(queue=\"us-marketing\", exchange=\"events\", routing_key=\"*.*.us\")` and `ch.queue_bind(queue=\"us-marketing\", exchange=\"events\", routing_key=\"user.#\")`), `python setup.py`, `python events.py`",
      ),
    ],
    par: 3,
    check: (ctx) => exactly(ctx, "us-marketing", ["order.created.us", "user.signup.eu"]),
  },
];
