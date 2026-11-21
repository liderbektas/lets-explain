import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, type WsScenario } from "../shared/NetScene";
import { BOTS, SERVER } from "./code";

const FILES = { "server.js": SERVER, "bots.js": BOTS };

export const FREE = createNet({ files: FILES, running: ["server.js"] });

const mine = (ctx: Parameters<WsScenario["check"]>[0]) => newConns(ctx).filter((c) => c.client === "you" && c.server.startsWith("proc:"));

export const scenarios: WsScenario[] = [
  {
    id: "run-it",
    title: l("Çalıştır ve dene", "Run it and try it"),
    story: l(
      "Takım arkadaşın ilk WebSocket sunucusunu yazmış: `server.js`, şimdilik her mesajı gönderene geri yolluyor. Çalıştır ve gerçekten cevap verdiğini kendi gözünle gör.",
      "A teammate wrote a first WebSocket server: `server.js`, which for now sends each message back to its sender. Run it and see with your own eyes that it really answers.",
    ),
    goal: l("Sunucuyu başlat, bir mesaj gönder ve cevabını al.", "Start the server, send a message and get the answer."),
    start: createNet({ files: FILES }),
    hints: [
      l("Sunucu terminali tutmasın diye `&` ile arka planda başlat.", "Start the server in the background with `&` so it doesn't hold the terminal."),
      l("Sonra `wscat -c ws://localhost:9001 -x merhaba`.", "Then `wscat -c ws://localhost:9001 -x hello`."),
      l("`node server.js &`, `wscat -c ws://localhost:9001 -x merhaba`", "`node server.js &`, `wscat -c ws://localhost:9001 -x hello`"),
    ],
    par: 2,
    check: (ctx) => mine(ctx).some((c) => c.msgs.some((m) => m.dir === "in" && m.text.startsWith("echo:"))),
  },
  {
    id: "welcome",
    title: l("Hoş geldin mesajı", "A welcome message"),
    story: l(
      "Kullanıcılar bağlanınca hiçbir şey görmüyor ve bağlantının çalışıp çalışmadığını anlamıyor. Sunucu her yeni istemciye, o daha bir şey yazmadan bir karşılama mesajı göndersin.",
      "Users see nothing when they connect, and can't tell whether the connection works. The server should greet every new client before it writes anything.",
    ),
    goal: l("Bağlanan istemcinin aldığı ilk mesaj sunucunun karşılaması olsun.", "The first message a connecting client gets is the server's greeting."),
    start: FREE,
    hints: [
      l(
        "Yeni bir istemci `connection` olayıyla gelir ve `ws` tam da o istemcinin bağlantısıdır. Orada `ws.send(...)`.",
        "A new client arrives with the `connection` event, and `ws` is that very client's connection. Call `ws.send(...)` there.",
      ),
      l("Kodu değiştirdikten sonra sunucuyu yeniden başlat ve `wscat -c ws://localhost:9001` ile bağlan.", "After the change restart the server and connect with `wscat -c ws://localhost:9001`."),
      l(
        "`nano server.js` (`ws.send(\"welcome to the chat\");`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001`",
        "`nano server.js` (`ws.send(\"welcome to the chat\");`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001`",
      ),
    ],
    par: 4,
    check: (ctx) => mine(ctx).some((c) => c.msgs[0]?.dir === "in" && !c.msgs[0].text.startsWith("echo:")),
  },
  {
    id: "broadcast",
    title: l("Herkese duyur", "Tell everyone"),
    story: l(
      "Bu bir sohbet, ama mesajlar sadece yazana geri dönüyor; Ayşe ve Mert hiçbir şey görmüyor. İkisinin istemcisi `bots.js` içinde: bağlanıp gelen her şeyi ekrana yazıyorlar. Bir mesaj bağlı herkese gitmeli.",
      "This is a chat, but messages only go back to whoever wrote them; Ayşe and Mert see nothing. Their clients are in `bots.js`: they connect and print whatever reaches them. A message should go to everyone connected.",
    ),
    goal: l("Senin gönderdiğin bir mesaj Ayşe'ye ve Mert'e ulaşsın.", "A message you send reaches Ayşe and Mert."),
    start: FREE,
    hints: [
      l(
        "`wss.clients` sunucuya bağlı herkesin listesi (bir Set). Mesaj gelince hepsine `client.send(...)`. Kapanmakta olan birine göndermemek için `client.readyState === WebSocket.OPEN` kontrolü yaygındır.",
        "`wss.clients` is everyone connected to the server (a Set). When a message comes, `client.send(...)` to each. Checking `client.readyState === WebSocket.OPEN` first is common, to skip one that is closing.",
      ),
      l(
        "Sunucuyu yeniden başlatınca botların bağlantısı da kopar: sunucudan sonra `node bots.js &` ile onları yeniden başlat, sonra mesajını gönder.",
        "Restarting the server cuts the bots' connections too: start them again with `node bots.js &` after the server, then send your message.",
      ),
      l(
        "`nano server.js` (`for (const client of wss.clients) client.send(data.toString());`), `pkill -f server.js`, `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001 -x merhaba`",
        "`nano server.js` (`for (const client of wss.clients) client.send(data.toString());`), `pkill -f server.js`, `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001 -x hello`",
      ),
    ],
    par: 5,
    check: (ctx) => {
      const sent = mine(ctx).flatMap((c) => c.msgs.filter((m) => m.dir === "out").map((m) => m.text));
      const bots = newConns(ctx).filter((c) => c.client.startsWith("proc:"));
      return sent.length > 0 && bots.length >= 2 && bots.every((b) => b.msgs.some((m) => m.dir === "in" && sent.some((s) => m.text.includes(s))));
    },
  },
  {
    id: "online-count",
    title: l("Kaç kişi çevrimiçi?", "How many are online?"),
    story: l(
      "Arayüz, başlıkta \"3 kişi çevrimiçi\" yazmak istiyor. Biri bağlandığında ya da ayrıldığında sunucu herkese güncel sayıyı şu biçimde göndermeli: `{\"type\":\"online\",\"count\":3}`.",
      "The UI wants to show \"3 online\" in its header. Whenever someone connects or leaves, the server should send everyone the current count in this shape: `{\"type\":\"online\",\"count\":3}`.",
    ),
    goal: l("Bağlanınca `{\"type\":\"online\",\"count\":N}` al; N gerçekten bağlı olan sayısı olsun.", "On connecting, get `{\"type\":\"online\",\"count\":N}`, with N the number really connected."),
    start: FREE,
    hints: [
      l("Sayı `wss.clients.size`. Bunu JSON'a çevirip herkese gönderen küçük bir fonksiyon yaz.", "The number is `wss.clients.size`. Write a small function that turns it into JSON and sends it to everyone."),
      l("Fonksiyonu iki yerden çağır: `connection` olayında ve o istemcinin `close` olayında.", "Call it from two places: the `connection` event, and that client's `close` event."),
      l(
        "`nano server.js` (`announce()`), `pkill -f server.js`, `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001`",
        "`nano server.js` (`announce()`), `pkill -f server.js`, `node server.js &`, `node bots.js &`, `wscat -c ws://localhost:9001`",
      ),
    ],
    par: 5,
    check: (ctx) =>
      mine(ctx).some((c) =>
        c.msgs.some((m) => {
          if (m.dir !== "in") return false;
          try {
            const v = JSON.parse(m.text) as { type?: string; count?: number };
            const open = ctx.state.conns.filter((x) => x.server === c.server && x.openedAt <= m.at && (x.serverClosedAt === null || x.serverClosedAt > m.at)).length;
            return v.type === "online" && v.count === open && open >= 2;
          } catch {
            return false;
          }
        }),
      ),
  },
];
