import { l } from "@lets-explain/core/i18n";
import { createNet, latency } from "../../engine/net";
import { newExchanges, type WsCtx, type WsScenario } from "../shared/NetScene";

/* ------------------------------------------------------------ the project */

const HISTORY = [
  { from: "ayse", text: "Morning! Stand-up at 10" },
  { from: "mert", text: "Deploy at 10:30" },
  { from: "zeynep", text: "PR #42 needs a review" },
  { from: "ayse", text: "Looking at it" },
  { from: "mert", text: "Staging is up" },
  { from: "zeynep", text: "Merged, thanks" },
];

/** Free play: the team chat with a few messages and someone writing now and then. */
export const FREE = createNet({
  messages: HISTORY.slice(0, 3),
  planned: [
    { at: 6000, from: "mert", text: "Tests are green" },
    { at: 21000, from: "ayse", text: "Deploy starts" },
    { at: 55000, from: "zeynep", text: "All good on prod" },
  ],
});

/** Did a request made in this scenario carry this message? */
const got = (ctx: WsCtx, id: number) => newExchanges(ctx).some((e) => e.delivered.includes(id));
const emptyNow = (ctx: WsCtx) => newExchanges(ctx).filter((e) => e.empty).length;

/* --------------------------------------------------------------- scenarios */

export const scenarios: WsScenario[] = [
  {
    id: "first-look",
    title: l("İlk bakış", "First look"),
    story: l(
      "Ekibin sohbet uygulamasının arka ucunda çalışmaya başladın. API bu makinede, `localhost:8080`'de çalışıyor. Önce elle bir bakmak istiyorsun: odada şu ana kadar hangi mesajlar var?",
      "You've just started on the back end of the team's chat app. Its API runs on this machine at `localhost:8080`. You want a look by hand first: what messages are in the room so far?",
    ),
    goal: l("Odadaki 3 mesajın hepsini bir istekle al.", "Get all 3 messages in the room with one request."),
    start: createNet({ messages: HISTORY.slice(0, 3) }),
    hints: [
      l("API kendini anlatıyor: `curl localhost:8080` neyin nerede olduğunu yazar.", "The API explains itself: `curl localhost:8080` lists what is where."),
      l("Mesajlar `GET /messages`'ta. `after` vermezsen hepsi gelir.", "Messages are at `GET /messages`. Without `after` you get them all."),
      l("`curl localhost:8080/messages`", "`curl localhost:8080/messages`"),
    ],
    par: 1,
    check: (ctx) => [1, 2, 3].every((id) => got(ctx, id)),
  },
  {
    id: "only-new",
    title: l("Sadece yeniler", "Only the new ones"),
    story: l(
      "Mobil uygulama her yenilemede bütün geçmişi indiriyor; kullanıcılar veri kotasından şikayetçi. Telefonda 1-3 numaralı mesajlar zaten var, sunucuda 5 mesaj var. API, istemcinin elindeki son id'yi verirse sadece ondan sonrakileri dönebiliyor.",
      "The mobile app downloads the whole history on every refresh, and users complain about their data plans. The phone already has messages 1-3; the server has 5. The API can return only what came after the last id the client has, if it is told that id.",
    ),
    goal: l("4 ve 5'i al; 1-3'ü bir daha indirme.", "Get 4 and 5; don't download 1-3 again."),
    start: createNet({ messages: HISTORY.slice(0, 5), seenUpTo: 3 }),
    hints: [
      l("`curl localhost:8080` çıktısında `GET /messages`'ın bir parametresi var.", "In the output of `curl localhost:8080`, `GET /messages` takes a parameter."),
      l("`?after=3`: \"3'ten sonrakiler\". `?` olan URL'yi tırnak içine almak alışkanlık olsun.", "`?after=3`: \"what came after 3\". Get used to quoting a URL that has a `?`."),
      l("`curl 'localhost:8080/messages?after=3'`", "`curl 'localhost:8080/messages?after=3'`"),
    ],
    par: 1,
    check: (ctx) => got(ctx, 4) && got(ctx, 5) && !newExchanges(ctx).some((e) => e.delivered.some((id) => id <= 3)),
  },
  {
    id: "no-empty-polls",
    title: l("Boş istek yok", "No empty requests"),
    story: l(
      "Mert birazdan deploy sonucunu yazacak; ne zaman yazacağını bilmiyorsun. Mesajı geldiği anda görmek istiyorsun ama sunucuyu \"yeni bir şey var mı?\" diye boş isteklerle de yormak istemiyorsun. Elinde 1-5 var.",
      "Mert will post the deploy result soon; you don't know when. You want to see it the moment it arrives, without wearing the server out with empty \"anything new?\" requests. You have 1-5.",
    ),
    goal: l("6 numaralı mesajı en fazla 1 sn gecikmeyle al; en fazla 1 boş cevap.", "Get message 6 at most 1 s after it is written; at most 1 empty answer."),
    start: createNet({ messages: HISTORY.slice(0, 5), seenUpTo: 5, planned: [{ at: 8000, from: "mert", text: "Deploy done, all green" }] }),
    hints: [
      l(
        "Sık sorarsan boş cevaplar birikir, seyrek sorarsan mesaj sunucuda bekler. Sunucunun cevabı mesaj gelene kadar bekletmesini isteyebilirsin.",
        "Ask often and empty answers pile up; ask rarely and the message waits on the server. You can ask the server to hold its answer until a message comes.",
      ),
      l("`wait` parametresi long polling: `?after=5&wait=30`. URL'de `&` var, tırnak şart.", "The `wait` parameter is long polling: `?after=5&wait=30`. The URL has a `&`; quotes are a must."),
      l("`curl 'localhost:8080/messages?after=5&wait=30'`", "`curl 'localhost:8080/messages?after=5&wait=30'`"),
    ],
    par: 1,
    check: (ctx) => {
      const lag = latency(ctx.state, 6);
      return got(ctx, 6) && lag !== null && lag <= 1000 && emptyNow(ctx) <= 1;
    },
  },
  {
    id: "night-shift",
    title: l("Gece nöbeti", "Night shift"),
    story: l(
      "Gece nöbetindesin. Zeynep bir alarm üzerinde çalışıyor ve bitince odaya yazacak, ama ne zaman bilinmez; dakikalar sürebilir. Long poll'un bir üst sınırı var: hiçbir şey gelmezse sunucu bir süre sonra boş döner. Elinde 1-6 var.",
      "You're on the night shift. Zeynep is working on an alert and will post when it's fixed, but nobody knows when; it could take minutes. A long poll has an upper limit: if nothing comes, the server answers empty after a while. You have 1-6.",
    ),
    goal: l("7 numaralı mesajı en fazla 1 sn gecikmeyle al; toplamda en fazla 3 istek.", "Get message 7 at most 1 s after it is written; at most 3 requests in all."),
    start: createNet({ messages: HISTORY, seenUpTo: 6, planned: [{ at: 41_000, from: "zeynep", text: "Alert fixed, back to normal" }] }),
    hints: [
      l(
        "Bu sunucu bir long poll'u en fazla 30 sn tutar. Süre dolarsa `204 No Content` döner: \"bekledim, bir şey olmadı\". `-i` ile durum satırını görürsün.",
        "This server holds a long poll for at most 30 s. When time runs out it answers `204 No Content`: \"I waited, nothing happened\". `-i` shows you the status line.",
      ),
      l("204 gelince hemen yeniden sor. Gerçek istemciler de bunu bir döngüde yapar.", "When the 204 comes, ask again at once. Real clients do exactly that, in a loop."),
      l("`curl -i 'localhost:8080/messages?after=6&wait=30'` (204), sonra aynı komut bir daha", "`curl -i 'localhost:8080/messages?after=6&wait=30'` (204), then the same command again"),
    ],
    par: 2,
    check: (ctx) => {
      const lag = latency(ctx.state, 7);
      return got(ctx, 7) && lag !== null && lag <= 1000 && newExchanges(ctx).length <= 3;
    },
  },
];
