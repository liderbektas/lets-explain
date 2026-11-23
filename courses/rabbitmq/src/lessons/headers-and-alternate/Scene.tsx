import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { MailroomStage } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "headers-and-alternate";
const DOCS = "documents";
const BOTH = { format: "pdf", region: "eu" };

const doc = (format: string, region: string, body: string, exchange = DOCS): BrokerAction => ({ type: "publish", exchange, routingKey: "", body, headers: { format, region } });

/** A headers exchange with two queues: one needs both headers, one needs either. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: DOCS, kind: "headers" },
    { type: "declareQueue", name: "pdf-eu" },
    { type: "declareQueue", name: "pdf-or-eu" },
    { type: "bind", exchange: DOCS, queue: "pdf-eu", headers: BOTH, match: "all" },
    { type: "bind", exchange: DOCS, queue: "pdf-or-eu", headers: BOTH, match: "any" },
  ],
  createBroker(),
).states[5]!;

export const steps: BrokerAction[][] = [
  [],
  [doc("pdf", "eu", "pe")],
  [doc("pdf", "us", "pu")],
  [doc("csv", "us", "cu")],
  [
    { type: "declareExchange", name: "unrouted", kind: "fanout" },
    { type: "declareQueue", name: "unrouted" },
    { type: "bind", exchange: "unrouted", queue: "unrouted" },
    // Setting the alternate on an existing exchange, the way a policy does.
    { type: "declareExchange", name: DOCS, kind: "headers", alternate: "unrouted" },
    doc("csv", "us", "cu"),
  ],
  [
    { type: "declareExchange", name: "orders", kind: "direct" },
    { type: "declareQueue", name: "billing" },
    { type: "bind", exchange: "orders", queue: "billing", key: "invoice" },
    { type: "publish", exchange: "orders", routingKey: "refund", body: "r1" },
    { type: "publish", exchange: "orders", routingKey: "refund", body: "r2", mandatory: true },
  ],
  [],
  [],
];

export const kindOf = (m: Message) => (m.headers.format === "csv" ? "payment" : m.exchange === "orders" ? "cancel" : "order");

/** The try-it step's headers exchange. */
export const SDOCS = "docs";

/** Queues to draw in the try-it step: whatever the scenario's project declared. */
const sandboxQueues = (b: Broker) => Object.keys(b.queues);

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Header'lara göre yönlendirme ve kaybolan mesajları yakalamak", "Routing by headers and catching messages that would be lost"),
  view: (b, info) => (
    <MailroomStage
      broker={b}
      last={info.last}
      prev={info.prev}
      history={info.history}
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={
        info.sandbox
          ? {
              producers: [
                { id: "archive", label: info.t(l("Arşiv", "Archive")), exchange: SDOCS },
                ...(b.exchanges.orders ? [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: "orders" }] : []),
              ],
              exchanges: [SDOCS, "unrouted", "orders"].filter((x) => b.exchanges[x]),
              queues: sandboxQueues(b),
            }
          : {
              producers: [
                { id: "archive", label: info.t(l("Arşiv", "Archive")), exchange: DOCS },
                ...(b.exchanges.orders ? [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: "orders" }] : []),
              ],
              exchanges: [DOCS, "unrouted", "orders"],
              queues: ["pdf-eu", "pdf-or-eu", "unrouted", "billing"],
            }
      }
    />
  ),
  metrics: (b, t, info) => {
    const qs = info.sandbox ? sandboxQueues(b) : ["pdf-eu", "pdf-or-eu", "unrouted"].filter((q) => b.queues[q]);
    return [
      ...qs.map((q) => ({ label: q, value: depth(b, q).ready })),
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? ("danger" as const) : ("plain" as const) },
    ];
  },
  // Free play is the docs project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
