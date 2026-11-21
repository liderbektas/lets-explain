import type { Lang } from "@lets-explain/core/i18n";
import { OPCODE_NAME } from "./frames";
import { CLOSE_NAME, type Net, type NetEvent } from "./net";

export type Tone = "plain" | "read" | "ok" | "bad" | "produce";

export interface Line {
  text: string;
  tone: Tone;
}

const NAMES: Record<string, [string, string]> = {
  ayse: ["Ayşe", "Ayşe"],
  mert: ["Mert", "Mert"],
  zeynep: ["Zeynep", "Zeynep"],
  you: ["Sen", "You"],
};

export const personName = (id: string, lang: Lang) => (NAMES[id] ? NAMES[id]![lang === "tr" ? 0 : 1] : id);

const s = (ms: number) => (ms % 1000 === 0 ? `${ms / 1000}` : (ms / 1000).toFixed(1));

/** Who a client is, in a sentence. */
function who(net: Net, client: string, tr: boolean): string {
  if (client === "browser") return tr ? "Tarayıcı" : "The browser";
  if (client === "you") return tr ? "Sen" : "You";
  if (client === "nginx") return "nginx";
  if (client.startsWith("proc:")) {
    const p = net.procs.find((x) => `proc:${x.pid}` === client);
    return p ? `${p.file} (${p.pid})` : client;
  }
  return client;
}

const closeName = (code: number) => (CLOSE_NAME[code] ? `${code} ${CLOSE_NAME[code]}` : String(code));

/** One plain sentence per event, for the list under the stage. Null for events not worth a line. */
export function describeNet(e: NetEvent, net: Net, lang: Lang): Line | null {
  const tr = lang === "tr";
  const ex = "id" in e ? net.exchanges.find((x) => x.id === e.id) : undefined;
  switch (e.type) {
    case "sent": {
      if (e.client === "nginx") return { tone: "produce", text: tr ? `nginx isteği :${e.port}'a iletti` : `nginx passed the request on to :${e.port}` };
      const what = e.kind === "upgrade" ? (tr ? "WebSocket el sıkışma isteği" : "a WebSocket handshake request") : `${e.method} ${e.target}`;
      return { tone: "produce", text: tr ? `${who(net, e.client, tr)} → :${e.port} ${what} gönderdi` : `${who(net, e.client, tr)} sent ${what} to :${e.port}` };
    }
    case "answered": {
      if (ex?.client === "nginx") return null;
      if (e.status === 204) return { tone: "bad", text: tr ? "204 No Content: beklerken hiç mesaj gelmedi" : "204 No Content: no message came while it waited" };
      if (e.status === 101) return { tone: "ok", text: tr ? "101 Switching Protocols: bağlantı artık WebSocket" : "101 Switching Protocols: the connection is now a WebSocket" };
      if (e.status >= 400) return { tone: "bad", text: `${e.status} ${ex?.statusText ?? ""}`.trim() };
      if (e.delivered.length) {
        const ids = e.delivered.map((d) => `#${d}`).join(", ");
        return { tone: "read", text: tr ? `${e.status} OK: ${ids} geldi` : `${e.status} OK: got ${ids}` };
      }
      if (e.empty) return { tone: "bad", text: tr ? `${e.status} OK ama boş: []` : `${e.status} OK but empty: []` };
      return { tone: "plain", text: `${e.status} ${ex?.statusText ?? ""}`.trim() };
    }
    case "held":
      return e.kind === "longpoll"
        ? { tone: "plain", text: tr ? "Sunucu cevabı bekletiyor: yeni mesaj gelince ya da süre dolunca dönecek" : "The server holds the answer: it returns when a message comes or time runs out" }
        : e.kind === "sse"
          ? { tone: "ok", text: tr ? "Akış açıldı: cevap bitmiyor, sunucu yeni mesajları bunun içine yazacak" : "Stream open: the answer does not end; the server will write new messages into it" }
          : { tone: "plain", text: tr ? "İstek cevap bekliyor" : "The request waits for an answer" };
    case "streamed":
      return { tone: "read", text: tr ? `Akıştan #${e.msg} geldi (yeni istek yok)` : `#${e.msg} came down the stream (no new request)` };
    case "ended":
      if (ex?.client === "nginx") return null;
      return {
        tone: e.end === "refused" || e.end === "dropped" || e.end === "lost" ? "bad" : "plain",
        text: {
          done: tr ? "Bitti" : "Done",
          clientTimeout: tr ? "İstemcinin süresi doldu, bağlantıyı kapattı" : "The client's time ran out; it closed the connection",
          sandboxStop: tr ? "Sandbox akışı durdurdu (Ctrl+C gibi)" : "The sandbox stopped the stream (like Ctrl+C)",
          refused: tr ? "Bu portta dinleyen yok: bağlantı reddedildi" : "Nothing listens on that port: connection refused",
          dropped: tr ? "Sunucu bağlantıyı cevapsız kapattı" : "The server closed the connection without an answer",
          lost: tr ? "Ağ koptu: bağlantı kesildi" : "The network went away: the connection is gone",
          closed: tr ? "İstemci akışı kendisi kapattı" : "The client closed the stream itself",
        }[e.end],
      };
    case "posted": {
      const m = net.messages.find((x) => x.id === e.msg);
      const how = { seed: "", teammate: "", ws: tr ? " (WebSocket'ten)" : " (over the WebSocket)", post: tr ? " (POST ile)" : " (with POST)" }[e.via];
      return { tone: "produce", text: tr ? `${personName(e.from, lang)} yazdı: #${e.msg} "${m?.text ?? ""}"${how}` : `${personName(e.from, lang)} wrote #${e.msg} "${m?.text ?? ""}"${how}` };
    }
    case "wsOpened":
      return { tone: "ok", text: tr ? `${who(net, e.client, tr)}: WebSocket açıldı (:${e.port})` : `${who(net, e.client, tr)}: WebSocket open (:${e.port})` };
    case "wsFailed":
      return { tone: "bad", text: tr ? `${who(net, e.client, tr)}: WebSocket açılamadı (${e.reason})` : `${who(net, e.client, tr)}: WebSocket failed (${e.reason})` };
    case "frame": {
      const name = OPCODE_NAME[e.opcode] ?? String(e.opcode);
      const dir = e.dir === "out" ? (tr ? "istemci → sunucu" : "client → server") : tr ? "sunucu → istemci" : "server → client";
      const held = e.held ? (tr ? " (yolda bekliyor: paketler geçmiyor)" : " (held on the way: packets are not getting through)") : "";
      const body = e.opcode === 1 || e.opcode === 0 ? `: ${e.text.length > 60 ? `${e.text.slice(0, 60)}…` : e.text}` : "";
      return { tone: e.held ? "bad" : e.dir === "out" ? "produce" : "read", text: `${name}${e.fin ? "" : " (FIN=0)"} ${dir}, ${e.size} B${body}${held}` };
    }
    case "message":
      return null;
    case "wsClosed": {
      const side = e.side === "client" ? (tr ? "İstemci tarafı" : "The client's end") : tr ? "Sunucu tarafı" : "The server's end";
      return { tone: e.code === 1000 || e.code === 1001 ? "plain" : "bad", text: tr ? `${side} kapandı: ${closeName(e.code)}${e.reason ? ` "${e.reason}"` : ""}` : `${side} closed: ${closeName(e.code)}${e.reason ? ` "${e.reason}"` : ""}` };
    }
    case "time":
      return { tone: "plain", text: tr ? `${s(e.to - e.from)} sn geçti (saat: ${s(e.to)} sn)` : `${s(e.to - e.from)} s passed (clock: ${s(e.to)} s)` };
    case "procStarted":
      return { tone: "ok", text: tr ? `node ${e.file} çalışıyor (pid ${e.pid}${e.port ? `, :${e.port}` : ""})` : `node ${e.file} running (pid ${e.pid}${e.port ? `, :${e.port}` : ""})` };
    case "procFailed":
      return { tone: "bad", text: tr ? `node ${e.file} başlayamadı` : `node ${e.file} failed to start` };
    case "procCrashed":
      return { tone: "bad", text: tr ? `Süreç çöktü (pid ${e.pid}): ${e.text.split("\n").find((l) => /Error/.test(l)) ?? ""}` : `The process crashed (pid ${e.pid}): ${e.text.split("\n").find((l) => /Error/.test(l)) ?? ""}` };
    case "procStopped":
      return { tone: "plain", text: tr ? `pid ${e.pid} durduruldu (SIG${e.signal})` : `pid ${e.pid} stopped (SIG${e.signal})` };
    case "procExited":
      return { tone: e.code ? "bad" : "plain", text: tr ? `pid ${e.pid} bitti (çıkış kodu ${e.code})` : `pid ${e.pid} ended (exit code ${e.code})` };
    case "blocked":
      return { tone: e.on ? "bad" : "ok", text: e.on ? (tr ? `:${e.port} portunun paketleri düşürülüyor` : `Packets on :${e.port} are being dropped`) : tr ? `:${e.port} portunun paketleri yine geçiyor` : `Packets on :${e.port} get through again` };
    case "nginx":
      return e.ok ? { tone: "ok", text: tr ? "nginx yeni ayarla yeniden yüklendi" : "nginx reloaded with the new config" } : { tone: "bad", text: e.text };
    case "note":
      return { tone: "bad", text: e.text };
    case "procLog":
    case "captured":
      return null;
  }
}
