import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { remote, run, send, socketMetrics, socketView, write } from "../shared/sockets";
import { BOTS, broadcast, SERVER } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "first-server";

export const START = createNet({ files: { "server.js": SERVER, "bots.js": BOTS }, running: ["server.js"] });

export const steps: NetAction[][] = [
  // 0 · an echo server: connection, message, send
  [remote("browser", 9001), send("browser", "hello")],
  // 1 · a second client: each gets its own `ws`, its own handlers
  [remote("laptop", 9001), send("laptop", "hi from the laptop")],
  // 2 · broadcast: the same message to everyone in wss.clients
  [{ type: "kill", pid: 4242 }, write("server.js", broadcast(SERVER)), run("server.js"), remote("browser", 9001), remote("laptop", 9001), send("browser", "lunch at 12?")],
  // 3 · ws, Socket.IO and the rest
  [],
  // 4 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Kendi WebSocket sunucun ve ona bağlanan istemciler", "Your own WebSocket server and the clients connected to it"),
  view: (net, info) => socketView(net, info, { clients: info.sandbox ? undefined : ["browser", "laptop"] }),
  metrics: (net, t, info) => socketMetrics(net, t, info.from),
  scenarios,
  freeStart: FREE,
  actionMs: 2000,
});
