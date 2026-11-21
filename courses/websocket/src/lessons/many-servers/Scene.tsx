import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { remote, run, send, socketView, wait, write } from "../shared/sockets";
import { REDIS_SERVER, SERVER } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "many-servers";

const clients: NetAction[] = [remote("laptop", 8082, "/", { reconnect: 1000 }), remote("phone", 8083, "/", { reconnect: 1000 })];

export const START = createNet({
  redis: true,
  files: { "server.js": SERVER },
  running: [
    { file: "server.js", env: { PORT: "8082" } },
    { file: "server.js", env: { PORT: "8083" } },
  ],
  actions: clients,
});

export const steps: NetAction[][] = [
  // 0 · the laptop on :8082 writes; the phone on :8083 hears nothing
  [send("laptop", "lunch at 12?")],
  // 1 · would sticky sessions help?
  [],
  // 2 · Redis pub/sub: publish once, every copy delivers
  [{ type: "killFile", file: "server.js" }, write("server.js", REDIS_SERVER), run("server.js", { PORT: "8082" }), run("server.js", { PORT: "8083" }), wait(2000), send("laptop", "lunch at 12?")],
  // 3 · what pub/sub doesn't do
  [],
  // 4 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Aynı sohbet sunucusundan iki kopya ve aralarında Redis", "Two copies of the same chat server, with Redis between them"),
  view: (net, info) => socketView(net, info, { clients: info.sandbox ? undefined : ["laptop", "phone"] }),
  metrics: (net, t) => {
    const got = (client: string) => net.conns.filter((c) => c.client === client).some((c) => c.msgs.some((m) => m.dir === "in" && m.text === "lunch at 12?"));
    return [
      { label: t(l("Kopya", "Copies")), value: net.procs.filter((p) => p.alive && p.file === "server.js").length },
      { label: t(l("Dizüstü (:8082) aldı", "Laptop (:8082) got it")), value: got("laptop") ? "✓" : "—", tone: got("laptop") ? "ok" : "plain" },
      { label: t(l("Telefon (:8083) aldı", "Phone (:8083) got it")), value: got("phone") ? "✓" : "—", tone: got("phone") ? "ok" : "danger" },
    ];
  },
  scenarios,
  freeStart: FREE,
});
