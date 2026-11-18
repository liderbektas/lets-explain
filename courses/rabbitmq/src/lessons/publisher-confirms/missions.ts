import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "get-nack",
    title: l("Bir nack al", "Get a nack"),
    goal: l("Broker'dan bir mesaj için **nack** (reddedildi) cevabı al.", "Get a **nack** (rejected) answer from the broker for a message."),
    hint: l("`limited` en fazla 2 mesaj alıyor ve dolunca yeni geleni reddediyor.", "`limited` holds at most 2 messages and rejects new ones when full."),
    par: 3,
    check: (ctx) => eventsOf(ctx, "confirmed").some((c) => !c.ok),
  },
  {
    id: "silent-then-back",
    title: l("Sessiz, sonra geri", "Silent, then back"),
    goal: l(
      "Gidecek kuyruğu olmayan bir mesaj **sessizce kaybolsun**; sonra aynı key'li ikinci mesaj **producer'a geri dönsün**.",
      "Let a message with no queue to go to be **silently dropped**; then have a second one with the same key **returned to the producer**.",
    ),
    hint: l("Geri dönmesi için mesajın `mandatory` işaretli olması gerekir.", "To come back, a message must be flagged `mandatory`."),
    par: 2,
    check: (ctx) => {
      const u = eventsOf(ctx, "unroutable");
      const silent = u.findIndex((e) => !e.returned);
      return silent >= 0 && u.slice(silent + 1).some((e) => e.returned);
    },
  },
  {
    id: "all-acked",
    title: l("Hepsi onaylı", "All acked"),
    goal: l(
      "`limited` kuyruğuna **3 mesaj** gönder ve üçü de **ack** alsın; hiç nack olmasın.",
      "Send **3 messages** to `limited` and have all three **acked**, with no nack at all.",
    ),
    hint: l("Kuyrukta yer açılırsa broker yeni mesajı kabul eder.", "If room opens up in the queue, the broker accepts the new message."),
    par: 4,
    check: (ctx) => {
      const toLimited = new Set(eventsOf(ctx, "routed").filter((r) => r.queues.includes("limited")).map((r) => r.id));
      const confirms = eventsOf(ctx, "confirmed");
      return confirms.every((c) => c.ok) && confirms.filter((c) => toLimited.has(c.id)).length >= 3;
    },
  },
];
