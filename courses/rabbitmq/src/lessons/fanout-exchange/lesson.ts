import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const fanoutExchange: Lesson = {
  slug: "fanout-exchange",
  title: l("Fanout exchange", "Fanout exchange"),
  summary: l(
    "Bir mesaj, bağlı her kuyruğa kopyalanır. Pub/sub'ın en basit hali: herkes duyar, routing key'e bakılmaz.",
    "One message is copied to every bound queue. The simplest pub/sub: everyone hears it, and the routing key is ignored.",
  ),
  minutes: 10,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Fanout'un her bağlı kuyruğa bir kopya verdiğini görmek", "See fanout give a copy to every bound queue"), step: 1 },
    { text: l("Routing key'in fanout'ta işe yaramadığını görmek", "See that the routing key does nothing in fanout"), step: 2 },
    { text: l("Sonradan bağlanan kuyruğun eski mesajları alamadığını görmek", "See that a queue bound later gets no old messages"), step: 4 },
    { text: l("Abone eklemenin ve çıkarmanın sadece binding olduğunu görmek", "See that adding and removing subscribers is just bindings"), step: 6 },
  ],
  steps: [
    {
      short: l("Fanout", "Fanout"),
      tag: "how",
      title: l("Sipariş olunca herkes duysun", "When an order comes in, everyone should hear"),
      body: [
        l(
          "Mağaza bir sipariş aldığında hem e-posta hem SMS servisi haberdar olmalı. Mağaza bu servisleri bilmek zorunda değil: mesajını `orders` adlı bir [[exchange]]'e gönderiyor.",
          "When the shop takes an order, both the email and the SMS service must hear about it. The shop does not need to know them: it sends to an [[exchange]] called `orders`.",
        ),
        l(
          "`orders` bir **fanout** exchange: kendisine bağlı ([[binding|bound]]) her kuyruğa mesajın bir kopyasını koyar. Şu an iki kuyruk bağlı: `email` ve `sms`.",
          "`orders` is a **fanout** exchange: it puts a copy of each message into every queue [[binding|bound]] to it. Two queues are bound now: `email` and `sms`.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_exchanges name type", note: l("Exchange'leri türleriyle listeler. `amq.fanout` gibi hazır olanları da görürsün.", "Lists exchanges with their types, including built-in ones such as `amq.fanout`.") }],
        snippets: [
          {
            label: "Node.js · fanout kur ve yayınla",
            code: 'await ch.assertExchange("orders", "fanout");\nfor (const q of ["email", "sms"]) {\n  await ch.assertQueue(q);\n  await ch.bindQueue(q, "orders", "");\n}\n// the routing key is ignored\nch.publish("orders", "", Buffer.from("o1"));',
          },
        ],
      },
    },
    {
      short: l("Kopyalar", "Copies"),
      tag: "how",
      predict: {
        question: l("Mağaza `orders`'a bir sipariş gönderecek. İki kuyruk bağlı. Kuyruklara toplam kaç mesaj düşer?", "The shop will send one order to `orders`. Two queues are bound. How many messages land in queues in total?"),
        options: [l("1: ilk bağlanan kuyruk alır", "1: the first bound queue gets it"), l("2: her kuyruğa bir kopya", "2: one copy per queue"), l("1: kuyruklar sırayla alır", "1: the queues take turns")],
        answer: 1,
        why: l(
          "Fanout her bağlı kuyruğa ayrı bir kopya koyar. Sırayla paylaşmak (competing consumers) bir kuyruğun **içindeki** işçiler arasında olur, kuyruklar arasında değil.",
          "Fanout puts a separate copy in every bound queue. Taking turns (competing consumers) happens between workers **inside** one queue, not between queues.",
        ),
      },
      title: l("Her kuyruğa bir kopya", "A copy for every queue"),
      body: [
        l(
          "Tek bir mesaj gönderildi, iki kuyrukta da birer kopyası var. E-posta servisi kendi kopyasını, SMS servisi kendi kopyasını işleyecek; biri diğerini beklemez.",
          "One message was sent, and each queue now has its own copy. The email service handles its copy and the SMS service handles its own; neither waits for the other.",
        ),
      ],
    },
    {
      short: l("Key yok sayılır", "Key ignored"),
      tag: "how",
      predict: {
        question: l("Bu sefer mesajın routing key'i `xyz`. Hangi kuyruklara gider?", "This time the routing key is `xyz`. Which queues get it?"),
        options: [l("Hiçbirine: `xyz` adlı binding yok", "None: there is no `xyz` binding"), l("İkisine de", "Both"), l("Sadece `email`'e", "Only `email`")],
        answer: 1,
        why: l("Fanout routing key'e hiç bakmaz. Bağlı olan her kuyruk, key ne olursa olsun kopyasını alır.", "Fanout never looks at the routing key. Every bound queue gets its copy, whatever the key."),
      },
      title: l("Routing key'e bakılmaz", "The routing key is ignored"),
      body: [
        l("`xyz` key'li mesaj da iki kuyruğa gitti. Fanout'ta kimin alacağına key değil, **binding'ler** karar verir.", "The `xyz` message reached both queues too. In fanout, **bindings** decide who gets a message, not the key."),
        l("Mesajları içeriklerine göre ayırmak istersen fanout yetmez; bunun için direct ve topic exchange var.", "To split messages by what they are about, fanout is not enough: that is what direct and topic exchanges are for."),
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_bindings source_name destination_name routing_key", note: l("Fanout binding'lerinin routing key'i boştur.", "Fanout bindings have an empty routing key.") }] },
    },
    {
      short: l("Aboneler", "Subscribers"),
      tag: "how",
      title: l("Her abonenin kendi kuyruğu", "Each subscriber has its own queue"),
      body: [
        l(
          "E-posta ve SMS servisleri kendi kuyruklarını dinlemeye başladı ve mesajları işleyip onayladı. Bu yapıya **publish/subscribe** (pub/sub) denir: bir yayıncı, birden çok abone.",
          "The email and SMS services started consuming their own queues and acked the messages. This shape is called **publish/subscribe** (pub/sub): one publisher, many subscribers.",
        ),
        l(
          "Kural basit: **her abone kendi kuyruğunu** alır. İki servis aynı kuyruğu dinleseydi işi paylaşırlardı ve her mesajı sadece biri görürdü.",
          "The rule is simple: **each subscriber gets its own queue**. If two services shared one queue they would split the work, and each message would reach only one of them.",
        ),
      ],
    },
    {
      short: l("Geç gelen", "Late joiner"),
      tag: "experiment",
      predict: {
        question: l(
          "Yeni bir `analytics` kuyruğu şimdi bağlanacak, sonra bir sipariş daha gelecek. `analytics`'e kaç mesaj düşer?",
          "A new `analytics` queue is bound now, then one more order arrives. How many messages land in `analytics`?",
        ),
        options: [l("3: geçmiş siparişler de gelir", "3: past orders come too"), l("1: sadece bağlandıktan sonraki", "1: only the one after it was bound"), l("0: geç kaldı", "0: it is too late")],
        answer: 1,
        why: l(
          "Exchange mesaj saklamaz; geldiği an o anki binding'lere dağıtır ve unutur. Bağlanmadan önceki mesajlar `analytics`'e hiç uğramadı.",
          "An exchange stores nothing: it hands each message to the bindings that exist at that moment and forgets it. Messages before the binding never passed by `analytics`.",
        ),
      },
      title: l("Sonradan gelen, geçmişi görmez", "A latecomer does not see the past"),
      body: [
        l("`analytics` kuyruğu bağlandı ve sadece `o3`'ü aldı. `o1` ve `o2` o kuyruğa hiç kopyalanmadı.", "`analytics` was bound and got only `o3`. `o1` and `o2` were never copied to it."),
        l(
          "Exchange bir posta ayırma makinesi gibi: mesajı o anda bağlı posta kutularına atar, kendinde tutmaz. Geçmişi yeniden okumak istiyorsan RabbitMQ Stream'leri ya da Kafka gerekir.",
          "An exchange is like a sorting machine: it drops the message into the mailboxes connected right now and keeps nothing. To replay the past you need RabbitMQ Streams or Kafka.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Uygulaman açılırken önce kuyruğunu tanımlayıp bağla, sonra yayıncıları başlat. Ters sırada ilk mesajlar hiçbir kuyruğa düşmez ve sessizce kaybolur.",
            "When your app starts, declare and bind its queue before publishers begin. In the other order the first messages match no queue and are silently lost.",
          ),
        },
      ],
    },
    {
      short: l("Geçici kuyruk", "Temporary queue"),
      tag: "how",
      title: l("Ekran gibi abonelere geçici kuyruk", "Temporary queues for screen-like subscribers"),
      body: [
        l(
          "Bir canlı panel sadece açıkken olanları görmek ister. Bunun için kendine **geçici** bir kuyruk açar, bağlar ve kapanınca kuyruk silinir. Panel açıkken gelen `o4`'ü aldı; kuyruk silinince arkasında hiçbir şey kalmadı.",
          "A live dashboard only cares about what happens while it is open. It opens a **temporary** queue, binds it, and the queue is deleted when it closes. It got `o4` while open; once deleted, nothing is left behind.",
        ),
        l(
          "Node.js'te `assertQueue(\"\", { exclusive: true })` adı sunucunun verdiği (`amq.gen-...`), sadece bu bağlantıya ait ve bağlantı kapanınca silinen bir kuyruk açar.",
          "In Node.js, `assertQueue(\"\", { exclusive: true })` opens a queue with a server-chosen name (`amq.gen-...`) that belongs to this connection only and is deleted when it closes.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede bu kuyruğu kendimiz sildik. Gerçekte exclusive kuyruk, bağlantı kapandığı an RabbitMQ tarafından kendiliğinden silinir.",
            "Here we deleted the queue ourselves. In reality RabbitMQ deletes an exclusive queue on its own the moment its connection closes.",
          ),
        },
      ],
    },
    {
      short: l("Aboneliği bitir", "Unsubscribe"),
      tag: "how",
      title: l("Abonelik = binding", "A subscription is a binding"),
      body: [
        l("`sms` kuyruğunun binding'i kaldırıldı. Sonraki sipariş `email` ve `analytics`'e gitti, `sms`'e gitmedi. Mağazanın kodu hiç değişmedi.", "The `sms` binding was removed. The next order went to `email` and `analytics`, not `sms`. The shop's code never changed."),
        l(
          "Fanout'un bedeli de burada: her mesaj, bağlı kuyruk sayısı kadar kopyalanır. 10 abone varsa her sipariş 10 kez saklanır. Herkesin gerçekten her şeyi duyması gerekmiyorsa direct ya da topic daha ucuzdur.",
          "Here is fanout's cost too: each message is copied once per bound queue. With 10 subscribers every order is stored 10 times. If not everyone needs everything, direct or topic is cheaper.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Fanout ne zaman doğru seçim?", "When is fanout the right choice?"),
      body: [
        l(
          "Fanout, \"bu olayı ilgilenen herkes duysun\" demek için en basit yol: önbellek temizleme, canlı panel güncellemesi, bir siparişin birden çok servise duyurulması.",
          "Fanout is the simplest way to say \"everyone interested should hear this\": cache invalidation, live dashboard updates, announcing an order to several services.",
        ),
        l(
          "Aboneler mesajların sadece bir kısmını istiyorsa her abone kendi kodunda eleme yapmak yerine topic exchange kullan: eleme broker'da yapılır ve gereksiz kopyalar hiç oluşmaz.",
          "If subscribers want only some messages, use a topic exchange instead of each one filtering in code: filtering happens in the broker and unneeded copies are never made.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ'da hazır bir `amq.fanout` exchange'i her zaman vardır. Yine de kendi adını verdiğin bir exchange tanımlamak, ne işe yaradığını okunur kılar.",
            "RabbitMQ always has a ready-made `amq.fanout` exchange. Declaring one with your own name still makes its purpose easier to read.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_queues name messages", note: l("Her abonenin kuyruğunda ne kadar mesaj biriktiğini gösterir.", "Shows how much is piling up in each subscriber's queue.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Mağazanın `orders` fanout exchange'ine `email` ve `sms` kuyrukları bağlı; `setup.js` kurar, `order.js` sipariş yayınlar. Aşağıda gerçek işten **4 senaryo** var: yeni abone, kapanan abone, kuyruğu paylaşan servis, yanlış anlaşılan routing key.",
          "Your turn. The shop's `orders` fanout exchange has the `email` and `sms` queues bound; `setup.js` builds it and `order.js` publishes an order. Below are **4 scenarios** from real work: a new subscriber, one that leaves, a service sharing a queue it shouldn't, a misunderstood routing key.",
        ),
        l(
          "`rabbitmqctl list_bindings source_name destination_name` aboneleri gösterir; `nano` ile kodu düzelt, `node` ile çalıştır. Az komutla bitirirsen 3 yıldız.",
          "`rabbitmqctl list_bindings source_name destination_name` shows the subscribers; fix the code with `nano`, run it with `node`. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Fanout exchange, gelen her mesajın bir kopyasını **bağlı her kuyruğa** koyar.", "A fanout exchange puts a copy of every message into **every bound queue**."),
    l("Routing key'e bakılmaz; kimin alacağını sadece binding'ler belirler.", "The routing key is ignored; only bindings decide who gets it."),
    l("Pub/sub için her abone kendi kuyruğunu alır; aynı kuyruğu paylaşanlar işi bölüşür.", "For pub/sub each subscriber gets its own queue; those sharing a queue split the work."),
    l("Exchange mesaj saklamaz: sonradan bağlanan kuyruk eski mesajları görmez.", "An exchange stores nothing: a queue bound later never sees old messages."),
    l("Her abone bir kopya demektir; herkes her şeyi istemiyorsa topic ya da direct daha ucuzdur.", "Every subscriber is another copy; if not everyone needs everything, topic or direct is cheaper."),
  ],
  quiz: [
    {
      question: l("Fanout exchange'e 4 kuyruk bağlı. 10 mesaj gönderilirse kuyruklarda toplam kaç mesaj olur?", "A fanout exchange has 4 bound queues. If 10 messages are sent, how many messages are in the queues in total?"),
      options: [l("10", "10"), l("40", "40"), l("4", "4"), l("14", "14")],
      answer: 1,
      explain: l("Her mesaj her kuyruğa kopyalanır: 10 × 4 = 40.", "Each message is copied to each queue: 10 × 4 = 40."),
      reviewStep: 1,
    },
    {
      question: l("İki servis aynı kuyruğu dinlerse ne olur?", "What happens if two services consume the same queue?"),
      options: [l("İkisi de her mesajı alır", "Both get every message"), l("Her mesajı sadece biri alır", "Each message goes to only one"), l("RabbitMQ hata verir", "RabbitMQ errors"), l("Mesajlar çoğalır", "Messages multiply")],
      answer: 1,
      explain: l("Aynı kuyruğun işçileri işi paylaşır. Herkes her şeyi duysun istiyorsan her servise ayrı kuyruk ver.", "Workers on one queue share the work. If everyone must hear everything, give each service its own queue."),
      reviewStep: 3,
    },
    {
      question: l("Yeni bir kuyruk fanout'a 14:00'te bağlandı. 13:00'te gönderilen mesajları alır mı?", "A new queue is bound to a fanout at 2 pm. Does it get messages sent at 1 pm?"),
      options: [l("Evet, hepsini", "Yes, all of them"), l("Hayır", "No"), l("Son 100 tanesini", "The last 100"), l("Sadece persistent olanları", "Only persistent ones")],
      answer: 1,
      explain: l("Exchange mesaj saklamaz; o an bağlı olmayan kuyruğa kopya gitmez.", "An exchange stores nothing; a queue that was not bound then got no copy."),
      reviewStep: 4,
    },
    {
      question: l("Fanout'a `order.created` key'iyle mesaj gönderdin. Sadece `order.created` ile bağlanmış kuyruğa mı gider?", "You publish to a fanout with key `order.created`. Does it go only to queues bound with `order.created`?"),
      options: [l("Evet", "Yes"), l("Hayır, bağlı her kuyruğa gider", "No, it goes to every bound queue"), l("Hiçbir kuyruğa gitmez", "It goes nowhere"), l("Sadece ilk kuyruğa", "Only the first queue")],
      answer: 1,
      explain: l("Fanout key'e bakmaz. Key'e göre seçmek istiyorsan direct ya da topic exchange kullan.", "Fanout ignores the key. To choose by key, use a direct or topic exchange."),
      reviewStep: 2,
    },
  ],
};
