import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { BOTS, DOUBLE, LISTEN, REDIS_SERVER, SERVER } from "./code";

const two = [
  { file: "server.js", env: { PORT: "8082" } },
  { file: "server.js", env: { PORT: "8083" } },
];

const start = (server: string, talk = false) =>
  createNet({ redis: true, files: { "server.js": server, "bots.js": BOTS, "listen.js": LISTEN }, running: [...two, { file: "bots.js", env: talk ? { TALK: "1" } : {} }] });

export const FREE = start(SERVER);

/** What one bot (by the port it's on) received, during the scenario. */
const heard = (ctx: WsCtx, port: number) =>
  ctx.state.conns
    .filter((c) => c.client.startsWith("proc:") && c.upstream === port && ctx.state.procs.find((p) => `proc:${p.pid}` === c.client)?.file === "bots.js")
    .flatMap((c) => c.msgs.filter((m) => m.dir === "in" && m.at >= ctx.start.now).map((m) => m.text));

const mine = (ctx: WsCtx) => newConns(ctx).filter((c) => c.client === "you").flatMap((c) => c.msgs.filter((m) => m.dir === "out").map((m) => m.text));

export const scenarios: WsScenario[] = [
  {
    id: "across",
    title: l("Sunucular arası", "Across servers"),
    story: l(
      "Yük artınca sohbet sunucusundan iki kopya çalıştırdınız: `:8082` ve `:8083` (`PORT=8082 node server.js`). Load balancer kullanıcıları ikisine dağıtıyor. Ayşe `:8082`'de, Mert `:8083`'te (`bots.js`). Artık yarı yarıya ayrı iki sohbet var: `:8082`'ye yazılanı Mert görmüyor. Redis çalışıyor (`:6379`).",
      "As load grew you started a second copy of the chat server: `:8082` and `:8083` (`PORT=8082 node server.js`). The load balancer spreads users between them. Ayşe is on `:8082`, Mert on `:8083` (`bots.js`). Now there are, in effect, two separate chats: Mert doesn't see what's written on `:8082`. Redis is running (`:6379`).",
    ),
    goal: l("`:8082`'ye yazdığın mesaj hem Ayşe'ye hem `:8083`'teki Mert'e ulaşsın.", "A message you write on `:8082` reaches both Ayşe and Mert on `:8083`."),
    start: FREE,
    hints: [
      l(
        "Her kopya sadece kendine bağlı olanları bilir. Ortak bir kanal lazım: Redis pub/sub. Mesajı Redis'e `publish` et; her kopya kanala `subscribe` olsun ve Redis'ten geleni kendi istemcilerine dağıtsın.",
        "Each copy only knows who's connected to it. You need a shared channel: Redis pub/sub. `publish` the message to Redis; every copy `subscribe`s to the channel and hands what comes from Redis to its own clients.",
      ),
      l(
        "ioredis'te abone olan bağlantı başka komut çalıştıramaz: `pub` ve `sub` için iki ayrı `new Redis()`. Değişiklikten sonra iki kopyayı ve botları yeniden başlat.",
        "In ioredis a subscribed connection can't run other commands: two separate `new Redis()`, one for `pub` and one for `sub`. After the change, restart both copies and the bots.",
      ),
      l(
        "`nano server.js`, `pkill -f server.js`, `PORT=8082 node server.js &`, `PORT=8083 node server.js &`, `node bots.js &`, `wscat -c ws://localhost:8082 -x hello`",
        "`nano server.js`, `pkill -f server.js`, `PORT=8082 node server.js &`, `PORT=8083 node server.js &`, `node bots.js &`, `wscat -c ws://localhost:8082 -x hello`",
      ),
    ],
    par: 6,
    check: (ctx) => {
      const sent = mine(ctx);
      return sent.length > 0 && sent.some((s) => heard(ctx, 8083).includes(s) && heard(ctx, 8082).includes(s));
    },
  },
  {
    id: "twice",
    title: l("İki kez", "Twice"),
    story: l(
      "Pub/sub eklendi ama artık aynı sunucudaki kullanıcılar her mesajı iki kez görüyor: `:8082`'ye yazılanı Ayşe iki kez alıyor, `:8083`'teki Mert bir kez.",
      "Pub/sub is in, but now users on the same server see every message twice: Ayşe gets what's written on `:8082` twice, while Mert on `:8083` gets it once.",
    ),
    goal: l("`:8082`'ye yazdığın mesaj Ayşe'ye de Mert'e de tam bir kez ulaşsın.", "A message you write on `:8082` reaches Ayşe and Mert exactly once each."),
    start: start(DOUBLE),
    hints: [
      l(
        "Mesaj iki yoldan geliyor: sunucu onu hem kendi istemcilerine hemen dağıtıyor, hem Redis'e yayıyor. Redis'e abone olan bu kopya da onu Redis'ten bir kez daha alıyor.",
        "The message comes two ways: the server hands it to its own clients straight away and also publishes it to Redis, and this same copy, subscribed to Redis, gets it from Redis again.",
      ),
      l("Tek yol bırak: sadece `publish`. Dağıtım her kopyada Redis'ten gelene göre yapılsın.", "Keep one path: only `publish`. Every copy delivers what comes from Redis."),
      l(
        "`nano server.js`, `pkill -f server.js`, `PORT=8082 node server.js &`, `PORT=8083 node server.js &`, `node bots.js &`, `wscat -c ws://localhost:8082 -x hello`",
        "`nano server.js`, `pkill -f server.js`, `PORT=8082 node server.js &`, `PORT=8083 node server.js &`, `node bots.js &`, `wscat -c ws://localhost:8082 -x hello`",
      ),
    ],
    par: 6,
    check: (ctx) => {
      const sent = mine(ctx);
      const count = (port: number, s: string) => heard(ctx, port).filter((m) => m === s).length;
      return sent.length > 0 && sent.every((s) => count(8082, s) === 1 && count(8083, s) === 1);
    },
  },
  {
    id: "third-copy",
    title: l("Üçüncü kopya", "A third copy"),
    story: l(
      "Redis pub/sub kurulu ve iki kopya çalışıyor; Ayşe `:8082`'de 5 sn'de bir yazıyor. Kampanya için bir kopya daha gerekiyor: `:8084`. Kod değişmeden yeni kopyadaki birinin Ayşe'yi duyduğunu göster. `listen.js` bir kopyaya bağlanıp 10 sn duyduğunu yazan bir test istemcisi.",
      "Redis pub/sub is set up and two copies are running; Ayşe on `:8082` writes every 5 s. The campaign needs one more copy: `:8084`. Show, with no code change, that someone on the new copy hears Ayşe. `listen.js` is a test client that connects to one copy and prints what it hears for 10 s.",
    ),
    goal: l("`:8084`'te bir kopya başlat; oraya bağlanan biri Ayşe'nin mesajını duysun.", "Start a copy on `:8084`; someone connected there hears Ayşe's message."),
    start: start(REDIS_SERVER, true),
    hints: [
      l("Kopya sayısı koddan bağımsız: her kopya aynı kanala abone olur.", "The number of copies doesn't depend on the code: every copy subscribes to the same channel."),
      l("`PORT=8084` ile bir kopya daha başlat, sonra `PORT=8084 node listen.js`.", "Start another copy with `PORT=8084`, then `PORT=8084 node listen.js`."),
      l("`PORT=8084 node server.js &`, `PORT=8084 node listen.js`", "`PORT=8084 node server.js &`, `PORT=8084 node listen.js`"),
    ],
    par: 2,
    check: (ctx) => newConns(ctx).some((c) => c.upstream === 8084 && c.msgs.some((m) => m.dir === "in" && m.text.startsWith("ayse:"))),
  },
  {
    id: "announce",
    title: l("Herkese duyuru", "An announcement to all"),
    story: l(
      "Bakım ekibi bir duyuru göndermek istiyor: \"maintenance at 22:00\". Duyuruyu gönderen bir cron işi; WebSocket istemcisi değil, sadece Redis'e erişimi var. Bütün kopyalardaki herkes duyuruyu görmeli.",
      "The ops team wants to send an announcement: \"maintenance at 22:00\". It's sent by a cron job; not a WebSocket client, it only has access to Redis. Everyone on every copy should see it.",
    ),
    goal: l("Duyuru hem `:8082`'deki Ayşe'ye hem `:8083`'teki Mert'e ulaşsın.", "The announcement reaches Ayşe on `:8082` and Mert on `:8083`."),
    start: start(REDIS_SERVER),
    hints: [
      l("Kopyalar Redis'teki `chat` kanalını dinliyor; o kanala kim yazarsa yazsın dağıtırlar.", "The copies listen to the `chat` channel in Redis; they deliver whatever is written there, whoever writes it."),
      l("`redis-cli PUBLISH kanal mesaj`.", "`redis-cli PUBLISH channel message`."),
      l("`redis-cli PUBLISH chat \"maintenance at 22:00\"`", "`redis-cli PUBLISH chat \"maintenance at 22:00\"`"),
    ],
    par: 1,
    check: (ctx) => [8082, 8083].every((p) => heard(ctx, p).some((m) => /maintenance/i.test(m))),
  },
];
