import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { bytesOf, createNet, frameBytes, requestText, responseText, simulate, sseEvent } from "../../engine/net";
import { browserGet } from "../shared/requests";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

/* What one message costs on the wire, each way, worked out from the same model the stage runs. */
const SAMPLE = { id: 8, from: "mert", text: "Deploy done" };
const pollRun = simulate([browserGet("/messages?after=7&wait=30"), { type: "advance", ms: 1000 }], createNet({ messages: Array.from({ length: 7 }, () => ({ from: "ayse", text: "…" })), planned: [{ at: 500, from: "mert", text: "Deploy done" }] }));
const poll = pollRun.states.at(-1)!.exchanges[0]!;
const POLL_BYTES = bytesOf(requestText(poll)) + bytesOf(responseText(poll));
const event = sseEvent(SAMPLE);
/** A chunk of a chunked response: length in hex, CRLF, the data, CRLF. */
const SSE_BYTES = bytesOf(event) + bytesOf(`${bytesOf(event).toString(16)}\r\n\r\n`);
const WS_BYTES = frameBytes(JSON.stringify({ type: "message", ...SAMPLE }), false);
const fill = (s: string) => s.replace("{poll}", String(POLL_BYTES)).replace("{sse}", String(SSE_BYTES)).replace("{ws}", String(WS_BYTES));

export const sseAndWebsocket: Lesson = {
  slug: "sse-and-websocket",
  title: l("SSE ve WebSocket", "SSE and WebSocket"),
  summary: l(
    "Bağlantıyı açık tutmanın iki yolu: sunucunun bitmeyen bir cevaba yazdığı SSE ve iki yönlü WebSocket. Hangisi ne zaman?",
    "Two ways to keep a connection open: SSE, where the server writes into an answer that never ends, and two-way WebSocket. Which one when?",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("SSE'de sunucunun açık cevaba nasıl yazdığını görmek", "See how the server writes into an open answer in SSE"), step: 0 },
    { text: l("Kopan akışın Last-Event-ID ile kaldığı yerden sürmesi", "Resume a dropped stream with Last-Event-ID"), step: 1 },
    { text: l("SSE'nin tek yönlü olduğunu görmek", "See that SSE goes one way"), step: 2 },
    { text: l("WebSocket'te tek bağlantının iki yönü taşıdığını görmek", "See one WebSocket connection carry both ways"), step: 3 },
    { text: l("Hangi durumda hangisinin seçileceğini bilmek", "Know which one to pick when"), step: 5 },
  ],
  steps: [
    {
      short: l("SSE", "SSE"),
      tag: "idea",
      predict: {
        question: l(
          "Tarayıcı `GET /events` istedi. Sunucu cevabın başlığını gönderdi ama cevabı hiç bitirmiyor. Ayşe yazınca ne olur?",
          "The browser asked for `GET /events`. The server sent the answer's headers but never finishes the answer. What happens when Ayşe writes?",
        ),
        options: [
          l("Tarayıcı yeniden sorana kadar bekler", "It waits until the browser asks again"),
          l("Sunucu mesajı açık cevabın içine yazar, hemen gelir", "The server writes it into the open answer; it arrives at once"),
          l("Sunucu yeni bir bağlantı açıp tarayıcıyı arar", "The server opens a new connection and calls the browser"),
          l("Cevap bitmediği için tarayıcı hiçbir şey göremez", "The answer never ends, so the browser sees nothing"),
        ],
        answer: 1,
        why: l(
          "Cevap açık kaldığı sürece sunucu ona istediği zaman yazabilir. Tarayıcı her satırı geldiği anda okur. Sunucu tarayıcıyı aramaz; zaten açık olan cevaba yazar.",
          "As long as the answer stays open, the server can write to it whenever it likes, and the browser reads each line as it comes. The server never calls the browser; it writes into the answer that's already open.",
        ),
      },
      title: l("SSE: cevabı hiç bitirme", "SSE: never finish the answer"),
      body: [
        l(
          "[[sse|Server-Sent Events]] sıradan bir HTTP isteğiyle başlar. Fark cevapta: `Content-Type: text/event-stream` ve cevap bitmiyor. Sunucu yeni bir mesaj olunca onu bu açık cevabın sonuna yazıyor.",
          "[[sse|Server-Sent Events]] start as a plain HTTP request. The difference is the answer: `Content-Type: text/event-stream`, and it never ends. When there's a new message, the server writes it at the end of that open answer.",
        ),
        l(
          "Sonuca bak: tek bir istek ve iki mesaj. Boş cevap yok, gecikme yok, ikinci bir istek de yok.",
          "Look at the result: one request, two messages. No empty answers, no delay, no second request.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl -N localhost:8080/events", note: l("`-N`: curl gelen satırları biriktirmeden basar. Ctrl+C ile çık.", "`-N`: curl prints lines as they come instead of buffering. Ctrl+C to stop.") }],
        snippets: [
          {
            label: "JavaScript · tarayıcı",
            code: 'const events = new EventSource("/events");\nevents.onmessage = (e) => render([JSON.parse(e.data)]);',
          },
          {
            label: "Node · Express",
            code: 'app.get("/events", (req, res) => {\n  res.writeHead(200, {\n    "Content-Type": "text/event-stream",\n    "Cache-Control": "no-cache",\n    Connection: "keep-alive",\n  });\n  const send = (m) => res.write(`id: ${m.id}\\ndata: ${JSON.stringify(m)}\\n\\n`);\n  chat.on("message", send);\n  req.on("close", () => chat.off("message", send));\n});',
          },
        ],
      },
    },
    {
      short: l("Kopunca", "On a drop"),
      tag: "how",
      predict: {
        question: l(
          "Wi-Fi koptu; akıştan en son `id: 4` gelmişti. Bu arada Zeynep yazdı (#5). EventSource birkaç saniye sonra yeniden bağlanınca #5 gelir mi?",
          "The Wi-Fi dropped; the last thing from the stream was `id: 4`. Meanwhile Zeynep wrote (#5). When EventSource reconnects a few seconds later, does #5 arrive?",
        ),
        options: [
          l("Hayır, akış kopunca aradakiler gider", "No, whatever came during the drop is gone"),
          l("Evet: tarayıcı `Last-Event-ID: 4` gönderir, bu sunucu kaçanı yollar", "Yes: the browser sends `Last-Event-ID: 4` and this server sends what was missed"),
          l("Evet, ama bütün mesajlar baştan gelir", "Yes, but every message comes again from the start"),
          l("Sadece sayfa yenilenirse", "Only if the page is reloaded"),
        ],
        answer: 1,
        why: l(
          "EventSource yeniden bağlanırken en son gördüğü id'yi `Last-Event-ID` başlığıyla kendisi gönderir. Kaçanları göndermek sunucunun işi; bu sunucu bunu yapıyor.",
          "When it reconnects, EventSource sends the last id it saw in a `Last-Event-ID` header by itself. Sending what was missed is the server's job, and this server does it.",
        ),
      },
      title: l("Kopan akış kaldığı yerden sürer", "A dropped stream picks up where it was"),
      body: [
        l(
          "Akıştaki her olay bir `id:` satırı, bir `data:` satırı ve bir boş satırdan oluşur. Tarayıcı en son gördüğü id'yi aklında tutar.",
          "Each event in the stream is an `id:` line, a `data:` line and an empty line. The browser remembers the last id it saw.",
        ),
        l(
          "Bağlantı kopunca EventSource birkaç saniye bekleyip kendiliğinden yeniden bağlanır ve isteğe [[last-event-id|Last-Event-ID]] başlığını `4` değeriyle ekler. Sunucu 4'ten sonrakileri, yani #5'i, hemen gönderdi.",
          "When the connection drops, EventSource waits a few seconds, reconnects on its own and adds a [[last-event-id|Last-Event-ID]] header of `4` to the request. The server sent everything after 4, that is #5, right away.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Yeniden bağlanmayı ve başlığı tarayıcı yapar, ama kaçanları saklayıp göndermek sunucuya kalmış. Bu başlığı okumayan bir sunucu sadece bundan sonrakileri yollar ve aradakiler kaybolur.",
            "The browser does the reconnecting and the header, but keeping and resending what was missed is up to the server. A server that ignores the header sends only what comes next, and the messages in between are lost.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "curl -N -H 'Last-Event-ID: 4' localhost:8080/events", note: l("Tarayıcının yeniden bağlanırken gönderdiği başlığın aynısı.", "The same header the browser sends when it reconnects.") }],
      },
    },
    {
      short: l("Tek yön", "One way"),
      tag: "problem",
      title: l("SSE sadece aşağı akar", "SSE only flows down"),
      body: [
        l(
          "Şimdi tarayıcı odaya bir şey yazmak istiyor. Açık akış bunu taşıyamaz: SSE yalnızca sunucudan istemciye akar. Tarayıcı ayrı bir istek gönderdi: `POST /messages`.",
          "Now the browser wants to write to the room. The open stream can't carry that: SSE only flows from server to client. The browser sent a separate request: `POST /messages`.",
        ),
        l(
          "Mesaj sunucuya POST ile gitti, odaya düştü ve akıştan geri geldi. Ara sıra yazılan şeyler için bu gayet iyi. Ama istemci de sık sık yazıyorsa her mesaj yeni bir HTTP isteği olur.",
          "The message went up with POST, landed in the room and came back down the stream. For things written now and then, that's perfectly fine. But if the client writes often too, every message is a new HTTP request.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl --json '{\"text\":\"Joining in 5\"}' localhost:8080/messages", note: l("`--json`, `Content-Type: application/json` ekler ve isteği POST yapar.", "`--json` adds `Content-Type: application/json` and makes it a POST.") }],
      },
    },
    {
      short: l("WebSocket", "WebSocket"),
      tag: "idea",
      predict: {
        question: l(
          "Tarayıcı bir WebSocket açtı ve \"On my way\" yazdı. Bunu göndermek ve sonra gelecek mesajları almak için kaç HTTP isteği daha gerekir?",
          "The browser opened a WebSocket and wrote \"On my way\". How many more HTTP requests does it take to send that and receive what comes next?",
        ),
        options: [
          l("Bir POST", "One POST"),
          l("Hiç: aynı bağlantı iki yönü de taşır", "None: the same connection carries both ways"),
          l("Her mesaj için bir GET", "One GET per message"),
          l("İki: biri göndermek, biri almak için", "Two: one to send, one to receive"),
        ],
        answer: 1,
        why: l(
          "[[websocket|WebSocket]] bir HTTP isteğiyle açılır, sonra o bağlantı HTTP olmaktan çıkar ve iki yönlü bir kanala dönüşür. Gönderme ve alma aynı bağlantıdan, istek-cevap olmadan yürür.",
          "A [[websocket|WebSocket]] opens with one HTTP request; then the connection stops being HTTP and becomes a two-way channel. Sending and receiving run over that same connection, with no request and answer.",
        ),
      },
      title: l("WebSocket: tek bağlantı, iki yön", "WebSocket: one connection, both ways"),
      body: [
        l(
          "Tarayıcı akışı kapattı ve `new WebSocket(\"ws://localhost:8081\")` ile bir WebSocket açtı. İlk istek bir HTTP isteği; sunucu onu kabul edince bağlantı WebSocket'e döndü. Bu el sıkışmayı bir sonraki derste satır satır göreceğiz.",
          "The browser closed the stream and opened a WebSocket with `new WebSocket(\"ws://localhost:8081\")`. The first request is an HTTP request; once the server accepts it, the connection turns into a WebSocket. We go through that handshake line by line in the next lesson.",
        ),
        l(
          "Sonra iki şey aynı kablodan geçti: tarayıcının \"On my way\" mesajı yukarı, Mert'in mesajı aşağı. Arada yeni bir istek yok.",
          "Then two things went through the same cable: the browser's \"On my way\" going up, Mert's message coming down. No new request in between.",
        ),
      ],
      practice: {
        commands: [{ cmd: "wscat -c ws://localhost:8081", note: l("`npm i -g wscat` ile kurulur. Yazdığın her satır bir mesaj olarak gider.", "Install with `npm i -g wscat`. Each line you type goes out as a message.") }],
        snippets: [
          {
            label: "JavaScript · tarayıcı",
            code: 'const ws = new WebSocket("ws://localhost:8081");\nws.onmessage = (e) => render([JSON.parse(e.data)]);\nws.onopen = () => ws.send(JSON.stringify({ type: "chat", text: "On my way" }));',
          },
        ],
      },
    },
    {
      short: l("Bedeli", "The cost"),
      tag: "how",
      title: l("Bir mesajın kablodaki bedeli", "What one message costs on the wire"),
      body: [
        l(
          "Aynı mesajı (Mert'in \"Deploy done\" mesajını) üç yolla taşımanın bedeli, bu sahnedeki baytlarla sayıldı.",
          "Here is what carrying the same message (Mert's \"Deploy done\") costs three ways, counted in this stage's bytes.",
        ),
        l(
          fill("**Long polling:** istek ve cevap, başlıklarıyla **{poll} bayt**. Başlıklar her mesajda yeniden gider, cookie dahil."),
          fill("**Long polling:** request and answer with their headers, **{poll} bytes**. The headers travel again with every message, the cookie too."),
        ),
        l(fill("**SSE:** açık cevaba eklenen tek bir olay, **{sse} bayt**."), fill("**SSE:** one event added to the open answer, **{sse} bytes**.")),
        l(
          fill("**WebSocket:** tek bir frame, **{ws} bayt**: 2 baytlık başlık ve mesajın kendisi."),
          fill("**WebSocket:** one frame, **{ws} bytes**: a 2-byte header and the message itself."),
        ),
        l(
          "Açık bağlantılar mesaj başına çok daha ucuz. Bunun karşılığında sunucu her istemci için bir bağlantıyı sürekli açık tutar; binlerce kullanıcıda bu da bir maliyettir.",
          "Open connections are far cheaper per message. In return the server keeps one connection open for every client all the time, and with thousands of users that has a cost too.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Fark mesaj başına başlıklarda. Polling'de her mesaj yüzlerce baytlık başlıkla gider; açık bir bağlantıda başlıklar bir kez, en başta gider.",
            "The difference is the headers per message. With polling every message travels with hundreds of bytes of headers; on an open connection the headers go once, at the start.",
          ),
        },
      ],
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "reality",
      title: l("Ne zaman hangisi?", "Which one when?"),
      body: [
        l(
          "**Polling:** güncellemeler seyrekse ve birkaç saniye gecikme sorun değilse en sade yol. Örneğin bir işin bitip bitmediğine 30 saniyede bir bakmak.",
          "**Polling:** the plainest way when updates are rare and a few seconds of delay don't matter, like checking every 30 seconds whether a job is done.",
        ),
        l(
          "**SSE:** bilgi çoğunlukla sunucudan istemciye akıyorsa: bildirimler, canlı paneller, ilerleme çubukları, bir LLM'in cevabının parça parça gelmesi (LLM API'leri cevabı genelde SSE ile akıtır). Düz HTTP olduğu için proxy'lerle sorun çıkarmaz, yeniden bağlanma da hazır gelir.",
          "**SSE:** when information mostly flows from server to client: notifications, live dashboards, progress bars, an LLM's answer arriving piece by piece (LLM APIs usually stream with SSE). It's plain HTTP, so proxies are fine with it, and reconnecting comes built in.",
        ),
        l(
          "**WebSocket:** istemci de sık yazıyorsa: sohbet, çok oyunculu oyunlar, birlikte düzenleme, canlı imleçler. Karşılığında yeniden bağlanma, kaçan mesajlar ve proxy ayarları senin işin olur.",
          "**WebSocket:** when the client writes often too: chat, multiplayer games, collaborative editing, live cursors. In return, reconnecting, missed messages and proxy settings become your job.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "HTTP/1.1'de tarayıcılar bir sunucuya aynı anda en fazla 6 bağlantı açar ve her açık SSE sekmesi bunlardan birini tutar. HTTP/2'de bağlantılar tek bir TCP bağlantısında paylaşıldığı için bu sınır pratikte kalkar.",
            "Over HTTP/1.1 browsers open at most 6 connections to one server, and each open SSE tab holds one. Over HTTP/2 the streams share a single TCP connection, so in practice the limit goes away.",
          ),
        },
        {
          kind: "warning",
          text: l(
            "Tarayıcının `WebSocket`'i kopunca kendiliğinden yeniden bağlanmaz; `EventSource` bağlanır. WebSocket'te yeniden bağlanmayı sen yazarsın (6. bölüm).",
            "The browser's `WebSocket` does not reconnect on its own after a drop; `EventSource` does. With WebSocket you write the reconnecting yourself (chapter 6).",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. API `localhost:8080`'de, WebSocket sunucusu `ws://localhost:8081`'de. Aşağıda gerçek işten **4 senaryo** var: canlı akış, kopan akış, iki yönlü bot ve bir deploy duyurusu.",
          "Your turn. The API is at `localhost:8080`, the WebSocket server at `ws://localhost:8081`. Below are **4 scenarios** from real work: a live feed, a dropped stream, a two-way bot and a deploy announcement.",
        ),
        l(
          "Akışı `curl -N` ile dinle, WebSocket'e `wscat -c` ile bağlan (çıkmak için Ctrl+C), zamanı `sleep` ile ilerlet. Az komutla bitirirsen 3 yıldız.",
          "Listen to the stream with `curl -N`, connect to the WebSocket with `wscat -c` (Ctrl+C leaves), move time with `sleep`. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("[[sse|SSE]]'de cevap bitmez; sunucu yeni olayları açık cevabın içine yazar.", "In [[sse|SSE]] the answer never ends; the server writes new events into it."),
    l("Kopan SSE akışında tarayıcı `Last-Event-ID` gönderir; kaçanları göndermek sunucunun işi.", "When an SSE stream drops the browser sends `Last-Event-ID`; resending what was missed is the server's job."),
    l("SSE tek yönlü: istemcinin yazması için ayrı bir HTTP isteği (POST) gerekir.", "SSE goes one way: for the client to write, it needs a separate HTTP request (POST)."),
    l("[[websocket|WebSocket]] bir HTTP isteğiyle açılır, sonra aynı bağlantı iki yönü de taşır.", "A [[websocket|WebSocket]] opens with an HTTP request; then the same connection carries both ways."),
    l("Açık bağlantılar mesaj başına ucuzdur ama sunucu her istemci için bir bağlantı tutar.", "Open connections are cheap per message, but the server holds one connection per client."),
  ],
  quiz: [
    {
      question: l("Bir sayfa sadece sunucudan gelen canlı bildirimleri gösterecek, kullanıcı hiçbir şey göndermeyecek. En sade seçim hangisi?", "A page will only show live notifications from the server; the user sends nothing. What's the plainest choice?"),
      options: [l("WebSocket", "WebSocket"), l("SSE", "SSE"), l("Her saniye polling", "Polling every second"), l("Hiçbiri olmaz", "None of them works")],
      answer: 1,
      explain: l("Bilgi tek yönde akıyorsa SSE yeter: düz HTTP, otomatik yeniden bağlanma ve Last-Event-ID hazır gelir.", "If information flows one way, SSE is enough: plain HTTP, with reconnecting and Last-Event-ID built in."),
      reviewStep: 5,
    },
    {
      question: l("SSE akışı açıkken tarayıcı bir mesaj göndermek istiyor. Ne yapar?", "With an SSE stream open, the browser wants to send a message. What does it do?"),
      options: [
        l("Akışın içine yazar", "Writes it into the stream"),
        l("Ayrı bir HTTP isteği gönderir (örneğin POST)", "Sends a separate HTTP request (a POST, say)"),
        l("Akışı kapatıp yeniden açar", "Closes the stream and opens it again"),
        l("Gönderemez", "It can't"),
      ],
      answer: 1,
      explain: l("SSE sadece sunucudan istemciye akar. Göndermek için ayrı bir istek gerekir.", "SSE only flows from server to client. Sending takes a separate request."),
      reviewStep: 2,
    },
    {
      question: l("Kopan bir SSE akışında kaçan mesajların yeniden gelmesi için ne gerekir?", "What does it take for missed messages to come again after an SSE stream drops?"),
      options: [
        l("Hiçbir şey, tarayıcı hepsini saklar", "Nothing; the browser keeps them all"),
        l("Sunucunun Last-Event-ID'yi okuyup sonrasını göndermesi", "The server reading Last-Event-ID and sending what came after"),
        l("Kullanıcının sayfayı yenilemesi", "The user reloading the page"),
        l("Bir WebSocket", "A WebSocket"),
      ],
      answer: 1,
      explain: l("Tarayıcı başlığı kendisi gönderir; sunucu onu okumazsa aradakiler gider.", "The browser sends the header by itself; if the server ignores it, what came in between is gone."),
      reviewStep: 1,
    },
    {
      question: l("Polling'e göre bir WebSocket mesajını ucuzlatan ne?", "Compared with polling, what makes a WebSocket message cheap?"),
      options: [
        l("Mesajın sıkıştırılması", "The message being compressed"),
        l("Başlıkların her mesajda yeniden gitmemesi", "The headers not travelling again with every message"),
        l("Daha hızlı bir sunucu", "A faster server"),
        l("UDP kullanması", "Using UDP"),
      ],
      answer: 1,
      explain: l("Açık bir WebSocket'te bir mesaj birkaç baytlık bir frame başlığıyla gider; HTTP başlıkları sadece açılışta gider.", "On an open WebSocket a message travels with a frame header of a few bytes; the HTTP headers go only at the opening."),
      reviewStep: 4,
    },
  ],
};
