import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, queueAvailable, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { MailroomStage } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type ViewInfo } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";
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

/** The quorum queue to watch: `orders` in the lesson; in the try-it step whichever quorum queue the project has. */
const quorumOf = (b: Broker, info: Pick<ViewInfo, "sandbox">) =>
  info.sandbox ? (Object.values(b.queues).find((q) => q.type === "quorum")?.name ?? Object.keys(b.queues)[0] ?? "orders") : "orders";

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Üç node'luk bir cluster: tek kopyalı classic kuyruk ve üç kopyalı quorum kuyruğu", "A three-node cluster: a single-copy classic queue and a three-copy quorum queue"),
  view: (b, info) => {
    const quorum = quorumOf(b, info);
    const queues = info.sandbox ? Object.keys(b.queues).sort() : ["cache", quorum];
    return (
      <g>
        <MailroomStage
          broker={b}
          last={info.last}
          prev={info.prev}
          history={info.history}
          labels={labels(info.t)}
          box={{ x: 0, y: 0, w: 860, h: 300 }}
          kindOf={(m) => (m.routingKey === "cache" ? "neutral" : "order")}
          layout={{
            producers: [
              ...queues.filter((q) => q !== quorum).map((q) => ({ id: `app-${q}`, label: q === "cache" ? info.t(l("Önbellek", "Cache app")) : q, exchange: "", queue: q })),
              { id: "app-quorum", label: info.t(quorum === "payments" ? l("Ödeme", "Payments app") : l("Sipariş", "Orders app")), exchange: "", queue: quorum },
            ],
            queues,
            consumerNames: { "cache-1": info.t(l("Önbellek işçisi", "Cache worker")), "orders-1": info.t(l("Sipariş işçisi", "Order worker")) },
          }}
        />
        <NodesPanel broker={b} last={info.last} queues={queues} labels={nodeLabels(info.t)} box={{ x: 24, y: 318, w: 812, h: 132 }} />
      </g>
    );
  },
  metrics: (b, t, info) => {
    const quorum = quorumOf(b, info);
    const alive = b.nodes.filter((n) => n.alive).length;
    const qq = b.queues[quorum];
    const cq = b.queues.cache;
    const lost = b.lost.length;
    const out: Metric[] = [{ label: t(l("Çalışan node", "Nodes up")), value: `${alive}/${b.nodes.length}`, tone: alive < b.nodes.length ? "warn" : "plain" }];
    if (qq && qq.type === "quorum") out.push({ label: t(l("Quorum leader", "Quorum leader")), value: shownLeader(b, quorum) ?? t(l("yok", "none")), tone: queueAvailable(b, qq) ? "ok" : "danger" });
    if (cq) out.push({ label: "cache", value: queueAvailable(b, cq) ? t(l("çalışıyor", "up")) : t(l("kapalı", "down")), tone: queueAvailable(b, cq) ? "plain" : "danger" });
    if (qq) out.push({ label: t(l(`${quorum} hazır`, `${quorum} ready`)), value: depth(b, quorum).ready });
    out.push({ label: t(l("Kayıp", "Lost")), value: lost, tone: lost ? "danger" : "plain" });
    return out;
  },
  // Free play: the cluster with a quorum `orders` and a classic `cache`; each scenario brings its own project.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
