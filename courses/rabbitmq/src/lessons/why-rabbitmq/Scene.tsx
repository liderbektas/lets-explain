import { l } from "@lets-explain/core/i18n";
import { createBroker, depth, type Broker, type BrokerAction } from "../../engine/broker";
import { MailroomStage } from "../../iso/MailroomStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene } from "../shared/BrokerScene";
import { DirectCall } from "./DirectCall";
import { FREE, scenarios } from "./scenarios";
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

const names = (t: (x: { tr: string; en: string }) => string) => ({
  "mailer-1": t(l("E-posta 1", "Email 1")),
  "mailer-2": t(l("E-posta 2", "Email 2")),
  // Typed: mailer.py run once is "mailer", run again "mailer-2".
  mailer: t(l("E-posta 1", "Email 1")),
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
      <MailroomStage
        broker={b}
        last={info.last}
        prev={info.prev}
        history={info.history}
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
  // Free play is the email project; each scenario brings its own.
  sandbox: { start: () => FREE.broker, files: FREE.files, scenarios },
});
