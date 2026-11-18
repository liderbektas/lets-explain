import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";

export const SLUG = "prefetch";
export const QUEUE = "jobs";
/** The fast worker finishes up to 3 jobs a tick; the slow one is stuck on whatever it holds. */
export const FAST_SPEED = 3;

const send = (body: string): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body });
const fast = (prefetch: number): BrokerAction => ({ type: "consume", tag: "fast", queue: QUEUE, prefetch, speed: FAST_SPEED });
const slow = (prefetch: number): BrokerAction => ({ type: "consume", tag: "slow", queue: QUEUE, prefetch, speed: 0 });
const tick: BrokerAction = { type: "tick" };
const sends = (from: number, n: number) => Array.from({ length: n }, (_, i) => send(`j${from + i}`));

/** Both workers already listen, with no prefetch limit (0 = unlimited). */
const setup: BrokerAction[] = [{ type: "declareQueue", name: QUEUE }, fast(0), slow(0)];
export const START: Broker = simulate(setup, createBroker()).states[setup.length]!;

export const steps: BrokerAction[][] = [
  [],
  sends(1, 8),
  [tick, tick],
  [{ type: "cancel", tag: "fast" }, { type: "cancel", tag: "slow" }, fast(1), slow(1)],
  sends(9, 4),
  [tick, tick, tick, tick],
  [{ type: "cancel", tag: "fast" }, fast(3), ...sends(13, 3), tick, tick],
  [],
  [],
];

const names = (t: (x: L) => string) => ({ fast: t(l("Hızlı işçi", "Fast worker")), slow: t(l("Yavaş işçi", "Slow worker")) });

const sandboxStart = (): Broker => simulate(setup, createBroker()).states[setup.length]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const worker = (tag: "fast" | "slow", name: string): SandboxRow => {
    const connect = tag === "fast" ? fast : slow;
    return {
      label: name,
      buttons: b.consumers[tag]
        ? [{ label: tr ? "Ayrıl" : "Disconnect", action: { type: "cancel", tag } }]
        : [
            { label: tr ? "Bağlan (prefetch 1)" : "Connect (prefetch 1)", action: connect(1), tone: "go" },
            { label: tr ? "Bağlan (sınırsız)" : "Connect (no limit)", action: connect(0), tone: "go" },
          ],
    };
  };
  return [
    { label: tr ? "Uygulama" : "App", buttons: [{ label: tr ? "İş gönder" : "Send job", action: send(`j${sent + 1}`), tone: "producer", disabled: sent >= 6 }] },
    worker("fast", tr ? "Hızlı" : "Fast"),
    worker("slow", tr ? "Yavaş" : "Slow"),
    { label: tr ? "Zaman" : "Time", buttons: [{ label: tr ? "Bir tur bekle" : "Wait one tick", action: tick }] },
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir iş kuyruğu, hızlı ve yavaş iki işçi", "A job queue with a fast and a slow worker"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      labels={labels(info.t)}
      layout={{ producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QUEUE }], consumerNames: names(info.t) }}
    />
  ),
  metrics: (b, t) => {
    const held = (tag: string) => b.consumers[tag]?.unacked.length ?? 0;
    const done = (tag: string) => b.consumers[tag]?.done.length ?? 0;
    return [
      { label: t(l("Kuyrukta bekleyen", "Waiting")), value: depth(b, QUEUE).ready, tone: depth(b, QUEUE).ready ? "warn" : "plain" },
      { label: t(l("Hızlının bitirdiği", "Fast done")), value: done("fast"), tone: "plain" },
      { label: t(l("Yavaşın elinde", "Slow holds")), value: held("slow"), tone: held("slow") > 1 ? "danger" : "plain" },
      { label: t(l("Hızlı boşta", "Fast idle")), value: b.consumers.fast ? (held("fast") === 0 ? t(l("evet", "yes")) : t(l("hayır", "no"))) : "—", tone: b.consumers.fast && held("fast") === 0 && depth(b, QUEUE).total > 0 ? "danger" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
