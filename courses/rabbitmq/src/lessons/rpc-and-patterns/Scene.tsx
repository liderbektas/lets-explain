import { l, type L } from "@lets-explain/core/i18n";
import { createBroker, depth, simulate, type Broker, type BrokerAction, type Message } from "../../engine/broker";
import { BrokerStage } from "../../iso/BrokerStage";
import { labels } from "../first-queue/Scene";
import { makeBrokerScene, type SandboxRow } from "../shared/BrokerScene";
import { missions } from "./missions";
import { PatternsPanel } from "./PatternsPanel";

export const SLUG = "rpc-and-patterns";
export const RPC = "rpc";
export const REPLY = "reply";

/** The client asks: a request into the rpc queue, saying where to answer and which question it is. */
export const ask = (n: number, ttl?: number): BrokerAction => ({
  type: "publish",
  exchange: "",
  routingKey: RPC,
  body: `r${n}`,
  replyTo: REPLY,
  correlationId: `c${n}`,
  ttl,
});

/** A server answers a request: to its reply_to queue, with the same correlation id. */
export const answer = (m: Pick<Message, "replyTo" | "correlationId">): BrokerAction => ({
  type: "publish",
  exchange: "",
  routingKey: m.replyTo ?? REPLY,
  body: `a${(m.correlationId ?? "c?").slice(1)}`,
  correlationId: m.correlationId,
});

const server = (tag: string): BrokerAction => ({ type: "consume", tag, queue: RPC, prefetch: 1 });
const ack = (tag: string): BrokerAction => ({ type: "ack", tag });

/** Two servers on the rpc queue; the client listens on its own reply queue. */
export const START: Broker = simulate(
  [
    { type: "declareQueue", name: RPC },
    { type: "declareQueue", name: REPLY, durable: false },
    server("server-1"),
    server("server-2"),
    { type: "consume", tag: "client", queue: REPLY, prefetch: 0 },
  ],
  createBroker(),
).states[5]!;

export const steps: BrokerAction[][] = [
  [],
  [ask(1)],
  [answer({ replyTo: REPLY, correlationId: "c1" }), ack("server-1")],
  [ack("client")],
  // c2 goes to server-2, c3 to server-1. server-1 is quicker, so c3's answer arrives first.
  [ask(2), ask(3), answer({ replyTo: REPLY, correlationId: "c3" }), ack("server-1"), answer({ replyTo: REPLY, correlationId: "c2" }), ack("server-2")],
  // Both servers go away; a request with a TTL waits, then expires.
  [ack("client"), ack("client"), { type: "cancel", tag: "server-1" }, { type: "cancel", tag: "server-2" }, ask(4, 3), { type: "tick", count: 3 }],
  [],
  [],
  [],
  [],
];

export const PATTERNS_STEP = 7;

const names = (t: (x: L) => string): Record<string, string> => ({
  "server-1": t(l("Sunucu 1", "Server 1")),
  "server-2": t(l("Sunucu 2", "Server 2")),
  client: t(l("İstemci (cevaplar)", "Client (answers)")),
});

/** The sandbox: two servers and the client, nothing sent yet. */
const sandboxStart = (): Broker => START;

/** Requests the sandbox has sent so far. */
const sent = (history: BrokerAction[]) => history.filter((a) => a.type === "publish" && a.routingKey === RPC).length;

/** Has this server already sent the answer for the request it holds? */
function answered(history: BrokerAction[], corr: string | undefined) {
  return history.some((a) => a.type === "publish" && a.routingKey === REPLY && a.correlationId === corr);
}

function rows(b: Broker, lang: "tr" | "en", history: BrokerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const n = sent(history);
  const serverRow = (tag: string, name: string): SandboxRow => {
    const c = b.consumers[tag];
    if (!c) return { label: name, buttons: [{ label: tr ? "Bağlan" : "Connect", action: server(tag), tone: "go" }] };
    const held = c.unacked[0];
    const done = held ? answered(history, held.correlationId) : false;
    return {
      label: name,
      buttons: [
        { label: tr ? "Cevapla" : "Answer", action: held ? answer(held) : answer({ replyTo: REPLY, correlationId: "c0" }), tone: "producer", disabled: !held || done },
        { label: tr ? "İsteğe ack" : "Ack request", action: ack(tag), tone: "ok", disabled: !held || !done },
        { label: tr ? "Çökert" : "Crash", action: { type: "crashConsumer", tag }, tone: "danger" },
      ],
    };
  };
  const client = b.consumers.client;
  return [
    {
      label: tr ? "İstemci" : "Client",
      buttons: [
        { label: tr ? "İstek gönder" : "Send request", action: ask(n + 1), tone: "producer", disabled: n >= 3 },
        { label: tr ? "Cevaba ack" : "Ack answer", action: ack("client"), tone: "ok", disabled: !client || client.unacked.length === 0 },
      ],
    },
    serverRow("server-1", tr ? "Sunucu 1" : "Server 1"),
    serverRow("server-2", tr ? "Sunucu 2" : "Server 2"),
  ];
}

export const scene = makeBrokerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("İstemci istek kuyruğuna yazar, sunucu cevabı istemcinin kuyruğuna yazar", "The client writes to the request queue, the server writes the answer to the client's queue"),
  view: (b, info) =>
    info.step === PATTERNS_STEP && !info.sandbox ? (
      <PatternsPanel t={info.t} />
    ) : (
      <BrokerStage
        broker={b}
        last={info.last}
        labels={labels(info.t)}
        kindOf={(m) => (m.routingKey === REPLY ? "payment" : "order")}
        layout={{
          producers: [
            { id: "client", label: info.t(l("İstemci (istek)", "Client (request)")), exchange: "", queue: RPC },
            { id: "server-out", label: info.t(l("Sunucu (cevap)", "Server (answer)")), exchange: "", queue: REPLY },
          ],
          queues: [RPC, REPLY],
          // Servers next to the request queue, the client next to its reply queue: no crossing roads.
          consumers: ["server-1", "server-2", "client"],
          consumerNames: names(info.t),
        }}
      />
    ),
  metrics: (b, t) => {
    const client = b.consumers.client;
    const waiting = depth(b, RPC);
    const got = client?.unacked.map((m) => m.correlationId).join(", ") || "—";
    return [
      { label: t(l("Bekleyen istek", "Waiting requests")), value: waiting.total, tone: waiting.ready ? "warn" : "plain" },
      { label: t(l("Sunucu", "Servers")), value: Object.values(b.consumers).filter((c) => c.queue === RPC).length, tone: Object.values(b.consumers).some((c) => c.queue === RPC) ? "plain" : "danger" },
      { label: t(l("Gelen cevap (correlation id)", "Answers in (correlation id)")), value: got },
      { label: t(l("Kayıp", "Lost")), value: b.lost.length, tone: b.lost.length ? "danger" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
