import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const reconnect: Lesson = {
  slug: "reconnect",
  title: l("Yeniden bağlanma", "Reconnecting"),
  summary: l(
    "Tarayıcının WebSocket'i kendiliğinden yeniden bağlanmaz. Yeniden bağlanmayı yaz, ama herkes aynı anda dönerse sunucuyu tekrar düşürürsün: backoff, jitter ve vazgeçmeyi bilmek.",
    "The browser's WebSocket does not reconnect by itself. Write the reconnecting, but if everyone comes back at once you knock the server over again: backoff, jitter, and knowing when to give up.",
  ),
  minutes: 14,
  level: l("İleri", "Advanced"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Yeniden bağlanmanın uygulamaya kaldığını görmek", "See that reconnecting is up to the app"), step: 0 },
    { text: l("Sürü etkisini (thundering herd) görmek", "See the thundering herd"), step: 1 },
    { text: l("Backoff ve jitter ile dönüşleri yaymak", "Spread the returns with backoff and jitter"), step: 2 },
    { text: l("Tavan koymayı ve vazgeçmeyi bilmek", "Know to cap the wait and when to give up"), step: 3 },
  ],
  steps: [
    {
      short: l("Deploy", "Deploy"),
      tag: "problem",
      title: l("Kopan sekme kopuk kalır", "A dropped tab stays dropped"),
      body: [
        l(
          "20 sekme bağlıydı. Bir deploy yapıldı: sunucu yeniden başladı ve bütün bağlantılar koptu. Hiçbiri geri gelmedi, çünkü tarayıcının `WebSocket` nesnesi kopunca öylece kapanır; yeniden bağlanmak senin kodunun işi.",
          "20 tabs were connected. A deploy happened: the server restarted and every connection dropped. None came back, because the browser's `WebSocket` object simply closes when cut; reconnecting is your code's job.",
        ),
        l(
          "(`EventSource` kendisi yeniden bağlanır, WebSocket bağlanmaz. Socket.IO gibi kütüphaneler bunu senin yerine yapar.)",
          "(`EventSource` reconnects by itself; WebSocket doesn't. Libraries such as Socket.IO do it for you.)",
        ),
      ],
    },
    {
      short: l("Sürü", "Herd"),
      tag: "problem",
      predict: {
        question: l(
          "Sekmeler artık kopunca tam 1 saniye sonra yeniden deniyor. Sunucu saniyede 5 bağlantı kurabiliyor ve bir saniyede 10'dan fazla deneme gelirse sonraki saniye hiç kuramıyor. Deploy'dan sonra ne olur?",
          "The tabs now retry exactly 1 second after a drop. The server can set up 5 connections a second, and after a second with more than 10 attempts it can set up none in the next. What happens after the deploy?",
        ),
        options: [
          l("Dört saniyede hepsi geri gelir", "All of them are back in four seconds"),
          l("Hepsi aynı anda dener, çoğu reddedilir ve sunucu bir daha toparlanamaz", "They all try at once, most are refused, and the server never recovers"),
          l("Sadece ilk sekme bağlanır", "Only the first tab connects"),
          l("Hiçbiri denemez", "None of them tries"),
        ],
        answer: 1,
        why: l(
          "Hepsi aynı anda koptuğu ve aynı süre beklediği için hep birlikte dönerler. Her dalga sunucuyu yeniden boğar, reddedilenler bir saniye sonra yine hep birlikte gelir: bir kısır döngü.",
          "Since they all dropped at once and wait the same time, they all come back together. Each wave swamps the server again, and the refused ones come back together a second later: a vicious circle.",
        ),
      },
      title: l("Herkes aynı anda dönerse", "When everyone comes back at once"),
      body: [
        l(
          "Sekmeler artık 1 saniye sonra yeniden deniyor ve hepsi tam aynı anda dönüyor. Sunucu her saniye 5'ini kabul edebiliyor ama reddetmek de iş: bağlantıyı kabul edip TLS'i kurmak, isteği okumak CPU harcar. Fazla deneme gelen bir saniyenin ardından sunucu hiç yer bulamıyor.",
          "The tabs now retry after 1 second, all at exactly the same moment. The server can take 5 a second, but turning them away is work too: accepting the connection, setting up TLS and reading the request all cost CPU. After a second with too many attempts the server has no room at all.",
        ),
        l(
          "Buna thundering herd (sürü etkisi) denir: sunucu düştüğü için gelen kalabalık, onun ayağa kalkmasını engeller. Büyük sitelerdeki kesintilerin çoğu böyle uzar.",
          "This is the thundering herd: the crowd that arrives because the server went down is what keeps it from getting up. Many outages at big sites drag on exactly this way.",
        ),
      ],
    },
    {
      short: l("Jitter", "Jitter"),
      tag: "how",
      title: l("Backoff ve jitter: dönüşleri yay", "Backoff and jitter: spread the returns"),
      body: [
        l(
          "İki fikir birlikte: **backoff**, her başarısız denemeden sonra daha uzun beklemek (1, 2, 4, 8 sn...). **Jitter**, o sürenin içinden rastgele bir an seçmek; böylece aynı anda kopan sekmeler farklı anlarda döner.",
          "Two ideas together: **backoff**, waiting longer after each failed try (1, 2, 4, 8 s...). **Jitter**, picking a random moment within that time, so tabs that dropped together return at different moments.",
        ),
        l(
          "AWS'nin önerdiği \"full jitter\": `Math.random() * Math.min(tavan, taban * 2 ** deneme)`. Bağlanınca deneme sayısı sıfırlanır. Aynı 20 sekme bu kez hepsi geri geldi.",
          "The \"full jitter\" AWS recommends: `Math.random() * Math.min(cap, base * 2 ** attempt)`. The attempt count goes back to zero on connect. The same 20 tabs all came back this time.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "JavaScript · tarayıcı",
            code: 'let attempt = 0;\n\nfunction connect() {\n  const ws = new WebSocket(url);\n  ws.onopen = () => { attempt = 0; };\n  ws.onclose = (e) => {\n    if (e.code === 4001) return showLogin();\n    const delay = Math.random() * Math.min(30000, 1000 * 2 ** attempt);\n    attempt++;\n    setTimeout(connect, delay);\n  };\n}',
          },
        ],
      },
    },
    {
      short: l("Tavan, vazgeç", "Cap, give up"),
      tag: "reality",
      title: l("Bir tavan, ve ne zaman vazgeçmeli", "A ceiling, and when to give up"),
      body: [
        l(
          "**Tavan**: tavansız üstel backoff uzun bir kesintiden sonra dakikalarca bekletir (10. denemede 17 dakika). 30 sn gibi bir tavan, sunucu geri gelince kullanıcının kısa sürede dönmesini sağlar.",
          "**A ceiling**: exponential backoff with no ceiling makes users wait minutes after a long outage (17 minutes by the 10th try). A ceiling like 30 s gets users back soon after the server returns.",
        ),
        l(
          "**Vazgeçmek**: her kapanış \"tekrar dene\" demek değildir. 1006, 1001 ve 1013 (\"try again later\") tekrar denemeye değer. Kendi `4001 session expired` gibi kodların ya da 1008 ise denemeyi bırakıp kullanıcıya ne olduğunu söylemeyi gerektirir. Tarayıcıda `navigator.onLine` ve `online` olayı da ağ yokken boşuna denemeyi önler.",
          "**Giving up**: not every close means \"try again\". 1006, 1001 and 1013 (\"try again later\") are worth retrying. Your own codes like `4001 session expired`, or 1008, mean stop and tell the user what happened. In a browser, `navigator.onLine` and the `online` event avoid pointless tries while there is no network.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `chat.js` sunucu (`:9001`, saniyede 5 bağlantı), `tab.js` bir sekmenin istemci kodu. Sekmeleri bir döngüyle aç: `for i in $(seq 1 5); do TAB=$i node tab.js & done`. **4 senaryo** var.",
          "Your turn. `chat.js` is the server (`:9001`, 5 connections a second), `tab.js` a tab's client code. Open tabs with a loop: `for i in $(seq 1 5); do TAB=$i node tab.js & done`. There are **4 scenarios**.",
        ),
        l(
          "Deploy: `pkill -f chat.js` ve `node chat.js &`. Sekmelerin yeni kodu alması için onları da yeniden başlat: `pkill -f tab.js` ve yine döngü. Sunucu 5 sn'de bir kaç kişinin bağlı olduğunu yazar.",
          "A deploy: `pkill -f chat.js` and `node chat.js &`. To give the tabs new code, restart them too: `pkill -f tab.js` and the loop again. The server prints how many are connected every 5 s.",
        ),
      ],
    },
  ],
  recap: [
    l("Tarayıcının WebSocket'i yeniden bağlanmaz; bu kod uygulamanındır.", "The browser's WebSocket doesn't reconnect; that code belongs to the app."),
    l("Herkes aynı aralıkla yeniden denerse hep birlikte döner ve sunucuyu yeniden boğar (thundering herd).", "If everyone retries on the same interval they return together and swamp the server again (thundering herd)."),
    l("Backoff bekleme süresini büyütür, jitter dönüşleri rastgele yayar; ikisi birlikte kullanılır.", "Backoff makes the wait grow, jitter spreads the returns at random; they're used together."),
    l("Beklemeye bir tavan koy (örneğin 30 sn), yoksa uzun bir kesintiden sonra kullanıcı dakikalarca bekler.", "Cap the wait (30 s, say), or after a long outage users wait for minutes."),
    l("Kapanış koduna bak: 1006/1001/1013 tekrar dene, 4001 ya da 1008 gibi kodlarda vazgeç.", "Look at the close code: retry on 1006/1001/1013, give up on codes like 4001 or 1008."),
  ],
  quiz: [
    {
      question: l("1000 sekme aynı anda koptu ve hepsi tam 2 sn sonra yeniden deniyor. En büyük risk?", "1000 tabs dropped at once and all retry exactly 2 s later. The biggest risk?"),
      options: [
        l("Hiçbir risk yok", "No risk at all"),
        l("Hepsi aynı anda gelip yeni açılan sunucuyu yeniden boğar", "They all arrive together and swamp the newly started server again"),
        l("Mesajlar karışır", "Messages get mixed up"),
        l("Tarayıcı çöker", "The browser crashes"),
      ],
      answer: 1,
      explain: l("Aynı bekleme, aynı dönüş anı demek. Jitter bunu yayar.", "The same wait means the same moment of return. Jitter spreads it."),
      reviewStep: 1,
    },
    {
      question: l("\"Full jitter\" bekleme süresi nasıl hesaplanır?", "How is a \"full jitter\" wait computed?"),
      options: [
        l("Hep 1 saniye", "Always 1 second"),
        l("`taban * 2 ** deneme`", "`base * 2 ** attempt`"),
        l("`Math.random() * Math.min(tavan, taban * 2 ** deneme)`", "`Math.random() * Math.min(cap, base * 2 ** attempt)`"),
        l("Rastgele 0-1 sn", "A random 0-1 s"),
      ],
      answer: 2,
      explain: l("Üst sınır büyür ve tavanda durur; gerçek bekleme o sınırın içinde rastgeledir.", "The upper bound grows and stops at the cap; the actual wait is random within it."),
      reviewStep: 2,
    },
    {
      question: l("Sunucu bağlantıyı `4001 session expired` ile kapattı. İstemci ne yapmalı?", "The server closed with `4001 session expired`. What should the client do?"),
      options: [
        l("Hemen yeniden bağlanmak", "Reconnect at once"),
        l("Backoff ile yeniden denemek", "Retry with backoff"),
        l("Yeniden denemeyi bırakıp kullanıcıdan yeniden giriş istemek", "Stop retrying and ask the user to log in again"),
        l("Sayfayı kapatmak", "Close the page"),
      ],
      answer: 2,
      explain: l("Bu kapanış kendiliğinden düzelmez; denemek sadece sunucuyu yorar.", "This close won't fix itself; retrying only wears the server out."),
      reviewStep: 3,
    },
    {
      question: l("Tavansız üstel backoff'un sorunu ne?", "What's the problem with exponential backoff and no ceiling?"),
      options: [
        l("Çok sık dener", "It tries too often"),
        l("Uzun bir kesintiden sonra bir sonraki deneme dakikalar sonraya kalır", "After a long outage the next try is minutes away"),
        l("Jitter'ı engeller", "It prevents jitter"),
        l("Sorunu yok", "It has none"),
      ],
      answer: 1,
      explain: l("Bekleme her seferinde ikiye katlanır; bir tavan onu makul tutar.", "The wait doubles every time; a ceiling keeps it reasonable."),
      reviewStep: 3,
    },
  ],
};
