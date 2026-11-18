import { l, type L } from "@lets-explain/core/i18n";
import { Parcel } from "@lets-explain/core/iso/shapes";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage, type ProducerSpec } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

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

/* Sandbox: declare `jobs` one way or the other, send either kind of message, restart. */
const JOBS = "jobs";
const sandboxStart = (): Broker => createBroker();

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const has = Boolean(b.queues[JOBS]);
  const n = history.filter((a) => a.type === "publish").length + 1;
  return [
    {
      label: tr ? "Kuyruk" : "Queue",
      buttons: [
        { label: tr ? "jobs: durable" : "jobs: durable", action: { type: "declareQueue", name: JOBS, durable: true }, tone: "go", disabled: has },
        { label: tr ? "jobs: geçici" : "jobs: transient", action: { type: "declareQueue", name: JOBS, durable: false }, disabled: has },
      ],
    },
    {
      label: tr ? "Gönder" : "Send",
      buttons: [
        { label: tr ? "geçici mesaj" : "transient message", action: send(JOBS, `j${n}`, false), tone: "producer", disabled: !has || n > 4 },
        { label: tr ? "persistent mesaj" : "persistent message", action: send(JOBS, `j${n}`, true), tone: "producer", disabled: !has || n > 4 },
      ],
    },
    {
      label: "Broker",
      buttons: [{ label: tr ? "Yeniden başlat" : "Restart", action: { type: "restart" }, tone: "danger", disabled: history.filter((a) => a.type === "restart").length >= 2 }],
    },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Durable ve geçici kuyruklar, persistent ve geçici mesajlar, ve bir broker restart'ı", "Durable and transient queues, persistent and transient messages, and a broker restart"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={{ producers: info.sandbox ? [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: JOBS }] : producers(b, info.t, ["orders", "temp", "payments"]) }}
    />
  ),
  metrics: (b, t, info) => {
    if (info.sandbox) {
      return [
        { label: t(l("jobs'ta", "In jobs")), value: depth(b, JOBS).ready },
        { label: t(l("Kuyruk", "Queue")), value: b.queues[JOBS] ? (b.queues[JOBS]!.durable ? "durable" : t(l("geçici", "transient"))) : "—" },
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
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="order" /></g>, label: t(l("persistent mesaj", "persistent message")) },
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="neutral" /></g>, label: t(l("geçici mesaj", "transient message")) },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
