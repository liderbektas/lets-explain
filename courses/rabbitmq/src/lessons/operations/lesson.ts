import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const DX = "docker exec rabbitmq";
const QUEUES = `${DX} rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers`;

const CONN = `import pika

# Open once when the app starts, and keep it.
conn = pika.BlockingConnection(pika.ConnectionParameters("localhost", heartbeat=30))
ch = conn.channel()          # one channel per thread; pika connections are not thread-safe

def send(order):
    ch.basic_publish(exchange="", routing_key="orders", body=order)

# Wrong: a new connection for every message
# def send(order):
#     with pika.BlockingConnection(...) as c:
#         c.channel().basic_publish(...)`;

const CONF = `# rabbitmq.conf
vm_memory_high_watermark.relative = 0.6
disk_free_limit.absolute = 2GB`;

export const operations: Lesson = {
  slug: "operations",
  title: l("İşletmek", "Running it"),
  summary: l(
    "Bir kuyruğun sağlığını üç sayıdan oku: hazır, onay bekleyen, consumer. Bağlantıları doğru kullan, alarmları tanı, izlemeyi kur ve kendi projen için bir kontrol listesiyle bitir.",
    "Read a queue's health from three numbers: ready, unacked, consumers. Use connections well, know the alarms, set up monitoring and leave with a checklist for your own project.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Büyüyen ready'nin yavaş consumer demek olduğunu görmek", "See that growing ready means consumers are too slow"), step: 2 },
    { text: l("Düşmeyen unacked ile takılan consumer'ı bulmak", "Find a stuck consumer from unacked that never drops"), step: 4 },
    { text: l("Consumer sayısı 0'ı bir alarm olarak tanımak", "Treat a consumer count of 0 as an alarm"), step: 6 },
    { text: l("Bellek ve disk alarmlarının producer'ları durdurduğunu bilmek", "Know that memory and disk alarms stop producers"), step: 8 },
    { text: l("Kendi projen için izleme ve kontrol listesini kurmak", "Set up monitoring and a checklist for your project"), step: 9 },
  ],
  steps: [
    {
      short: l("Üç sayı", "Three numbers"),
      tag: "how",
      title: l("Bir kuyruğun sağlığı üç sayıda", "A queue's health in three numbers"),
      body: [
        l(
          "Gerçek bir sistemde içeriyi göremezsin; sayılara bakarsın. Bir kuyruk için en önemli üçü üstteki sayaçlarda: **hazır** (ready), **onay bekleyen** (unacked) ve **consumer** sayısı.",
          "In a real system you cannot see inside; you look at numbers. For a queue the three that matter are in the counters on top: **ready**, **unacked** and the **consumer** count.",
        ),
        l(
          "Bu derste bir mağaza ve tick başına bir sipariş bitiren İşçi 1 var. Her işçi aynı anda en fazla 2 sipariş tutuyor (prefetch 2). Sayıların hangi durumda ne söylediğini sırayla göreceğiz.",
          "This lesson has a shop and Worker 1, which finishes one order per tick. Each worker holds at most 2 orders at once (prefetch 2). We will see what the numbers say in each situation.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Yönetim panelinde (http://localhost:15672) **Queues** sekmesi aynı sayıları gösterir: Ready, Unacked, Total ve Consumers. Tick'ler burada sadeleştirme: gerçekte işçiler saniyede belli sayıda mesaj bitirir.",
            "In the management UI (http://localhost:15672) the **Queues** tab shows the same numbers: Ready, Unacked, Total and Consumers. Ticks are a simplification here: real workers finish some messages per second.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: QUEUES, note: l("Her kuyruk için hazır, onay bekleyen ve consumer sayısı.", "Ready, unacked and consumer count for every queue.") },
          { cmd: `${DX} rabbitmq-diagnostics check_running`, note: l("Broker çalışıyor mu? Sağlık kontrollerinde kullanılır.", "Is the broker running? Used in health checks.") },
        ],
      },
    },
    {
      short: l("Sağlıklı", "Healthy"),
      tag: "how",
      title: l("Sağlıklı hali: kuyruk boş kalıyor", "Healthy: the queue stays empty"),
      body: [
        l(
          "İki sipariş geldi ve İşçi 1 ikisini de iki tick içinde bitirdi. Hazır 0, onay bekleyen 0: işçi trafiğe yetişiyor.",
          "Two orders came in and Worker 1 finished both within two ticks. Ready 0, unacked 0: the worker keeps up with traffic.",
        ),
        l(
          "Sağlıklı bir kuyruk çoğu zaman boşa yakındır. Kuyruk bir depo değil, bir **tampon**: kısa dalgalanmaları yutar, sonra boşalır.",
          "A healthy queue is usually close to empty. A queue is not storage but a **buffer**: it absorbs short spikes, then drains.",
        ),
      ],
      practice: {
        commands: [{ cmd: QUEUES }],
      },
    },
    {
      short: l("Dalga", "Spike"),
      tag: "experiment",
      predict: {
        question: l(
          "İşçi 1 tick başına 1 sipariş bitiriyor ve aynı anda en fazla 2 tutuyor. Birden 6 sipariş geldi; 2 tick geçecek. Sonra kuyrukta kaç sipariş **hazır** bekler?",
          "Worker 1 finishes 1 order per tick and holds at most 2. Suddenly 6 orders arrive; 2 ticks will pass. How many are then **ready** in the queue?",
        ),
        options: [l("0", "0"), l("2", "2"), l("6", "6")],
        answer: 1,
        why: l(
          "İşçi 2'sini eline aldı, kalan 4'ü bekledi. 2 tick'te 2'sini bitirdi ve yerine 2 yenisini aldı: elinde 2, kuyrukta 2 kaldı. Ready büyüyorsa consumer'lar yetişmiyor demektir.",
          "The worker took 2 and 4 waited. In 2 ticks it finished 2 and took 2 more: 2 in its hands, 2 still waiting. Growing ready means consumers cannot keep up.",
        ),
      },
      title: l("Ready büyüyorsa: işçiler yetişemiyor", "Ready growing: workers cannot keep up"),
      body: [
        l(
          "Altı sipariş birden geldi. İşçi 1 yine tick başına bir tane bitiriyor; iki tick sonra elinde 2, kuyrukta 2 sipariş bekliyor.",
          "Six orders came at once. Worker 1 still finishes one per tick; after two ticks it holds 2 and 2 more wait in the queue.",
        ),
        l(
          "Tek başına bir sayı değil, **eğilim** önemli. Ready kısa süre yükselip düşüyorsa sorun yok. Dakikalarca artıyorsa gelen iş, bitirilenden fazla demektir.",
          "What matters is not one number but the **trend**. Ready rising briefly and falling is fine. Rising for minutes means more work comes in than gets done.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${DX} rabbitmqctl list_queues name messages_ready`, note: l("Birkaç dakika arayla çalıştır: sayı hep artıyorsa alarm.", "Run it a few minutes apart: if the number keeps rising, alarm.") }],
      },
    },
    {
      short: l("Ölçekle", "Scale out"),
      tag: "how",
      title: l("Çözüm: bir işçi daha", "The fix: one more worker"),
      body: [
        l(
          "İşçi 2 bağlandı ve bekleyen iki siparişi aldı. İki işçi tick başına iki sipariş bitiriyor; iki tick sonra kuyruk boş.",
          "Worker 2 connected and took the two waiting orders. Two workers finish two per tick; two ticks later the queue is empty.",
        ),
        l(
          "Work queue'nun güzelliği bu: ölçeklemek için kod değiştirmezsin, aynı consumer'dan bir tane daha çalıştırırsın.",
          "That is the beauty of a work queue: to scale you do not change code, you run another copy of the same consumer.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker compose up -d --scale worker=3", note: l("Docker Compose ile aynı işçiden 3 tane çalıştırmak (servis adı `worker` ise).", "Run 3 of the same worker with Docker Compose (if the service is named `worker`).") },
          { cmd: `${DX} rabbitmqctl list_consumers`, note: l("Hangi kuyruğu kaç consumer'ın dinlediğini ve prefetch değerlerini gösterir.", "Shows which consumers listen to which queue, with their prefetch.") },
        ],
      },
    },
    {
      short: l("Takılan", "Stuck"),
      tag: "experiment",
      predict: {
        question: l(
          "Üçüncü bir işçi bağlandı ama kodu bir yerde takıldı: hiç ack göndermiyor. Bunu hangi sayı ele verir?",
          "A third worker connected, but its code is stuck somewhere: it never acks. Which number gives it away?",
        ),
        options: [
          l("Consumer sayısı 0'a düşer", "The consumer count drops to 0"),
          l("Onay bekleyen (unacked) düşmez, consumer bağlı görünür", "Unacked never drops while the consumer looks connected"),
          l("Hiçbiri; takılan işçi görünmez", "None; a stuck worker is invisible"),
        ],
        answer: 1,
        why: l(
          "Takılan işçi bağlı kaldığı için consumer sayısı normal görünür. Ama aldığı siparişleri hiç bitirmez: onay bekleyen sayısı yerinde sayar.",
          "The stuck worker stays connected, so the consumer count looks normal. But it never finishes what it took: unacked stays flat.",
        ),
      },
      title: l("Unacked düşmüyorsa: takılan consumer", "Unacked not dropping: a stuck consumer"),
      body: [
        l(
          "İşçi 3 bağlandı, kendisine düşen siparişi aldı ve sonra hiçbir şey yapmadı. İşçi 1 ve 2 kendilerine düşenleri bitirdi; İşçi 3'ün elindeki sipariş orada bekliyor.",
          "Worker 3 connected, took the order that fell to it and then did nothing. Workers 1 and 2 finished theirs; the one in Worker 3's hands just sits there.",
        ),
        l(
          "Bu en sinsi arıza: kuyruk sağlıklı görünür, consumer sayısı normal, ama bazı siparişler hiç bitmez. İzlerken **unacked'in zaman içinde düşüp düşmediğine** bak.",
          "This is the sneakiest failure: the queue looks healthy and the consumer count is normal, but some orders never finish. When monitoring, check whether **unacked drops over time**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "RabbitMQ, bir mesaj çok uzun süre ack'lenmezse kanalı kapatır (`consumer_timeout`, varsayılan 30 dakika). Böylece takılan consumer'ın elindeki mesajlar kuyruğa döner.",
            "RabbitMQ closes a channel whose message stays unacked too long (`consumer_timeout`, 30 minutes by default). That hands a stuck consumer's messages back to the queue.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: `${DX} rabbitmqctl list_channels connection number consumer_count messages_unacknowledged prefetch_count`, note: l("Kanal başına onay bekleyen mesaj: hep aynı kalan kanal, takılan consumer'dır.", "Unacked per channel: the one that never changes is the stuck consumer.") }],
      },
    },
    {
      short: l("Yeniden başlat", "Restart"),
      tag: "how",
      title: l("Takılanı durdur: elindekiler geri döner", "Stop the stuck one: its work comes back"),
      body: [
        l(
          "İşçi 3'ü durdurduk (sahnede \"çökert\"). Ack'lenmemiş siparişi kuyruğa döndü ve İşçi 1 ile 2 onu bitirdi. Hiçbir sipariş kaybolmadı.",
          "We stopped Worker 3 (\"crash\" on stage). Its unacked order went back to the queue, and Workers 1 and 2 finished it. No order was lost.",
        ),
        l(
          "Manual ack'in burada iki kez işe yaradığını gör: takılan işçiyi öldürmek güvenli, çünkü bitmemiş iş kaybolmuyor.",
          "Notice manual acks paying off twice here: killing the stuck worker is safe, because unfinished work is not lost.",
        ),
      ],
      practice: {
        commands: [{ cmd: QUEUES }],
      },
    },
    {
      short: l("Sıfır consumer", "Zero consumers"),
      tag: "problem",
      predict: {
        question: l(
          "Bütün işçiler gitti ve 3 sipariş daha geldi. Mağaza bundan ne anlar?",
          "Every worker is gone and 3 more orders arrive. What does the shop notice?",
        ),
        options: [
          l("Hata alır, gönderemez", "It gets an error and cannot send"),
          l("Hiçbir şey: siparişler kuyrukta birikir", "Nothing: the orders pile up in the queue"),
          l("Siparişler kaybolur", "The orders are lost"),
        ],
        answer: 1,
        why: l(
          "Producer'ın işi bitti: broker siparişleri aldı ve kuyrukta tutuyor. Kimse işlemiyor ama gönderen bunu bilmez. Bu yüzden \"consumer sayısı 0\" için ayrı bir alarm gerekir.",
          "The producer's job is done: the broker took the orders and holds them. Nobody processes them, and the sender cannot tell. That is why \"0 consumers\" needs its own alarm.",
        ),
      },
      title: l("Consumer 0: sessiz felaket", "Zero consumers: the silent disaster"),
      body: [
        l(
          "İki işçi de çöktü. Gelen üç sipariş kuyrukta birikiyor; sayaçta \"Consumer 0\" kırmızı. Mağaza mutlu, çünkü gönderdi; ama hiçbir sipariş işlenmiyor.",
          "Both workers crashed. The three new orders pile up; the counter shows \"Consumers 0\" in red. The shop is happy because it sent them, but nothing is being processed.",
        ),
        l(
          "Mesajlaşmanın en güçlü yanı (gönderen beklemez) burada zayıf yanı olur: bozulma uzun süre fark edilmeyebilir. İzleme bunu yakalamak için var.",
          "Messaging's strength (the sender does not wait) becomes a weakness here: a breakdown can go unnoticed for a long time. Monitoring exists to catch it.",
        ),
      ],
      practice: {
        commands: [{ cmd: `${DX} rabbitmqctl list_queues name consumers messages_ready`, note: l("`consumers` 0 olan her önemli kuyruk için alarm kur.", "Set an alarm for every important queue whose `consumers` is 0.") }],
      },
    },
    {
      short: l("Bağlantılar", "Connections"),
      tag: "reality",
      title: l("Bağlantıyı bir kez aç, kanalları paylaştır", "Open the connection once, share it through channels"),
      body: [
        l(
          "Bir bağlantı açmak pahalıdır: TCP, belki TLS, giriş ve görüşme. Her mesaj için yeni bağlantı açan uygulama, yük altında broker'ı binlerce bağlantıyla boğar.",
          "Opening a connection is expensive: TCP, maybe TLS, login and negotiation. An app that opens one per message chokes the broker with thousands of connections under load.",
        ),
        l(
          "Doğrusu: uygulama başlarken bir (ya da birkaç) bağlantı aç ve açık tut. İş parçacığı başına bir **kanal** kullan; kanallar aynı bağlantının içinde ucuz, hafif yollar.",
          "Instead: open one (or a few) connections when the app starts and keep them. Use one **channel** per thread; channels are cheap, light lanes inside the same connection.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "pika'nın `BlockingConnection`'ı thread-safe değildir: aynı bağlantıyı birden fazla iş parçacığından kullanma. Her iş parçacığı kendi kanalını (gerekirse kendi bağlantısını) almalı.",
            "pika's `BlockingConnection` is not thread-safe: do not use one connection from several threads. Each thread needs its own channel (and if needed its own connection).",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: `${DX} rabbitmqctl list_connections name state channels`, note: l("Sayısı sürekli artan ya da çok sayıda kısa ömürlü bağlantı varsa, bir uygulama her mesajda bağlantı açıyor demektir.", "A constantly growing count, or many short-lived connections, means some app opens one per message.") }],
        snippets: [{ label: "Python · bağlantıyı açık tut", code: CONN }],
      },
    },
    {
      short: l("Alarmlar", "Alarms"),
      tag: "reality",
      predict: {
        question: l(
          "Broker'ın belleği sınırı aştı ve bellek alarmı çaldı. Hangisi durur?",
          "The broker's memory went past its limit and the memory alarm fired. What stops?",
        ),
        options: [
          l("Consumer'lar mesaj alamaz", "Consumers cannot receive"),
          l("Producer'ların yayını bloklanır, consumer'lar devam eder", "Producers are blocked; consumers keep going"),
          l("Broker kendini kapatır", "The broker shuts itself down"),
        ],
        answer: 1,
        why: l(
          "Alarm çalınca RabbitMQ yayın yapan bağlantıları bloklar (`connection.blocked`), ama consumer'lara mesaj vermeye devam eder. Kuyruklar boşaldıkça bellek düşer ve alarm söner.",
          "When an alarm fires RabbitMQ blocks publishing connections (`connection.blocked`) but keeps delivering to consumers. As queues drain, memory falls and the alarm clears.",
        ),
      },
      title: l("Bellek ve disk alarmları producer'ları durdurur", "Memory and disk alarms stop producers"),
      body: [
        l(
          "RabbitMQ kendini korur. Bellek kullanımı sınırı (varsayılan: makinenin belleğinin %60'ı) ya da boş disk sınırın (varsayılan 50MB) altına düşünce bir **alarm** çalar.",
          "RabbitMQ protects itself. When memory use passes its limit (60% of the machine's memory by default) or free disk drops below its limit (50MB by default), an **alarm** fires.",
        ),
        l(
          "Alarm sırasında producer'lar bloklanır: `basic_publish` beklemeye başlar. Consumer'lar çalışmaya devam eder, çünkü alarmı söndürecek olan onlardır. Uygulaman bu durumda donmuş gibi görünebilir; nedeni bu.",
          "During an alarm producers are blocked: `basic_publish` starts to wait. Consumers keep working, because they are what clears the alarm. Your app may look frozen; this is why.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Varsayılan 50MB disk sınırı üretim için çok düşük; RabbitMQ belgeleri bunu yükseltmeyi önerir. 3.12'den beri classic queue'lar mesajları zaten diske yazıp bellekte az tutar; eski `lazy` kuyruk ayarı artık etkisiz. Bu sahnede alarm modellenmedi, çizim temsilî.",
            "The default 50MB disk limit is too low for production; RabbitMQ's docs recommend raising it. Since 3.12 classic queues already write messages to disk and keep little in memory; the old `lazy` queue setting no longer does anything. Alarms are not simulated here; the drawing is illustrative.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: `${DX} rabbitmq-diagnostics check_local_alarms`, note: l("Bu node'da alarm var mı? Yoksa başarılı döner.", "Any alarm on this node? Succeeds when there is none.") },
          { cmd: `${DX} rabbitmq-diagnostics memory_breakdown`, note: l("Belleğin nereye gittiğini gösterir (kuyruklar, bağlantılar…).", "Shows where memory goes (queues, connections…).") },
        ],
        snippets: [{ label: "rabbitmq.conf", code: CONF, note: l("Bellek sınırını oranla, disk sınırını mutlak bir değerle ayarla.", "Set the memory limit as a ratio and the disk limit as an absolute value.") }],
      },
    },
    {
      short: l("İzleme", "Monitoring"),
      tag: "how",
      title: l("İzleme ve kontrol listesi", "Monitoring and a checklist"),
      body: [
        l(
          "Komutları elle çalıştırmak bir başlangıç; gerçek sistemde sayıları sürekli toplarsın. RabbitMQ'nun `rabbitmq_prometheus` eklentisi metrikleri 15692 portunda Prometheus biçiminde sunar; Grafana ile panoya dökersin.",
          "Running commands by hand is a start; a real system collects the numbers all the time. RabbitMQ's `rabbitmq_prometheus` plugin serves metrics on port 15692 in Prometheus format; Grafana turns them into dashboards.",
        ),
        l(
          "Sahnedeki liste, bu kurstan kendi projene götüreceklerinin özeti. Alarmlar: büyüyen ready, 0 consumer, düşmeyen unacked, bellek ve disk alarmları.",
          "The list on stage sums up what to take from this course into your own project. Alerts: growing ready, 0 consumers, unacked that never drops, memory and disk alarms.",
        ),
      ],
      practice: {
        commands: [
          { cmd: `${DX} rabbitmq-plugins enable rabbitmq_prometheus`, note: l("Eklenti kapalıysa açar.", "Enables the plugin if it is off.") },
          { cmd: "curl -s localhost:15692/metrics | head", note: l("Prometheus'un toplayacağı metrikler. Docker'da `-p 15692:15692` ile portu açman gerekir.", "The metrics Prometheus will scrape. In Docker, publish the port with `-p 15692:15692`.") },
          { cmd: `${DX} rabbitmq-diagnostics status`, note: l("Sürüm, bellek, disk, açık dosyalar ve alarmlar: genel durum.", "Version, memory, disk, open files and alarms: the overall picture.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda nöbetten **4 senaryo** var: tüketicisiz kalmış bir kuyruk, ack göndermeyen bir işçi, yetişemeyen işçiler ve temizlenmesi gereken bir test kuyruğu. Her birinde önce ölç, sonra müdahale et.",
          "Your turn. Below are **4 scenarios** from being on call: a queue left without consumers, a worker that never acks, workers that can't keep up, and a test queue to clean out. In each, measure first, then act.",
        ),
        l(
          "`rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers` ile bak; işçiyi `python worker.py` ile başlat (birden fazla kez de olur), `pkill -f worker.py` ile durdur, `sleep` ile zamanı ilerlet.",
          "Look with `rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers`; start the worker with `python worker.py` (more than once if you like), stop it with `pkill -f worker.py`, move time on with `sleep`.",
        ),
      ],
    },
  ],
  recap: [
    l("Bir kuyruğun sağlığı üç sayıda: hazır (ready), onay bekleyen (unacked) ve consumer sayısı.", "A queue's health is three numbers: ready, unacked and the consumer count."),
    l("Ready sürekli artıyorsa consumer'lar yetişemiyor: aynı consumer'dan bir tane daha çalıştır.", "Ready that keeps rising means consumers cannot keep up: run another copy."),
    l("Unacked düşmüyorsa bir consumer takılmıştır; manual ack sayesinde onu yeniden başlatmak güvenlidir.", "Unacked that never drops means a stuck consumer; with manual acks restarting it is safe."),
    l("Consumer sayısı 0 sessiz bir felakettir: producer fark etmez, kuyruk büyür. Bunun için alarm kur.", "Zero consumers is a silent disaster: producers do not notice and the queue grows. Alert on it."),
    l("Bağlantıyı bir kez aç ve tut; iş parçacığı başına bir kanal kullan.", "Open a connection once and keep it; use one channel per thread."),
    l("Bellek (%60) ve disk (50MB) alarmları producer'ları bloklar; izlemeyi Prometheus (15692) ve Grafana ile kur.", "Memory (60%) and disk (50MB) alarms block producers; monitor with Prometheus (15692) and Grafana."),
  ],
  quiz: [
    {
      question: l(
        "Bir kuyrukta ready 10 dakikadır sürekli artıyor, unacked sabit ve consumer sayısı normal. En olası neden?",
        "A queue's ready has risen for 10 minutes, unacked is steady and the consumer count is normal. Most likely cause?",
      ),
      options: [
        l("Consumer'lar gelen işe yetişemiyor", "Consumers cannot keep up with incoming work"),
        l("Broker çöktü", "The broker crashed"),
        l("Producer durdu", "The producer stopped"),
        l("Mesajlar kayboluyor", "Messages are being lost"),
      ],
      answer: 0,
      explain: l("Gelen iş bitirilenden fazla: daha çok ya da daha hızlı consumer gerekir.", "More work comes in than gets done: you need more or faster consumers."),
      reviewStep: 2,
    },
    {
      question: l("Bir consumer bağlı görünüyor ama işlediği mesaj sayısı artmıyor. Hangi sayı bunu doğrular?", "A consumer looks connected but finishes nothing. Which number confirms it?"),
      options: [l("Ready", "Ready"), l("Onu tutan kanalın unacked sayısı hiç düşmüyor", "Its channel's unacked count never drops"), l("Consumer sayısı", "Consumer count"), l("Bağlantı sayısı", "Connection count")],
      answer: 1,
      explain: l("Takılan consumer aldıklarını bitirmez: kanalının unacked sayısı yerinde sayar.", "A stuck consumer never finishes what it took: its channel's unacked stays flat."),
      reviewStep: 4,
    },
    {
      question: l("Bellek alarmı çaldığında ne olur?", "What happens when the memory alarm fires?"),
      options: [
        l("Consumer'lar durdurulur", "Consumers are stopped"),
        l("Producer'lar bloklanır, consumer'lar devam eder", "Producers are blocked; consumers continue"),
        l("Bütün mesajlar diske atılıp silinir", "All messages are dumped to disk and deleted"),
        l("Hiçbir şey, sadece log'a yazılır", "Nothing, it is only logged"),
      ],
      answer: 1,
      explain: l("Alarm yeni mesaj girişini durdurur; consumer'lar kuyrukları boşaltarak alarmı söndürür.", "The alarm stops new messages coming in; consumers drain the queues and clear it."),
      reviewStep: 8,
    },
    {
      question: l("Saniyede 500 mesaj gönderen bir servis için en iyi bağlantı düzeni hangisi?", "What is the best connection setup for a service sending 500 messages a second?"),
      options: [
        l("Her mesaj için yeni bağlantı", "A new connection per message"),
        l("Başlangıçta açılan, açık tutulan bağlantı ve iş parçacığı başına kanal", "One connection opened at start and kept, with a channel per thread"),
        l("Her mesaj için yeni kanal ve yeni bağlantı", "A new channel and connection per message"),
        l("Bağlantıyı her saniye kapatıp açmak", "Closing and reopening the connection every second"),
      ],
      answer: 1,
      explain: l("Bağlantı pahalıdır, kanal ucuzdur: bağlantıyı bir kez aç ve tut.", "Connections are expensive, channels cheap: open the connection once and keep it."),
      reviewStep: 7,
    },
  ],
};
