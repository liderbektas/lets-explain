import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

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

const names = (t: (x: L) => string) => ({ auto: t(l("Auto-ack işçi", "Auto-ack worker")), manual: t(l("Manuel işçi", "Manual worker")), w: t(l("İşçi", "Worker")) });

const sandboxStart = (): Broker => simulate(setup, createBroker()).states[setup.length]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const c = b.consumers.w;
  const worker: SandboxRow = {
    label: tr ? "İşçi" : "Worker",
    buttons: !c
      ? [
          { label: tr ? "Bağlan (manuel ack)" : "Connect (manual ack)", action: { type: "consume", tag: "w", queue: QUEUE, prefetch: 0 }, tone: "go" },
          { label: tr ? "Bağlan (auto-ack)" : "Connect (auto-ack)", action: { type: "consume", tag: "w", queue: QUEUE, autoAck: true, speed: 1 }, tone: "go" },
        ]
      : c.autoAck
        ? [{ label: tr ? "Çökert" : "Crash", action: { type: "crashConsumer", tag: "w" }, tone: "danger" }]
        : [
            { label: "ack", action: { type: "ack", tag: "w" }, tone: "ok", disabled: c.unacked.length === 0 },
            { label: "nack (requeue)", action: { type: "nack", tag: "w", requeue: true }, disabled: c.unacked.length === 0 },
            { label: "reject", action: { type: "nack", tag: "w", requeue: false }, tone: "danger", disabled: c.unacked.length === 0 },
            { label: tr ? "Çökert" : "Crash", action: { type: "crashConsumer", tag: "w" }, tone: "danger" },
          ],
  };
  return [
    { label: tr ? "Uygulama" : "App", buttons: [{ label: tr ? "Mesaj gönder" : "Send message", action: send(`t${sent + 1}`), tone: "producer", disabled: sent >= 4 }] },
    worker,
    { label: tr ? "Zaman" : "Time", buttons: [{ label: tr ? "Bir tur bekle" : "Wait one tick", action: { type: "tick" } }] },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir kuyruk, onu dinleyen işçiler ve reddedilenlerin düştüğü dead letter kuyruğu", "A queue, the workers on it, and the dead letter queue for rejected messages"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
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
  sandbox: { start: sandboxStart, rows, missions },
});
