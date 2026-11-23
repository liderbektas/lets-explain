import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const backpressure: Lesson = {
  slug: "backpressure",
  title: l("Backpressure", "Backpressure"),
  summary: l(
    "Sunucu, istemcinin okuyabileceğinden hızlı gönderirse fark sunucunun belleğinde birikir. bufferedAmount ile ölç, atla ya da bırak.",
    "When a server sends faster than a client can read, the difference piles up in the server's memory. Measure it with bufferedAmount, then skip or let go.",
  ),
  minutes: 12,
  level: l("İleri", "Advanced"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Yavaş bir istemcinin sunucuda nasıl birikme yarattığını görmek", "See how a slow client builds up a queue on the server"), step: 0 },
    { text: l("bufferedAmount'un ne ölçtüğünü bilmek", "Know what bufferedAmount measures"), step: 1 },
    { text: l("Kuyruğu dolu istemciye göndermeyi atlamak", "Skip sending to a client whose queue is full"), step: 2 },
    { text: l("Seçenekleri ve bedellerini bilmek", "Know the options and their price"), step: 3 },
  ],
  steps: [
    {
      short: l("Birikme", "Pile-up"),
      tag: "problem",
      predict: {
        question: l(
          "Sunucu her saniye 32 KB'lık bir pano gönderiyor. Zayıf çeken telefon saniyede sadece 8 KB okuyabiliyor. 30 saniye sonra sunucuda telefon için ne kadar veri bekler?",
          "The server sends a 32 KB board every second. The phone, on a weak signal, can read only 8 KB a second. After 30 seconds, how much data waits on the server for the phone?",
        ),
        options: [l("Hiç: TCP halleder", "None: TCP handles it"), l("~240 KB", "~240 KB"), l("~740 KB", "~740 KB"), l("~1 MB", "~1 MB")],
        answer: 2,
        why: l(
          "30 saniyede yaklaşık 960 KB gönderildi, telefon bunun 240 KB'ını okudu. Kalan ~720-740 KB sunucunun belleğinde sırada bekliyor ve her saniye 24 KB daha artıyor.",
          "About 960 KB went out in 30 seconds and the phone read 240 KB of it. The remaining ~720-740 KB waits in the server's memory, and grows by 24 KB every second.",
        ),
      },
      title: l("Gönderilemeyen veri nereye gider?", "Where does data that can't be sent go?"),
      body: [
        l(
          "Dizüstü her panoyu geldiği anda okuyor. Telefon ise okuyabildiğinden çok daha fazlasını alıyor. `ws.send()` hiç hata vermiyor: veriyi kabul edip bir kuyruğa koyuyor ve kuyruk sunucunun belleğinde büyüyor.",
          "The laptop reads each board as it arrives. The phone is getting far more than it can read. `ws.send()` never complains: it accepts the data and puts it in a queue, and the queue grows in the server's memory.",
        ),
        l(
          "Böyle 100 telefon olsa her saniye 2,4 MB daha birikir. Sonunda sunucu belleği tükenir ve herkesin bağlantısı gider. Buna backpressure denir: alıcı yavaşlayınca baskı göndericiye geri yansır.",
          "With 100 such phones, another 2.4 MB piles up every second. In the end the server runs out of memory and everyone loses their connection. This is backpressure: when the receiver slows down, the pressure comes back onto the sender.",
        ),
      ],
    },
    {
      short: l("bufferedAmount", "bufferedAmount"),
      tag: "how",
      title: l("bufferedAmount neyi ölçer?", "What bufferedAmount measures"),
      body: [
        l(
          "`ws.bufferedAmount`, `send` ile kabul edilmiş ama henüz ağa çıkamamış bayt sayısıdır. İşletim sisteminin TCP gönderim tamponu doluysa (çünkü karşı taraf okumuyor ya da yavaş okuyor) veri burada bekler.",
          "`ws.bufferedAmount` is the number of bytes `send` accepted that haven't gone out onto the network yet. When the OS's TCP send buffer is full (because the other side isn't reading, or reads slowly), data waits here.",
        ),
        l(
          "Sunucu loguna 10 sn'de bir yazıyor: dizüstü için 0 KB, telefon için yüzlerce KB. Tarayıcıda da aynı özellik var: bir istemci büyük bir dosya yüklerken bir sonraki parçayı göndermeden önce `bufferedAmount`'un düşmesini bekler.",
          "The server logs it every 10 s: 0 KB for the laptop, hundreds of KB for the phone. Browsers have the same property: a client uploading a big file waits for `bufferedAmount` to drop before sending the next piece.",
        ),
      ],
    },
    {
      short: l("Atla", "Skip"),
      tag: "how",
      title: l("Kuyruğu doluysa bu turu atla", "Skip this round when the queue is full"),
      body: [
        l(
          "Gönderme döngüsüne tek bir satır ekledik: `if (ws.bufferedAmount > 256 * 1024) continue;`. Telefonun kuyruğu 256 KB'ı geçince ona o panoyu göndermiyoruz; kuyruk eridikçe bir sonrakini alıyor.",
          "We added one line to the sending loop: `if (ws.bufferedAmount > 256 * 1024) continue;`. When the phone's queue passes 256 KB, it doesn't get that board; as the queue drains, it gets the next one.",
        ),
        l(
          "Bekleyen veri artık sınırlı. Telefon her panoyu almıyor ama aldığı hep yakın zamanlı; dizüstü hiç etkilenmiyor. Bu, durum gönderen akışlarda (pano, konum, fiyat) iyi çalışır: eski bir durumu göndermenin zaten anlamı yok.",
          "What waits is now capped. The phone doesn't get every board, but what it gets is recent; the laptop isn't affected at all. This works well for streams that send state (a board, a location, a price): there's no point sending an old state anyway.",
        ),
      ],
    },
    {
      short: l("Seçenekler", "Options"),
      tag: "reality",
      title: l("Seçenekler ve bedelleri", "The options and their price"),
      body: [
        l(
          "**Atlamak** durum akışlarında iyidir, ama sohbet mesajı gibi her parçanın önemli olduğu akışlarda veri kaybı demektir. **Bağlantıyı kesmek** (`terminate()`) sunucuyu korur; istemci yeniden bağlanıp güncel durumu baştan alır.",
          "**Skipping** is fine for state streams, but for streams where every piece matters, like chat messages, it means losing data. **Cutting off** (`terminate()`) protects the server; the client reconnects and fetches the current state from scratch.",
        ),
        l(
          "Diğer araçlar: mesajları küçültmek (sadece değişeni göndermek), `permessage-deflate` sıkıştırması (CPU karşılığında bant genişliği) ve sık güncellemeleri birleştirmek. ws bunların hiçbirini senin yerine yapmaz: `bufferedAmount`'a bakmak senin işin.",
          "Other tools: smaller messages (send only what changed), `permessage-deflate` compression (bandwidth in exchange for CPU), and merging frequent updates. ws does none of this for you: watching `bufferedAmount` is your job.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `board.js` her saniye 32 KB'lık bir pano gönderiyor; bir dizüstü ve zayıf çeken bir telefon bağlı (ikisi de kopunca kendisi yeniden bağlanır). **3 senaryo** var.",
          "Your turn. `board.js` sends a 32 KB board every second; a laptop and a phone on a weak signal are connected (both reconnect on their own when cut). There are **3 scenarios**.",
        ),
        l(
          "Kodu `nano board.js` ile değiştir, `pkill -f board.js` ve `node board.js &` ile yeniden başlat, `sleep` ile zaman geçir. Sahnede her istemcinin kuyruğu, sunucu kabinindeki soketinin yanında dolan bir kovayla ve altındaki KB etiketiyle görünür.",
          "Change the code with `nano board.js`, restart with `pkill -f board.js` and `node board.js &`, let time pass with `sleep`. On stage, each client's queue shows as a bin filling up next to its socket on the server's rack, with its size in KB under it.",
        ),
      ],
    },
  ],
  recap: [
    l("`ws.send()` hiç reddetmez; gönderilemeyen veri sunucunun belleğinde kuyrukta bekler.", "`ws.send()` never refuses; what can't be sent waits in a queue in the server's memory."),
    l("`bufferedAmount` o kuyruğun boyutudur: kabul edilmiş ama ağa çıkamamış baytlar.", "`bufferedAmount` is that queue's size: bytes accepted but not yet out on the network."),
    l("Yavaş bir istemci, kontrol edilmezse bütün sunucuyu belleksiz bırakabilir.", "One slow client, left unchecked, can run the whole server out of memory."),
    l("Durum akışlarında dolu kuyruğa göndermeyi atla; her parçanın önemli olduğu akışlarda çok geride kalanı kes.", "For state streams, skip a full queue; where every piece matters, cut off whoever falls too far behind."),
    l("Küçük mesajlar, sıkıştırma ve birleştirme de yardımcı olur; ama kontrol her zaman senin kodunda.", "Small messages, compression and merging help too; but the check always lives in your code."),
  ],
  quiz: [
    {
      question: l("Bir istemci yavaş okuyorsa `ws.send()` ne yapar?", "If a client reads slowly, what does `ws.send()` do?"),
      options: [
        l("Hata fırlatır", "Throws an error"),
        l("Veriyi kabul edip kuyruğa koyar; bufferedAmount büyür", "Accepts the data and queues it; bufferedAmount grows"),
        l("İstemci yetişene kadar bekler", "Waits until the client catches up"),
        l("Veriyi atar", "Drops the data"),
      ],
      answer: 1,
      explain: l("Kuyruk sınırsızdır; sınırı koymak senin işin.", "The queue has no limit; setting one is your job."),
      reviewStep: 1,
    },
    {
      question: l("Canlı bir konum akışında yavaş istemci için en uygun davranış?", "For a live location stream, the best behaviour toward a slow client?"),
      options: [
        l("Her güncellemeyi sırayla göndermek", "Send every update in order"),
        l("Kuyruğu doluyken göndermemek; en yenisini sonra göndermek", "Not send while its queue is full; send the newest later"),
        l("Sunucuyu yeniden başlatmak", "Restart the server"),
        l("Mesajları büyütmek", "Make messages bigger"),
      ],
      answer: 1,
      explain: l("Eski bir konumun değeri yok; atlamak hem belleği hem gecikmeyi korur.", "An old location is worthless; skipping protects both memory and freshness."),
      reviewStep: 2,
    },
    {
      question: l("Çok geride kalan bir istemciyi kesmek için neden `close()` değil `terminate()`?", "Why `terminate()` rather than `close()` to cut off a client that's far behind?"),
      options: [
        l("close() yoktur", "close() doesn't exist"),
        l("Kapanış frame'i de o dolu kuyruğun arkasında bekler", "The close frame would also wait at the back of that full queue"),
        l("terminate() daha kibar", "terminate() is more polite"),
        l("Fark yok", "No difference"),
      ],
      answer: 1,
      explain: l("terminate() TCP bağlantısını hemen düşürür ve kuyruğu boşaltır.", "terminate() drops the TCP connection at once and frees the queue."),
      reviewStep: 3,
    },
    {
      question: l("bufferedAmount neyi ölçer?", "What does bufferedAmount measure?"),
      options: [
        l("İstemcinin okuduğu bayt sayısını", "The bytes the client has read"),
        l("send ile kabul edilip henüz ağa çıkmamış baytları", "Bytes accepted by send that haven't gone out yet"),
        l("Toplam gönderilen baytı", "Total bytes sent"),
        l("Bağlantının yaşını", "The connection's age"),
      ],
      answer: 1,
      explain: l("Sıfıra yakınsa sorun yok; büyüyorsa karşı taraf yetişemiyor.", "Near zero, all is well; growing, the other side can't keep up."),
      reviewStep: 1,
    },
  ],
};
