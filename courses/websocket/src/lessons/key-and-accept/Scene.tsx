import { l } from "@lets-explain/core/i18n";
import { acceptFor, sha1, toHex, utf8, WS_GUID } from "../../engine/bytes";
import { runLine } from "../../engine/cli";
import { createNet, header, type Net, type NetAction } from "../../engine/net";
import { AcceptStage, HandshakeStage, type AcceptRow } from "../../iso/NetStage";
import { handshakeMetrics } from "../handshake/Scene";
import { makeNetScene, type ViewInfo } from "../shared/NetScene";
import { browserSocket, curlUpgrade } from "../shared/requests";
import { SERVER_NO_GUID } from "./files";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "key-and-accept";
export const SAMPLE_KEY = "dGhlIHNhbXBsZSBub25jZQ==";

export const START = createNet({ messages: [{ from: "ayse", text: "Morning!" }], files: { "server.js": SERVER_NO_GUID } });

const handshakeWith = (key: string): NetAction =>
  curlUpgrade([
    ["Connection", "Upgrade"],
    ["Upgrade", "websocket"],
    ["Sec-WebSocket-Version", "13"],
    ["Sec-WebSocket-Key", key],
  ]);

export const steps: NetAction[][] = [
  // 0 · a handshake: the key goes, the accept comes back
  [handshakeWith(SAMPLE_KEY)],
  // 1 · how the server worked the accept out
  [],
  // 2 · the same key again, then a browser with a fresh key
  [handshakeWith(SAMPLE_KEY), browserSocket()],
  // 3 · working it out in a terminal, and the two classic slips
  [],
  // 4 · a hand-written server that forgot the GUID: the browser refuses
  [{ type: "node", file: "server.js" }, browserSocket(9000)],
  // 5 · your turn
  [],
];

const spaced = (hex: string) => hex.match(/../g)!.join(" ");

/** The recipe, worked out for a key, next to what the server sent. */
function recipe(key: string, sent: string | undefined, t: (x: { tr: string; en: string }) => string): AcceptRow[] {
  const accept = acceptFor(key);
  return [
    { label: t(l("1 · Sec-WebSocket-Key (istemci üretti)", "1 · Sec-WebSocket-Key (made by the client)")), value: key, tone: "key" },
    { label: t(l("2 · sonuna GUID eklenir (RFC 6455, herkes için aynı)", "2 · the GUID is appended (RFC 6455, the same for everyone)")), value: key + WS_GUID, tone: "guid" },
    { label: t(l("3 · SHA-1 → 20 bayt (hex olarak gösteriliyor)", "3 · SHA-1 → 20 bytes (shown as hex)")), value: spaced(toHex(sha1(utf8(key + WS_GUID)))), tone: "hash" },
    { label: t(l("4 · 20 bayt base64'e çevrilir → Sec-WebSocket-Accept", "4 · the 20 bytes in base64 → Sec-WebSocket-Accept")), value: accept, tone: "out" },
    ...(sent
      ? [{ label: t(l("Sunucunun gönderdiği", "What the server sent")), value: sent, tone: sent === accept ? ("ok" as const) : ("bad" as const), note: sent === accept ? t(l("✓ aynı", "✓ same")) : t(l("✗ farklı", "✗ different")) }]
      : []),
  ];
}

/* The terminal ways of working it out, run through the course's own shell so the outputs are real. */
const LITERAL = `${SAMPLE_KEY}${WS_GUID}`;
const PIPES: { cmd: string; tr: string; en: string }[] = [
  { cmd: `printf '%s' '${LITERAL}' | openssl sha1 -binary | base64`, tr: "doğru", en: "right" },
  { cmd: `echo '${LITERAL}' | openssl sha1 -binary | base64`, tr: "echo sona \\n ekledi", en: "echo added a \\n" },
  { cmd: `printf '%s' '${LITERAL}' | openssl sha1 | base64`, tr: "hex metni base64'lendi", en: "hex text got base64'd" },
];
const piped = PIPES.map((p) => ({ ...p, out: runLine(createNet(), p.cmd).output.map((o) => o.text).join(" ") }));

function view(net: Net, info: ViewInfo) {
  const t = info.t;
  const upgrades = net.exchanges.filter((e) => e.kind === "upgrade" && e.status !== null);
  const last = net.exchanges[net.exchanges.length - 1];
  const handshake = (verdict?: { text: string; ok: boolean }) => (
    <HandshakeStage
      ex={last}
      beat={info.beat}
      verdict={verdict}
      labels={{
        request: t(l("İstek: istemci → sunucu", "Request: client → server")),
        response: t(l("Cevap: sunucu → istemci", "Response: server → client")),
        client: t(info.sandbox ? l("Sen (terminal)", "You (terminal)") : info.step === 4 ? l("Tarayıcı", "Browser") : l("curl", "curl")),
        server: last?.port === 9000 ? ":9000 server.js" : t(l(":8081 ws sunucusu", ":8081 ws server")),
        waiting: t(l("bekliyor", "waiting")),
        dropped: t(l("Cevap yok: bağlantı kapandı", "No answer: the connection closed")),
      }}
    />
  );
  if (info.sandbox) return last ? handshake() : <AcceptStage rows={recipe(SAMPLE_KEY, undefined, t)} beat={0} machine="SHA-1" />;
  if (info.step === 0) return handshake();
  if (info.step === 1) {
    const ex = upgrades.at(-1);
    return <AcceptStage rows={recipe(SAMPLE_KEY, ex ? header(ex.respHeaders, "sec-websocket-accept") : undefined, t)} beat={info.beat} machine="SHA-1" />;
  }
  if (info.step === 2) {
    const rows: AcceptRow[] = upgrades.slice(-3).map((e, i) => ({
      label: `${t(l("El sıkışma", "Handshake"))} ${i + 1} · ${e.client === "browser" ? t(l("tarayıcı", "browser")) : "curl"}`,
      value: `${header(e.headers, "sec-websocket-key")}  →  ${header(e.respHeaders, "sec-websocket-accept")}`,
      tone: e.client === "browser" ? "key" : "out",
      note: e.client === "browser" ? t(l("yeni key", "fresh key")) : t(l("aynı key", "same key")),
    }));
    return <AcceptStage rows={rows} beat={info.beat} machine="SHA-1" />;
  }
  if (info.step === 3) {
    const rows: AcceptRow[] = piped.map((p, i) => ({
      label: p.cmd.replace(LITERAL, "KEY+GUID"),
      value: p.out,
      tone: i === 0 ? "ok" : "bad",
      note: t(l(p.tr, p.en)),
    }));
    return <AcceptStage rows={[{ label: t(l("Beklenen", "Expected")), value: acceptFor(SAMPLE_KEY), tone: "out" }, ...rows]} beat={info.beat} machine="SHA-1" />;
  }
  if (info.step === 4) {
    const refused = net.exchanges.length > 1 && net.conns.every((c) => c.port !== 9000);
    return handshake(refused ? { text: t(l("Tarayıcı: Incorrect 'Sec-WebSocket-Accept' header value", "Browser: Incorrect 'Sec-WebSocket-Accept' header value")), ok: false } : undefined);
  }
  return handshake();
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("El sıkışmanın key'i ve accept'i: istek, cevap ve aradaki hesap", "The handshake's key and accept: request, answer and the sum in between"),
  view,
  metrics: (net, t, info) => {
    if (info.step === 1 || info.step === 3) {
      return [
        { label: "Key", value: t(l("16 bayt", "16 bytes")) },
        { label: "SHA-1", value: t(l("20 bayt", "20 bytes")) },
        { label: "Accept", value: t(l("28 karakter", "28 characters")) },
      ];
    }
    return handshakeMetrics(net, t);
  },
  scenarios,
  freeStart: FREE,
  actionMs: 2600,
});
