import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const frames: Lesson = {
  slug: "frames",
  title: l("Frame'in anatomisi", "Anatomy of a frame"),
  summary: l(
    "El sıkışmadan sonra her mesaj bir frame olarak gider. Bir frame'i bayt bayt aç: FIN, opcode, mask, uzunluk ve veri.",
    "After the handshake every message travels as a frame. Open one up byte by byte: FIN, opcode, mask, length and data.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir frame'in başlık baytlarını okumak", "Read a frame's header bytes"), step: 0 },
    { text: l("İstemci ile sunucu frame'leri arasındaki farkı görmek", "See how client and server frames differ"), step: 1 },
    { text: l("Text ve binary opcode'larını ayırmak", "Tell the text and binary opcodes apart"), step: 2 },
    { text: l("Uzun mesajlarda uzunluğun nasıl yazıldığını bilmek", "Know how a long message's length is written"), step: 3 },
    { text: l("Kontrol frame'lerini tanımak", "Recognise control frames"), step: 4 },
  ],
  steps: [
    {
      short: l("merhaba", "merhaba"),
      tag: "how",
      predict: {
        question: l(
          "Tarayıcı WebSocket üzerinden `merhaba` (7 harf, 7 bayt) gönderiyor. Bu frame kabloda toplam kaç bayt tutar?",
          "The browser sends `merhaba` (7 letters, 7 bytes) over the WebSocket. How many bytes does the frame take on the wire?",
        ),
        options: [l("7", "7"), l("9", "9"), l("13", "13"), l("20 civarı", "About 20")],
        answer: 2,
        why: l(
          "2 bayt başlık, 4 bayt maske anahtarı ve 7 bayt veri: 13. Tarayıcıdan sunucuya giden her frame maskelidir; maske anahtarı her frame'de kabloya yazılır.",
          "2 header bytes, a 4-byte masking key and 7 data bytes: 13. Every frame from a browser to a server is masked, and the key travels in the frame.",
        ),
      },
      title: l("Bir frame'in baytları", "A frame's bytes"),
      body: [
        l(
          "El sıkışmadan sonra her mesaj bir [[frame]] olarak gider. Üstte tarayıcının gönderdiği `merhaba` var, bayt bayt.",
          "After the handshake every message goes as a [[frame]]. Above is the `merhaba` the browser sent, byte by byte.",
        ),
        l(
          "**İlk bayt** `81`: en soldaki bit FIN (bu, mesajın son parçası), son 4 bit opcode (`1` = text). **İkinci bayt** `87`: en soldaki bit MASK (`1` = maskeli), kalan 7 bit uzunluk (`7`). Sonra 4 baytlık maske anahtarı, en sonda maskelenmiş veri.",
          "**The first byte** `81`: the leftmost bit is FIN (this is the message's last part), the last 4 bits the opcode (`1` = text). **The second byte** `87`: the leftmost bit is MASK (`1` = masked), the other 7 bits the length (`7`). Then a 4-byte masking key, and finally the masked data.",
        ),
      ],
      practice: {
        commands: [{ cmd: "sudo tshark -i lo -Y websocket -O websocket", note: l("Wireshark'ın terminal hali: frame'leri bu sahnedeki gibi alan alan döker.", "Wireshark in the terminal: prints each frame field by field, as on this stage.") }],
      },
    },
    {
      short: l("Cevap", "The reply"),
      tag: "how",
      title: l("Sunucudan gelen frame maskesizdir", "A frame from the server is not masked"),
      body: [
        l(
          "Echo sunucusu aynı `merhaba`yı geri gönderdi. Bu kez frame 9 bayt: ikinci baytın MASK biti `0`, maske anahtarı yok, veri olduğu gibi okunuyor.",
          "The echo server sent the same `merhaba` back. This time the frame is 9 bytes: the MASK bit in the second byte is `0`, there is no key, and the data reads as it is.",
        ),
        l(
          "Kural RFC 6455'te kesin: istemciden giden her frame maskelenir, sunucudan gelen hiçbir frame maskelenmez. Bunun sebebini bir sonraki derste göreceğiz.",
          "The rule in RFC 6455 is strict: every frame from a client is masked, no frame from a server is. The reason is the next lesson.",
        ),
      ],
    },
    {
      short: l("Binary", "Binary"),
      tag: "how",
      title: l("Text ve binary", "Text and binary"),
      body: [
        l(
          "Tarayıcı bu kez 4 baytlık binary veri gönderdi (`ws.send(new Uint8Array([...]))`). İlk bayt `82`: opcode `2` = binary. Text frame'lerinde veri geçerli UTF-8 olmak zorunda; binary'de her bayt serbest.",
          "This time the browser sent 4 bytes of binary data (`ws.send(new Uint8Array([...]))`). The first byte is `82`: opcode `2` = binary. A text frame's data must be valid UTF-8; in binary any byte goes.",
        ),
        l(
          "Opcode'lar az: `0` devam parçası, `1` text, `2` binary, `8` kapanış, `9` ping, `10` (`0xA`) pong. İlk üçü veri taşır, son üçü bağlantının kendisiyle ilgili kontrol frame'leridir.",
          "There are few opcodes: `0` continuation, `1` text, `2` binary, `8` close, `9` ping, `10` (`0xA`) pong. The first three carry data; the last three are control frames about the connection itself.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Text frame'inde geçersiz UTF-8 gelirse alan taraf bağlantıyı `1007` ile kapatır. JSON gönderiyorsan text; resim, ses ya da sıkıştırılmış veri gönderiyorsan binary.",
            "If a text frame carries invalid UTF-8, the receiver closes the connection with `1007`. Sending JSON: text. Sending images, audio or compressed data: binary.",
          ),
        },
      ],
      practice: {
        commands: [],
        snippets: [{ label: "JavaScript · tarayıcı", code: 'ws.binaryType = "arraybuffer";\nws.send(new Uint8Array([0x00, 0xd7, 0x01, 0x2c]));' }],
      },
    },
    {
      short: l("Uzun mesaj", "Long message"),
      tag: "how",
      predict: {
        question: l(
          "300 baytlık bir mesaj: uzunluk 7 bite (en fazla 125) sığmıyor. Tarayıcıdan giden bu frame'in başlığı (veriden önceki kısım) kaç bayt olur?",
          "A 300-byte message: the length doesn't fit in 7 bits (125 at most). How many bytes is the header (everything before the data) of this frame from the browser?",
        ),
        options: [l("2", "2"), l("4", "4"), l("8", "8"), l("14", "14")],
        answer: 2,
        why: l(
          "2 bayt temel başlık, uzunluk için 2 bayt daha (126 işareti), 4 bayt maske: 8. 65.535 baytı aşan mesajlarda uzunluk 8 bayta çıkar (127 işareti).",
          "2 base header bytes, 2 more for the length (the 126 marker), 4 for the mask: 8. Over 65,535 bytes the length takes 8 bytes (the 127 marker).",
        ),
      },
      title: l("Uzunluk üç boyda yazılır", "The length comes in three sizes"),
      body: [
        l(
          "İkinci baytın 7 biti en fazla 125 yazabilir. Daha uzun mesajlarda o 7 bit bir işarettir: `126`, \"gerçek uzunluk sonraki 2 baytta\" demek; `127`, \"sonraki 8 baytta\".",
          "The second byte's 7 bits can hold 125 at most. For longer messages those 7 bits are a marker: `126` means \"the real length is in the next 2 bytes\"; `127`, \"in the next 8\".",
        ),
        l(
          "Burada uzunluk alanı `7e` (126), ardından `01 2c` = 300 geliyor. Sayılar büyük sondan başlar (network byte order).",
          "Here the length field is `7e` (126), followed by `01 2c` = 300. Numbers are big-endian (network byte order).",
        ),
      ],
    },
    {
      short: l("Kontrol", "Control"),
      tag: "reality",
      title: l("Kontrol frame'leri", "Control frames"),
      body: [
        l(
          "Tarayıcı `ws.close(1000, \"bye\")` ile kapattı. Giden frame'in opcode'u `8`; verisi 2 baytlık durum kodu (`03 e8` = 1000) ve sebep metni (`bye`).",
          "The browser closed with `ws.close(1000, \"bye\")`. The outgoing frame's opcode is `8`; its data is a 2-byte status code (`03 e8` = 1000) and a reason (`bye`).",
        ),
        l(
          "Kontrol frame'lerinin (kapanış, ping, pong) kuralları sıkıdır: verileri en fazla 125 bayt olabilir ve parçalara bölünemezler. Kapanış kodlarını ve ping'i ilerideki derslerde ayrıntılı göreceğiz.",
          "Control frames (close, ping, pong) have strict rules: their data is at most 125 bytes, and they cannot be split into parts. Close codes and pings get their own lessons later on.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `:9001`'de bir echo sunucusu çalışıyor (`echo.js`). **4 senaryo** var: trafiği `tshark` ile izlemek, test için frame baytlarını elle yazmak ve bir sensörü binary'ye geçirmek.",
          "Your turn. An echo server runs on `:9001` (`echo.js`). There are **4 scenarios**: watching the traffic with `tshark`, writing frame bytes by hand for tests, and moving a sensor to binary.",
        ),
        l(
          "Baytları `printf '\\x81...'` ile yaz, `xxd` ile kontrol et. `tshark`'ı `&` ile arka planda çalıştır; durdurmak için `kill %1`. Az komutla bitirirsen 3 yıldız.",
          "Write bytes with `printf '\\x81...'` and check them with `xxd`. Run `tshark` in the background with `&`; stop it with `kill %1`. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Her WebSocket mesajı bir [[frame]] olarak gider: 2 baytlık başlık, gerekirse uzatılmış uzunluk, istemcideyse maske anahtarı, sonra veri.", "Every WebSocket message travels as a [[frame]]: a 2-byte header, an extended length when needed, a masking key from a client, then the data."),
    l("İlk bayt FIN ve opcode'u, ikinci bayt MASK'ı ve uzunluğu taşır.", "The first byte holds FIN and the opcode, the second MASK and the length."),
    l("İstemciden giden her frame maskelidir; sunucudan gelenler maskesiz.", "Every frame from a client is masked; frames from a server are not."),
    l("Uzunluk 125'e kadar 7 bitte, 65.535'e kadar 2 baytta (126), daha uzunsa 8 baytta (127) yazılır.", "The length fits in 7 bits up to 125, in 2 bytes (126) up to 65,535, and in 8 bytes (127) beyond."),
    l("Opcode 1 text, 2 binary; 8, 9 ve 10 kontrol frame'leri: kısa ve bölünemez.", "Opcode 1 is text, 2 binary; 8, 9 and 10 are control frames: short, and never split."),
  ],
  quiz: [
    {
      question: l("Bir frame'in ilk baytı `82`. Ne anlatıyor?", "A frame's first byte is `82`. What does it say?"),
      options: [
        l("Son parça, binary veri", "The last part, binary data"),
        l("Son parça değil, text", "Not the last part, text"),
        l("Maskeli bir ping", "A masked ping"),
        l("Kapanış", "A close"),
      ],
      answer: 0,
      explain: l("`82` = `1000 0010`: FIN=1, opcode 2 (binary).", "`82` = `1000 0010`: FIN=1, opcode 2 (binary)."),
      reviewStep: 2,
    },
    {
      question: l("Sunucu tarayıcıya 7 baytlık bir text gönderiyor. Frame kaç bayt?", "A server sends a browser 7 bytes of text. How big is the frame?"),
      options: [l("7", "7"), l("9", "9"), l("13", "13"), l("11", "11")],
      answer: 1,
      explain: l("Sunucu maskelemez: 2 bayt başlık ve 7 bayt veri.", "A server does not mask: 2 header bytes and 7 data bytes."),
      reviewStep: 1,
    },
    {
      question: l("İkinci baytın uzunluk alanında `126` yazıyor. Ne demek?", "The second byte's length field says `126`. What does it mean?"),
      options: [
        l("Mesaj 126 bayt", "The message is 126 bytes"),
        l("Gerçek uzunluk sonraki 2 baytta", "The real length is in the next 2 bytes"),
        l("Gerçek uzunluk sonraki 8 baytta", "The real length is in the next 8 bytes"),
        l("Mesaj boş", "The message is empty"),
      ],
      answer: 1,
      explain: l("126 bir işaret: uzunluk sonraki 2 baytta, büyük sondan başlayarak.", "126 is a marker: the length is in the next 2 bytes, big-endian."),
      reviewStep: 3,
    },
    {
      question: l("Hangisi bir kontrol frame'i için doğru değil?", "Which is not true of a control frame?"),
      options: [
        l("Verisi en fazla 125 bayt", "Its data is at most 125 bytes"),
        l("Parçalara bölünemez", "It cannot be split"),
        l("Opcode'u 8, 9 ya da 10", "Its opcode is 8, 9 or 10"),
        l("İçinde JSON mesajları taşır", "It carries JSON messages"),
      ],
      answer: 3,
      explain: l("Kontrol frame'leri bağlantının kendisi içindir: kapanış, ping, pong. Uygulama verisi text ya da binary frame'lerle gider.", "Control frames are about the connection itself: close, ping, pong. Application data goes in text or binary frames."),
      reviewStep: 4,
    },
  ],
};
