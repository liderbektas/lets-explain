import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { bytesOf, requestText, responseText } from "../../engine/net";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

/** What one empty poll really costs on the wire: the browser's request and the server's `[]`. */
const emptyPoll = scene.run.states.at(-1)!.exchanges.find((e) => e.empty && e.kind === "poll")!;
const ROUND_TRIP = bytesOf(requestText(emptyPoll)) + bytesOf(responseText(emptyPoll));
const PER_SECOND_KB = Math.round((500 * ROUND_TRIP) / 1024);

export const polling: Lesson = {
  slug: "polling",
  title: l("Polling ve long polling", "Polling and long polling"),
  summary: l(
    "HTTP'de sunucu kendiliğinden konuşamaz; tarayıcı sormak zorunda. Sık sormanın, seyrek sormanın ve cevabı bekletmenin bedelini gör.",
    "In HTTP a server cannot speak first; the browser has to ask. See what asking often, asking rarely and holding the answer cost.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("HTTP'de sunucunun neden kendiliğinden yazamadığını görmek", "See why an HTTP server cannot write first"), step: 0 },
    { text: l("Polling'de boş cevapları ve gecikmeyi saymak", "Count empty answers and delay in polling"), step: 1 },
    { text: l("Gecikme ile yük arasındaki ikilemi görmek", "See the trade-off between delay and load"), step: 2 },
    { text: l("Long polling'in cevabı nasıl beklettiğini görmek", "See how long polling holds the answer"), step: 3 },
    { text: l("204'ü ve `after`'ın neden şart olduğunu anlamak", "Understand the 204 and why `after` matters"), step: 5 },
  ],
  steps: [
    {
      short: l("Sor, cevapla", "Ask, answer"),
      tag: "problem",
      title: l("Sayfa yeni mesajı nasıl öğrenir?", "How does the page learn about a new message?"),
      body: [
        l(
          "Sohbet sayfası açıldı ve sunucudan mesajları istedi: `GET /messages`. Sunucu iki mesajla cevap verdi. Bu [[http|HTTP]]'nin tek kuralı: istemci sorar, sunucu cevaplar.",
          "The chat page loaded and asked the server for messages: `GET /messages`. The server answered with two. That is [[http|HTTP]]'s one rule: the client asks, the server answers.",
        ),
        l(
          "Sorun şu: bundan sonra Mert yeni bir mesaj yazarsa sunucu bunu tarayıcıya kendiliğinden söyleyemez. HTTP'de sunucunun söz sırası hiç gelmez; tarayıcı sormadıkça cevap da yoktur.",
          "Here's the catch: if Mert writes a new message after this, the server cannot tell the browser on its own. In HTTP the server never gets a turn to speak; no question, no answer.",
        ),
      ],
      practice: {
        intro: l("Bu dersin sunucusu sende de çalışıyormuş gibi:", "As if this lesson's server ran on your machine too:"),
        commands: [{ cmd: "curl localhost:8080/messages", note: l("Bütün mesajları JSON olarak döner.", "Returns every message as JSON.") }],
        snippets: [
          {
            label: "JavaScript · tarayıcı",
            code: 'const res = await fetch("/messages");\nconst messages = await res.json();\nrender(messages);',
            note: l("Sayfa açılınca bir kez sorar. Sonrası için bir şey yapmazsan sayfa bir daha haber almaz.", "Asks once when the page loads. Do nothing more and the page never hears again."),
          },
        ],
      },
    },
    {
      short: l("Polling", "Polling"),
      tag: "how",
      predict: {
        question: l(
          "Sayfa şimdi her 2 saniyede bir soruyor: 10 saniyede 5 istek. Mert 7. saniyede yazacak. Kaç istek boş döner, mesaj sunucuda kaç saniye bekler?",
          "The page now asks every 2 seconds: 5 requests in 10 seconds. Mert will write at second 7. How many requests come back empty, and how long does the message wait on the server?",
        ),
        options: [
          l("Hiçbiri boş dönmez, mesaj hiç beklemez", "None comes back empty; the message never waits"),
          l("1 tanesi boş döner, mesaj 1 sn bekler", "1 comes back empty; the message waits 1 s"),
          l("4 tanesi boş döner, mesaj 1 sn bekler", "4 come back empty; the message waits 1 s"),
          l("5'i de boş döner", "All 5 come back empty"),
        ],
        answer: 2,
        why: l(
          "İstekler 2, 4, 6, 8 ve 10. saniyede gidiyor. Mesaj 7'de yazıldı ve 8'deki istekle geldi: 1 saniye bekledi. Diğer 4 istek boş döndü.",
          "Requests go at seconds 2, 4, 6, 8 and 10. The message was written at 7 and came with the request at 8: it waited 1 second. The other 4 came back empty.",
        ),
      },
      title: l("Polling: durmadan sor", "Polling: keep asking"),
      body: [
        l(
          "En basit çözüm [[polling]]: tarayıcı belli aralıklarla tekrar sorar. Her isteğe elindeki son mesajın id'sini `after` ile ekler; sunucu sadece ondan sonrakileri döner.",
          "The simplest answer is [[polling]]: the browser asks again at a fixed interval. With `after` it adds the id of the last message it has, and the server returns only what came after.",
        ),
        l(
          "Sonuca bak: 5 istekten 4'ü boş `[]` döndü. Mesaj da yazıldığı anda değil, bir sonraki soruda geldi.",
          "Look at the result: 4 of 5 requests came back empty, `[]`. And the message did not arrive when it was written, but with the next question.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl 'localhost:8080/messages?after=2'", note: l("Sadece 2'den sonrakiler. Boşsa `[]`.", "Only what came after 2. `[]` if nothing.") }],
        snippets: [
          {
            label: "JavaScript · polling",
            code: 'let last = 0;\nsetInterval(async () => {\n  const res = await fetch(`/messages?after=${last}`);\n  const fresh = await res.json();\n  if (fresh.length) {\n    last = fresh[fresh.length - 1].id;\n    render(fresh);\n  }\n}, 2000);',
          },
        ],
      },
    },
    {
      short: l("İkilem", "Trade-off"),
      tag: "problem",
      title: l("Daha sık mı, daha seyrek mi?", "More often, or less?"),
      body: [
        l(
          "Aralığı yarım saniyeye indirdik: gecikme azaldı ama bu 4 isteğin hepsi boş döndü. Bir boş istek bile, başlıklarıyla birlikte gidip gelirken yaklaşık **{n} bayt** harcıyor.".replace("{n}", String(ROUND_TRIP)),
          "We cut the interval to half a second: less delay, but all 4 of these came back empty. Even an empty request costs about **{n} bytes** there and back, headers included.".replace("{n}", String(ROUND_TRIP)),
        ),
        l(
          "Ölçeği düşün: 1.000 kullanıcı her 2 saniyede sorarsa sunucu saniyede 500 istek karşılar, saniyede yaklaşık {kb} KB; çoğu boş. Aralığı uzatırsan bu kez [[latency|gecikme]] artar: bir mesaj ortalama aralığın yarısı kadar bekler.".replace("{kb}", String(PER_SECOND_KB)),
          "Think of scale: 1,000 users asking every 2 seconds is 500 requests a second for the server, about {kb} KB a second, most of it empty. Make the interval longer and the [[latency]] grows: a message waits half the interval on average.".replace("{kb}", String(PER_SECOND_KB)),
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Polling'de gecikme ile yük birbirine bağlı: birini azaltınca öbürü artar. İkisinden birden kurtulmak için sunucunun \"bir şey olunca\" cevap vermesi gerekir.",
            "In polling, delay and load are tied together: lower one and the other rises. To be rid of both, the server has to answer \"when something happens\".",
          ),
        },
      ],
    },
    {
      short: l("Long polling", "Long polling"),
      tag: "idea",
      predict: {
        question: l(
          "Sayfa 12. saniyede `wait=30` ile soruyor: \"yeni bir şey yoksa cevabı beklet\". Ayşe 16. saniyede yazacak. Cevap ne zaman döner?",
          "At second 12 the page asks with `wait=30`: \"if there's nothing new, hold the answer\". Ayşe will write at second 16. When does the answer come back?",
        ),
        options: [
          l("Hemen, boş olarak", "Right away, empty"),
          l("16. saniyede, Ayşe'nin mesajıyla", "At second 16, with Ayşe's message"),
          l("42. saniyede, 30 sn dolunca", "At second 42, when the 30 s are up"),
          l("Hiç dönmez", "Never"),
        ],
        answer: 1,
        why: l(
          "Sunucu isteği tutar; mesaj gelir gelmez cevabı onunla gönderir. Ne gecikme var ne boş cevap.",
          "The server holds the request and answers with the message the moment it comes. No delay, no empty answer.",
        ),
      },
      title: l("Long polling: cevabı beklet", "Long polling: hold the answer"),
      body: [
        l(
          "[[long-polling|Long polling]]'de istek aynı, sunucunun davranışı farklı: yeni bir şey yoksa cevap vermiyor, isteği kapıda bekletiyor. Ayşe yazınca bekleyen isteğe hemen onunla cevap veriyor.",
          "In [[long-polling|long polling]] the request is the same but the server behaves differently: with nothing new, it doesn't answer, it keeps the request waiting at the door. When Ayşe writes, it answers the waiting request with her message at once.",
        ),
        l(
          "Tarayıcı cevabı alır almaz yeni bir long poll açtı. Böylece neredeyse her an sunucuda bekleyen bir istek oluyor ve her mesaj geldiği anda yola çıkıyor.",
          "The browser opened a new long poll the moment it got the answer. That way there's a request waiting at the server almost all the time, and each message leaves the moment it arrives.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl 'localhost:8080/messages?after=3&wait=30'", note: l("Yeni mesaj gelene kadar (en fazla 30 sn) bekler.", "Waits until a new message comes (30 s at most).") }],
        snippets: [
          {
            label: "JavaScript · long polling",
            code: 'let last = 0;\nwhile (true) {\n  const res = await fetch(`/messages?after=${last}&wait=30`);\n  if (res.status === 200) {\n    const fresh = await res.json();\n    last = fresh[fresh.length - 1].id;\n    render(fresh);\n  }\n  // 204: nothing came; ask again right away\n}',
          },
        ],
      },
    },
    {
      short: l("204", "204"),
      tag: "how",
      title: l("Kimse yazmazsa: 204", "When nobody writes: 204"),
      body: [
        l(
          "30 saniye boyunca kimse yazmadı. Sunucu isteği sonsuza kadar tutmuyor: süre dolunca `204 No Content` dönüyor, yani \"bekledim, bir şey olmadı\". Tarayıcı hemen yeniden soruyor.",
          "Nobody wrote for 30 seconds. The server doesn't hold a request forever: when time is up it returns `204 No Content`, meaning \"I waited, nothing happened\". The browser asks again at once.",
        ),
        l(
          "Neden bir üst sınır var? Aradaki proxy'ler ve load balancer'lar uzun süre sessiz kalan bağlantıları keser; nginx varsayılan olarak 60 saniye bekler. Long poll süreleri bu yüzden genelde 20-30 saniyedir.",
          "Why a limit? Proxies and load balancers in between cut connections that stay silent too long; nginx waits 60 seconds by default. That's why long polls usually last 20-30 seconds.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sınırı sunucu belirler. Bu sunucu `wait=60` istesen de 30 saniyede keser. Bazı API'ler boş cevap için 204 yerine `200` ve `[]` döner; istemci ikisini de bilmeli.",
            "The server sets the limit. This one stops at 30 seconds even if you ask for `wait=60`. Some APIs answer an empty long poll with `200` and `[]` instead of 204; a client should handle both.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "curl -i 'localhost:8080/messages?after=4&wait=30'", note: l("`-i` durum satırını gösterir: 200 ya da 204.", "`-i` shows the status line: 200 or 204.") }],
      },
    },
    {
      short: l("Bedeli", "The cost"),
      tag: "reality",
      title: l("Long polling'in bedeli", "What long polling costs"),
      body: [
        l(
          "Mert ve Zeynep 0,2 saniye arayla yazdı. Mert'in mesajı bekleyen isteğin cevabı oldu. Zeynep yazdığında sunucuda bekleyen bir istek yoktu, mesaj sunucuda kaldı. Tarayıcı `after=5` ile yeniden sorunca hemen geldi.",
          "Mert and Zeynep wrote 0.2 seconds apart. Mert's message became the answer to the waiting request. When Zeynep wrote there was no request waiting, so her message stayed on the server. When the browser asked again with `after=5`, it came at once.",
        ),
        l(
          "`after` burada hayati: istemci \"en son 5'i aldım\" demeseydi aradaki mesajı kaçırabilirdi. Long polling iyi çalışır, ama her mesaj için yeni bir HTTP isteği, yeni başlıklar ve sunucuda açık tutulan bir bağlantı demek.",
          "`after` is vital here: had the client not said \"the last one I got was 5\", it could have missed the message in between. Long polling works well, but each message means a new HTTP request, new headers, and a connection held open on the server.",
        ),
        l(
          "Sıradaki derste iki başka yol var: cevabı hiç bitirmeyen SSE, ve iki yönlü WebSocket.",
          "The next lesson shows two other ways: SSE, whose answer never ends, and the two-way WebSocket.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kural: istemci her zaman elindeki son id'yi söylesin, sunucu ondan sonrakilerin hepsini dönsün. Böylece iki istek arasında yazılan hiçbir mesaj kaybolmaz.",
            "The rule: the client always says the last id it has, and the server returns everything after it. Then no message written between two requests is lost.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Sohbet API'si bu makinede `localhost:8080`'de çalışıyor; `curl localhost:8080` ne var ne yok gösterir. Aşağıda gerçek işten **4 senaryo** var.",
          "Your turn. The chat API runs on this machine at `localhost:8080`; `curl localhost:8080` shows what's there. Below are **4 scenarios** from real work.",
        ),
        l(
          "İstekleri `curl` ile yaz, zamanı `sleep` ile ilerlet. Ekip arkadaşların kendi zamanlarında yazıyor ve ne zaman yazacaklarını bilmiyorsun. Az komutla bitirirsen 3 yıldız.",
          "Write the requests with `curl` and move time with `sleep`. Your teammates write when they write, and you don't know when. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("[[http|HTTP]]'de istemci sorar, sunucu cevaplar; sunucu kendiliğinden yazamaz.", "In [[http|HTTP]] the client asks and the server answers; the server cannot write first."),
    l("[[polling|Polling]]'de cevapların çoğu boş döner ve mesaj bir sonraki soruya kadar bekler.", "With [[polling]] most answers come back empty and a message waits for the next question."),
    l("Aralığı kısaltmak gecikmeyi azaltır ama yükü artırır; uzatmak tersini yapar.", "A shorter interval means less delay but more load; a longer one, the reverse."),
    l("[[long-polling|Long polling]]'de sunucu cevabı yeni bir şey olana kadar bekletir; süre dolunca 204 döner.", "In [[long-polling|long polling]] the server holds the answer until something new happens, and returns 204 when time runs out."),
    l("İstemci her istekte elindeki son id'yi (`after`) söylemeli; yoksa iki istek arasındaki mesajlar kaçabilir.", "The client should send the last id it has (`after`) every time; otherwise messages between two requests can be missed."),
  ],
  quiz: [
    {
      question: l("Bir sayfa her 5 saniyede bir soruyor. Bir mesaj ortalama ne kadar bekler?", "A page asks every 5 seconds. How long does a message wait on average?"),
      options: [l("Hiç", "Not at all"), l("Yaklaşık 2,5 sn", "About 2.5 s"), l("Tam 5 sn", "Exactly 5 s"), l("10 sn", "10 s")],
      answer: 1,
      explain: l("Mesaj iki soru arasında herhangi bir anda yazılabilir; ortalamada aralığın yarısı kadar bekler.", "A message can be written at any moment between two questions; on average it waits half the interval."),
      reviewStep: 2,
    },
    {
      question: l("Long poll isteği gönderildi ve 30 saniye boyunca kimse yazmadı. Bu sunucu ne yapar?", "A long poll was sent and nobody wrote for 30 seconds. What does this server do?"),
      options: [
        l("İsteği sonsuza kadar tutar", "Holds the request forever"),
        l("204 No Content döner, istemci yeniden sorar", "Returns 204 No Content, and the client asks again"),
        l("Bağlantıyı hata vererek kapatır", "Closes the connection with an error"),
        l("Eski mesajları yeniden gönderir", "Sends the old messages again"),
      ],
      answer: 1,
      explain: l("Süre dolunca boş bir cevap döner. Böylece aradaki proxy'ler bağlantıyı sessiz diye kesmeden istemci yeniden sorar.", "When time is up it sends an empty answer, so the client asks again before any proxy cuts the connection for being silent."),
      reviewStep: 4,
    },
    {
      question: l("Long polling'de iki mesaj neredeyse aynı anda yazıldı. İkincisinin kaybolmaması için ne gerekir?", "In long polling two messages were written almost at once. What keeps the second from being lost?"),
      options: [
        l("Sunucunun daha hızlı olması", "A faster server"),
        l("İstemcinin yeniden sorarken son aldığı id'yi göndermesi", "The client sending the last id it got when it asks again"),
        l("Daha kısa bir `wait`", "A shorter `wait`"),
        l("Hiçbir şey; long polling'de mesaj kaybolmaz", "Nothing; long polling never loses messages"),
      ],
      answer: 1,
      explain: l("İkinci mesaj geldiğinde bekleyen istek yoktu. Sunucu onu tutar ve istemci \"5'ten sonrakiler\" diye sorunca verir.", "When the second message came there was no waiting request. The server keeps it and hands it over when the client asks for \"everything after 5\"."),
      reviewStep: 5,
    },
    {
      question: l("Polling yerine long polling'e geçmek hangisini azaltır?", "What does moving from polling to long polling reduce?"),
      options: [
        l("Boş cevapları ve gecikmeyi", "Empty answers and delay"),
        l("Sadece mesaj boyutunu", "Only message size"),
        l("Sunucuda açık bağlantı sayısını", "The number of open connections on the server"),
        l("Hiçbirini", "Neither"),
      ],
      answer: 0,
      explain: l(
        "Sunucu sadece söyleyecek bir şey olunca cevap verdiği için boş cevaplar ve bekleme kalkar. Bunun karşılığında her istemci için sunucuda bir istek açık bekler.",
        "Since the server only answers when it has something to say, empty answers and waiting go away. In return, the server keeps one request open for each client.",
      ),
      reviewStep: 3,
    },
  ],
};
