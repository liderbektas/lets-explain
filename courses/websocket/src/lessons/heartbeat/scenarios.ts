import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet } from "../../engine/net";
import { NGINX_CONF } from "../../engine/nginx";
import { newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { CHAT, HEARTBEAT, NGINX_CHAT, PHONE, WATCH } from "./code";

const FILES = { "server.js": CHAT, "watch.js": WATCH, "phone.js": PHONE };

export const FREE = createNet({ nginx: NGINX_CHAT, files: FILES, running: ["server.js"] });

/** How long a connection through nginx has lived (or lived). */
const lived = (ctx: WsCtx) => newConns(ctx).filter((c) => c.via !== null).map((c) => (c.closedAt ?? ctx.state.now) - c.openedAt);
const captured = (ctx: WsCtx) => ctx.state.procs.filter((p) => p.kind === "tshark").reduce((n, p) => n + (p.capture?.count ?? 0), 0);

/** The phone's cable is pulled 90 s in. */
const CUT = 90_000;

export const scenarios: WsScenario[] = [
  {
    id: "ping-fix",
    title: l("Dakikada bir kopuyor", "Cut off every minute"),
    story: l(
      "Kullanıcılar şikayetçi: sohbet açıkken kimse yazmazsa bağlantı tam bir dakikada kopuyor. Sohbet, nginx'in arkasında (`ws://localhost/ws`) `server.js` ile çalışıyor. nginx'e dokunmadan, sunucu tarafında düzeltmek istiyorsun. `watch.js` nginx üzerinden bağlanıp ne zaman koptuğunu yazan küçük bir test istemcisi.",
      "Users complain: with the chat open and nobody writing, the connection drops after exactly one minute. The chat runs as `server.js` behind nginx (`ws://localhost/ws`). You want to fix it on the server side, without touching nginx. `watch.js` is a small test client that connects through nginx and says when it was cut.",
    ),
    goal: l("Sunucu ping göndersin; nginx üzerinden bir bağlantı en az 2 dakika açık kalsın.", "The server sends pings; a connection through nginx stays open for at least 2 minutes."),
    start: FREE,
    hints: [
      l(
        "nginx, sunucu tarafı 60 sn (proxy_read_timeout) hiçbir şey göndermezse bağlantıyı keser. Sunucudan giden her frame bu sayacı sıfırlar; ping de bir frame'dir.",
        "nginx cuts a connection when the server side sends nothing for 60 s (proxy_read_timeout). Every frame from the server resets that timer, and a ping is a frame.",
      ),
      l(
        "`setInterval` ile 30 sn'de bir `wss.clients` içindeki herkese `ws.ping()`. Kodu değiştirince sunucuyu yeniden başlat, `node watch.js &` ile bağlan ve `sleep 120` ile bekle.",
        "`setInterval` every 30 s: `ws.ping()` to everyone in `wss.clients`. After the change restart the server, connect with `node watch.js &` and wait with `sleep 120`.",
      ),
      l(
        "`nano server.js` (`setInterval(() => { for (const ws of wss.clients) ws.ping(); }, 30000);`), `pkill -f server.js`, `node server.js &`, `node watch.js &`, `sleep 120`",
        "`nano server.js` (`setInterval(() => { for (const ws of wss.clients) ws.ping(); }, 30000);`), `pkill -f server.js`, `node server.js &`, `node watch.js &`, `sleep 120`",
      ),
    ],
    par: 5,
    check: (ctx) => newConns(ctx).some((c) => c.via !== null && (c.closedAt ?? ctx.state.now) - c.openedAt >= 119_000 && c.frames.some((f) => f.opcode === OP.ping)),
  },
  {
    id: "dead-phones",
    title: l("Hayalet bağlantılar", "Ghost connections"),
    story: l(
      "Sunucunun \"çevrimiçi\" sayısı hep şişik. Sebebi: metroya giren telefonların bağlantısı sessizce ölüyor, sunucu bunu hiç anlamıyor. Telefon olarak `phone.js` çalışıyor (koparsa kendisi yeniden bağlanır) ve 90. saniyede tüneline girecek. Sunucu ölü bağlantıyı en geç 70 sn içinde bırakmalı.",
      "The server's \"online\" count is always too high. The reason: phones that go into the subway lose their connection silently, and the server never notices. `phone.js` plays the phone (it reconnects whenever it is cut) and goes into a tunnel at 90 seconds. The server should let go of the dead connection within 70 s.",
    ),
    goal: l("Telefonun ağı gittikten sonra sunucu bağlantısını en geç 70 sn içinde kapatsın.", "Once the phone's network is gone, the server closes its connection within 70 s."),
    start: createNet({ files: { ...FILES }, running: ["server.js", "phone.js"], netPlan: [{ at: CUT, client: "proc:4243", down: true }] }),
    hints: [
      l(
        "Ağı giden telefon hiçbir şey göndermez, bağlantıyı da kapatamaz. Sunucu ancak bir şey bekleyip gelmediğini görürse anlar: ping gönderip pong beklemek.",
        "A phone whose network is gone sends nothing and cannot close anything. The server only finds out if it expects something that never comes: send a ping, wait for the pong.",
      ),
      l(
        "ws belgelerindeki kalıp: bağlanınca `ws.isAlive = true`, `pong` gelince yine `true`. 30 sn'de bir: `isAlive` hâlâ `false` olanı `ws.terminate()`, diğerlerini `false` yapıp `ws.ping()`.",
        "The pattern from the ws docs: `ws.isAlive = true` on connect, `true` again on each `pong`. Every 30 s: `ws.terminate()` whoever still has `isAlive === false`; set the rest to `false` and `ws.ping()`.",
      ),
      l("`nano server.js` (heartbeat), `pkill -f server.js`, `node server.js &`, `sleep 160`", "`nano server.js` (heartbeat), `pkill -f server.js`, `node server.js &`, `sleep 160`"),
    ],
    par: 4,
    check: (ctx) =>
      ctx.state.conns.some((c) => c.client === "proc:4243" && c.closedAt === null && c.serverCode === 1006 && c.serverClosedAt !== null && c.serverClosedAt >= CUT && c.serverClosedAt <= CUT + 70_000),
  },
  {
    id: "see-heartbeat",
    title: l("Kalp atışını gör", "See the heartbeat"),
    story: l(
      "Heartbeat'li sunucu çalışıyor ve `watch.js` nginx üzerinden bağlı. Yeni gelen bir ekip arkadaşına ping ve pong'un kabloda gerçekten gidip geldiğini göstermek istiyorsun.",
      "The server with the heartbeat is running and `watch.js` is connected through nginx. You want to show a new teammate that pings and pongs really go back and forth on the wire.",
    ),
    goal: l("tshark çalışırken bir ping ve onun pong'u yakalansın.", "While tshark runs, a ping and its pong are captured."),
    start: createNet({ nginx: NGINX_CHAT, files: { ...FILES, "server.js": HEARTBEAT }, running: ["server.js", "watch.js"] }),
    hints: [
      l("Sunucu 30 sn'de bir ping atıyor; tshark'ı başlatıp bir süre beklemen gerekecek.", "The server pings every 30 s; you'll need to start tshark and wait a while."),
      l("tshark'ı `&` ile arka planda başlat, sonra `sleep 35`.", "Start tshark in the background with `&`, then `sleep 35`."),
      l("`sudo tshark -i lo -Y websocket &`, `sleep 35`", "`sudo tshark -i lo -Y websocket &`, `sleep 35`"),
    ],
    par: 2,
    check: (ctx) => {
      if (captured(ctx) < 2) return false;
      const t0 = Math.min(...ctx.state.procs.filter((p) => p.kind === "tshark").map((p) => p.startedAt));
      const frames = ctx.state.conns.flatMap((c) => c.frames.filter((f) => f.at >= t0));
      return frames.some((f) => f.opcode === OP.ping) && frames.some((f) => f.opcode === OP.pong);
    },
  },
  {
    id: "longer-timeout",
    title: l("nginx'te süreyi uzat", "Raise the timeout in nginx"),
    story: l(
      "Sunucu kodunu bu hafta değiştiremiyorsun (dondurulmuş sürüm), ama dakikada bir kopma acil. Geçici çözüm nginx'te: `/etc/nginx/conf.d/chat.conf`'ta `/ws` için bekleme süresini uzat.",
      "You can't change the server code this week (a frozen release), but the one-minute cut-off is urgent. The stopgap is in nginx: raise the waiting time for `/ws` in `/etc/nginx/conf.d/chat.conf`.",
    ),
    goal: l("`/ws`'nin proxy_read_timeout'u en az 5 dakika olsun; nginx üzerinden bir bağlantı 2 dakika açık kalsın.", "`/ws` gets a proxy_read_timeout of at least 5 minutes; a connection through nginx stays open for 2 minutes."),
    start: FREE,
    hints: [
      l(
        "`location /ws` bloğuna `proxy_read_timeout 1h;` ekle. /etc altındaki dosyayı `sudo nano` ile açman gerekir.",
        "Add `proxy_read_timeout 1h;` to the `location /ws` block. A file under /etc needs `sudo nano`.",
      ),
      l(
        "nginx yeni ayarı ancak yeniden yüklenince kullanır: `sudo nginx -s reload` (öncesinde `sudo nginx -t` ile denetlemek iyi alışkanlık). Sonra `node watch.js &` ve `sleep 120`.",
        "nginx only uses a new setting after a reload: `sudo nginx -s reload` (checking with `sudo nginx -t` first is a good habit). Then `node watch.js &` and `sleep 120`.",
      ),
      l(
        "`sudo nano /etc/nginx/conf.d/chat.conf` (`proxy_read_timeout 1h;`), `sudo nginx -s reload`, `node watch.js &`, `sleep 120`",
        "`sudo nano /etc/nginx/conf.d/chat.conf` (`proxy_read_timeout 1h;`), `sudo nginx -s reload`, `node watch.js &`, `sleep 120`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const loc = ctx.state.nginx?.conf.locations.find((x) => x.path === "/ws");
      return Boolean(loc && loc.readTimeout >= 300_000) && lived(ctx).some((ms) => ms >= 119_000) && ctx.state.files[NGINX_CONF] !== NGINX_CHAT;
    },
  },
];
