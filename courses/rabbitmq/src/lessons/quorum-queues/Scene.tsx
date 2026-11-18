import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, queueAvailable, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";
import { NodesPanel, shownLeader, type NodesLabels } from "./NodesPanel";

export const SLUG = "quorum-queues";

const send = (queue: string, body: string): BrokerAction => ({ type: "publish", exchange: "", routingKey: queue, body, persistent: true });
const down = (node: string): BrokerAction => ({ type: "nodeDown", node });
const up = (node: string): BrokerAction => ({ type: "nodeUp", node });

/** Three nodes, a classic queue living on rabbit@1 and a quorum queue spread over all three. */
export const START: Broker = simulate(
  [
    { type: "declareQueue", name: "cache", node: "rabbit@1" },
    { type: "declareQueue", name: "orders", queueType: "quorum" },
  ],
  createBroker({ nodes: 3 }),
).states[2]!;

export const steps: BrokerAction[][] = [
  [],
  [send("cache", "c1"), send("orders", "o1"), send("cache", "c2"), send("orders", "o2")],
  [down("rabbit@1")],
  [send("cache", "c3"), send("orders", "o3")],
  [down("rabbit@2"), send("orders", "o4")],
  [up("rabbit@2"), up("rabbit@1")],
  [
    { type: "consume", tag: "cache-1", queue: "cache", prefetch: 0 },
    { type: "consume", tag: "orders-1", queue: "orders", prefetch: 0 },
    { type: "ack", tag: "cache-1", multiple: true },
    { type: "ack", tag: "orders-1", multiple: true },
  ],
  [],
  [],
];

export const nodeLabels = (t: (x: L) => string): NodesLabels => ({
  up: t(l("çalışıyor", "up")),
  down: t(l("kapalı", "down")),
  leader: "leader",
  follower: "follower",
  only: t(l("tek kopya", "only copy")),
});

/** The sandbox: a quorum queue "jobs", a classic queue "cache" on rabbit@1, three nodes to break. */
const sandboxStart = (): Broker =>
  simulate(
    [
      { type: "declareQueue", name: "cache", node: "rabbit@1" },
      { type: "declareQueue", name: "jobs", queueType: "quorum" },
    ],
    createBroker({ nodes: 3 }),
  ).states[2]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  return [
    {
      label: tr ? "Uygulama" : "App",
      buttons: [
        { label: tr ? "→ jobs (quorum)" : "→ jobs (quorum)", action: send("jobs", `j${sent + 1}`), tone: "producer" },
        { label: tr ? "→ cache (classic)" : "→ cache (classic)", action: send("cache", `c${sent + 1}`), tone: "producer" },
      ],
    },
    ...b.nodes.map((n) => ({
      label: n.name,
      buttons: [n.alive ? { label: tr ? "Çökert" : "Take down", action: down(n.name), tone: "danger" as const } : { label: tr ? "Başlat" : "Bring up", action: up(n.name), tone: "ok" as const }],
    })),
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Üç node'luk bir cluster: tek kopyalı classic kuyruk ve üç kopyalı quorum kuyruğu", "A three-node cluster: a single-copy classic queue and a three-copy quorum queue"),
  view: (b, info) => {
    const quorum = info.sandbox ? "jobs" : "orders";
    return (
      <g>
        <BrokerStage
          broker={b}
          last={info.last}
          labels={labels(info.t)}
          box={{ x: 0, y: 0, w: 860, h: 300 }}
          kindOf={(m) => (m.routingKey === "cache" ? "neutral" : "order")}
          layout={{
            producers: [
              { id: "app-cache", label: info.t(l("Önbellek", "Cache app")), exchange: "", queue: "cache" },
              { id: "app-quorum", label: info.t(info.sandbox ? l("İşler", "Jobs app") : l("Sipariş", "Orders app")), exchange: "", queue: quorum },
            ],
            queues: ["cache", quorum],
            consumerNames: { "cache-1": info.t(l("Önbellek işçisi", "Cache worker")), "orders-1": info.t(l("Sipariş işçisi", "Order worker")) },
          }}
        />
        <NodesPanel broker={b} queues={["cache", quorum]} labels={nodeLabels(info.t)} box={{ x: 24, y: 318, w: 812, h: 132 }} />
      </g>
    );
  },
  metrics: (b, t, info) => {
    const quorum = info.sandbox ? "jobs" : "orders";
    const alive = b.nodes.filter((n) => n.alive).length;
    const qq = b.queues[quorum]!;
    const cq = b.queues.cache!;
    const lost = b.lost.length;
    return [
      { label: t(l("Çalışan node", "Nodes up")), value: `${alive}/${b.nodes.length}`, tone: alive < b.nodes.length ? "warn" : "plain" },
      { label: t(l("Quorum leader", "Quorum leader")), value: shownLeader(b, quorum) ?? t(l("yok", "none")), tone: queueAvailable(b, qq) ? "ok" : "danger" },
      { label: "cache", value: queueAvailable(b, cq) ? t(l("çalışıyor", "up")) : t(l("kapalı", "down")), tone: queueAvailable(b, cq) ? "plain" : "danger" },
      { label: t(l(`${quorum} hazır`, `${quorum} ready`)), value: depth(b, quorum).ready },
      { label: t(l("Kayıp", "Lost")), value: lost, tone: lost ? "danger" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
