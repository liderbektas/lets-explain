import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { DirectCall } from "./DirectCall";
import { missions } from "./missions";
import "./why.css";

export const SLUG = "why-rabbitmq";
export const QUEUE = "emails";

const order = (n: number): BrokerAction => ({ type: "publish", exchange: "", routingKey: QUEUE, body: `o${n}` });
const mailer = (tag: string): BrokerAction => ({ type: "consume", tag, queue: QUEUE, prefetch: 1, speed: 1 });
const tick: BrokerAction = { type: "tick" };

export const START: Broker = createBroker();

export const steps: BrokerAction[][] = [
  [],
  [],
  [{ type: "declareQueue", name: QUEUE }, order(1), order(2), order(3)],
  [mailer("mailer-1"), tick, tick, tick],
  [order(4), order(5), order(6), order(7), order(8), order(9), tick, tick],
  [mailer("mailer-2"), tick, tick],
  [],
  [],
];

/** The sandbox: an empty emails queue, two mail workers that handle one email per second. */
const sandboxStart = (): Broker => simulate([{ type: "declareQueue", name: QUEUE }], createBroker()).states[1]!;

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const sent = history.filter((a) => a.type === "publish").length;
  const worker = (tag: string, name: string): SandboxRow => ({
    label: name,
    buttons: b.consumers[tag]
      ? [{ label: tr ? "Çökert" : "Crash", action: { type: "crashConsumer", tag }, tone: "danger" }]
      : [{ label: tr ? "Bağlan" : "Connect", action: mailer(tag), tone: "go" }],
  });
  return [
    { label: tr ? "Sipariş" : "Orders", buttons: [{ label: tr ? "Sipariş ver" : "Place order", action: order(sent + 1), tone: "producer", disabled: sent >= 6 }] },
    worker("w1", tr ? "E-posta 1" : "Email 1"),
    worker("w2", tr ? "E-posta 2" : "Email 2"),
    { label: tr ? "Zaman" : "Time", buttons: [{ label: tr ? "1 saniye geçir" : "Wait 1 second", action: tick }] },
  ];
}

const names = (t: (x: { tr: string; en: string }) => string) => ({
  "mailer-1": t(l("E-posta 1", "Email 1")),
  "mailer-2": t(l("E-posta 2", "Email 2")),
  w1: t(l("E-posta 1", "Email 1")),
  w2: t(l("E-posta 2", "Email 2")),
});

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Sipariş servisi, e-posta servisi ve aralarındaki kuyruk", "The order service, the email service and the queue between them"),
  view: (b, info) =>
    info.step < 2 && !info.sandbox ? (
      <DirectCall
        down={info.step === 1}
        labels={{
          orders: info.t(l("Sipariş servisi", "Order service")),
          email: info.t(l("E-posta servisi", "Email service")),
          call: info.t(l("doğrudan çağrı (HTTP)", "direct call (HTTP)")),
          noAnswer: info.t(l("cevap yok", "no answer")),
          waiting: info.t(l("bekliyor…", "waiting…")),
        }}
      />
    ) : (
      <BrokerStage
        broker={b}
        last={info.last}
        labels={labels(info.t)}
        layout={{ producers: [{ id: "orders", label: info.t(l("Sipariş servisi", "Order service")), exchange: "", queue: QUEUE }], consumerNames: names(info.t) }}
      />
    ),
  metrics: (b, t, info) => {
    if (info.step < 2 && !info.sandbox) {
      return [
        { label: t(l("Bağlantı", "Connection")), value: t(l("doğrudan", "direct")) },
        { label: t(l("E-posta servisi", "Email service")), value: info.step === 1 ? t(l("kapalı", "down")) : t(l("açık", "up")), tone: info.step === 1 ? "danger" : "ok" },
      ];
    }
    const d = depth(b, QUEUE);
    const done = Object.values(b.consumers).reduce((n, c) => n + c.done.length, 0);
    return [
      { label: t(l("Kuyrukta bekleyen", "Waiting")), value: d.ready, tone: d.ready > 2 ? "warn" : "plain" },
      { label: t(l("İşlenen", "Handled")), value: done, tone: "ok" },
      { label: t(l("İşçi", "Workers")), value: Object.keys(b.consumers).length },
      { label: t(l("Kaybolan", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
