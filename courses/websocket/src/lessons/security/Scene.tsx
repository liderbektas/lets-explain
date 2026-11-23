import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { remote, run, send, socketMetrics, socketView, wait, write } from "../shared/sockets";
import { checkOrigin, FLOOD, harden, SERVER } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "security";

export const START = createNet({ files: { "server.js": SERVER, "flood.js": FLOOD }, running: ["server.js"] });

const app = (client: string) => remote(client, 9001, "/", { origin: "http://localhost:8080" });
const evil = remote("evil", 9001, "/", { origin: "https://evil.example" });

export const steps: NetAction[][] = [
  // 0 · a page on evil.example connects with the user's cookies and reads along
  [app("browser"), evil, send("browser", "my reset code is 4411")],
  // 1 · an Origin check in verifyClient: evil.example is turned away
  [{ type: "killFile", file: "server.js" }, write("server.js", checkOrigin(SERVER)), run("server.js"), app("browser"), evil],
  // 2 · who are you? tokens, cookies, first messages
  [],
  // 3 · a size limit, and an error listener
  [{ type: "killFile", file: "server.js" }, write("server.js", harden(SERVER)), run("server.js"), app("browser"), run("flood.js"), wait(1000)],
  // 4 · wss://, and the rest of the list
  [],
  // 5 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Sohbet sunucusu, uygulamanın kendi sayfası ve evil.example", "The chat server, the app's own page, and evil.example"),
  view: (net, info) => socketView(net, info, { showOrigin: true }),
  metrics: (net, t, info) => {
    const evilIn = net.conns.some((c) => c.client === "evil" && c.closedAt === null);
    return [
      ...socketMetrics(net, t, info.from).slice(0, 1),
      { label: t(l("evil.example içeride", "evil.example inside")), value: evilIn ? t(l("evet", "yes")) : t(l("hayır", "no")), tone: evilIn ? "danger" : "ok" },
      { label: t(l("Sunucu", "Server")), value: net.procs.some((p) => p.file === "server.js" && p.alive) ? t(l("çalışıyor", "running")) : t(l("çöktü", "down")) },
    ];
  },
  scenarios,
  freeStart: FREE,
});
