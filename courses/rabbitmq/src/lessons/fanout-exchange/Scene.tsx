import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

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

const names = (t: (x: L) => string) => ({ mailer: t(l("E-posta", "Email")), texter: "SMS" });

/** The sandbox: a fanout exchange `news` and three unbound queues. */
export const NEWS = "news";
export const QUEUES = ["a", "b", "c"];
const sandboxStart = (): Broker =>
  simulate([{ type: "declareExchange", name: NEWS, kind: "fanout" }, ...QUEUES.map((q): BrokerAction => ({ type: "declareQueue", name: q }))], createBroker()).states[4]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const bound = (q: string) => b.bindings.some((x) => x.exchange === NEWS && x.queue === q);
  return [
    { label: tr ? "Yayıncı" : "Publisher", buttons: [{ label: tr ? "Haber yayınla" : "Publish news", action: { type: "publish", exchange: NEWS, routingKey: "", body: `n${sent + 1}` }, tone: "producer", disabled: sent >= 3 }] },
    {
      label: tr ? "Binding" : "Bindings",
      buttons: QUEUES.map((q) =>
        bound(q)
          ? { label: tr ? `${q} çıkar` : `unbind ${q}`, action: { type: "unbind", exchange: NEWS, queue: q } as BrokerAction, tone: "danger" as const }
          : { label: tr ? `${q} bağla` : `bind ${q}`, action: bind(q, NEWS), tone: "go" as const },
      ),
    },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir fanout exchange ve ona bağlı kuyruklar", "A fanout exchange and the queues bound to it"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      labels={labels(info.t)}
      layout={{
        producers: [{ id: "shop", label: info.t(info.sandbox ? l("Yayıncı", "Publisher") : l("Mağaza", "Shop")), exchange: info.sandbox ? NEWS : EX }],
        queues: info.sandbox ? QUEUES : ["email", "sms", "analytics", "tmp-dashboard"],
        consumerNames: names(info.t),
      }}
    />
  ),
  metrics: (b, t, info) => {
    const qs = info.sandbox ? QUEUES : ["email", "sms", "analytics"];
    const copies = qs.reduce((n, q) => n + (b.queues[q] ? depth(b, q).total : 0), 0);
    const routed = b.deliveries.length;
    return [
      { label: t(l("Bağlı kuyruk", "Bound queues")), value: b.bindings.filter((x) => x.exchange === (info.sandbox ? NEWS : EX)).length },
      { label: t(l("Kuyruklardaki kopya", "Copies in queues")), value: copies },
      { label: t(l("Teslim edilen", "Delivered")), value: routed },
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
