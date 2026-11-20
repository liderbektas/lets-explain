import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";
import { AlarmPanel, ChecklistPanel, ConnectionsPanel } from "./OpsPanels";

export const SLUG = "operations";
export const QUEUE = "orders";

export const order = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body: `o${n}`, persistent: true });
/** A worker that finishes one order per tick; speed 0 models one that is stuck. */
export const worker = (tag: string, speed = 1): BrokerAction => ({ type: "consume", tag, queue: QUEUE, prefetch: 2, speed });
const tick = (count = 1): BrokerAction => ({ type: "tick", count });

/** A shop and one worker that keeps up with normal traffic. */
export const START: Broker = simulate([{ type: "declareQueue", name: QUEUE }, worker("worker-1")], createBroker()).states[2]!;

let n = 0;
const orders = (k: number) => Array.from({ length: k }, () => order(++n));

export const steps: BrokerAction[][] = [
  [],
  [...orders(2), tick(2)],
  [...orders(6), tick(2)],
  [worker("worker-2"), tick(2)],
  [worker("worker-3", 0), ...orders(4), tick(2)],
  [{ type: "crashConsumer", tag: "worker-3" }, tick(2)],
  [{ type: "crashConsumer", tag: "worker-1" }, { type: "crashConsumer", tag: "worker-2" }, ...orders(3)],
  [],
  [],
  [],
  [],
];

export const PANELS: Record<number, "connections" | "alarms" | "checklist"> = { 7: "connections", 8: "alarms", 9: "checklist" };

const names = (t: (x: L) => string): Record<string, string> => ({
  "worker-1": t(l("İşçi 1", "Worker 1")),
  "worker-2": t(l("İşçi 2", "Worker 2")),
  "worker-3": t(l("İşçi 3", "Worker 3")),
  w1: t(l("İşçi 1", "Worker 1")),
  w2: t(l("İşçi 2", "Worker 2")),
  w3: t(l("İşçi 3", "Worker 3")),
  w4: t(l("İşçi 4", "Worker 4")),
});

/**
 * The sandbox: 4 orders already in, Worker 1 handles one per tick, Worker 2 is stuck and
 * never acks. Both hold two orders each.
 */
export const sandboxStart = (): Broker =>
  simulate([{ type: "declareQueue", name: QUEUE }, worker("w1"), worker("w2", 0), order(1), order(2), order(3), order(4)], createBroker()).states[7]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const added = history.filter((a) => a.type === "consume").length;
  const nextTag = `w${3 + added}`;
  const out: SandboxRow[] = [
    {
      label: tr ? "Mağaza" : "Shop",
      buttons: [{ label: tr ? "Sipariş geldi" : "New order", action: order(5 + sent), tone: "producer", disabled: sent >= 4 }],
    },
    {
      label: tr ? "Zaman" : "Time",
      buttons: [{ label: "1 tick", action: tick() }],
    },
    {
      label: tr ? "İşçiler" : "Workers",
      buttons: [
        { label: tr ? "İşçi ekle" : "Add worker", action: worker(nextTag), tone: "go", disabled: added >= 2 },
        ...Object.keys(b.consumers)
          .sort()
          .map((tag) => ({ label: `${tr ? "Çökert" : "Crash"} ${tag}`, action: { type: "crashConsumer", tag } as BrokerAction, tone: "danger" as const })),
      ],
    },
  ];
  return out;
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir kuyruğun sağlığını okumak: hazır, onay bekleyen ve consumer sayısı", "Reading a queue's health: ready, unacked and consumer count"),
  view: (b, info) => {
    const panel = info.sandbox ? undefined : PANELS[info.step];
    if (panel === "connections") return <ConnectionsPanel t={info.t} />;
    if (panel === "alarms") return <AlarmPanel t={info.t} />;
    if (panel === "checklist") return <ChecklistPanel t={info.t} />;
    return (
      <BrokerStage
        broker={b}
        last={info.last}
        prev={info.prev}
        labels={labels(info.t)}
        layout={{ producers: [{ id: "shop", label: info.t(l("Mağaza", "Shop")), exchange: "", queue: QUEUE }], consumerNames: names(info.t) }}
      />
    );
  },
  metrics: (b, t) => {
    const d = depth(b, QUEUE);
    const consumers = Object.values(b.consumers).filter((c) => c.queue === QUEUE).length;
    const done = Object.values(b.consumers).reduce((k, c) => k + c.done.length, 0);
    return [
      { label: t(l("Hazır (ready)", "Ready")), value: d.ready, tone: d.ready >= 3 ? "danger" : d.ready ? "warn" : "plain" },
      { label: t(l("Onay bekleyen", "Unacked")), value: d.unacked, tone: d.unacked ? "warn" : "plain" },
      { label: t(l("Consumer", "Consumers")), value: consumers, tone: consumers === 0 ? "danger" : "ok" },
      { label: t(l("Bağlı işçilerin bitirdiği", "Done by connected workers")), value: done },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
