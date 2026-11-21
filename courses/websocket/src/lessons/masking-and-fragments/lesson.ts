import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const maskingAndFragments: Lesson = {
  slug: "masking-and-fragments",
  title: l("Mask ve parçalı mesajlar", "Masking and fragments"),
  summary: l(
    "İstemci neden her frame'i maskeler, maske nasıl çözülür; bir mesaj nasıl birkaç frame'e bölünür ve alan taraf onu neden tek mesaj olarak görür.",
    "Why a client masks every frame and how a mask comes off; how one message is split across several frames, and why the receiver still sees one message.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Maskelemenin XOR olduğunu görmek", "See that masking is XOR"), step: 0 },
    { text: l("Her frame'in yeni bir anahtar aldığını görmek", "See every frame get a fresh key"), step: 1 },
    { text: l("Maskelemenin neden var olduğunu bilmek", "Know why masking exists"), step: 2 },
    { text: l("Parçalı bir mesajın tek mesaj olarak alındığını görmek", "See a fragmented message received as one"), step: 3 },
    { text: l("Kimin, ne zaman parçaladığını bilmek", "Know who splits messages, and when"), step: 4 },
  ],
  steps: [
    {
      short: l("XOR", "XOR"),
      tag: "how",
      title: l("Maske bir XOR'dur", "A mask is an XOR"),
      body: [
        l(
          "Tarayıcı her frame için 4 rastgele bayt seçer (maske anahtarı) ve verinin her baytını anahtarın bir baytıyla XOR'lar: 1. bayt anahtarın 1. baytıyla, 5. bayt yine 1. baytıyla, böyle döner.",
          "The browser picks 4 random bytes for each frame (the masking key) and XORs every data byte with one byte of the key: byte 1 with key byte 1, byte 5 with key byte 1 again, and so round.",
        ),
        l(
          "Anahtar frame'in içinde açıkça gider. Sunucu aynı XOR'u yapar ve veriyi geri alır. Yani maske bir şifre değildir; kabloyu dinleyen herkes çözebilir.",
          "The key travels openly inside the frame. The server applies the same XOR and gets the data back. So a mask is not encryption; anyone listening on the wire can undo it.",
        ),
      ],
    },
    {
      short: l("Yeni anahtar", "Fresh key"),
      tag: "experiment",
      predict: {
        question: l(
          "Tarayıcı aynı `merhaba` mesajını bir kez daha gönderiyor. Kablodaki baytlar ilk seferkiyle aynı mı olur?",
          "The browser sends the same `merhaba` once more. Are the bytes on the wire the same as the first time?",
        ),
        options: [
          l("Evet, aynı mesaj aynı bayt", "Yes, the same message gives the same bytes"),
          l("Hayır: yeni bir maske anahtarı, bambaşka baytlar", "No: a new masking key, completely different bytes"),
          l("Sadece başlık değişir", "Only the header changes"),
          l("Tarayıcı ikinciyi göndermez", "The browser doesn't send it twice"),
        ],
        answer: 1,
        why: l(
          "Her frame yeni bir rastgele anahtar alır, bu yüzden aynı mesaj kabloda her seferinde başka baytlar olur. Saldırgan, istemciye ne gönderttiğini bilse bile kablodaki baytları önceden kestiremez.",
          "Every frame gets a new random key, so the same message becomes different bytes on the wire every time. Even an attacker who knows what the client sends cannot predict the bytes on the wire.",
        ),
      },
      title: l("Her frame'e yeni anahtar", "A new key for every frame"),
      body: [
        l(
          "İkinci `merhaba` başka bir anahtarla gitti; maskeli baytlar da tamamen farklı. Sunucu ikisini de aynı `merhaba` olarak okur.",
          "The second `merhaba` went out with a different key, and its masked bytes are completely different. The server reads both as the same `merhaba`.",
        ),
      ],
    },
    {
      short: l("Neden?", "Why?"),
      tag: "idea",
      title: l("Maske kimi koruyor?", "Who does the mask protect?"),
      body: [
        l(
          "Sunucuyu değil, aradaki eski proxy'leri ve önbellekleri. 2010'daki bir araştırma şunu gösterdi: kötü niyetli bir sayfa, maskesiz bir protokolle istediği baytları kabloya yazdırabilseydi, WebSocket'i anlamayan bir proxy o baytları sıradan bir HTTP isteği sanabilirdi. Sonra sahte bir cevabı başka bir sitenin adına önbelleğe alıp herkese dağıtabilirdi (cache poisoning).",
          "Not the server: the old proxies and caches in between. A 2010 study showed that if a malicious page could put bytes of its choosing on the wire with an unmasked protocol, a proxy that didn't understand WebSocket might read them as a plain HTTP request, then cache a fake answer under another site's name and serve it to everyone (cache poisoning).",
        ),
        l(
          "Rastgele maske, sayfanın kablodaki baytları seçmesini imkânsız kılar. Bu yüzden kural kesin: istemci her frame'i maskeler. Maskesiz bir istemci frame'i alan sunucu bağlantıyı `1002` (protocol error) ile kapatır. Sunucudan gelen frame'ler hiç maskelenmez, çünkü saldırgan sayfa tarayıcıda çalışır, sunucuda değil.",
          "A random mask makes it impossible for the page to choose the bytes on the wire. Hence the strict rule: a client masks every frame. A server that receives an unmasked client frame closes with `1002` (protocol error). Frames from the server are never masked, because the attacking page runs in the browser, not on the server.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Maske gizlilik sağlamaz. Bağlantının içeriğini korumak için `wss://` (TLS) gerekir.",
            "A mask gives no privacy. Protecting what's on the connection takes `wss://` (TLS).",
          ),
        },
      ],
    },
    {
      short: l("Parçalar", "Fragments"),
      tag: "how",
      predict: {
        question: l(
          "Sunucu bir logu üç frame'e bölerek gönderiyor: ilk ikisinde FIN=0, sonuncusunda FIN=1. Dizüstündeki sayfanın `onmessage`'ı kaç kez çalışır?",
          "The server sends a log split over three frames: FIN=0 on the first two, FIN=1 on the last. How many times does the laptop page's `onmessage` run?",
        ),
        options: [l("0", "0"), l("1", "1"), l("3", "3"), l("Tarayıcıya göre değişir", "It depends on the browser")],
        answer: 1,
        why: l(
          "Alan taraf parçaları biriktirir ve FIN=1 gelince tek bir mesaj olarak verir. Parçalama tamamen protokolün içinde kalır; uygulama kodu bunu hiç görmez.",
          "The receiver collects the fragments and hands them over as one message when FIN=1 arrives. Fragmenting stays inside the protocol; application code never sees it.",
        ),
      },
      title: l("Bir mesaj, birkaç frame", "One message, several frames"),
      body: [
        l(
          "`stream.js` logu üç parça halinde gönderdi: ilk frame'in opcode'u `1` (text) ve FIN=0, sonrakiler opcode `0` (devam). Sonuncusunda FIN=1.",
          "`stream.js` sent the log in three pieces: the first frame has opcode `1` (text) and FIN=0, the next ones opcode `0` (continuation). The last has FIN=1.",
        ),
        l(
          "Bunun faydası: sunucu mesajın tamamını önce bellekte toplamak zorunda değil; büyük bir dosyayı ya da üretildikçe çıkan bir çıktıyı parça parça yollayabilir.",
          "The point: the server does not have to gather the whole message in memory first; it can send a large file, or output produced as it goes, piece by piece.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Node · ws", code: 'parts.forEach((part, i) => {\n  ws.send(part, { fin: i === parts.length - 1 });\n});' }],
      },
    },
    {
      short: l("Kurallar", "Rules"),
      tag: "reality",
      title: l("Kim parçalar, araya ne girebilir?", "Who splits, and what may come in between?"),
      body: [
        l(
          "Tarayıcıdaki JavaScript parçalı mesaj gönderemez: `ws.send` her zaman tek bir mesaj yollar. Parçalamayı sunucu kütüphaneleri (ws'de `fin: false`) ya da aradaki altyapı yapar.",
          "JavaScript in a browser cannot send a fragmented message: `ws.send` always sends one message. Splitting is done by server libraries (`fin: false` in ws) or by the infrastructure in between.",
        ),
        l(
          "Parçaların arasına kontrol frame'leri girebilir: uzun bir mesajın ortasında bir ping gelebilir ve hemen cevaplanır. Mesaj boyutu sınırları (ws'de `maxPayload`) tek tek frame'lere değil, toplanmış mesajın tamamına uygulanır.",
          "Control frames may come between fragments: a ping can arrive in the middle of a long message and get its answer at once. Message size limits (`maxPayload` in ws) apply to the whole gathered message, not to single frames.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Echo sunucusu `:9001`'de, parçasız log sunucusu `logs.js` `:9002`'de, parçalı log sunucusu `stream.js` `:9003`'te. **4 senaryo** var.",
          "Your turn. The echo server is on `:9001`, the unsplit log server `logs.js` on `:9002`, the fragmenting `stream.js` on `:9003`. There are **4 scenarios**.",
        ),
        l(
          "Frame'leri `sudo tshark -i lo -Y websocket [-O websocket] &` ile izle, kısa hesapları `node -e '...'` ile yap, `nano` ile düzenlediğin sunucuyu `pkill -f` ve `node ... &` ile yeniden başlat.",
          "Watch frames with `sudo tshark -i lo -Y websocket [-O websocket] &`, do quick sums with `node -e '...'`, and restart a server you edited with `nano` using `pkill -f` and `node ... &`.",
        ),
      ],
    },
  ],
  recap: [
    l("Maske, her frame için seçilen 4 baytlık rastgele bir anahtarla yapılan XOR'dur; anahtar frame'in içinde gider.", "A mask is an XOR with a random 4-byte key chosen for each frame; the key travels in the frame."),
    l("Aynı mesaj her gönderimde başka baytlar olur; amaç, sayfanın kablodaki baytları seçememesi.", "The same message becomes different bytes each time; the point is that a page cannot choose the bytes on the wire."),
    l("Maske proxy önbelleklerini zehirlemeye karşıdır, gizlilik sağlamaz; gizlilik için `wss://`.", "Masking guards proxy caches against poisoning; it gives no privacy. For privacy: `wss://`."),
    l("Bir mesaj birkaç frame'e bölünebilir (FIN=0 … FIN=1); alan taraf onu tek mesaj olarak görür.", "A message can be split over several frames (FIN=0 … FIN=1); the receiver sees one message."),
    l("Tarayıcı JS'i parçalayamaz; ping parçaların arasına girebilir; boyut sınırı mesajın tamamına uygulanır.", "Browser JS cannot fragment; a ping may come between fragments; size limits apply to the whole message."),
  ],
  quiz: [
    {
      question: l("Maskeli bir frame'in verisini kim çözebilir?", "Who can unmask a masked frame's data?"),
      options: [
        l("Sadece sunucu", "Only the server"),
        l("Kabloyu dinleyen herkes: anahtar frame'in içinde", "Anyone listening: the key is in the frame"),
        l("Kimse", "Nobody"),
        l("Sadece TLS sertifikası olanlar", "Only those with the TLS certificate"),
      ],
      answer: 1,
      explain: l("Anahtar açıkça gider; maske şifre değildir.", "The key travels openly; a mask is not encryption."),
      reviewStep: 0,
    },
    {
      question: l("Maskeleme hangi saldırıya karşı eklendi?", "Which attack was masking added against?"),
      options: [
        l("Parola çalmaya", "Password theft"),
        l("Aradaki proxy'lerin önbelleğini zehirlemeye", "Poisoning the caches of proxies in between"),
        l("DDoS'a", "DDoS"),
        l("SQL injection'a", "SQL injection"),
      ],
      answer: 1,
      explain: l("Sayfa kablodaki baytları seçemesin diye: WebSocket'i bilmeyen bir proxy sahte bir HTTP isteğine kanmasın.", "So a page cannot choose the bytes on the wire, and a proxy that doesn't know WebSocket can't be fooled by a fake HTTP request."),
      reviewStep: 2,
    },
    {
      question: l("Bir mesaj 4 frame'e bölündü. İlk frame'in opcode'u ve FIN'i ne?", "A message is split over 4 frames. What are the first frame's opcode and FIN?"),
      options: [
        l("opcode 0, FIN 1", "opcode 0, FIN 1"),
        l("opcode 1 (ya da 2), FIN 0", "opcode 1 (or 2), FIN 0"),
        l("opcode 1, FIN 1", "opcode 1, FIN 1"),
        l("opcode 9, FIN 0", "opcode 9, FIN 0"),
      ],
      answer: 1,
      explain: l("İlk frame mesajın türünü söyler (text ya da binary) ve FIN=0 ile \"devamı var\" der; sonrakiler opcode 0.", "The first frame names the message type (text or binary) and says \"more to come\" with FIN=0; the rest use opcode 0."),
      reviewStep: 3,
    },
    {
      question: l("Uzun bir mesajın parçaları arasında ne gelebilir?", "What may arrive between the fragments of a long message?"),
      options: [
        l("Başka bir text mesajı", "Another text message"),
        l("Bir ping (kontrol frame'i)", "A ping (a control frame)"),
        l("Yeni bir el sıkışma", "A new handshake"),
        l("Hiçbir şey", "Nothing"),
      ],
      answer: 1,
      explain: l("Kontrol frame'leri araya girebilir; başka bir veri mesajı giremez.", "Control frames may come in between; another data message may not."),
      reviewStep: 4,
    },
  ],
};
