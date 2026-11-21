import { l } from "@lets-explain/core/i18n";
import { createNet, type Net } from "../../engine/net";
import type { WsCtx, WsScenario } from "../shared/NetScene";
import { READER, READER_RESUME, SERVER, SERVER_NO_HISTORY, SERVER_OFF_BY_ONE } from "./code";

/** The reader's Wi-Fi drops from 10 s to 45 s into the scenario. */
const blip = [
  { at: 10_000, port: 9001, down: true },
  { at: 45_000, port: 9001, down: false },
];

const start = (server: string, reader: string, running = ["server.js", "reader.js"]) =>
  createNet({ files: { "server.js": server, "reader.js": reader }, running, netPlan: blip });

export const FREE = createNet({ files: { "server.js": SERVER, "reader.js": READER }, running: ["server.js", "reader.js"] });

const seqsOf = (net: Net, pid: number) =>
  net.conns
    .filter((c) => c.client === `proc:${pid}`)
    .flatMap((c) => c.msgs.filter((m) => m.dir === "in"))
    .map((m) => {
      try {
        return (JSON.parse(m.text) as { seq?: number }).seq ?? null;
      } catch {
        return null;
      }
    })
    .filter((s): s is number => s !== null);

const readers = (ctx: WsCtx) => ctx.state.procs.filter((p) => p.file === "reader.js" && !ctx.start.procs.some((s) => s.pid === p.pid));

/** The reader that ran through the blip got every line, 1 to the last, once each. */
const complete = (ctx: WsCtx, once: boolean) => {
  if (ctx.state.now - ctx.start.now < 60_000) return false;
  return readers(ctx).some((p) => {
    if (p.startedAt > 10_000) return false;
    const seqs = seqsOf(ctx.state, p.pid);
    if (!seqs.length) return false;
    const max = Math.max(...seqs);
    const have = new Set(seqs);
    for (let s = 1; s <= max; s++) if (!have.has(s)) return false;
    return max >= 18 && (!once || seqs.length === have.size);
  });
};

export const scenarios: WsScenario[] = [
  {
    id: "resume",
    title: l("Kaldığın yerden", "Where you left off"),
    story: l(
      "Deploy ekranı sunucunun (`server.js`) her 3 sn'de gönderdiği numaralı log satırlarını gösteriyor. Ekranın Wi-Fi'ı 10. saniyede gidip 45. saniyede geri geliyor. İstemci (`reader.js`) yeniden bağlanıyor ama arada yazılan satırlar ekranda hiç görünmüyor. Sunucu `{\"type\":\"resume\",\"after\":N}` isteğine N'den sonraki her şeyi gönderebiliyor.",
      "The deploy screen shows the numbered log lines the server (`server.js`) sends every 3 s. The screen's Wi-Fi goes at 10 seconds and comes back at 45. The client (`reader.js`) reconnects, but the lines written in between never show up. The server can answer `{\"type\":\"resume\",\"after\":N}` with everything after N.",
    ),
    goal: l("Kopma boyunca yazılan satırlar da gelsin: 1'den sonuncuya kadar boşluk olmasın.", "The lines written during the drop arrive too: no gaps from 1 to the last."),
    start: start(SERVER, READER),
    hints: [
      l("İstemci son aldığı satırın numarasını (`msg.seq`) bir değişkende tutsun.", "The client keeps the number of the last line it got (`msg.seq`) in a variable."),
      l(
        "Her bağlantı açıldığında (ilki dahil) `ws.send(JSON.stringify({ type: \"resume\", after: lastSeq }))`. Sonra istemciyi yeniden başlat ve kopma bitene kadar bekle.",
        "Every time the connection opens (the first time too): `ws.send(JSON.stringify({ type: \"resume\", after: lastSeq }))`. Then restart the client and wait until the drop is over.",
      ),
      l("`nano reader.js`, `pkill -f reader.js`, `node reader.js &`, `sleep 60`", "`nano reader.js`, `pkill -f reader.js`, `node reader.js &`, `sleep 60`"),
    ],
    par: 4,
    check: (ctx) => complete(ctx, false),
  },
  {
    id: "keep-history",
    title: l("Sunucu hatırlasın", "The server remembers"),
    story: l(
      "İstemci artık yeniden bağlanınca `resume` gönderiyor, ama bu sunucu sürümü geçmişi hiç tutmuyor ve isteği yanıtsız bırakıyor. Sunucu gönderdiği her satırı saklasın ve `resume`'a cevap versin.",
      "The client now sends `resume` when it reconnects, but this version of the server keeps no history and leaves the request unanswered. The server should keep every line it sends and answer `resume`.",
    ),
    goal: l("Kopmadan sonra istemci eksik satırları sunucudan alsın: boşluk olmasın.", "After the drop the client gets the missing lines from the server: no gaps."),
    start: start(SERVER_NO_HISTORY, READER_RESUME, ["server.js"]),
    hints: [
      l("Her yeni satırı `history.push(msg)` ile bir diziye ekle.", "Add every new line to an array with `history.push(msg)`."),
      l(
        "`message` içinde `msg.type === \"resume\"` ise `history.filter((m) => m.seq > msg.after)` içindekileri sırayla gönder. Sunucuyu yeniden başlat, istemciyi başlat, bekle.",
        "In `message`, when `msg.type === \"resume\"`, send what's in `history.filter((m) => m.seq > msg.after)`, in order. Restart the server, start the client, wait.",
      ),
      l("`nano server.js`, `pkill -f server.js`, `node server.js &`, `node reader.js &`, `sleep 60`", "`nano server.js`, `pkill -f server.js`, `node server.js &`, `node reader.js &`, `sleep 60`"),
    ],
    par: 5,
    check: (ctx) => complete(ctx, false) && ctx.state.procs.some((p) => p.file === "server.js" && p.alive && p.pid !== 4242),
  },
  {
    id: "twice",
    title: l("İki kez görünen satır", "A line shown twice"),
    story: l(
      "Kopmadan sonra ekranda bir satır iki kez çıkıyor: sunucu `resume`'a, istemcinin zaten aldığı son satırdan başlayarak cevap veriyor. Sunucu kodu başka bir ekibin; senin işin istemciyi buna karşı sağlam yapmak.",
      "After a drop, one line shows up twice on the screen: the server answers `resume` starting from the last line the client already has. The server code belongs to another team; your job is to make the client robust to it.",
    ),
    goal: l("Her satır ekranda bir kez görünsün: boşluk da tekrar da olmasın.", "Every line shows once: no gaps and no repeats."),
    start: start(SERVER_OFF_BY_ONE, READER_RESUME, ["server.js", "reader.js"]),
    hints: [
      l(
        "Ağ ve sunucular aynı şeyi iki kez gönderebilir (\"en az bir kez\" teslim). İstemci, numarası zaten gördüğünden küçük ya da eşit olan satırı yok saymalı.",
        "Networks and servers can send the same thing twice (\"at least once\" delivery). The client should ignore a line whose number is at or below what it has already seen.",
      ),
      l("`message` içinde, `lastSeq`'i güncellemeden önce: `if (msg.seq <= lastSeq) return;`.", "In `message`, before updating `lastSeq`: `if (msg.seq <= lastSeq) return;`."),
      l("`nano reader.js`, `pkill -f reader.js`, `node reader.js &`, `sleep 60`", "`nano reader.js`, `pkill -f reader.js`, `node reader.js &`, `sleep 60`"),
    ],
    par: 4,
    check: (ctx) => {
      if (ctx.state.now - ctx.start.now < 60_000) return false;
      return readers(ctx).some((p) => {
        const shown = ctx.events.flat().filter((e) => e.type === "procLog" && e.pid === p.pid && /^got #\d+/.test(e.text)).map((e) => Number(/#(\d+)/.exec((e as { text: string }).text)![1]));
        if (shown.length < 18) return false;
        const max = Math.max(...shown);
        return shown.length === new Set(shown).size && shown.length === max;
      });
    },
  },
  {
    id: "survive-restart",
    title: l("Uygulama yeniden açılınca", "When the app restarts"),
    story: l(
      "Telefonda uygulama arka plana atılınca işletim sistemi onu kapatıyor. Yeniden açılınca `lastSeq` sıfırdan başlıyor ve kullanıcı bütün logu baştan görüyor. Son numarayı kalıcı bir yerde tut (burada bir dosya; tarayıcıda localStorage) ve yeniden açılınca oradan devam et.",
      "On a phone, the OS kills the app when it goes to the background. When reopened, `lastSeq` starts from zero and the user sees the whole log again. Keep the last number somewhere that lasts (a file here; localStorage in a browser) and carry on from there after a restart.",
    ),
    goal: l("İstemci yeniden başlatılınca daha önce aldığı satırları bir daha almasın.", "When the client restarts, it doesn't receive the lines it already had."),
    start: createNet({ files: { "server.js": SERVER, "reader.js": READER_RESUME }, running: ["server.js"] }),
    hints: [
      l(
        "`fs.writeFileSync(\"last-seq.txt\", String(lastSeq))` her satırda; başlarken `fs.existsSync` ve `fs.readFileSync` ile oku.",
        "`fs.writeFileSync(\"last-seq.txt\", String(lastSeq))` on every line; read it at startup with `fs.existsSync` and `fs.readFileSync`.",
      ),
      l(
        "Dene: istemciyi başlat, biraz bekle, durdur, yeniden başlat. İkinci süreç ilkinin bıraktığı yerden devam etmeli.",
        "Try it: start the client, wait a bit, stop it, start it again. The second process should carry on where the first stopped.",
      ),
      l("`nano reader.js`, `node reader.js &`, `sleep 10`, `pkill -f reader.js`, `node reader.js &`, `sleep 10`", "`nano reader.js`, `node reader.js &`, `sleep 10`, `pkill -f reader.js`, `node reader.js &`, `sleep 10`"),
    ],
    par: 6,
    check: (ctx) => {
      const rs = readers(ctx);
      for (let i = 1; i < rs.length; i++) {
        const before = rs.slice(0, i).flatMap((p) => seqsOf(ctx.state, p.pid));
        const now = seqsOf(ctx.state, rs[i]!.pid);
        if (before.length >= 2 && now.length >= 1 && Math.min(...now) > Math.max(...before)) return true;
      }
      return false;
    },
  },
];
