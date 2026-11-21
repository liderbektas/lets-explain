import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet } from "../../engine/net";
import { newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { ECHO, SENSOR } from "./code";

export const FREE = createNet({ files: { "echo.js": ECHO, "sensor.js": SENSOR }, running: ["echo.js"] });

/** A file holds bytes as latin1 characters; this reads them back as numbers. */
const fileBytes = (ctx: WsCtx, name: string) => [...(ctx.state.files[name] ?? "")].map((c) => c.charCodeAt(0));
const sameBytes = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const scenarios: WsScenario[] = [
  {
    id: "watch-a-frame",
    title: l("Frame'i gör", "See a frame"),
    story: l(
      "Kitapta okudun ama hiç görmedin: bir WebSocket mesajı kabloda neye benziyor? Bu makinede `:9001`'de bir echo sunucusu çalışıyor. Wireshark'ın terminal hali `tshark` ile trafiği dinle ve sunucuya bir mesaj gönder.",
      "You've read about it but never seen it: what does a WebSocket message look like on the wire? An echo server runs on `:9001` on this machine. Listen with `tshark`, Wireshark's terminal side, and send the server a message.",
    ),
    goal: l("tshark çalışırken sunucuya bir mesaj gönder; giden frame yakalansın.", "Send the server a message while tshark runs, so the outgoing frame is captured."),
    start: FREE,
    hints: [
      l(
        "tshark arka planda çalışmalı ki terminal sende kalsın: komutun sonuna `&`. Arayüz `-i lo` (bu makinenin kendisi), WebSocket süzgeci `-Y websocket`, ayrıntılı döküm `-O websocket`.",
        "tshark has to run in the background so you keep the terminal: put `&` at the end. The interface is `-i lo` (this machine itself), the WebSocket filter `-Y websocket`, the full dissection `-O websocket`.",
      ),
      l("Sonra `wscat -c ws://localhost:9001 -x merhaba` ile bir mesaj gönder; tshark'ın çıktısı terminale düşer.", "Then send a message with `wscat -c ws://localhost:9001 -x merhaba`; tshark's output lands in the terminal."),
      l("`sudo tshark -i lo -Y websocket -O websocket &`, `wscat -c ws://localhost:9001 -x merhaba`", "`sudo tshark -i lo -Y websocket -O websocket &`, `wscat -c ws://localhost:9001 -x merhaba`"),
    ],
    par: 2,
    check: (ctx) => ctx.state.procs.some((p) => p.kind === "tshark" && (p.capture?.count ?? 0) > 0) && newConns(ctx).some((c) => c.frames.some((f) => f.dir === "out" && f.opcode === OP.text)),
  },
  {
    id: "fixture",
    title: l("Test fikstürü", "A test fixture"),
    story: l(
      "Kendi WebSocket istemci kütüphaneni test ediyorsun. Testler gerçek bir sunucu yerine dosyadan bayt okuyor. Sunucunun `hi` metni için göndereceği frame'in birebir baytlarını `hi.bin` dosyasına yazman gerekiyor.",
      "You're testing your own WebSocket client library. The tests read bytes from a file instead of a real server. You need the exact bytes a server sends for the text `hi` in a file called `hi.bin`.",
    ),
    goal: l("`hi.bin` sunucunun `hi` için göndereceği frame olsun: başlık ve veri, fazlası yok.", "`hi.bin` holds the frame a server sends for `hi`: header and data, nothing more."),
    start: FREE,
    hints: [
      l(
        "İlk bayt: FIN=1 ve opcode 1 (text) → `1000 0001` = `0x81`. İkinci bayt: sunucu maskelemez (MASK=0), uzunluk 2 → `0x02`. Sonra `hi`'nin kendisi.",
        "First byte: FIN=1 and opcode 1 (text) → `1000 0001` = `0x81`. Second byte: a server does not mask (MASK=0), length 2 → `0x02`. Then `hi` itself.",
      ),
      l(
        "`printf` `\\xHH` ile ham bayt yazar ve kendisi satır sonu eklemez (`echo` ekler). `>` çıktıyı dosyaya yazar; `xxd hi.bin` ile kontrol et.",
        "`printf` writes raw bytes with `\\xHH` and adds no newline of its own (`echo` does). `>` sends the output to a file; check it with `xxd hi.bin`.",
      ),
      l("`printf '\\x81\\x02hi' > hi.bin`", "`printf '\\x81\\x02hi' > hi.bin`"),
    ],
    par: 1,
    check: (ctx) => sameBytes(fileBytes(ctx, "hi.bin"), [0x81, 0x02, 0x68, 0x69]),
  },
  {
    id: "long-header",
    title: l("Uzun mesajın başlığı", "A long message's header"),
    story: l(
      "Aynı test paketi için bu kez 300 baytlık bir mesajın başlığı lazım. 300, 7 bitlik uzunluk alanına sığmıyor. Sunucudan gelen böyle bir frame'in veriden önceki baytlarını `head.bin`'e yaz.",
      "For the same test suite you now need the header of a 300-byte message. 300 does not fit in the 7-bit length field. Write the bytes such a frame from a server carries before its data into `head.bin`.",
    ),
    goal: l("`head.bin`, 300 baytlık bir text frame'inin sunucu tarafındaki başlığı olsun.", "`head.bin` holds the header of a 300-byte text frame from a server."),
    start: FREE,
    hints: [
      l(
        "Uzunluk 126 ile 65535 arasındaysa ikinci bayttaki uzunluk `126` (`0x7e`) olur; gerçek uzunluk ardından gelen 2 baytta yazar.",
        "When the length is between 126 and 65535, the length in the second byte is `126` (`0x7e`); the real length follows in the next 2 bytes.",
      ),
      l("Bu 2 bayt büyük sondan başlar (network byte order): 300 = `0x012c` → önce `01`, sonra `2c`.", "Those 2 bytes are big-endian (network byte order): 300 = `0x012c` → first `01`, then `2c`."),
      l("`printf '\\x81\\x7e\\x01\\x2c' > head.bin`", "`printf '\\x81\\x7e\\x01\\x2c' > head.bin`"),
    ],
    par: 1,
    check: (ctx) => sameBytes(fileBytes(ctx, "head.bin"), [0x81, 0x7e, 0x01, 0x2c]),
  },
  {
    id: "binary-reading",
    title: l("Pil dostu sensör", "A battery-friendly sensor"),
    story: l(
      "Sahadaki sıcaklık sensörleri pille çalışıyor ve her bayt pil demek. `sensor.js` tek bir ölçümü JSON metni olarak gönderiyor. Ekip ölçümün 2 baytlık binary olarak gitmesini istiyor: sıcaklık × 10, iki bayt (21.5 → 215 → `00 d7`).",
      "The temperature sensors in the field run on batteries, and every byte costs battery. `sensor.js` sends a reading as JSON text. The team wants it sent as 2 bytes of binary: temperature × 10 in two bytes (21.5 → 215 → `00 d7`).",
    ),
    goal: l("`sensor.js` ölçümü 2 baytlık bir binary frame olarak göndersin ve çalışsın.", "`sensor.js` sends the reading as a 2-byte binary frame, and runs."),
    start: FREE,
    hints: [
      l(
        "ws, string gönderince text frame (opcode 1), Buffer gönderince binary frame (opcode 2) yollar.",
        "ws sends a text frame (opcode 1) for a string and a binary frame (opcode 2) for a Buffer.",
      ),
      l("`ws.send(Buffer.from([0x00, 0xd7]))`, sonra `node sensor.js`.", "`ws.send(Buffer.from([0x00, 0xd7]))`, then `node sensor.js`."),
      l(
        "`nano sensor.js` (`ws.send(JSON.stringify(reading))` → `ws.send(Buffer.from([0x00, 0xd7]))`), `node sensor.js`",
        "`nano sensor.js` (`ws.send(JSON.stringify(reading))` → `ws.send(Buffer.from([0x00, 0xd7]))`), `node sensor.js`",
      ),
    ],
    par: 2,
    check: (ctx) => newConns(ctx).some((c) => c.client.startsWith("proc:") && c.frames.some((f) => f.dir === "out" && f.opcode === OP.binary && f.size <= 4)),
  },
];
