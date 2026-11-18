import { l } from "@lets-explain/core/i18n";
import { Parcel } from "@lets-explain/core/iso/shapes";
import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { DeathPanel } from "./DeathPanel";
import { missions } from "./missions";

export const SLUG = "dead-letters";

const send = (queue: string, body: string, ttl?: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: queue, body, persistent: true, ttl });

/** A DLX (fanout) with a `dead` queue, a `work` queue that dead-letters to it, and its worker. */
export const START: Broker = simulate(
  [
    { type: "declareExchange", name: "dlx", kind: "fanout" },
    { type: "declareQueue", name: "dead" },
    { type: "bind", exchange: "dlx", queue: "dead" },
    { type: "declareQueue", name: "work", args: { dlx: "dlx" } },
    { type: "consume", tag: "worker", queue: "work", prefetch: 1 },
  ],
  createBroker(),
).states[5]!;

export const steps: BrokerAction[][] = [
  [],
  [send("work", "a1"), { type: "nack", tag: "worker", requeue: false }],
  [{ type: "declareQueue", name: "waiting", args: { ttl: 3, dlx: "dlx" } }, send("waiting", "b1"), { type: "tick" }, { type: "tick" }, { type: "tick" }],
  [],
  [{ type: "declareQueue", name: "box", args: { maxLength: 2, dlx: "dlx" } }, send("box", "c1"), send("box", "c2"), send("box", "c3")],
  [{ type: "declareQueue", name: "strict", args: { maxLength: 1, overflow: "reject-publish", dlx: "dlx" } }, send("strict", "d1"), send("strict", "d2")],
  [
    { type: "declareExchange", name: "errors-x", kind: "direct" },
    { type: "declareQueue", name: "errors" },
    { type: "bind", exchange: "errors-x", queue: "errors", key: "payment.failed" },
    { type: "declareQueue", name: "payments", args: { dlx: "errors-x", dlxKey: "payment.failed" } },
    { type: "consume", tag: "payer", queue: "payments", prefetch: 1 },
    send("payments", "e1"),
    { type: "nack", tag: "payer", requeue: false },
  ],
  [
    { type: "declareExchange", name: "retry-x", kind: "fanout" },
    { type: "declareQueue", name: "jobs.retry", args: { ttl: 2, dlx: "", dlxKey: "jobs" } },
    { type: "bind", exchange: "retry-x", queue: "jobs.retry" },
    { type: "declareQueue", name: "jobs", args: { dlx: "retry-x" } },
    { type: "consume", tag: "job-worker", queue: "jobs", prefetch: 1 },
    send("jobs", "f1"),
    { type: "nack", tag: "job-worker", requeue: false },
    { type: "tick" },
    { type: "tick" },
  ],
  [],
  [],
];

/** What each step draws: queues, exchanges, and the consumers that belong to them. */
const VIEW: { queues: string[]; exchanges: string[]; dead: string[] }[] = [
  { queues: ["work", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["work", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["waiting", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["work", "waiting", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["box", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["strict", "dead"], exchanges: ["dlx"], dead: ["dead"] },
  { queues: ["payments", "errors"], exchanges: ["errors-x"], dead: ["errors"] },
  { queues: ["jobs", "jobs.retry"], exchanges: ["retry-x"], dead: ["jobs.retry", "jobs"] },
  { queues: ["jobs", "jobs.retry", "dead"], exchanges: ["retry-x", "dlx"], dead: ["dead", "jobs"] },
];

const PRODUCER_QUEUE = ["work", "work", "waiting", "work", "box", "strict", "payments", "jobs", "jobs"];

/** Dead or retried messages are coral, everything else mint. */
export const kindOf = (m: Message) => (m.deaths.length ? "cancel" : "order");

/* Sandbox: `work` holds at most 2 waiting messages (drop-head) and dead-letters to `dead`. */
const sandboxStart = (): Broker =>
  simulate(
    [
      { type: "declareExchange", name: "dlx", kind: "fanout" },
      { type: "declareQueue", name: "dead" },
      { type: "bind", exchange: "dlx", queue: "dead" },
      { type: "declareQueue", name: "work", args: { dlx: "dlx", maxLength: 2 } },
      { type: "consume", tag: "worker", queue: "work", prefetch: 1 },
    ],
    createBroker(),
  ).states[5]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const n = history.filter((a) => a.type === "publish").length + 1;
  const holding = (b.consumers.worker?.unacked.length ?? 0) > 0;
  const ticks = history.filter((a) => a.type === "tick").length;
  return [
    {
      label: tr ? "Gönder" : "Send",
      buttons: [
        { label: tr ? "mesaj" : "message", action: send("work", `m${n}`), tone: "producer", disabled: n > 5 },
        { label: tr ? "TTL'li mesaj (2 tik)" : "message with TTL (2 ticks)", action: send("work", `m${n}`, 2), tone: "producer", disabled: n > 5 },
      ],
    },
    {
      label: tr ? "İşçi" : "Worker",
      buttons: [
        { label: "ack", action: { type: "ack", tag: "worker" }, tone: "ok", disabled: !holding },
        { label: tr ? "reddet" : "reject", action: { type: "nack", tag: "worker", requeue: false }, tone: "danger", disabled: !holding },
        { label: tr ? "geri koy" : "requeue", action: { type: "nack", tag: "worker", requeue: true }, disabled: !holding },
      ],
    },
    { label: tr ? "Zaman" : "Time", buttons: [{ label: tr ? "1 tik" : "1 tick", action: { type: "tick" }, disabled: ticks >= 4 }] },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Reddedilen, süresi dolan ve sığmayan mesajlar dead letter exchange'e gider", "Rejected, expired and overflowing messages go to a dead letter exchange"),
  view: (b, info) => {
    const v = info.sandbox ? { queues: ["work", "dead"], exchanges: ["dlx"], dead: ["dead"] } : VIEW[Math.min(info.step, VIEW.length - 1)]!;
    const queue = info.sandbox ? "work" : PRODUCER_QUEUE[Math.min(info.step, PRODUCER_QUEUE.length - 1)]!;
    const consumers = Object.keys(b.consumers).filter((tag) => v.queues.includes(b.consumers[tag]!.queue));
    return (
      <g>
        <BrokerStage
          broker={b}
          last={info.last}
          labels={labels(info.t)}
          kindOf={kindOf}
          box={{ x: 0, y: 0, w: 620, h: 470 }}
          layout={{
            producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue }],
            queues: v.queues,
            exchanges: v.exchanges,
            consumers,
            consumerNames: { worker: info.t(l("İşçi", "Worker")), payer: info.t(l("Ödeme", "Payments")), "job-worker": info.t(l("İşçi", "Worker")) },
          }}
        />
        <DeathPanel broker={b} queues={v.dead} x={630} y={60} w={220} title="x-death" empty={info.t(l("Henüz dead letter yok", "No dead letters yet"))} />
      </g>
    );
  },
  metrics: (b, t, info) => {
    const deadQ = info.sandbox ? "dead" : (VIEW[Math.min(info.step, VIEW.length - 1)]!.dead[0] ?? "dead");
    const out: Metric[] = [
      { label: t(l(`${deadQ}'de`, `In ${deadQ}`)), value: depth(b, deadQ).ready, tone: depth(b, deadQ).ready ? "warn" : "plain" },
      { label: t(l("Zaman", "Time")), value: b.time },
      { label: t(l("İz bırakmadan kaybolan", "Lost without a trace")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
    return out;
  },
  legend: (t) => [
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="order" /></g>, label: t(l("normal mesaj", "normal message")) },
    { swatch: <g transform="translate(0 3)"><Parcel s={9} kind="cancel" /></g>, label: t(l("dead letter olmuş (x-death taşıyor)", "dead-lettered (carries x-death)")) },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
