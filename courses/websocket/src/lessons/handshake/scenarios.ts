import { l } from "@lets-explain/core/i18n";
import { createNet, header, type Exchange } from "../../engine/net";
import { newExchanges, type WsCtx, type WsScenario } from "../shared/NetScene";

export const FREE = createNet({ messages: [{ from: "ayse", text: "Morning!" }] });

/** Requests the reader typed with curl (not ones a client library made), in order. */
const typed = (ctx: WsCtx): Exchange[] => newExchanges(ctx).filter((e) => (header(e.headers, "user-agent") ?? "").startsWith("curl"));
const statuses = (ctx: WsCtx) => typed(ctx).flatMap((e) => (e.port === 8081 && e.status !== null ? [e.status] : []));

const ECE = "curl -i -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081";

export const scenarios: WsScenario[] = [
  {
    id: "by-hand",
    title: l("Elle el sıkış", "Shake hands by hand"),
    story: l(
      "WebSocket sunucusunun (`localhost:8081`) gerçekten el sıkıştığını, tarayıcı ya da bir kütüphane olmadan görmek istiyorsun. Tarayıcının gönderdiği başlıkları `curl` ile kendin göndereceksin.",
      "You want to see that the WebSocket server (`localhost:8081`) really does the handshake, with no browser and no library. You'll send the headers a browser sends yourself, with `curl`.",
    ),
    goal: l("curl ile `101 Switching Protocols` cevabını al.", "Get a `101 Switching Protocols` answer with curl."),
    start: FREE,
    hints: [
      l(
        "Dört başlık gerekiyor: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13` ve bir `Sec-WebSocket-Key`. Her biri ayrı bir `-H`.",
        "It takes four headers: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13` and a `Sec-WebSocket-Key`. Each one is its own `-H`.",
      ),
      l(
        "Key olarak RFC'deki örneği kullanabilirsin: `dGhlIHNhbXBsZSBub25jZQ==`. Cevabı görmek için `-i`.",
        "For the key you can use the RFC's example: `dGhlIHNhbXBsZSBub25jZQ==`. Add `-i` to see the answer.",
      ),
      l(
        "`curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081`",
        "`curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081`",
      ),
    ],
    par: 1,
    check: (ctx) => statuses(ctx).includes(101),
  },
  {
    id: "the-426",
    title: l("426 nereden geliyor?", "Where does the 426 come from?"),
    story: l(
      `Mobil ekipten Ece'nin test komutu hep 426 alıyor ve "sunucu bozuk" diyor. Komutu şu: \`${ECE}\`. Önce sorunu kendin gör, sonra komutu düzelt.`,
      `Ece from the mobile team says her test command always gets a 426 and "the server is broken". Her command: \`${ECE}\`. First see the problem yourself, then fix the command.`,
    ),
    goal: l("Ece'nin komutuyla 426'yı gör, sonra düzeltilmiş komutla 101 al.", "See the 426 with Ece's command, then get a 101 with the fixed one."),
    start: FREE,
    hints: [
      l("Önce komutu olduğu gibi çalıştır (yukarı ok tuşu ile tekrar çağırabilirsin).", "Run the command as it is first (the up arrow brings it back)."),
      l(
        "Node bir isteği ancak `Connection: Upgrade` ve `Upgrade: websocket` birlikte varsa upgrade sayar. Ece'de biri eksik.",
        "Node treats a request as an upgrade only with both `Connection: Upgrade` and `Upgrade: websocket`. Ece's is missing one.",
      ),
      l(`\`${ECE}\`, sonra aynısına \`-H 'Connection: Upgrade'\` ekle`, `\`${ECE}\`, then the same with \`-H 'Connection: Upgrade'\` added`),
    ],
    par: 2,
    check: (ctx) => {
      const s = statuses(ctx);
      const i = s.indexOf(426);
      return i >= 0 && s.slice(i + 1).includes(101);
    },
  },
  {
    id: "fresh-key",
    title: l("Sabit key", "A fixed key"),
    story: l(
      "Mobil uygulama her bağlantıda kodun içine yazılmış aynı key'i, `abc123`'ü gönderiyor ve sunucu 400 dönüyor. Key'in her bağlantı için yeni üretilmiş 16 rastgele bayt olması gerekiyor. Doğru bir key üretip onunla el sıkışarak düzeltmeyi göster.",
      "The mobile app sends the same key on every connection, `abc123`, hard-coded, and the server answers 400. A key must be 16 random bytes made fresh for each connection. Show the fix by making a proper key and doing the handshake with it.",
    ),
    goal: l("Rastgele bir key üret ve onunla 101 al.", "Make a random key and get a 101 with it."),
    start: FREE,
    hints: [
      l("16 rastgele bayt, base64 olarak: `openssl rand -base64 16`.", "16 random bytes, in base64: `openssl rand -base64 16`."),
      l(
        "Çıkan değeri `Sec-WebSocket-Key` başlığına koy. İstersen tek satırda: `-H \"Sec-WebSocket-Key: $(openssl rand -base64 16)\"` (çift tırnak, ki `$( )` çalışsın).",
        "Put the value in the `Sec-WebSocket-Key` header. Or in one line: `-H \"Sec-WebSocket-Key: $(openssl rand -base64 16)\"` (double quotes, so `$( )` runs).",
      ),
      l(
        "`curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H \"Sec-WebSocket-Key: $(openssl rand -base64 16)\" localhost:8081`",
        "`curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H \"Sec-WebSocket-Key: $(openssl rand -base64 16)\" localhost:8081`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      typed(ctx).some((e) => {
        const key = header(e.headers, "sec-websocket-key");
        return e.status === 101 && key !== undefined && ctx.state.printed.includes(key);
      }),
  },
  {
    id: "three-answers",
    title: l("Üç cevap", "Three answers"),
    story: l(
      "Ekibin wiki'sine bir el sıkışma hata rehberi yazıyorsun. Her cevabın hangi istekten çıktığını gösteren gerçek örnekler lazım: başarılı bir el sıkışma, upgrade başlıkları olmayan bir istek ve geçersiz bir key.",
      "You're writing a handshake troubleshooting guide for the team wiki. You need real examples of which request produces which answer: a good handshake, a request without the upgrade headers, and an invalid key.",
    ),
    goal: l("Bu sunucudan üç cevabı da al: 101, 426 ve 400.", "Get all three answers from this server: 101, 426 and 400."),
    start: FREE,
    hints: [
      l("Tam bir el sıkışma isteğinden başla, sonra her seferinde bir şeyi boz.", "Start from a full handshake request, then break one thing at a time."),
      l("426 için upgrade başlıklarını çıkar; 400 için key'i `abc123` gibi geçersiz bir şey yap.", "For 426 leave out the upgrade headers; for 400 make the key something invalid like `abc123`."),
      l(
        "`curl -i localhost:8081`, tam istek (101), sonra key'i `abc123` yaparak aynı istek (400)",
        "`curl -i localhost:8081`, the full request (101), then the same with the key set to `abc123` (400)",
      ),
    ],
    par: 3,
    check: (ctx) => [101, 426, 400].every((s) => statuses(ctx).includes(s)),
  },
];
