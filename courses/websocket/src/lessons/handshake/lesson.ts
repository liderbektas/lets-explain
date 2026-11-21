import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const FULL = "curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081";

export const handshake: Lesson = {
  slug: "handshake",
  title: l("El sıkışma", "The handshake"),
  summary: l(
    "Her WebSocket bir HTTP isteğiyle başlar. O isteği ve 101 cevabını satır satır oku, sonra bozup 426 ve 400'ün nereden geldiğini gör.",
    "Every WebSocket starts as an HTTP request. Read that request and its 101 answer line by line, then break it and see where 426 and 400 come from.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("El sıkışma isteğinin başlıklarını okumak", "Read the handshake request's headers"), step: 0 },
    { text: l("101'den sonra bağlantının WebSocket'e döndüğünü görmek", "See the connection turn into a WebSocket after 101"), step: 1 },
    { text: l("426'nın neden geldiğini bilmek", "Know why a 426 comes back"), step: 2 },
    { text: l("400'ün gövdesinden sebebi okumak", "Read the reason from a 400's body"), step: 3 },
    { text: l("Yanlış portu cevapsız kapanan bağlantıdan tanımak", "Recognise the wrong port by a connection that closes unanswered"), step: 4 },
  ],
  steps: [
    {
      short: l("İstek", "Request"),
      tag: "how",
      title: l("WebSocket bir HTTP isteğiyle başlar", "A WebSocket starts as an HTTP request"),
      body: [
        l(
          "Tarayıcı `new WebSocket(\"ws://localhost:8081\")` çalıştırınca ilk iş sıradan bir HTTP `GET` isteği gönderiyor. Solda o istek var, satırı satırına.",
          "When the browser runs `new WebSocket(\"ws://localhost:8081\")`, the first thing it sends is a plain HTTP `GET` request. That request is on the left, line by line.",
        ),
        l(
          "Kalın satırlar işi yapanlar. `Connection: Upgrade` ile `Upgrade: websocket` \"bu bağlantıyı WebSocket'e çevirelim\" der ([[upgrade]]). `Sec-WebSocket-Version: 13` protokolün sürümü. `Sec-WebSocket-Key` her bağlantıda yeniden üretilen rastgele bir değer; ne işe yaradığını bir sonraki derste göreceğiz.",
          "The bold lines do the work. `Connection: Upgrade` and `Upgrade: websocket` say \"let's turn this connection into a WebSocket\" ([[upgrade]]). `Sec-WebSocket-Version: 13` is the protocol version. `Sec-WebSocket-Key` is a random value made fresh for every connection; what it's for is the next lesson.",
        ),
        l(
          "Gri satırlar tarayıcının her istekte gönderdikleri: tarayıcının kim olduğu, dil, sıkıştırma ve çerez.",
          "The grey lines are what the browser sends with every request: who it is, the language, compression and the cookie.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Çerez de gidiyor: WebSocket açılırken tarayıcı o siteye ait çerezleri gönderir. Bunun neden önemli olduğunu güvenlik dersinde göreceğiz.",
            "The cookie goes too: when a WebSocket opens, the browser sends that site's cookies. Why that matters is in the security lesson.",
          ),
        },
      ],
      practice: {
        intro: l("Kendi sitende görmek için: DevTools → Network → WS sekmesi → bağlantıya tıkla → Headers.", "To see it on your own site: DevTools → Network → WS tab → click the connection → Headers."),
        commands: [],
        snippets: [{ label: "JavaScript · tarayıcı", code: 'const ws = new WebSocket("ws://localhost:8081");\nws.onopen = () => console.log("open");' }],
      },
    },
    {
      short: l("101", "101"),
      tag: "how",
      title: l("101 Switching Protocols", "101 Switching Protocols"),
      body: [
        l(
          "Sunucu `101 Switching Protocols` ile cevap verdi: \"tamam, protokol değiştiriyoruz\". Cevapta sadece üç başlık var: `Upgrade: websocket`, `Connection: Upgrade` ve `Sec-WebSocket-Accept` ([[accept]]).",
          "The server answered `101 Switching Protocols`: \"fine, we're switching\". The answer has just three headers: `Upgrade: websocket`, `Connection: Upgrade` and `Sec-WebSocket-Accept` ([[accept]]).",
        ),
        l(
          "101'den sonra bu [[tcp|TCP]] bağlantısında artık HTTP konuşulmuyor. Bağlantı açık kalıyor ve iki taraf da istediği zaman WebSocket [[frame|frame]]'leri gönderebiliyor. Yeni istek yok, cevap yok.",
          "After the 101 this [[tcp|TCP]] connection no longer speaks HTTP. It stays open and either side can send WebSocket [[frame|frames]] whenever it likes. No more requests, no more responses.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`ws://` düz bir bağlantı, `wss://` TLS ile şifreli bir bağlantı: `http://` ile `https://` arasındaki farkın aynısı. Gerçek sitelerde hep `wss://` kullanılır.",
            "`ws://` is a plain connection, `wss://` one encrypted with TLS: the same difference as between `http://` and `https://`. Real sites always use `wss://`.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: FULL, note: l("Tarayıcının yaptığını curl ile elle yapmak. `-i` cevabın başlıklarını gösterir.", "Doing by hand with curl what the browser does. `-i` shows the answer's headers.") }],
      },
    },
    {
      short: l("426", "426"),
      tag: "experiment",
      predict: {
        question: l(
          "Aynı isteği `Connection: Upgrade` ve `Upgrade: websocket` olmadan gönderelim. Sunucu ne yapar?",
          "Let's send the same request without `Connection: Upgrade` and `Upgrade: websocket`. What does the server do?",
        ),
        options: [
          l("Yine 101 döner", "Still answers 101"),
          l("Bunu sıradan bir HTTP isteği sayar ve 426 Upgrade Required döner", "Treats it as a plain HTTP request and answers 426 Upgrade Required"),
          l("Bağlantıyı hiç cevap vermeden kapatır", "Closes the connection without answering"),
          l("400 Bad Request döner", "Answers 400 Bad Request"),
        ],
        answer: 1,
        why: l(
          "Node bir isteği ancak bu iki başlık birlikte varsa upgrade sayar. Yoksa istek, ws'nin kendi küçük HTTP sunucusuna sıradan bir istek olarak düşer; o da her sıradan isteğe `426 Upgrade Required` der.",
          "Node treats a request as an upgrade only with both headers. Without them the request lands on ws's own little HTTP server as a plain request, and that server answers every plain request `426 Upgrade Required`.",
        ),
      },
      title: l("Upgrade başlıkları yoksa: 426", "No upgrade headers: 426"),
      body: [
        l(
          "Bu cevap `ws` kütüphanesinin kendi HTTP sunucusundan geliyor: `new WebSocketServer({ port: 8081 })` her sıradan isteğe 426 der, yani \"bu adres WebSocket istiyor\".",
          "This answer comes from the `ws` library's own HTTP server: `new WebSocketServer({ port: 8081 })` answers every plain request with 426, meaning \"this address wants a WebSocket\".",
        ),
        l(
          "Başka bir kurulumda cevap farklı olur. WebSocket'i Express'in yanına aynı porttan bağlasaydık bu istek Express'e düşerdi ve `404 Cannot GET /` alırdık. Yani 426 sunucuya göre değişir, ama \"upgrade başlıkları yoksa WebSocket de yok\" kuralı her yerde geçerli.",
          "Another setup would answer differently. Had we attached the WebSocket to Express on the same port, this request would land in Express and get `404 Cannot GET /`. So the 426 depends on the server, but the rule holds everywhere: no upgrade headers, no WebSocket.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl -i localhost:8081", note: l("Upgrade başlıkları olmadan: 426 Upgrade Required.", "Without the upgrade headers: 426 Upgrade Required.") }],
        snippets: [
          {
            label: "Node · ws",
            code: 'import { WebSocketServer } from "ws";\n\n// Its own HTTP server on 8081: plain requests get 426.\nconst wss = new WebSocketServer({ port: 8081 });\nwss.on("connection", (ws) => ws.send("hello"));',
          },
        ],
      },
    },
    {
      short: l("400", "400"),
      tag: "experiment",
      title: l("Key ya da sürüm yanlışsa: 400", "A bad key or version: 400"),
      body: [
        l(
          "Upgrade başlıkları tamam ama key `abc123`. `ws` key'in 16 baytın base64 hali olmasını (24 karakter, sonu `==`) bekliyor ve `400 Bad Request` ile sebebi yazıyor: `Missing or invalid Sec-WebSocket-Key header`.",
          "The upgrade headers are fine but the key is `abc123`. `ws` expects the key to be 16 bytes in base64 (24 characters ending in `==`) and answers `400 Bad Request` with the reason: `Missing or invalid Sec-WebSocket-Key header`.",
        ),
        l(
          "Sonra sürümü 12 yaptık. Yine 400, ama bu kez cevapta `Sec-WebSocket-Version: 13, 8` başlığı var: sunucu hangi sürümleri konuştuğunu söylüyor. Tarayıcılar hep 13 gönderir.",
          "Then we set the version to 12. Again 400, but this time the answer carries `Sec-WebSocket-Version: 13, 8`: the server says which versions it speaks. Browsers always send 13.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "400'ün gövdesi sebebi söylüyor. Bir el sıkışma başarısız olunca ilk iş `curl -i` ile cevabın tamamını okumak.",
            "The 400's body tells you why. When a handshake fails, the first thing to do is read the whole answer with `curl -i`.",
          ),
        },
      ],
    },
    {
      short: l("Yanlış port", "Wrong port"),
      tag: "reality",
      title: l("Yanlış port: cevap bile yok", "The wrong port: not even an answer"),
      body: [
        l(
          "Doğru isteği bu kez `:8080`'e, Express API'sine gönderdik. Bu sunucuda upgrade'i dinleyen kimse yok, ve Node böyle bir isteği cevapsız bırakıp bağlantıyı kapatıyor. curl bunu `(52) Empty reply from server` diye yazar, wscat `socket hang up` diye; tarayıcının konsolunda da \"WebSocket connection to 'ws://localhost:8080/' failed\" görünür.",
          "This time we sent the right request to `:8080`, the Express API. Nothing on that server listens for upgrades, so Node closes the connection without an answer. curl reports `(52) Empty reply from server`, wscat says `socket hang up`, and the browser's console shows \"WebSocket connection to 'ws://localhost:8080/' failed\".",
        ),
        l(
          "El sıkışma hatalarının çoğu şu dördünden biri: yanlış adres ya da port, eksik upgrade başlıkları, geçersiz key ya da sürüm, ve bir sonraki derste göreceğimiz yanlış accept.",
          "Most handshake failures are one of four: the wrong address or port, missing upgrade headers, an invalid key or version, and a wrong accept, which is the next lesson.",
        ),
      ],
      practice: {
        commands: [{ cmd: "wscat -c ws://localhost:8080", note: l("`error: socket hang up`: orada WebSocket dinleyen yok.", "`error: socket hang up`: nothing there listens for WebSockets.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. WebSocket sunucusu `localhost:8081`'de, API `localhost:8080`'de. Aşağıda **4 senaryo** var: elle el sıkışma, bir 426'nın sebebi, sabit bir key ve bir hata rehberi.",
          "Your turn. The WebSocket server is at `localhost:8081`, the API at `localhost:8080`. Below are **4 scenarios**: a handshake by hand, the cause of a 426, a fixed key and a troubleshooting guide.",
        ),
        l(
          "Başlıkları `curl -i -H` ile gönder; `-v` gönderdiğin isteği de gösterir. ↑ tuşu önceki komutu geri getirir, oradan düzeltmek kolay. Az komutla bitirirsen 3 yıldız.",
          "Send the headers with `curl -i -H`; `-v` also shows the request you sent. The ↑ key brings back the last command, which makes fixing it easy. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("WebSocket sıradan bir HTTP `GET` isteğiyle başlar: [[handshake|el sıkışma]].", "A WebSocket starts with a plain HTTP `GET` request: the [[handshake]]."),
    l("İş yapan başlıklar: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13`, `Sec-WebSocket-Key`.", "The headers that do the work: `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13`, `Sec-WebSocket-Key`."),
    l("`101 Switching Protocols`'ten sonra aynı bağlantı WebSocket frame'leri taşır, HTTP değil.", "After `101 Switching Protocols` the same connection carries WebSocket frames, not HTTP."),
    l("`ws`'nin kendi sunucusu upgrade başlıkları olmayan isteğe 426, geçersiz key ya da sürüme 400 ve sebebini döner.", "`ws`'s own server answers a request without upgrade headers with 426, and an invalid key or version with 400 and the reason."),
    l("Upgrade'i dinleyen kimsenin olmadığı bir porta gelen istek cevapsız kapanır.", "A request to a port where nothing listens for upgrades is closed without an answer."),
  ],
  quiz: [
    {
      question: l("Bir istek `Upgrade: websocket` gönderiyor ama `Connection: Upgrade` göndermiyor. `ws` sunucusu ne der?", "A request sends `Upgrade: websocket` but no `Connection: Upgrade`. What does the `ws` server say?"),
      options: [l("101", "101"), l("426 Upgrade Required", "426 Upgrade Required"), l("400 Bad Request", "400 Bad Request"), l("Hiçbir şey", "Nothing")],
      answer: 1,
      explain: l("İki başlık birlikte olmadıkça Node bunu upgrade saymaz; istek sıradan bir HTTP isteği olarak 426 alır.", "Without both headers Node doesn't count it as an upgrade; as a plain request it gets 426."),
      reviewStep: 2,
    },
    {
      question: l("101 cevabından sonra aynı bağlantıda ne konuşulur?", "After the 101 answer, what is spoken on that connection?"),
      options: [l("Yine HTTP", "HTTP, still"), l("WebSocket frame'leri", "WebSocket frames"), l("Hiçbir şey, bağlantı kapanır", "Nothing; it closes"), l("Her mesaj için yeni bir el sıkışma", "A new handshake per message")],
      answer: 1,
      explain: l("101 \"protokol değiştiriyoruz\" demek. Bağlantı açık kalır ve iki yönlü frame taşır.", "101 means \"we're switching protocols\". The connection stays open and carries frames both ways."),
      reviewStep: 1,
    },
    {
      question: l("Bir el sıkışma 400 aldı. İlk ne yaparsın?", "A handshake got a 400. What do you do first?"),
      options: [
        l("Sunucuyu yeniden başlatırım", "Restart the server"),
        l("`curl -i` ile cevabın gövdesini okurum", "Read the answer's body with `curl -i`"),
        l("Portu değiştiririm", "Change the port"),
        l("`wss://`'ye geçerim", "Switch to `wss://`"),
      ],
      answer: 1,
      explain: l("ws, 400'ün gövdesine sebebi yazar: geçersiz key, sürüm ya da upgrade başlığı.", "ws writes the reason into the 400's body: an invalid key, version or upgrade header."),
      reviewStep: 3,
    },
    {
      question: l("`wscat -c ws://localhost:8080` \"socket hang up\" diyor. En olası sebep?", "`wscat -c ws://localhost:8080` says \"socket hang up\". The likeliest cause?"),
      options: [
        l("Key yanlış", "The key is wrong"),
        l("O portta upgrade'i dinleyen bir WebSocket sunucusu yok", "Nothing on that port listens for upgrades"),
        l("Mesaj çok büyük", "The message is too big"),
        l("Sunucu yavaş", "The server is slow"),
      ],
      answer: 1,
      explain: l("Upgrade dinleyicisi olmayan bir Node sunucusu bu isteği cevapsız kapatır. Burada WebSocket :8081'de.", "A Node server with no upgrade listener closes such a request unanswered. Here the WebSocket is on :8081."),
      reviewStep: 4,
    },
  ],
};
