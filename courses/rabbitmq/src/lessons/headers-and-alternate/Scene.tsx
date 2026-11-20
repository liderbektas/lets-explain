import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
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

/**
 * The stage prints a headers binding's whole rule on its road, which is too long for the
 * gap between exchange and queue. For drawing, the road keeps only "(all)" / "(any)" and
 * the full rule goes in a label to the right of the queue (this lesson has no consumers).
 */
export function forDrawing(b: Broker): Broker {
  return { ...b, bindings: b.bindings.map((x) => (x.headers ? { ...x, headers: {} } : x)) };
}

/** Same column maths as BrokerStage for a lesson with no consumers: rows spread from 70 to 400. */
function RulePills({ broker, queues }: { broker: Broker; queues: string[] }) {
  const shown = queues.filter((q) => broker.queues[q]);
  const ys = shown.length === 1 ? [235] : shown.map((_, i) => 70 + (i * 330) / (shown.length - 1));
  return (
    <g>
      {shown.map((q, i) => {
        const rules = broker.bindings.filter((x) => x.queue === q && x.headers && Object.keys(x.headers).length);
        if (!rules.length) return null;
        const text = rules.map((r) => `${r.match ?? "all"}: ${Object.entries(r.headers!).map(([k, v]) => `${k}=${v}`).join(", ")}`).join("  ·  ");
        const w = Math.round(text.length * 6.9 + 18);
        return (
          <g key={q} transform={`translate(600 ${ys[i]!})`}>
            <rect y={-8} width={w} height={22} rx={11} className="pill-shadow" />
            <rect y={-11} width={w} height={22} rx={11} className="ink" style={{ fill: "var(--sky-soft)" }} />
            <text x={9} y={4} style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 700, fill: "var(--ink)" }}>
              {text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

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
    <g>
    <BrokerStage
      broker={forDrawing(b)}
      last={info.last}
      prev={info.prev}
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
    <RulePills broker={b} queues={info.sandbox ? sandboxQueues(b) : ["pdf-eu", "pdf-or-eu", "unrouted", "billing"]} />
    </g>
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
