import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

const CTL = "docker exec rabbitmq rabbitmqctl";

export const directExchange: Lesson = {
  slug: "direct-exchange",
  title: l("Direct exchange", "Direct exchange"),
  summary: l(
    "Routing key birebir eşleşirse mesaj o kuyruğa gider. Bir key'i birçok kuyruğa, bir kuyruğu birçok key'e bağla; uymayan mesajın sessizce kaybolduğunu gör.",
    "If the routing key matches exactly, the message goes to that queue. Bind one key to many queues and one queue to many keys, and watch an unmatched message vanish.",
  ),
  minutes: 10,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Direct exchange'in birebir eşleşmeyle yönlendirdiğini görmek", "See a direct exchange route on an exact match"), step: 1 },
    { text: l("Bir key'i birden fazla kuyruğa bağlamak", "Bind one key to several queues"), step: 1 },
    { text: l("Uymayan mesajın sessizce atıldığını görmek", "See an unmatched message silently dropped"), step: 3 },
    { text: l("Bir kuyruğu birden fazla key ile bağlamak", "Bind one queue with several keys"), step: 4 },
    { text: l("Her kuyruğun mesajın kendi kopyasını aldığını görmek", "See each queue get its own copy of a message"), step: 5 },
  ],
  steps: [
    {
      short: l("Log'lar", "Logs"),
      tag: "how",
      title: l("Önem derecesine göre log'lar", "Logs by severity"),
      body: [
        l(
          "Bir uygulama log mesajlarını `logs` adlı bir **direct** [[exchange]]'e gönderiyor. Her mesajın [[routingKey|routing key]]'i önem derecesi: `info`, `warning`, `error` ya da `debug`.",
          "An app sends its log messages to a **direct** [[exchange]] called `logs`. Each message's [[routingKey]] is its severity: `info`, `warning`, `error` or `debug`.",
        ),
        l(
          "İki kuyruk var. `errors` sadece `error` key'iyle bağlı: alarm sistemi için. `all-logs` üç key ile bağlı (`info`, `warning`, `error`): arşiv için. Bindings yolların üstündeki sarı etiketlerde.",
          "There are two queues. `errors` is bound only with `error`, for the alert system. `all-logs` is bound with three keys (`info`, `warning`, `error`), for the archive. The bindings are the yellow labels on the roads.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · exchange ve binding'ler",
            code: 'ch.exchange_declare(exchange="logs", exchange_type="direct", durable=True)\nch.queue_declare(queue="errors", durable=True)\nch.queue_declare(queue="all-logs", durable=True)\n\nch.queue_bind(queue="errors", exchange="logs", routing_key="error")\nfor sev in ["info", "warning", "error"]:\n    ch.queue_bind(queue="all-logs", exchange="logs", routing_key=sev)',
          },
        ],
        commands: [{ cmd: `${CTL} list_bindings source_name destination_name routing_key` }],
      },
    },
    {
      short: l("error", "error"),
      tag: "how",
      predict: {
        question: l("Uygulama `error` key'li bir mesaj gönderecek. Mesaj kaç kuyruğa gider?", "The app will send a message with key `error`. How many queues get it?"),
        options: [l("Sadece errors'a", "Only errors"), l("İkisine de", "Both"), l("Hiçbirine; direct tek kuyruğa gönderir", "Neither: direct sends to one queue only")],
        answer: 1,
        why: l(
          "Direct exchange, binding key'i routing key ile aynı olan **her** kuyruğa gönderir. İki kuyruk da `error` ile bağlı, ikisi de bir kopya alır.",
          "A direct exchange sends to **every** queue whose binding key equals the routing key. Both queues are bound with `error`, so each gets a copy.",
        ),
      },
      title: l("Bir key, birden fazla kuyruk", "One key, several queues"),
      body: [
        l(
          "`error` mesajı iki kuyruğa birden gitti: hem `errors`'a hem `all-logs`'a. Her kuyruk mesajın kendi kopyasını aldı.",
          "The `error` message went to both queues: `errors` and `all-logs`. Each queue got its own copy.",
        ),
        l(
          "Direct, \"tek kuyruğa\" demek değil, \"key **tam olarak** eşleşen kuyruklara\" demek. Kaç kuyruk eşleşirse o kadar kopya.",
          "Direct does not mean \"one queue\"; it means \"the queues whose key matches **exactly**\". As many matches, as many copies.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · error gönder", code: 'ch.basic_publish(exchange="logs", routing_key="error", body=b"disk full")' }],
        commands: [],
      },
    },
    {
      short: l("info", "info"),
      tag: "how",
      title: l("info sadece arşive", "info goes only to the archive"),
      body: [
        l(
          "`info` mesajı sadece `all-logs`'a gitti: `errors` kuyruğunun `info` binding'i yok. Alarm sistemi gereksiz mesajlarla uğraşmıyor.",
          "The `info` message went only to `all-logs`: `errors` has no `info` binding. The alert system is not bothered with noise.",
        ),
      ],
    },
    {
      short: l("debug", "debug"),
      tag: "how",
      predict: {
        question: l("Şimdi `debug` key'li bir mesaj gidecek. Hiçbir kuyruk `debug` ile bağlı değil. Ne olur?", "Now a `debug` message goes out. No queue is bound with `debug`. What happens?"),
        options: [l("Hata döner", "An error comes back"), l("Sessizce atılır", "It is silently dropped"), l("all-logs'a gider, en geniş kuyruk o", "It goes to all-logs, the widest queue")],
        answer: 1,
        why: l(
          "Direct exchange tahmin yürütmez: birebir eşleşme yoksa mesaj hiçbir yere gitmez ve producer'a haber verilmez.",
          "A direct exchange does not guess: with no exact match the message goes nowhere, and the producer is not told.",
        ),
      },
      title: l("Eşleşme yoksa mesaj kaybolur", "No match, no message"),
      body: [
        l(
          "`debug` mesajı hiçbir kuyruğa girmedi ve atıldı. Sağ üstte \"kayıp: 1\" yazıyor; producer ise hiçbir şey bilmiyor.",
          "The `debug` message entered no queue and was dropped. The top right says \"lost: 1\"; the producer knows nothing.",
        ),
        l(
          "Burada bu istediğimiz bir şey: debug log'larını saklamak istemiyoruz. Ama bir sipariş mesajı böyle kaybolursa bu bir hatadır. Bunu yakalamanın yolları headers ve alternate exchange dersinde.",
          "Here that is what we want: we do not keep debug logs. But if an order message vanished like this, it would be a bug. Ways to catch it come in the headers and alternate exchange lesson.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${CTL} list_queues name messages`, note: l("debug için hiçbir kuyrukta mesaj artmaz.", "No queue's count goes up for debug.") }],
      },
    },
    {
      short: l("Çok key", "Many keys"),
      tag: "how",
      title: l("Bir kuyruk, birden fazla key", "One queue, several keys"),
      body: [
        l(
          "Ekip `warning`'leri de görmek istedi: `errors` kuyruğuna ikinci bir binding ekledik, key'i `warning`. Şimdi gelen `warning` mesajı iki kuyruğa da gitti.",
          "The team wanted warnings too: we added a second binding to `errors`, with key `warning`. The next `warning` message went to both queues.",
        ),
        l(
          "Bir kuyruğun istediği kadar binding'i olabilir. Producer'da hiçbir şey değişmedi; kimin neyi alacağına binding'ler karar veriyor.",
          "A queue can have as many bindings as you like. Nothing changed in the producer; the bindings decide who gets what.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · ikinci binding", code: 'ch.queue_bind(queue="errors", exchange="logs", routing_key="warning")' }],
        commands: [],
      },
    },
    {
      short: l("İki kopya", "Two copies"),
      tag: "experiment",
      predict: {
        question: l(
          "Alarm `errors`'ı, Arşiv `all-logs`'u dinliyor. Yeni bir `error` gelince ikisi de onu alır mı?",
          "Alerts consumes `errors` and Archive consumes `all-logs`. When a new `error` arrives, do both get it?",
        ),
        options: [l("Hayır, ikisi sırayla alır", "No, they take turns"), l("Evet, her kuyruğun kendi kopyası var", "Yes, each queue has its own copy"), l("Sadece önce bağlanan alır", "Only the first one connected does")],
        answer: 1,
        why: l(
          "Sırayla almak, **aynı kuyruğu** dinleyen işçiler için geçerli. Burada iki ayrı kuyruk var ve her biri mesajın kendi kopyasını tutuyor.",
          "Taking turns applies to workers on **the same queue**. Here there are two separate queues, each holding its own copy.",
        ),
      },
      title: l("Farklı kuyruk, ayrı kopya", "Different queues, separate copies"),
      body: [
        l(
          "Alarm ve Arşiv bağlandı ve kuyruklarında bekleyenleri aldı. Sonra gelen `error`'ın bir kopyası Alarm'a, bir kopyası Arşiv'e gitti.",
          "Alerts and Archive connected and took what was waiting in their queues. The next `error` went once to Alerts and once to Archive.",
        ),
        l(
          "Kural şu: **farklı kuyruklar** aynı mesajın kopyalarını alır (yayın), **aynı kuyruğun işçileri** ise işi paylaşır. Bir servisin her olayı görmesini istiyorsan ona kendi kuyruğunu ver.",
          "The rule: **different queues** each get a copy (broadcast), while **workers on the same queue** share the work. If a service must see every event, give it its own queue.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${CTL} list_consumers queue_name consumer_tag` }],
      },
    },
    {
      short: l("Harf harf", "Letter for letter"),
      tag: "reality",
      title: l("Eşleşme harfi harfine", "The match is letter for letter"),
      body: [
        l(
          "Bir başka servis büyük harfle `ERROR` gönderdi. Hiçbir binding'e uymadı ve kayboldu: routing key'ler büyük-küçük harfe duyarlıdır ve direct exchange sadece birebir eşleşmeye bakar.",
          "Another service sent `ERROR` in capitals. It matched no binding and was lost: routing keys are case-sensitive, and a direct exchange looks only at exact matches.",
        ),
        l(
          "Key'leri bir yerde sabit olarak tanımla (örneğin bir `Severity` sınıfı) ve hem producer hem binding kodu oradan okusun. Desenle eşleşme (örneğin `order.*`) istiyorsan topic exchange kullan; iki ders sonra.",
          "Define your keys once as constants (say, a `Severity` class) and have both the producer and the binding code use them. For pattern matching (like `order.*`) use a topic exchange, two lessons on.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Routing key en fazla 255 bayt olabilir. Bu sahnede mesajlar her adımdan hemen sonra yönlendirilir ve kuyruklara kopyalanır; gerçekte de kuyruk başına bir kopya tutulur, ama diske yazma ve ağ gecikmesi işin içine girer.",
            "A routing key can be at most 255 bytes. Here messages are routed and copied right after each step; in reality one copy per queue is kept too, but disk writes and network delay come into play.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Bir `tasks` direct exchange'i ve iki kuyruk var: `images` ve `emails`. Hiç binding yok. Binding ekleyebilir ve `image`, `email`, `video` key'leriyle mesaj gönderebilirsin.",
          "There is a `tasks` direct exchange and two queues, `images` and `emails`, with no bindings. You can add bindings and send messages with keys `image`, `email` and `video`.",
        ),
        l("Sahnenin altında **3 görev** var.", "Under the scene there are **3 missions**."),
      ],
    },
  ],
  recap: [
    l("Direct exchange, binding key'i routing key ile **birebir** aynı olan kuyruklara gönderir.", "A direct exchange sends to queues whose binding key **exactly** equals the routing key."),
    l("Aynı key ile birden fazla kuyruk bağlanabilir; her biri mesajın kendi kopyasını alır.", "Several queues can share a key; each gets its own copy of the message."),
    l("Bir kuyruk birden fazla key ile bağlanabilir.", "One queue can be bound with several keys."),
    l("Hiçbir binding'e uymayan mesaj sessizce atılır; routing key'ler büyük-küçük harfe duyarlıdır.", "A message matching no binding is silently dropped; routing keys are case-sensitive."),
    l("Farklı kuyruklar kopya alır, aynı kuyruğun işçileri işi paylaşır.", "Different queues get copies; workers on one queue share the work."),
  ],
  quiz: [
    {
      question: l("`errors` ve `all-logs` ikisi de `error` ile bağlı. Bir `error` mesajı kaç kuyruğa gider?", "`errors` and `all-logs` are both bound with `error`. How many queues does one `error` message reach?"),
      options: [l("1", "1"), l("2", "2"), l("0", "0"), l("Rastgele biri", "One at random")],
      answer: 1,
      explain: l("Eşleşen her kuyruk bir kopya alır.", "Every matching queue gets a copy."),
      reviewStep: 1,
    },
    {
      question: l("Hiçbir kuyruk `debug` ile bağlı değil. `debug` mesajına ne olur?", "No queue is bound with `debug`. What happens to a `debug` message?"),
      options: [l("En yakın kuyruğa gider", "It goes to the nearest queue"), l("Sessizce atılır", "It is silently dropped"), l("Producer hata alır", "The producer gets an error"), l("Exchange'de bekler", "It waits in the exchange")],
      answer: 1,
      explain: l("Eşleşme yoksa direct exchange mesajı atar ve producer'a bildirmez.", "With no match a direct exchange drops the message without telling the producer."),
      reviewStep: 3,
    },
    {
      question: l("Bir binding `error` ile kuruldu, producer `Error` gönderiyor. Ne olur?", "A binding uses `error`; the producer sends `Error`. What happens?"),
      options: [l("Eşleşir", "It matches"), l("Eşleşmez, mesaj kaybolur", "It does not match, and the message is lost"), l("Broker key'i küçük harfe çevirir", "The broker lowercases the key"), l("Hata döner", "An error comes back")],
      answer: 1,
      explain: l("Routing key'ler büyük-küçük harfe duyarlıdır; direct sadece birebir eşleşmeye bakar.", "Routing keys are case-sensitive, and direct only accepts exact matches."),
      reviewStep: 6,
    },
    {
      question: l("İki servisin de **her** `error` mesajını görmesi gerekiyor. Ne yaparsın?", "Two services must both see **every** `error` message. What do you do?"),
      options: [
        l("İkisini aynı kuyruğa bağlarım", "Connect both to the same queue"),
        l("Her birine kendi kuyruğunu verip ikisini de `error` ile bağlarım", "Give each its own queue and bind both with `error`"),
        l("Prefetch'i artırırım", "Raise the prefetch"),
        l("Mesajı iki kez gönderirim", "Send the message twice"),
      ],
      answer: 1,
      explain: l("Aynı kuyruğun işçileri işi paylaşır; her servisin kendi kuyruğu olursa her biri kendi kopyasını alır.", "Workers on one queue share messages; separate queues each get their own copy."),
      reviewStep: 5,
    },
  ],
};
