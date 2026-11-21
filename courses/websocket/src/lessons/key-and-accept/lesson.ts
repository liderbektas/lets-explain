import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const PIPE = "printf '%s' 'dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11' | openssl sha1 -binary | base64";

export const keyAndAccept: Lesson = {
  slug: "key-and-accept",
  title: l("Key ve Accept", "Key and Accept"),
  summary: l(
    "İstemci rastgele bir key gönderir, sunucu ondan bir accept hesaplar. Tarifi adım adım izle, terminalde kendin hesapla ve hesabı yanlış yapan bir sunucuyu düzelt.",
    "The client sends a random key and the server works out an accept from it. Follow the recipe step by step, work it out yourself in a terminal, and fix a server that gets it wrong.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Key ile accept'in el sıkışmadaki yerini görmek", "See where the key and accept sit in the handshake"), step: 0 },
    { text: l("Accept tarifini adım adım izlemek", "Follow the accept recipe step by step"), step: 1 },
    { text: l("Aynı key'in hep aynı accept'i verdiğini görmek", "See the same key always give the same accept"), step: 2 },
    { text: l("Terminalde hesaplarken iki klasik hatayı tanımak", "Know the two classic slips when working it out in a terminal"), step: 3 },
    { text: l("Accept'in güvenlik olmadığını bilmek", "Know that the accept is not security"), step: 4 },
  ],
  steps: [
    {
      short: l("Key, accept", "Key, accept"),
      tag: "idea",
      title: l("Neden bir key var?", "Why is there a key?"),
      body: [
        l(
          "El sıkışmada istemci bir `Sec-WebSocket-Key` gönderiyor ([[key|key]]), sunucu da bir `Sec-WebSocket-Accept` dönüyor ([[accept|accept]]). İkisi de kalın satırlarda.",
          "In the handshake the client sends a `Sec-WebSocket-Key` ([[key|key]]) and the server sends back a `Sec-WebSocket-Accept` ([[accept|accept]]). Both are on the bold lines.",
        ),
        l(
          "Bu ikili bir soru-cevap. İstemci \"bu key'den doğru accept'i çıkar\" diyor. Doğru cevabı ancak WebSocket'i gerçekten bilen bir sunucu verebilir. Yanlışlıkla gelen eski bir önbellek cevabı ya da isteği anlamadan geri yollayan bir sunucu bunu beceremez.",
          "The pair is a question and an answer. The client says \"work out the right accept from this key\". Only a server that really speaks WebSocket can answer correctly; a stale cached answer, or a server that echoes requests back without understanding them, can't.",
        ),
      ],
    },
    {
      short: l("Tarif", "Recipe"),
      tag: "how",
      title: l("Accept nasıl hesaplanır?", "How the accept is worked out"),
      body: [
        l(
          "Tarif RFC 6455'te sabit ve dört adım. Sunucu key'in sonuna herkes için aynı olan bir [[guid|GUID]] ekler: `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`. Çıkan metnin [[sha1|SHA-1]]'ini alır (20 bayt). O 20 baytı [[base64]]'e çevirir. Sonuç accept'tir.",
          "The recipe is fixed in RFC 6455 and has four steps. The server appends a [[guid|GUID]] that is the same for everyone, `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, to the key. It takes the [[sha1|SHA-1]] of that text (20 bytes). It turns those 20 bytes into [[base64]]. The result is the accept.",
        ),
        l(
          "Sahnedeki değerler gerçek: bu key RFC'nin kendi örneği, sonuç da RFC'de yazan `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`. Sunucunun gönderdiği değerle aynı.",
          "The values on stage are real: this key is the RFC's own example, and the result is the `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=` written in the RFC. It matches what the server sent.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Key'in kendisi de bir şey anlatır: `dGhlIHNhbXBsZSBub25jZQ==`'yu base64'ten çözersen `the sample nonce` çıkar. Gerçek tarayıcılar ise 16 rastgele bayt gönderir.",
            "The key itself says something: decode `dGhlIHNhbXBsZSBub25jZQ==` from base64 and you get `the sample nonce`. Real browsers send 16 random bytes.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "echo dGhlIHNhbXBsZSBub25jZQ== | base64 -d", note: l("`the sample nonce`", "`the sample nonce`") }],
        snippets: [
          {
            label: "Node · crypto",
            code: 'const crypto = require("crypto");\nconst GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";\nconst accept = crypto.createHash("sha1").update(key + GUID).digest("base64");',
          },
        ],
      },
    },
    {
      short: l("Aynı key", "Same key"),
      tag: "experiment",
      predict: {
        question: l(
          "Aynı key ile bir kez daha el sıkışıyoruz. Sunucunun accept'i ilk seferkiyle aynı mı olur?",
          "We do another handshake with the same key. Is the server's accept the same as the first time?",
        ),
        options: [
          l("Hayır, her seferinde rastgele", "No, it's random every time"),
          l("Evet, hesap hep aynı sonucu verir", "Yes, the sum always gives the same result"),
          l("Sadece aynı saniyedeyse", "Only within the same second"),
          l("Sunucuya göre değişir", "It depends on the server"),
        ],
        answer: 1,
        why: l(
          "SHA-1 aynı girdiye hep aynı özeti verir ve GUID sabit. Aynı key, aynı accept. Değişen tek şey key: tarayıcı her bağlantıda yeni bir key üretir.",
          "SHA-1 always gives the same digest for the same input, and the GUID is fixed. Same key, same accept. The only thing that changes is the key: the browser makes a fresh one for every connection.",
        ),
      },
      title: l("Aynı key, aynı accept", "Same key, same accept"),
      body: [
        l(
          "İlk iki satır aynı key, aynı accept. Üçüncüsü tarayıcının açtığı bir bağlantı: kendi rastgele key'ini üretti, accept de ona göre bambaşka çıktı.",
          "The first two rows: the same key, the same accept. The third is a connection the browser opened: it made its own random key, so its accept is completely different.",
        ),
        l(
          "Yani gerçekte her bağlantının accept'i farklıdır, ama bunun sebebi hesabın rastgele olması değil, key'in rastgele olması.",
          "So in practice every connection's accept is different, not because the sum is random, but because the key is.",
        ),
      ],
    },
    {
      short: l("Terminalde", "In a terminal"),
      tag: "how",
      title: l("Terminalde hesaplamak", "Working it out in a terminal"),
      body: [
        l(
          "Tarifin terminaldeki karşılığı tek bir satır: `printf` metni verir, `openssl sha1 -binary` 20 baytı çıkarır, `base64` onları metne çevirir.",
          "In a terminal the recipe is one line: `printf` supplies the text, `openssl sha1 -binary` produces the 20 bytes, `base64` turns them into text.",
        ),
        l(
          "İki klasik hata var ve ikisi de sessizce yanlış sonuç verir. `echo` metnin sonuna bir satır sonu (`\\n`) ekler; SHA-1 o satır sonunu da hesaba katar. `-binary` olmadan `openssl sha1` hex metin yazar (`SHA1(stdin)= b37a…`); onu base64'e çevirmek ham baytları değil, o metni çevirmek olur.",
          "There are two classic slips, and both give a wrong answer silently. `echo` adds a newline (`\\n`) at the end, and SHA-1 counts that newline too. Without `-binary`, `openssl sha1` prints hex text (`SHA1(stdin)= b37a…`); base64'ing that encodes the text, not the raw bytes.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Key bir değişkendeyse ve hemen ardından GUID geliyorsa `\"$KEY258EAFA5...\"` yazma: bash bunu `KEY258EAFA5` adında başka bir değişken sanar. `\"${KEY}258EAFA5...\"` yaz.",
            "If the key is in a variable and the GUID follows right after, don't write `\"$KEY258EAFA5...\"`: bash reads that as a different variable named `KEY258EAFA5`. Write `\"${KEY}258EAFA5...\"`.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: PIPE, note: l("`s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`", "`s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`") }],
      },
    },
    {
      short: l("Güvenlik değil", "Not security"),
      tag: "reality",
      title: l("Accept bir güvenlik önlemi değil", "The accept is not security"),
      body: [
        l(
          "Elle yazılmış bir sunucu çalıştırdık: key'den accept hesaplıyor ama GUID'i eklemeyi unutmuş. Tarayıcı accept'i kendisi de hesaplıyor, tutmadığını görünce bağlantıyı reddediyor: \"Incorrect 'Sec-WebSocket-Accept' header value\".",
          "We ran a hand-written server: it works out an accept from the key but forgot to add the GUID. The browser works the accept out itself too, sees it doesn't match and refuses the connection: \"Incorrect 'Sec-WebSocket-Accept' header value\".",
        ),
        l(
          "Yani accept'in tek işi \"bu sunucu WebSocket biliyor\" demek. Tarifi herkes bilir, herkes hesaplayabilir: accept kimseyi doğrulamaz, hiçbir şeyi şifrelemez. Kimin bağlandığını denetlemek ve bağlantıyı şifrelemek başka işler: kimlik doğrulama ve `wss://` (güvenlik dersi).",
          "So the accept's only job is to say \"this server speaks WebSocket\". Everyone knows the recipe and anyone can work it out: the accept authenticates nobody and encrypts nothing. Checking who connects and encrypting the connection are other jobs: authentication and `wss://` (the security lesson).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek projelerde el sıkışmayı elle yazmazsın; `ws`, Socket.IO, uWebSockets gibi kütüphaneler bunu doğru yapar. Ama bir proxy, bir test aracı ya da gömülü bir cihaz yazarken bu hata sık görülür.",
            "In real projects you don't write the handshake by hand; libraries like `ws`, Socket.IO and uWebSockets get it right. But this bug shows up often when people write a proxy, a test tool or firmware for a device.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "wscat -c ws://localhost:9000", note: l("ws istemcisi accept'i kontrol eder: `error: Invalid Sec-WebSocket-Accept header`.", "The ws client checks the accept: `error: Invalid Sec-WebSocket-Accept header`.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. **4 senaryo** var: bir accept'i elle hesaplamak, sunucunun hesabını doğrulamak ve elle yazılmış, el sıkışması bozuk bir sunucuyu iki kez düzeltmek.",
          "Your turn. There are **4 scenarios**: working out an accept by hand, checking the server's sum, and twice fixing a hand-written server whose handshake is broken.",
        ),
        l(
          "Hesap için `printf`, `openssl` ve `base64`'ü `|` ile birleştir. `server.js` gerçekten çalışan bir Node dosyası: `nano` ile düzenle, `pkill -f server.js` ile durdur, `node server.js &` ile başlat. Az komutla bitirirsen 3 yıldız.",
          "For the sum, chain `printf`, `openssl` and `base64` with `|`. `server.js` is a Node file that really runs: edit it with `nano`, stop it with `pkill -f server.js`, start it with `node server.js &`. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("İstemci her bağlantıda rastgele bir [[key|Sec-WebSocket-Key]] gönderir (16 bayt, base64).", "The client sends a random [[key|Sec-WebSocket-Key]] with each connection (16 bytes, base64)."),
    l("Accept = base64(SHA-1(key + GUID)); GUID herkes için aynı.", "Accept = base64(SHA-1(key + GUID)); the GUID is the same for everyone."),
    l("Aynı key hep aynı accept'i verir; bağlantıdan bağlantıya değişen key'dir.", "The same key always gives the same accept; what changes from connection to connection is the key."),
    l("Terminalde `printf '%s'` ve `openssl sha1 -binary` kullan: `echo` satır sonu ekler, `-binary`'siz hali hex yazar.", "In a terminal use `printf '%s'` and `openssl sha1 -binary`: `echo` adds a newline, and without `-binary` it prints hex."),
    l("İstemci accept'i kendisi de hesaplar ve tutmazsa bağlanmaz. Accept güvenlik değildir.", "The client works the accept out too and won't connect if it doesn't match. The accept is not security."),
  ],
  quiz: [
    {
      question: l("Sunucu accept'i hesaplarken key'e ne ekler?", "What does the server add to the key when it works out the accept?"),
      options: [
        l("Kendi gizli anahtarını", "Its own secret key"),
        l("RFC 6455'teki sabit GUID'i", "The fixed GUID from RFC 6455"),
        l("O anki saati", "The current time"),
        l("Hiçbir şey eklemez", "Nothing"),
      ],
      answer: 1,
      explain: l("GUID herkes için aynı; tarif gizli değil. `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`.", "The GUID is the same for everyone; the recipe is not secret. `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`."),
      reviewStep: 1,
    },
    {
      question: l("`echo` ile hesapladığın accept sunucununkiyle tutmuyor. Neden?", "The accept you worked out with `echo` doesn't match the server's. Why?"),
      options: [
        l("echo metni büyük harfe çevirir", "echo turns the text upper case"),
        l("echo sona bir satır sonu ekler ve SHA-1 onu da hesaba katar", "echo adds a newline and SHA-1 counts it too"),
        l("echo base64 kullanır", "echo uses base64"),
        l("Sunucu yanlış hesaplıyor", "The server is wrong"),
      ],
      answer: 1,
      explain: l("Tek bir bayt farkı bile bambaşka bir SHA-1 verir. `printf '%s'` ya da `echo -n` kullan.", "Even one byte of difference gives a completely different SHA-1. Use `printf '%s'` or `echo -n`."),
      reviewStep: 3,
    },
    {
      question: l("Accept değeri neyi kanıtlar?", "What does the accept value prove?"),
      options: [
        l("Kullanıcının giriş yaptığını", "That the user is logged in"),
        l("Bağlantının şifreli olduğunu", "That the connection is encrypted"),
        l("Sunucunun WebSocket'i gerçekten anladığını", "That the server really speaks WebSocket"),
        l("Mesajların bozulmadığını", "That messages arrive intact"),
      ],
      answer: 2,
      explain: l("Tarifi herkes bilir. Accept sadece karşıdakinin WebSocket konuştuğunu gösterir; kimlik doğrulama ve şifreleme başka işler.", "Everyone knows the recipe. The accept only shows the other side speaks WebSocket; authentication and encryption are other jobs."),
      reviewStep: 4,
    },
    {
      question: l("Bir sunucuda accept 40 karakterlik bir hex metin. Ne yanlış?", "A server's accept is 40 characters of hex. What's wrong?"),
      options: [
        l("GUID yanlış", "The GUID is wrong"),
        l("SHA-1'in baytları base64 yerine hex olarak yazılmış", "The SHA-1 bytes were written as hex instead of base64"),
        l("Key çok uzun", "The key is too long"),
        l("Hiçbir şey, ikisi de olur", "Nothing; either works"),
      ],
      answer: 1,
      explain: l("20 bayt hex'te 40, base64'te 28 karakter. Accept base64 olmalı.", "20 bytes are 40 characters in hex and 28 in base64. The accept must be base64."),
      reviewStep: 3,
    },
  ],
};
