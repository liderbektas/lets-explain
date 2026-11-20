import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { mergeBindings } from "./mergeBindings";
import { LOGS as LOGS_PROJECT, scenarios } from "./scenarios";

export const SLUG = "direct-exchange";
const LOGS = "logs";

const log = (severity: string, body: string): BrokerAction => ({ type: "publish", exchange: LOGS, routingKey: severity, body });
const bind = (exchange: string, queue: string, key: string): BrokerAction => ({ type: "bind", exchange, queue, key });

/** A `logs` direct exchange: `errors` takes only errors, `all-logs` takes info, warning and error. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: LOGS, kind: "direct" },
    { type: "declareQueue", name: "errors" },
    { type: "declareQueue", name: "all-logs" },
    bind(LOGS, "errors", "error"),
    bind(LOGS, "all-logs", "info"),
    bind(LOGS, "all-logs", "warning"),
    bind(LOGS, "all-logs", "error"),
  ],
  createBroker(),
).states[7]!;

export const steps: BrokerAction[][] = [
  [],
  [log("error", "e1")],
  [log("info", "i1")],
  [log("debug", "d1")],
  [bind(LOGS, "errors", "warning"), log("warning", "w1")],
  [
    { type: "consume", tag: "alerts", queue: "errors", prefetch: 0 },
    { type: "consume", tag: "archive", queue: "all-logs", prefetch: 0 },
    log("error", "e2"),
  ],
  [log("ERROR", "E3")],
  [],
];

const kindOf = (m: Message) => {
  const k = m.routingKey;
  if (k === "error" || k === "ERROR" || k === "video") return "cancel" as const;
  if (k === "warning" || k === "email") return "payment" as const;
  if (k === "debug") return "neutral" as const;
  return "order" as const;
};

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Direct exchange: routing key birebir eşleşince yönlendirir", "A direct exchange routes on an exact routing key match"),
  view: (b, info) => (
    <BrokerStage
      broker={mergeBindings(b)}
      last={info.last}
      prev={info.prev}
      labels={labels(info.t)}
      kindOf={kindOf}
      layout={{
        // In the try-it step the app publishes to whichever exchange the scenario's project has.
        producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: info.sandbox && b.exchanges.tasks ? "tasks" : LOGS }],
        consumerNames: { alerts: info.t(l("Alarm", "Alerts")), archive: info.t(l("Arşiv", "Archive")) },
      }}
    />
  ),
  metrics: (b, t, info) => {
    const qs = info.sandbox ? Object.keys(b.queues).sort() : ["errors", "all-logs"];
    return [
      ...qs.map((q) => ({ label: q, value: depth(b, q).total })),
      { label: t(l("Kaybolan", "Lost")), value: b.lost.length, tone: b.lost.length ? ("danger" as const) : ("plain" as const) },
    ];
  },
  // Free play is the logs project with its files; each scenario brings its own project.
  sandbox: { start: () => LOGS_PROJECT.broker, files: LOGS_PROJECT.files, scenarios },
});
