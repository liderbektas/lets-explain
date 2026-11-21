import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const firstServer: Lesson = {
  slug: "first-server",
  title: l("İlk sunucu", "Your first server"),
  summary: l(
    "Node'un ws kütüphanesiyle bir WebSocket sunucusu: connection, message, send. Önce bir echo, sonra herkese yayın.",
    "A WebSocket server with Node's ws library: connection, message, send. An echo first, then a broadcast to everyone.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir ws sunucusunun üç olayını tanımak", "Know a ws server's three events"), step: 0 },
    { text: l("Her bağlantının kendi `ws`'si olduğunu görmek", "See that each connection has its own `ws`"), step: 1 },
    { text: l("wss.clients ile herkese yayın yapmak", "Broadcast to everyone with wss.clients"), step: 2 },
    { text: l("ws ile Socket.IO arasındaki farkı bilmek", "Know how ws and Socket.IO differ"), step: 3 },
  ],
  steps: [
    {
      short: l("Echo", "Echo"),
      tag: "how",
      title: l("Üç olay: connection, message, send", "Three events: connection, message, send"),
      body: [
        l(
          "`new WebSocketServer({ port: 9001 })` el sıkışmayı ws kütüphanesine bırakır; ilk derslerde elle yaptığımız her şeyi o yapar. Bize kalan, gelen bağlantıya ne yapacağımız.",
          "`new WebSocketServer({ port: 9001 })` leaves the handshake to the ws library; it does everything we did by hand in the early lessons. What's left to us is what to do with a connection.",
        ),
        l(
          "Bir istemci bağlanınca `connection` olayı gelir ve `ws` o istemcinin bağlantısıdır. O bağlantıdan mesaj gelince `message` olayı çalışır. `ws.send(...)` o istemciye bir mesaj gönderir. Bu sunucu her mesajı başına `echo:` koyup geri yolluyor.",
          "When a client connects, the `connection` event fires and `ws` is that client's connection. When a message comes over it, the `message` event runs. `ws.send(...)` sends that client a message. This server sends every message back with `echo:` in front.",
        ),
      ],
      practice: {
        commands: [{ cmd: "npm install ws", note: l("Node için en yaygın WebSocket kütüphanesi.", "The most widely used WebSocket library for Node.") }],
        snippets: [
          {
            label: "Node · server.js",
            code: 'const { WebSocketServer } = require("ws");\n\nconst wss = new WebSocketServer({ port: 9001 });\n\nwss.on("connection", (ws, req) => {\n  ws.on("message", (data) => ws.send(`echo: ${data}`));\n  ws.on("error", console.error);\n});',
          },
        ],
      },
    },
    {
      short: l("İki istemci", "Two clients"),
      tag: "how",
      title: l("Her istemcinin kendi bağlantısı", "Each client has its own connection"),
      body: [
        l(
          "Dizüstü de bağlandı ve kendi mesajını gönderdi. Sunucu cevabı sadece dizüstüne gönderdi: `connection` her istemci için ayrı çalışır ve içindeki `ws` sadece o istemciye aittir.",
          "The laptop connected too and sent its own message. The server answered the laptop only: `connection` runs separately for each client, and the `ws` inside belongs to that client alone.",
        ),
        l(
          "`connection`'ın ikinci parametresi `req`, el sıkışmanın HTTP isteğidir: `req.headers` (Origin, cookie), `req.url` (yol ve sorgu) ve `req.socket.remoteAddress` (istemcinin adresi). Kimlik doğrulama ve oda seçimi gibi işler buradan başlar.",
          "`connection`'s second parameter, `req`, is the handshake's HTTP request: `req.headers` (Origin, cookies), `req.url` (path and query) and `req.socket.remoteAddress` (the client's address). Things like authentication and choosing a room start there.",
        ),
      ],
    },
    {
      short: l("Yayın", "Broadcast"),
      tag: "how",
      predict: {
        question: l(
          "Sunucu artık her mesajı `wss.clients` içindeki herkese gönderiyor. Tarayıcı \"lunch at 12?\" yazdı. Kim alır?",
          "The server now sends every message to everyone in `wss.clients`. The browser wrote \"lunch at 12?\". Who gets it?",
        ),
        options: [
          l("Sadece dizüstü", "Only the laptop"),
          l("Dizüstü ve tarayıcının kendisi", "The laptop and the browser itself"),
          l("Sadece tarayıcı", "Only the browser"),
          l("Hiç kimse", "Nobody"),
        ],
        answer: 1,
        why: l(
          "`wss.clients` gönderen dahil herkesi içerir. Göndereni dışarıda bırakmak istersen döngüde `client !== ws` kontrolü eklersin. Sohbetlerde gönderenin de alması çoğu zaman işe yarar: \"mesajım sunucuya ulaştı\" onayı olur.",
          "`wss.clients` holds everyone, the sender included. To leave the sender out you'd add `client !== ws` in the loop. In chats it often helps that the sender gets it too: it confirms \"my message reached the server\".",
        ),
      },
      title: l("Herkese gönder", "Send to everyone"),
      body: [
        l(
          "`wss.clients` bağlı istemcilerin kümesi (Set). Mesaj gelince hepsini dolaşıp `client.send(...)`: işte bir sohbetin özü.",
          "`wss.clients` is the set of connected clients. When a message comes, loop over them and `client.send(...)`: that's the heart of a chat.",
        ),
        l(
          "Döngüde `client.readyState === WebSocket.OPEN` kontrolü, kapanmakta olan bir bağlantıya göndermeyi önler. Sunucuyu değiştirip yeniden başlattığımızda iki istemcinin de bağlantısı koptu ve yeniden bağlanmaları gerekti; bu da 6. bölümün konusu.",
          "Checking `client.readyState === WebSocket.OPEN` in the loop avoids sending to a connection that's closing. When we changed and restarted the server, both clients lost their connection and had to reconnect; that's chapter 6's subject.",
        ),
      ],
    },
    {
      short: l("Kütüphaneler", "Libraries"),
      tag: "reality",
      title: l("ws, Socket.IO ve diğerleri", "ws, Socket.IO and the others"),
      body: [
        l(
          "**ws**, protokolün kendisini verir: düz WebSocket. **Socket.IO** üstüne odalar, otomatik yeniden bağlanma ve onay mesajları ekler, ama kendi protokolünü konuşur: düz bir WebSocket istemcisi (tarayıcının `new WebSocket` ya da wscat) bir Socket.IO sunucusuyla konuşamaz, iki tarafta da Socket.IO gerekir.",
          "**ws** gives you the protocol itself: plain WebSocket. **Socket.IO** adds rooms, automatic reconnecting and acknowledgements on top, but speaks its own protocol: a plain WebSocket client (the browser's `new WebSocket`, or wscat) cannot talk to a Socket.IO server; both sides need Socket.IO.",
        ),
        l(
          "Çok yüksek bağlantı sayıları için **uWebSockets.js** gibi C++ tabanlı sunucular var; Bun ve Deno da WebSocket'i dahili sunar. Hangisi olursa olsun her `ws`'ye bir `error` dinleyicisi ekle: ws, dinleyicisi olmayan bir hatayı fırlatır ve süreci çökertir.",
          "For very high connection counts there are C++ based servers such as **uWebSockets.js**; Bun and Deno build WebSocket in too. Whichever you use, add an `error` listener to every `ws`: ws throws an error that nobody listens for, and that crashes the process.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `server.js` `:9001`'de bir echo sunucusu. `bots.js`, Ayşe ve Mert'in istemcilerini başlatır; gelen her mesajı ekrana yazarlar. **4 senaryo** var.",
          "Your turn. `server.js` is an echo server on `:9001`. `bots.js` starts Ayşe's and Mert's clients; they print every message that reaches them. There are **4 scenarios**.",
        ),
        l(
          "Kodu `nano server.js` ile değiştir, sunucuyu `pkill -f server.js` ve `node server.js &` ile yeniden başlat, `wscat` ile dene. Sunucu yeniden başlayınca botlar da kopar: `node bots.js &` ile yeniden başlat.",
          "Change the code with `nano server.js`, restart the server with `pkill -f server.js` and `node server.js &`, try it with `wscat`. When the server restarts the bots drop too: start them again with `node bots.js &`.",
        ),
      ],
    },
  ],
  recap: [
    l("ws'de bir sunucu `new WebSocketServer({ port })` ile başlar; el sıkışmayı kütüphane yapar.", "In ws a server starts with `new WebSocketServer({ port })`; the library does the handshake."),
    l("`connection` her istemci için ayrı çalışır; içindeki `ws` o istemcinin bağlantısıdır.", "`connection` runs separately per client; the `ws` inside is that client's connection."),
    l("`req` el sıkışmanın isteğidir: başlıklar, URL, adres.", "`req` is the handshake's request: headers, URL, address."),
    l("`wss.clients` herkesi tutar; yayın, onu dolaşıp göndermektir.", "`wss.clients` holds everyone; broadcasting is looping over it and sending."),
    l("Socket.IO kendi protokolünü konuşur; her `ws`'ye bir `error` dinleyicisi şart.", "Socket.IO speaks its own protocol; every `ws` needs an `error` listener."),
  ],
  quiz: [
    {
      question: l("`wss.on(\"connection\", (ws, req) => ...)` içinde `ws` nedir?", "Inside `wss.on(\"connection\", (ws, req) => ...)`, what is `ws`?"),
      options: [
        l("Sunucunun kendisi", "The server itself"),
        l("Az önce bağlanan istemcinin bağlantısı", "The connection of the client that just connected"),
        l("Bütün istemcilerin listesi", "The list of all clients"),
        l("El sıkışmanın HTTP isteği", "The handshake's HTTP request"),
      ],
      answer: 1,
      explain: l("Her istemci için ayrı bir `ws` gelir. Liste `wss.clients`, istek `req`.", "Each client gets its own `ws`. The list is `wss.clients`; the request is `req`."),
      reviewStep: 1,
    },
    {
      question: l("Bir mesajı göndereni hariç herkese göndermek için ne yaparsın?", "How do you send a message to everyone except its sender?"),
      options: [
        l("`ws.send(data)`", "`ws.send(data)`"),
        l("`wss.clients`'ı dolaşıp `client !== ws` olanlara göndermek", "Loop over `wss.clients` and send where `client !== ws`"),
        l("`wss.send(data)`", "`wss.send(data)`"),
        l("İmkânsız", "It can't be done"),
      ],
      answer: 1,
      explain: l("ws'de hazır bir \"broadcast\" yoktur; döngüyü sen yazarsın.", "ws has no built-in \"broadcast\"; you write the loop."),
      reviewStep: 2,
    },
    {
      question: l("Tarayıcının `new WebSocket(\"ws://...\")` ile bir Socket.IO sunucusuna bağlanması?", "The browser connecting to a Socket.IO server with `new WebSocket(\"ws://...\")`?"),
      options: [
        l("Sorunsuz çalışır", "Works fine"),
        l("Çalışmaz: Socket.IO kendi protokolünü konuşur, istemcide de Socket.IO gerekir", "Doesn't work: Socket.IO speaks its own protocol and needs Socket.IO on the client too"),
        l("Sadece HTTPS'te çalışır", "Works only over HTTPS"),
        l("Sadece odalarda çalışır", "Works only in rooms"),
      ],
      answer: 1,
      explain: l("Socket.IO WebSocket'i taşıma olarak kullanır ama üstüne kendi paket biçimini koyar.", "Socket.IO uses WebSocket as a transport but puts its own packet format on top."),
      reviewStep: 3,
    },
    {
      question: l("Neden her `ws`'ye `ws.on(\"error\", ...)` eklenir?", "Why add `ws.on(\"error\", ...)` to every `ws`?"),
      options: [
        l("Mesajları hızlandırmak için", "To speed up messages"),
        l("Dinleyicisi olmayan bir 'error' olayı fırlatılır ve süreci çökertir", "An 'error' event nobody listens for is thrown and crashes the process"),
        l("Bağlantıyı şifrelemek için", "To encrypt the connection"),
        l("Zorunlu değil, alışkanlık", "It isn't needed; just habit"),
      ],
      answer: 1,
      explain: l("Node'da dinleyicisi olmayan 'error' olayı bir istisnaya dönüşür. Güvenlik dersinde bunu canlı göreceğiz.", "In Node an 'error' event with no listener becomes an exception. The security lesson shows it live."),
      reviewStep: 3,
    },
  ],
};
