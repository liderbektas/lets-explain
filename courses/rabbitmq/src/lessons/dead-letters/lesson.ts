import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

const DLX_SETUP = `ch.exchange_declare(exchange="dlx", exchange_type="fanout", durable=True)
ch.queue_declare(queue="dead", durable=True)
ch.queue_bind(queue="dead", exchange="dlx")

ch.queue_declare(
    queue="work",
    durable=True,
    arguments={"x-dead-letter-exchange": "dlx"},
)`;

export const deadLetters: Lesson = {
  slug: "dead-letters",
  title: l("Dead letter, TTL, max-length", "Dead letters, TTL, max length"),
  summary: l(
    "Reddedilen, süresi dolan ya da kuyruğa sığmayan mesajlar kaybolmak zorunda değil: dead letter exchange'e gider. x-death başlığını, reject-publish ile farkı ve gecikmeli tekrar desenini gör.",
    "Rejected, expired or overflowing messages do not have to vanish: they go to a dead letter exchange. See the x-death header, how reject-publish differs, and the delayed-retry pattern.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Reddedilen mesajın DLX'e gittiğini görmek", "See a rejected message go to the DLX"), step: 1 },
    { text: l("Süresi dolan mesajın kuyruğun başında atıldığını görmek", "See an expired message leave from the head of the queue"), step: 2 },
    { text: l("x-death başlığını okumak", "Read the x-death header"), step: 3 },
    { text: l("drop-head ile reject-publish farkını görmek", "See the difference between drop-head and reject-publish"), step: 5 },
    { text: l("TTL kuyruğuyla gecikmeli tekrar kurmak", "Build a delayed retry with a TTL queue"), step: 7 },
  ],
  steps: [
    {
      short: l("DLX", "DLX"),
      tag: "how",
      title: l("Mesajların son durağı", "A last stop for messages"),
      body: [
        l(
          "Bazı mesajlar işlenemez: bozuktur, süresi geçmiştir ya da kuyrukta yer yoktur. Varsayılan olarak RabbitMQ böyle mesajları **siler**, kimseye haber vermeden.",
          "Some messages cannot be processed: they are broken, out of date, or there is no room. By default RabbitMQ **deletes** them without telling anyone.",
        ),
        l(
          "Bir kuyruğa [[dlx]] verirsen bu mesajlar silinmek yerine o exchange'e yeniden yayınlanır. Burada `work` kuyruğunun DLX'i `dlx`; ona bağlı `dead` kuyruğu ölü mektupları topluyor.",
          "Give a queue a [[dlx]] and those messages are republished to that exchange instead of being deleted. Here `work`'s DLX is `dlx`, and the `dead` queue bound to it collects them.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · DLX kur", code: DLX_SETUP }],
        commands: [],
      },
    },
    {
      short: l("Reddet", "Reject"),
      tag: "how",
      predict: {
        question: l(
          "İşçi `a1`'i `nack(requeue=False)` ile reddedecek. `work`'ün DLX'i var. Mesaj nereye gider?",
          "The worker will reject `a1` with `nack(requeue=False)`. `work` has a DLX. Where does the message go?",
        ),
        options: [l("Silinir", "It is deleted"), l("`dlx` üzerinden `dead` kuyruğuna", "Through `dlx` into the `dead` queue"), l("`work`'ün başına geri döner", "Back to the front of `work`")],
        answer: 1,
        why: l(
          "Requeue olmadan reddedilen mesaj, kuyrukta DLX tanımlıysa ona gider. DLX olmasaydı silinirdi.",
          "A message rejected without requeue goes to the queue's DLX if one is set. Without a DLX it would be deleted.",
        ),
      },
      title: l("Reddedilen mesaj DLX'e gider", "A rejected message goes to the DLX"),
      body: [
        l(
          "`a1` işçiye gitti, işçi onu reddetti ve mesaj `dlx` üzerinden `dead` kuyruğuna düştü. Sağdaki panel nedenini gösteriyor: `rejected@work`.",
          "`a1` went to the worker, the worker rejected it, and it landed in `dead` through `dlx`. The panel on the right shows why: `rejected@work`.",
        ),
        l(
          "`requeue=True` ile reddetmek mesajı geri koyar ve aynı hata sonsuza dek tekrarlanabilir. İşlenemeyeceğinden emin olduğun mesajı `requeue=False` ile reddet.",
          "Rejecting with `requeue=True` puts the message back, and the same failure can repeat forever. Reject a message you know cannot succeed with `requeue=False`.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · DLX'e gönder", code: "ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)" }],
        commands: [],
      },
    },
    {
      short: l("TTL", "TTL"),
      tag: "how",
      predict: {
        question: l(
          "`waiting` kuyruğunun TTL'i 3 tik ve onu dinleyen kimse yok. `b1` 3 tik bekledikten sonra ne olur?",
          "`waiting` has a TTL of 3 ticks and nobody consumes it. What happens to `b1` after 3 ticks?",
        ),
        options: [l("Kuyrukta kalır", "It stays in the queue"), l("Süresi dolar, `dead`'e gider", "It expires and goes to `dead`"), l("Producer'a döner", "It goes back to the producer")],
        answer: 1,
        why: l(
          "TTL dolan mesaj kuyruktan çıkar; kuyruğun DLX'i varsa oraya `expired` sebebiyle yollanır.",
          "A message whose TTL runs out leaves the queue and, if there is a DLX, goes there with reason `expired`.",
        ),
      },
      title: l("Süresi dolan mesaj", "An expired message"),
      body: [
        l(
          "`waiting` kuyruğunun `x-message-ttl` ayarı 3 tik. `b1` üç tik bekledi, kimse almadı ve `expired` sebebiyle `dead`'e gitti.",
          "`waiting` has `x-message-ttl` of 3 ticks. `b1` waited three ticks, nobody took it, and it went to `dead` as `expired`.",
        ),
        l(
          "TTL, eskiyen veri için doğru araç: 10 dakika sonra anlamı kalmayan bir fiyat bildirimi, süresi geçmiş bir doğrulama kodu.",
          "TTL is the right tool for data that goes stale: a price alert that means nothing after 10 minutes, a verification code past its time.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada TTL tik sayısı; gerçekte milisaniye. RabbitMQ da süresi dolan mesajları ancak kuyruğun **başına** gelince atar: önündeki mesaj uzun yaşıyorsa, arkadaki kısa ömürlü mesaj onu bekler.",
            "TTL here is counted in ticks; in reality it is milliseconds. RabbitMQ also drops expired messages only when they reach the **head**: a short-lived message waits behind a long-lived one in front of it.",
          ),
        },
      ],
      practice: {
        snippets: [
          { label: "Python · kuyruk TTL'i", code: 'ch.queue_declare(\n    queue="waiting",\n    durable=True,\n    arguments={"x-message-ttl": 60000, "x-dead-letter-exchange": "dlx"},\n)' },
          { label: "Python · mesaj başına TTL", code: 'pika.BasicProperties(expiration="60000")  # milisaniye, metin olarak' },
        ],
        commands: [],
      },
    },
    {
      short: l("x-death", "x-death"),
      tag: "how",
      title: l("x-death: mesajın ölüm raporu", "x-death: the message's death report"),
      body: [
        l(
          "Dead letter olan her mesaja RabbitMQ bir `x-death` başlığı ekler: hangi kuyruktan, hangi sebeple ve kaçıncı kez. Sağdaki panel bu başlığı okuyor.",
          "RabbitMQ adds an `x-death` header to every dead-lettered message: from which queue, for which reason, and how many times. The panel on the right reads it.",
        ),
        l(
          "`dead`'i okuyan bir uygulama bu başlığa bakarak karar verebilir: `rejected` ise bir insana göster, `expired` ise sessizce at.",
          "An app reading `dead` can decide from this header: show `rejected` ones to a human, drop `expired` ones quietly.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · x-death oku",
            code: 'def handle(ch, method, props, body):\n    for death in (props.headers or {}).get("x-death", []):\n        print(death["reason"], death["queue"], death["count"])\n    ch.basic_ack(delivery_tag=method.delivery_tag)',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("max-length", "max-length"),
      tag: "experiment",
      predict: {
        question: l(
          "`box` en fazla 2 mesaj alıyor (varsayılan `drop-head`). Üçüncü mesaj gelince ne olur?",
          "`box` holds at most 2 messages (default `drop-head`). What happens when a third arrives?",
        ),
        options: [
          l("Yeni mesaj reddedilir", "The new message is refused"),
          l("En eski mesaj `dead`'e gider, yenisi girer", "The oldest goes to `dead` and the new one goes in"),
          l("Kuyruk bütünüyle boşaltılır", "The whole queue is emptied"),
        ],
        answer: 1,
        why: l(
          "drop-head yer açmak için kuyruğun başındaki en eski mesajı atar; DLX varsa oraya `maxlen` sebebiyle gönderir.",
          "drop-head makes room by dropping the oldest message at the head, sending it to the DLX with reason `maxlen` if there is one.",
        ),
      },
      title: l("drop-head: en eskisi gider", "drop-head: the oldest goes"),
      body: [
        l(
          "`c1` ve `c2` girdi; `c3` gelince kuyruk dolu olduğu için en eski `c1` atıldı ve `maxlen` sebebiyle `dead`'e düştü.",
          "`c1` and `c2` went in; when `c3` came the queue was full, so the oldest, `c1`, was dropped and landed in `dead` as `maxlen`.",
        ),
        l(
          "Sınır, bir consumer uzun süre çalışmadığında kuyruğun belleği yutmasını engeller. Ama hangi mesajın atılacağına dikkat: en eskiler gider.",
          "A limit stops a queue from eating all memory when a consumer is down for a long time. Mind which messages go, though: the oldest ones.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · max-length", code: 'arguments={"x-max-length": 2, "x-dead-letter-exchange": "dlx"}' }],
        commands: [],
      },
    },
    {
      short: l("reject-publish", "reject-publish"),
      tag: "experiment",
      predict: {
        question: l(
          "`strict` en fazla 1 mesaj alıyor ve `reject-publish` ayarlı, DLX'i de var. İkinci mesaj nereye gider?",
          "`strict` holds at most 1 message, uses `reject-publish`, and has a DLX. Where does the second message go?",
        ),
        options: [l("`dead`'e", "To `dead`"), l("Hiçbir yere: kuyruğa hiç girmez, producer nack alır", "Nowhere: it never enters, and the producer gets a nack"), l("`strict`'in başına", "To the front of `strict`")],
        answer: 1,
        why: l(
          "reject-publish mesajı kapıda geri çevirir. Kuyruğa hiç girmediği için dead letter da olmaz; haberi producer confirm'deki nack ile alır.",
          "reject-publish turns the message away at the door. It never entered the queue, so it is not dead-lettered; the producer hears about it through a nack.",
        ),
      },
      title: l("reject-publish: kapıda geri çevir", "reject-publish: turned away at the door"),
      body: [
        l(
          "`d1` girdi, `d2` reddedildi ve `dead`'e hiçbir şey gelmedi. Sayaçtaki \"İz bırakmadan kaybolan\" bir arttı.",
          "`d1` went in, `d2` was refused, and nothing came to `dead`. \"Lost without a trace\" on the counter went up by one.",
        ),
        l(
          "Seçim şu: eskiyi kurban et (drop-head) ya da yeniyi durdur (reject-publish). Siparişler gibi kaybolmaması gereken işlerde reject-publish ve publisher confirms ile producer'ı yavaşlatmak daha güvenli.",
          "The choice is: sacrifice the old (drop-head) or stop the new (reject-publish). For work that must not be lost, such as orders, reject-publish plus publisher confirms that slow the producer down is safer.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · reject-publish", code: 'arguments={"x-max-length": 1, "x-overflow": "reject-publish"}' }],
        commands: [],
      },
    },
    {
      short: l("Dead letter key", "Dead letter key"),
      tag: "how",
      title: l("Routing key ile dead letter", "Dead-lettering with a routing key"),
      body: [
        l(
          "DLX bir direct ya da topic exchange de olabilir. `payments` kuyruğu `x-dead-letter-routing-key: payment.failed` ile kuruldu, yani reddedilen her ödeme `errors-x` exchange'ine bu key'le gidiyor.",
          "A DLX can also be a direct or topic exchange. `payments` was set up with `x-dead-letter-routing-key: payment.failed`, so every rejected payment reaches `errors-x` with that key.",
        ),
        l(
          "Böylece tek bir DLX, farklı kuyrukların hatalarını farklı yerlere dağıtabilir. Key verilmezse mesajın kendi routing key'i kullanılır.",
          "One DLX can then sort failures from different queues into different places. Without that setting, the message's own routing key is used.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · dead letter key",
            code: 'ch.queue_declare(\n    queue="payments",\n    durable=True,\n    arguments={\n        "x-dead-letter-exchange": "errors-x",\n        "x-dead-letter-routing-key": "payment.failed",\n    },\n)',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Gecikmeli tekrar", "Delayed retry"),
      tag: "idea",
      title: l("Biraz bekle, sonra tekrar dene", "Wait a bit, then try again"),
      body: [
        l(
          "Bir ödeme servisi geçici olarak kapalıysa mesajı hemen tekrar denemek işe yaramaz. Bilinen desen: `jobs`'un DLX'i bir **bekleme kuyruğu**na (`jobs.retry`) gider; o kuyruğun TTL'i dolunca mesaj, default exchange üzerinden tekrar `jobs`'a döner.",
          "If a payment service is briefly down, retrying at once does not help. The known pattern: `jobs` dead-letters into a **waiting queue** (`jobs.retry`); when that queue's TTL runs out, the message dead-letters back to `jobs` through the default exchange.",
        ),
        l(
          "İşçi `f1`'i reddetti, mesaj `jobs.retry`'da 2 tik bekledi ve `jobs`'a geri gelip işçiye tekrar ulaştı. x-death'te iki iz var: `rejected@jobs` ve `expired@jobs.retry`.",
          "The worker rejected `f1`, it waited 2 ticks in `jobs.retry`, then came back to `jobs` and reached the worker again. x-death shows two marks: `rejected@jobs` and `expired@jobs.retry`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bu döngü kendiliğinden durmaz. x-death'teki `count`'a bakıp örneğin 5 denemeden sonra mesajı kalıcı bir hata kuyruğuna gönder.",
            "This loop never stops on its own. Check `count` in x-death and, after say 5 tries, send the message to a permanent error queue.",
          ),
        },
      ],
      practice: {
        snippets: [
          {
            label: "Python · bekleme kuyruğu",
            code: 'ch.exchange_declare(exchange="retry-x", exchange_type="fanout", durable=True)\nch.queue_declare(\n    queue="jobs.retry",\n    durable=True,\n    arguments={\n        "x-message-ttl": 30000,\n        "x-dead-letter-exchange": "",\n        "x-dead-letter-routing-key": "jobs",\n    },\n)\nch.queue_bind(queue="jobs.retry", exchange="retry-x")\nch.queue_declare(queue="jobs", durable=True, arguments={"x-dead-letter-exchange": "retry-x"})',
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Ayarları policy ile ver", "Set it with a policy"),
      body: [
        l(
          "Kuyruk argümanları (`x-...`) kuyruk oluşturulurken sabitlenir; sonradan değiştirmek için kuyruğu silmen gerekir. RabbitMQ'nun önerdiği yol **policy**: DLX, TTL ve max-length gibi ayarları bir isim kalıbına göre merkezden verirsin ve istediğin an değiştirirsin.",
          "Queue arguments (`x-...`) are fixed when the queue is created; changing them means deleting the queue. RabbitMQ's recommended way is a **policy**: set things like DLX, TTL and max length centrally by a name pattern, and change them any time.",
        ),
        l(
          "Klasik kuyruklarda dead-lettering \"at-most-once\" çalışır: tam o sırada bir şey ters giderse mesaj kaybolabilir. Quorum queue'larda `dead-letter-strategy: at-least-once` ile bu güvence artırılabilir.",
          "With classic queues dead-lettering is \"at-most-once\": if something goes wrong right then, the message can be lost. Quorum queues can raise that with `dead-letter-strategy: at-least-once`.",
        ),
      ],
      practice: {
        commands: [
          {
            cmd: `docker exec rabbitmq rabbitmqctl set_policy DLX "^work$" '{"dead-letter-exchange":"dlx","message-ttl":60000}' --apply-to queues`,
            note: l("`work` kuyruğuna DLX ve TTL'i kod değiştirmeden verir.", "Gives `work` a DLX and a TTL without changing code."),
          },
          { cmd: "docker exec rabbitmq rabbitmqctl list_policies" },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "`work` kuyruğu en fazla **2 bekleyen** mesaj alıyor ve DLX'i `dlx`. İşçinin prefetch'i 1: aynı anda tek mesaj tutar. Mesaj ya da 2 tik ömürlü mesaj gönderebilir, işçiye ack, reddet veya geri koy dedirtebilir, zamanı ilerletebilirsin.",
          "`work` takes at most **2 waiting** messages and dead-letters to `dlx`. The worker's prefetch is 1: it holds one message at a time. Send messages or 2-tick messages, have the worker ack, reject or requeue, and move time forward.",
        ),
        l("Sahnenin altında **3 görev** var.", "There are **3 missions** under the scene."),
      ],
    },
  ],
  recap: [
    l("Bir kuyruğa `x-dead-letter-exchange` verirsen reddedilen, süresi dolan ve sığmayan mesajlar silinmek yerine oraya gider.", "Give a queue `x-dead-letter-exchange` and rejected, expired and overflowing messages go there instead of being deleted."),
    l("`nack(requeue=False)` reddeder; TTL dolan mesaj kuyruğun başında atılır; `drop-head` taşınca en eskiyi atar.", "`nack(requeue=False)` rejects; an expired message leaves at the head; `drop-head` drops the oldest on overflow."),
    l("`x-death` başlığı mesajın nereden, neden ve kaç kez ölü mektup olduğunu taşır.", "The `x-death` header says where from, why and how often a message was dead-lettered."),
    l("`reject-publish` mesajı kapıda reddeder: dead letter olmaz, producer nack alır.", "`reject-publish` refuses at the door: no dead letter, the producer gets a nack."),
    l("TTL'li bir bekleme kuyruğu ile gecikmeli tekrar kurulur; döngüyü x-death sayısıyla sınırla.", "A TTL waiting queue gives a delayed retry; cap the loop by the x-death count."),
  ],
  quiz: [
    {
      question: l("DLX'i olmayan bir kuyrukta bir mesaj `nack(requeue=False)` ile reddedilirse?", "A message is rejected with `nack(requeue=False)` in a queue with no DLX. What happens?"),
      options: [l("Kuyruğun başına döner", "It goes back to the front"), l("Silinir", "It is deleted"), l("Producer'a döner", "It goes back to the producer"), l("Başka kuyruğa geçer", "It moves to another queue")],
      answer: 1,
      explain: l("Gidecek DLX yoksa reddedilen mesaj silinir.", "With no DLX to go to, a rejected message is deleted."),
      reviewStep: 1,
    },
    {
      question: l("Varsayılan overflow (`drop-head`) ile dolu bir kuyruğa yeni mesaj gelirse hangisi gider?", "With the default overflow (`drop-head`), a new message arrives at a full queue. Which one goes?"),
      options: [l("Yeni gelen", "The new one"), l("En eski bekleyen", "The oldest waiting one"), l("En yeni bekleyen", "The newest waiting one"), l("Hiçbiri, kuyruk büyür", "None, the queue grows")],
      answer: 1,
      explain: l("drop-head kuyruğun başındaki, yani en eski mesajı atar.", "drop-head drops the message at the head, the oldest."),
      reviewStep: 4,
    },
    {
      question: l("`reject-publish` ile reddedilen mesaj DLX'e gider mi?", "Does a message refused by `reject-publish` go to the DLX?"),
      options: [l("Evet, `maxlen` sebebiyle", "Yes, as `maxlen`"), l("Hayır, kuyruğa hiç girmez; producer nack alır", "No, it never enters; the producer gets a nack"), l("Evet, `rejected` sebebiyle", "Yes, as `rejected`"), l("Sadece persistent ise", "Only if persistent")],
      answer: 1,
      explain: l("reject-publish mesajı kapıda geri çevirir, dead letter olacak bir şey yoktur.", "reject-publish turns it away at the door; there is nothing to dead-letter."),
      reviewStep: 5,
    },
    {
      question: l("Gecikmeli tekrar deseninde mesaj bekleme kuyruğundan asıl kuyruğa nasıl döner?", "In the delayed-retry pattern, how does a message get back from the waiting queue to the main queue?"),
      options: [
        l("Consumer onu elle taşır", "A consumer moves it by hand"),
        l("TTL dolunca, bekleme kuyruğunun DLX'i ile", "When its TTL runs out, through the waiting queue's DLX"),
        l("Broker yeniden başlayınca", "When the broker restarts"),
        l("Kendiliğinden, her dakika", "By itself, every minute"),
      ],
      answer: 1,
      explain: l("Bekleme kuyruğunun TTL'i dolan mesajı, DLX ve dead letter key ile asıl kuyruğa geri gönderir.", "The waiting queue's TTL expires the message, and its DLX plus dead letter key send it back."),
      reviewStep: 7,
    },
  ],
};
