import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { MailroomStage, type BrokerLabels } from "../../iso/MailroomStage";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "first-queue";
const QUEUE = "hello";

const send = (body: string, queue = QUEUE): BrokerAction => ({ type: "publish", exchange: "", routingKey: queue, body });
const consume = (tag: string, queue = QUEUE): BrokerAction => ({ type: "consume", tag, queue, prefetch: 0 });
const ack = (tag: string, multiple = false): BrokerAction => ({ type: "ack", tag, multiple });

/** The lesson starts with one empty queue and nobody listening. */
export const START: Broker = simulate([{ type: "declareQueue", name: QUEUE }], createBroker()).states[1]!;

export const steps: BrokerAction[][] = [
  [],
  [send("a1"), send("a2"), send("a3")],
  [consume("worker-1")],
  [ack("worker-1"), ack("worker-1"), ack("worker-1")],
  [send("b1"), send("b2"), { type: "crashConsumer", tag: "worker-1" }],
  [consume("worker-2"), ack("worker-2", true)],
  [consume("worker-1"), send("c1"), send("c2"), send("c3"), send("c4")],
  [],
  [],
];

export const labels = (t: (x: L) => string): BrokerLabels => ({
  unacked: t(l("onay bekleyen", "unacked")),
  ready: t(l("hazır", "ready")),
  prefetch: "prefetch",
  noLimit: "∞",
  down: t(l("kapalı", "down")),
  lost: t(l("kayıp", "lost")),
  returned: t(l("iade", "returned")),
  consumers: t(l("consumer", "consumers")),
});

const names = (t: (x: L) => string) => ({ "worker-1": t(l("İşçi 1", "Worker 1")), "worker-2": t(l("İşçi 2", "Worker 2")) });

/** The try-it step's queue: the photo project's `tasks`. */
const TASKS = "tasks";

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir uygulama, bir kuyruk ve onu dinleyen işçiler", "An app, a queue and the workers listening to it"),
  view: (b, info) => (
    <MailroomStage
      broker={b}
      last={info.last}
      prev={info.prev}
      history={info.history}
      labels={labels(info.t)}
      layout={{
        producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: info.sandbox ? TASKS : QUEUE }],
        // Typed: worker.py run once is "worker", run again "worker-2".
        consumerNames: info.sandbox
          ? { worker: info.t(l("İşçi 1", "Worker 1")), "worker-2": info.t(l("İşçi 2", "Worker 2")), slow_worker: info.t(l("Yavaş işçi", "Slow worker")) }
          : names(info.t),
      }}
    />
  ),
  metrics: (b, t, info) => {
    const q = info.sandbox ? TASKS : QUEUE;
    const d = depth(b, q);
    const done = Object.values(b.consumers).reduce((n, c) => n + c.done.length, 0);
    return [
      { label: t(l("Kuyrukta hazır", "Ready")), value: d.ready, tone: d.ready ? "warn" : "plain" },
      { label: t(l("Onay bekleyen", "Unacked")), value: d.unacked, tone: d.unacked ? "warn" : "plain" },
      { label: t(l("Tekrar teslim", "Redelivered")), value: b.deliveries.filter((x) => x.redelivered).length, tone: b.deliveries.some((x) => x.redelivered) ? "danger" : "plain" },
      { label: t(l("Bağlı işçinin bitirdiği", "Done by connected")), value: done },
    ];
  },
  // Free play is the photo project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
