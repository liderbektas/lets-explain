import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { Files } from "../../engine/cli";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, lostSince, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the project */

const QUEUE = "emails";

/** The shop's email pipeline: a durable `emails` queue, an order service, and a mail worker. */
export const FILES: Files = {
  "setup.py": script(`ch.queue_declare(queue="${QUEUE}", durable=True)`),
  "order.py": script(`ch.basic_publish(exchange="", routing_key="${QUEUE}", body=b"order 1001")`),
  "orders.py": script(`
for n in [1001, 1002, 1003]:
    ch.basic_publish(exchange="", routing_key="${QUEUE}", body=f"order {n}")
`),
  "black_friday.py": script(`
for n in range(6):
    ch.basic_publish(exchange="", routing_key="${QUEUE}", body=f"order {2000 + n}")
`),
  // A mail worker sends one email a second and holds one at a time.
  "mailer.py": `import pika
import time

connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
ch = connection.channel()

def send_email(ch, method, properties, body):
    print(f" [x] Sending email for {body.decode()}")
    time.sleep(1)
    ch.basic_ack(delivery_tag=method.delivery_tag)

ch.basic_qos(prefetch_count=1)
ch.basic_consume(queue="${QUEUE}", on_message_callback=send_email)
ch.start_consuming()`,
};

/** Free play: the queue exists, nobody is listening yet. */
export const FREE = projectAfter(FILES, ["python setup.py"]);

/** Emails finished (acked) during the scenario. */
const sent = (ctx: RabbitCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids)).size;
const ticks = (ctx: RabbitCtx) => ctx.actions.filter((a) => a.type === "tick").length;
const drained = (ctx: RabbitCtx) => (ctx.state.queues[QUEUE] ? depth(ctx.state, QUEUE).total === 0 : false);

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "after-outage",
    title: l("Kesintiden sonra", "After the outage"),
    story: l(
      "E-posta servisi gece bakım için kapalıydı. Bu sırada sipariş servisi çalışmaya devam etti ve 3 sipariş geldi. Kimse e-posta almadı ama hiçbir sipariş de hata vermedi. Bakım bitti; `mailer.py` tekrar çalıştırılmayı bekliyor.",
      "The email service was down overnight for maintenance. The order service kept running and 3 orders came in. Nobody got an email, but no order failed either. Maintenance is over; `mailer.py` is waiting to be started again.",
    ),
    goal: l("Bekleyen 3 siparişin e-postası gönderilsin, kuyruk boşalsın, hiçbiri kaybolmasın.", "The 3 waiting orders get their emails, the queue empties, none is lost."),
    start: projectAfter(FILES, ["python setup.py", "python orders.py"]),
    hints: [
      l(
        "`rabbitmqctl list_queues name messages` ile bak: siparişler kuyrukta bekliyor. Kuyruk, okuyan biri gelene kadar onları tutar.",
        "Look with `rabbitmqctl list_queues name messages`: the orders are waiting in the queue. A queue keeps them until someone reads.",
      ),
      l(
        "E-posta servisini başlat. Her e-posta bir saniye sürüyor; zamanı `sleep` ile ilerletebilirsin.",
        "Start the email service. Each email takes a second; move time forward with `sleep`.",
      ),
      l("`python mailer.py`, `sleep 3`", "`python mailer.py`, `sleep 3`"),
    ],
    par: 2,
    check: (ctx) => sent(ctx) >= 3 && drained(ctx) && lostSince(ctx).length === 0,
  },
  {
    id: "new-server",
    title: l("Yeni sunucu", "The new server"),
    story: l(
      "Uygulamayı boş bir RabbitMQ sunucusuna taşıyorsun. Kurulum (`setup.py`), sipariş servisi (`order.py`) ve e-posta servisi (`mailer.py`) hazır. Geçen sefer sıralama yanlıştı ve ilk siparişler iz bırakmadan kayboldu.",
      "You're moving the app to an empty RabbitMQ server. The setup (`setup.py`), the order service (`order.py`) and the email service (`mailer.py`) are ready. Last time the order was wrong and the first orders vanished without a trace.",
    ),
    goal: l("Bir siparişin e-postası gönderilsin ve **hiçbir sipariş kaybolmasın**.", "An order's email goes out and **no order is lost**."),
    start: projectAfter(FILES),
    hints: [
      l(
        "Default exchange mesajı adı routing key olan kuyruğa koyar. O kuyruk henüz yoksa mesaj sessizce atılır.",
        "The default exchange puts a message into the queue named by its routing key. If that queue doesn't exist yet, the message is silently dropped.",
      ),
      l("Önce kuyruğu kur (`python setup.py`), sonra servisleri çalıştır.", "Set up the queue first (`python setup.py`), then run the services."),
      l("`python setup.py`, `python mailer.py`, `python order.py`, `sleep 1`", "`python setup.py`, `python mailer.py`, `python order.py`, `sleep 1`"),
    ],
    par: 4,
    check: (ctx) => sent(ctx) >= 1 && lostSince(ctx).length === 0,
  },
  {
    id: "black-friday",
    title: l("Kara Cuma", "Black Friday"),
    story: l(
      "Kara Cuma kampanyası başladı: 6 sipariş aynı anda geldi. Tek e-posta servisi saniyede bir e-posta gönderiyor ve müşteriler onay e-postasını bekliyor. Ekip, birikmenin **3 saniye** içinde erimesini istiyor.",
      "The Black Friday sale started: 6 orders came in at once. The single email service sends one email a second, and customers are waiting for their confirmation. The team wants the backlog gone within **3 seconds**.",
    ),
    goal: l("Kuyruk en fazla 3 saniyede boşalsın; hiçbir sipariş kaybolmasın.", "The queue empties in at most 3 seconds; no order is lost."),
    start: projectAfter(FILES, ["python setup.py", "python mailer.py", "python black_friday.py"]),
    hints: [
      l("Tek işçi saniyede bir e-posta: 6 e-posta 6 saniye sürer.", "One worker sends one email a second: 6 emails take 6 seconds."),
      l(
        "Aynı kuyruğu dinleyen ikinci bir işçi işi paylaşır. `mailer.py`'yi bir kez daha çalıştırmak ikinci bir işçi başlatır.",
        "A second worker on the same queue shares the work. Running `mailer.py` once more starts a second worker.",
      ),
      l("`python mailer.py`, `sleep 3`", "`python mailer.py`, `sleep 3`"),
    ],
    par: 2,
    check: (ctx) => drained(ctx) && ticks(ctx) <= 3 && sent(ctx) >= 6 && lostSince(ctx).length === 0,
  },
  {
    id: "maintenance",
    title: l("Bakım arası", "Maintenance break"),
    story: l(
      "E-posta servisinin çalıştığı makineye güncelleme gelecek; servisi durdurup yeniden başlatman gerekiyor. Tam şu an elinde bir e-posta var ve kuyrukta iki tane daha bekliyor. Müşteriler yine de her e-postayı almalı.",
      "The machine the email service runs on needs an update; you have to stop the service and start it again. Right now it's holding one email and two more are waiting in the queue. Customers must still get every email.",
    ),
    goal: l("Servisi bir kez **durdur**, sonra yeniden başlat; 3 e-postanın hepsi gönderilsin, hiçbiri kaybolmasın.", "**Stop** the service once, then start it again; all 3 emails go out, none is lost."),
    start: projectAfter(FILES, ["python setup.py", "python mailer.py", "python orders.py"]),
    hints: [
      l(
        "Onaylanmamış (ack'lenmemiş) mesaj, işçi ayrılınca kuyruğa geri döner. Durdurmak güvenli.",
        "A message that wasn't acked goes back to the queue when its worker leaves. Stopping is safe.",
      ),
      l("Arka planda çalışan servisi `pkill -f mailer.py` durdurur.", "`pkill -f mailer.py` stops the service running in the background."),
      l("`pkill -f mailer.py`, `python mailer.py`, `sleep 3`", "`pkill -f mailer.py`, `python mailer.py`, `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => eventsOf(ctx, "consumerGone").length >= 1 && sent(ctx) >= 3 && drained(ctx) && lostSince(ctx).length === 0,
  },
];
