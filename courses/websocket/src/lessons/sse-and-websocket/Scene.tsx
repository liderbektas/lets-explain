import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { NetStage } from "../../iso/NetStage";
import { flowMetrics } from "../shared/metrics";
import { makeNetScene, stageLabels } from "../shared/NetScene";
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
    "Solda tarayıcı, sağda sohbet sunucusu. Sarı boru bir SSE akışı, yeşil boru bir WebSocket.",
    "The browser on the left, the chat server on the right. The yellow pipe is an SSE stream, the green one a WebSocket.",
  ),
  view: (net, info) => (
    <NetStage
      net={net}
      last={info.last}
      beat={info.beat}
      labels={stageLabels(info.t, info.lang, info.sandbox ? l("Sen (terminal)", "You (terminal)") : l("Tarayıcı", "Browser"))}
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
