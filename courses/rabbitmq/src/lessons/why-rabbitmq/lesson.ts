import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const LIST = "docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers";

export const whyRabbitmq: Lesson = {
  slug: "why-rabbitmq",
  title: l("Neden mesaj kuyruğu?", "Why a message queue?"),
  summary: l(
    "Servisler birbirini doğrudan çağırınca biri yavaşlayınca ya da çökünce diğeri de takılır. Araya bir kuyruk koyunca ne değiştiğini gör.",
    "When services call each other directly, one slow or crashed service drags the other down. See what changes with a queue in between.",
  ),
  minutes: 10,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Doğrudan çağrının neden kırılgan olduğunu görmek", "See why a direct call is fragile"), step: 1 },
    { text: l("Kuyruğun, alan kapalıyken mesajları beklettiğini görmek", "See a queue hold messages while the receiver is down"), step: 2 },
    { text: l("Ani yükün kuyrukta biriktiğini ve sırayla eridiğini görmek", "See a spike pile up in the queue and drain in order"), step: 4 },
    { text: l("İşçi ekleyerek işi paylaştırmak", "Share the work by adding workers"), step: 5 },
    { text: l("RabbitMQ'nun ne zaman, Kafka'nın ne zaman uygun olduğunu bilmek", "Know when RabbitMQ fits and when Kafka does"), step: 6 },
  ],
  steps: [
    {
      short: l("Doğrudan", "Direct"),
      tag: "problem",
      title: l("Sipariş servisi e-posta servisini çağırıyor", "The order service calls the email service"),
      body: [
        l(
          "Bir sipariş gelince sipariş servisi, \"siparişin alındı\" e-postası için e-posta servisini doğrudan çağırıyor (örneğin bir HTTP isteğiyle) ve cevabı bekliyor.",
          "When an order arrives, the order service calls the email service directly (say, with an HTTP request) to send \"we got your order\", and waits for the answer.",
        ),
        l(
          "Her şey yolundayken bu basit ve hızlı. Ama iki servis artık birbirine bağlı: sipariş servisi, e-posta servisinin o anda ayakta ve hızlı olmasına muhtaç.",
          "When all is well this is simple and fast. But the two services are now tied together: the order service depends on the email service being up and fast right now.",
        ),
      ],
    },
    {
      short: l("Çöktü", "Down"),
      tag: "problem",
      title: l("E-posta servisi çökünce", "When the email service goes down"),
      body: [
        l(
          "E-posta servisi çöktü. Sipariş servisinin çağrısına cevap gelmiyor: ya bekleyecek, ya tekrar deneyecek, ya da e-postadan vazgeçecek. Kendisi de yeniden başlarsa o e-posta sessizce kaybolur.",
          "The email service is down. The order service's call gets no answer: it can wait, retry, or give up on the email. If it restarts too, that email is silently lost.",
        ),
        l(
          "Yük artınca da benzer bir şey olur: e-posta servisi yavaşsa, onu bekleyen sipariş servisi de yavaşlar. Zincirin en yavaş halkası bütün zincirin hızını belirler.",
          "Load does the same: if the email service is slow, the order service waiting on it slows down too. The slowest link sets the speed of the whole chain.",
        ),
      ],
    },
    {
      short: l("Kuyruk", "A queue"),
      tag: "idea",
      predict: {
        question: l(
          "Araya bir `emails` kuyruğu koyuyoruz. Sipariş servisi e-postayı kuyruğa bırakıp devam edecek. E-posta servisi hâlâ kapalıyken 3 sipariş gelirse ne olur?",
          "We put an `emails` queue in between. The order service drops the email into the queue and moves on. What happens if 3 orders arrive while the email service is still down?",
        ),
        options: [
          l("Üç e-posta kaybolur", "All three emails are lost"),
          l("E-postalar kuyrukta bekler, sipariş servisi takılmaz", "The emails wait in the queue; the order service is not held up"),
          l("Sipariş servisi e-posta servisi gelene kadar bekler", "The order service waits for the email service to return"),
        ],
        answer: 1,
        why: l(
          "Kuyruk, gönderenle alanı zamanda ayırır: biri yazar ve işine devam eder, öbürü hazır olunca okur. Mesajlar arada güvenle bekler.",
          "A queue separates sender and receiver in time: one writes and moves on, the other reads when ready. Messages wait safely in between.",
        ),
      },
      title: l("Araya bir kuyruk koy", "Put a queue in between"),
      body: [
        l(
          "Artık sipariş servisi e-posta servisini çağırmıyor. Sadece \"bu siparişin e-postası gönderilsin\" diye bir mesajı RabbitMQ'daki `emails` kuyruğuna bırakıyor ve hemen işine dönüyor.",
          "Now the order service no longer calls the email service. It just drops a message, \"send the email for this order\", into the `emails` queue in RabbitMQ and gets straight back to work.",
        ),
        l(
          "E-posta servisi hâlâ kapalı ama hiçbir şey kaybolmadı: üç mesaj kuyrukta bekliyor. Sipariş servisi bundan hiç etkilenmedi.",
          "The email service is still down, but nothing is lost: three messages wait in the queue. The order service did not notice a thing.",
        ),
      ],
      practice: {
        intro: l("Kendi bilgisayarında bir RabbitMQ açmak için:", "To start a RabbitMQ on your machine:"),
        commands: [
          { cmd: "docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:4-management", note: l("Yönetim paneli: http://localhost:15672 (guest / guest).", "Management UI: http://localhost:15672 (guest / guest).") },
          { cmd: "pip install pika" },
        ],
        snippets: [
          {
            label: "Python · sipariş servisi",
            code: 'import pika\n\nconn = pika.BlockingConnection(pika.ConnectionParameters("localhost"))\nch = conn.channel()\nch.queue_declare(queue="emails", durable=True)\n\ndef order_placed(order_id):\n    # ... save the order ...\n    ch.basic_publish(exchange="", routing_key="emails", body=f"order {order_id}".encode())',
            note: l("Sipariş servisi e-postanın ne zaman, kim tarafından gönderileceğini bilmek zorunda değil.", "The order service does not need to know when or by whom the email gets sent."),
          },
        ],
      },
    },
    {
      short: l("Geri geldi", "Back"),
      tag: "how",
      title: l("E-posta servisi kaldığı yerden devam eder", "The email service picks up where things are"),
      body: [
        l(
          "E-posta servisi geri geldi ve kuyruğu dinlemeye başladı. Saniyede bir e-posta gönderiyor; üç saniyede bekleyen üç e-postanın hepsi gitti.",
          "The email service is back and consuming the queue. It sends one email a second; in three seconds all three waiting emails are out.",
        ),
        l(
          "Bu servis her e-postayı gönderdikten sonra RabbitMQ'ya ack gönderir; o zaman mesaj kuyruktan silinir. Ack'i ilk derste ayrıntısıyla gördük.",
          "After each email it sends an ack to RabbitMQ, and only then is the message deleted from the queue. We saw acks in detail in the first lesson.",
        ),
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("Kaç mesaj beklediğini ve kaç consumer bağlı olduğunu gösterir.", "Shows how many messages wait and how many consumers are connected.") }],
        snippets: [
          {
            label: "Python · e-posta servisi",
            code: 'def handle(ch, method, props, body):\n    send_email(body)\n    ch.basic_ack(delivery_tag=method.delivery_tag)\n\nch.basic_qos(prefetch_count=1)\nch.basic_consume(queue="emails", on_message_callback=handle)\nch.start_consuming()',
          },
        ],
      },
    },
    {
      short: l("Ani yük", "Spike"),
      tag: "experiment",
      predict: {
        question: l(
          "Bir anda 6 sipariş geliyor. E-posta servisi saniyede sadece 1 e-posta gönderebiliyor. İki saniye sonra ne görürüz?",
          "Six orders arrive at once. The email service can send only 1 email a second. What do we see two seconds later?",
        ),
        options: [
          l("Sipariş servisi yavaşlar, siparişler bekler", "The order service slows down and orders wait"),
          l("E-postalar kuyrukta birikir ve sırayla gönderilir", "Emails pile up in the queue and go out in order"),
          l("Fazla gelen e-postalar atılır", "The extra emails are dropped"),
        ],
        answer: 1,
        why: l(
          "Kuyruk bir tampon gibi davranır: yük kuyrukta birikir, e-posta servisi kendi hızında eritir. Sipariş servisi beklemez, hiçbir e-posta atılmaz.",
          "The queue works as a buffer: the load piles up in it and the email service drains it at its own pace. The order service never waits, and nothing is dropped.",
        ),
      },
      title: l("Kuyruk bir tampondur", "The queue is a buffer"),
      body: [
        l(
          "Altı sipariş bir anda geldi. Sipariş servisi altı mesajı hemen bıraktı ve devam etti. E-posta servisi saniyede bir tane gönderiyor: iki saniye sonra kuyrukta hâlâ üç e-posta bekliyor, biri de elinde.",
          "Six orders came at once. The order service dropped six messages right away and moved on. The email service sends one a second: two seconds later three emails still wait, with one in its hands.",
        ),
        l(
          "Bekleyen sayısı geçici olarak arttı ama hiçbir şey kaybolmadı. Yük geçince kuyruk kendiliğinden erir.",
          "The waiting count rose for a while, but nothing was lost. Once the spike passes, the queue drains on its own.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede zaman saniyelerle değil adımlarla ilerliyor ve bir işçi her adımda tam bir mesaj işliyor. Gerçek işler her mesajda farklı sürer.",
            "Here time moves in steps, not real seconds, and a worker handles exactly one message per step. Real work takes a different time for every message.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("Yük anında `messages_ready` artar, sonra azalır. Sürekli artıyorsa işçiler yetişemiyordur.", "During a spike `messages_ready` rises, then falls. If it keeps rising, the workers cannot keep up.") }],
      },
    },
    {
      short: l("İkinci işçi", "Second worker"),
      tag: "how",
      predict: {
        question: l("İkinci bir e-posta servisi aynı kuyruğa bağlanacak. Kalan e-postalar ne kadar hızlı biter?", "A second email service will connect to the same queue. How fast do the remaining emails go?"),
        options: [l("Aynı hızda: kuyruk tektir", "Same speed: there is one queue"), l("İki kat hızlı: işi paylaşırlar", "Twice as fast: they share the work"), l("İkisi de her e-postayı gönderir", "Both send every email")],
        answer: 1,
        why: l(
          "Aynı kuyruğu dinleyen işçiler mesajları paylaşır; her mesaj sadece birine gider. İki işçi saniyede iki e-posta demek.",
          "Workers on the same queue share the messages; each goes to only one of them. Two workers means two emails a second.",
        ),
      },
      title: l("İş artınca işçi ekle", "More work? Add a worker"),
      body: [
        l(
          "İkinci e-posta servisi bağlandı. İki saniyede kuyruk tamamen eridi: her saniye iki e-posta gitti.",
          "A second email service connected. The queue drained in two seconds: two emails went out every second.",
        ),
        l(
          "Sipariş servisinde hiçbir şey değişmedi. Ölçeklemek için yeni bir işçi başlatmak yeterli; kimseye haber vermek gerekmiyor.",
          "Nothing changed in the order service. To scale, you just start another worker; nobody else needs to be told.",
        ),
      ],
      practice: {
        intro: l("Aynı consumer kodunu ikinci bir terminalde çalıştırman yeterli:", "Just run the same consumer code in a second terminal:"),
        commands: [{ cmd: "python email_worker.py" }, { cmd: "python email_worker.py" }],
      },
    },
    {
      short: l("RabbitMQ mu Kafka mı?", "RabbitMQ or Kafka?"),
      tag: "reality",
      title: l("RabbitMQ ne zaman, Kafka ne zaman?", "When RabbitMQ, when Kafka?"),
      body: [
        l(
          "**RabbitMQ** bir mesaj aracısı (broker): mesajlar kuyruklarda bekler, bir işçi alıp onaylayınca silinir. Güçlü yanları iş kuyrukları, esnek yönlendirme (exchange'ler, bir sonraki dersler), mesaj başına onay, yeniden deneme ve dead letter kuyruklarıdır. Request/reply (RPC) gibi desenler de rahattır.",
          "**RabbitMQ** is a message broker: messages wait in queues and are deleted once a worker takes and acks them. Its strengths are task queues, flexible routing (exchanges, the next lessons), per-message acks, retries and dead letter queues. Patterns like request/reply (RPC) are easy too.",
        ),
        l(
          "**Kafka** bir log: mesajlar okunduktan sonra da saklanır, her okuyucu kendi yerini tutar ve geçmişi baştan okuyabilir. Olay akışları, çok sayıda bağımsız okuyucu, yüksek hacim ve geçmişi yeniden oynatmak gerektiğinde güçlüdür.",
          "**Kafka** is a log: messages are kept after they are read, every reader keeps its own position, and history can be read again from the start. It shines for event streams, many independent readers, high volume and replaying history.",
        ),
        l(
          "İkisi birbirinin rakibi değil, farklı işler için. Çoğu projede kural basit: \"bu işi biri yapsın\" diyorsan kuyruk (RabbitMQ), \"bu oldu, ilgilenen herkes okusun ve gerekirse tekrar okusun\" diyorsan log (Kafka).",
          "They are not rivals but tools for different jobs. A simple rule for most projects: if you mean \"someone do this task\", use a queue (RabbitMQ); if you mean \"this happened, everyone interested may read it, and maybe read it again\", use a log (Kafka).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ'nun da **Stream** adında, Kafka'ya benzeyen, okunduktan sonra silinmeyen bir kuyruk türü var (3.9'dan beri). Bu kursun son bölümünde göreceğiz.",
            "RabbitMQ also has a queue type called **Stream** that keeps messages after they are read, much like Kafka (since 3.9). We cover it in the last chapter of this course.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker exec rabbitmq rabbitmq-diagnostics status", note: l("Broker'ın sürümünü, belleğini ve açık bağlantılarını gösterir.", "Shows the broker's version, memory and open connections.") },
          { cmd: "docker exec rabbitmq rabbitmq-plugins list", note: l("Hangi eklentilerin açık olduğunu listeler (`rabbitmq_management` panel eklentisi).", "Lists enabled plugins (`rabbitmq_management` is the UI).") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Proje klasöründe kuyruğu kuran `setup.py`, sipariş gönderen `order.py` ve e-posta servisi `mailer.py` var. Aşağıda gerçek işten **4 senaryo** var: kesinti, taşıma, ani yük, bakım.",
          "Your turn. The project folder has `setup.py`, which creates the queue, `order.py`, which sends an order, and the email service `mailer.py`. Below are **4 scenarios** from real work: an outage, a move, a spike, a maintenance break.",
        ),
        l(
          "Dosyaları `python` ile çalıştır, kuyruğa `rabbitmqctl list_queues name messages` ile bak, zamanı `sleep` ile ilerlet. Servis arka planda çalışır; `pkill -f mailer.py` durdurur. Az komutla bitirirsen 3 yıldız.",
          "Run files with `python`, look at the queue with `rabbitmqctl list_queues name messages`, move time forward with `sleep`. The service runs in the background; `pkill -f mailer.py` stops it. Few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Doğrudan çağrıda iki servis aynı anda ayakta olmak zorunda; biri yavaşlarsa ya da çökerse diğeri de takılır.", "With a direct call both services must be up at once; if one slows or crashes, the other is stuck."),
    l("Araya bir [[queue|kuyruk]] koyunca gönderen mesajı bırakıp devam eder; alan hazır olunca okur.", "With a [[queue]] in between, the sender drops the message and moves on; the receiver reads when ready."),
    l("Kuyruk bir tampondur: ani yük kuyrukta birikir ve işçilerin hızında erir.", "A queue is a buffer: a spike piles up in it and drains at the workers' pace."),
    l("Aynı kuyruğa işçi eklemek işi paylaştırır; her mesaj tek bir işçiye gider.", "Adding workers to one queue shares the work; each message goes to one worker."),
    l("RabbitMQ iş kuyrukları ve yönlendirme için, Kafka saklanan ve yeniden okunan olay akışları için güçlüdür.", "RabbitMQ is strong for task queues and routing; Kafka for event streams that are kept and re-read."),
  ],
  quiz: [
    {
      question: l("E-posta servisi 10 dakika kapalı kaldı ve arada bir kuyruk var. Bu sürede gelen siparişlerin e-postalarına ne olur?", "The email service is down for 10 minutes, with a queue in between. What happens to the emails for orders placed meanwhile?"),
      options: [l("Kaybolurlar", "They are lost"), l("Kuyrukta bekler, servis gelince gönderilir", "They wait in the queue and go out when the service is back"), l("Sipariş servisi hata verir", "The order service fails"), l("RabbitMQ e-postaları kendisi gönderir", "RabbitMQ sends the emails itself")],
      answer: 1,
      explain: l("Kuyruk mesajları alan gelene kadar tutar; sipariş servisi bundan etkilenmez.", "The queue holds messages until the receiver is back; the order service is unaffected."),
      reviewStep: 2,
    },
    {
      question: l("Kuyrukta bekleyen mesaj sayısı saatlerdir sürekli artıyor. En olası sebep ne?", "The number of waiting messages has been rising for hours. What is the most likely cause?"),
      options: [l("RabbitMQ bozuk", "RabbitMQ is broken"), l("İşçiler gelen yüke yetişemiyor", "The workers cannot keep up with the load"), l("Producer çok yavaş", "The producer is too slow"), l("Kuyruk çok küçük", "The queue is too small")],
      answer: 1,
      explain: l("Kısa süreli artış normal bir tampondur; sürekli artış, işçi sayısının ya da hızının yetmediğini gösterir.", "A short rise is normal buffering; a constant rise means there are not enough workers, or they are too slow."),
      reviewStep: 4,
    },
    {
      question: l("Aynı kuyruğu dinleyen 3 işçi var. 9 mesaj gelirse her mesajı kaç işçi işler?", "Three workers listen to one queue. If 9 messages arrive, how many workers handle each message?"),
      options: [l("3", "3"), l("1", "1"), l("9", "9"), l("Hiçbiri", "None")],
      answer: 1,
      explain: l("Aynı kuyruğun işçileri işi paylaşır; her mesaj tek bir işçiye gider.", "Workers on one queue share the work; each message goes to one worker."),
      reviewStep: 5,
    },
    {
      question: l("Hangi durumda Kafka, RabbitMQ'dan daha uygun olur?", "When does Kafka fit better than RabbitMQ?"),
      options: [
        l("Bir iş bir kez yapılsın, sonra unutulsun", "A task must be done once and then forgotten"),
        l("Olayları aylarca saklayıp yeni servislerin baştan okuyabilmesi gerekiyor", "Events must be kept for months so new services can read them from the start"),
        l("Mesajları key'e göre farklı kuyruklara yönlendirmek", "Routing messages to different queues by key"),
        l("Request/reply (RPC)", "Request/reply (RPC)"),
      ],
      answer: 1,
      explain: l("Saklamak ve yeniden okumak bir log'un işidir. Diğerleri RabbitMQ'nun güçlü olduğu yerler.", "Keeping and re-reading is a log's job. The others are where RabbitMQ is strong."),
      reviewStep: 6,
    },
  ],
};
