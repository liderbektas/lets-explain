import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { MailroomStage, type ProducerSpec } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "poison-messages";
export const OLD = "orders-v1";
export const QQ = "orders";
export const PARKING = "parking";
export const RETRY = "retry";
/** A small limit so the lesson does not need 21 nacks; RabbitMQ's default is 20. */
export const LIMIT = 3;

const to = (queue: string, body: string): BrokerAction => ({ type: "publish", exchange: "", routingKey: queue, body });
const nack = (tag: string, requeue: boolean): BrokerAction => ({ type: "nack", tag, requeue });

/** A classic queue with one careful worker (prefetch 1). */
export const START: Broker = simulate([{ type: "declareQueue", name: OLD }, { type: "consume", tag: "w1", queue: OLD, prefetch: 1 }], createBroker()).states[2]!;

export const steps: BrokerAction[][] = [
  [],
  [to(OLD, "bad"), nack("w1", true), nack("w1", true), nack("w1", true)],
  [nack("w1", false)],
  [
    { type: "declareExchange", name: "dlx", kind: "fanout" },
    { type: "declareQueue", name: PARKING },
    { type: "bind", exchange: "dlx", queue: PARKING },
    { type: "declareQueue", name: QQ, queueType: "quorum", args: { deliveryLimit: LIMIT, dlx: "dlx" } },
    { type: "consume", tag: "w2", queue: QQ, prefetch: 1 },
  ],
  [to(QQ, "bad"), nack("w2", true), nack("w2", true), nack("w2", true), nack("w2", true)],
  [to(QQ, "good"), { type: "ack", tag: "w2" }],
  [{ type: "declareQueue", name: RETRY, args: { ttl: 2, dlx: "", dlxKey: QQ } }, to(RETRY, "late"), { type: "tick" }, { type: "tick" }],
  [],
  [],
];

export const kindOf = (m: Message) => (m.body.startsWith("bad") ? "cancel" : m.body === "late" ? "payment" : "order");

const names = (t: (x: L) => string) => ({ w1: t(l("İşçi", "Worker")), w2: t(l("İşçi", "Worker")), w: t(l("İşçi", "Worker")), worker: t(l("İşçi", "Worker")) });

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bozuk bir mesaj, onu sayan bir quorum queue ve park kuyruğu", "A broken message, a quorum queue that counts it, and a parking queue"),
  view: (b, info) => {
    // In the try-it step the app sends to the project's work queue (`orders` or `jobs`).
    const work = ["orders", "jobs"].find((q) => b.queues[q]) ?? QQ;
    const producers: ProducerSpec[] = info.sandbox
      ? [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: work }]
      : info.step <= 2
        ? [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: OLD }]
        : info.step >= 6
          ? [
              { id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QQ },
              { id: "retrier", label: info.t(l("Sonra dene", "Retry later")), exchange: "", queue: RETRY },
            ]
          : [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QQ }];
    return (
      <MailroomStage
        broker={b}
        last={info.last}
        prev={info.prev}
        history={info.history}
        labels={labels(info.t)}
        kindOf={kindOf}
        layout={{
          producers,
          exchanges: info.sandbox ? undefined : ["dlx"],
          queues: info.sandbox ? [work, RETRY, PARKING] : [OLD, QQ, RETRY, PARKING],
          consumerNames: names(info.t),
        }}
      />
    );
  },
  metrics: (b, t) => {
    const most = Math.max(0, ...[...b.deliveries.reduce((m, d) => m.set(d.id, (m.get(d.id) ?? 0) + 1), new Map<string, number>()).values()]);
    return [
      { label: t(l("En çok teslim edilen", "Most deliveries")), value: most, tone: most > 2 ? "danger" : "plain" },
      { label: t(l("Park kuyruğunda", "In parking")), value: depth(b, PARKING).ready, tone: depth(b, PARKING).ready ? "warn" : "plain" },
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  // Free play: a quorum `orders` with a delivery limit and a parking queue; each scenario brings its own project.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
