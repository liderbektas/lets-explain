import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Binding, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "topic-exchange";
const EX = "events";

const pub = (routingKey: string, body: string, exchange = EX): BrokerAction => ({ type: "publish", exchange, routingKey, body });
const bind = (queue: string, key: string, exchange = EX): BrokerAction => ({ type: "bind", exchange, queue, key });

/** Three queues with three patterns: Europe only, every order, and everything. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: EX, kind: "topic" },
    { type: "declareQueue", name: "eu-orders" },
    { type: "declareQueue", name: "all-orders" },
    { type: "declareQueue", name: "audit" },
    bind("eu-orders", "order.*.eu"),
    bind("all-orders", "order.#"),
    bind("audit", "#"),
  ],
  createBroker(),
).states[7]!;

export const steps: BrokerAction[][] = [
  [],
  [pub("order.created.eu", "ce")],
  [pub("order.created", "c")],
  [pub("user.signup.eu", "su")],
  [pub("order.paid.eu.vip", "pv")],
  [{ type: "declareQueue", name: "refunds" }, bind("refunds", "*.cancelled.*"), pub("order.cancelled.eu", "xe")],
  [],
  [],
];

/** Colour by what the message is about: orders mint, users blue, cancellations peach. */
export const kindOf = (m: Message) => (m.routingKey.includes("cancelled") ? "cancel" : m.routingKey.startsWith("user") ? "payment" : "order");

/**
 * Several bindings between the same exchange and queue would print their keys on top of
 * each other, so the drawing gets one binding per pair with the keys joined.
 */
export function mergedForDrawing(b: Broker): Broker {
  const groups = new Map<string, Binding>();
  for (const x of b.bindings) {
    const id = `${x.exchange}|${x.queue}`;
    const prev = groups.get(id);
    groups.set(id, prev ? { ...prev, key: `${prev.key}  ·  ${x.key}` } : { ...x });
  }
  return { ...b, bindings: [...groups.values()] };
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir topic exchange: kalıplara göre dağıtım", "A topic exchange routing by patterns"),
  view: (b, info) => (
    <BrokerStage
      broker={mergedForDrawing(b)}
      last={info.last}
      prev={info.prev}
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={{
        producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: EX }],
        queues: info.sandbox ? Object.keys(b.queues) : ["eu-orders", "all-orders", "audit", "refunds"],
      }}
    />
  ),
  metrics: (b, t, info) => {
    const qs = info.sandbox ? Object.keys(b.queues) : ["eu-orders", "all-orders", "audit", "refunds"].filter((q) => b.queues[q]);
    return [
      ...qs.map((q) => ({ label: q, value: depth(b, q).ready })),
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? ("danger" as const) : ("plain" as const) },
    ];
  },
  // Free play is the events project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
