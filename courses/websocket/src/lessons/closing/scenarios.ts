import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, type WsScenario } from "../shared/NetScene";
import { REPORT, SERVER, UPLOAD, WATCH } from "./code";

const FILES = { "server.js": SERVER, "watch.js": WATCH, "report.js": REPORT, "upload.js": UPLOAD };

export const FREE = createNet({ files: FILES, running: ["server.js"] });

const procClient = (c: { client: string }) => c.client.startsWith("proc:");

export const scenarios: WsScenario[] = [
  {
    id: "graceful-deploy",
    title: l("Kibar bir deploy", "A polite deploy"),
    story: l(
      "Her deploy'da eski sunucu SIGTERM ile durduruluyor ve kullanıcıların uygulaması bunu bir hata gibi görüyor: 1006, \"bağlantı koptu\" uyarısı. Sunucu kapanırken herkese 1001 (\"going away\") ile veda etmeli ki istemciler bunun planlı olduğunu anlasın. `watch.js` bağlanıp kapanış kodunu yazan bir test istemcisi.",
      "On every deploy the old server is stopped with SIGTERM, and users' apps see it as an error: 1006, a \"connection lost\" warning. The server should say goodbye to everyone with 1001 (\"going away\") as it shuts down, so clients know it was planned. `watch.js` is a test client that connects and prints the close code.",
    ),
    goal: l("Sunucu SIGTERM alınca istemcilerini 1001 ile kapatsın; `watch.js` 1001 görsün.", "On SIGTERM the server closes its clients with 1001; `watch.js` sees 1001."),
    start: createNet({ files: FILES }),
    hints: [
      l(
        "`process.on(\"SIGTERM\", ...)` ile sinyali yakala. İçinde her istemciye `ws.close(1001, \"server restarting\")`, sonra `wss.close(() => process.exit(0))`.",
        "Catch the signal with `process.on(\"SIGTERM\", ...)`. In it, `ws.close(1001, \"server restarting\")` for every client, then `wss.close(() => process.exit(0))`.",
      ),
      l("Sunucuyu ve `watch.js`'i başlat, sonra sunucuya SIGTERM gönder: `kill` varsayılan olarak SIGTERM gönderir.", "Start the server and `watch.js`, then send the server SIGTERM: `kill` sends SIGTERM by default."),
      l("`nano server.js` (SIGTERM handler), `node server.js &`, `node watch.js &`, `pkill -f server.js`", "`nano server.js` (SIGTERM handler), `node server.js &`, `node watch.js &`, `pkill -f server.js`"),
    ],
    par: 4,
    check: (ctx) => newConns(ctx).some((c) => procClient(c) && c.closeCode === 1001),
  },
  {
    id: "kick-1008",
    title: l("Kurala uymayanı çıkar", "Show the rule-breaker out"),
    story: l(
      "Sunucu JSON olmayan mesajları sessizce yutuyor ve hatalı bir istemci saatlerce çöp göndermeye devam ediyor. Kural: mesajlar JSON olacak. Uymayan istemci 1008 (\"policy violation\") ve bir sebeple kapatılmalı.",
      "The server quietly swallows messages that aren't JSON, and a buggy client keeps sending garbage for hours. The rule: messages are JSON. A client that breaks it should be closed with 1008 (\"policy violation\") and a reason.",
    ),
    goal: l("JSON olmayan bir mesaj gönderen istemci 1008 ile kapatılsın.", "A client that sends a non-JSON message gets closed with 1008."),
    start: FREE,
    hints: [
      l("`JSON.parse` hata verdiğinde `return` yerine `ws.close(1008, \"messages must be JSON\")`.", "When `JSON.parse` throws, `ws.close(1008, \"messages must be JSON\")` instead of `return`."),
      l("Sunucuyu yeniden başlat ve JSON olmayan bir şey gönder: `wscat -c ws://localhost:9001 -x hello`.", "Restart the server and send something that isn't JSON: `wscat -c ws://localhost:9001 -x hello`."),
      l(
        "`nano server.js` (`return ws.close(1008, \"messages must be JSON\");`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001 -x hello`",
        "`nano server.js` (`return ws.close(1008, \"messages must be JSON\");`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9001 -x hello`",
      ),
    ],
    par: 4,
    check: (ctx) => newConns(ctx).some((c) => c.serverCode === 1008 && c.closeCode === 1008),
  },
  {
    id: "clean-exit",
    title: l("Script kapıyı çarpmasın", "Don't slam the door"),
    story: l(
      "Her gece çalışan `report.js` sohbete bir rapor bırakıp çıkıyor. Sunucu logları her gece \"closed 1006\" ile doluyor ve alarm sistemi bunları hata sayıyor. Script işini bitirince bağlantıyı düzgünce kapatmalı.",
      "The nightly `report.js` drops a report into the chat and quits. Every night the server logs fill with \"closed 1006\", and the alerting counts them as errors. The script should close the connection properly when it's done.",
    ),
    goal: l("`report.js` raporu göndersin ve bağlantıyı 1000 ile kapatsın.", "`report.js` sends its report and closes the connection with 1000."),
    start: FREE,
    hints: [
      l(
        "`process.exit(0)` bağlantıyı kapanış frame'i göndermeden keser; sunucu 1006 görür. Mesaj bile yolda kaybolabilir.",
        "`process.exit(0)` cuts the connection without a close frame; the server sees 1006. Even the message can be lost on the way.",
      ),
      l(
        "`ws.close(1000, \"done\")` kapanış el sıkışmasını yapar. Node, açık bir şey kalmayınca kendisi çıkar; `process.exit` gerekmez.",
        "`ws.close(1000, \"done\")` does the closing handshake. Node exits by itself once nothing is left open; no `process.exit` needed.",
      ),
      l("`nano report.js` (`process.exit(0);` → `ws.close(1000, \"done\");`), `node report.js`", "`nano report.js` (`process.exit(0);` → `ws.close(1000, \"done\");`), `node report.js`"),
    ],
    par: 2,
    check: (ctx) => newConns(ctx).some((c) => procClient(c) && c.serverCode === 1000 && c.msgs.some((m) => m.dir === "out" && m.text.includes("report"))),
  },
  {
    id: "too-big",
    title: l("Fotoğraf sığmıyor", "The photo doesn't fit"),
    story: l(
      "Yeni özellik: kullanıcılar sohbete fotoğraf yükleyebilecek, en fazla 5 MB. `upload.js` 2 MB'lık bir fotoğraf gönderiyor ama bağlantı 1009 ile kapanıyor. Sunucu tek bir mesaja en fazla 1 MB izin veriyor.",
      "A new feature: users can upload photos into the chat, up to 5 MB. `upload.js` sends a 2 MB photo, but the connection closes with 1009. The server allows at most 1 MB in a single message.",
    ),
    goal: l("Sunucu 5 MB'a kadar mesaj kabul etsin; 2 MB'lık fotoğraf saklansın.", "The server accepts messages up to 5 MB; the 2 MB photo gets stored."),
    start: FREE,
    hints: [
      l(
        "1009 \"message too big\" demek. ws sunucusunda bu sınırı `maxPayload` belirler (bayt cinsinden). Varsayılanı 100 MiB; bu sunucuda 1 MB'a düşürülmüş.",
        "1009 means \"message too big\". In a ws server that limit is `maxPayload` (in bytes). Its default is 100 MiB; this server lowered it to 1 MB.",
      ),
      l("`maxPayload: 5 * 1024 * 1024`, sunucuyu yeniden başlat ve `node upload.js`.", "`maxPayload: 5 * 1024 * 1024`, restart the server, and `node upload.js`."),
      l(
        "`nano server.js` (`maxPayload: 5 * 1024 * 1024`), `pkill -f server.js`, `node server.js &`, `node upload.js`",
        "`nano server.js` (`maxPayload: 5 * 1024 * 1024`), `pkill -f server.js`, `node server.js &`, `node upload.js`",
      ),
    ],
    par: 4,
    check: (ctx) => newConns(ctx).some((c) => procClient(c) && c.msgs.some((m) => m.dir === "out" && m.binary && m.size >= 2 * 1024 * 1024) && c.msgs.some((m) => m.dir === "in" && m.text.includes("stored"))),
  },
];
