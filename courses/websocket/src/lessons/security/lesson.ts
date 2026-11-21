import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const security: Lesson = {
  slug: "security",
  title: l("Güvenlik", "Security"),
  summary: l(
    "WebSocket'te CORS yok: başka bir site kullanıcının çerezleriyle bağlanabilir. Origin kontrolü, kimlik doğrulama, boyut sınırı, hız sınırı ve `wss://`.",
    "WebSocket has no CORS: another site can connect with the user's cookies. Origin checks, authentication, size limits, rate limits and `wss://`.",
  ),
  minutes: 15,
  level: l("İleri", "Advanced"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Cross-site WebSocket hijacking'i görmek", "See cross-site WebSocket hijacking"), step: 0 },
    { text: l("Origin'i el sıkışmada kontrol etmek", "Check the Origin during the handshake"), step: 1 },
    { text: l("Tarayıcıda kimlik doğrulamanın yollarını bilmek", "Know the ways to authenticate from a browser"), step: 2 },
    { text: l("Boyut sınırı ve hata dinleyicisi koymak", "Set a size limit and an error listener"), step: 3 },
    { text: l("Listenin geri kalanını bilmek", "Know the rest of the list"), step: 4 },
  ],
  steps: [
    {
      short: l("Hijacking", "Hijacking"),
      tag: "problem",
      predict: {
        question: l(
          "Kullanıcı sohbet uygulamasında oturum açık haldeyken başka bir sekmede `evil.example`'ı açtı. O sayfa sohbet sunucusuna bir WebSocket açıyor. Ne olur?",
          "The user is logged in to the chat app and opens `evil.example` in another tab. That page opens a WebSocket to the chat server. What happens?",
        ),
        options: [
          l("Tarayıcı CORS yüzünden engeller", "The browser blocks it because of CORS"),
          l("Bağlanır, tarayıcı kullanıcının çerezlerini de gönderir ve sayfa mesajları okur", "It connects, the browser sends the user's cookies too, and the page reads the messages"),
          l("Bağlanır ama hiçbir şey alamaz", "It connects but receives nothing"),
          l("Sunucu otomatik reddeder", "The server rejects it automatically"),
        ],
        answer: 1,
        why: l(
          "WebSocket'te CORS yok. Tarayıcı el sıkışmaya o siteye ait çerezleri ekler ve isteği yapan sayfanın adresini `Origin` başlığında söyler. Kontrol etmek sunucunun işi.",
          "WebSocket has no CORS. The browser adds that site's cookies to the handshake and names the requesting page in the `Origin` header. Checking it is the server's job.",
        ),
      },
      title: l("Başka bir site kullanıcı adına bağlanıyor", "Another site connects as the user"),
      body: [
        l(
          "`evil.example`'daki sayfa sohbet sunucusuna bağlandı ve tarayıcının sohbete yazdığı şifre sıfırlama kodunu da okudu. Buna cross-site WebSocket hijacking (CSWSH) denir.",
          "The page on `evil.example` connected to the chat server and read the password reset code the browser typed into the chat. This is called cross-site WebSocket hijacking (CSWSH).",
        ),
        l(
          "fetch ve XHR'da tarayıcı başka sitelerin cevabı okumasını CORS ile engeller. WebSocket'te böyle bir koruma yok: el sıkışma geçerse sayfa her şeyi okur. Sunucunun önünde tek bir ipucu var: `Origin` başlığı.",
          "With fetch and XHR, the browser stops other sites from reading the answer through CORS. WebSocket has no such guard: if the handshake goes through, the page reads everything. The server has one clue to go on: the `Origin` header.",
        ),
      ],
    },
    {
      short: l("Origin", "Origin"),
      tag: "how",
      title: l("Origin'i el sıkışmada kontrol et", "Check the Origin during the handshake"),
      body: [
        l(
          "Sunucuya `verifyClient` ekledik: `origin === \"http://localhost:8080\"` değilse bağlantı kurulmaz ve tarayıcı 401 alır. Uygulamanın kendi sayfası bağlandı, `evil.example` geri çevrildi.",
          "We added `verifyClient` to the server: if `origin !== \"http://localhost:8080\"`, no connection is made and the browser gets 401. The app's own page connected; `evil.example` was turned away.",
        ),
        l(
          "Origin'i tarayıcı koyar ve sayfa onu değiştiremez. Ama tarayıcı dışındaki bir program (curl, bir script) istediği Origin'i yazabilir. Bu yüzden Origin kontrolü tarayıcıdaki saldırılara karşıdır, kimlik doğrulamanın yerini tutmaz.",
          "The browser sets Origin and a page can't change it. But a program outside a browser (curl, a script) can write any Origin it likes. So an Origin check protects against attacks in browsers; it does not replace authentication.",
        ),
      ],
      practice: {
        commands: [{ cmd: "wscat -c ws://localhost:9001 -o https://evil.example", note: l("Başka bir siteden geliyormuş gibi dene.", "Try it as if coming from another site.") }],
        snippets: [{ label: "Node · ws", code: 'const wss = new WebSocketServer({\n  port: 9001,\n  verifyClient: ({ origin }) => origin === "https://chat.example.com",\n});' }],
      },
    },
    {
      short: l("Kimlik", "Identity"),
      tag: "how",
      title: l("Kimsin? Token nereye konur", "Who are you? Where the token goes"),
      body: [
        l(
          "Tarayıcının `WebSocket` API'si özel başlık gönderemez: `Authorization: Bearer ...` mümkün değil. Üç yaygın yol var. **URL'de** (`?token=...`): kolay, ama URL'ler sunucu ve proxy loglarına, tarayıcı geçmişine düşer. **Çerez**: tarayıcı kendisi gönderir, ama tam da bu yüzden Origin kontrolü şart. **İlk mesaj**: bağlantı açılınca ilk iş `{\"type\":\"auth\",\"token\":\"...\"}`; sunucu doğrulayana kadar hiçbir şey göndermez.",
          "The browser's `WebSocket` API can't send custom headers: `Authorization: Bearer ...` isn't possible. There are three common ways. **In the URL** (`?token=...`): easy, but URLs land in server and proxy logs and browser history. **A cookie**: the browser sends it by itself, which is exactly why the Origin check is a must. **The first message**: the first thing once the connection opens is `{\"type\":\"auth\",\"token\":\"...\"}`, and the server sends nothing until it has checked it.",
        ),
        l(
          "Kimlik doğrulanmamış bağlantıyı kısa bir süre (örneğin 5 sn) sonra kapat ve token'ın süresi dolunca kendi kodunla (örneğin `4001`) kapat; istemci bu kodu görünce yeniden bağlanmak yerine yeniden giriş istesin.",
          "Close a connection that hasn't authenticated after a short while (5 s, say), and when its token expires close it with your own code (`4001`, say); on seeing that code the client asks for a new login instead of reconnecting.",
        ),
      ],
    },
    {
      short: l("Boyut", "Size"),
      tag: "how",
      title: l("Boyut sınırı ve hata dinleyicisi", "A size limit and an error listener"),
      body: [
        l(
          "`flood.js` iki adet 1 MB'lık mesaj gönderdi. ws'nin `maxPayload`'ı varsayılan olarak 100 MiB: sınır olmasa bu mesajlar içeri girer ve belleği doldururdu. Sohbet için 64 KB koyduk; sunucu ilkinde bağlantıyı 1009 (\"message too big\") ile kapattı.",
          "`flood.js` sent two 1 MB messages. ws's `maxPayload` defaults to 100 MiB: without a limit these would get in and fill memory. We set 64 KB for the chat; the server closed the connection on the first one with 1009 (\"message too big\").",
        ),
        l(
          "Sınır aşılınca ws soket üzerinde bir `error` olayı da çıkarır. Dinleyicisi olmayan `error` olayı Node'da fırlatılır ve süreci çökertir: tek bir saldırgan bütün sunucuyu düşürür. Bu sunucuda `ws.on(\"error\", ...)` var ve çalışmaya devam etti.",
          "Over the limit, ws also raises an `error` event on the socket. In Node an `error` event nobody listens for is thrown and crashes the process: one attacker takes the whole server down. This server has `ws.on(\"error\", ...)` and kept running.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Node · ws", code: 'const wss = new WebSocketServer({ port: 9001, maxPayload: 64 * 1024 });\n\nwss.on("connection", (ws) => {\n  ws.on("error", (err) => console.log("socket error:", err.message));\n});' }],
      },
    },
    {
      short: l("Liste", "The list"),
      tag: "reality",
      title: l("Listenin geri kalanı", "The rest of the list"),
      body: [
        l(
          "**wss://** kullan: `ws://` düz metindir; aynı ağdaki herkes mesajları okuyabilir (maske şifre değildir). `https://` bir sayfa `ws://`'ye bağlanamaz (mixed content). TLS genelde nginx'te ya da load balancer'da biter.",
          "**Use wss://**: `ws://` is plain text; anyone on the same network can read the messages (a mask is not encryption). An `https://` page cannot connect to `ws://` (mixed content). TLS usually ends at nginx or the load balancer.",
        ),
        l(
          "**Hız sınırı**: bir istemci saniyede belli sayıdan fazla mesaj gönderirse kapat. **Girdiyi doğrula**: JSON'u try/catch ile oku, türleri ve uzunlukları denetle. **Bağlantı sınırı**: tek bir IP'den gelebilecek bağlantı sayısını sınırla. **Hata dinleyicisi**: her `ws`'de `error` dinle.",
          "**Rate limits**: close a client that sends more than so many messages a second. **Validate input**: read JSON with try/catch, check types and lengths. **Connection limits**: cap how many connections one IP may open. **Error listeners**: listen for `error` on every `ws`.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `server.js` (`:9001`) hiçbir önlemi olmayan bir sohbet sunucusu. `flood.js` dev mesajlar, `spam.js` mesaj seli gönderir. **4 senaryo** var: Origin, boyut, kimlik ve hız.",
          "Your turn. `server.js` (`:9001`) is a chat server with no protection at all. `flood.js` sends giant messages, `spam.js` a flood of them. There are **4 scenarios**: origin, size, identity and rate.",
        ),
        l(
          "Başka bir siteden geliyormuş gibi bağlanmak için `wscat -o https://evil.example`. Kodu `nano` ile değiştir; `pkill -f server.js` ve `node server.js &` ile yeniden başlat.",
          "To connect as if from another site: `wscat -o https://evil.example`. Change code with `nano`; restart with `pkill -f server.js` and `node server.js &`.",
        ),
      ],
    },
  ],
  recap: [
    l("WebSocket'te CORS yok; tarayıcı başka bir sitenin bağlantısına bile kullanıcının çerezlerini ekler.", "WebSocket has no CORS; the browser adds the user's cookies even to another site's connection."),
    l("`Origin`'i el sıkışmada kontrol et (ws'de `verifyClient`); ama bu kimlik doğrulamanın yerini tutmaz.", "Check `Origin` during the handshake (`verifyClient` in ws), but it doesn't replace authentication."),
    l("Tarayıcı başlık gönderemez: token'ı ilk mesajda ya da çerezde (Origin kontrolüyle) taşı; URL'deki token loglara düşer.", "A browser can't send headers: carry the token in the first message or a cookie (with an Origin check); a token in the URL lands in logs."),
    l("`maxPayload`'ı düşür (varsayılan 100 MiB) ve her `ws`'ye `error` dinleyicisi ekle.", "Lower `maxPayload` (100 MiB by default) and add an `error` listener to every `ws`."),
    l("`wss://`, hız sınırı, girdi doğrulama ve bağlantı sınırları listenin geri kalanı.", "`wss://`, rate limits, input validation and connection limits make up the rest of the list."),
  ],
  quiz: [
    {
      question: l("Bir WebSocket sunucusu cross-site WebSocket hijacking'e karşı ne kontrol etmeli?", "What should a WebSocket server check against cross-site WebSocket hijacking?"),
      options: [l("User-Agent'ı", "The User-Agent"), l("Origin başlığını", "The Origin header"), l("Sec-WebSocket-Key'i", "The Sec-WebSocket-Key"), l("IP adresini", "The IP address")],
      answer: 1,
      explain: l("Origin, bağlantıyı isteyen sayfanın adresidir ve tarayıcıdaki bir sayfa onu değiştiremez.", "Origin is the address of the page asking for the connection, and a page in a browser can't change it."),
      reviewStep: 1,
    },
    {
      question: l("Tarayıcıdan WebSocket'e token göndermenin en az riskli yolu?", "The least risky way to send a token to a WebSocket from a browser?"),
      options: [
        l("Authorization başlığı", "An Authorization header"),
        l("URL'de `?token=`", "`?token=` in the URL"),
        l("Bağlantı açılınca ilk mesajda", "In the first message once the connection opens"),
        l("Sec-WebSocket-Key içinde", "Inside Sec-WebSocket-Key"),
      ],
      answer: 2,
      explain: l("Tarayıcı başlık ekleyemez; URL loglara düşer. İlk mesaj loglarda görünmez.", "A browser can't add headers; a URL lands in logs. A first message doesn't show up in logs."),
      reviewStep: 2,
    },
    {
      question: l("`maxPayload` koydun ama `ws.on(\"error\")` eklemedin. Biri büyük bir mesaj gönderirse?", "You set `maxPayload` but added no `ws.on(\"error\")`. If someone sends a big message?"),
      options: [
        l("Sadece o bağlantı 1009 ile kapanır", "Only that connection closes with 1009"),
        l("Dinleyicisi olmayan 'error' fırlatılır ve bütün süreç çöker", "The 'error' nobody listens for is thrown and the whole process crashes"),
        l("Mesaj kesilip kabul edilir", "The message is cut and accepted"),
        l("Hiçbir şey olmaz", "Nothing happens"),
      ],
      answer: 1,
      explain: l("Sınır tek başına yetmez; hata dinleyicisi süreci ayakta tutar.", "The limit alone isn't enough; the error listener keeps the process up."),
      reviewStep: 3,
    },
    {
      question: l("Neden `ws://` yerine `wss://`?", "Why `wss://` rather than `ws://`?"),
      options: [
        l("Daha hızlı", "It's faster"),
        l("`ws://` düz metindir; maske şifreleme değildir, ağdaki herkes okuyabilir", "`ws://` is plain text; a mask is not encryption and anyone on the network can read it"),
        l("Daha az bellek harcar", "It uses less memory"),
        l("Origin kontrolünü gereksiz kılar", "It makes the Origin check unnecessary"),
      ],
      answer: 1,
      explain: l("Gizliliği TLS sağlar; `https://` sayfalar zaten `ws://`'ye bağlanamaz.", "TLS provides privacy; `https://` pages can't connect to `ws://` anyway."),
      reviewStep: 4,
    },
  ],
};
