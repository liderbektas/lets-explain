import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, newExchanges, type WsCtx, type WsScenario } from "../shared/NetScene";

/* ------------------------------------------------------------ the project */

const HISTORY = [
  { from: "ayse", text: "Morning! Stand-up at 10" },
  { from: "mert", text: "Deploy at 10:30" },
  { from: "zeynep", text: "PR #42 needs a review" },
  { from: "ayse", text: "Looking at it" },
  { from: "mert", text: "Staging is up" },
  { from: "zeynep", text: "Merged, thanks" },
  { from: "ayse", text: "Release notes are in the doc" },
];

export const FREE = createNet({
  messages: HISTORY.slice(0, 3),
  seenUpTo: 3,
  planned: [
    { at: 4000, from: "mert", text: "Tests are green" },
    { at: 9000, from: "ayse", text: "Deploy starts" },
    { at: 20000, from: "zeynep", text: "All good on prod" },
  ],
});

/** Did a stream (not a poll) opened in this scenario carry this message? */
const streamed = (ctx: WsCtx, id: number) => newExchanges(ctx).some((e) => e.kind === "sse" && e.delivered.includes(id));

/* --------------------------------------------------------------- scenarios */

export const scenarios: WsScenario[] = [
  {
    id: "live-feed",
    title: l("Canlı akış", "Live feed"),
    story: l(
      "Destek ekibine bir \"canlı bildirim\" ekranı yapıyorsun. Bu ekran yeni mesajları polling'le değil, sunucunun `/events` akışından almalı. Önce akışı terminalde dinleyip neye benzediğini görmek istiyorsun; birkaç saniye içinde iki kişi yazacak.",
      "You're building a \"live notifications\" screen for the support team. It should get new messages from the server's `/events` stream, not by polling. First you want to listen to the stream in a terminal and see what it looks like; two people will write within a few seconds.",
    ),
    goal: l("Gelecek iki mesajı (#4 ve #5) tek bir istekle, akıştan al.", "Get the next two messages (#4 and #5) from the stream, with one request."),
    start: createNet({ messages: HISTORY.slice(0, 3), seenUpTo: 3, planned: [{ at: 3000, from: "mert", text: "Tests are green" }, { at: 7000, from: "ayse", text: "Deploy starts" }] }),
    hints: [
      l(
        "SSE sıradan bir GET: cevap sadece hiç bitmiyor. curl çıktıyı biriktirmesin diye `-N` (no buffer) kullanılır.",
        "SSE is a plain GET whose answer never ends. `-N` (no buffer) keeps curl from holding the output back.",
      ),
      l("Akış kendiliğinden bitmez; `--max-time 10` ile 10 saniye sonra curl'ün bırakmasını sağla.", "A stream never ends on its own; `--max-time 10` makes curl let go after 10 seconds."),
      l("`curl -N --max-time 10 localhost:8080/events`", "`curl -N --max-time 10 localhost:8080/events`"),
    ],
    par: 1,
    check: (ctx) => streamed(ctx, 4) && streamed(ctx, 5) && newExchanges(ctx).length === 1,
  },
  {
    id: "resume",
    title: l("Kaldığın yerden", "Where you left off"),
    story: l(
      "Bildirim ekranının Wi-Fi'ı bir anlığına koptu. Akıştan en son `id: 5` gelmişti ve bu arada iki mesaj daha yazıldı. Ekran akışa geri dönmeli ve sadece kaçırdıklarını almalı; 1-5'i yeniden göstermek kafa karıştırır.",
      "The notification screen's Wi-Fi dropped for a moment. The last thing from the stream was `id: 5`, and two more messages were written meanwhile. The screen should go back to the stream and get only what it missed; showing 1-5 again would confuse people.",
    ),
    goal: l("Akışa yeniden bağlan; #6 ve #7'yi akıştan al, 1-5'i tekrar alma.", "Reconnect to the stream; get #6 and #7 from it, not 1-5 again."),
    start: createNet({ messages: HISTORY, seenUpTo: 5 }),
    hints: [
      l(
        "Akıştaki her olayın bir `id:` satırı var. Yeniden bağlanan istemci, en son aldığı id'yi bir başlıkla söyler.",
        "Each event in the stream has an `id:` line. A client that reconnects says the last id it got, in a header.",
      ),
      l("Başlığın adı `Last-Event-ID`. curl'de başlık `-H 'Ad: değer'` ile eklenir.", "The header is `Last-Event-ID`. curl adds a header with `-H 'Name: value'`."),
      l("`curl -N -m 5 -H 'Last-Event-ID: 5' localhost:8080/events`", "`curl -N -m 5 -H 'Last-Event-ID: 5' localhost:8080/events`"),
    ],
    par: 1,
    check: (ctx) => streamed(ctx, 6) && streamed(ctx, 7) && !newExchanges(ctx).some((e) => e.delivered.some((id) => id <= 5)),
  },
  {
    id: "two-way",
    title: l("İki yönlü", "Both ways"),
    story: l(
      "Ekip için küçük bir bot yazacaksın: odayı dinleyecek ve cevap yazacak. Bunu tek bir bağlantıdan yapsın istiyorsun. WebSocket sunucusu `ws://localhost:8081`'de; mesajlar JSON: `{\"type\":\"chat\",\"text\":\"...\"}`. Önce elle dene: bağlan, bir mesaj gönder, odaya düştüğünü aynı bağlantıdan gör.",
      "You're going to write a small bot for the team: it will listen to the room and reply. You want it to do both over one connection. The WebSocket server is at `ws://localhost:8081`; messages are JSON: `{\"type\":\"chat\",\"text\":\"...\"}`. Try it by hand first: connect, send a message, and see it land in the room over the same connection.",
    ),
    goal: l("Tek bir WebSocket bağlantısından bir mesaj gönder ve odadan bir mesaj al.", "Over one WebSocket connection, send a message and receive one from the room."),
    start: createNet({ messages: HISTORY.slice(0, 3), seenUpTo: 3 }),
    hints: [
      l("`wscat` bir WebSocket istemcisi: `-c` ile bağlanır, yazdığın her satırı bir mesaj olarak gönderir.", "`wscat` is a WebSocket client: `-c` connects, and each line you type goes out as a message."),
      l("Bağlanınca satır başı `>` olur. Mesajı JSON olarak yaz; sunucu onu odaya yayınlar, sana da gelir. Çıkmak için Ctrl+C.", "Once connected the prompt turns into `>`. Type the message as JSON; the server broadcasts it to the room, you included. Ctrl+C leaves."),
      l("`wscat -c ws://localhost:8081`, sonra `{\"type\":\"chat\",\"text\":\"hi from the bot\"}`", "`wscat -c ws://localhost:8081`, then `{\"type\":\"chat\",\"text\":\"hi from the bot\"}`"),
    ],
    par: 2,
    check: (ctx) =>
      newConns(ctx).some(
        (c) => ctx.state.messages.some((m) => m.via === "ws" && m.at >= c.openedAt) && c.frames.some((f) => f.dir === "in" && f.text.includes('"type":"message"')),
      ),
  },
  {
    id: "announce",
    title: l("Deploy duyurusu", "Deploy announcement"),
    story: l(
      "Deploy script'i başlarken odaya \"Deploy started\" yazsın istiyorsun. Script'in çalıştığı makinede WebSocket kütüphanesi yok, sadece `curl` var. Tek bir duyuru için bağlantı açık tutmaya da gerek yok.",
      "You want the deploy script to post \"Deploy started\" to the room when it begins. The machine it runs on has no WebSocket library, only `curl`. And one announcement doesn't need a connection kept open.",
    ),
    goal: l("Odaya HTTP ile \"Deploy started\" yaz.", "Post \"Deploy started\" to the room over HTTP."),
    start: createNet({ messages: HISTORY.slice(0, 3), seenUpTo: 3 }),
    hints: [
      l("API mesaj yazmak için `POST /messages` alıyor; gövde JSON: `{\"text\":\"...\"}`.", "The API takes `POST /messages` for writing; the body is JSON: `{\"text\":\"...\"}`."),
      l(
        "Sunucu gövdeyi ancak `Content-Type: application/json` ise JSON sayar. `curl --json` bu başlığı kendisi ekler ve isteği POST yapar.",
        "The server only reads the body as JSON with `Content-Type: application/json`. `curl --json` adds that header itself and makes the request a POST.",
      ),
      l("`curl --json '{\"text\":\"Deploy started\"}' localhost:8080/messages`", "`curl --json '{\"text\":\"Deploy started\"}' localhost:8080/messages`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.messages.some((m) => m.via === "post" && /deploy started/i.test(m.text)),
  },
];
