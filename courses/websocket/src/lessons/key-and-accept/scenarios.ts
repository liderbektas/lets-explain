import { l } from "@lets-explain/core/i18n";
import { acceptFor } from "../../engine/bytes";
import { createNet, header } from "../../engine/net";
import { newConns, newExchanges, type WsScenario } from "../shared/NetScene";
import { SERVER_HEX, SERVER_NO_GUID } from "./files";

export const FREE = createNet({ messages: [{ from: "ayse", text: "Morning!" }], files: { "server.js": SERVER_NO_GUID } });

/** The key from the WebSocket article on Wikipedia, which many people check their code against. */
export const WIKI_KEY = "x3JJHMbDL1EzLkh9GBhXDw==";

const broken = (code: string) => createNet({ messages: [{ from: "ayse", text: "Morning!" }], files: { "server.js": code }, running: ["server.js"] });

/** A WebSocket client got through to the hand-written server: its accept was right. */
const connectedTo9000 = (ctx: Parameters<WsScenario["check"]>[0]) => newConns(ctx).some((c) => c.port === 9000);

export const scenarios: WsScenario[] = [
  {
    id: "by-hand",
    title: l("Elle hesapla", "Work it out by hand"),
    story: l(
      `Bir arkadaşın kendi WebSocket sunucusunu yazıyor ve kodunu doğru bir değerle denemek istiyor. İstemcinin key'i \`${WIKI_KEY}\`. Sunucunun dönmesi gereken accept değeri ne?`,
      `A friend is writing their own WebSocket server and wants to test their code against a right answer. The client's key is \`${WIKI_KEY}\`. What accept value should the server send back?`,
    ),
    goal: l("Bu key'in accept değerini terminalde hesapla.", "Work out this key's accept value in the terminal."),
    start: FREE,
    hints: [
      l("Tarif: key ve GUID'i yan yana yaz, SHA-1'ini al, çıkan 20 baytı base64'e çevir. GUID: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`.", "The recipe: write the key and the GUID side by side, take the SHA-1, turn the 20 bytes into base64. The GUID: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`."),
      l(
        "Metni `printf '%s'` ile ver (`echo` sona satır sonu ekler). `openssl sha1` varsayılan olarak hex yazar; base64'e ham baytlar lazım: `-binary`.",
        "Feed the text with `printf '%s'` (`echo` adds a newline). `openssl sha1` prints hex by default; base64 needs the raw bytes: `-binary`.",
      ),
      l(
        `\`printf '%s' '${WIKI_KEY}258EAFA5-E914-47DA-95CA-C5AB0DC85B11' | openssl sha1 -binary | base64\``,
        `\`printf '%s' '${WIKI_KEY}258EAFA5-E914-47DA-95CA-C5AB0DC85B11' | openssl sha1 -binary | base64\``,
      ),
    ],
    par: 1,
    check: (ctx) => ctx.state.printed.includes(acceptFor(WIKI_KEY)),
  },
  {
    id: "check-the-server",
    title: l("Sunucuyu doğrula", "Check the server"),
    story: l(
      "Kendi hesabınla sunucunun hesabını karşılaştırmak istiyorsun: rastgele bir key üret, accept'ini kendin hesapla, sonra aynı key'le `localhost:8081`'e el sıkış ve sunucunun aynı değeri döndüğünü gör.",
      "You want to compare your own sum with the server's: make a random key, work out its accept yourself, then do a handshake with that key against `localhost:8081` and see the server send back the same value.",
    ),
    goal: l("Ürettiğin bir key için accept'i hesapla ve aynı key'le 101 al.", "Work out the accept for a key you made, and get a 101 with that key."),
    start: FREE,
    hints: [
      l(
        "Key: `openssl rand -base64 16`. Bir değişkene koyarsan iki komutta da kullanırsın: `KEY=$(openssl rand -base64 16)`.",
        "Key: `openssl rand -base64 16`. Put it in a variable to use it in both commands: `KEY=$(openssl rand -base64 16)`.",
      ),
      l(
        "Değişkenin hemen ardından GUID gelecek: `\"$KEY258EAFA5...\"` yazarsan bash `KEY258EAFA5` adında bir değişken arar. Süslü parantez kullan: `\"${KEY}258EAFA5...\"`.",
        "The GUID comes right after the variable: write `\"$KEY258EAFA5...\"` and bash looks for a variable named `KEY258EAFA5`. Use braces: `\"${KEY}258EAFA5...\"`.",
      ),
      l(
        "`KEY=$(openssl rand -base64 16)`, `printf '%s' \"${KEY}258EAFA5-E914-47DA-95CA-C5AB0DC85B11\" | openssl sha1 -binary | base64`, `curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H \"Sec-WebSocket-Key: $KEY\" localhost:8081`",
        "`KEY=$(openssl rand -base64 16)`, `printf '%s' \"${KEY}258EAFA5-E914-47DA-95CA-C5AB0DC85B11\" | openssl sha1 -binary | base64`, `curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H \"Sec-WebSocket-Key: $KEY\" localhost:8081`",
      ),
    ],
    par: 3,
    check: (ctx) =>
      newExchanges(ctx).some((e) => {
        const key = header(e.headers, "sec-websocket-key");
        return e.status === 101 && key !== undefined && ctx.state.printed.includes(key) && ctx.state.printed.includes(acceptFor(key)) && header(e.respHeaders, "sec-websocket-accept") === acceptFor(key);
      }),
  },
  {
    id: "forgot-the-guid",
    title: l("Unutulan GUID", "The forgotten GUID"),
    story: l(
      "Ekibin eski el sıkışma sunucusu (`server.js`, `:9000`'de çalışıyor) tarayıcılarda bağlanmıyor. Konsolda şu yazıyor: \"Error during WebSocket handshake: Incorrect 'Sec-WebSocket-Accept' header value\". Kodu bul, düzelt, sunucuyu yeniden başlat ve gerçekten bağlanılabildiğini gör.",
      "The team's old hand-written handshake server (`server.js`, running on `:9000`) won't connect in browsers. The console says: \"Error during WebSocket handshake: Incorrect 'Sec-WebSocket-Accept' header value\". Find the code, fix it, restart the server and see that a client really connects.",
    ),
    goal: l("server.js'i düzelt, yeniden başlat ve `wscat` ile :9000'e bağlan.", "Fix server.js, restart it, and connect to :9000 with `wscat`."),
    start: broken(SERVER_NO_GUID),
    hints: [
      l(
        "`wscat -c ws://localhost:9000` aynı hatayı gösterir. `cat server.js` ile accept'in nasıl hesaplandığına bak ve tarifle karşılaştır.",
        "`wscat -c ws://localhost:9000` shows the same error. Look at how `cat server.js` computes the accept and compare it with the recipe.",
      ),
      l(
        "`GUID` tanımlanmış ama hesaba girmiyor. `nano server.js` ile düzelt. Çalışan süreç eski kodu kullanmaya devam eder: `pkill -f server.js` ile durdurup `node server.js &` ile yeniden başlat.",
        "`GUID` is defined but never used in the sum. Fix it with `nano server.js`. The running process keeps the old code: stop it with `pkill -f server.js` and start it again with `node server.js &`.",
      ),
      l(
        "`nano server.js` (`.update(key)` → `.update(key + GUID)`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9000`",
        "`nano server.js` (`.update(key)` → `.update(key + GUID)`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9000`",
      ),
    ],
    par: 4,
    check: connectedTo9000,
  },
  {
    id: "hex-digest",
    title: l("Hex mi base64 mü?", "Hex or base64?"),
    story: l(
      "Biri aynı sunucuyu düzeltmeye çalışmış: GUID artık hesapta, ama tarayıcı hâlâ bağlanmıyor. `server.js` `:9000`'de çalışıyor. Bu kez sorun başka bir yerde.",
      "Someone tried to fix the same server: the GUID is in the sum now, but the browser still won't connect. `server.js` runs on `:9000`. This time the problem is somewhere else.",
    ),
    goal: l("server.js'i düzelt, yeniden başlat ve `wscat` ile :9000'e bağlan.", "Fix server.js, restart it, and connect to :9000 with `wscat`."),
    start: broken(SERVER_HEX),
    hints: [
      l(
        "`curl -i` ile bir el sıkışma yapıp `Sec-WebSocket-Accept`'e bak: 28 karakterlik bir base64 mi, yoksa 40 karakterlik hex mi?",
        "Do a handshake with `curl -i` and look at `Sec-WebSocket-Accept`: is it 28 characters of base64, or 40 of hex?",
      ),
      l(
        "Accept, SHA-1'in 20 baytının base64 hali olmalı. `digest(\"hex\")` aynı baytları hex metin olarak verir.",
        "The accept must be the SHA-1's 20 bytes in base64. `digest(\"hex\")` gives the same bytes as hex text.",
      ),
      l(
        "`nano server.js` (`digest(\"hex\")` → `digest(\"base64\")`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9000`",
        "`nano server.js` (`digest(\"hex\")` → `digest(\"base64\")`), `pkill -f server.js`, `node server.js &`, `wscat -c ws://localhost:9000`",
      ),
    ],
    par: 4,
    check: connectedTo9000,
  },
];
