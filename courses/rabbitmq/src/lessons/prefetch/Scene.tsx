import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { FREE, scenarios } from "./scenarios";

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

const names = (t: (x: L) => string) => ({
  fast: t(l("Hızlı işçi", "Fast worker")),
  slow: t(l("Yavaş işçi", "Slow worker")),
  // Typed: the scripts' consumer tags.
  fast_worker: t(l("Hızlı işçi", "Fast worker")),
  slow_worker: t(l("Yavaş işçi", "Slow worker")),
});

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir iş kuyruğu, hızlı ve yavaş iki işçi", "A job queue with a fast and a slow worker"),
  view: (b, info) => (
    <BrokerStage
      broker={b}
      last={info.last}
      prev={info.prev}
      labels={labels(info.t)}
      layout={{ producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: QUEUE }], consumerNames: names(info.t) }}
    />
  ),
  metrics: (b, t, info) => {
    // In the try-it step the workers are the scripts, tagged after their files.
    const tag = (x: "fast" | "slow") => (info.sandbox ? `${x}_worker` : x);
    const held = (x: "fast" | "slow") => b.consumers[tag(x)]?.unacked.length ?? 0;
    const done = (x: "fast" | "slow") => b.consumers[tag(x)]?.done.length ?? 0;
    return [
      { label: t(l("Kuyrukta bekleyen", "Waiting")), value: depth(b, QUEUE).ready, tone: depth(b, QUEUE).ready ? "warn" : "plain" },
      { label: t(l("Hızlının bitirdiği", "Fast done")), value: done("fast"), tone: "plain" },
      { label: t(l("Yavaşın elinde", "Slow holds")), value: held("slow"), tone: held("slow") > 1 ? "danger" : "plain" },
      { label: t(l("Hızlı boşta", "Fast idle")), value: b.consumers[tag("fast")] ? (held("fast") === 0 ? t(l("evet", "yes")) : t(l("hayır", "no"))) : "—", tone: b.consumers[tag("fast")] && held("fast") === 0 && depth(b, QUEUE).total > 0 ? "danger" : "plain" },
    ];
  },
  // Free play is the reports project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
