import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { remote, run, socketView, wait, write } from "../shared/sockets";
import { CHAT, HEARTBEAT, NGINX_CHAT, PHONE, WATCH } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "heartbeat";

export const START = createNet({ nginx: NGINX_CHAT, files: { "server.js": CHAT, "watch.js": WATCH, "phone.js": PHONE }, running: ["server.js"] });

export const steps: NetAction[][] = [
  // 0 · a quiet connection through nginx: cut at 60 s
  [remote("browser", 80, "/ws"), wait(61_000)],
  // 1 · the server pings every 30 s; the browser answers on its own
  [{ type: "kill", pid: 4242 }, write("server.js", HEARTBEAT), run("server.js"), remote("browser", 80, "/ws"), wait(95_000)],
  // 2 · a phone loses its network: no pong, and the server lets it go
  [remote("phone", 9001), { type: "netDown", client: "phone" }, wait(70_000)],
  // 3 · the other ways, and their price
  [],
  // 4 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Tarayıcı nginx üzerinden, telefon doğrudan sohbet sunucusuna bağlı", "The browser goes through nginx, the phone straight to the chat server"),
  view: (net, info) => socketView(net, info),
  metrics: (net, t) => {
    const open = net.conns.filter((c) => c.serverClosedAt === null).length;
    const pings = net.conns.reduce((n, c) => n + c.frames.filter((f) => f.opcode === OP.ping).length, 0);
    const pongs = net.conns.reduce((n, c) => n + c.frames.filter((f) => f.opcode === OP.pong).length, 0);
    return [
      { label: t(l("Sunucuda açık", "Open on the server")), value: open, tone: open ? "ok" : "plain" },
      { label: "Ping", value: pings },
      { label: "Pong", value: pongs, tone: pongs < pings ? "warn" : "plain" },
    ];
  },
  scenarios,
  freeStart: FREE,
});
