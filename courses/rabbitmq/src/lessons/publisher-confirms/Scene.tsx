import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type BrokerEvent, type Message } from "../../engine/broker";
import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { LetterSwatch, MailroomStage } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

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

const answerText = (a: "ack" | "nack" | null) => (a === "ack" ? "ack ✓" : a === "nack" ? "nack ✗" : "—");

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Producer her mesaj için broker'dan ack ya da nack bekliyor", "The producer waits for an ack or a nack from the broker for every message"),
  view: (b, info) => (
    <MailroomStage
      broker={b}
      last={info.last}
      prev={info.prev}
      history={info.history}
      confirms
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={{
        producers: [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: "orders" }],
        // In the try-it step, whatever queues the scenario's project has.
        queues: info.sandbox ? undefined : QUEUES_BY_STEP[Math.min(info.step, QUEUES_BY_STEP.length - 1)],
      }}
    />
  ),
  metrics: (b, t, info) => {
    const a = lastAnswer(info.last);
    const dropped = b.lost.length;
    const out: Metric[] = [
      { label: t(l("Broker'ın cevabı", "Broker's answer")), value: answerText(a), tone: a === "nack" ? ("danger" as const) : a === "ack" ? ("ok" as const) : ("plain" as const) },
    ];
    if (b.queues.billing) out.push({ label: "billing", value: depth(b, "billing").ready });
    if (b.queues.limited) out.push({ label: "limited", value: `${depth(b, "limited").ready}/2`, tone: "plain" });
    if (info.sandbox && b.queues.payments) out.push({ label: "payments", value: depth(b, "payments").ready });
    out.push({ label: t(l("Kaybolan", "Lost")), value: dropped, tone: dropped ? "danger" : "plain" });
    return out;
  },
  legend: (t) => [
    { swatch: <LetterSwatch kind="order" />, label: t(l("sipariş", "order")) },
    { swatch: <LetterSwatch kind="cancel" />, label: t(l("iade (kuyruğu yok)", "refund (no queue)")) },
    { swatch: <LetterSwatch kind="payment" />, label: t(l("ödeme", "payment")) },
  ],
  // Free play is the shop with its scripts; each scenario brings its own project.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
