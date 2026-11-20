import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const CONSUME = (offset: string) =>
  `ch.basic_qos(prefetch_count=100)\nch.basic_consume(\n    queue="events",\n    on_message_callback=handle,\n    arguments={"x-stream-offset": ${offset}},\n)`;

export const streams: Lesson = {
  slug: "streams",
  title: l("Stream'ler", "Streams"),
  summary: l(
    "Kuyruktan farklı olarak stream, okunan mesajı silmez. Her okuyucu kendi offset'inden okur; aynı mesajı birçok okuyucu görebilir, geçmiş yeniden oynatılabilir.",
    "Unlike a queue, a stream does not delete what has been read. Every reader reads from its own offset; many readers can see the same message, and history can be replayed.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Stream'de okunan mesajın silinmediğini görmek", "See that a stream keeps messages after they are read"), step: 2 },
    { text: l("Birden fazla okuyucunun aynı mesajları aldığını görmek", "See several readers get the same messages"), step: 3 },
    { text: l("`first`, `next` ve sayı ile offset seçmek", "Pick an offset with `first`, `next` or a number"), step: 5 },
    { text: l("Ne zaman kuyruk, ne zaman stream seçeceğini bilmek", "Know when to pick a queue and when a stream"), step: 7 },
  ],
  steps: [
    {
      short: l("Stream", "A stream"),
      tag: "how",
      title: l("Kuyruk değil, log", "Not a queue but a log"),
      body: [
        l(
          "Ortadaki `events` bir **stream**. Dışarıdan kuyruk gibi görünür, ama çalışma şekli farklı: mesajlar okunduktan sonra silinmez, sona eklenen bir **log**'da kalır.",
          "`events` in the middle is a **stream**. From the outside it looks like a queue, but it works differently: messages are not deleted after reading; they stay in a **log** that only grows at the end.",
        ),
        l(
          "Alttaki panel log'un kendisi. Her mesajın bir sıra numarası var, buna **offset** denir. Stream'ler RabbitMQ 3.9 ile geldi ve RabbitMQ 4'te de bir kuyruk türü olarak tanımlanıyor.",
          "The panel at the bottom is the log itself. Every message has a position number, called its **offset**. Streams arrived in RabbitMQ 3.9, and in RabbitMQ 4 they are still declared as a queue type.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Python · stream tanımla",
            code: 'ch.queue_declare(\n    queue="events",\n    durable=True,\n    arguments={"x-queue-type": "stream"},\n)',
            note: l("Stream'ler her zaman durable'dır ve quorum kuyrukları gibi cluster'da kopyalanır.", "Streams are always durable and, like quorum queues, replicated across the cluster."),
          },
        ],
      },
    },
    {
      short: l("Yaz", "Write"),
      tag: "how",
      title: l("Yazmak: sona ekle", "Writing: append to the end"),
      body: [
        l(
          "Uygulama üç event gönderdi. Log'a 0, 1 ve 2 numaralı offset'lerle eklendiler. Kesikli kutu, bir sonraki event'in konacağı yer: offset 3.",
          "The app sent three events. They were added to the log at offsets 0, 1 and 2. The dashed box is where the next event goes: offset 3.",
        ),
        l(
          "Henüz okuyan yok, ama bu sorun değil: stream mesajları okuyan olsa da olmasa da saklar.",
          "Nobody is reading yet, and that is fine: a stream keeps messages whether anyone reads them or not.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: "Python · gönder", code: 'ch.basic_publish(exchange="", routing_key="events", body=b"e1")', note: l("Göndermek bir kuyruğa göndermekle aynı.", "Sending is the same as sending to a queue.") }],
      },
    },
    {
      short: l("Oku", "Read"),
      tag: "how",
      predict: {
        question: l("Analitik servisi üç event'i baştan okuyup ack'leyecek. Sonra log'da kaç mesaj kalır?", "Analytics will read all three events from the start and ack them. How many messages are left in the log?"),
        options: [l("0, okunanlar silinir", "0, what was read is deleted"), l("3, hepsi yerinde", "3, all still there"), l("1, sadece sonuncusu", "1, only the last")],
        answer: 1,
        why: l(
          "Stream'de ack mesajı silmez. Ack sadece \"bunları aldım, bana devamını gönder\" demek. Mesajlar log'da kalır.",
          "In a stream an ack does not delete anything. It only says \"got these, send me more\". The messages stay in the log.",
        ),
      },
      title: l("Okumak silmez", "Reading does not delete"),
      body: [
        l(
          "Analitik servisi `first` offset'iyle, yani en baştan bağlandı, üç event'i aldı ve ack'ledi. Log'a bak: üçü de yerinde duruyor.",
          "Analytics connected at offset `first`, the very beginning, got all three events and acked them. Look at the log: all three are still there.",
        ),
        l(
          "Analitik'in işareti artık offset 3'te: sıradaki okuyacağı yer. Bir kuyrukta mesaj alındığında giderdi; burada sadece okuyucunun yeri ilerledi.",
          "Analytics' marker now sits at offset 3, the next one it will read. In a queue the messages would be gone once taken; here only the reader's place moved.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Stream okuyucuları manual ack ve bir prefetch (`basic_qos`) kullanmak zorunda. Prefetch, okuyucuya bir seferde kaç mesaj gönderileceğini sınırlar; ack de yeni mesajlar için yer açar.",
            "Stream readers must use manual acks and a prefetch (`basic_qos`). The prefetch caps how many messages are sent at a time, and acks make room for more.",
          ),
        },
      ],
      practice: { commands: [], snippets: [{ label: "Python · baştan oku", code: CONSUME('"first"') }] },
    },
    {
      short: l("İkinci okuyucu", "Second reader"),
      tag: "how",
      predict: {
        question: l("Fatura servisi de `first` ile bağlanacak. Ne alır?", "Billing will connect with `first` too. What does it get?"),
        options: [
          l("Hiçbir şey: Analitik zaten okudu", "Nothing: Analytics already read them"),
          l("Aynı üç event'in hepsini", "All of the same three events"),
          l("Sadece bundan sonra gelenleri", "Only what arrives from now on"),
        ],
        answer: 1,
        why: l(
          "Her okuyucunun kendi offset'i var ve birbirini etkilemez. Analitik'in okuması log'dan bir şey almadı; Fatura da aynı mesajları baştan okur.",
          "Every reader has its own offset, and they do not affect each other. Analytics took nothing from the log, so Billing reads the same messages from the start.",
        ),
      },
      title: l("Herkes aynı mesajları okur", "Everyone reads the same messages"),
      body: [
        l(
          "Fatura servisi `first` ile bağlandı ve aynı üç event'i aldı. İki okuyucu aynı log'u birbirinden bağımsız okuyor.",
          "Billing connected with `first` and got the same three events. Two readers read one log independently.",
        ),
        l(
          "Bir kuyrukta bu imkânsızdı: aynı kuyruğun okuyucuları mesajları **paylaşır**, her mesaj birine gider. Aynı mesajı birçok servise vermek için her biri için ayrı kuyruk gerekirdi. Stream'de tek bir log yeter.",
          "With a queue this is impossible: readers of one queue **share** messages, each going to one of them. Giving the same message to many services needed one queue each. With a stream, one log is enough.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "Python · ikinci okuyucu", code: CONSUME('"first"'), note: l("Aynı kodu başka bir serviste çalıştırmak yeterli.", "Running the same code in another service is enough.") }] },
    },
    {
      short: l("next", "next"),
      tag: "how",
      predict: {
        question: l("Denetim servisi `next` ile bağlanacak, sonra yeni bir event gelecek. Denetim ne alır?", "Audit will connect with `next`, then a new event arrives. What does Audit get?"),
        options: [l("Dört event'in hepsini", "All four events"), l("Sadece yeni gelen `e4`'ü", "Only the new `e4`"), l("Sadece en son eski event'i", "Only the latest old event")],
        answer: 1,
        why: l(
          "`next`, \"benden sonra gelenlerden başla\" demek. Eski üç event'i atlar ve sadece bağlandıktan sonra yazılanları okur. Belirtmezsen varsayılan da budur.",
          "`next` means \"start with what comes after I join\". It skips the three old events and reads only what is written after it connects. It is also the default when you set nothing.",
        ),
      },
      title: l("Sadece yenileri okumak", "Reading only new messages"),
      body: [
        l(
          "Analitik işini bitirip ayrıldı. Denetim servisi `next` ile bağlandı. İlk başta hiçbir şey almadı; işareti log'un sonunda bekliyordu. Sonra `e4` geldi ve onu aldı.",
          "Analytics finished and left. Audit connected with `next`. At first it got nothing: its marker waited at the end of the log. Then `e4` arrived and it got that.",
        ),
        l(
          "Aynı `e4` Fatura'ya da gitti, çünkü Fatura hâlâ bağlı ve sıradaki offset'i 3'tü. Stream'e yazılan her mesaj, bağlı olan her okuyucuya ulaşır.",
          "The same `e4` went to Billing as well: Billing is still connected and its next offset was 3. Every message written to a stream reaches every connected reader.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "Python · sadece yeniler", code: CONSUME('"next"') }] },
    },
    {
      short: l("Geri sar", "Rewind"),
      tag: "how",
      predict: {
        question: l("Yeni bir okuyucu offset `1` ile bağlanacak. Ne alır?", "A new reader will connect at offset `1`. What does it get?"),
        options: [l("`e1`'den başlayarak hepsini", "Everything from `e1` on"), l("`e2`, `e3` ve `e4`'ü", "`e2`, `e3` and `e4`"), l("Sadece `e2`'yi", "Only `e2`")],
        answer: 1,
        why: l("Offset 1, ikinci event (`e2`). Okuyucu oradan başlar ve log'un sonuna kadar her şeyi alır.", "Offset 1 is the second event (`e2`). The reader starts there and gets everything up to the end of the log."),
      },
      title: l("İstediğin yerden yeniden oynat", "Replay from wherever you like"),
      body: [
        l(
          "Denetim ayrıldı ve \"Yeniden oynat\" okuyucusu offset 1 ile bağlandı: `e2`, `e3`, `e4`'ü aldı. Hata ayıklarken, yeni bir servisi geçmiş veriyle doldururken ya da bir hatayı düzeltip yeniden hesaplarken tam olarak bu gerekir.",
          "Audit left, and the \"Replay\" reader connected at offset 1: it got `e2`, `e3` and `e4`. That is exactly what you need when debugging, filling a new service with past data, or recomputing after fixing a bug.",
        ),
        l(
          "Offset bir sayı olabileceği gibi `first`, `last`, `next`, bir zaman damgası ya da `\"1h\"` gibi bir süre de olabilir: \"son bir saatten başla\".",
          "An offset can be a number, `first`, `last`, `next`, a timestamp, or an interval such as `\"1h\"`: \"start from the last hour\".",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "Python · offset'ten oku", code: CONSUME("1") }] },
    },
    {
      short: l("Retention", "Retention"),
      tag: "reality",
      title: l("Sonsuza kadar saklanmaz: retention", "Not kept forever: retention"),
      body: [
        l(
          "Stream'ler sonsuza kadar büyümez. Ne kadar tutulacağını sen belirlersin: `x-max-age` ile süre (örneğin 7 gün), `x-max-length-bytes` ile toplam boyut. Sınır aşılınca en eski mesajlar silinir.",
          "Streams do not grow forever. You decide how much to keep: a time with `x-max-age` (say 7 days), a total size with `x-max-length-bytes`. Past the limit, the oldest messages are removed.",
        ),
        l(
          "Silme mesaj mesaj değil, **segment** denen dosya parçaları halinde yapılır. Bu yüzden sınır birebir değil, yaklaşık uygulanır.",
          "Removal happens not message by message but in file chunks called **segments**, so the limit is applied approximately, not exactly.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnedeki stream'de retention yok: mesajlar hiç silinmiyor. Gerçek bir stream'de retention'ı mutlaka ayarla, yoksa disk dolana kadar büyür.",
            "The stream on stage has no retention: nothing is ever deleted. On a real stream always set retention, or it grows until the disk is full.",
          ),
        },
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Python · retention ile",
            code: 'ch.queue_declare(\n    queue="events",\n    durable=True,\n    arguments={\n        "x-queue-type": "stream",\n        "x-max-age": "7D",\n        "x-max-length-bytes": 20_000_000_000,\n    },\n)',
            note: l("`x-max-age` birimleri: `Y`, `M`, `D`, `h`, `m`, `s`.", "`x-max-age` units: `Y`, `M`, `D`, `h`, `m`, `s`."),
          },
        ],
      },
    },
    {
      short: l("Kafka'ya benzer", "Like Kafka"),
      tag: "reality",
      title: l("Stream mi, kuyruk mu? Ve Kafka", "Stream or queue? And Kafka"),
      body: [
        l(
          "**Kuyruk** seç: her mesajın tek bir işçi tarafından bir kez işlenmesini, bitince silinmesini istiyorsan (görevler, iş dağıtımı). **Stream** seç: aynı mesajı birçok servis okuyacaksa, geçmişi yeniden oynatman gerekecekse ya da çok büyük hacimler varsa.",
          "Pick a **queue** when each message should be handled once by one worker and then deleted (jobs, work distribution). Pick a **stream** when many services read the same message, when you need to replay history, or when volumes are very large.",
        ),
        l(
          "Bu tanıdık geldiyse haklısın: stream'ler Kafka'nın topic'lerine çok benzer. İkisinde de log sona eklenir, okuyucular offset tutar ve retention eskileri siler. Bir fark: RabbitMQ'da stream ile kuyruk aynı broker'da yan yana yaşar ve aynı exchange'lerden beslenebilir.",
          "If this feels familiar, it should: streams are very much like Kafka topics. In both, the log is appended to, readers keep offsets, and retention removes old data. One difference: in RabbitMQ streams and queues live side by side in one broker and can be fed from the same exchanges.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada stream'e AMQP 0-9-1 ile, normal kuyruklar gibi bağlandık. Çok yüksek hız için RabbitMQ'nun ayrı bir **stream protokolü** var (port 5552, `rabbitmq_stream` eklentisi). Bir stream'i Kafka partition'ları gibi parçalara bölmek için de **super stream**'ler kullanılır.",
            "Here we used streams over AMQP 0-9-1, like ordinary queues. For very high throughput RabbitMQ has a separate **stream protocol** (port 5552, the `rabbitmq_stream` plugin). To split one stream into parts like Kafka partitions, there are **super streams**.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker exec rabbitmq rabbitmq-plugins enable rabbitmq_stream", note: l("Stream protokolünü açar. Container'ı `-p 5552:5552` ile başlatman gerekir.", "Turns on the stream protocol. Start the container with `-p 5552:5552`.") },
          { cmd: "pip install rstream", note: l("Stream protokolü için Python istemcisi.", "A Python client for the stream protocol.") },
          { cmd: "docker exec rabbitmq rabbitmq-streams add_super_stream invoices --partitions 3", note: l("Üç parçalı bir super stream oluşturur.", "Creates a super stream with three partitions.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda içinde üç event olan bir `events` stream'i ve gerçek işten **4 senaryo** var: geçmişi okumayan bir servis, stream'e çevrilmiş bir classic okuyucu, hatalı hesabı yeniden yapmak ve belli bir yerden okumaya başlamak.",
          "Your turn. Below is an `events` stream with three events in it and **4 scenarios** from real work: a service that doesn't read the past, a classic reader pointed at a stream, redoing a buggy computation, and starting to read from a given point.",
        ),
        l(
          "Okuyucular Python dosyaları: `nano` ile düzelt, `python` ile başlat (arka planda çalışırlar), `pkill -f` ile durdur. Alttaki panel her okuyucunun stream'de nerede olduğunu gösterir.",
          "Readers are Python files: fix them with `nano`, start them with `python` (they keep running in the background), stop them with `pkill -f`. The panel below shows where each reader is in the stream.",
        ),
      ],
    },
  ],
  recap: [
    l("Stream, okunan mesajları silmeyen, sona eklenen bir log'dur; her mesajın bir offset'i vardır.", "A stream is an append-only log that keeps messages after reading; every message has an offset."),
    l("Her okuyucu kendi offset'inden okur; okuyucular birbirinin mesajını almaz, hepsi aynı mesajları görebilir.", "Every reader reads from its own offset; readers take nothing from each other and can all see the same messages."),
    l("Offset `first`, `last`, `next` (varsayılan), bir sayı, zaman damgası ya da süre olabilir; böylece geçmiş yeniden oynatılabilir.", "An offset can be `first`, `last`, `next` (the default), a number, a timestamp or an interval, so history can be replayed."),
    l("Stream okuyucuları manual ack ve prefetch kullanır; ack bir şey silmez, sadece yeni mesajlara yer açar.", "Stream readers use manual acks and a prefetch; an ack deletes nothing, it only makes room for more."),
    l("Retention (`x-max-age`, `x-max-length-bytes`) eski mesajları segment segment siler; mutlaka ayarlanmalı.", "Retention (`x-max-age`, `x-max-length-bytes`) removes old messages segment by segment; always set it."),
  ],
  quiz: [
    {
      question: l("Bir stream'i üç servis `first` ile okuyor. Stream'de 10 mesaj var. Toplam kaç teslim olur?", "Three services read a stream with `first`. It holds 10 messages. How many deliveries in total?"),
      options: [l("10", "10"), l("30", "30"), l("3", "3"), l("Belirsiz, sırayla paylaşırlar", "It varies, they take turns")],
      answer: 1,
      explain: l("Her okuyucu log'un tamamını kendi offset'inden okur: 3 × 10 = 30. Kuyrukta olsaydı 10 mesaj üçe paylaştırılırdı.", "Each reader reads the whole log from its own offset: 3 × 10 = 30. With a queue, the 10 messages would be shared among the three."),
      reviewStep: 3,
    },
    {
      question: l("Stream'de bir mesajı ack'lemek ne yapar?", "What does acking a message on a stream do?"),
      options: [
        l("Mesajı siler", "Deletes the message"),
        l("Okuyucuya yeni mesajlar için yer açar; hiçbir şey silinmez", "Makes room for more messages; nothing is deleted"),
        l("Mesajı diğer okuyuculardan gizler", "Hides it from other readers"),
        l("Offset'i başa sarar", "Rewinds the offset"),
      ],
      answer: 1,
      explain: l("Stream'de silme sadece retention ile olur. Ack, prefetch sınırı içinde yeni mesajların gönderilmesini sağlar.", "On a stream only retention deletes. An ack lets new messages be sent within the prefetch limit."),
      reviewStep: 2,
    },
    {
      question: l("Hiç `x-stream-offset` vermeden bağlanan bir stream okuyucusu ne okur?", "What does a stream reader read when it connects without any `x-stream-offset`?"),
      options: [l("En baştan her şeyi", "Everything from the start"), l("Sadece bağlandıktan sonra gelenleri", "Only what arrives after it connects"), l("Son mesajı", "The last message"), l("Hiçbir şeyi", "Nothing")],
      answer: 1,
      explain: l("Varsayılan offset `next`: okuyucu log'un sonundan başlar ve sadece yeni mesajları alır.", "The default offset is `next`: the reader starts at the end of the log and gets only new messages."),
      reviewStep: 4,
    },
    {
      question: l("Hangi iş için stream, kuyruktan daha uygundur?", "Which job suits a stream better than a queue?"),
      options: [
        l("Her e-postanın tam bir kez gönderilmesi gereken bir iş kuyruğu", "A job queue where each email is sent exactly once"),
        l("Aynı sipariş olaylarını beş farklı servisin okuması ve yeni bir servisin geçmişten başlayabilmesi", "Five services reading the same order events, and a new one starting from the past"),
        l("Bir RPC cevabının tek bir istemciye dönmesi", "Returning one RPC reply to one client"),
        l("Geçici bir önbellek bildirimi", "A short-lived cache notice"),
      ],
      answer: 1,
      explain: l("Birçok okuyucunun aynı mesajları okuması ve geçmişin yeniden oynatılması tam stream'lerin işi.", "Many readers on the same messages, plus replaying history, is exactly what streams are for."),
      reviewStep: 7,
    },
  ],
};
