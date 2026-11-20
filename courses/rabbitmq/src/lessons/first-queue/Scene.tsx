import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage, type BrokerLabels } from "../../iso/BrokerStage";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

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
});

const names = (t: (x: L) => string) => ({ "worker-1": t(l("İşçi 1", "Worker 1")), "worker-2": t(l("İşçi 2", "Worker 2")) });

/** The sandbox: a fresh queue called "tasks", two workers that can join, ack and crash. */
const TASKS = "tasks";
const sandboxStart = (): Broker => simulate([{ type: "declareQueue", name: TASKS }], createBroker()).states[1]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const worker = (tag: string, name: string): SandboxRow => {
    const c = b.consumers[tag];
    return {
      label: name,
      buttons: c
        ? [
            { label: "ack", action: ack(tag), tone: "ok", disabled: c.unacked.length === 0 },
            { label: tr ? "hepsine ack" : "ack all", action: ack(tag, true), tone: "ok", disabled: c.unacked.length < 2 },
            { label: tr ? "Çökert" : "Crash", action: { type: "crashConsumer", tag }, tone: "danger" },
          ]
        : [{ label: tr ? "Bağlan" : "Connect", action: consume(tag, TASKS), tone: "go" }],
    };
  };
  return [
    { label: tr ? "Uygulama" : "App", buttons: [{ label: tr ? "Mesaj gönder" : "Send message", action: send(`t${sent + 1}`, TASKS), tone: "producer", disabled: sent >= 5 }] },
    worker("w1", tr ? "İşçi 1" : "Worker 1"),
    worker("w2", tr ? "İşçi 2" : "Worker 2"),
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir uygulama, bir kuyruk ve onu dinleyen işçiler", "An app, a queue and the workers listening to it"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      prev={info.prev}
      labels={labels(info.t)}
      layout={{
        producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: info.sandbox ? TASKS : QUEUE }],
        consumerNames: info.sandbox ? { w1: info.t(l("İşçi 1", "Worker 1")), w2: info.t(l("İşçi 2", "Worker 2")) } : names(info.t),
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
  sandbox: { start: sandboxStart, rows, missions },
});
