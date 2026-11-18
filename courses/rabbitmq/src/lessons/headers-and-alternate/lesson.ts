import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const headersAndAlternate: Lesson = {
  slug: "headers-and-alternate",
  title: l("Headers ve alternate exchange", "Headers and alternate exchanges"),
  summary: l(
    "Header'lara göre yönlendirme (`x-match` all / any) ve hiçbir kuyruğa uymayan mesajları kaybetmemenin iki yolu: alternate exchange ve `mandatory`.",
    "Routing by headers (`x-match` all / any), and two ways not to lose messages that match no queue: alternate exchanges and `mandatory`.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`x-match: all` ile `any` farkını görmek", "See the difference between `x-match: all` and `any`"), step: 2 },
    { text: l("Hiçbir kuyruğa uymayan mesajın kaybolduğunu görmek", "See a message that matches no queue get lost"), step: 3 },
    { text: l("Alternate exchange ile bu mesajları yakalamak", "Catch those messages with an alternate exchange"), step: 4 },
    { text: l("`mandatory` ile mesajı producer'a geri almak", "Get the message back to the producer with `mandatory`"), step: 5 },
  ],
  steps: [
    {
      short: l("Headers", "Headers"),
      tag: "how",
      title: l("Anahtar yerine header'lar", "Headers instead of a key"),
      body: [
        l(
          "Bazen yönlendirmeyi tek bir anahtar değil, mesajın birden çok özelliği belirler: belgenin biçimi (`format`) ve bölgesi (`region`). **Headers exchange** routing key'e bakmaz; mesajın header'larına bakar.",
          "Sometimes routing depends on several properties of a message rather than one key: a document's `format` and `region`. A **headers exchange** ignores the routing key and looks at the message's headers.",
        ),
        l(
          "Her binding bir header listesi ve bir `x-match` kuralı taşır. `pdf-eu` kuyruğu `all` ile bağlı: **hepsi** uymalı. `pdf-or-eu` ise `any` ile: **biri** uysa yeter.",
          "Each binding carries a list of headers and an `x-match` rule. `pdf-eu` is bound with `all`: **every** header must match. `pdf-or-eu` uses `any`: **one** is enough.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Python · headers kur",
            code: 'ch.exchange_declare(exchange="documents", exchange_type="headers", durable=True)\nch.queue_declare(queue="pdf-eu", durable=True)\nch.queue_bind(exchange="documents", queue="pdf-eu",\n              arguments={"x-match": "all", "format": "pdf", "region": "eu"})',
          },
        ],
      },
    },
    {
      short: l("İkisi de uyar", "Both match"),
      tag: "experiment",
      predict: {
        question: l("`format=pdf, region=eu` header'lı bir belge gelecek. Hangi kuyruklar alır?", "A document with `format=pdf, region=eu` arrives. Which queues get it?"),
        options: [l("Sadece `pdf-eu`", "Only `pdf-eu`"), l("İkisi de", "Both"), l("Hiçbiri: routing key yok", "None: there is no routing key")],
        answer: 1,
        why: l("İki header da uyuyor: `all` kuralı sağlanıyor, `any` de. Routing key'in boş olması headers exchange için önemli değil.", "Both headers match, so `all` is satisfied and so is `any`. An empty routing key does not matter to a headers exchange."),
      },
      title: l("İki kural da sağlandı", "Both rules are met"),
      body: [l("Belge iki kuyruğa da düştü. Headers exchange de fanout ve topic gibi uyan her kuyruğa bir kopya verir.", "The document landed in both queues. Like fanout and topic, a headers exchange gives a copy to every matching queue.")],
      practice: {
        commands: [],
        snippets: [{ label: "Python · header'lı gönder", code: 'ch.basic_publish(exchange="documents", routing_key="", body=b"...",\n                 properties=pika.BasicProperties(headers={"format": "pdf", "region": "eu"}))' }],
      },
    },
    {
      short: l("all ile any", "all vs any"),
      tag: "experiment",
      predict: {
        question: l("Şimdi `format=pdf, region=us`. Hangi kuyruklar alır?", "Now `format=pdf, region=us`. Which queues get it?"),
        options: [l("İkisi de", "Both"), l("Sadece `pdf-or-eu`", "Only `pdf-or-eu`"), l("Sadece `pdf-eu`", "Only `pdf-eu`")],
        answer: 1,
        why: l("`pdf-eu` `all` ister ve `region` uymuyor. `pdf-or-eu` `any` ile bağlı: `format=pdf` uyduğu için yeter.", "`pdf-eu` wants `all`, and `region` does not match. `pdf-or-eu` is `any`: `format=pdf` matching is enough."),
      },
      title: l("`all` hepsini, `any` birini ister", "`all` wants every one, `any` wants one"),
      body: [l("Belge sadece `pdf-or-eu`'ya gitti. Aynı header listesi, farklı `x-match` kuralıyla bambaşka sonuç veriyor.", "The document went only to `pdf-or-eu`. The same header list with a different `x-match` gives a very different result.")],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`x-` ile başlayan header'lar eşleştirmede yok sayılır. Bunları dahil etmek için `all-with-x` ve `any-with-x` kuralları da vardır.",
            "Headers starting with `x-` are ignored when matching. To include them there are also `all-with-x` and `any-with-x`.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_bindings source_name destination_name arguments", note: l("Headers binding'lerinin `x-match` ve header'ları `arguments` sütununda.", "A headers binding's `x-match` and headers are in the `arguments` column.") }] },
    },
    {
      short: l("Kayıp", "Lost"),
      tag: "problem",
      predict: {
        question: l("Şimdi `format=csv, region=us`. Hiçbir kuyruk bunu istemiyor. Mesaja ne olur?", "Now `format=csv, region=us`. No queue wants it. What happens to the message?"),
        options: [l("Biri bağlanana kadar exchange'te bekler", "It waits in the exchange until someone binds"), l("Sessizce atılır", "It is silently dropped"), l("Producer hata alır", "The producer gets an error")],
        answer: 1,
        why: l("Exchange'ler mesaj saklamaz. Uyan kuyruk yoksa mesaj varsayılan olarak atılır ve producer bunu fark etmez.", "Exchanges store nothing. With no matching queue the message is dropped by default, and the producer never notices."),
      },
      title: l("Kimseye uymayan mesaj sessizce kaybolur", "A message that matches nobody is silently lost"),
      body: [
        l("Belge hiçbir kuyruğa uymadı ve atıldı; sağ üstte \"kayıp: 1\" var. Producer'a hiçbir hata gelmedi.", "The document matched no queue and was dropped; top right says \"lost: 1\". The producer got no error."),
        l("Bu, yazım hatalı bir header, eksik bir binding ya da henüz açılmamış bir servis yüzünden her exchange türünde olabilir. Bunu yakalamanın iki yolu var.", "This can happen with any exchange type: a misspelled header, a missing binding, a service not started yet. There are two ways to catch it."),
      ],
      practice: { commands: [] },
    },
    {
      short: l("Alternate", "Alternate"),
      tag: "idea",
      title: l("Alternate exchange: kayıp eşya bürosu", "An alternate exchange: the lost and found"),
      body: [
        l(
          "`documents` exchange'ine bir **alternate exchange** tanımladık: `unrouted` adında bir fanout. Artık hiçbir kuyruğa uymayan mesajlar atılmak yerine oraya gider, oradan da `unrouted` kuyruğuna.",
          "We gave `documents` an **alternate exchange**: a fanout called `unrouted`. Messages that match no queue now go there instead of being dropped, and from there into the `unrouted` queue.",
        ),
        l("Aynı `csv/us` belgesi bu sefer kaybolmadı. `unrouted` kuyruğunu izleyip neyin neden eşleşmediğini sonradan inceleyebilirsin.", "The same `csv/us` document is not lost this time. You can watch the `unrouted` queue and look later at what did not match and why."),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada alternate'i var olan exchange'e sonradan ekledik. Gerçekte bu, exchange tanımlanırken `alternate-exchange` argümanıyla ya da (önerilen yol) bir **policy** ile yapılır. Var olan bir exchange'i farklı argümanlarla yeniden tanımlamak hata verir.",
            "Here we added the alternate to an existing exchange afterwards. In reality you set it with the `alternate-exchange` argument when declaring, or (recommended) with a **policy**. Redeclaring an existing exchange with different arguments fails.",
          ),
        },
      ],
      practice: {
        commands: [
          {
            cmd: `docker exec rabbitmq rabbitmqctl set_policy AE "^documents$" '{"alternate-exchange":"unrouted"}' --apply-to exchanges`,
            note: l("Kodu değiştirmeden, çalışan bir exchange'e alternate ekler.", "Adds an alternate to a running exchange without touching code."),
          },
        ],
        snippets: [
          {
            label: "Python · tanımlarken",
            code: 'ch.exchange_declare(exchange="unrouted", exchange_type="fanout", durable=True)\nch.exchange_declare(exchange="documents", exchange_type="headers", durable=True,\n                    arguments={"alternate-exchange": "unrouted"})',
          },
        ],
      },
    },
    {
      short: l("mandatory", "mandatory"),
      tag: "how",
      predict: {
        question: l(
          "`orders` exchange'inde sadece `invoice` binding'i var. Mağaza `refund` key'li bir mesajı `mandatory=True` ile gönderecek. Ne olur?",
          "`orders` has only an `invoice` binding. The shop will send a `refund` message with `mandatory=True`. What happens?",
        ),
        options: [l("Sessizce atılır", "It is silently dropped"), l("Producer'a geri döner", "It comes back to the producer"), l("`billing`'e gider", "It goes to `billing`")],
        answer: 1,
        why: l("`mandatory` \"bu mesaj bir kuyruğa ulaşmazsa bana geri ver\" demek. Broker uymayan mesajı `basic.return` ile producer'a iade eder.", "`mandatory` means \"if this reaches no queue, give it back to me\". The broker returns it to the producer with `basic.return`."),
      },
      title: l("`mandatory`: uymazsa geri ver", "`mandatory`: give it back if it matches nothing"),
      body: [
        l(
          "Mağaza önce `refund`'ı normal gönderdi: atıldı. Sonra aynısını `mandatory=True` ile gönderdi: broker mesajı **geri döndürdü**. Producer bunu fark edip loglayabilir, uyarı verebilir ya da tekrar deneyebilir.",
          "The shop first sent `refund` normally: dropped. Then it sent the same with `mandatory=True`: the broker **returned** it. The producer can notice, log it, alert, or retry.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Alternate exchange broker'da kurulan bir güvenlik ağı: producer'ların kodu değişmez. `mandatory` ise producer'ın kendi sorumluluğu: her producer'ın iade edilen mesajları dinlemesi gerekir.",
            "An alternate exchange is a safety net set up in the broker: producer code stays the same. `mandatory` is the producer's own job: every producer must listen for returned messages.",
          ),
        },
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Python · mandatory",
            code: 'ch.confirm_delivery()\ntry:\n    ch.basic_publish(exchange="orders", routing_key="refund", body=b"r2", mandatory=True)\nexcept pika.exceptions.UnroutableError:\n    print("no queue took it")',
            note: l("Pika'nın BlockingConnection'ında iade edilen mesaj, publisher confirms açıkken `UnroutableError` olarak gelir.", "With pika's BlockingConnection and publisher confirms on, a returned message raises `UnroutableError`."),
          },
        ],
      },
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "reality",
      title: l("Ne zaman hangisi?", "When to use which?"),
      body: [
        l(
          "**Headers exchange**: yönlendirme birden çok özelliğe bağlıysa ve bunlar bir anahtara sığmıyorsa. Çoğu durumda iyi tasarlanmış bir topic anahtarı (`pdf.eu`) daha basit ve daha hızlıdır.",
          "**Headers exchange**: when routing depends on several properties that do not fit in a key. In most cases a well designed topic key (`pdf.eu`) is simpler and faster.",
        ),
        l(
          "**Alternate exchange**: \"hiçbir mesaj sessizce kaybolmasın\" diyorsan, broker tarafında policy ile. **mandatory**: producer o mesajın bir yere ulaştığından emin olmak zorundaysa. İkisi birlikte de kullanılabilir.",
          "**Alternate exchange**: when no message may be lost silently, set in the broker with a policy. **mandatory**: when the producer must be sure the message reached somewhere. You can use both.",
        ),
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_policies", note: l("Kurulu policy'leri, örneğin alternate exchange'i gösterir.", "Shows installed policies, such as an alternate exchange.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "`docs` adında bir headers exchange var. `pdf` kuyruğu `format=pdf` ile bağlı; `pdf-eu` kuyruğunu `all` ya da `any` ile sen bağlayacaksın. `docs`'a `unrouted` alternate'ini ekleyebilir ve dört farklı belge gönderebilirsin.",
          "There is a headers exchange `docs`. The `pdf` queue is bound with `format=pdf`; you bind `pdf-eu` with `all` or `any`. You can give `docs` the `unrouted` alternate and send four different documents.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Headers exchange routing key'e değil, mesajın header'larına bakar.", "A headers exchange routes by the message's headers, not the routing key."),
    l("`x-match: all` bütün header'ların, `any` sadece birinin uymasını ister.", "`x-match: all` needs every header to match, `any` needs just one."),
    l("Hiçbir kuyruğa uymayan mesaj varsayılan olarak sessizce atılır.", "A message that matches no queue is silently dropped by default."),
    l("Alternate exchange, uymayan mesajları broker'da yakalar; en iyisi policy ile kurmak.", "An alternate exchange catches unmatched messages in the broker; best set with a policy."),
    l("`mandatory=True` uymayan mesajı producer'a geri döndürür; producer bunu dinlemeli.", "`mandatory=True` returns an unmatched message to the producer, which must listen for it."),
  ],
  quiz: [
    {
      question: l("Binding: `x-match=any, format=pdf, region=eu`. Hangi mesaj **uymaz**?", "Binding: `x-match=any, format=pdf, region=eu`. Which message does **not** match?"),
      options: [l("`format=pdf, region=us`", "`format=pdf, region=us`"), l("`format=csv, region=eu`", "`format=csv, region=eu`"), l("`format=csv, region=us`", "`format=csv, region=us`"), l("`format=pdf, region=eu`", "`format=pdf, region=eu`")],
      answer: 2,
      explain: l("`any` bir header'ın uymasını ister; `csv/us`'de ikisi de uymuyor.", "`any` needs one header to match; `csv/us` matches neither."),
      reviewStep: 2,
    },
    {
      question: l("Hiçbir şey ayarlanmamışken, hiçbir kuyruğa uymayan bir mesaja ne olur?", "With nothing configured, what happens to a message that matches no queue?"),
      options: [l("Exchange'te bekler", "It waits in the exchange"), l("Sessizce atılır", "It is silently dropped"), l("Producer'a geri döner", "It is returned to the producer"), l("Default exchange'e gider", "It goes to the default exchange")],
      answer: 1,
      explain: l("Varsayılan davranış atmaktır. Geri döndürmek için `mandatory`, yakalamak için alternate exchange gerekir.", "Dropping is the default. Returning it needs `mandatory`; catching it needs an alternate exchange."),
      reviewStep: 3,
    },
    {
      question: l("Producer kodlarına dokunmadan, uymayan bütün mesajları bir kuyrukta toplamak istiyorsun. Ne kullanırsın?", "You want every unmatched message collected in a queue, without touching producer code. What do you use?"),
      options: [l("`mandatory=True`", "`mandatory=True`"), l("Policy ile alternate exchange", "An alternate exchange set by policy"), l("Headers exchange", "A headers exchange"), l("Daha büyük bir kuyruk", "A bigger queue")],
      answer: 1,
      explain: l("Alternate exchange broker'da tanımlanır; policy ile kodsuz eklenir. `mandatory` her producer'ın kodunu değiştirmeyi gerektirir.", "An alternate exchange lives in the broker and a policy adds it without code. `mandatory` needs every producer's code to change."),
      reviewStep: 4,
    },
    {
      question: l("Çoğu durumda headers exchange yerine ne önerilir?", "In most cases, what is recommended instead of a headers exchange?"),
      options: [l("Fanout", "Fanout"), l("İyi tasarlanmış bir topic anahtarı", "A well designed topic key"), l("Default exchange", "The default exchange"), l("Her header için ayrı kuyruk", "A queue per header")],
      answer: 1,
      explain: l("`pdf.eu` gibi bir topic anahtarı aynı ayrımı daha basit ve daha hızlı yapar.", "A topic key such as `pdf.eu` makes the same split more simply and faster."),
      reviewStep: 6,
    },
  ],
};
