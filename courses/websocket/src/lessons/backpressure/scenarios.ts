import { l } from "@lets-explain/core/i18n";
import { bufferedNow, createNet, type NetAction } from "../../engine/net";
import { logsOf, type WsCtx, type WsScenario } from "../shared/NetScene";
import { remote } from "../shared/sockets";
import { BOARD } from "./code";

/** A fast laptop and a phone on a weak signal that reads 8 KB a second; both reconnect when cut. */
export const clients: NetAction[] = [
  remote("laptop", 9001, "/?name=laptop", { reconnect: 1000 }),
  remote("phone", 9001, "/?name=phone", { readRate: 8 * 1024, reconnect: 1000 }),
];

export const FREE = createNet({ files: { "board.js": BOARD }, running: ["board.js"], actions: clients });

const got = (ctx: WsCtx, client: string) => ctx.state.conns.filter((c) => c.client === client).reduce((n, c) => n + c.msgs.filter((m) => m.dir === "in" && m.at >= ctx.start.now).length, 0);
/** The board server the reader started (not the one the scenario began with). */
const restarted = (ctx: WsCtx) => ctx.state.procs.some((p) => p.file === "board.js" && p.alive && p.startedAt >= ctx.start.now && p.pid !== 4242);
const ranFor = (ctx: WsCtx, ms: number) => ctx.state.now - ctx.start.now >= ms;

export const scenarios: WsScenario[] = [
  {
    id: "find-the-slow-one",
    title: l("Bellek neden şişiyor?", "Why is memory growing?"),
    story: l(
      "Canlı pano sunucusunun (`board.js`) belleği her dakika biraz daha büyüyor. Sunucu 10 sn'de bir, her istemci için \"gönderilmeyi bekleyen\" bayt miktarını loga yazıyor. Yarım dakika izle ve hangi istemcinin geride kaldığını gör.",
      "The live board server's (`board.js`) memory grows a little every minute. Every 10 s the server logs how many bytes are waiting to go out to each client. Watch for half a minute and see which client is falling behind.",
    ),
    goal: l("Sunucunun logunda bir istemci için 100 KB'tan fazla bekleyen veri görünsün.", "The server's log shows a client with more than 100 KB waiting."),
    start: FREE,
    hints: [
      l("Sunucu zaten çalışıyor ve logları bu terminale düşüyor; zamanın geçmesi yeter.", "The server is already running and its logs come out in this terminal; you only need time to pass."),
      l("`sleep 30` ve loglara bak.", "`sleep 30` and look at the logs."),
      l("`sleep 30`", "`sleep 30`"),
    ],
    par: 1,
    check: (ctx) => logsOf(ctx).some((t) => {
      const m = /: (\d+) KB waiting$/.exec(t);
      return Boolean(m && Number(m[1]) > 100);
    }),
  },
  {
    id: "skip-when-full",
    title: l("Yetişemeyene atla", "Skip the one who can't keep up"),
    story: l(
      "Telefon zayıf bir bağlantıda saniyede ancak 8 KB okuyabiliyor; sunucu ise saniyede 32 KB'lık bir pano gönderiyor. Aradaki fark sunucunun belleğinde birikiyor. Telefonun her panoyu alması gerekmiyor, en yenisi yeter. Kuyruğu dolu olan istemciye o turda gönderme.",
      "The phone, on a weak signal, can read only 8 KB a second; the server sends a 32 KB board every second. The difference piles up in the server's memory. The phone doesn't need every board, the newest is enough. Don't send to a client whose queue is already full that round.",
    ),
    goal: l("Bir dakika boyunca sunucuda bekleyen veri 300 KB'ı geçmesin; dizüstü yine her panoyu alsın.", "For one minute, no more than 300 KB waits on the server, and the laptop still gets every board."),
    start: FREE,
    hints: [
      l(
        "`ws.bufferedAmount`, `send` ile kabul edilmiş ama henüz gönderilememiş bayt sayısı. Büyükse istemci yetişemiyor demektir.",
        "`ws.bufferedAmount` is the number of bytes `send` accepted but couldn't send yet. When it's large, the client can't keep up.",
      ),
      l(
        "Gönderme döngüsünde: `if (ws.bufferedAmount > 256 * 1024) continue;`. Sunucuyu yeniden başlat ve bir dakika bekle; istemciler kendileri yeniden bağlanır.",
        "In the sending loop: `if (ws.bufferedAmount > 256 * 1024) continue;`. Restart the server and wait a minute; the clients reconnect by themselves.",
      ),
      l("`nano board.js`, `pkill -f board.js`, `node board.js &`, `sleep 60`", "`nano board.js`, `pkill -f board.js`, `node board.js &`, `sleep 60`"),
    ],
    par: 4,
    check: (ctx) => restarted(ctx) && ranFor(ctx, 60_000) && bufferedNow(ctx.state) <= 300 * 1024 && got(ctx, "laptop") >= 55 && ctx.state.conns.some((c) => c.client === "phone" && c.closedAt === null),
  },
  {
    id: "drop-slow",
    title: l("Çok gerideyse bırak", "Let go when too far behind"),
    story: l(
      "Bu panoda her güncelleme önemli; atlamak yerine, çok geride kalan istemcinin bağlantısını kesmeye karar verdiniz. Uygulama yeniden bağlanınca baştan, güncel panoyla başlar. 1 MB'tan fazla geride kalanı bırak.",
      "On this board every update matters, so instead of skipping you decided to cut off a client that falls too far behind. When its app reconnects it starts fresh with the current board. Let go of anyone more than 1 MB behind.",
    ),
    goal: l("1 MB'tan fazla geride kalan istemci sunucu tarafından kesilsin; bekleyen veri 1,2 MB'ı geçmesin.", "A client more than 1 MB behind gets cut off by the server; no more than 1.2 MB ever waits."),
    start: FREE,
    hints: [
      l(
        "Geride kalanı kapatmak için `close()` değil `terminate()`: kapanış frame'i de o kuyruğun arkasında bekler.",
        "To cut off a client that's behind, use `terminate()`, not `close()`: a close frame would wait at the back of the same queue.",
      ),
      l(
        "`if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); continue; }`, sunucuyu yeniden başlat, `sleep 90`.",
        "`if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); continue; }`, restart the server, `sleep 90`.",
      ),
      l("`nano board.js`, `pkill -f board.js`, `node board.js &`, `sleep 90`", "`nano board.js`, `pkill -f board.js`, `node board.js &`, `sleep 90`"),
    ],
    par: 4,
    check: (ctx) =>
      restarted(ctx) &&
      ranFor(ctx, 60_000) &&
      bufferedNow(ctx.state) <= 1.2 * 1024 * 1024 &&
      ctx.state.conns.some((c) => c.client === "phone" && c.serverCode === 1006 && c.serverClosedAt !== null && c.serverClosedAt > ctx.start.now && c.server !== "proc:4242"),
  },
];
