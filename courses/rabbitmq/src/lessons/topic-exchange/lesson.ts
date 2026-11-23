import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const three = l("`eu-orders`, `all-orders` ve `audit`", "`eu-orders`, `all-orders` and `audit`");

export const topicExchange: Lesson = {
  slug: "topic-exchange",
  title: l("Topic exchange", "Topic exchange"),
  summary: l(
    "Noktalı routing key'ler ve `*` / `#` kalıplarıyla, her kuyruk sadece ilgilendiği mesajları alır. Gerçek projelerde en çok kullanılan exchange türü.",
    "Dotted routing keys and `*` / `#` patterns let each queue take only what it cares about. The exchange type real projects use most.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Noktalı routing key'leri ve kalıpları okumak", "Read dotted routing keys and patterns"), step: 1 },
    { text: l("`*`'ın tam bir kelime olduğunu görmek", "See that `*` is exactly one word"), step: 2 },
    { text: l("`#`'nin sıfır ya da daha fazla kelime olduğunu görmek", "See that `#` is zero or more words"), step: 4 },
    { text: l("Kendi projen için anahtar tasarlamak", "Design keys for your own project"), step: 5 },
  ],
  steps: [
    {
      short: l("Kalıplar", "Patterns"),
      tag: "how",
      title: l("Noktalı anahtarlar, kalıplı binding'ler", "Dotted keys, patterned bindings"),
      body: [
        l(
          "Topic exchange'te [[routingKey]] noktalarla ayrılmış kelimelerden oluşur: `order.created.eu` gibi. Binding'ler de kalıp kullanır.",
          "In a topic exchange the [[routingKey]] is words separated by dots, such as `order.created.eu`. Bindings use patterns.",
        ),
        l(
          "İki joker var: `*` **tam bir** kelimenin yerini tutar, `#` ise **sıfır ya da daha fazla** kelimenin. Sahnedeki üç kuyruğun kalıpları: `order.*.eu`, `order.#` ve `#`.",
          "There are two wildcards: `*` stands for **exactly one** word, `#` for **zero or more** words. The three queues here use `order.*.eu`, `order.#` and `#`.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_bindings source_name destination_name routing_key", note: l("Kalıpları binding'lerin routing key sütununda görürsün.", "Patterns show up in the bindings' routing key column.") }],
        snippets: [
          {
            label: "Node.js · topic kur",
            code: 'await ch.assertExchange("events", "topic");\n// queues declared with assertQueue first\nawait ch.bindQueue("eu-orders", "events", "order.*.eu");\nawait ch.bindQueue("all-orders", "events", "order.#");\nawait ch.bindQueue("audit", "events", "#");\n\nch.publish("events", "order.created.eu", body);',
          },
        ],
      },
    },
    {
      short: l("Tam eşleşme", "Full match"),
      tag: "experiment",
      predict: {
        question: l("`order.created.eu` gönderilecek. Hangi kuyruklar alır?", "`order.created.eu` will be published. Which queues get it?"),
        options: [l("Sadece `eu-orders`", "Only `eu-orders`"), three, l("Sadece `audit`", "Only `audit`")],
        answer: 1,
        why: l(
          "`order.*.eu`: ortadaki `created` tek kelime, uyar. `order.#`: `order` ile başlıyor, uyar. `#`: her şeye uyar. Üç kuyruk da bir kopya alır.",
          "`order.*.eu`: the middle `created` is one word, so it matches. `order.#`: starts with `order`, so it matches. `#` matches anything. All three get a copy.",
        ),
      },
      title: l("Bir mesaj, birden çok kalıp", "One message, several patterns"),
      body: [
        l("`order.created.eu` üç kalıba da uydu ve üç kuyruğa birer kopya düştü. Topic, fanout gibi kopyalayabilir; farkı, sadece **uyan** kuyruklara kopyalamasıdır.", "`order.created.eu` matched all three patterns and each queue got a copy. Like fanout, topic copies; the difference is it copies only to queues that **match**."),
      ],
    },
    {
      short: l("Eksik kelime", "Missing word"),
      tag: "experiment",
      predict: {
        question: l("Bu sefer bölgesiz bir anahtar: `order.created`. Hangi kuyruklar alır?", "Now a key without a region: `order.created`. Which queues get it?"),
        options: [three, l("`all-orders` ve `audit`", "`all-orders` and `audit`"), l("Hiçbiri", "None")],
        answer: 1,
        why: l(
          "`order.*.eu` üç kelime ister ve sonuncusu `eu` olmalı. `order.created` iki kelime, uymaz. `order.#` ve `#` uyar.",
          "`order.*.eu` needs three words ending in `eu`. `order.created` has two, so it does not match. `order.#` and `#` do.",
        ),
      },
      title: l("`*` tam bir kelime ister", "`*` needs exactly one word"),
      body: [
        l(
          "`eu-orders` bu mesajı almadı: kalıbı tam üç kelime bekliyor. Eksik bir parça yüzünden mesaj sessizce bir kuyruğu atlayabilir.",
          "`eu-orders` did not get it: its pattern expects exactly three words. A single missing part can make a message silently skip a queue.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Anahtar biçimini bir kez belirle ve her yerde aynısını kullan. Bir servis `order.created.eu`, diğeri `order.eu.created` yazarsa kalıplar sessizce ıskalar.",
            "Pick one key format and use it everywhere. If one service sends `order.created.eu` and another `order.eu.created`, patterns quietly miss.",
          ),
        },
      ],
    },
    {
      short: l("Başka konu", "Other subject"),
      tag: "experiment",
      predict: {
        question: l("`user.signup.eu` gönderilecek. Hangi kuyruklar alır?", "`user.signup.eu` will be published. Which queues get it?"),
        options: [l("`eu-orders`, çünkü sonu `eu`", "`eu-orders`, because it ends in `eu`"), l("Sadece `audit`", "Only `audit`"), l("Hiçbiri", "None")],
        answer: 1,
        why: l("İlk kelime `order` değil, `user`. `order` ile başlayan iki kalıp uymaz; sadece her şeyi alan `#` uyar.", "The first word is `user`, not `order`. The two `order` patterns do not match; only the catch-all `#` does."),
      },
      title: l("Kalıp baştan sona okunur", "A pattern is read from start to end"),
      body: [
        l("`user.signup.eu` sadece `audit`'e gitti. Kalıplar kelime kelime, soldan sağa eşlenir: ilk kelimesi tutmayan kalıp elenir.", "`user.signup.eu` went only to `audit`. Patterns are matched word by word, left to right: one wrong first word and the pattern is out."),
        l("`#` tek başına her anahtara uyar, yani bir **fanout** gibi davranır. Denetim (audit) ya da loglama kuyrukları için kullanışlı.", "`#` on its own matches every key, so it behaves like **fanout**. Handy for audit or logging queues."),
      ],
    },
    {
      short: l("Fazla kelime", "Extra word"),
      tag: "experiment",
      predict: {
        question: l("`order.paid.eu.vip` gönderilecek (dört kelime). `eu-orders` alır mı?", "`order.paid.eu.vip` will be published (four words). Does `eu-orders` get it?"),
        options: [l("Evet, içinde `eu` var", "Yes, it contains `eu`"), l("Hayır, kalıp tam üç kelime istiyor", "No, the pattern wants exactly three words"), l("Evet, `*` birden çok kelime alabilir", "Yes, `*` can take several words")],
        answer: 1,
        why: l("`*` tek kelime demek ve kalıp `eu` ile bitmeli. Dört kelimelik ve `vip` ile biten anahtar uymaz. `order.#` ise kaç kelime olursa olsun uyar.", "`*` means one word and the pattern must end in `eu`. A four-word key ending in `vip` does not match. `order.#` matches however many words follow."),
      },
      title: l("`#` sıfır ya da daha fazla kelime", "`#` is zero or more words"),
      body: [
        l("`order.paid.eu.vip`, `all-orders` ve `audit`'e gitti, `eu-orders`'a gitmedi. Esnek olmak istediğin yerde `#`, kesin olmak istediğin yerde `*` kullan.", "`order.paid.eu.vip` went to `all-orders` and `audit`, not `eu-orders`. Use `#` where you want flexibility and `*` where you want precision."),
      ],
    },
    {
      short: l("Anahtar tasarımı", "Key design"),
      tag: "how",
      title: l("Kendi projen için anahtar tasarla", "Design keys for your project"),
      body: [
        l(
          "İyi bir düzen: `konu.olay.bölge`, örneğin `order.cancelled.eu`. Yeni bir `refunds` kuyruğu `*.cancelled.*` ile bağlandı: hangi konu olursa olsun, her iptal ona gelir.",
          "A good layout is `subject.event.region`, such as `order.cancelled.eu`. A new `refunds` queue is bound with `*.cancelled.*`: every cancellation reaches it, whatever the subject.",
        ),
        l(
          "Böylece yeni bir ihtiyaç doğduğunda producer'a dokunmazsın; yeni bir kuyruk ve bir kalıp eklemen yeter. Anahtarın en genel kısmını en başa koy.",
          "So when a new need comes up you do not touch the producer: add a queue and a pattern. Put the most general part of the key first.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Topic: çoğu projenin varsayılanı", "Topic: the default for most projects"),
      body: [
        l(
          "Topic hem direct (kalıpsız tam anahtar) hem fanout (`#`) gibi davranabildiği için çoğu proje olaylar için tek bir topic exchange ile başlar ve ihtiyaç oldukça kalıp ekler.",
          "Because topic can act like direct (a full key with no wildcards) and like fanout (`#`), most projects start with one topic exchange for events and add patterns as needs grow.",
        ),
        l("Routing key en fazla 255 bayt olabilir. Anahtara kullanıcı ya da sipariş numarası gibi değerler koyma; onlar mesajın içine ya da header'lara aittir.", "A routing key can be at most 255 bytes. Do not put values such as user or order ids in it; those belong in the body or headers."),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Çok sayıda binding'li topic exchange'te yönlendirme biraz daha maliyetlidir, ama yüzlerce binding'e kadar bu genelde fark edilmez. Önce okunur tasarım, sonra ölçüm.",
            "A topic exchange with very many bindings routes a little slower, but up to hundreds of bindings this rarely shows. Design for readability first, then measure.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_exchanges name type", note: l("Hazır `amq.topic` exchange'i de listelenir.", "The built-in `amq.topic` exchange is listed too.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz: doğru kalıbı bul", "Now you type: find the right pattern"),
      body: [
        l(
          "Sıra sende. Uygulama `events` topic exchange'ine `order.created.eu`, `order.paid.eu.vip`, `user.signup.eu` gibi key'lerle gönderiyor; `events.js` bunlardan birer tane yollar. Aşağıda **4 senaryo** var: her birinde bir ekip kuyruğuna doğru olayları istiyor.",
          "Your turn. The app sends to the `events` topic exchange with keys like `order.created.eu`, `order.paid.eu.vip`, `user.signup.eu`; `events.js` sends one of each. Below are **4 scenarios**: in each, a team wants the right events in its queue.",
        ),
        l(
          "`setup.js`'deki kalıbı `nano` ile düzelt, `node setup.js` ile uygula, `node events.js` ile dene. `rabbitmqctl list_queues name messages` neyin nereye düştüğünü gösterir.",
          "Fix the pattern in `setup.js` with `nano`, apply it with `node setup.js`, try it with `node events.js`. `rabbitmqctl list_queues name messages` shows what landed where.",
        ),
      ],
    },
  ],
  recap: [
    l("Topic exchange'te routing key noktalı kelimelerden oluşur: `order.created.eu`.", "In a topic exchange the routing key is dotted words: `order.created.eu`."),
    l("`*` tam bir kelime, `#` sıfır ya da daha fazla kelime yerine geçer.", "`*` stands for exactly one word, `#` for zero or more words."),
    l("Bir mesaj uyan her kuyruğa bir kopya olarak gider; hiçbiri uymazsa kaybolur.", "A message goes as a copy to every matching queue; if none match it is lost."),
    l("`#` tek başına fanout gibidir; kalıpsız tam bir anahtar direct gibidir.", "`#` alone acts like fanout; a full key with no wildcards acts like direct."),
    l("Anahtar biçimini bir kez belirle (`konu.olay.bölge`) ve her yerde aynısını kullan.", "Pick one key format (`subject.event.region`) and use it everywhere."),
  ],
  quiz: [
    {
      question: l("`stock.*.low` kalıbı hangisine uyar?", "Which does `stock.*.low` match?"),
      options: [l("`stock.low`", "`stock.low`"), l("`stock.milk.low`", "`stock.milk.low`"), l("`stock.milk.eu.low`", "`stock.milk.eu.low`"), l("`stock.milk.high`", "`stock.milk.high`")],
      answer: 1,
      explain: l("`*` tam bir kelime: arada tam olarak bir kelime olmalı ve son kelime `low`.", "`*` is exactly one word: there must be one word in the middle and the last word must be `low`."),
      reviewStep: 2,
    },
    {
      question: l("`order.#` kalıbı `order` anahtarına uyar mı?", "Does `order.#` match the key `order`?"),
      options: [l("Evet, `#` sıfır kelime de olabilir", "Yes, `#` can be zero words"), l("Hayır, en az bir kelime daha gerekir", "No, at least one more word is needed"), l("Sadece direct exchange'te", "Only in a direct exchange"), l("Hata verir", "It errors")],
      answer: 0,
      explain: l("`#` sıfır ya da daha fazla kelime demek; `order` tek başına da uyar.", "`#` means zero or more words, so `order` alone matches."),
      reviewStep: 4,
    },
    {
      question: l("Hiçbir binding'e uymayan bir mesaj topic exchange'e gelirse ne olur?", "What happens to a message that matches no binding on a topic exchange?"),
      options: [l("Bekletilir", "It is held"), l("Varsayılan olarak sessizce atılır", "By default it is silently dropped"), l("Bütün kuyruklara gider", "It goes to every queue"), l("Producer hata alır", "The producer gets an error")],
      answer: 1,
      explain: l("Exchange mesaj saklamaz. Bunu yakalamak için alternate exchange ya da `mandatory` bayrağı var (sonraki ders).", "An exchange stores nothing. Alternate exchanges or the `mandatory` flag catch this (next lesson)."),
      reviewStep: 3,
    },
    {
      question: l("Her iptal olayını almak isteyen bir kuyruk için hangi kalıp? (Anahtarlar `konu.olay.bölge` biçiminde.)", "Which pattern for a queue that wants every cancellation? (Keys are `subject.event.region`.)"),
      options: [l("`cancelled`", "`cancelled`"), l("`*.cancelled.*`", "`*.cancelled.*`"), l("`#.cancelled`", "`#.cancelled`"), l("`order.cancelled`", "`order.cancelled`")],
      answer: 1,
      explain: l("Konu ve bölge ne olursa olsun, ortadaki kelime `cancelled`: `*.cancelled.*`.", "Whatever the subject and region, the middle word is `cancelled`: `*.cancelled.*`."),
      reviewStep: 5,
    },
  ],
};
