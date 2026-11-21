import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what the RFCs, the browsers and the tools say. */
export const glossary: Record<string, GlossaryEntry> = {
  http: {
    term: "HTTP",
    def: l(
      "Web'in istek-cevap protokolü: istemci bir istek gönderir, sunucu bir cevap döner. Sunucu kendiliğinden konuşmaz, sadece sorulana cevap verir.",
      "The web's request-response protocol: the client sends a request, the server sends back a response. The server never speaks first; it only answers.",
    ),
  },
  polling: {
    term: "Polling",
    def: l("İstemcinin belli aralıklarla \"yeni bir şey var mı?\" diye tekrar tekrar sorması.", "The client asking \"anything new?\" again and again at a fixed interval."),
  },
  "long-polling": {
    term: "Long polling",
    def: l(
      "Sunucunun cevabı hemen vermeyip yeni bir şey olana kadar (ya da bir süre dolana kadar) beklettiği polling. İstemci cevabı alınca hemen yeniden sorar.",
      "Polling where the server holds the answer until something new happens (or a time limit passes). The client asks again as soon as it gets the answer.",
    ),
  },
  latency: {
    term: "Latency",
    def: l("Bir şeyin olmasıyla karşı tarafın onu öğrenmesi arasındaki süre. Burada: mesaj yazıldı → istemcinin eline geçti.", "The time between something happening and the other side learning about it. Here: a message is written → the client has it."),
  },
  sse: {
    term: "Server-Sent Events (SSE)",
    def: l(
      "Bitmeyen bir HTTP cevabı: sunucu `text/event-stream` içine olayları satır satır yazar. Tarayıcıda `EventSource`. Sadece sunucudan istemciye akar.",
      "An HTTP response that never ends: the server writes events into a `text/event-stream` line by line. In the browser, `EventSource`. It only flows from server to client.",
    ),
  },
  "last-event-id": {
    term: "Last-Event-ID",
    def: l(
      "SSE'de yeniden bağlanan istemcinin gönderdiği başlık: \"en son şu id'yi aldım\". Kaçanları göndermek sunucunun işi.",
      "The header a reconnecting SSE client sends: \"the last id I got was this\". Sending what it missed is the server's job.",
    ),
  },
  websocket: {
    term: "WebSocket",
    def: l(
      "Bir HTTP isteğiyle başlayıp aynı TCP bağlantısı üzerinde iki yönlü, sürekli açık bir kanala dönüşen protokol (RFC 6455). Tarayıcıda `new WebSocket(url)`.",
      "A protocol that starts as an HTTP request and turns the same TCP connection into a two-way channel that stays open (RFC 6455). In the browser, `new WebSocket(url)`.",
    ),
  },
  handshake: {
    term: "Handshake",
    def: l(
      "WebSocket'in açılış konuşması: istemci `Upgrade: websocket` isteği gönderir, sunucu `101 Switching Protocols` ile kabul eder.",
      "WebSocket's opening exchange: the client sends an `Upgrade: websocket` request, the server accepts with `101 Switching Protocols`.",
    ),
  },
  upgrade: {
    term: "Upgrade",
    def: l(
      "HTTP/1.1'in bağlantıyı başka bir protokole geçirme yolu. Hem `Connection: Upgrade` hem `Upgrade: websocket` başlığı gerekir.",
      "HTTP/1.1's way of switching a connection to another protocol. It takes both `Connection: Upgrade` and `Upgrade: websocket`.",
    ),
  },
  key: {
    term: "Sec-WebSocket-Key",
    def: l("İstemcinin her bağlantı için ürettiği 16 rastgele baytın base64 hali.", "16 random bytes, in base64, that the client makes for each connection."),
  },
  accept: {
    term: "Sec-WebSocket-Accept",
    def: l(
      "Sunucunun cevabı: base64(SHA-1(key + sabit GUID)). Sunucunun WebSocket'i gerçekten anladığını gösterir; güvenlik değildir.",
      "The server's answer: base64(SHA-1(key + a fixed GUID)). It shows the server really speaks WebSocket; it is not security.",
    ),
  },
  guid: {
    term: "GUID",
    def: l("RFC 6455'in herkes için sabitlediği değer: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`.", "The value RFC 6455 fixes for everyone: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`."),
  },
  sha1: {
    term: "SHA-1",
    def: l("Herhangi bir veriden 20 baytlık bir özet çıkaran hash fonksiyonu. Aynı girdi hep aynı özeti verir.", "A hash function that turns any data into a 20-byte digest. The same input always gives the same digest."),
  },
  base64: {
    term: "Base64",
    def: l("Baytları 64 güvenli karakterle (A-Z, a-z, 0-9, +, /) metne çevirme yolu. 3 bayt 4 karakter olur, sonu `=` ile doldurulur.", "A way to turn bytes into text with 64 safe characters (A-Z, a-z, 0-9, +, /). 3 bytes become 4 characters; the end is padded with `=`."),
  },
  frame: {
    term: "Frame",
    def: l("WebSocket'te bir mesajın kablodaki paketi: birkaç baytlık başlık ve veri.", "How a WebSocket message travels on the wire: a header of a few bytes, then the data."),
  },
  tcp: {
    term: "TCP",
    def: l("HTTP'nin ve WebSocket'in altındaki bağlantı: baytları sırayla ve eksiksiz taşır.", "The connection under HTTP and WebSocket: it carries bytes in order and without gaps."),
  },
};
