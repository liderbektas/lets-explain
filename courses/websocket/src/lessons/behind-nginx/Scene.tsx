import { l } from "@lets-explain/core/i18n";
import { createNet, type Exchange, type Net, type NetAction } from "../../engine/net";
import { NGINX_CONF } from "../../engine/nginx";
import { HandshakeStage } from "../../iso/NetStage";
import { makeNetScene, type ViewInfo } from "../shared/NetScene";
import { browserSocket } from "../shared/requests";
import { socketView, write } from "../shared/sockets";
import { PLAIN_CONF, WS_CONF } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "behind-nginx";

export const START = createNet({ nginx: PLAIN_CONF });

const browser = browserSocket(80) as Extract<NetAction, { type: "wsOpen" }>;
/** The browser's `new WebSocket("ws://localhost/ws")`, through nginx on :80. */
const throughNginx: NetAction = { ...browser, target: "/ws", headers: browser.headers.map(([k, v]): [string, string] => [k, k === "Host" ? "localhost" : v]) };

export const steps: NetAction[][] = [
  // 0 · the browser's handshake, through nginx: 426
  [throughNginx],
  // 1 · what nginx sent upstream: no Upgrade, Connection: close, HTTP/1.0
  [],
  // 2 · three lines and a reload: 101 all the way through
  [write(NGINX_CONF, WS_CONF), { type: "nginxReload" }, throughNginx],
  // 3 · the rest of the proxy's settings
  [],
  // 4 · your turn
  [],
];

const lastOf = (net: Net, pick: (e: Exchange) => boolean) => [...net.exchanges].reverse().find(pick);

function view(net: Net, info: ViewInfo) {
  const t = info.t;
  if (info.sandbox || info.step >= 2) return socketView(net, info);
  const upstream = info.step === 1;
  const ex = upstream ? lastOf(net, (e) => e.client === "nginx") : lastOf(net, (e) => e.client === "browser");
  return (
    <HandshakeStage
      ex={ex}
      beat={info.beat}
      labels={{
        request: upstream ? t(l("nginx → sunucu (yukarı giden istek)", "nginx → server (the request upstream)")) : t(l("Tarayıcı → nginx", "Browser → nginx")),
        response: upstream ? t(l("Sunucunun cevabı", "The server's answer")) : t(l("nginx'in cevabı", "nginx's answer")),
        client: upstream ? "nginx :80" : t(l("Tarayıcı", "Browser")),
        server: upstream ? ":8081 ws" : "nginx :80",
        waiting: t(l("bekliyor", "waiting")),
        dropped: t(l("Cevap yok", "No answer")),
      }}
    />
  );
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Tarayıcı, nginx ve arkasındaki WebSocket sunucusu", "The browser, nginx, and the WebSocket server behind it"),
  view,
  metrics: (net, t) => {
    const loc = net.nginx?.conf.locations.find((x) => x.path === "/ws");
    const last = lastOf(net, (e) => e.client === "browser");
    return [
      { label: t(l("Tarayıcının aldığı", "The browser got")), value: last?.status ?? "—", tone: last?.status === 101 ? "ok" : last ? "danger" : "plain" },
      { label: "proxy_http_version", value: loc?.httpVersion ?? "—" },
      { label: t(l("Upgrade iletiliyor", "Upgrade passed on")), value: loc?.setHeaders.some(([k]) => k.toLowerCase() === "upgrade") ? t(l("evet", "yes")) : t(l("hayır", "no")) },
    ];
  },
  scenarios,
  freeStart: FREE,
  actionMs: 2600,
});
