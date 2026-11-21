import { l } from "@lets-explain/core/i18n";
import { createNet, header, type Net, type NetAction } from "../../engine/net";
import { HandshakeStage } from "../../iso/NetStage";
import { makeNetScene, type ViewInfo } from "../shared/NetScene";
import { browserSocket, curlUpgrade } from "../shared/requests";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "handshake";
export const SAMPLE_KEY = "dGhlIHNhbXBsZSBub25jZQ==";

export const START = createNet({ messages: [{ from: "ayse", text: "Morning!" }] });

const UPGRADE: [string, string][] = [
  ["Connection", "Upgrade"],
  ["Upgrade", "websocket"],
];

export const steps: NetAction[][] = [
  // 0 · the browser's handshake request
  [browserSocket()],
  // 1 · the 101 answer, read line by line
  [],
  // 2 · no upgrade headers: a plain request, 426
  [curlUpgrade([])],
  // 3 · a bad key, then a bad version: 400 with the reason
  [
    curlUpgrade([...UPGRADE, ["Sec-WebSocket-Version", "13"], ["Sec-WebSocket-Key", "abc123"]]),
    curlUpgrade([...UPGRADE, ["Sec-WebSocket-Version", "12"], ["Sec-WebSocket-Key", SAMPLE_KEY]]),
  ],
  // 4 · the right request to the wrong port: no answer at all
  [curlUpgrade([...UPGRADE, ["Sec-WebSocket-Version", "13"], ["Sec-WebSocket-Key", SAMPLE_KEY]], 8080)],
  // 5 · your turn
  [],
];

const latest = (net: Net) => net.exchanges[net.exchanges.length - 1];

export function handshakeView(net: Net, info: ViewInfo) {
  const t = info.t;
  const client = info.sandbox ? l("Sen (terminal)", "You (terminal)") : info.step < 2 ? l("Tarayıcı", "Browser") : l("curl", "curl");
  const ex = latest(net);
  return (
    <HandshakeStage
      ex={info.sandbox && net.exchanges.length === info.from.exchanges.length ? undefined : ex}
      beat={info.beat}
      labels={{
        request: t(l("İstek: istemci → sunucu", "Request: client → server")),
        response: t(l("Cevap: sunucu → istemci", "Response: server → client")),
        client: t(client),
        server: ex?.port === 8080 ? ":8080 Express" : t(l(":8081 ws sunucusu", ":8081 ws server")),
        waiting: t(l("bekliyor", "waiting")),
        dropped: t(l("Cevap yok: bağlantı kapandı", "No answer: the connection closed")),
      }}
    />
  );
}

export function handshakeMetrics(net: Net, t: (x: { tr: string; en: string }) => string) {
  const ex = latest(net);
  const status = ex ? (ex.status ?? (ex.end === "dropped" ? t(l("cevap yok", "none")) : "—")) : "—";
  // A client library checks the 101 itself (the accept); curl takes any 101.
  const byLibrary = ex !== undefined && !(header(ex.headers, "user-agent") ?? "").startsWith("curl");
  const refused = ex?.status === 101 && byLibrary && !net.conns.some((c) => c.exchange === ex.id);
  return [
    { label: t(l("Durum", "Status")), value: status, tone: ex?.status === 101 && !refused ? ("ok" as const) : ex ? ("danger" as const) : ("plain" as const) },
    {
      label: t(l("Bağlantı", "Connection")),
      value: refused ? t(l("istemci reddetti", "refused by client")) : ex?.status === 101 ? "WebSocket" : ex ? "HTTP" : "—",
      tone: refused ? ("danger" as const) : ("plain" as const),
    },
    { label: t(l("Port", "Port")), value: ex ? `:${ex.port}` : "—" },
  ];
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Solda giden isteğin metni, sağda gelen cevabın metni; altta istemci ve sunucu", "The request's text on the left, the response's text on the right, the client and server below"),
  view: handshakeView,
  metrics: (net, t) => handshakeMetrics(net, t),
  scenarios,
  freeStart: FREE,
  actionMs: 2600,
});
