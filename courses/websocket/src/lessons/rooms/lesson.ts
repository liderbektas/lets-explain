import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const rooms: Lesson = {
  slug: "rooms",
  title: l("Yayın ve odalar", "Broadcast and rooms"),
  summary: l(
    "Mesajlara bir tür ver, istemcileri odalara ayır ve mesajı sadece odadakilere gönder. Sonra odalı sunucuların dört klasik hatasını düzelt.",
    "Give messages a type, put clients into rooms, and send a message to the room only. Then fix the four classic bugs of servers with rooms.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Mesajları tür alanıyla JSON olarak taşımak", "Carry messages as JSON with a type field"), step: 0 },
    { text: l("Odaları bir Map ile tutmak", "Keep rooms in a Map"), step: 1 },
    { text: l("Mesajı sadece odaya göndermek", "Send a message to the room only"), step: 2 },
    { text: l("Hatalı bir mesajın sunucuyu düşürmesini önlemek", "Keep one bad message from taking the server down"), step: 3 },
    { text: l("Odaların nerede yaşadığını bilmek", "Know where rooms live"), step: 4 },
  ],
  steps: [
    {
      short: l("JSON", "JSON"),
      tag: "idea",
      title: l("Mesajın bir türü olsun", "Give each message a type"),
      body: [
        l(
          "WebSocket sadece metin ya da bayt taşır; ne anlama geldiğine sen karar verirsin. Yaygın yol JSON ve bir `type` alanı: `{\"type\":\"join\",\"room\":\"genel\"}` odaya katılır, `{\"type\":\"chat\",\"text\":\"selam\"}` sohbet eder.",
          "WebSocket only carries text or bytes; what they mean is up to you. The usual way is JSON with a `type` field: `{\"type\":\"join\",\"room\":\"genel\"}` joins a room, `{\"type\":\"chat\",\"text\":\"hi\"}` chats.",
        ),
        l(
          "Sunucu `type`'a bakıp ne yapacağına karar verir ve aynı biçimde cevap verir: tarayıcı `{\"type\":\"joined\",\"room\":\"genel\"}` aldı.",
          "The server looks at `type` to decide what to do, and answers in the same shape: the browser got `{\"type\":\"joined\",\"room\":\"genel\"}`.",
        ),
      ],
    },
    {
      short: l("Odalar", "Rooms"),
      tag: "how",
      title: l("Odalar bir Map'tir", "Rooms are a Map"),
      body: [
        l(
          "Sunucu odaları bellekte tutuyor: `rooms`, oda adından o odadaki soketlerin kümesine giden bir `Map`. Dizüstü #ops'a, telefon #genel'e katıldı.",
          "The server keeps rooms in memory: `rooms`, a `Map` from a room's name to the set of sockets in it. The laptop joined #ops, the phone #genel.",
        ),
        l(
          "Her soketin hangi odada olduğunu da soketin üstüne yazıyoruz (`ws.room`); böylece mesaj gelince odayı aramak gerekmiyor.",
          "We also write each socket's room onto the socket itself (`ws.room`), so there's no searching for the room when a message comes.",
        ),
      ],
    },
    {
      short: l("Odaya yayın", "Room broadcast"),
      tag: "how",
      predict: {
        question: l(
          "Tarayıcı (#genel) \"standup in 5\" yazdı. Telefon #genel'de, dizüstü #ops'ta. Kimler alır?",
          "The browser (#genel) wrote \"standup in 5\". The phone is in #genel, the laptop in #ops. Who gets it?",
        ),
        options: [
          l("Herkes", "Everyone"),
          l("Tarayıcı ve telefon", "The browser and the phone"),
          l("Sadece telefon", "Only the phone"),
          l("Sadece dizüstü", "Only the laptop"),
        ],
        answer: 1,
        why: l(
          "Sunucu mesajı `rooms.get(\"genel\")` içindekilere gönderir: tarayıcının kendisi ve telefon. #ops'taki dizüstü hiçbir şey almaz.",
          "The server sends the message to those in `rooms.get(\"genel\")`: the browser itself and the phone. The laptop in #ops gets nothing.",
        ),
      },
      title: l("Sadece odadakilere", "Only to the room"),
      body: [
        l(
          "`wss.clients` yerine `rooms.get(ws.room)` dolaşılıyor. Bu, sohbetten oyun lobilerine, canlı belge düzenlemeye kadar her şeyin temeli: \"bu olayı kimler duymalı?\"",
          "The loop runs over `rooms.get(ws.room)` instead of `wss.clients`. This is the base of everything from chat to game lobbies to live document editing: \"who should hear this event?\"",
        ),
      ],
    },
    {
      short: l("Hatalı mesaj", "Bad message"),
      tag: "how",
      title: l("Bir mesaj sunucuyu düşürmesin", "One message must not take the server down"),
      body: [
        l(
          "Dizüstü JSON olmayan bir şey gönderdi. Bu sunucu `JSON.parse`'ı `try/catch` içine almış: dizüstüne `{\"type\":\"error\"}` döndü ve herkes bağlı kalmaya devam etti.",
          "The laptop sent something that isn't JSON. This server wraps `JSON.parse` in `try/catch`: the laptop got `{\"type\":\"error\"}` back, and everyone stayed connected.",
        ),
        l(
          "`try/catch` olmasaydı, `message` olayında fırlayan hata Node sürecini bitirirdi ve o sunucudaki herkesin bağlantısı kopardı. İstemciden gelen her şeyi güvenilmez say: biçimini, türünü ve boyutunu denetle.",
          "Without the `try/catch`, the error thrown in the `message` handler would end the Node process, and everyone on that server would be cut off. Treat everything from a client as untrusted: check its shape, its type and its size.",
        ),
      ],
    },
    {
      short: l("Bellekte", "In memory"),
      tag: "reality",
      title: l("Odalar nerede yaşar?", "Where do rooms live?"),
      body: [
        l(
          "Bu odalar tek bir sürecin belleğinde. Sunucu yeniden başlayınca kaybolurlar; istemcilerin yeniden bağlanınca yeniden katılması gerekir. Birden fazla sunucuda her sunucunun odaları ayrıdır: bunu 7. bölümde Redis ile çözeceğiz.",
          "These rooms live in a single process's memory. They vanish when the server restarts, and clients must join again when they reconnect. With several servers each has its own rooms: chapter 7 solves that with Redis.",
        ),
        l(
          "Kapanan bağlantıyı odasından silmeyi unutmak sık bir bellek sızıntısıdır: kümeler hiç küçülmez ve sunucu ölü soketlere göndermeye çalışır. Socket.IO odaları hazır sunar; ws'de bu kod senindir.",
          "Forgetting to remove a closed connection from its room is a common memory leak: the sets never shrink, and the server keeps trying to send to dead sockets. Socket.IO offers rooms ready-made; with ws that code is yours.",
        ),
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. `server.js` odalı sohbet sunucusu (`:9001`), ama hatalarla dolu. `bots.js` Ayşe'yi #genel'e, Mert'i #ops'a sokar; `switch.js` oda değiştirmeyi test eder. **4 senaryo** var.",
          "Your turn. `server.js` is the chat server with rooms (`:9001`), but full of bugs. `bots.js` puts Ayşe in #genel and Mert in #ops; `switch.js` tests switching rooms. There are **4 scenarios**.",
        ),
        l(
          "wscat'te mesajları JSON olarak yaz: `{\"type\":\"join\",\"room\":\"genel\"}`, `{\"type\":\"chat\",\"text\":\"selam\"}`. Çıkmak için Ctrl+C.",
          "In wscat, type messages as JSON: `{\"type\":\"join\",\"room\":\"genel\"}`, `{\"type\":\"chat\",\"text\":\"hi\"}`. Ctrl+C leaves.",
        ),
      ],
    },
  ],
  recap: [
    l("Mesajlara `type` alanı olan JSON bir biçim ver; sunucu ona göre davranır.", "Give messages a JSON shape with a `type` field; the server acts on it."),
    l("Odalar, oda adından soket kümesine giden bir Map; soket de kendi odasını bilir.", "Rooms are a Map from a room name to a set of sockets; each socket knows its room too."),
    l("Yayını `wss.clients`'a değil, odanın kümesine yap.", "Broadcast to the room's set, not to `wss.clients`."),
    l("İstemciden geleni güvenilmez say: `JSON.parse`'ı try/catch içine al, yoksa tek mesaj süreci düşürür.", "Treat what a client sends as untrusted: wrap `JSON.parse` in try/catch, or one message takes the process down."),
    l("Oda değiştirirken eskisinden, kapanırken odasından çıkar; yoksa bellek sızar.", "Leave the old room when switching, and the room on close; otherwise memory leaks."),
  ],
  quiz: [
    {
      question: l("Bir istemci #genel'den #ops'a geçti ama #genel'in mesajlarını almaya devam ediyor. Sebep?", "A client moved from #genel to #ops but still gets #genel's messages. Why?"),
      options: [
        l("İstemci hatası", "A client bug"),
        l("Sunucu soketi eski odanın kümesinden çıkarmadı", "The server didn't remove the socket from the old room's set"),
        l("WebSocket odaları desteklemiyor", "WebSocket doesn't support rooms"),
        l("Mesajlar önbellekte", "The messages are cached"),
      ],
      answer: 1,
      explain: l("Katılırken yeni kümeye eklemek yetmez; eskisinden de silmek gerekir.", "Adding to the new set on join isn't enough; it must be removed from the old one too."),
      reviewStep: 2,
    },
    {
      question: l("`message` olayında `JSON.parse` geçersiz bir girdiyle hata fırlattı ve kimse yakalamadı. Ne olur?", "In the `message` handler `JSON.parse` threw on bad input and nobody caught it. What happens?"),
      options: [
        l("Sadece o mesaj atlanır", "Only that message is skipped"),
        l("Node süreci çöker; o sunucudaki herkesin bağlantısı kopar", "The Node process crashes; everyone on that server is cut off"),
        l("ws hatayı kendisi yakalar", "ws catches it itself"),
        l("İstemciye 400 gider", "The client gets a 400"),
      ],
      answer: 1,
      explain: l("Olay dinleyicisinde yakalanmayan bir hata Node'da süreci bitirir.", "An uncaught error in an event listener ends the process in Node."),
      reviewStep: 3,
    },
    {
      question: l("Odaları tek sunucunun belleğinde tutmanın sınırı ne?", "What's the limit of keeping rooms in one server's memory?"),
      options: [
        l("Hiçbir sınırı yok", "None"),
        l("Yeniden başlatınca kaybolurlar ve başka bir sunucudaki istemciler bu odaları görmez", "They vanish on restart, and clients on another server don't see these rooms"),
        l("Oda sayısı en fazla 10 olabilir", "There can be at most 10 rooms"),
        l("Odalar sadece Socket.IO'da var", "Rooms only exist in Socket.IO"),
      ],
      answer: 1,
      explain: l("Birden fazla sunucuda odaları paylaşmak için ortak bir yayın kanalı (örneğin Redis pub/sub) gerekir.", "Sharing rooms across servers takes a common channel (Redis pub/sub, for example)."),
      reviewStep: 4,
    },
    {
      question: l("Kapanan bir bağlantıyı odasından silmeyi unutursan?", "If you forget to remove a closed connection from its room?"),
      options: [
        l("Hiçbir şey olmaz", "Nothing happens"),
        l("Odalar hiç küçülmez, bellek sızar ve ölü soketlere gönderilmeye çalışılır", "Rooms never shrink, memory leaks, and the server tries to send to dead sockets"),
        l("Bağlantı yeniden açılır", "The connection reopens"),
        l("Oda silinir", "The room is deleted"),
      ],
      answer: 1,
      explain: l("Her soketin `close` olayında odasından çıkarılması gerekir.", "Every socket must be removed from its room in its `close` event."),
      reviewStep: 4,
    },
  ],
};
