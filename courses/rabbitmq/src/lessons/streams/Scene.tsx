import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";
import { OffsetPanel } from "./OffsetPanel";

export const SLUG = "streams";
const STREAM = "events";

const send = (body: string): BrokerAction => ({ type: "publish", exchange: "", routingKey: STREAM, body, persistent: true });
type Offset = "first" | "last" | "next" | number;
const read = (tag: string, offset: Offset): BrokerAction => ({ type: "consume", tag, queue: STREAM, prefetch: 10, offset });
const ackAll = (tag: string): BrokerAction => ({ type: "ack", tag, multiple: true });

/** One stream called "events", nobody reading yet. */
export const START: Broker = simulate([{ type: "declareQueue", name: STREAM, queueType: "stream" }], createBroker()).states[1]!;

export const steps: BrokerAction[][] = [
  [],
  [send("e1"), send("e2"), send("e3")],
  [read("analytics", "first"), ackAll("analytics")],
  [read("billing", "first")],
  [{ type: "cancel", tag: "analytics" }, read("audit", "next"), send("e4")],
  [{ type: "cancel", tag: "audit" }, read("replay", 1)],
  [],
  [],
  [],
];

const names = (t: (x: L) => string, sandbox: boolean): Record<string, string> =>
  sandbox
    ? { a: t(l("Okuyucu A", "Reader A")), b: t(l("Okuyucu B", "Reader B")) }
    : {
        analytics: t(l("Analitik", "Analytics")),
        billing: t(l("Fatura", "Billing")),
        audit: t(l("Denetim", "Audit")),
        replay: t(l("Yeniden oynat", "Replay")),
      };

/** The sandbox: a stream with three events already in it and two readers. */
const sandboxStart = (): Broker => simulate([{ type: "declareQueue", name: STREAM, queueType: "stream" }, send("e1"), send("e2"), send("e3")], createBroker()).states[4]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const reader = (tag: string, name: string): SandboxRow => {
    const c = b.consumers[tag];
    return {
      label: name,
      buttons: c
        ? [
            { label: tr ? "hepsine ack" : "ack all", action: ackAll(tag), tone: "ok", disabled: c.unacked.length === 0 },
            { label: tr ? "Ayrıl" : "Leave", action: { type: "cancel", tag } },
          ]
        : [
            { label: tr ? "Bağlan: first" : "Connect: first", action: read(tag, "first"), tone: "go" },
            { label: tr ? "Bağlan: next" : "Connect: next", action: read(tag, "next"), tone: "go" },
          ],
    };
  };
  return [
    { label: tr ? "Uygulama" : "App", buttons: [{ label: tr ? "Event gönder" : "Send event", action: send(`e${sent + 4}`), tone: "producer", disabled: sent >= 4 }] },
    reader("a", tr ? "Okuyucu A" : "Reader A"),
    reader("b", tr ? "Okuyucu B" : "Reader B"),
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir stream: mesajlar okununca silinmeyen bir log ve onu kendi offset'inden okuyanlar", "A stream: a log that keeps messages after reading, and readers each at their own offset"),
  view: (b, info) => (
    <g>
      <BrokerStage
        broker={b}
        last={info.last}
        labels={labels(info.t)}
        box={{ x: 0, y: 0, w: 860, h: 290 }}
        layout={{ producers: [{ id: "app", label: info.t(l("Uygulama", "App")), exchange: "", queue: STREAM }], consumerNames: names(info.t, info.sandbox) }}
      />
      <OffsetPanel broker={b} stream={STREAM} names={names(info.t, info.sandbox)} title={info.t(l("events log'u ve her okuyucunun sıradaki offset'i", "The events log and each reader's next offset"))} box={{ x: 24, y: 298, w: 812, h: 164 }} />
    </g>
  ),
  metrics: (b, t) => {
    const q = b.queues[STREAM]!;
    const readers = Object.values(b.consumers).filter((c) => c.queue === STREAM).length;
    return [
      { label: t(l("Log'daki mesaj", "Messages in log")), value: q.log.length },
      { label: t(l("Okuyucu", "Readers")), value: readers },
      { label: t(l("Toplam teslim", "Deliveries")), value: b.deliveries.length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
