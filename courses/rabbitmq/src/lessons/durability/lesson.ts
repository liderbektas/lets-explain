import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const LIST = "docker exec rabbitmq rabbitmqctl list_queues name durable messages";

export const durability: Lesson = {
  slug: "durability",
  title: l("Durability ve persistence", "Durability and persistence"),
  summary: l(
    "Broker yeniden başlayınca ne kalır? Durable kuyruk ve persistent mesajın neden ikisinin birden gerektiğini, quorum queue'ların neden hep diske yazdığını gör.",
    "What is left when the broker restarts? See why you need a durable queue and a persistent message together, and why quorum queues always write to disk.",
  ),
  minutes: 11,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Geçici bir kuyruğun restart'ta tamamen silindiğini görmek", "See a transient queue vanish on restart"), step: 2 },
    { text: l("Durable kuyrukta bile geçici mesajların kaybolduğunu görmek", "See transient messages lost even in a durable queue"), step: 4 },
    { text: l("Quorum queue'ların her mesajı diske yazdığını görmek", "See quorum queues write every message to disk"), step: 6 },
    { text: l("Persistence'ın tek başına neden yetmediğini anlamak", "Understand why persistence alone is not enough"), step: 7 },
  ],
  steps: [
    {
      short: l("İki kuyruk", "Two queues"),
      tag: "how",
      title: l("Biri kalıcı, biri geçici", "One lasting, one temporary"),
      body: [
        l(
          "RabbitMQ bir gün mutlaka yeniden başlar: güncelleme, sunucu taşıma, çökme. Soru şu: o anda kuyruklardaki mesajlara ne olur?",
          "RabbitMQ will restart one day: an upgrade, a server move, a crash. The question is what happens to the messages in its queues at that moment.",
        ),
        l(
          "Burada iki kuyruk var. `orders` **durable** tanımlandı: kuyruğun kendisi restart'tan sağ çıkar. `temp` ise geçici (transient): altında \"transient\" yazıyor, broker kapanınca kuyruk da gider.",
          "There are two queues here. `orders` was declared **durable**: the queue itself survives a restart. `temp` is transient (marked \"transient\" above it): when the broker stops, the queue goes too.",
        ),
      ],
      practice: {
        commands: [{ cmd: LIST, note: l("`durable` sütunu her kuyruğun restart'tan sağ çıkıp çıkmayacağını gösterir.", "The `durable` column shows whether each queue survives a restart.") }],
        snippets: [
          {
            label: "Python · durable ve geçici kuyruk",
            code: 'ch.queue_declare(queue="orders", durable=True)\nch.queue_declare(queue="temp", durable=False)',
            note: l("Bir kuyruğun durable ayarı sonradan değişmez: farklı ayarla yeniden tanımlamak `PRECONDITION_FAILED` verir. Değiştirmek için kuyruğu silip yeniden oluşturman gerekir.", "A queue's durable setting cannot change later: declaring it again with another value fails with `PRECONDITION_FAILED`. To change it, delete and recreate the queue."),
          },
        ],
      },
    },
    {
      short: l("Geçici mesaj", "Transient message"),
      tag: "how",
      title: l("İki kuyruğa birer mesaj", "One message in each queue"),
      body: [
        l(
          "Her iki kuyruğa da birer mesaj gönderdik, ikisi de **geçici** (transient): sahnede açık renk koli. Mesajlar şimdilik bellekte, kuyruklarında bekliyor.",
          "We sent one message to each queue, both **transient**: the plain-coloured parcels. For now they wait in memory, in their queues.",
        ),
        l(
          "Bir mesajın kalıcı olup olmayacağını kuyruk değil, **mesajı gönderen** seçer. Mesaj gönderirken hiçbir şey söylemezsen geçici olur.",
          "Whether a message is persistent is chosen by **the sender**, not the queue. Say nothing when publishing and it is transient.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · geçici mesaj (varsayılan)", code: 'ch.basic_publish(exchange="", routing_key="orders", body=b"t1")' }],
        commands: [],
      },
    },
    {
      short: l("Restart", "Restart"),
      tag: "experiment",
      predict: {
        question: l(
          "Broker yeniden başlayacak. `orders` durable, `temp` geçici; iki mesaj da geçici. Restart'tan sonra hangi mesajlar kalır?",
          "The broker will restart. `orders` is durable, `temp` is transient, and both messages are transient. Which messages are left afterwards?",
        ),
        options: [
          l("İkisi de kalır", "Both stay"),
          l("Hiçbiri kalmaz", "Neither stays"),
          l("Sadece `orders`'taki kalır", "Only the one in `orders`"),
        ],
        answer: 1,
        why: l(
          "`temp` kuyruğu tamamen silindi, içindekiyle birlikte. `orders` durable olduğu için kuyruk kaldı, ama içindeki mesaj geçiciydi: o da gitti.",
          "The `temp` queue was deleted entirely, contents and all. `orders` is durable so the queue stayed, but its message was transient: it is gone too.",
        ),
      },
      title: l("Durable kuyruk, geçici mesajı korumaz", "A durable queue does not save a transient message"),
      body: [
        l(
          "Restart'tan sonra `temp` kuyruğu yok, onu dinleyen bir uygulama yeniden tanımlamak zorunda. `orders` yerinde duruyor ama **boş**.",
          "After the restart, `temp` is gone: an app that uses it has to declare it again. `orders` is still there but **empty**.",
        ),
        l(
          "Durable, **kuyruğun tanımının** saklanması demek: adı, ayarları, binding'leri. İçindeki mesajları değil.",
          "Durable means **the queue's definition** is kept: its name, settings and bindings. Not the messages inside it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker restart rabbitmq", note: l("Kendi makinende aynı deneyi yap: restart'tan sonra listeye tekrar bak.", "Try it on your machine: list the queues again after the restart.") },
          { cmd: LIST },
        ],
      },
    },
    {
      short: l("Persistent", "Persistent"),
      tag: "how",
      title: l("Persistent mesajlar", "Persistent messages"),
      body: [
        l(
          "`temp`'i yeniden tanımladık ve üç mesaj gönderdik: `orders`'a persistent `p1` ve geçici `t3`, `temp`'e persistent `p2`. Persistent mesajlar yeşil.",
          "We declared `temp` again and sent three messages: persistent `p1` and transient `t3` to `orders`, persistent `p2` to `temp`. Persistent messages are mint.",
        ),
        l(
          "Persistent işaretli mesajı broker diske de yazar (`delivery_mode=2`). Restart'ta kurtarılabilmesi için bu şart.",
          "The broker also writes a persistent message to disk (`delivery_mode=2`). That is required for it to be recovered after a restart.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · persistent mesaj",
            code: 'ch.basic_publish(\n    exchange="",\n    routing_key="orders",\n    body=b"p1",\n    properties=pika.BasicProperties(delivery_mode=pika.DeliveryMode.Persistent),\n)',
            note: l("`pika.DeliveryMode.Persistent` 2 değeridir. Eski örneklerde doğrudan `delivery_mode=2` görürsün.", "`pika.DeliveryMode.Persistent` is the value 2. Older examples write `delivery_mode=2` directly."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("İkisi birden", "Both together"),
      tag: "experiment",
      predict: {
        question: l(
          "Yine restart. `orders`'ta persistent `p1` ve geçici `t3`, geçici `temp`'te persistent `p2` var. Ne kalır?",
          "Another restart. `orders` holds persistent `p1` and transient `t3`; transient `temp` holds persistent `p2`. What is left?",
        ),
        options: [l("`p1` ve `p2`", "`p1` and `p2`"), l("Sadece `p1`", "Only `p1`"), l("`p1` ve `t3`", "`p1` and `t3`")],
        answer: 1,
        why: l(
          "Kalması için **ikisi birden** lazım: kuyruk durable ve mesaj persistent. `t3` geçiciydi; `p2` persistent'ti ama kuyruğu geçiciydi ve onunla birlikte gitti.",
          "To stay you need **both**: a durable queue and a persistent message. `t3` was transient; `p2` was persistent, but its queue was transient and took it along.",
        ),
      },
      title: l("Kural: durable kuyruk + persistent mesaj", "The rule: durable queue + persistent message"),
      body: [
        l(
          "Restart'tan sonra sadece `p1` kaldı. `temp` yine yok oldu ve persistent `p2` de onunla gitti.",
          "After the restart only `p1` is left. `temp` vanished again and took persistent `p2` with it.",
        ),
        l(
          "Kaybetmek istemediğin her mesaj için iki şeyi birlikte yap: kuyruğu `durable=True` tanımla ve mesajı persistent gönder.",
          "For every message you cannot afford to lose, do both: declare the queue with `durable=True` and publish the message as persistent.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Geçici kuyruklar kötü değil: bir web sayfasının canlı bildirimleri ya da RPC cevapları gibi, kaybolması sorun olmayan şeyler için hızlı ve doğru seçim.",
            "Transient queues are not bad: for things that may be lost, such as live notifications on a page or RPC replies, they are fast and the right choice.",
          ),
        },
      ],
      practice: { commands: [{ cmd: LIST, note: l("`messages` sütunu restart'tan sonra sadece kalıcı mesajları sayar.", "After a restart, the `messages` column counts only what was kept.") }] },
    },
    {
      short: l("Quorum", "Quorum"),
      tag: "how",
      title: l("Quorum queue: her zaman diske", "Quorum queue: always on disk"),
      body: [
        l(
          "`payments` adında bir **quorum** kuyruğu tanımladık ve ona geçici bir mesaj gönderdik. Kuyruğun üstünde \"quorum\" yazıyor.",
          "We declared a **quorum** queue called `payments` and sent it a transient message. It is marked \"quorum\" above the queue.",
        ),
        l(
          "Quorum queue'lar mesajları birden fazla node'a kopyalayan, güvenlik için tasarlanmış kuyruklar. Onları bu bölümün son dersinde ayrıntılı göreceğiz.",
          "Quorum queues copy messages to several nodes and are built for safety. We look at them closely in the last lesson of this chapter.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · quorum queue", code: 'ch.queue_declare(\n    queue="payments",\n    durable=True,\n    arguments={"x-queue-type": "quorum"},\n)' }],
        commands: [],
      },
    },
    {
      short: l("Quorum restart", "Quorum restart"),
      tag: "experiment",
      predict: {
        question: l(
          "Quorum kuyruğa **geçici** bir mesaj koyduk. Restart'tan sonra ne olur?",
          "We put a **transient** message in the quorum queue. What happens after a restart?",
        ),
        options: [l("Mesaj kaybolur", "The message is lost"), l("Mesaj kalır", "The message stays"), l("Kuyruk silinir", "The queue is deleted")],
        answer: 1,
        why: l(
          "Quorum queue'lar her mesajı diske yazar ve kopyalar; mesajın persistent işareti onlar için fark etmez. Kuyruk da her zaman durable'dır.",
          "Quorum queues write and replicate every message; the persistent flag makes no difference to them. The queue is always durable as well.",
        ),
      },
      title: l("Quorum, mesajın işaretine bakmaz", "Quorum ignores the message flag"),
      body: [
        l(
          "Restart'tan sonra `q1` hâlâ `payments`'ta. Quorum queue'da her mesaj diske gider ve kopyalanır.",
          "After the restart `q1` is still in `payments`. In a quorum queue every message goes to disk and is replicated.",
        ),
        l(
          "Yine de mesajları persistent göndermek iyi bir alışkanlık: aynı kod hem klasik hem quorum kuyruklarla doğru çalışır.",
          "Publishing persistent messages is still a good habit: the same code then works correctly with both classic and quorum queues.",
        ),
      ],
      practice: { commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_queues name type messages", note: l("`type` sütunu classic, quorum ya da stream yazar.", "The `type` column says classic, quorum or stream.") }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Persistent yine de garanti değil", "Persistent still is not a guarantee"),
      body: [
        l(
          "Broker persistent bir mesajı aldığı anda diske yazmaz; yazmaları toplayıp kısa aralıklarla yapar. Tam o arada çökerse, \"aldım\" sandığın mesaj gidebilir.",
          "The broker does not write a persistent message to disk the moment it arrives; it batches writes at short intervals. If it crashes in between, a message you thought was taken can be lost.",
        ),
        l(
          "Mesajın gerçekten güvende olduğunu öğrenmenin tek yolu, broker'ın \"sakladım\" cevabını beklemek: **publisher confirms**. Sonraki ders tam olarak bu.",
          "The only way to know a message is really safe is to wait for the broker to say \"stored\": **publisher confirms**. That is the next lesson.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede restart anında olur ve diske yazma beklenmez. Gerçekte consumer'lar bağlantılarını kaybeder ve yeniden bağlanmak zorundadır; onaylanmamış mesajlar da kuyruğa geri döner.",
            "Here a restart is instant and nothing waits for disk writes. In reality consumers lose their connections and must reconnect, and unacked messages go back to their queues.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Ayarları koddan değil, policy ile vermek de mümkün: kuyruk tipi hariç çoğu ayar `rabbitmqctl set_policy` ile sonradan değiştirilebilir.",
            "Settings can also come from a policy instead of code: most settings except the queue type can be changed later with `rabbitmqctl set_policy`.",
          ),
        },
      ],
      practice: {
        commands: [
          {
            cmd: `docker exec rabbitmq rabbitmqctl set_policy max-orders "^orders$" '{"max-length":10000}' --apply-to queues`,
            note: l("Kodu değiştirmeden `orders`'a bir sınır koyar. Policy'ler kuyruk ayarlarını merkezden yönetmenin önerilen yolu.", "Puts a limit on `orders` without touching code. Policies are the recommended way to manage queue settings centrally."),
          },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: restart'ta kaybolan kuyruklar ve mesajlar, ve canlıdaki bir kuyruğa kod değiştirmeden sınır koymak. Proje klasöründe kurulumu yapan `setup.py` ve mesaj gönderen küçük Python dosyaları var.",
          "Your turn. Below are **4 scenarios** from real work: queues and messages lost in a restart, and capping a live queue without changing code. The project folder has `setup.py`, which declares the queues, and small Python files that send messages.",
        ),
        l(
          "`rabbitmqctl list_queues name durable messages` ile bak, `nano` ile kodu düzelt, `python` ile çalıştır, `docker restart rabbitmq` ile broker'ı yeniden başlat. Az komutla bitirirsen 3 yıldız.",
          "Look with `rabbitmqctl list_queues name durable messages`, fix the code with `nano`, run it with `python`, restart the broker with `docker restart rabbitmq`. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Durable bir kuyruğun **tanımı** restart'tan sağ çıkar; geçici kuyruk içindekilerle birlikte silinir.", "A durable queue's **definition** survives a restart; a transient queue is deleted with everything in it."),
    l("Mesajın kalıcılığını gönderen seçer: `delivery_mode=2` (persistent) diske de yazılır.", "The sender chooses persistence: `delivery_mode=2` (persistent) is also written to disk."),
    l("Kaybetmemek için ikisi birden: durable kuyruk **ve** persistent mesaj.", "To keep a message you need both: a durable queue **and** a persistent message."),
    l("Quorum queue'lar her mesajı diske yazıp kopyalar ve her zaman durable'dır.", "Quorum queues write and replicate every message and are always durable."),
    l("Persistent tek başına garanti değil: broker yazmadan çökebilir. Emin olmak için publisher confirms kullan.", "Persistent alone is no guarantee: the broker can crash before writing. Use publisher confirms to be sure."),
  ],
  quiz: [
    {
      question: l("Durable bir kuyrukta geçici (transient) bir mesaj var. Broker yeniden başlarsa?", "A durable queue holds a transient message. What happens on a restart?"),
      options: [l("Mesaj kalır", "The message stays"), l("Kuyruk kalır, mesaj gider", "The queue stays, the message goes"), l("İkisi de gider", "Both go"), l("Mesaj başka kuyruğa taşınır", "The message moves to another queue")],
      answer: 1,
      explain: l("Durable sadece kuyruğun tanımını korur. Mesajın da kalması için persistent olması gerekir.", "Durable only keeps the queue's definition. The message also has to be persistent."),
      reviewStep: 2,
    },
    {
      question: l("Geçici bir kuyruğa persistent mesaj gönderildi. Restart'tan sonra?", "A persistent message was sent to a transient queue. After a restart?"),
      options: [l("Mesaj kalır, kuyruk yeniden oluşur", "The message stays and the queue comes back"), l("Kuyruk ve mesaj gider", "Queue and message are both gone"), l("Mesaj default kuyruğa geçer", "The message moves to a default queue"), l("Broker başlamaz", "The broker does not start")],
      answer: 1,
      explain: l("Kuyruk silinince içindeki her mesaj da gider, persistent olsa bile.", "When the queue is deleted, every message in it goes too, persistent or not."),
      reviewStep: 4,
    },
    {
      question: l("Quorum queue'da `delivery_mode` ayarlanmamış bir mesaj restart'ta ne olur?", "What happens on a restart to a message in a quorum queue that had no `delivery_mode` set?"),
      options: [l("Kaybolur", "It is lost"), l("Kalır", "It stays"), l("Dead letter olur", "It is dead-lettered"), l("Producer'a döner", "It goes back to the producer")],
      answer: 1,
      explain: l("Quorum queue'lar her mesajı diske yazar ve kopyalar.", "Quorum queues write and replicate every message."),
      reviewStep: 6,
    },
    {
      question: l("Persistent mesaj gönderdin ve broker hemen çöktü. Mesajın kaydedildiğinden nasıl emin olursun?", "You sent a persistent message and the broker crashed right after. How do you know the message was stored?"),
      options: [l("Emin olamazsın, sadece umarsın", "You cannot, you just hope"), l("Publisher confirm'i beklersin", "You wait for the publisher confirm"), l("Kuyruğu durable yaparsın", "You make the queue durable"), l("Mesajı iki kez gönderirsin", "You send it twice")],
      answer: 1,
      explain: l("Broker mesajı güvenle sakladığında confirm gönderir. Confirm gelmediyse mesajı yeniden göndermen gerekir.", "The broker sends a confirm once the message is safely stored. No confirm means you must send it again."),
      reviewStep: 7,
    },
  ],
};
