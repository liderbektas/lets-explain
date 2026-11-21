import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const heartbeat: Lesson = {
  slug: "heartbeat",
  title: l("Ping/pong ve heartbeat", "Ping/pong and heartbeats"),
  summary: l(
    "Sessiz bir bağlantıyı aradaki proxy keser; ölü bir bağlantıyı ise kimse fark etmez. Sunucunun ping'i ikisini birden çözer.",
    "A proxy in between cuts a quiet connection, and nobody notices a dead one. A ping from the server solves both.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Sessiz bağlantının neden koptuğunu görmek", "See why a quiet connection gets cut"), step: 0 },
    { text: l("Ping ve pong'un kimden kime gittiğini bilmek", "Know who sends pings and who answers"), step: 1 },
    { text: l("Heartbeat ile ölü bağlantıyı bulmak", "Find a dead connection with a heartbeat"), step: 2 },
    { text: l("Diğer yolları ve bedellerini bilmek", "Know the other ways and their price"), step: 3 },
  ],
  steps: [
    {
      short: l("60 sn", "60 s"),
      tag: "problem",
      predict: {
        question: l(
          "Tarayıcı nginx üzerinden sohbete bağlandı ve sonra kimse bir şey yazmadı. Bağlantı ne zaman kopar?",
          "The browser connected to the chat through nginx, and then nobody wrote anything. When does the connection drop?",
        ),
        options: [
          l("Hiç: WebSocket açık kalır", "Never: a WebSocket stays open"),
          l("30. saniyede", "At 30 seconds"),
          l("60. saniyede: nginx sessiz bağlantıyı keser", "At 60 seconds: nginx cuts a quiet connection"),
          l("5 dakika sonra", "After 5 minutes"),
        ],
        answer: 2,
        why: l(
          "nginx'in `proxy_read_timeout`'u varsayılan olarak 60 sn. Sunucu tarafından bu süre boyunca hiçbir şey gelmezse nginx bağlantıyı kapatır. İki taraf da kapanış frame'i almadan kopuşu görür: 1006.",
          "nginx's `proxy_read_timeout` is 60 s by default. If nothing comes from the server side for that long, nginx closes the connection. Both sides see the drop without a close frame: 1006.",
        ),
      },
      title: l("Sessiz bağlantı ölür", "A quiet connection dies"),
      body: [
        l(
          "WebSocket'in kendisinde zaman aşımı yok, ama aradaki her şeyde var: nginx, load balancer'lar, şirket proxy'leri, mobil operatörlerin NAT tabloları. Uzun süre sessiz kalan bağlantıyı \"terk edilmiş\" sayıp kapatırlar.",
          "WebSocket itself has no timeout, but everything in between does: nginx, load balancers, corporate proxies, mobile carriers' NAT tables. They treat a connection that stays quiet too long as abandoned, and close it.",
        ),
        l(
          "Burada nginx 60. saniyede kesti. Tarayıcı da sunucu da 1006 gördü: kimse kapanış frame'i göndermedi, TCP bağlantısı aradan kesildi.",
          "Here nginx cut it at 60 seconds. Both the browser and the server saw 1006: nobody sent a close frame; the TCP connection was cut in between.",
        ),
      ],
    },
    {
      short: l("Ping, pong", "Ping, pong"),
      tag: "idea",
      title: l("Sunucu ping atar, tarayıcı kendiliğinden pong'lar", "The server pings; the browser pongs on its own"),
      body: [
        l(
          "Sunucuyu 30 sn'de bir herkese ping (opcode 9) gönderecek şekilde değiştirdik. Tarayıcı her ping'e kendiliğinden bir pong (opcode 10) ile cevap veriyor. nginx her ping'te sayacını sıfırlıyor; bağlantı 95 saniyedir açık.",
          "We changed the server to send everyone a ping (opcode 9) every 30 s. The browser answers each ping on its own with a pong (opcode 10). nginx resets its timer on every ping; the connection has been open for 95 seconds.",
        ),
        l(
          "Dikkat: tarayıcıdaki JavaScript ping gönderemez ve gelen ping'leri göremez; `WebSocket` API'sinde bunun için bir şey yok. Ping'i sunucu gönderir, pong'u tarayıcı kendisi verir. Node'daki `ws` istemcisi ise ikisini de yapabilir.",
          "Note: JavaScript in a browser cannot send a ping and never sees the pings that arrive; the `WebSocket` API has nothing for it. The server sends the ping; the browser answers by itself. The `ws` client in Node can do both.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Node · ws", code: "setInterval(() => {\n  for (const ws of wss.clients) ws.ping();\n}, 30000);" }],
      },
    },
    {
      short: l("Ölü bağlantı", "Dead connection"),
      tag: "how",
      title: l("Cevap gelmeyen ping, ölü bağlantıdır", "A ping with no answer means a dead connection"),
      body: [
        l(
          "Telefon bağlandı, sonra ağı gitti (metroya girdi). Telefon hiçbir şey gönderemedi; sunucu açısından bağlantı hâlâ açık görünüyordu. Heartbeat'in ikinci işi burada: her ping'ten önce, bir önceki ping'e pong gelip gelmediğine bakmak.",
          "The phone connected, then lost its network (it went into the subway). It could send nothing; to the server the connection still looked open. This is the heartbeat's second job: before each ping, check whether the previous ping got its pong.",
        ),
        l(
          "Pong gelmedi, sunucu `ws.terminate()` ile bağlantıyı kendi tarafında kapattı (1006). Telefonun tarafı ise hâlâ açık sanıyor: kapanışı haber verecek bir yol yok. Bunu bir sonraki derste göreceğiz.",
          "No pong came, so the server closed the connection on its side with `ws.terminate()` (1006). The phone's side still thinks it's open: there is no way to tell it. More on that in the next lesson.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Node · ws (ws belgelerindeki kalıp)",
            code: 'wss.on("connection", (ws) => {\n  ws.isAlive = true;\n  ws.on("pong", () => { ws.isAlive = true; });\n});\n\nsetInterval(() => {\n  for (const ws of wss.clients) {\n    if (!ws.isAlive) { ws.terminate(); continue; }\n    ws.isAlive = false;\n    ws.ping();\n  }\n}, 30000);',
          },
        ],
      },
    },
    {
      short: l("Başka yollar", "Other ways"),
      tag: "reality",
      title: l("Başka yollar ve bedelleri", "Other ways, and their price"),
      body: [
        l(
          "**nginx süresini uzatmak** (`proxy_read_timeout 1h;`) kopmaları azaltır ama ölü bağlantıları bulmaz; sunucuda hayalet bağlantılar birikir. Aradaki başka bir cihazın (mobil NAT, şirket proxy'si) süresi daha kısaysa yine kopar.",
          "**Raising nginx's timeout** (`proxy_read_timeout 1h;`) means fewer cuts, but it finds no dead connections; ghost connections pile up on the server. And if another device in between (a mobile NAT, a corporate proxy) has a shorter limit, it still drops.",
        ),
        l(
          "**TCP keepalive** işletim sisteminde var ama varsayılanı 2 saat; çoğu proxy'nin sınırından çok uzun. **İstemci tarafında tespit** için tarayıcı ping'leri göremediğinden uygulamalar kendi \"heartbeat\" mesajlarını JSON olarak gönderir: \"30 sn'dir sunucudan hiçbir şey gelmedi, yeniden bağlan\".",
          "**TCP keepalive** exists in the OS, but its default is 2 hours, far longer than most proxies allow. For **detection on the client**, since a browser cannot see pings, apps send their own \"heartbeat\" messages as JSON: \"nothing from the server for 30 s, reconnect\".",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Ping aralığı aradaki en kısa sınırdan kısa olmalı. 30 sn güvenli bir varsayılan; ws belgelerindeki örnek de 30 sn.",
            "The ping interval must be shorter than the shortest limit in between. 30 s is a safe default; the example in the ws docs uses 30 s too.",
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
          "Sıra sende. Sohbet `server.js` olarak `:9001`'de, önünde nginx (`ws://localhost/ws`). `watch.js` nginx üzerinden bağlanıp ne zaman koptuğunu yazar. **4 senaryo** var.",
          "Your turn. The chat runs as `server.js` on `:9001`, with nginx in front (`ws://localhost/ws`). `watch.js` connects through nginx and says when it got cut. There are **4 scenarios**.",
        ),
        l(
          "Kodu `nano` ile değiştir, sunucuyu `pkill -f server.js` ve `node server.js &` ile yeniden başlat, zamanı `sleep` ile ilerlet. nginx ayarı için `sudo nano` ve `sudo nginx -s reload`.",
          "Change code with `nano`, restart the server with `pkill -f server.js` and `node server.js &`, move time with `sleep`. For the nginx config: `sudo nano` and `sudo nginx -s reload`.",
        ),
      ],
    },
  ],
  recap: [
    l("Aradaki proxy'ler sessiz bağlantıları keser; nginx'in varsayılanı 60 sn.", "Proxies in between cut quiet connections; nginx's default is 60 s."),
    l("Ping'i sunucu gönderir; tarayıcı pong'u kendisi verir, JavaScript ikisini de görmez.", "The server sends pings; the browser pongs by itself, and JavaScript sees neither."),
    l("Heartbeat iki iş görür: bağlantıyı canlı tutar ve pong'u gelmeyen ölü bağlantıyı bulur.", "A heartbeat does two jobs: it keeps the connection alive and finds dead ones that never pong."),
    l("Ölü bağlantı `terminate()` ile kapatılır; karşı taraf bundan haberdar olmaz.", "A dead connection is closed with `terminate()`; the other side never hears of it."),
    l("Süreyi uzatmak kopmaları azaltır ama ölü bağlantıları bulmaz.", "A longer timeout means fewer cuts, but finds no dead connections."),
  ],
  quiz: [
    {
      question: l("Tarayıcıdaki bir sayfa sunucuya ping göndermek istiyor. Ne yapar?", "A page in a browser wants to ping the server. What does it do?"),
      options: [
        l("`ws.ping()` çağırır", "Calls `ws.ping()`"),
        l("Yapamaz; WebSocket API'sinde ping yok. Gerekirse kendi JSON heartbeat mesajını gönderir", "It can't; the WebSocket API has no ping. If needed, it sends its own JSON heartbeat message"),
        l("Opcode 9'lu bir frame gönderir", "Sends a frame with opcode 9"),
        l("Bağlantıyı yeniden açar", "Reopens the connection"),
      ],
      answer: 1,
      explain: l("Tarayıcılar ping'i sadece kendiliğinden pong'lar; JS'e açmaz.", "Browsers only answer pings on their own; they don't expose them to JS."),
      reviewStep: 1,
    },
    {
      question: l("nginx arkasında, kimsenin yazmadığı bir sohbet 60. saniyede kopuyor. En kalıcı çözüm?", "Behind nginx, a chat where nobody writes drops at 60 seconds. The most lasting fix?"),
      options: [
        l("Sunucunun 30 sn'de bir ping göndermesi", "The server sending a ping every 30 s"),
        l("İstemcinin her 5 dakikada yeniden bağlanması", "The client reconnecting every 5 minutes"),
        l("WebSocket'i kapatıp polling'e dönmek", "Dropping WebSocket for polling"),
        l("nginx'i kaldırmak", "Removing nginx"),
      ],
      answer: 0,
      explain: l("Ping sayacı sıfırlar ve ölü bağlantıları da bulur. Süreyi uzatmak sadece kopmaları erteler.", "A ping resets the timer and finds dead connections too. A longer timeout only puts the cut off."),
      reviewStep: 1,
    },
    {
      question: l("Heartbeat'te bir istemci son ping'e pong vermedi. Sunucu ne yapar?", "In a heartbeat, a client didn't pong the last ping. What does the server do?"),
      options: [
        l("`ws.close(1000)`", "`ws.close(1000)`"),
        l("`ws.terminate()`: cevap veremeyen tarafla kapanış el sıkışması beklemenin anlamı yok", "`ws.terminate()`: there's no point waiting for a closing handshake from a side that can't answer"),
        l("Bir ping daha gönderir, sonsuza kadar", "Sends another ping, forever"),
        l("Hiçbir şey", "Nothing"),
      ],
      answer: 1,
      explain: l("close() kapanış frame'inin cevabını 30 sn bekler; terminate() bağlantıyı hemen düşürür.", "close() waits 30 s for an answer to its close frame; terminate() drops the connection at once."),
      reviewStep: 2,
    },
    {
      question: l("`proxy_read_timeout 1h` koymanın riski ne?", "What's the risk of setting `proxy_read_timeout 1h`?"),
      options: [
        l("nginx çöker", "nginx crashes"),
        l("Ölü bağlantılar bir saate kadar açık kalır, sunucuda birikir", "Dead connections stay open for up to an hour and pile up on the server"),
        l("Mesajlar gecikir", "Messages are delayed"),
        l("Hiçbir risk yok", "No risk at all"),
      ],
      answer: 1,
      explain: l("Süre, ölü bağlantıyı fark etmeyi de geciktirir. Ping hem canlı tutar hem ölüyü bulur.", "The timeout also delays noticing a dead connection. A ping both keeps it alive and finds the dead."),
      reviewStep: 3,
    },
  ],
};
