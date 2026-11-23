import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { remote, send, socketMetrics, socketView } from "../shared/sockets";
import { BOTS, FIXED, SWITCH } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "rooms";

export const START = createNet({ files: { "server.js": FIXED, "bots.js": BOTS, "switch.js": SWITCH }, running: ["server.js"] });

const join = (client: string, room: string) => send(client, JSON.stringify({ type: "join", room }));

export const steps: NetAction[][] = [
  // 0 · messages are JSON with a type: the browser joins #genel
  [remote("browser", 9001), join("browser", "genel")],
  // 1 · the laptop joins #ops, the phone #genel
  [remote("laptop", 9001), join("laptop", "ops"), remote("phone", 9001), join("phone", "genel")],
  // 2 · a chat in #genel goes to #genel only
  [send("browser", JSON.stringify({ type: "chat", text: "standup in 5" }))],
  // 3 · something that isn't JSON gets an error back, not a crash
  [send("laptop", "hello?")],
  // 4 · where rooms live
  [],
  // 5 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Odalara ayrılmış istemciler: #genel ve #ops", "Clients in rooms: #genel and #ops"),
  view: (net, info) => socketView(net, info, { clients: info.sandbox ? undefined : ["browser", "laptop", "phone"], rooms: true }),
  metrics: (net, t, info) => socketMetrics(net, t, info.from),
  scenarios,
  freeStart: FREE,
  actionMs: 2000,
});
