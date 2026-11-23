import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { LetterSwatch, MailroomStage, type ProducerSpec } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "durability";

const send = (queue: string, body: string, persistent: boolean): BrokerAction => ({ type: "publish", exchange: "", routingKey: queue, body, persistent });

/** Two queues to start: `orders` survives a restart, `temp` is transient. */
export const START: Broker = simulate(
  [
    { type: "declareQueue", name: "orders", durable: true },
    { type: "declareQueue", name: "temp", durable: false },
  ],
  createBroker(),
).states[2]!;

export const steps: BrokerAction[][] = [
  [],
  [send("orders", "t1", false), send("temp", "t2", false)],
  [{ type: "restart" }],
  [{ type: "declareQueue", name: "temp", durable: false }, send("orders", "p1", true), send("orders", "t3", false), send("temp", "p2", true)],
  [{ type: "restart" }],
  [{ type: "declareQueue", name: "payments", queueType: "quorum" }, send("payments", "q1", false)],
  [{ type: "restart" }],
  [],
  [],
];

/** Persistent messages are mint, transient ones plain, so the difference shows on the belt. */
export const kindOf = (m: Message) => (m.persistent ? "order" : "neutral");

/** Short app names, so the labels fit next to the stage edge. */
const APP_NAMES: Record<string, L> = {
  orders: l("Sipariş", "Orders"),
  temp: l("Bildirim", "Alerts"),
  payments: l("Ödeme", "Payments"),
};

function producers(b: Broker, t: (x: L) => string, names: string[]): ProducerSpec[] {
  return names
    .filter((q) => b.queues[q] || q !== "payments")
    .map((q) => ({ id: `app-${q}`, label: t(APP_NAMES[q] ?? l("Uygulama", "App")), exchange: "", queue: q }));
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Durable ve geçici kuyruklar, persistent ve geçici mesajlar, ve bir broker restart'ı", "Durable and transient queues, persistent and transient messages, and a broker restart"),
  view: (b, info) => (
    <MailroomStage
      broker={b}
      last={info.last}
      prev={info.prev}
      history={info.history}
      labels={labels(info.t)}
      kindOf={kindOf}
      persistence
      layout={{
        // In the try-it step every queue gets an app sending straight to it.
        producers: info.sandbox
          ? Object.keys(b.queues).sort().map((q) => ({ id: `app-${q}`, label: info.t(APP_NAMES[q] ?? l("Uygulama", "App")), exchange: "", queue: q }))
          : producers(b, info.t, ["orders", "temp", "payments"]),
      }}
    />
  ),
  metrics: (b, t, info) => {
    if (info.sandbox) {
      return [
        ...Object.keys(b.queues)
          .sort()
          .map((q) => ({ label: `${q} (${b.queues[q]!.type === "classic" ? (b.queues[q]!.durable ? "durable" : t(l("geçici", "transient"))) : b.queues[q]!.type})`, value: depth(b, q).ready })),
        { label: t(l("Kaybolan", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
      ];
    }
    return [
      { label: t(l("orders'ta", "In orders")), value: depth(b, "orders").ready },
      { label: t(l("temp kuyruğu", "temp queue")), value: b.queues.temp ? t(l("var", "exists")) : t(l("yok", "gone")), tone: b.queues.temp ? "plain" : "danger" },
      { label: t(l("Kaybolan mesaj", "Messages lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  legend: (t) => [
    { swatch: <LetterSwatch kind="order" seal />, label: t(l("persistent mesaj", "persistent message")) },
    { swatch: <LetterSwatch kind="neutral" note />, label: t(l("geçici mesaj", "transient message")) },
  ],
  // Free play is a small project with its files; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
