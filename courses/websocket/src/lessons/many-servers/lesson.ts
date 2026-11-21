import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const manyServers: Lesson = {
  slug: "many-servers",
  title: l("Birden fazla sunucu", "Many servers"),
  summary: l(
    "Sunucuyu çoğaltınca her kopya sadece kendi istemcilerini bilir ve sohbet ikiye bölünür. Sticky session bunu çözmez; Redis pub/sub çözer.",
    "Run more copies of the server and each only knows its own clients, so the chat splits in two. Sticky sessions don't fix it; Redis pub/sub does.",
  ),
  minutes: 13,
  level: l("İleri", "Advanced"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kopyaların birbirinden habersiz olduğunu görmek", "See that copies know nothing of each other"), step: 0 },
    { text: l("Sticky session'ın neden yetmediğini bilmek", "Know why sticky sessions aren't enough"), step: 1 },
    { text: l("Redis pub/sub ile kopyaları bağlamak", "Connect the copies with Redis pub/sub"), step: 2 },
    { text: l("Pub/sub'ın sınırlarını bilmek", "Know pub/sub's limits"), step: 3 },
  ],
  steps: [
    {
      short: l("İki sohbet", "Two chats"),
      tag: "problem",
      title: l("Kopyalar birbirini tanımaz", "Copies don't know each other"),
      body: [
        l(
          "Aynı sohbet sunucusundan iki kopya çalışıyor: `:8082` ve `:8083`. Load balancer dizüstünü birine, telefonu ötekine gönderdi. Dizüstü bir mesaj yazdı; kendi kopyası onu kendi istemcilerine dağıttı. Telefon hiçbir şey almadı.",
          "Two copies of the same chat server are running: `:8082` and `:8083`. The load balancer sent the laptop to one and the phone to the other. The laptop wrote a message; its copy handed it to its own clients. The phone got nothing.",
        ),
        l(
          "Her kopyanın `wss.clients`'ı sadece kendine bağlı olanları içerir. Tek sunucuda çalışan yayın kodu, ikinci kopya eklendiği anda sessizce ikiye bölünür.",
          "Each copy's `wss.clients` holds only those connected to it. Broadcast code that works on one server quietly splits in two the moment a second copy is added.",
        ),
      ],
    },
    {
      short: l("Sticky?", "Sticky?"),
      tag: "idea",
      predict: {
        question: l(
          "Bir ekip arkadaşı \"load balancer'da sticky session açalım\" diyor (her istemci hep aynı kopyaya gider). Telefon dizüstünün mesajını alır mı?",
          "A teammate says \"let's turn on sticky sessions in the load balancer\" (each client always goes to the same copy). Does the phone get the laptop's message?",
        ),
        options: [
          l("Evet, sticky session tam bunun için", "Yes, that's exactly what sticky sessions are for"),
          l("Hayır: ikisi yine farklı kopyalarda olabilir; sticky sadece her birini kendi kopyasına bağlar", "No: they can still be on different copies; sticky only pins each one to its own copy"),
          l("Sadece aynı odadaysa", "Only if they're in the same room"),
          l("Sadece HTTP/2'de", "Only over HTTP/2"),
        ],
        answer: 1,
        why: l(
          "Bir WebSocket zaten tek bir kopyaya bağlı kalır; sticky session bunu değiştirmez. Sticky, HTTP'ye geri düşen kütüphaneler (Socket.IO'nun long polling'i) için gerekir. Kopyalar arası yayın için ortak bir kanal gerekir.",
          "A WebSocket already stays on one copy; sticky sessions don't change that. They're needed for libraries that fall back to HTTP (Socket.IO's long polling). Broadcasting across copies takes a shared channel.",
        ),
      },
      title: l("Sticky session neden yetmez", "Why sticky sessions aren't enough"),
      body: [
        l(
          "Sticky session, bir istemcinin isteklerini hep aynı kopyaya gönderir. WebSocket için bu zaten böyle: bağlantı açıldığı kopyada kalır. Dizüstü `:8082`'de, telefon `:8083`'te kalmaya devam eder ve mesajlar yine karşıya geçmez.",
          "A sticky session sends a client's requests to the same copy every time. For a WebSocket that's already the case: the connection stays on the copy where it opened. The laptop stays on `:8082`, the phone on `:8083`, and messages still don't cross over.",
        ),
      ],
    },
    {
      short: l("Redis", "Redis"),
      tag: "how",
      title: l("Redis pub/sub: bir kez yay, her kopya dağıtsın", "Redis pub/sub: publish once, every copy delivers"),
      body: [
        l(
          "Her kopya Redis'te `chat` kanalına abone oldu (`subscribe`). Bir istemci mesaj yazınca kopyası onu kendi istemcilerine değil Redis'e yayıyor (`publish`). Redis mesajı bütün abonelere, yani bütün kopyalara iletiyor; her kopya kendi istemcilerine dağıtıyor. Telefon artık mesajı aldı.",
          "Every copy subscribed to the `chat` channel in Redis. When a client writes, its copy publishes the message to Redis instead of handing it to its own clients. Redis passes it to every subscriber, that is every copy, and each delivers it to its own clients. The phone got the message this time.",
        ),
        l(
          "Dikkat: ioredis'te abone olan bağlantı başka komut çalıştıramaz, bu yüzden `pub` ve `sub` için iki ayrı bağlantı açılır. Mesajı hem yerelde dağıtıp hem yayınlarsan yerel istemciler onu iki kez alır.",
          "Note: in ioredis a subscribed connection can't run other commands, so `pub` and `sub` use two separate connections. If you deliver locally and publish as well, local clients get the message twice.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "npm install ioredis", note: l("Node için yaygın Redis istemcisi.", "A popular Redis client for Node.") },
          { cmd: "redis-cli SUBSCRIBE chat", note: l("Kanalda akanı izle.", "Watch what flows on the channel.") },
        ],
        snippets: [
          {
            label: "Node · ws + ioredis",
            code: 'const pub = new Redis();\nconst sub = new Redis();\nsub.subscribe("chat");\nsub.on("message", (channel, text) => {\n  for (const ws of wss.clients) ws.send(text);\n});\n\nwss.on("connection", (ws) => {\n  ws.on("message", (data) => pub.publish("chat", data.toString()));\n});',
          },
        ],
      },
    },
    {
      short: l("Sınırlar", "Limits"),
      tag: "reality",
      title: l("Pub/sub'ın yapmadıkları", "What pub/sub doesn't do"),
      body: [
        l(
          "Redis pub/sub \"gönder ve unut\"tur: o an abone olmayan, mesajı hiç almaz; geçmiş de tutmaz. Bir kopya yeniden başlarken yayınlanan mesajlar o kopyanın istemcilerine ulaşmaz. Kaçanları geri almak için 13. dersteki sıra numaraları ve kalıcı bir geçmiş gerekir: Redis Streams, Kafka ya da bir veritabanı.",
          "Redis pub/sub is fire-and-forget: whoever isn't subscribed at that moment never gets the message, and it keeps no history. Messages published while a copy restarts never reach that copy's clients. Getting them back takes lesson 13's sequence numbers and a lasting history: Redis Streams, Kafka or a database.",
        ),
        l(
          "Socket.IO'nun Redis adapter'ı bu kalıbı hazır sunar. Kopya sayısı arttıkça her mesaj her kopyaya gider; odaları kanallara bölmek (oda başına bir kanal) yükü azaltır.",
          "Socket.IO's Redis adapter packages this pattern. As copies multiply every message goes to every copy; splitting rooms into channels (a channel per room) cuts the load.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `server.js` iki kopya olarak çalışıyor: `PORT=8082 node server.js` ve `PORT=8083 node server.js`. Redis `:6379`'da. `bots.js` Ayşe'yi `:8082`'ye, Mert'i `:8083`'e bağlar. **4 senaryo** var.",
          "Your turn. `server.js` runs as two copies: `PORT=8082 node server.js` and `PORT=8083 node server.js`. Redis is on `:6379`. `bots.js` connects Ayşe to `:8082` and Mert to `:8083`. There are **4 scenarios**.",
        ),
        l(
          "`pkill -f server.js` iki kopyayı da durdurur; ikisini de yeniden başlat ve botları yeniden bağla. Redis'e `redis-cli PUBLISH chat \"...\"` ile doğrudan yazabilirsin.",
          "`pkill -f server.js` stops both copies; start both again and reconnect the bots. You can write to Redis directly with `redis-cli PUBLISH chat \"...\"`.",
        ),
      ],
    },
  ],
  recap: [
    l("Her kopya sadece kendi istemcilerini bilir; yayın kodu çoğaltınca sessizce bölünür.", "Each copy only knows its own clients; broadcast code silently splits when you add copies."),
    l("Sticky session bunu çözmez: WebSocket zaten tek kopyada kalır.", "Sticky sessions don't fix it: a WebSocket already stays on one copy."),
    l("Redis pub/sub: kopya mesajı yayınlar, her kopya abone olup kendi istemcilerine dağıtır.", "Redis pub/sub: a copy publishes the message, every copy subscribes and delivers to its own clients."),
    l("Hem yerelde dağıtıp hem yayınlamak tekrar yaratır; tek yol bırak.", "Delivering locally and publishing too makes duplicates; keep one path."),
    l("Pub/sub geçmiş tutmaz; kaçanlar için sıra numarası ve kalıcı bir geçmiş gerekir.", "Pub/sub keeps no history; missed messages need sequence numbers and a lasting history."),
  ],
  quiz: [
    {
      question: l("Sunucuyu iki kopyaya çıkardınız. A kopyasındaki kullanıcı B kopyasındakinin mesajını görmüyor. Neden?", "You went to two copies of the server. A user on copy A doesn't see messages from someone on copy B. Why?"),
      options: [
        l("Load balancer bozuk", "The load balancer is broken"),
        l("Her kopyanın wss.clients'ı sadece kendine bağlı olanları içerir", "Each copy's wss.clients only holds those connected to it"),
        l("WebSocket iki sunucuyu desteklemez", "WebSocket doesn't support two servers"),
        l("Redis çalışmıyor", "Redis isn't running"),
      ],
      answer: 1,
      explain: l("Kopyalar ortak bir kanal olmadan birbirinden habersizdir.", "Without a shared channel the copies know nothing of each other."),
      reviewStep: 0,
    },
    {
      question: l("Sticky session neden bu sorunu çözmez?", "Why don't sticky sessions solve this?"),
      options: [
        l("Çok yavaş olduğu için", "It's too slow"),
        l("Sadece her istemciyi bir kopyaya bağlar; kopyalar arası mesaj taşımaz", "It only pins each client to a copy; it carries no messages between copies"),
        l("WebSocket'te çalışmaz", "It doesn't work with WebSocket"),
        l("Çözer", "It does solve it"),
      ],
      answer: 1,
      explain: l("Sorun kopyaların birbirine haber verememesi; sticky bunu değiştirmez.", "The problem is that copies can't tell each other things; sticky doesn't change that."),
      reviewStep: 1,
    },
    {
      question: l("Pub/sub ekledikten sonra aynı kopyadaki kullanıcılar her mesajı iki kez görüyor. Sebep?", "After adding pub/sub, users on the same copy see every message twice. Why?"),
      options: [
        l("Redis mesajı iki kez gönderiyor", "Redis sends the message twice"),
        l("Sunucu mesajı hem yerelde dağıtıyor hem Redis'e yayıyor, sonra Redis'ten bir kez daha alıyor", "The server delivers it locally and publishes it, then gets it from Redis once more"),
        l("İstemci iki kez bağlı", "The client is connected twice"),
        l("ioredis hatası", "An ioredis bug"),
      ],
      answer: 1,
      explain: l("Tek yol bırak: sadece yayınla, Redis'ten geleni dağıt.", "Keep one path: only publish, and deliver what comes from Redis."),
      reviewStep: 2,
    },
    {
      question: l("Bir kopya yeniden başlarken yayınlanan mesajlara ne olur?", "What happens to messages published while a copy restarts?"),
      options: [
        l("Redis saklar ve sonra verir", "Redis keeps them and delivers later"),
        l("O kopyanın istemcileri onları hiç almaz: pub/sub geçmiş tutmaz", "That copy's clients never get them: pub/sub keeps no history"),
        l("Diğer kopyalar iletir", "Other copies forward them"),
        l("Kopya yeniden başlayamaz", "The copy can't restart"),
      ],
      answer: 1,
      explain: l("Kalıcı geçmiş için Redis Streams, Kafka ya da bir veritabanı ve resume gerekir.", "A lasting history needs Redis Streams, Kafka or a database, plus resume."),
      reviewStep: 3,
    },
  ],
};
