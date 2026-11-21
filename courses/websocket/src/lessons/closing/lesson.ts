import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const closing: Lesson = {
  slug: "closing",
  title: l("Kapanış ve close kodları", "Closing and close codes"),
  summary: l(
    "Bir WebSocket'i iki taraf birlikte kapatır ve bir kod söyler: 1000, 1001, 1005, 1006, 1008, 1009. Her kodun gerçek sebebini gör.",
    "Both sides close a WebSocket together and give a code: 1000, 1001, 1005, 1006, 1008, 1009. See the real cause behind each.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kapanış el sıkışmasını görmek", "See the closing handshake"), step: 0 },
    { text: l("1005'in nereden geldiğini bilmek", "Know where 1005 comes from"), step: 1 },
    { text: l("Kopan kablonun neden fark edilmediğini görmek", "See why a pulled cable goes unnoticed"), step: 2 },
    { text: l("Deploy'da 1001 ile kibarca kapatmak", "Close politely with 1001 on a deploy"), step: 3 },
    { text: l("Tarayıcının hangi kodları gönderebildiğini bilmek", "Know which codes a browser may send"), step: 4 },
  ],
  steps: [
    {
      short: l("1000", "1000"),
      tag: "how",
      title: l("Kapanış bir el sıkışmadır", "Closing is a handshake"),
      body: [
        l(
          "Tarayıcı `ws.close(1000, \"bye\")` çağırdı. Sunucuya bir kapanış frame'i gitti (opcode 8, kod 1000, sebep `bye`). Sunucu aynı kodla bir kapanış frame'iyle cevap verdi ve TCP bağlantısını kapattı. İki uç da 1000 gördü: normal kapanış.",
          "The browser called `ws.close(1000, \"bye\")`. A close frame went to the server (opcode 8, code 1000, reason `bye`). The server answered with a close frame carrying the same code and closed the TCP connection. Both ends saw 1000: a normal closure.",
        ),
        l(
          "Bu el sıkışma iki tarafa da \"diğeri bunu biliyor\" güvencesi verir: kapanış kazara değil, isteyerek oldu.",
          "The handshake assures each side that the other knows: the close was on purpose, not an accident.",
        ),
      ],
    },
    {
      short: l("1005", "1005"),
      tag: "how",
      title: l("Kodlar ve gerçek sebepleri", "The codes and their real causes"),
      body: [
        l(
          "Dizüstü `ws.close()`'u kodsuz çağırdı. Kapanış frame'i boş gitti; alan taraf bunu `1005` (\"no status received\") olarak bildirdi. wscat'te Ctrl+C de böyle kapatır. 1005 hiçbir zaman frame'in içinde gitmez; \"kod yoktu\" demenin yoludur.",
          "The laptop called `ws.close()` with no code. The close frame went empty, and the receiver reported it as `1005` (\"no status received\"). Ctrl+C in wscat closes this way too. 1005 never travels in a frame; it's how \"there was no code\" gets reported.",
        ),
        l(
          "Sık görülenler: **1000** normal kapanış. **1001** going away: sunucu kapanıyor ya da kullanıcı sayfadan ayrıldı. **1006** abnormal: kapanış frame'i hiç gelmedi, bağlantı düştü (bu da asla gönderilmez). **1008** kurala aykırı (policy). **1009** mesaj çok büyük. **1011** sunucuda beklenmedik hata. **4000-4999** uygulamanın kendi kodları.",
          "The common ones: **1000** normal closure. **1001** going away: the server is shutting down, or the user left the page. **1006** abnormal: no close frame ever came, the connection dropped (never sent either). **1008** policy violation. **1009** message too big. **1011** unexpected server error. **4000-4999** the application's own codes.",
        ),
      ],
    },
    {
      short: l("Kablo", "Cable"),
      tag: "problem",
      predict: {
        question: l(
          "Telefonun ağı birden gitti (kablo çekildi). Heartbeat'i olmayan sunucu bunu ne zaman fark eder?",
          "The phone's network suddenly went away (a pulled cable). When does a server with no heartbeat notice?",
        ),
        options: [
          l("Hemen: 1006 alır", "At once: it gets 1006"),
          l("30 saniye içinde", "Within 30 seconds"),
          l("Hiç, ya da ancak bir şey gönderip TCP dakikalar sonra pes edince", "Never, or only after it sends something and TCP gives up minutes later"),
          l("Telefon geri gelince", "When the phone comes back"),
        ],
        answer: 2,
        why: l(
          "Ağı giden taraf ne kapanış frame'i ne de TCP'nin kapanış paketini gönderebilir. Diğer taraf beklemeye devam eder. Sunucu bir şey gönderirse TCP onu dakikalarca (Linux'ta yaklaşık 15 dakika) yeniden dener, sonra pes eder. 1006 o zaman, ya da heartbeat sayesinde çok daha önce gelir.",
          "The side that lost its network can send neither a close frame nor TCP's closing packet. The other side keeps waiting. If the server sends something, TCP retries it for minutes (about 15 on Linux) before giving up. The 1006 comes then, or much earlier with a heartbeat.",
        ),
      },
      title: l("Kopan kabloyu kimse duymaz", "Nobody hears a pulled cable"),
      body: [
        l(
          "Telefonun ağı gitti ve iki dakika geçti. Sunucu bağlantıyı hâlâ açık sayıyor; telefon da kendi tarafında açık sanıyor. İki uç birbirinden habersiz: bağlantı \"yarı açık\".",
          "The phone's network went away and two minutes passed. The server still counts the connection as open, and the phone thinks so on its side too. The two ends know nothing of each other: the connection is \"half open\".",
        ),
        l(
          "1006 bu yüzden \"birisi kayboldu\" demektir, bir protokol hatası değil. Bunu hızlıca fark etmenin yolu bir önceki derste gördüğümüz heartbeat.",
          "That's why 1006 means \"someone vanished\", not a protocol bug. The way to notice quickly is the heartbeat from the previous lesson.",
        ),
      ],
    },
    {
      short: l("1001", "1001"),
      tag: "how",
      title: l("Deploy'da kibarca kapat", "Close politely on a deploy"),
      body: [
        l(
          "Deploy sırasında sunucuya SIGTERM gönderildi (`kill` varsayılan olarak bunu gönderir). Sunucunun SIGTERM yakalayıcısı her istemciyi `ws.close(1001, \"server restarting\")` ile kapattı. Tablet 1001'i ve sebebi gördü: \"planlı bir kapanış, birazdan yeniden bağlan\".",
          "During the deploy the server got SIGTERM (`kill` sends it by default). The server's SIGTERM handler closed every client with `ws.close(1001, \"server restarting\")`. The tablet saw 1001 and the reason: \"a planned close, reconnect shortly\".",
        ),
        l(
          "Yakalayıcı olmasaydı süreç anında biterdi; istemciler kapanış frame'i alamaz, 1006 görür, hata uyarısı gösterirdi. `kill -9` (SIGKILL) ise yakalanamaz: her zaman 1006.",
          "Without the handler the process would end at once; clients would get no close frame, see 1006 and show an error. `kill -9` (SIGKILL) cannot be caught at all: always 1006.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Node · ws", code: 'process.on("SIGTERM", () => {\n  for (const ws of wss.clients) ws.close(1001, "server restarting");\n  wss.close(() => process.exit(0));\n});' }],
      },
    },
    {
      short: l("Tarayıcı", "Browser"),
      tag: "reality",
      title: l("Tarayıcının sınırları", "What a browser may send"),
      body: [
        l(
          "Tarayıcıdan `ws.close(code)` sadece `1000` ya da `3000-4999` arası kabul eder; `ws.close(1001)` bir `InvalidAccessError` fırlatır. 1001'i tarayıcı kendisi gönderir: kullanıcı sayfadan ayrılınca. Sebep metni en fazla 123 bayt olabilir (UTF-8).",
          "From a browser, `ws.close(code)` only accepts `1000` or `3000-4999`; `ws.close(1001)` throws an `InvalidAccessError`. The browser sends 1001 itself: when the user leaves the page. The reason can be at most 123 bytes (UTF-8).",
        ),
        l(
          "Uygulama kendi anlamlarını 4000'li kodlarla anlatır: örneğin `4001` \"oturumun süresi doldu, yeniden giriş yap\". İstemci bu kodu görünce yeniden bağlanmak yerine giriş sayfasına gider.",
          "Applications use codes in the 4000s for their own meanings: for example `4001` \"your session expired, log in again\". On seeing that code the client goes to the login page instead of reconnecting.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Sohbet sunucusu `server.js` (`:9001`). `watch.js` bağlanıp kapanış kodunu yazar, `report.js` gece raporunu gönderir, `upload.js` bir fotoğraf yükler. **4 senaryo** var.",
          "Your turn. The chat server is `server.js` (`:9001`). `watch.js` connects and prints the close code, `report.js` sends the nightly report, `upload.js` uploads a photo. There are **4 scenarios**.",
        ),
        l(
          "Kodu `nano` ile değiştir; sunucuyu `node server.js &` ile başlat, `pkill -f server.js` ile durdur (SIGTERM). Az komutla bitirirsen 3 yıldız.",
          "Change code with `nano`; start the server with `node server.js &` and stop it with `pkill -f server.js` (SIGTERM). Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Kapanış bir el sıkışmadır: bir taraf kodla bir kapanış frame'i gönderir, diğeri aynı kodla cevap verir.", "Closing is a handshake: one side sends a close frame with a code, the other answers with the same code."),
    l("1005 \"kod yoktu\", 1006 \"kapanış frame'i hiç gelmedi\" demek; ikisi de asla gönderilmez.", "1005 means \"no code was given\", 1006 \"no close frame ever came\"; neither is ever sent."),
    l("Kopan kabloyu karşı taraf duymaz; bağlantı yarı açık kalır, heartbeat ya da TCP pes edene kadar.", "The other side never hears a pulled cable; the connection stays half open until a heartbeat or TCP gives up."),
    l("Deploy'da SIGTERM'i yakalayıp istemcileri 1001 ile kapatmak, planlı kapanışı hatadan ayırır.", "Catching SIGTERM on a deploy and closing clients with 1001 tells a planned close from an error."),
    l("Tarayıcı sadece 1000 ve 3000-4999 gönderebilir; uygulamanın kendi anlamları 4000'li kodlara.", "A browser may send only 1000 and 3000-4999; an app's own meanings go in the 4000s."),
  ],
  quiz: [
    {
      question: l("Sunucu logunda bir istemci için `closed 1006` var. En olası anlamı?", "The server log shows `closed 1006` for a client. The likeliest meaning?"),
      options: [
        l("İstemci normal kapattı", "The client closed normally"),
        l("Bağlantı kapanış frame'i olmadan düştü: ağ gitti, süreç öldü ya da biri terminate() etti", "The connection dropped with no close frame: the network went, a process died, or someone terminated it"),
        l("Mesaj çok büyüktü", "The message was too big"),
        l("İstemci JSON göndermedi", "The client didn't send JSON"),
      ],
      answer: 1,
      explain: l("1006 hiç gönderilmez; kapanış frame'i gelmediğinde yerel olarak bildirilir.", "1006 is never sent; it's reported locally when no close frame arrives."),
      reviewStep: 1,
    },
    {
      question: l("Tarayıcıda `ws.close(1001)` çağırırsan ne olur?", "What happens if you call `ws.close(1001)` in a browser?"),
      options: [
        l("1001 ile kapanır", "It closes with 1001"),
        l("InvalidAccessError fırlatır: tarayıcıdan sadece 1000 ve 3000-4999", "It throws InvalidAccessError: a browser may send only 1000 and 3000-4999"),
        l("1000'e çevrilir", "It becomes 1000"),
        l("Hiçbir şey olmaz", "Nothing happens"),
      ],
      answer: 1,
      explain: l("1001'i tarayıcı kendisi, kullanıcı sayfadan ayrılınca gönderir.", "The browser sends 1001 itself, when the user leaves the page."),
      reviewStep: 4,
    },
    {
      question: l("Bir deploy'da istemcilerin \"bağlantı hatası\" göstermemesi için sunucu ne yapmalı?", "On a deploy, what should the server do so clients don't show a \"connection error\"?"),
      options: [
        l("kill -9 ile hızlıca kapanmak", "Shut down fast with kill -9"),
        l("SIGTERM'i yakalayıp herkesi 1001 ile kapatmak", "Catch SIGTERM and close everyone with 1001"),
        l("Hiçbir şey: istemci zaten anlar", "Nothing: the client figures it out"),
        l("Her istemciye 1006 göndermek", "Send every client 1006"),
      ],
      answer: 1,
      explain: l("1001 \"planlı gidiyorum\" der; 1006 ise bir kaza gibi görünür.", "1001 says \"leaving on purpose\"; 1006 looks like an accident."),
      reviewStep: 3,
    },
    {
      question: l("Kablosu çekilen bir istemcinin bağlantısı sunucuda ne zaman kapanır (heartbeat yok)?", "When does the server close the connection of a client whose cable was pulled (no heartbeat)?"),
      options: [
        l("Hemen", "At once"),
        l("Bir dakika içinde", "Within a minute"),
        l("Belki hiç; bir şey gönderirse TCP'nin dakikalar süren denemeleri bitince", "Maybe never; if it sends something, once TCP's minutes of retries run out"),
        l("İstemci 1000 gönderince", "When the client sends 1000"),
      ],
      answer: 2,
      explain: l("Ağı giden taraf hiçbir şey gönderemez. Bunu hızla fark etmenin yolu heartbeat.", "The side without a network can send nothing. A heartbeat is how to notice quickly."),
      reviewStep: 2,
    },
  ],
};
