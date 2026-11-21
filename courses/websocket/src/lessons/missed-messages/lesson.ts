import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const missedMessages: Lesson = {
  slug: "missed-messages",
  title: l("Kaçan mesajlar", "Missed messages"),
  summary: l(
    "Yeniden bağlanmak, arada kaçanları geri getirmez. Mesajlara sıra numarası ver, istemci \"son aldığım şuydu\" desin, sunucu kalanları göndersin.",
    "Reconnecting doesn't bring back what was missed in between. Number the messages, let the client say \"the last I got was this\", and let the server send the rest.",
  ),
  minutes: 13,
  level: l("İleri", "Advanced"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kopma sırasında yazılanların neden kaybolduğunu görmek", "See why what's written during a drop is lost"), step: 0 },
    { text: l("Sıra numarası ve resume ile boşluğu doldurmak", "Fill the gap with sequence numbers and a resume"), step: 1 },
    { text: l("Tekrarlara karşı istemciyi sağlam yapmak", "Make the client robust to repeats"), step: 2 },
    { text: l("Geçmişin ne kadar ve nerede tutulacağını bilmek", "Know how much history to keep, and where"), step: 3 },
  ],
  steps: [
    {
      short: l("Boşluk", "The gap"),
      tag: "problem",
      title: l("Yeniden bağlanmak yetmez", "Reconnecting isn't enough"),
      body: [
        l(
          "Sunucu her 3 sn'de numaralı bir log satırı gönderiyor. Ekranın Wi-Fi'ı 10. saniyede gitti. Kopukluğun ilk anlarında gönderilen satırlar yolda kaldı. Sunucunun heartbeat'i ekranı ölü saydı ve bağlantıyı kesti; ondan sonraki satırlar ekrana hiç gönderilmedi.",
          "The server sends a numbered log line every 3 s. The screen's Wi-Fi went at 10 seconds. Lines sent in the first moments of the drop were stuck on the way. The server's heartbeat then counted the screen as dead and cut the connection; lines after that were never sent to the screen at all.",
        ),
        l(
          "Wi-Fi 45. saniyede döndü. Yolda kalan satırlar TCP sayesinde geldi, ekran kopuşu fark edip yeniden bağlandı ve yeni satırları almaya başladı. Ama aradaki satırlar yok: ekranda bir boşluk var ve kimse bunu fark etmiyor.",
          "The Wi-Fi came back at 45 seconds. The stuck lines arrived thanks to TCP, the screen noticed the drop, reconnected and started getting new lines. But the lines in between are gone: there's a gap on the screen, and nobody notices.",
        ),
      ],
    },
    {
      short: l("Resume", "Resume"),
      tag: "idea",
      predict: {
        question: l(
          "Her satırın artan bir numarası (`seq`) var ve sunucu hepsini saklıyor. Ekran yeniden bağlanınca ilk iş ne göndermeli?",
          "Every line has an increasing number (`seq`), and the server keeps them all. When the screen reconnects, what should it send first?",
        ),
        options: [
          l("Hiçbir şey; sunucu kimin neyi kaçırdığını bilir", "Nothing; the server knows who missed what"),
          l("`{\"type\":\"resume\",\"after\":<son aldığı seq>}`", "`{\"type\":\"resume\",\"after\":<the last seq it got>}`"),
          l("Bütün geçmişi istemek", "Ask for the whole history"),
          l("Sayfayı yenilemek", "Reload the page"),
        ],
        answer: 1,
        why: l(
          "Sunucu her bağlantının ne aldığını takip edemez; kopukluk sırasında ne yolda kaldı, ne vardı, bilemez. Bunu bilen tek taraf istemcidir: \"son aldığım şuydu\" der, sunucu ondan sonrasını gönderir.",
          "The server can't track what each connection received; it can't know what was stuck on the way during the drop. Only the client knows: it says \"the last I got was this\", and the server sends what came after.",
        ),
      },
      title: l("Son aldığını söyle", "Say what you got last"),
      body: [
        l(
          "İstemci son aldığı satırın numarasını (`lastSeq`) tutuyor ve her bağlanışında `resume` gönderiyor. Sunucu, sakladığı geçmişten o numaradan sonrakileri sırayla yolluyor. İkinci kopmada boşluk oluşmadı.",
          "The client keeps the number of the last line it got (`lastSeq`) and sends `resume` every time it connects. From the history it keeps, the server sends what came after that number, in order. The second drop left no gap.",
        ),
        l(
          "Bu SSE'deki `Last-Event-ID`'nin aynısı. Fark şu: SSE'de tarayıcı bunu kendisi yapar, WebSocket'te ise iki tarafı da sen yazarsın.",
          "This is the same idea as SSE's `Last-Event-ID`. The difference: in SSE the browser does it by itself; with WebSocket you write both sides.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "JavaScript · istemci",
            code: 'let lastSeq = 0;\n\nws.onopen = () => ws.send(JSON.stringify({ type: "resume", after: lastSeq }));\nws.onmessage = (e) => {\n  const msg = JSON.parse(e.data);\n  if (msg.seq <= lastSeq) return; // seen already\n  lastSeq = msg.seq;\n  render(msg);\n};',
          },
        ],
      },
    },
    {
      short: l("Tekrarlar", "Repeats"),
      tag: "how",
      title: l("İki kez, hiç olmamasından iyidir", "Twice beats never"),
      body: [
        l(
          "Kopma, sunucunun bir satırı gönderip göndermediğini belirsiz bırakabilir. Güvenli olan, şüphede kalınca yeniden göndermektir: buna \"en az bir kez\" (at-least-once) teslim denir. Bedeli, istemcinin aynı satırı iki kez görebilmesi.",
          "A drop can leave it unclear whether the server got a line out. The safe choice is to send again when in doubt: that's \"at-least-once\" delivery. The price is that the client may see the same line twice.",
        ),
        l(
          "Çözüm istemcide: numarası `lastSeq`'ten büyük olmayan satırı yok say (idempotent işleme). Böylece sunucu ya da ağ aynı şeyi iki kez gönderse de ekranda bir kez görünür.",
          "The fix is in the client: ignore a line whose number is not above `lastSeq` (idempotent handling). Then even if the server or the network sends something twice, it shows up once.",
        ),
      ],
    },
    {
      short: l("Geçmiş", "History"),
      tag: "reality",
      title: l("Ne kadar geçmiş, nerede?", "How much history, and where?"),
      body: [
        l(
          "Bu sunucu geçmişi bellekte ve sınırsız tutuyor; gerçekte bir sınır koyarsın: son 1.000 mesaj ya da son 10 dakika. İstemci daha eskisini isterse sunucu \"çok gerimde kaldın, baştan yükle\" der.",
          "This server keeps the history in memory, without limit; in practice you'd cap it: the last 1,000 messages or the last 10 minutes. If a client asks for something older, the server says \"you're too far behind, reload\".",
        ),
        l(
          "Bellekteki geçmiş sunucu yeniden başlayınca kaybolur ve birden fazla sunucu arasında paylaşılmaz. Kalıcı ve paylaşılan bir geçmiş için Redis Streams, Kafka ya da bir veritabanı kullanılır. İstemci tarafında `lastSeq`'i localStorage'da tutmak, uygulama yeniden açıldığında da kaldığı yerden devam etmesini sağlar.",
          "History in memory vanishes when the server restarts and isn't shared between servers. For a lasting, shared history, use Redis Streams, Kafka or a database. On the client, keeping `lastSeq` in localStorage lets the app carry on where it was after it's reopened too.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `server.js` her 3 sn'de numaralı bir log satırı gönderir, `reader.js` onları ekrana yazar (`got #N: ...`). Bazı senaryolarda okuyucunun Wi-Fi'ı 10. saniyede gidip 45. saniyede geri geliyor. **4 senaryo** var.",
          "Your turn. `server.js` sends a numbered log line every 3 s, and `reader.js` prints them (`got #N: ...`). In some scenarios the reader's Wi-Fi goes at 10 seconds and comes back at 45. There are **4 scenarios**.",
        ),
        l(
          "Kodu `nano` ile değiştir, `pkill -f` ve `node ... &` ile yeniden başlat, kopmanın bitmesi için `sleep 60`. Terminaldeki `got #N` satırlarında boşluk ya da tekrar ara.",
          "Change code with `nano`, restart with `pkill -f` and `node ... &`, and `sleep 60` to see the drop through. Look for gaps and repeats in the `got #N` lines in the terminal.",
        ),
      ],
    },
  ],
  recap: [
    l("Yeniden bağlanmak, kopma sırasında yazılanları geri getirmez; arada sessiz bir boşluk kalır.", "Reconnecting doesn't bring back what was written during a drop; a silent gap is left behind."),
    l("Mesajlara artan bir numara ver; istemci son aldığını tutsun ve her bağlanışta `resume` göndersin.", "Give messages an increasing number; the client keeps the last it got and sends `resume` on every connect."),
    l("Sunucu, sakladığı geçmişten o numaradan sonrasını sırayla gönderir.", "The server sends, in order, what came after that number from the history it keeps."),
    l("Teslim \"en az bir kez\"dir; istemci zaten gördüğü numarayı yok sayarak tekrarları eler.", "Delivery is \"at least once\"; the client weeds out repeats by ignoring numbers it has seen."),
    l("Geçmişe bir sınır koy; kalıcı ve paylaşılan geçmiş için Redis Streams, Kafka ya da veritabanı.", "Cap the history; for lasting, shared history use Redis Streams, Kafka or a database."),
  ],
  quiz: [
    {
      question: l("Bağlantı 30 sn koptu ve istemci yeniden bağlandı. Arada gönderilen mesajlara ne olur (resume yoksa)?", "The connection dropped for 30 s and the client reconnected. What happens to the messages sent in between (no resume)?"),
      options: [
        l("TCP hepsini getirir", "TCP brings them all"),
        l("Sunucu bağlantıyı kestikten sonra gönderilenler kaybolur", "Those sent after the server cut the connection are lost"),
        l("Tarayıcı saklar", "The browser keeps them"),
        l("Sunucu otomatik yeniden gönderir", "The server resends them automatically"),
      ],
      answer: 1,
      explain: l("TCP sadece hâlâ açık bir bağlantıdaki veriyi teslim eder. Kapanan bağlantının ardından gelenler hiç gönderilmez.", "TCP only delivers data on a connection that's still open. What comes after the connection closed is never sent."),
      reviewStep: 0,
    },
    {
      question: l("Kaçanları geri almak için kim neyi bilmeli?", "To get back what was missed, who has to know what?"),
      options: [
        l("Sunucu her istemcinin neyi aldığını", "The server, what every client received"),
        l("İstemci son aldığı mesajın numarasını; sunucu da geçmişi", "The client, the number of the last message it got; the server, the history"),
        l("Sadece sunucu, geçmişi", "Only the server, the history"),
        l("Hiç kimse; WebSocket bunu kendisi yapar", "Nobody; WebSocket does it by itself"),
      ],
      answer: 1,
      explain: l("İstemci \"after\" der, sunucu geçmişten sonrasını gönderir.", "The client says \"after\", and the server sends what follows from the history."),
      reviewStep: 1,
    },
    {
      question: l("Kopmadan sonra bir mesaj ekranda iki kez göründü. En sağlam düzeltme?", "After a drop a message showed up twice. The most robust fix?"),
      options: [
        l("Yeniden bağlanmayı kapatmak", "Turn off reconnecting"),
        l("İstemcinin numarası zaten gördüğünden büyük olmayan mesajı yok sayması", "The client ignoring a message whose number isn't above what it has seen"),
        l("Sunucunun hiç yeniden göndermemesi", "The server never resending anything"),
        l("Mesajları büyütmek", "Bigger messages"),
      ],
      answer: 1,
      explain: l("\"En az bir kez\" teslimde tekrar olabilir; idempotent istemci bunu güvenle karşılar.", "With at-least-once delivery repeats happen; an idempotent client handles them safely."),
      reviewStep: 2,
    },
    {
      question: l("Uygulama kapatılıp açılınca bütün geçmişi baştan alıyor. Neden?", "When the app is closed and reopened it gets the whole history again. Why?"),
      options: [
        l("Sunucu geçmişi sildi", "The server deleted the history"),
        l("`lastSeq` sadece bellekteydi; yeni süreç sıfırdan başladı", "`lastSeq` lived only in memory; the new process started from zero"),
        l("Resume bozuk", "Resume is broken"),
        l("Heartbeat yüzünden", "Because of the heartbeat"),
      ],
      answer: 1,
      explain: l("Son numarayı kalıcı bir yerde (localStorage, dosya) tutmak gerekir.", "The last number has to live somewhere lasting (localStorage, a file)."),
      reviewStep: 3,
    },
  ],
};
