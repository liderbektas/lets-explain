import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "lose-one",
    title: l("Sessiz kayıp", "Silent loss"),
    goal: l(
      "**auto-ack** kullanarak bir mesajı kaybet: işçi mesajı alsın ama bitiremeden çöksün.",
      "Lose a message with **auto-ack**: the worker gets it but crashes before finishing.",
    ),
    hint: l("Auto-ack'te broker mesajı teslim ettiği anda unutur.", "With auto-ack the broker forgets a message the moment it delivers it."),
    par: 3,
    check: (ctx) => lostSince(ctx).some((x) => x.reason === "auto-ack-crash"),
  },
  {
    id: "park",
    title: l("Kenara ayır", "Set it aside"),
    goal: l(
      "Bir mesajı **reddet** ve `dead` kuyruğuna düşsün (geri gelmesin).",
      "**Reject** a message so it lands in the `dead` queue (it must not come back).",
    ),
    hint: l("`requeue=False` ile geri çevrilen mesaj kuyruğun DLX'ine gider.", "A message turned down with `requeue=False` goes to the queue's DLX."),
    par: 3,
    check: (ctx) => (ctx.state.queues.dead?.ready ?? []).some((m) => m.deaths.some((d) => d.reason === "rejected")),
  },
  {
    id: "second-chance",
    title: l("İkinci şans", "Second chance"),
    goal: l(
      "Bir mesaj ilk seferde **geri çevrilsin** (requeue) ve ikinci teslimde **onaylansın**.",
      "Turn a message **back** the first time (requeue) and **ack** it on the second delivery.",
    ),
    hint: l("nack + requeue mesajı kuyruğun başına koyar.", "nack with requeue puts the message back at the front."),
    par: 4,
    check: (ctx) => {
      const acked = new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));
      return eventsOf(ctx, "delivered").some((d) => d.redelivered && acked.has(d.id)) && lostSince(ctx).length === 0;
    },
  },
];
