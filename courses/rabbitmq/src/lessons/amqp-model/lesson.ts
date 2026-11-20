import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const CTL = "docker exec rabbitmq rabbitmqctl";

export const amqpModel: Lesson = {
  slug: "amqp-model",
  title: l("AMQP modeli", "The AMQP model"),
  summary: l(
    "Connection ve channel, exchange, binding, kuyruk ve routing key: RabbitMQ'nun parçaları nasıl birbirine bağlanır, declare neden iki kez çağrılabilir?",
    "Connections and channels, exchanges, bindings, queues and routing keys: how RabbitMQ's pieces fit, and why declare can be called twice.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Connection ile channel arasındaki farkı bilmek", "Know the difference between a connection and a channel"), step: 0 },
    { text: l("Mesajın exchange → binding → kuyruk yolunu izlemek", "Follow a message from exchange through binding to queue"), step: 2 },
    { text: l("Binding'i olmayan mesajın sessizce atıldığını görmek", "See a message with no matching binding silently dropped"), step: 3 },
    { text: l("Declare'in tekrar çağrılabildiğini ama çelişen ayarı reddettiğini görmek", "See that declare is repeatable but refuses conflicting settings"), step: 5 },
    { text: l("Virtual host, kullanıcı ve izinleri kendi broker'ında ayarlamak", "Set up a virtual host, a user and permissions on your own broker"), step: 6 },
  ],
  steps: [
    {
      short: l("Bağlantı", "Connection"),
      tag: "how",
      title: l("Bir bağlantı, içinde kanallar", "One connection, channels inside"),
      body: [
        l(
          "Uygulaman RabbitMQ'ya bir **connection** açar: 5672 portuna uzun ömürlü bir TCP bağlantısı. Bağlantı açmak pahalıdır (TCP, TLS, kimlik doğrulama), o yüzden uygulama genelde tek bağlantı açar ve onu açık tutar.",
          "Your app opens a **connection** to RabbitMQ: a long-lived TCP connection to port 5672. Opening one is expensive (TCP, TLS, login), so an app usually opens one and keeps it open.",
        ),
        l(
          "Bağlantının içinde hafif, sanal **channel**'lar açılır. Mesaj göndermek, kuyruk tanımlamak, dinlemek: hepsi bir channel üzerinden yapılır. Bir uygulamanın birkaç thread'i aynı bağlantıyı kendi channel'larıyla paylaşabilir.",
          "Inside the connection you open light, virtual **channels**. Publishing, declaring, consuming: all of it happens on a channel. Several threads of an app can share one connection, each with its own channel.",
        ),
        l(
          "Her bağlantı bir [[vhost|virtual host]]'a girer, varsayılanı `/`. Sağ üstte görüyorsun; altıncı adımda açacağız.",
          "Every connection goes into a [[vhost]], `/` by default. You see it at the top right; we open it up in step six.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu kursun sahnelerinde channel'lar ayrı çizilmez; her uygulamanın tek bağlantısı ve tek channel'ı varmış gibi davranırız. Gerçekte channel başına bir thread kullan; aynı channel'ı thread'ler arasında paylaşma.",
            "The scenes in this course do not draw channels; each app behaves as if it had one connection and one channel. In real code use one channel per thread, and never share a channel between threads.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: `${CTL} list_connections name user vhost`, note: l("Açık bağlantıları listeler.", "Lists open connections.") },
          { cmd: `${CTL} list_channels connection number`, note: l("Her bağlantının channel'larını listeler.", "Lists every connection's channels.") },
        ],
        snippets: [
          {
            label: "Python · connection ve channel",
            code: 'import pika\n\nparams = pika.ConnectionParameters(host="localhost", virtual_host="/")\nconn = pika.BlockingConnection(params)   # one TCP connection\nch = conn.channel()                      # a channel inside it',
          },
        ],
      },
    },
    {
      short: l("Parçalar", "The pieces"),
      tag: "how",
      title: l("Exchange, binding, kuyruk", "Exchange, binding, queue"),
      body: [
        l(
          "Uygulama bir [[exchange]] (`orders`), bir kuyruk (`billing`) ve aralarında bir [[binding]] tanımladı. Binding'in kuralı: \"[[routingKey|routing key]]'i `order.created` olan mesajlar `billing`'e\".",
          "The app declared an [[exchange]] (`orders`), a queue (`billing`) and a [[binding]] between them. The binding's rule: \"messages with [[routingKey]] `order.created` go to `billing`\".",
        ),
        l(
          "Producer mesajı **exchange'e** gönderir, asla doğrudan kuyruğa değil. Exchange binding'lere bakar ve mesajı uyan kuyruklara koyar. Consumer da **kuyruktan** okur. Bu üç parçanın ayrı olması, gönderen ile alanın birbirini tanımadan değişebilmesini sağlar.",
          "A producer sends to an **exchange**, never straight into a queue. The exchange checks its bindings and puts the message into matching queues. A consumer reads from a **queue**. Keeping the three apart lets senders and receivers change without knowing each other.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · tanımla ve bağla",
            code: 'ch.exchange_declare(exchange="orders", exchange_type="direct", durable=True)\nch.queue_declare(queue="billing", durable=True)\nch.queue_bind(queue="billing", exchange="orders", routing_key="order.created")',
          },
        ],
        commands: [
          { cmd: `${CTL} list_exchanges name type`, note: l("`amq.*` ile başlayanlar ve adı boş olan default exchange hazır gelir.", "The `amq.*` ones and the nameless default exchange come built in.") },
          { cmd: `${CTL} list_bindings source_name destination_name routing_key` },
        ],
      },
    },
    {
      short: l("Yönlendirme", "Routing"),
      tag: "how",
      predict: {
        question: l(
          "Uygulama `orders` exchange'ine routing key'i `order.created` olan bir mesaj gönderecek. Mesaj nereye gider?",
          "The app will send a message to the `orders` exchange with routing key `order.created`. Where does it go?",
        ),
        options: [l("Bütün kuyruklara", "To every queue"), l("Binding'i bu key'e uyan kuyruğa: billing", "To the queue whose binding matches the key: billing"), l("Exchange'de bekler", "It waits in the exchange")],
        answer: 1,
        why: l(
          "Exchange mesaj saklamaz; sadece binding'lere bakıp uyan kuyruklara dağıtır. Burada tek uyan `billing`.",
          "An exchange stores nothing; it only checks bindings and passes the message to the matching queues. Here only `billing` matches.",
        ),
      },
      title: l("Exchange kurallara bakar", "The exchange checks the rules"),
      body: [
        l(
          "Mesaj `orders`'a geldi, exchange binding'e baktı: key `order.created`, kural da `order.created`. Mesaj `billing` kuyruğuna kondu.",
          "The message reached `orders`; the exchange checked its binding: key `order.created`, rule `order.created`. The message went into `billing`.",
        ),
        l("Exchange'ler mesaj tutmaz; sadece yönlendirir. Mesajların beklediği yer her zaman kuyruktur.", "Exchanges hold nothing; they only route. Messages always wait in queues."),
      ],
      practice: {
        snippets: [{ label: "Python · gönder", code: 'ch.basic_publish(exchange="orders", routing_key="order.created", body=b"o1")' }],
        commands: [],
      },
    },
    {
      short: l("Kural yok", "No rule"),
      tag: "how",
      predict: {
        question: l(
          "Şimdi `order.cancelled` key'li bir mesaj gidecek. Bu key için hiçbir binding yok. Ne olur?",
          "Now a message with key `order.cancelled` goes out. No binding matches this key. What happens?",
        ),
        options: [l("Producer'a bir hata döner", "The producer gets an error"), l("Mesaj sessizce atılır", "The message is silently dropped"), l("Bir binding gelene kadar bekler", "It waits until a binding appears")],
        answer: 1,
        why: l(
          "Hiçbir kuyruğa uymayan mesaj varsayılan olarak atılır ve producer'a haber verilmez. Bunu önlemenin yolları (`mandatory`, alternate exchange) ileride.",
          "A message that matches no queue is dropped by default, and the producer is not told. The ways to prevent that (`mandatory`, alternate exchanges) come later.",
        ),
      },
      title: l("Uymayan mesaj sessizce atılır", "Unmatched messages are dropped silently"),
      body: [
        l(
          "`order.cancelled` için binding olmadığından mesaj hiçbir kuyruğa girmedi. RabbitMQ onu attı ve producer hiçbir şey fark etmedi. Sağ üstte \"kayıp: 1\" yazıyor.",
          "With no binding for `order.cancelled`, the message entered no queue. RabbitMQ dropped it, and the producer noticed nothing. The top right says \"lost: 1\".",
        ),
        l(
          "Gerçek projelerde en sık görülen hata budur: \"gönderiyorum ama gelmiyor\". İlk bakılacak yer binding'ler ve routing key'in harfi harfine aynı olup olmadığı.",
          "This is one of the most common bugs in real projects: \"I am sending but nothing arrives\". The first thing to check is the bindings, and whether the routing key matches letter for letter.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${CTL} list_bindings source_name destination_name routing_key`, note: l("\"Mesaj gelmiyor\" dediğinde ilk bakacağın komut.", "The first command to run when \"nothing arrives\".") }],
      },
    },
    {
      short: l("Tekrar declare", "Declare again"),
      tag: "how",
      predict: {
        question: l("Uygulama `billing` kuyruğunu aynı ayarlarla bir kez daha tanımlayacak. Ne olur?", "The app will declare the `billing` queue again with the same settings. What happens?"),
        options: [l("İkinci bir billing kuyruğu oluşur", "A second billing queue appears"), l("Hata verir, kuyruk zaten var", "It fails: the queue already exists"), l("Hiçbir şey: kuyruk aynen kalır", "Nothing: the queue stays as it is")],
        answer: 2,
        why: l(
          "Declare \"yoksa oluştur, varsa dokunma\" demektir (idempotent). İçindeki mesajlar da yerinde kalır.",
          "Declare means \"create it if missing, leave it alone otherwise\" (idempotent). The messages inside stay put.",
        ),
      },
      title: l("Declare tekrar tekrar çağrılabilir", "Declare can be called again and again"),
      body: [
        l(
          "Aynı kuyruğu aynı ayarlarla tekrar tanımlamak hiçbir şeyi değiştirmedi; içindeki mesaj da duruyor.",
          "Declaring the same queue with the same settings changed nothing; the message inside is still there.",
        ),
        l(
          "Bu yüzden iyi bir alışkanlık: hem producer hem consumer kullandığı exchange ve kuyrukları başlarken kendisi declare etsin. Hangisi önce başlarsa başlasın, yapı hazır olur.",
          "That makes a good habit: both producer and consumer declare the exchanges and queues they use when they start. Whichever starts first, everything is in place.",
        ),
      ],
    },
    {
      short: l("Çelişki", "Conflict"),
      tag: "experiment",
      predict: {
        question: l(
          "Bu sefer `billing`'i **durable olmadan** tanımlayacağız. Ama kuyruk zaten durable olarak var. Ne olur?",
          "This time we declare `billing` **without durable**, but the queue already exists as durable. What happens?",
        ),
        options: [l("Kuyruk yeni ayara geçer", "The queue switches to the new setting"), l("Broker reddeder ve channel kapanır", "The broker refuses and the channel closes"), l("Yeni ayar sessizce yok sayılır", "The new setting is silently ignored")],
        answer: 1,
        why: l(
          "Var olan bir kuyruğun ayarları declare ile değiştirilemez. Broker `PRECONDITION_FAILED` (406) döner ve o channel'ı kapatır; kuyruk eski ayarlarıyla kalır.",
          "You cannot change an existing queue's settings with declare. The broker replies `PRECONDITION_FAILED` (406) and closes that channel; the queue keeps its old settings.",
        ),
      },
      title: l("Çelişen ayarı broker reddeder", "The broker refuses conflicting settings"),
      body: [
        l(
          "Broker `PRECONDITION_FAILED` döndü ve declare'i reddetti. Kuyruk hâlâ durable; hiçbir şey kaybolmadı.",
          "The broker returned `PRECONDITION_FAILED` and refused the declare. The queue is still durable; nothing was lost.",
        ),
        l(
          "Bir kuyruğun ayarını değiştirmek istersen ya yeni bir adla yeni kuyruk açarsın ya da eskisini boşaltıp silip yeniden oluşturursun. Bazı ayarlar (TTL, max-length gibi) için **policy** kullanmak daha esnektir.",
          "To change a queue's settings you either make a new queue with a new name, or drain, delete and recreate the old one. For some settings (like TTL or max length) a **policy** is more flexible.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${CTL} list_queues name durable arguments`, note: l("Bir kuyruğun hangi ayarlarla tanımlandığını gösterir.", "Shows the settings a queue was declared with.") }],
      },
    },
    {
      short: l("vhost", "vhost"),
      tag: "reality",
      title: l("Virtual host, kullanıcı, izinler", "Virtual hosts, users, permissions"),
      body: [
        l(
          "Bir RabbitMQ'yu birkaç proje paylaşabilir. Her biri kendi [[vhost|virtual host]]'unda yaşar: kendi exchange'leri, kuyrukları ve izinleri olan ayrı bir oda. Farklı vhost'lardaki aynı adlı kuyruklar birbirinden habersizdir.",
          "Several projects can share one RabbitMQ. Each lives in its own [[vhost]]: a separate room with its own exchanges, queues and permissions. Queues with the same name in different vhosts know nothing of each other.",
        ),
        l(
          "Kullanıcılara vhost başına üç izin verilir: **configure** (tanımla, sil), **write** (gönder) ve **read** (oku). Her birine bir isim deseni (regex) yazılır.",
          "Users get three permissions per vhost: **configure** (declare, delete), **write** (publish) and **read** (consume). Each takes a name pattern (a regex).",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Varsayılan `guest` kullanıcısı sadece aynı makineden (localhost) bağlanabilir. Gerçek bir sunucuda kendi kullanıcını oluştur ve `guest`'i kullanma.",
            "The default `guest` user can only connect from the same machine (localhost). On a real server create your own user and do not use `guest`.",
          ),
        },
      ],
      practice: {
        intro: l("Kendi projen için ayrı bir vhost ve kullanıcı:", "A separate vhost and user for your own project:"),
        commands: [
          { cmd: `${CTL} add_vhost shop` },
          { cmd: `${CTL} add_user shop_app 'change-me'` },
          { cmd: `${CTL} set_permissions -p shop shop_app ".*" ".*" ".*"`, note: l("Sırasıyla configure, write, read izinleri. `.*` her isim demek.", "Configure, write and read, in that order. `.*` means any name.") },
          { cmd: `${CTL} list_permissions -p shop` },
        ],
        snippets: [
          {
            label: "Python · vhost'a bağlan",
            code: 'creds = pika.PlainCredentials("shop_app", "change-me")\nparams = pika.ConnectionParameters(host="localhost", virtual_host="shop", credentials=creds)\nconn = pika.BlockingConnection(params)',
          },
        ],
      },
    },
    {
      short: l("Oku", "Consume"),
      tag: "how",
      title: l("Consumer kuyruktan okur", "A consumer reads from a queue"),
      body: [
        l(
          "Fatura servisi `billing` kuyruğunu dinlemeye başladı, bekleyen mesajı aldı ve ack gönderdi.",
          "The billing service started consuming `billing`, got the waiting message and acked it.",
        ),
        l(
          "Consumer exchange'i ya da routing key'i bilmek zorunda değil; sadece kuyruğun adını bilir. Yeni bir servis aynı olayları almak istiyorsa kendi kuyruğunu açıp exchange'e bağlar. Producer'da hiçbir şey değişmez.",
          "A consumer does not need to know the exchange or the routing key, only the queue's name. A new service that wants the same events declares its own queue and binds it to the exchange. Nothing changes in the producer.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${CTL} list_consumers queue_name channel_pid ack_required prefetch_count` }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bir mağaza projesi var: `setup.py` bir `shop` exchange'i (direct) ile `billing` ve `shipping` kuyruklarını tanımlar, diğer dosyalar mesaj gönderir. Aşağıda gerçek işten **4 senaryo** var.",
          "Your turn. There's a shop project: `setup.py` declares a `shop` exchange (direct) and the `billing` and `shipping` queues, and the other files send messages. Below are **4 scenarios** from real work.",
        ),
        l(
          "`rabbitmqctl list_bindings source_name destination_name routing_key` ile neyin neye bağlı olduğuna bak, `nano` ile kodu düzelt, `python` ile çalıştır. Hata çıkarsa oku: RabbitMQ neyi neden reddettiğini söyler.",
          "Use `rabbitmqctl list_bindings source_name destination_name routing_key` to see what is bound to what, fix the code with `nano`, run it with `python`. If you get an error, read it: RabbitMQ says what it refused and why.",
        ),
      ],
    },
  ],
  recap: [
    l("Uygulama tek bir **connection** açıp onu açık tutar; işler içindeki hafif **channel**'lar üzerinden yapılır.", "An app opens one **connection** and keeps it; the work happens on light **channels** inside it."),
    l("Producer [[exchange]]'e gönderir, exchange [[binding]]'lere göre kuyruklara dağıtır, consumer kuyruktan okur.", "Producers send to an [[exchange]], which uses [[binding|bindings]] to fill queues; consumers read from queues."),
    l("Hiçbir binding'e uymayan mesaj varsayılan olarak sessizce atılır.", "A message that matches no binding is silently dropped by default."),
    l("Declare idempotent'tir: aynı ayarlarla tekrar çağırmak zararsızdır; çelişen ayar `PRECONDITION_FAILED` ile reddedilir.", "Declare is idempotent: repeating it with the same settings is harmless; conflicting settings fail with `PRECONDITION_FAILED`."),
    l("[[vhost|Virtual host]]'lar projeleri ayırır; kullanıcılara vhost başına configure, write ve read izni verilir.", "[[vhost|Virtual hosts]] keep projects apart; users get configure, write and read permissions per vhost."),
  ],
  quiz: [
    {
      question: l("Çok thread'li bir uygulamada RabbitMQ'ya nasıl bağlanmak iyi bir alışkanlıktır?", "What is a good habit for connecting to RabbitMQ from a multi-threaded app?"),
      options: [
        l("Her mesaj için yeni bir bağlantı aç", "Open a new connection per message"),
        l("Tek bir bağlantı, her thread'e kendi channel'ı", "One connection, a channel per thread"),
        l("Tek bir channel'ı bütün thread'ler paylaşsın", "All threads share one channel"),
        l("Her thread için ayrı bir vhost", "A separate vhost per thread"),
      ],
      answer: 1,
      explain: l("Bağlantı pahalıdır, channel ucuzdur; channel'lar thread'ler arasında paylaşılmamalıdır.", "Connections are expensive, channels are cheap, and channels should not be shared between threads."),
      reviewStep: 0,
    },
    {
      question: l("Producer mesajı nereye gönderir?", "Where does a producer send a message?"),
      options: [l("Doğrudan kuyruğa", "Straight into a queue"), l("Bir exchange'e", "To an exchange"), l("Consumer'a", "To the consumer"), l("Binding'e", "To a binding")],
      answer: 1,
      explain: l("Her zaman bir exchange'e; default exchange kullanılsa bile. Kuyruğa koymak exchange'in işi.", "Always to an exchange, even the default one. Putting it into a queue is the exchange's job."),
      reviewStep: 1,
    },
    {
      question: l("Mesajlarının bir kuyruğa hiç ulaşmadığını fark ettin, producer hata almıyor. İlk neye bakarsın?", "Your messages never reach a queue, and the producer gets no error. What do you check first?"),
      options: [l("Diskin dolu olup olmadığına", "Whether the disk is full"), l("Binding'lere ve routing key'in harfi harfine eşleşmesine", "The bindings, and whether the routing key matches exactly"), l("Consumer'ın prefetch'ine", "The consumer's prefetch"), l("Bağlantı sayısına", "The number of connections")],
      answer: 1,
      explain: l("Uymayan mesaj sessizce atılır; en sık sebep eksik bir binding ya da yanlış yazılmış bir key.", "Unmatched messages are dropped silently; the usual cause is a missing binding or a mistyped key."),
      reviewStep: 3,
    },
    {
      question: l("Var olan durable bir kuyruğu `durable=False` ile declare edersen ne olur?", "What happens if you declare an existing durable queue with `durable=False`?"),
      options: [l("Kuyruk geçici olur", "The queue becomes transient"), l("Yeni bir kuyruk açılır", "A new queue is created"), l("`PRECONDITION_FAILED` ile reddedilir", "It fails with `PRECONDITION_FAILED`"), l("Kuyruk silinir", "The queue is deleted")],
      answer: 2,
      explain: l("Declare var olan bir kuyruğun ayarlarını değiştiremez; çelişki reddedilir ve channel kapanır.", "Declare cannot change an existing queue's settings; the conflict is refused and the channel closes."),
      reviewStep: 5,
    },
  ],
};
