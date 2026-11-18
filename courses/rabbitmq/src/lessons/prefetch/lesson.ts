import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const prefetch: Lesson = {
  slug: "prefetch",
  title: l("Prefetch ve iş kuyrukları", "Prefetch and work queues"),
  summary: l(
    "Bir işçi aynı anda kaç mesaj tutmalı? Sınır yokken yavaş işçinin işleri nasıl istiflediğini, `prefetch_count=1` ile adil dağıtımı ve hız ile adalet arasındaki dengeyi gör.",
    "How many messages should a worker hold at once? See a slow worker hoard jobs with no limit, fair dispatch with `prefetch_count=1`, and the trade-off between speed and fairness.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Sınırsız prefetch'te işlerin işçi hızına bakılmadan dağıldığını görmek", "See jobs handed out regardless of speed with unlimited prefetch"), step: 1 },
    { text: l("Yavaş işçinin işleri istiflerken hızlının boşta kaldığını görmek", "See the fast worker idle while the slow one hoards"), step: 2 },
    { text: l("`prefetch_count=1` ile adil dağıtımı kurmak", "Set up fair dispatch with `prefetch_count=1`"), step: 5 },
    { text: l("Büyük prefetch'in hız kazandırdığını görmek", "See a bigger prefetch buy throughput"), step: 6 },
  ],
  steps: [
    {
      short: l("İki işçi", "Two workers"),
      tag: "how",
      title: l("Biri hızlı, biri yavaş", "One fast, one slow"),
      body: [
        l(
          "`jobs` kuyruğunu iki işçi dinliyor. Hızlı işçi bir turda 3 iş bitirebiliyor. Yavaş işçi ise elindeki işte takılıp kalıyor; ağır bir rapor üretiyor, diyelim.",
          "Two workers listen to the `jobs` queue. The fast one can finish 3 jobs a tick. The slow one gets stuck on whatever it holds; say it is building a heavy report.",
        ),
        l(
          "İkisi de [[prefetch]] sınırı olmadan bağlı: broker onlara istediği kadar onaylanmamış mesaj verebilir. Varsayılan budur.",
          "Both are connected with no [[prefetch]] limit: the broker may give them as many unacked messages as it likes. That is the default.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_consumers", note: l("`prefetch_count` sütunu 0 ise sınır yok.", "A `prefetch_count` of 0 means no limit.") }],
      },
    },
    {
      short: l("Dağıtım", "Dispatch"),
      tag: "experiment",
      predict: {
        question: l("Sınır yokken 8 iş gelecek. Broker bunları iki işçiye nasıl dağıtır?", "With no limit, 8 jobs arrive. How does the broker share them out?"),
        options: [
          l("Hızlıya daha çok, çünkü daha hızlı", "More to the fast one, because it is faster"),
          l("İkisine 4'er tane, sırayla", "4 each, in turn"),
          l("Hepsi ilk bağlanana", "All to whichever connected first"),
        ],
        answer: 1,
        why: l(
          "Broker işçilerin hızını bilmez; sadece sırayla verir. Sınır olmadığı için işler gelir gelmez işçilere itilir: 4 ve 4.",
          "The broker does not know how fast a worker is; it just takes turns. With no limit, jobs are pushed out as soon as they arrive: 4 and 4.",
        ),
      },
      title: l("Sırayla dağıtım, hıza bakmadan", "Taking turns, blind to speed"),
      body: [
        l(
          "8 iş geldi ve broker her birini hemen bir işçiye itti: dörder tane. Kuyrukta bekleyen hiçbir şey kalmadı; işler artık işçilerin elinde.",
          "8 jobs arrived and the broker pushed each one straight to a worker: four each. Nothing waits in the queue; the jobs are in the workers' hands now.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged", note: l("`messages_ready` 0, ama `messages_unacknowledged` 8: hepsi işçilerde.", "`messages_ready` is 0 but `messages_unacknowledged` is 8: all with the workers.") }],
      },
    },
    {
      short: l("İstif", "Hoarding"),
      tag: "problem",
      predict: {
        question: l("İki tur geçecek. O zaman ne görürüz?", "Two ticks will pass. What do we see then?"),
        options: [
          l("İkisi de işini bitirmiş olur", "Both have finished their jobs"),
          l("Hızlı boşta bekler, yavaşın elinde 4 iş durur", "The fast one sits idle; the slow one still holds 4 jobs"),
          l("Hızlı, yavaşın işlerini kendisi alır", "The fast one takes over the slow one's jobs"),
        ],
        answer: 1,
        why: l(
          "İşler yavaş işçiye bir kez verildi; o onları bitirmeden ya da bağlantısı kopmadan başka kimse alamaz. Hızlı işçi kendi 4 işini bitirip boşa düşer.",
          "The jobs were handed to the slow worker; nobody else can take them until it finishes or disconnects. The fast one finishes its own 4 and goes idle.",
        ),
      },
      title: l("Yavaş işçi işleri istifler", "The slow worker hoards"),
      body: [
        l(
          "İki turda hızlı işçi kendi 4 işini bitirdi ve şimdi boşta. Yavaş işçinin elinde ise hâlâ 4 iş var ve sayaç kırmızı.",
          "In two ticks the fast worker finished its 4 jobs and is now idle. The slow one still sits on 4 jobs, and the counter is red.",
        ),
        l(
          "Bu iş kuyruklarında sık görülen bir sorun: kuyruk boş görünür ama işler bir işçinin elinde bekler ve müşteri yine bekler.",
          "This is a common problem in work queues: the queue looks empty, yet jobs are stuck in one worker's hands, and customers still wait.",
        ),
      ],
    },
    {
      short: l("prefetch=1", "prefetch=1"),
      tag: "idea",
      title: l("Çözüm: aynı anda en fazla bir iş", "The fix: at most one job at a time"),
      body: [
        l(
          "İki işçi ayrılıp `prefetch_count=1` ile yeniden bağlandı. Yavaş işçi ayrılınca elindeki 4 iş kuyruğa geri döndü.",
          "Both workers disconnected and reconnected with `prefetch_count=1`. When the slow one left, its 4 jobs went back to the queue.",
        ),
        l(
          "Artık broker her işçiye **onaylanmamış en fazla bir** iş verir. İkisi birer iş aldı; geri kalanlar kuyrukta bekliyor.",
          "Now the broker gives each worker **at most one unacked** job. Each took one; the rest wait in the queue.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Python · prefetch",
            code: 'ch.basic_qos(prefetch_count=1)\nch.basic_consume(queue="jobs", on_message_callback=handle)',
            note: l("`basic_qos`, `basic_consume`'dan **önce** çağrılmalı.", "Call `basic_qos` **before** `basic_consume`."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("Yeni işler", "More jobs"),
      tag: "how",
      title: l("İşler kuyrukta bekler", "Jobs wait in the queue"),
      body: [
        l(
          "4 iş daha geldi. İki işçinin de eli dolu olduğu için işler artık işçilere itilmiyor, **kuyrukta** bekliyor.",
          "4 more jobs arrived. Both workers' hands are full, so the jobs are no longer pushed out; they wait **in the queue**.",
        ),
        l(
          "Bu iyi bir şey: kuyrukta bekleyen iş, ilk boşalan işçiye gidebilir. Bir işçinin elinde bekleyen iş ise sadece ona aittir.",
          "That is a good thing: a job waiting in the queue can go to whichever worker frees up first. A job waiting in a worker's hands belongs to that worker only.",
        ),
      ],
    },
    {
      short: l("Adil", "Fair"),
      tag: "experiment",
      predict: {
        question: l("Dört tur geçecek. Sonunda yavaş işçinin elinde kaç iş olur?", "Four ticks will pass. How many jobs does the slow worker hold at the end?"),
        options: [l("1", "1"), l("4", "4"), l("6", "6")],
        answer: 0,
        why: l(
          "prefetch 1 ile yavaş işçi hiçbir zaman birden fazla iş tutamaz. Diğer işleri, bitirdikçe yenisini alan hızlı işçi yapar.",
          "With prefetch 1 the slow worker can never hold more than one job. The fast worker does the others, taking a new one as it finishes each.",
        ),
      },
      title: l("Boşalan alır", "Whoever is free takes it"),
      body: [
        l(
          "Her turda hızlı işçi bir işi bitirdi, ack gönderdi ve hemen kuyruktaki sıradakini aldı. Dört turda 4 iş bitirdi. Yavaş işçinin elinde ise hep tek iş var.",
          "Every tick the fast worker finished a job, acked it and took the next one from the queue. Four ticks, four jobs. The slow worker never holds more than one.",
        ),
        l(
          "Buna **fair dispatch** (adil dağıtım) denir. Ama bir bedeli var: hızlı işçi aslında turda 3 iş yapabilirken prefetch 1 yüzünden her işten sonra yenisini beklemek zorunda kaldı.",
          "This is called **fair dispatch**. But it has a cost: the fast worker could do 3 jobs a tick, yet with prefetch 1 it had to wait for a new one after each.",
        ),
      ],
    },
    {
      short: l("Daha büyük", "Bigger"),
      tag: "how",
      predict: {
        question: l("Hızlı işçi prefetch 3 ile yeniden bağlanacak. Turda kaç iş bitirir?", "The fast worker will reconnect with prefetch 3. How many jobs does it finish per tick?"),
        options: [l("1", "1"), l("3", "3"), l("6", "6")],
        answer: 1,
        why: l(
          "Elinde aynı anda 3 iş tutabildiği için bir turda 3'ünü birden bitirebilir: kendi hızına ulaştı.",
          "It can now hold 3 jobs at once, so it finishes all 3 in a tick: it reaches its real speed.",
        ),
      },
      title: l("Büyük prefetch: daha hızlı, daha az adil", "A bigger prefetch: faster, less fair"),
      body: [
        l(
          "Hızlı işçi prefetch 3 ile bağlandı. Artık her turda 3 iş bitiriyor: iki turda 6 iş.",
          "The fast worker reconnected with prefetch 3. Now it finishes 3 jobs a tick: 6 in two ticks.",
        ),
        l(
          "Gerçek ağda her mesajın gelmesi zaman alır; işçinin elinde birkaç mesaj hazır beklemesi onu boşta bırakmaz. Ama aynı sınır yavaş bir işçiye de verilirse o da birkaç iş istifler. Doğru değer işin süresine ve işçi sayısına bağlı.",
          "On a real network every delivery takes time; having a few messages ready keeps the worker busy. But the same limit lets a slow worker hoard a few too. The right value depends on how long the work takes and how many workers there are.",
        ),
      ],
      practice: {
        snippets: [{ label: "Python · daha yüksek prefetch", code: "ch.basic_qos(prefetch_count=50)" }],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Prefetch'i nasıl seçmeli?", "How to choose a prefetch"),
      body: [
        l(
          "Her iş uzun sürüyorsa (saniyeler, dakikalar) küçük bir değer, hatta 1 seç: işler adil dağılır. İşler çok kısaysa (milisaniyeler) daha büyük bir değer seç: işçi ağ beklemeden çalışır. RabbitMQ belgeleri çoğu durumda 100 ile 300 arasının iyi verim verdiğini söyler; kendi işinde ölçerek karar ver.",
          "If each job is long (seconds, minutes), pick a small value, even 1: work is shared fairly. If jobs are very short (milliseconds), pick a bigger one so the worker never waits on the network. The RabbitMQ docs say values in the 100 to 300 range usually give good throughput; measure with your own workload.",
        ),
        l(
          "Sınırsız prefetch (0) neredeyse hiçbir zaman iyi bir fikir değil: çok mesaj gelirse işçinin belleği dolar ve yavaş işçiler istifler.",
          "Unlimited prefetch (0) is almost never a good idea: under load the worker's memory fills up and slow workers hoard.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Prefetch sadece manuel ack'te işe yarar. auto-ack'te broker mesajı teslim ettiği an unuttuğu için \"onaylanmamış\" mesaj yoktur ve prefetch hiçbir şeyi sınırlamaz.",
            "Prefetch only works with manual acks. With auto-ack the broker forgets a message on delivery, so there is nothing \"unacked\" and prefetch limits nothing.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Bu sahnede işçi hızları turla ölçülür ve ağ gecikmesi yok. Gerçekte prefetch'in verime etkisi, mesajın ağda gidip gelme süresine göre değişir.",
            "Worker speeds here are counted in ticks, with no network delay. In reality how much prefetch helps throughput depends on the round-trip time on the network.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker exec rabbitmq rabbitmqctl list_consumers queue_name consumer_tag ack_required prefetch_count", note: l("Hangi consumer'ın hangi prefetch ile bağlı olduğunu gösterir.", "Shows which consumer is connected with which prefetch.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Hızlı (turda 3 iş) ve yavaş (elindekinde takılan) iki işçi, sınırsız prefetch ile bağlı. İş gönderebilir, işçileri ayırıp prefetch 1 ya da sınırsız ile yeniden bağlayabilir ve zamanı ilerletebilirsin.",
          "A fast worker (3 jobs a tick) and a slow one (stuck on what it holds) are connected with no prefetch limit. Send jobs, disconnect and reconnect a worker with prefetch 1 or no limit, and move time.",
        ),
        l("Sahnenin altında **3 görev** var.", "Under the scene there are **3 missions**."),
      ],
    },
  ],
  recap: [
    l("Prefetch, bir işçinin aynı anda tutabileceği onaylanmamış mesaj sayısıdır (`basic_qos`).", "Prefetch is how many unacked messages a worker may hold at once (`basic_qos`)."),
    l("Sınır yoksa broker işleri hıza bakmadan sırayla iter; yavaş işçi işleri istifler, hızlı olan boşta kalır.", "With no limit the broker pushes jobs in turn, blind to speed; the slow worker hoards and the fast one idles."),
    l("`prefetch_count=1` adil dağıtım verir: işler kuyrukta bekler ve ilk boşalan işçi alır.", "`prefetch_count=1` gives fair dispatch: jobs wait in the queue and the first free worker takes them."),
    l("Büyük prefetch verimi artırır ama adaleti azaltır; doğru değeri iş süresine göre ölçerek seç.", "A bigger prefetch raises throughput but lowers fairness; measure to pick the right value."),
    l("Prefetch auto-ack'te hiçbir şeyi sınırlamaz.", "Prefetch limits nothing with auto-ack."),
  ],
  quiz: [
    {
      question: l(
        "İki işçi sınırsız prefetch ile bağlı; biri diğerinden 10 kat yavaş. 20 iş gelirse yavaş işçiye kaç tanesi gider?",
        "Two workers with unlimited prefetch; one is 10 times slower. If 20 jobs arrive, how many go to the slow one?",
      ),
      options: [l("2", "2"), l("10", "10"), l("18", "18"), l("0", "0")],
      answer: 1,
      explain: l("Sınır yokken broker sırayla iter ve hıza bakmaz: yarısı, yani 10 tanesi.", "With no limit the broker takes turns and ignores speed: half, so 10."),
      reviewStep: 1,
    },
    {
      question: l("Uzun süren işler için hangi prefetch daha adil dağıtım sağlar?", "For long-running jobs, which prefetch shares work more fairly?"),
      options: [l("0 (sınırsız)", "0 (unlimited)"), l("1", "1"), l("1000", "1000"), l("Fark etmez", "It makes no difference")],
      answer: 1,
      explain: l("prefetch 1 ile işler kuyrukta bekler ve boşalan işçi alır.", "With prefetch 1, jobs wait in the queue and whichever worker is free takes them."),
      reviewStep: 5,
    },
    {
      question: l("auto-ack ile bağlanan bir consumer'da `prefetch_count=1` ne yapar?", "What does `prefetch_count=1` do for a consumer using auto-ack?"),
      options: [
        l("Aynı anda tek mesaj alır", "It gets one message at a time"),
        l("Hiçbir şey: onaylanmamış mesaj olmadığı için sınır işlemez", "Nothing: with no unacked messages, the limit does not apply"),
        l("Mesajları iki kez teslim eder", "It delivers messages twice"),
        l("Bağlantıyı reddeder", "It refuses the connection"),
      ],
      answer: 1,
      explain: l("Prefetch onaylanmamış mesajları sayar. auto-ack'te broker mesajı teslim ettiği an unutur.", "Prefetch counts unacked messages. With auto-ack the broker forgets a message on delivery."),
      reviewStep: 7,
    },
    {
      question: l(
        "İşler milisaniyeler sürüyor ve işçiler hep ağdan yeni mesaj bekliyor. Ne yapmalı?",
        "Jobs take milliseconds and workers keep waiting on the network for the next message. What should you do?",
      ),
      options: [l("Prefetch'i 1'e indir", "Lower prefetch to 1"), l("Prefetch'i büyüt", "Raise prefetch"), l("auto-ack'e geç", "Switch to auto-ack"), l("Kuyruğu sil", "Delete the queue")],
      answer: 1,
      explain: l("Daha büyük prefetch işçinin elinde birkaç mesaj hazır tutar ve ağ beklemesini gizler.", "A bigger prefetch keeps a few messages ready in the worker's hands and hides the network wait."),
      reviewStep: 6,
    },
  ],
};
