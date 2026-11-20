import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { run, START, type WorldAction, type WorldEvent, type WorldState } from "./model";
import { boxOf, ENV, type WBox } from "./shell";

export type WCtx = AppCtx<WorldState, WorldAction, WorldEvent>;
export type WScenario = Scenario<WCtx, WBox>;

const after = (actions: WorldAction[]) => run(actions).states.at(-1)!;
const sentLate = (c: WCtx) => c.events.flat().some((e) => e.type === "sent" && e.late);

export const FREE: WBox = boxOf(START);

export const scenarios: WScenario[] = [
  {
    id: "reproduce",
    title: l("Olayı tekrarla", "Reproduce the incident"),
    story: l(
      "Dün gece e-posta servisi birkaç dakika çöktü ve o sırada sipariş veren müşteriler onay e-postası hiç almadı. Ekibe Kafka'yı önermeden önce olayı staging'de tekrarlamak istiyorsun.",
      "Last night the email service was down for a few minutes, and customers who ordered then never got a confirmation email. Before proposing Kafka to the team, you want to reproduce the incident in staging.",
    ),
    goal: l("Bugünkü düzende (HTTP) e-posta servisi kapalıyken bir sipariş ver: o e-posta **kaybolsun**, sonra servis geri gelsin.", "With today's setup (HTTP), place an order while the email service is down: that email is **lost**; then the service comes back."),
    start: FREE,
    hints: [
      l("Sipariş servisi e-posta servisini doğrudan çağırıyor. Karşı taraf kapalıysa çağrı boşa gider.", "The order service calls the email service directly. If the other side is down, the call goes nowhere."),
      l("`docker stop email-service`, sipariş, `docker start email-service`.", "`docker stop email-service`, an order, `docker start email-service`."),
      l("`docker stop email-service`, `./place-order.sh`, `docker start email-service`", "`docker stop email-service`, `./place-order.sh`, `docker start email-service`"),
    ],
    par: 3,
    check: (c) => c.state.mode === "direct" && c.state.lost > c.start.lost && c.state.emailUp,
  },
  {
    id: "maintenance",
    title: l("Bakım penceresi", "Maintenance window"),
    story: l(
      "Bu gece e-posta servisi on dakikalık bakıma girecek, siparişler gelmeye devam edecek. Bu sefer hiçbir müşteri e-postasız kalmamalı.",
      "Tonight the email service goes down for ten minutes of maintenance, and orders keep coming. This time no customer may go without their email.",
    ),
    goal: l("Bakım sırasında (e-posta servisi kapalıyken) bir sipariş gelsin; servis geri gelince e-postası gitsin, **hiçbiri kaybolmasın**.", "An order comes in during the maintenance (email service down); when the service is back its email goes out, and **none is lost**."),
    start: FREE,
    hints: [
      l("Sipariş servisi olayı bir yere **yazsa** ve e-posta servisi oradan okusa, kapalı olduğu sürede olaylar beklerdi.", "If the order service **wrote** the event somewhere and the email service read from there, events would wait while it's down."),
      l("`order-service.env`'de `NOTIFY_MODE=kafka`, sonra `docker compose up -d order-service`. Bakımı ondan sonra yap.", "In `order-service.env`, `NOTIFY_MODE=kafka`, then `docker compose up -d order-service`. Do the maintenance after that."),
      l(
        "`nano order-service.env` (`NOTIFY_MODE=kafka`), `docker compose up -d order-service`, `docker stop email-service`, `./place-order.sh`, `docker start email-service`",
        "`nano order-service.env` (`NOTIFY_MODE=kafka`), `docker compose up -d order-service`, `docker stop email-service`, `./place-order.sh`, `docker start email-service`",
      ),
    ],
    par: 5,
    check: (c) => c.state.lost === c.start.lost && c.state.emailUp && c.state.waiting === 0 && sentLate(c),
  },
  {
    id: "catch-up",
    title: l("Yetiş", "Catch up"),
    story: l(
      "Artık Kafka'dasınız. E-posta servisi öğleden beri kapalı ve kimse fark etmemiş; bu arada üç sipariş geldi.",
      "You're on Kafka now. The email service has been down since lunch and nobody noticed; three orders came in meanwhile.",
    ),
    goal: l("Bekleyen bütün e-postalar gitsin: **lag 0** olsun ve servis çalışsın.", "Every waiting email goes out: **lag is 0** and the service runs."),
    start: boxOf(after([{ type: "setMode", mode: "kafka" }, { type: "crashEmail" }, { type: "order" }, { type: "order" }, { type: "order" }])),
    hints: [
      l("Ne kadar geride olduğuna bak: `kafka-consumer-groups.sh --describe --group email-service`.", "See how far behind it is: `kafka-consumer-groups.sh --describe --group email-service`."),
      l("Olaylar log'da duruyor. Servis geri gelince kaldığı yerden okur.", "The events are still in the log. When the service comes back, it reads from where it stopped."),
      l("`docker start email-service`", "`docker start email-service`"),
    ],
    par: 1,
    check: (c) => c.state.emailUp && c.state.waiting === 0 && c.state.sent >= c.start.sent + 3,
  },
  {
    id: "new-team",
    title: l("Yeni ekip", "A new team"),
    story: l(
      "Analitik ekibi de her siparişi görmek istiyor. HTTP'de bu, sipariş servisine bir URL daha ve sipariş servisinin çağırıp bekleyeceği bir servis daha demekti. Artık Kafka'dasınız.",
      "The analytics team wants every order too. With HTTP that meant one more URL in the order service, and one more service for it to call and wait on. You're on Kafka now.",
    ),
    goal: l("`analytics-service` siparişleri almaya başlasın; sipariş servisinin ayarına **dokunmadan**.", "`analytics-service` starts getting orders, **without touching** the order service's settings."),
    start: boxOf(after([{ type: "setMode", mode: "kafka" }])),
    hints: [
      l("Kafka'da yazan, okuyanları bilmez. Yeni bir okuyucu topic'e abone olur, o kadar.", "With Kafka, the writer doesn't know its readers. A new reader subscribes to the topic, that's all."),
      l("Servisi başlatman yeter: `docker compose up -d analytics-service`.", "Starting the service is enough: `docker compose up -d analytics-service`."),
      l("`docker compose up -d analytics-service`", "`docker compose up -d analytics-service`"),
    ],
    par: 1,
    check: (c) => c.state.targets === c.start.targets + 1 && c.state.mode === "kafka" && c.box.files[ENV] === c.startBox.files[ENV],
  },
];
