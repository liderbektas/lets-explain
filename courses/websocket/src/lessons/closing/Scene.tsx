import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { close, remote, socketMetrics, socketView, wait } from "../shared/sockets";
import { addShutdown, SERVER, WATCH } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "closing";

export const START = createNet({ files: { "server.js": addShutdown(SERVER), "watch.js": WATCH }, running: ["server.js"] });

export const steps: NetAction[][] = [
  // 0 · a clean close: a close frame each way, 1000 on both ends
  [remote("browser", 9001), close("browser", 1000, "bye")],
  // 1 · close() with no code: the frame carries no status, read as 1005
  [remote("laptop", 9001), close("laptop", null)],
  // 2 · a pulled cable: the server keeps the connection for minutes
  [remote("phone", 9001), { type: "netDown", client: "phone" }, wait(120_000)],
  // 3 · a deploy: SIGTERM, and the server says goodbye with 1001
  [remote("tablet", 9001), { type: "kill", pid: 4242 }],
  // 4 · what the browser may send
  [],
  // 5 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bağlantıların kapanışı: her ucun gördüğü kod", "Connections closing: the code each end sees"),
  view: (net, info) => socketView(net, info, { clients: info.sandbox ? undefined : ["browser", "laptop", "phone", "tablet"] }),
  metrics: (net, t, info) => socketMetrics(net, t, info.from),
  scenarios,
  freeStart: FREE,
  actionMs: 2000,
});
