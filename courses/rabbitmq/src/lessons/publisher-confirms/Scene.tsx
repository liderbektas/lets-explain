import { l } from "@lets-explain/core/i18n";
import { Parcel } from "@lets-explain/core/iso/shapes";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type BrokerEvent, type Message } from "../../engine/broker";
import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

export const SLUG = "publisher-confirms";

const pub = (routingKey: string, body: string, mandatory = false): BrokerAction => ({ type: "publish", exchange: "orders", routingKey, body, mandatory, persistent: true });

/** An `orders` exchange with a normal queue, on a three-node cluster for the quorum step. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: "orders", kind: "direct" },
    { type: "declareQueue", name: "billing" },
    { type: "bind", exchange: "orders", queue: "billing", key: "order" },
  ],
  createBroker({ nodes: 3 }),
).states[3]!;

export const steps: BrokerAction[][] = [
  [],
  [pub("order", "o1")],
  [pub("refund", "r1")],
  [pub("refund", "r2", true)],
  [
    { type: "declareQueue", name: "limited", args: { maxLength: 2, overflow: "reject-publish" } },
    { type: "bind", exchange: "orders", queue: "limited", key: "limited" },
    pub("limited", "l1"),
    pub("limited", "l2"),
    pub("limited", "l3"),
  ],
  [
    { type: "declareQueue", name: "payments", queueType: "quorum" },
    { type: "bind", exchange: "orders", queue: "payments", key: "pay" },
    { type: "nodeDown", node: "rabbit@2" },
    { type: "nodeDown", node: "rabbit@3" },
    pub("pay", "p1"),
  ],
  [{ type: "nodeUp", node: "rabbit@2" }, pub("pay", "p1"), pub("order", "o2"), pub("order", "o2")],
  [],
  [],
];

/** The broker's last answer: ack, nack, or nothing yet. */
export function lastAnswer(events: BrokerEvent[]): "ack" | "nack" | null {
  const c = [...events].reverse().find((e) => e.type === "confirmed");
  if (!c || c.type !== "confirmed") return null;
  return c.ok ? "ack" : "nack";
}

export const kindOf = (m: Message) => (m.body.startsWith("p") ? "payment" : m.body.startsWith("r") ? "cancel" : "order");

const QUEUES_BY_STEP: string[][] = [["billing"], ["billing"], ["billing"], ["billing"], ["billing", "limited"], ["billing", "limited", "payments"], ["billing", "limited", "payments"]];

/* Sandbox: a normal queue, a small reject-publish queue, and keys that match nothing. */
const sandboxStart = (): Broker =>
  simulate(
    [
      { type: "declareExchange", name: "orders", kind: "direct" },
      { type: "declareQueue", name: "billing" },
      { type: "bind", exchange: "orders", queue: "billing", key: "order" },
      { type: "declareQueue", name: "limited", args: { maxLength: 2, overflow: "reject-publish" } },
      { type: "bind", exchange: "orders", queue: "limited", key: "limited" },
    ],
    createBroker(),
  ).states[5]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const n = history.filter((a) => a.type === "publish").length + 1;
  const full = n > 6;
  return [
    {
      label: tr ? "Gönder" : "Send",
      buttons: [
        { label: "key: order", action: pub("order", `m${n}`), tone: "producer", disabled: full },
        { label: "key: limited", action: pub("limited", `m${n}`), tone: "producer", disabled: full },
        { label: "key: refund", action: pub("refund", `m${n}`), tone: "producer", disabled: full },
        { label: "refund + mandatory", action: pub("refund", `m${n}`, true), tone: "producer", disabled: full },
      ],
    },
    {
      label: tr ? "Kuyruk" : "Queue",
      buttons: [{ label: tr ? "limited'i boşalt" : "purge limited", action: { type: "purge", queue: "limited" }, tone: "danger", disabled: (b.queues.limited?.ready.length ?? 0) === 0 }],
    },
  ];
}

const answerText = (a: "ack" | "nack" | null) => (a === "ack" ? "ack ✓" : a === "nack" ? "nack ✗" : "—");

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Producer her mesaj için broker'dan ack ya da nack bekliyor", "The producer waits for an ack or a nack from the broker for every message"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={{
        producers: [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: "orders" }],
        queues: info.sandbox ? ["billing", "limited"] : QUEUES_BY_STEP[Math.min(info.step, QUEUES_BY_STEP.length - 1)],
      }}
    />
  ),
  metrics: (b, t, info) => {
    const a = lastAnswer(info.last);
    const dropped = b.lost.length;
    const out: Metric[] = [
      { label: t(l("Broker'ın cevabı", "Broker's answer")), value: answerText(a), tone: a === "nack" ? ("danger" as const) : a === "ack" ? ("ok" as const) : ("plain" as const) },
      { label: "billing", value: depth(b, "billing").ready },
    ];
    if (b.queues.limited) out.push({ label: "limited", value: `${depth(b, "limited").ready}/2`, tone: "plain" });
    out.push({ label: t(l("Kaybolan", "Lost")), value: dropped, tone: dropped ? "danger" : "plain" });
    return out;
  },
  legend: (t) => [
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="order" /></g>, label: t(l("sipariş", "order")) },
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="cancel" /></g>, label: t(l("iade (kuyruğu yok)", "refund (no queue)")) },
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="payment" /></g>, label: t(l("ödeme", "payment")) },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
