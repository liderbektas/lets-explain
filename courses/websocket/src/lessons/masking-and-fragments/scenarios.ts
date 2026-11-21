import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet } from "../../engine/net";
import { logsOf, newConns, type WsScenario } from "../shared/NetScene";
import { ECHO, LOGS, STREAM } from "./code";

export const FREE = createNet({ files: { "echo.js": ECHO, "logs.js": LOGS, "stream.js": STREAM }, running: ["echo.js", "logs.js", "stream.js"] });

const captured = (ctx: Parameters<WsScenario["check"]>[0]) => ctx.state.procs.filter((p) => p.kind === "tshark").reduce((n, p) => n + (p.capture?.count ?? 0), 0);

export const scenarios: WsScenario[] = [
  {
    id: "masks-differ",
    title: l("Her frame'e yeni maske", "A new mask per frame"),
    story: l(
      "Bir arkadaşın \"maske sabit bir şifre, her mesajda aynı\" diyor. Göstermek istiyorsun: `:9001`'deki echo sunucusuna aynı mesajı iki kez gönder ve tshark'ta iki frame'in maske anahtarlarına bak.",
      "A friend says \"the mask is a fixed key, the same for every message\". You want to show them: send the same message to the echo server on `:9001` twice, and look at the two frames' masking keys in tshark.",
    ),
    goal: l("tshark çalışırken aynı metni iki ayrı frame'le gönder.", "With tshark running, send the same text in two separate frames."),
    start: FREE,
    hints: [
      l("Önce tshark'ı arka planda başlat; `-O websocket` her frame'in `Masking-Key` satırını gösterir.", "Start tshark in the background first; `-O websocket` shows each frame's `Masking-Key` line."),
      l("`wscat -x` bir mesaj gönderir ve çıkar; iki kez çalıştır.", "`wscat -x` sends one message and quits; run it twice."),
      l(
        "`sudo tshark -i lo -Y websocket -O websocket &`, `wscat -c ws://localhost:9001 -x hello`, `wscat -c ws://localhost:9001 -x hello`",
        "`sudo tshark -i lo -Y websocket -O websocket &`, `wscat -c ws://localhost:9001 -x hello`, `wscat -c ws://localhost:9001 -x hello`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      if (captured(ctx) < 2) return false;
      const outs = newConns(ctx).flatMap((c) => c.frames.filter((f) => f.dir === "out" && f.opcode === OP.text));
      return outs.some((a, i) => outs.some((b, j) => j > i && a.text === b.text && a.mask !== b.mask));
    },
  },
  {
    id: "unmask",
    title: l("Maskeyi elle çöz", "Unmask it by hand"),
    story: l(
      "Bir proxy'nin hata ayıklama kaydında bir istemci frame'i var: maske anahtarı `37fa213d`, maskelenmiş veri `7f9f4d5158`. Kayıt anlamsız görünüyor; içinde ne yazdığını bulman lazım.",
      "A proxy's debug log has a client frame in it: masking key `37fa213d`, masked data `7f9f4d5158`. The log looks like gibberish; you need to find out what it says.",
    ),
    goal: l("Veriyi maskeden çöz ve metni ekrana yazdır.", "Unmask the data and print the text."),
    start: FREE,
    hints: [
      l(
        "Maskeleme XOR'dur: `veri[i] = maskeli[i] XOR anahtar[i % 4]`. Aynı işlem geri de çözer.",
        "Masking is XOR: `data[i] = masked[i] XOR key[i % 4]`. The same operation undoes it.",
      ),
      l(
        "`node -e` ile tek satırda: iki Buffer'ı `Buffer.from(..., 'hex')` ile oluştur, `map` ile XOR'la, `toString()` ile yazdır.",
        "In one line with `node -e`: make two Buffers with `Buffer.from(..., 'hex')`, XOR them with `map`, print with `toString()`.",
      ),
      l(
        "`node -e \"const k = Buffer.from('37fa213d', 'hex'); const m = Buffer.from('7f9f4d5158', 'hex'); console.log(m.map((b, i) => b ^ k[i % 4]).toString())\"`",
        "`node -e \"const k = Buffer.from('37fa213d', 'hex'); const m = Buffer.from('7f9f4d5158', 'hex'); console.log(m.map((b, i) => b ^ k[i % 4]).toString())\"`",
      ),
    ],
    par: 1,
    check: (ctx) => logsOf(ctx).some((t) => t.trim() === "Hello"),
  },
  {
    id: "one-message",
    title: l("Üç satır, tek mesaj", "Three lines, one message"),
    story: l(
      "Deploy panelinde log, `logs.js`'ten (`:9002`) geliyor. Sunucu logu üç parça halinde gönderiyor ve panel her parçayı ayrı bir kayıt sanıp üç ayrı kart çiziyor. Log tek bir mesaj olarak gelmeli ama sunucu da parçaları tek seferde birleştirmeden göndermeye devam etmeli.",
      "On the deploy dashboard the log comes from `logs.js` (`:9002`). The server sends the log in three pieces, and the dashboard takes each piece for a separate entry and draws three cards. The log should arrive as one message, yet the server should keep sending the pieces without joining them first.",
    ),
    goal: l("İstemci logu tek mesaj olarak alsın: üç frame, bir mesaj.", "The client gets the log as one message: three frames, one message."),
    start: FREE,
    hints: [
      l(
        "Her `ws.send(part)` ayrı bir mesajdır (FIN=1). ws'de `{ fin: false }` frame'i \"devamı var\" diye işaretler; sonraki frame'ler devam parçası olur.",
        "Each `ws.send(part)` is a separate message (FIN=1). In ws, `{ fin: false }` marks a frame \"more to come\"; the following frames become continuations.",
      ),
      l(
        "Son parça hariç hepsinde `fin: false`. Kodu değiştirdikten sonra çalışan sunucu eski kodla devam eder: yeniden başlat ve `wscat` ile bağlan.",
        "`fin: false` on every piece but the last. After the change the running server keeps the old code: restart it, then connect with `wscat`.",
      ),
      l(
        "`nano logs.js` (`ws.send(part, { fin: i === parts.length - 1 })`), `pkill -f logs.js`, `node logs.js &`, `wscat -c ws://localhost:9002`",
        "`nano logs.js` (`ws.send(part, { fin: i === parts.length - 1 })`), `pkill -f logs.js`, `node logs.js &`, `wscat -c ws://localhost:9002`",
      ),
    ],
    par: 4,
    check: (ctx) => newConns(ctx).some((c) => c.upstream === 9002 && c.msgs.filter((m) => m.dir === "in").length === 1 && c.msgs.some((m) => m.dir === "in" && m.frames === 3)),
  },
  {
    id: "see-fragments",
    title: l("Parçaları yakala", "Catch the fragments"),
    story: l(
      "`stream.js` (`:9003`) logu parçalı tek bir mesaj olarak gönderiyor. Bir müşteri \"bizim proxy parçalı mesajları bozuyor\" diyor; önce kabloda gerçekten kaç frame gittiğini görmek istiyorsun.",
      "`stream.js` (`:9003`) sends the log as one fragmented message. A customer says \"our proxy breaks fragmented messages\"; first you want to see how many frames really go on the wire.",
    ),
    goal: l("tshark çalışırken `:9003`'e bağlan; parçalar yakalansın.", "Connect to `:9003` while tshark runs, so the fragments are captured."),
    start: FREE,
    hints: [
      l("tshark'ın kısa çıktısı her frame'i bir satırda gösterir: `Text`, `Continuation`, ve son parçada `[FIN]`.", "tshark's short output shows each frame on one line: `Text`, `Continuation`, and `[FIN]` on the last one."),
      l("Sunucu bağlanır bağlanmaz logu gönderiyor; bağlanman yeter.", "The server sends the log as soon as you connect; connecting is enough."),
      l("`sudo tshark -i lo -Y websocket &`, `wscat -c ws://localhost:9003`", "`sudo tshark -i lo -Y websocket &`, `wscat -c ws://localhost:9003`"),
    ],
    par: 2,
    check: (ctx) => captured(ctx) >= 3 && newConns(ctx).some((c) => c.upstream === 9003 && c.frames.some((f) => f.opcode === OP.cont)),
  },
];
