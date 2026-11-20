import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { Channels } from "./Channels";
import { mergeBindings } from "../direct-exchange/mergeBindings";
import { FREE, scenarios } from "./scenarios";
import "./amqp.css";

export const SLUG = "amqp-model";

const pub = (exchange: string, routingKey: string, body: string): BrokerAction => ({ type: "publish", exchange, routingKey, body });

export const START: Broker = createBroker();

export const steps: BrokerAction[][] = [
  [],
  [
    { type: "declareExchange", name: "orders", kind: "direct" },
    { type: "declareQueue", name: "billing" },
    { type: "bind", exchange: "orders", queue: "billing", key: "order.created" },
  ],
  [pub("orders", "order.created", "o1")],
  [pub("orders", "order.cancelled", "o2")],
  [{ type: "declareQueue", name: "billing" }],
  [{ type: "declareQueue", name: "billing", durable: false }],
  [],
  [{ type: "consume", tag: "billing-1", queue: "billing", prefetch: 0 }, { type: "ack", tag: "billing-1" }],
  [],
];

/** Steps that refuse something on purpose, with the error they show. */
export const EXPECTED_ERRORS: Record<number, string> = { 5: "PRECONDITION_FAILED" };

const SHOP = "shop";
const kindOf = (m: { routingKey: string }) => (m.routingKey.endsWith("cancelled") ? "cancel" : m.routingKey.endsWith("shipped") ? "payment" : "order") as "order";

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bağlantı, kanal, exchange, binding ve kuyruk", "Connection, channel, exchange, binding and queue"),
  view: (b, info) =>
    info.step === 0 && !info.sandbox ? (
      <Channels
        labels={{
          app: info.t(l("Uygulama", "App")),
          broker: "RabbitMQ",
          connection: info.t(l("1 TCP bağlantısı (connection)", "1 TCP connection")),
          channel: "channel",
          vhost: "vhost: /",
        }}
      />
    ) : (
      <BrokerStage
        broker={mergeBindings(b)}
        last={info.last}
        prev={info.prev}
        labels={labels(info.t)}
        kindOf={kindOf}
        layout={{
          producers: info.sandbox
            ? [
                { id: "app", label: info.t(l("Uygulama", "App")), exchange: SHOP },
                // A test script can also publish straight to a queue through the default exchange.
                { id: "test", label: "Test", exchange: "", queue: "shipping" },
              ]
            : [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "orders" }],
          consumerNames: { "billing-1": info.t(l("Fatura", "Billing")) },
        }}
      />
    ),
  metrics: (b, t, info) => {
    if (info.step === 0 && !info.sandbox) return [{ label: "Connection", value: 1 }, { label: "Channel", value: 3 }];
    const queues = Object.keys(b.queues);
    return [
      { label: "Exchange", value: Object.keys(b.exchanges).filter((n) => n && !n.startsWith("amq.")).length },
      { label: t(l("Kuyruk", "Queues")), value: queues.length },
      { label: "Binding", value: b.bindings.length },
      { label: t(l("Bekleyen", "Waiting")), value: queues.reduce((n, q) => n + depth(b, q).ready, 0) },
      { label: t(l("Kaybolan", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  extraChanges: (step) =>
    step === 4 ? [{ kind: "good", text: l("Hiçbir şey değişmedi: aynı ayarlarla tekrar declare etmek zararsızdır", "Nothing changed: declaring again with the same settings is harmless") }]
    : step === 5 ? [{ kind: "bad", text: l("Broker reddetti: `PRECONDITION_FAILED` (406), kanal kapanır", "The broker refused: `PRECONDITION_FAILED` (406), and the channel closes") }]
    : [],
  // Free play is the shop project with no bindings; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
