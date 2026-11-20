import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "fanout-exchange";
export const EX = "orders";

const pub = (body: string, routingKey = "order.created"): BrokerAction => ({ type: "publish", exchange: EX, routingKey, body });
const bind = (queue: string, exchange = EX): BrokerAction => ({ type: "bind", exchange, queue });

/** A fanout exchange with two subscribers already bound: email and SMS. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: EX, kind: "fanout" },
    { type: "declareQueue", name: "email" },
    { type: "declareQueue", name: "sms" },
    bind("email"),
    bind("sms"),
  ],
  createBroker(),
).states[5]!;

/** The email and SMS services finish what they get, so only unconsumed queues fill up. */
const ackBoth: BrokerAction[] = [
  { type: "ack", tag: "mailer" },
  { type: "ack", tag: "texter" },
];

export const steps: BrokerAction[][] = [
  [],
  [pub("o1")],
  [pub("o2", "xyz")],
  [
    { type: "consume", tag: "mailer", queue: "email", prefetch: 0 },
    { type: "consume", tag: "texter", queue: "sms", prefetch: 0 },
    { type: "ack", tag: "mailer", multiple: true },
    { type: "ack", tag: "texter", multiple: true },
  ],
  [{ type: "declareQueue", name: "analytics" }, bind("analytics"), pub("o3"), ...ackBoth],
  [{ type: "declareQueue", name: "tmp-dashboard", durable: false }, bind("tmp-dashboard"), pub("o4"), ...ackBoth, { type: "deleteQueue", name: "tmp-dashboard" }],
  [{ type: "unbind", exchange: EX, queue: "sms" }, pub("o5"), { type: "ack", tag: "mailer" }],
  [],
  [],
];

const names = (t: (x: L) => string) => ({ mailer: t(l("E-posta", "Email")), texter: "SMS", push: t(l("Bildirim", "Push")) });

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir fanout exchange ve ona bağlı kuyruklar", "A fanout exchange and the queues bound to it"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      prev={info.prev}
      labels={labels(info.t)}
      layout={{
        producers: info.sandbox
          ? [
              { id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: EX },
              // A script can also send straight to one queue through the default exchange.
              { id: "marketing", label: info.t(l("Pazarlama", "Marketing")), exchange: "", queue: "email" },
            ]
          : [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: EX }],
        queues: info.sandbox ? Object.keys(b.queues) : ["email", "sms", "analytics", "tmp-dashboard"],
        consumerNames: names(info.t),
      }}
    />
  ),
  metrics: (b, t, info) => {
    const qs = info.sandbox ? Object.keys(b.queues) : ["email", "sms", "analytics"];
    const copies = qs.reduce((n, q) => n + (b.queues[q] ? depth(b, q).total : 0), 0);
    const routed = b.deliveries.length;
    return [
      { label: t(l("Bağlı kuyruk", "Bound queues")), value: b.bindings.filter((x) => x.exchange === EX).length },
      { label: t(l("Kuyruklardaki kopya", "Copies in queues")), value: copies },
      { label: t(l("Teslim edilen", "Delivered")), value: routed },
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  // Free play is the orders project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
