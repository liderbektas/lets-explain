import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { FLOOD, SERVER, SPAM, TOKEN } from "./code";

const FILES = { "server.js": SERVER, "flood.js": FLOOD, "spam.js": SPAM };

export const FREE = createNet({ files: FILES, running: ["server.js"] });

const origin = (ctx: WsCtx, id: number) => ctx.state.exchanges.find((e) => e.id === id);
/** The server the reader restarted (not the one the scenario began with). */
const fresh = (ctx: WsCtx) => ctx.state.procs.find((p) => p.file === "server.js" && p.alive && !ctx.start.procs.some((s) => s.pid === p.pid));

export const scenarios: WsScenario[] = [
  {
    id: "origin",
    title: l("Başka siteden gelen", "From another site"),
    story: l(
      "Güvenlik ekibi bir açık buldu: kullanıcı oturum açıkken `evil.example`'ı ziyaret ederse o sayfa, kullanıcının çerezleriyle sohbet sunucusuna WebSocket açıp bütün mesajları okuyabiliyor (cross-site WebSocket hijacking). WebSocket'te CORS yok; tarayıcı her bağlantıya `Origin` başlığını ekler. Uygulamanın kendi adresi `http://localhost:8080`.",
      "The security team found a hole: if a logged-in user visits `evil.example`, that page can open a WebSocket to the chat server with the user's cookies and read every message (cross-site WebSocket hijacking). WebSocket has no CORS; the browser adds an `Origin` header to every connection. The app's own address is `http://localhost:8080`.",
    ),
    goal: l("`https://evil.example`'dan gelen bağlantı reddedilsin, `http://localhost:8080`'den gelen kabul edilsin.", "A connection from `https://evil.example` is refused; one from `http://localhost:8080` is accepted."),
    start: FREE,
    hints: [
      l(
        "ws'nin `verifyClient` seçeneği el sıkışma sırasında çalışır ve `false` dönerse bağlantı kurulmaz. `origin` parametresi tarayıcının gönderdiği `Origin` başlığıdır.",
        "ws's `verifyClient` option runs during the handshake; if it returns `false`, no connection is made. Its `origin` parameter is the `Origin` header the browser sent.",
      ),
      l(
        "`verifyClient: ({ origin }) => origin === \"http://localhost:8080\"`. Sunucuyu yeniden başlat ve wscat'in `-o` seçeneğiyle iki origin'i de dene.",
        "`verifyClient: ({ origin }) => origin === \"http://localhost:8080\"`. Restart the server and try both origins with wscat's `-o` option.",
      ),
      l(
        "`nano server.js`, `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001 -o https://evil.example`, `wscat -c ws://localhost:9001 -o http://localhost:8080 -x hi`",
        "`nano server.js`, `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001 -o https://evil.example`, `wscat -c ws://localhost:9001 -o http://localhost:8080 -x hi`",
      ),
    ],
    par: 5,
    check: (ctx) => {
      if (!fresh(ctx)) return false;
      const tries = ctx.state.exchanges.filter((e) => e.client === "you" && e.kind === "upgrade" && e.port === 9001 && e.sentAt >= ctx.start.now);
      const evilRefused = tries.some((e) => /evil\.example/.test(e.headers.find(([k]) => k === "Origin")?.[1] ?? "") && e.status !== 101);
      const goodIn = newConns(ctx).some((c) => c.client === "you" && c.origin === "http://localhost:8080" && origin(ctx, c.exchange)?.status === 101);
      const evilIn = newConns(ctx).some((c) => c.origin?.includes("evil.example") && c.server === `proc:${fresh(ctx)!.pid}`);
      return evilRefused && goodIn && !evilIn;
    },
  },
  {
    id: "size",
    title: l("Dev mesajlar", "Giant messages"),
    story: l(
      "Biri sunucuya megabaytlarca tutan mesajlar gönderiyor ve her biri belleği şişiriyor. ws'nin `maxPayload` sınırı varsayılan olarak 100 MiB; sohbet mesajları ise birkaç KB. `flood.js` saldırıyı taklit ediyor: iki adet 1 MB'lık mesaj.",
      "Someone is sending the server messages megabytes long, and each one swells its memory. ws's `maxPayload` limit is 100 MiB by default; chat messages are a few KB. `flood.js` mimics the attack: two 1 MB messages.",
    ),
    goal: l("64 KB'ı aşan mesaj 1009 ile reddedilsin ve sunucu çalışmaya devam etsin.", "A message over 64 KB is refused with 1009 and the server keeps running."),
    start: FREE,
    hints: [
      l(
        "`new WebSocketServer({ port: 9001, maxPayload: 64 * 1024 })`. Sınır aşılınca ws bağlantıyı 1009 ile kapatır ve soket üzerinde bir `error` olayı çıkarır.",
        "`new WebSocketServer({ port: 9001, maxPayload: 64 * 1024 })`. Over the limit, ws closes the connection with 1009 and raises an `error` event on the socket.",
      ),
      l(
        "Dinleyicisi olmayan `error` olayı Node sürecini çökertir: tek bir saldırgan bütün sunucuyu düşürür. Her `ws`'ye `ws.on(\"error\", ...)` ekle.",
        "An `error` event nobody listens for crashes the Node process: one attacker takes the whole server down. Add `ws.on(\"error\", ...)` to every `ws`.",
      ),
      l("`nano server.js` (`maxPayload` ve `ws.on(\"error\", ...)`), `pkill -f server.js`, `node server.js &`, `node flood.js`", "`nano server.js` (`maxPayload` and `ws.on(\"error\", ...)`), `pkill -f server.js`, `node server.js &`, `node flood.js`"),
    ],
    par: 4,
    check: (ctx) => {
      const srv = fresh(ctx);
      return Boolean(srv) && newConns(ctx).some((c) => c.client.startsWith("proc:") && c.server === `proc:${srv!.pid}` && c.serverCode === 1009);
    },
  },
  {
    id: "auth",
    title: l("Önce kim olduğunu söyle", "Say who you are first"),
    story: l(
      `Sunucuya bağlanan herkes sohbeti okuyabiliyor. Ekip kararı: ilk mesaj \`{"type":"auth","token":"..."}\` olacak (ekibin token'ı \`${TOKEN}\`). Token'sız ya da yanlış token'la gelen \`4001 unauthorized\` ile kapatılsın; doğrulanmamış kimseye mesaj gitmesin.`,
      `Anyone who connects to the server can read the chat. The team's decision: the first message must be \`{"type":"auth","token":"..."}\` (the team's token is \`${TOKEN}\`). Whoever comes without a token, or with a wrong one, gets closed with \`4001 unauthorized\`, and nobody unauthenticated gets any messages.`,
    ),
    goal: l("Token'sız bir istemci 4001 ile kapatılsın; doğru token'la gelen `{\"type\":\"authenticated\"}` alsın.", "A client without the token is closed with 4001; one with the right token gets `{\"type\":\"authenticated\"}`."),
    start: FREE,
    hints: [
      l(
        "Tarayıcının `WebSocket`'i `Authorization` başlığı gönderemez. Seçenekler: URL'de token (sunucu ve proxy loglarına düşer), çerez (Origin kontrolüyle birlikte) ya da ilk mesaj. Burada ilk mesaj.",
        "The browser's `WebSocket` can't send an `Authorization` header. The options: a token in the URL (it lands in server and proxy logs), a cookie (together with an Origin check), or the first message. Here, the first message.",
      ),
      l(
        "Soket için bir `authed` bayrağı tut. Doğrulanmamış soketten gelen ilk mesaj doğru `auth` değilse `ws.close(4001, \"unauthorized\")`; doğruysa bayrağı aç ve `{\"type\":\"authenticated\"}` gönder. Yayını sadece doğrulanmışlara yap.",
        "Keep an `authed` flag per socket. If the first message from an unauthenticated socket isn't a correct `auth`, `ws.close(4001, \"unauthorized\")`; if it is, set the flag and send `{\"type\":\"authenticated\"}`. Broadcast only to authenticated sockets.",
      ),
      l(
        `\`nano server.js\`, \`pkill -f server.js\`, \`node server.js &\`, \`wscat -c ws://localhost:9001 -x hello\`, \`wscat -c ws://localhost:9001 -x '{"type":"auth","token":"${TOKEN}"}'\``,
        `\`nano server.js\`, \`pkill -f server.js\`, \`node server.js &\`, \`wscat -c ws://localhost:9001 -x hello\`, \`wscat -c ws://localhost:9001 -x '{"type":"auth","token":"${TOKEN}"}'\``,
      ),
    ],
    par: 5,
    check: (ctx) => {
      const srv = fresh(ctx);
      if (!srv) return false;
      const mine = newConns(ctx).filter((c) => c.client === "you" && c.server === `proc:${srv.pid}`);
      const kicked = mine.some((c) => c.closeCode === 4001 && !c.msgs.some((m) => m.dir === "out" && m.text.includes(TOKEN)));
      const welcomed = mine.some((c) => c.msgs.some((m) => m.dir === "in" && m.text.includes('"authenticated"')));
      return kicked && welcomed;
    },
  },
  {
    id: "rate",
    title: l("Mesaj seli", "A flood of messages"),
    story: l(
      "Hatalı bir istemci sürümü bir döngüye girip saniyede yüzlerce mesaj gönderiyor ve herkesin ekranını dolduruyor. `spam.js` bunu taklit ediyor: 100 mesaj, art arda. Bir istemci saniyede 10'dan fazla mesaj gönderirse `1008 too many messages` ile kapatılsın.",
      "A buggy client release got stuck in a loop sending hundreds of messages a second, flooding everyone's screen. `spam.js` mimics it: 100 messages in a burst. A client that sends more than 10 messages a second should be closed with `1008 too many messages`.",
    ),
    goal: l("`spam.js` 1008 ile kapatılsın; sunucu çalışmaya devam etsin.", "`spam.js` gets closed with 1008; the server keeps running."),
    start: FREE,
    hints: [
      l("Her bağlantı için bir sayaç tut ve saniyede bir sıfırla (`setInterval`); bağlantı kapanınca zamanlayıcıyı temizle.", "Keep a counter per connection and reset it every second (`setInterval`); clear the timer when the connection closes."),
      l(
        "`message` başında: `if (++count > 10) return ws.close(1008, \"too many messages\");`. Sunucuyu yeniden başlat ve `node spam.js`.",
        "At the start of `message`: `if (++count > 10) return ws.close(1008, \"too many messages\");`. Restart the server and run `node spam.js`.",
      ),
      l("`nano server.js`, `pkill -f server.js`, `node server.js &`, `node spam.js`", "`nano server.js`, `pkill -f server.js`, `node server.js &`, `node spam.js`"),
    ],
    par: 4,
    check: (ctx) => {
      const srv = fresh(ctx);
      return Boolean(srv) && newConns(ctx).some((c) => c.client.startsWith("proc:") && c.server === `proc:${srv!.pid}` && c.serverCode === 1008);
    },
  },
];
