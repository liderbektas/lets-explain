import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

const QUEUE = "emails";

/** How many emails were finished (acked) during the try-it step. */
const handled = (ctx: BrokerCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids)).size;

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "no-loss",
    title: l("Hiçbiri kaybolmasın", "Nothing lost"),
    goal: l(
      "Hiçbir e-posta servisi bağlı değilken **2 sipariş** gelsin. Sonunda ikisinin de e-postası gönderilsin.",
      "Let **2 orders** arrive while no email service is connected. In the end, both emails go out.",
    ),
    hint: l("Kuyruk, işçi gelene kadar bekletir. İşçi her saniye bir e-posta gönderir.", "The queue holds them until a worker comes. A worker sends one email per second."),
    par: 5,
    check: (ctx) => {
      const whileAlone = ctx.actions.filter((a, i) => a.type === "publish" && Object.keys(ctx.states[i]!.consumers).length === 0).length;
      return whileAlone >= 2 && handled(ctx) >= 2 && lostSince(ctx).length === 0;
    },
  },
  {
    id: "fast",
    title: l("Tek saniyede", "In one second"),
    goal: l("**2 siparişin** e-postasını **tek bir saniyede** gönder.", "Send the emails for **2 orders** in **a single second**."),
    hint: l("Bir işçi saniyede bir e-posta gönderir. İki işçi?", "One worker sends one email a second. Two workers?"),
    par: 5,
    check: (ctx) => handled(ctx) >= 2 && ctx.actions.filter((a) => a.type === "tick").length <= 1,
  },
  {
    id: "backlog",
    title: l("Birikme", "Backlog"),
    goal: l(
      "Bir e-posta servisi bağlıyken kuyrukta aynı anda **3 sipariş** beklesin.",
      "With an email service connected, have **3 orders** waiting in the queue at the same time.",
    ),
    hint: l("İşçi bir seferde sadece bir e-posta alır; gerisi kuyrukta bekler.", "A worker takes only one email at a time; the rest wait in the queue."),
    par: 5,
    check: (ctx) => ctx.states.some((s) => Object.keys(s.consumers).length > 0 && (s.queues[QUEUE]?.ready.length ?? 0) >= 3),
  },
];
