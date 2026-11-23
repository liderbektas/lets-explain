import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { MailroomStage } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "acks";
export const QUEUE = "orders";
export const DEAD = "dead";

const send = (body: string): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body });

/** One queue with a dead letter exchange behind it, so rejected messages have somewhere to go. */
const setup: BrokerAction[] = [
  { type: "declareExchange", name: "dlx", kind: "fanout" },
  { type: "declareQueue", name: DEAD },
  { type: "bind", exchange: "dlx", queue: DEAD },
  { type: "declareQueue", name: QUEUE, args: { dlx: "dlx" } },
];

export const START: Broker = simulate(setup, createBroker()).states[setup.length]!;

export const steps: BrokerAction[][] = [
  [],
  // An auto-ack worker: the broker forgets each message the moment it hands it over.
  [{ type: "consume", tag: "auto", queue: QUEUE, autoAck: true, speed: 1 }, send("a1"), send("a2"), send("a3"), { type: "tick" }],
  [{ type: "crashConsumer", tag: "auto" }],
  // A manual-ack worker: the broker keeps each message until it hears back.
  [{ type: "consume", tag: "manual", queue: QUEUE, prefetch: 0 }, send("b1"), send("b2"), send("b3"), { type: "ack", tag: "manual" }],
  [{ type: "nack", tag: "manual", requeue: true }],
  [{ type: "nack", tag: "manual", requeue: false }],
  [send("c1"), send("c2"), { type: "ack", tag: "manual", multiple: true }],
  [],
  [],
];

const names = (t: (x: L) => string) => ({ auto: t(l("Auto-ack işçi", "Auto-ack worker")), manual: t(l("Manuel işçi", "Manual worker")), worker: t(l("İşçi", "Worker")) });

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir kuyruk, onu dinleyen işçiler ve reddedilenlerin düştüğü dead letter kuyruğu", "A queue, the workers on it, and the dead letter queue for rejected messages"),
  view: (b, info) => (
    <MailroomStage
      broker={b}
      last={info.last}
      prev={info.prev}
      history={info.history}
      labels={labels(info.t)}
      layout={{
        producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QUEUE }],
        exchanges: ["dlx"],
        queues: [QUEUE, DEAD],
        consumerNames: names(info.t),
      }}
    />
  ),
  metrics: (b, t) => {
    const d = depth(b, QUEUE);
    const redelivered = b.deliveries.filter((x) => x.redelivered).length;
    return [
      { label: t(l("Hazır", "Ready")), value: d.ready, tone: d.ready ? "warn" : "plain" },
      { label: t(l("Onay bekleyen", "Unacked")), value: d.unacked, tone: d.unacked ? "warn" : "plain" },
      { label: t(l("Tekrar teslim", "Redelivered")), value: redelivered, tone: redelivered ? "danger" : "plain" },
      { label: t(l("Dead letter", "Dead-lettered")), value: depth(b, DEAD).ready, tone: depth(b, DEAD).ready ? "warn" : "plain" },
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  // Free play is the orders project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
