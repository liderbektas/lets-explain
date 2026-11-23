import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { PhoneStage } from "../../iso/PhoneStage";
import { flowMetrics } from "../shared/metrics";
import { makeNetScene } from "../shared/NetScene";
import { phoneLabels } from "../shared/phone";
import { browserGet, browserPost, browserSocket, wait } from "../shared/requests";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "sse-and-websocket";

export const START = createNet({
  messages: [
    { from: "ayse", text: "Morning! Stand-up at 10" },
    { from: "mert", text: "Deploy at 10:30" },
  ],
  seenUpTo: 2,
  planned: [
    { at: 3000, from: "ayse", text: "Deploy starts" },
    { at: 6000, from: "mert", text: "Tests are green" },
    { at: 8000, from: "zeynep", text: "Staging looks good" },
    { at: 15000, from: "mert", text: "Deploy done" },
  ],
});

const chat = (text: string): NetAction => ({ type: "wsSend", client: "browser", text: JSON.stringify({ type: "chat", text }) });

export const steps: NetAction[][] = [
  // 0 · one request whose answer never ends; two messages come down it.
  [browserGet("/events"), wait(3000), wait(3000)],
  // 1 · the Wi-Fi drops, Zeynep writes meanwhile, EventSource comes back with Last-Event-ID.
  [{ type: "netDown", client: "browser" }, wait(3000), { type: "netUp", client: "browser" }, browserGet("/events", [["Last-Event-ID", "4"]])],
  // 2 · to write, the page needs a second, separate request.
  [browserPost("Joining in 5")],
  // 3 · WebSocket: one connection, both ways.
  [{ type: "hangUp", client: "browser" }, browserSocket(), chat("On my way"), wait(6000)],
  // 4 · what each way costs per message.
  [],
  // 5 · when to pick which.
  [],
  // 6 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l(
    "Solda tarayıcının açık olduğu telefon, sağda sohbet sunucusunun kabini. Kesik çizgi tek seferlik HTTP istekleri; sarı kablo bir SSE akışı (sadece sunucudan telefona), yeşil kablo bir WebSocket (iki yön).",
    "The phone running the browser on the left, the chat server's rack on the right. The dashed lane is one-off HTTP requests; the yellow cable an SSE stream (server to phone only), the green one a WebSocket (both ways).",
  ),
  view: (net, info) => (
    <PhoneStage
      net={net}
      last={info.last}
      beat={info.beat}
      device={info.sandbox ? "laptop" : "phone"}
      labels={phoneLabels(info.t, info.lang, info.sandbox ? l("Sen (terminal)", "You (terminal)") : l("Tarayıcı", "Browser"))}
    />
  ),
  metrics: (net, t, info) => {
    const [requests, , waited] = flowMetrics(net, info.from, t);
    const open = net.exchanges.filter((e) => e.doneAt === null && e.kind === "sse").length + net.conns.filter((c) => c.closedAt === null).length;
    return [requests!, { label: t(l("Açık bağlantı", "Open connections")), value: open, tone: open ? "ok" : "plain" }, waited!];
  },
  scenarios,
  freeStart: FREE,
});
