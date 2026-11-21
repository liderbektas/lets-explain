import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import type { WsCtx, WsScenario } from "../shared/NetScene";
import { CHAT, CHAT_EXPIRED, TAB_EXPO, TAB_FIXED, TAB_JITTER, TAB_NONE } from "./code";

const tabs = (n: number): { file: string; env: Record<string, string> }[] => Array.from({ length: n }, (_, i) => ({ file: "tab.js", env: { TAB: String(i + 1) } }));

export const FREE = createNet({ files: { "chat.js": CHAT, "tab.js": TAB_FIXED }, running: ["chat.js", ...tabs(5)] });

/** When the reader last started the chat server. */
const serverStart = (ctx: WsCtx) => ctx.state.procs.filter((p) => p.file === "chat.js" && p.alive).at(-1)?.startedAt ?? null;
const tabProcs = (ctx: WsCtx) => ctx.state.procs.filter((p) => p.file === "tab.js" && p.alive);
/** Every live tab has an open connection to the running server, opened after it started. */
const allBack = (ctx: WsCtx, n: number, within: number) => {
  const t0 = serverStart(ctx);
  if (t0 === null || t0 < ctx.start.now) return false;
  const live = tabProcs(ctx);
  if (live.length < n) return false;
  return live.every((p) => ctx.state.conns.some((c) => c.client === `proc:${p.pid}` && c.closedAt === null && c.openedAt >= t0 && c.openedAt <= t0 + within));
};
/** Handshakes the tabs tried since the server last started. */
const attempts = (ctx: WsCtx) => {
  const t0 = serverStart(ctx) ?? 0;
  return ctx.state.exchanges.filter((e) => e.client.startsWith("proc:") && e.kind === "upgrade" && e.sentAt >= t0).length;
};

export const scenarios: WsScenario[] = [
  {
    id: "come-back",
    title: l("Geri gel", "Come back"),
    story: l(
      "Her deploy'da sunucu yeniden başlıyor ve açık sekmeler \"bağlantı koptu\" deyip öylece kalıyor; kullanıcı sayfayı yenilemek zorunda. `tab.js` bir sekmenin istemci kodu: koparsa bir saniye sonra yeniden bağlansın. Sonra yeni kodla 5 sekme aç ve bir deploy yap.",
      "On every deploy the server restarts, and open tabs say \"disconnected\" and stay that way; users have to reload the page. `tab.js` is a tab's client code: when cut, it should reconnect a second later. Then open 5 tabs with the new code and do a deploy.",
    ),
    goal: l("Sunucu yeniden başladıktan sonra 5 sekmenin hepsi 10 sn içinde yeniden bağlansın.", "After the server restarts, all 5 tabs reconnect within 10 s."),
    start: createNet({ files: { "chat.js": CHAT, "tab.js": TAB_NONE }, running: ["chat.js"] }),
    hints: [
      l(
        "Tarayıcının `WebSocket`'i kendisi yeniden bağlanmaz. `close` olayında `setTimeout(connect, 1000)`.",
        "The browser's `WebSocket` doesn't reconnect by itself. In the `close` event: `setTimeout(connect, 1000)`.",
      ),
      l(
        "5 sekme: `for i in $(seq 1 5); do TAB=$i node tab.js & done`. Deploy: `pkill -f chat.js` ve `node chat.js &`. Sonra `sleep 10`.",
        "5 tabs: `for i in $(seq 1 5); do TAB=$i node tab.js & done`. Deploy: `pkill -f chat.js` and `node chat.js &`. Then `sleep 10`.",
      ),
      l(
        "`nano tab.js` (`setTimeout(connect, 1000);`), `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `pkill -f chat.js`, `node chat.js &`, `sleep 10`",
        "`nano tab.js` (`setTimeout(connect, 1000);`), `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `pkill -f chat.js`, `node chat.js &`, `sleep 10`",
      ),
    ],
    par: 5,
    check: (ctx) => allBack(ctx, 5, 10_000),
  },
  {
    id: "stampede",
    title: l("Sürü", "The stampede"),
    story: l(
      "30 sekme açık ve hepsi koparsa tam 1 saniye sonra yeniden deniyor. Sunucu saniyede ancak 5 yeni bağlantı kurabiliyor, fazlasına 503 diyor; bir saniyede 10'dan fazla deneme gelirse bir sonraki saniye hiç kuramıyor. Her deploy'da 30 sekme aynı anda saldırıyor ve sunucu bir daha toparlanamıyor. Yeniden denemeleri zamana yay.",
      "30 tabs are open, and each retries exactly 1 second after a drop. The server can set up only 5 new connections a second and says 503 to the rest; after a second with more than 10 attempts it can set up none in the next. On every deploy all 30 rush in at once and the server never recovers. Spread the retries out over time.",
    ),
    goal: l("Deploy'dan sonra 30 sekmenin hepsi 40 sn içinde geri gelsin; toplam deneme 200'ü geçmesin.", "After the deploy, all 30 tabs are back within 40 s, with no more than 200 attempts in all."),
    start: createNet({ files: { "chat.js": CHAT, "tab.js": TAB_FIXED }, running: ["chat.js", ...tabs(30)] }),
    hints: [
      l(
        "Aynı anda kopan herkes aynı aralıkla beklerse hep birlikte geri gelir. Her sekme farklı bir süre beklemeli: rastgelelik (jitter).",
        "If everyone who dropped together waits the same time, they all come back together. Each tab has to wait a different time: randomness (jitter).",
      ),
      l(
        "Yaygın kalıp \"full jitter\": `Math.random() * Math.min(30000, 1000 * 2 ** attempt)`; her başarısız denemede `attempt` bir artar, bağlanınca sıfırlanır. Sekmelerin yeni kodu alması için onları yeniden başlat.",
        "The common pattern is \"full jitter\": `Math.random() * Math.min(30000, 1000 * 2 ** attempt)`; `attempt` goes up after each failed try and back to zero on connect. Restart the tabs so they get the new code.",
      ),
      l(
        "`nano tab.js` (jitter ve backoff), `pkill -f tab.js`, `for i in $(seq 1 30); do TAB=$i node tab.js & done`, `pkill -f chat.js`, `node chat.js &`, `sleep 40`",
        "`nano tab.js` (jitter and backoff), `pkill -f tab.js`, `for i in $(seq 1 30); do TAB=$i node tab.js & done`, `pkill -f chat.js`, `node chat.js &`, `sleep 40`",
      ),
    ],
    par: 6,
    check: (ctx) => allBack(ctx, 30, 40_000) && attempts(ctx) <= 200,
  },
  {
    id: "ceiling",
    title: l("Bekleme tavanı", "A ceiling on the wait"),
    story: l(
      "Sekmeler üstel backoff kullanıyor: 1, 2, 4, 8... saniye. Geçen hafta sunucu 5 dakika kapalı kaldı ve geri geldiğinde sekmeler bir sonraki denemelerine 4 dakikadan fazla daha bekledi. Bekleme süresine bir tavan koy: en fazla 30 sn.",
      "The tabs use exponential backoff: 1, 2, 4, 8... seconds. Last week the server was down for 5 minutes, and when it came back the tabs waited more than 4 more minutes before their next try. Put a ceiling on the wait: 30 s at most.",
    ),
    goal: l("Sunucu 5 dakika kapalı kaldıktan sonra açılınca 5 sekme 35 sn içinde geri gelsin.", "When the server comes back after 5 minutes down, all 5 tabs return within 35 s."),
    start: createNet({ files: { "chat.js": CHAT, "tab.js": TAB_EXPO }, running: tabs(5) }),
    hints: [
      l("`1000 * 2 ** attempt` 9. denemede 256 sn olur. `Math.min(30000, ...)` ile 30 sn'de durdur.", "`1000 * 2 ** attempt` is 256 s by the 9th try. Stop it at 30 s with `Math.min(30000, ...)`."),
      l(
        "Sekmeleri yeni kodla yeniden başlat, sunucu kapalıyken 5 dakika bekle (`sleep 300`), sonra sunucuyu başlat ve `sleep 35`.",
        "Restart the tabs with the new code, wait 5 minutes with the server down (`sleep 300`), then start the server and `sleep 35`.",
      ),
      l(
        "`nano tab.js` (`Math.min(30000, 1000 * 2 ** attempt)`), `pkill -f tab.js`, `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `sleep 300`, `node chat.js &`, `sleep 35`",
        "`nano tab.js` (`Math.min(30000, 1000 * 2 ** attempt)`), `pkill -f tab.js`, `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `sleep 300`, `node chat.js &`, `sleep 35`",
      ),
    ],
    par: 6,
    check: (ctx) => {
      const t0 = serverStart(ctx);
      return t0 !== null && t0 - ctx.start.now >= 290_000 && allBack(ctx, 5, 35_000);
    },
  },
  {
    id: "know-when-to-stop",
    title: l("Ne zaman vazgeçmeli", "Know when to stop"),
    story: l(
      "3 numaralı sekmenin oturumunun süresi dolmuş: sunucu onu `4001 session expired` ile kapatıyor. Sekme ise hiçbir şey olmamış gibi her saniye yeniden bağlanıp sunucuyu boşuna yoruyor. 4001'i görünce yeniden bağlanmayı bırakıp kullanıcıdan yeniden giriş istemeli.",
      "Tab 3's session has expired: the server closes it with `4001 session expired`. The tab reconnects every second as if nothing happened, wearing the server out for nothing. On seeing 4001 it should stop reconnecting and ask the user to log in again.",
    ),
    goal: l("3. sekme 4001'den sonra yeniden denemesin; diğer sekmeler bağlı kalsın.", "Tab 3 stops retrying after 4001; the other tabs stay connected."),
    start: createNet({ files: { "chat.js": CHAT_EXPIRED, "tab.js": TAB_JITTER }, running: ["chat.js", ...tabs(5)] }),
    hints: [
      l(
        "Her kapanış aynı değil. `close` olayının ilk parametresi kod: 1006 ya da 1001 \"tekrar dene\" demek, 4001 ise \"bu böyle düzelmez\".",
        "Not every close is the same. The `close` event's first parameter is the code: 1006 or 1001 means \"try again\", 4001 means \"this won't fix itself\".",
      ),
      l("`close` olayının başında: `if (code === 4001) return console.log(...)`. Sekmeleri yeniden başlat ve bir süre bekle.", "At the start of the `close` handler: `if (code === 4001) return console.log(...)`. Restart the tabs and wait a while."),
      l(
        "`nano tab.js`, `pkill -f tab.js`, `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `sleep 30`",
        "`nano tab.js`, `pkill -f tab.js`, `for i in $(seq 1 5); do TAB=$i node tab.js & done`, `sleep 30`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const fresh = (pid: number) => !ctx.start.procs.some((sp) => sp.pid === pid);
      const t3 = ctx.state.procs.filter((p) => p.file === "tab.js" && p.env.TAB === "3" && fresh(p.pid)).map((p) => `proc:${p.pid}`);
      const expired = ctx.state.conns.filter((c) => t3.includes(c.client) && c.closeCode === 4001);
      if (!expired.length) return false;
      // After its first 4001 the tab never tries again (503s before that are fine to retry).
      const stoppedAt = Math.min(...expired.map((c) => c.closedAt!));
      const retried = ctx.state.exchanges.some((e) => t3.includes(e.client) && e.kind === "upgrade" && e.sentAt > stoppedAt);
      const others = ctx.state.procs.filter((p) => p.file === "tab.js" && p.env.TAB !== "3" && p.alive && fresh(p.pid));
      const othersUp = others.length >= 4 && others.every((p) => ctx.state.conns.some((c) => c.client === `proc:${p.pid}` && c.closedAt === null));
      return ctx.state.now - ctx.start.now >= 20_000 && !retried && othersUp;
    },
  },
];

export const startTabs = (n: number, file = "tab.js"): NetAction[] => tabs(n).map((t) => ({ type: "node", file, env: t.env }));
