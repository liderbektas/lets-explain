import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage, type ProducerSpec } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

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

const names = (t: (x: L) => string) => ({ w1: t(l("İşçi", "Worker")), w2: t(l("İşçi", "Worker")), w: t(l("İşçi", "Worker")) });

const SANDBOX_LIMIT = 2;
const sandboxSetup: BrokerAction[] = [
  { type: "declareExchange", name: "dlx", kind: "fanout" },
  { type: "declareQueue", name: PARKING },
  { type: "bind", exchange: "dlx", queue: PARKING },
  { type: "declareQueue", name: QQ, queueType: "quorum", args: { deliveryLimit: SANDBOX_LIMIT, dlx: "dlx" } },
  { type: "consume", tag: "w", queue: QQ, prefetch: 1 },
];
const sandboxStart = (): Broker => simulate(sandboxSetup, createBroker()).states[sandboxSetup.length]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const held = b.consumers.w?.unacked.length ?? 0;
  return [
    {
      label: tr ? "Uygulama" : "App",
      buttons: [
        { label: tr ? "Bozuk mesaj" : "Bad message", action: to(QQ, `bad${sent + 1}`), tone: "danger", disabled: sent >= 3 },
        { label: tr ? "Sağlam mesaj" : "Good message", action: to(QQ, `ok${sent + 1}`), tone: "producer", disabled: sent >= 3 },
      ],
    },
    {
      label: tr ? "İşçi" : "Worker",
      buttons: [
        { label: "ack", action: { type: "ack", tag: "w" }, tone: "ok", disabled: held === 0 },
        { label: "nack (requeue)", action: nack("w", true), disabled: held === 0 },
        { label: "reject", action: nack("w", false), tone: "danger", disabled: held === 0 },
      ],
    },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bozuk bir mesaj, onu sayan bir quorum queue ve park kuyruğu", "A broken message, a quorum queue that counts it, and a parking queue"),
  view: (b, info) => {
    const producers: ProducerSpec[] = info.sandbox
      ? [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QQ }]
      : info.step <= 2
        ? [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: OLD }]
        : info.step >= 6
          ? [
              { id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QQ },
              { id: "retrier", label: info.t(l("Sonra dene", "Retry later")), exchange: "", queue: RETRY },
            ]
          : [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QQ }];
    return (
      <BrokerStage
        broker={b}
        last={info.last}
        labels={labels(info.t)}
        kindOf={kindOf}
        layout={{ producers, exchanges: ["dlx"], queues: [OLD, QQ, RETRY, PARKING], consumerNames: names(info.t) }}
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
  sandbox: { start: sandboxStart, rows, missions },
});
