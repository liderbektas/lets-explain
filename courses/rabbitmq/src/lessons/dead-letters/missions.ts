import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DeathReason } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

/** Did a message reach the `dead` queue for this reason during the try-it step? */
const diedOf = (ctx: BrokerCtx, reason: DeathReason) => eventsOf(ctx, "deadLettered").some((e) => e.reason === reason && e.to === "dead");

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "rejected",
    title: l("Reddedilen", "Rejected"),
    goal: l("`dead` kuyruğuna **reddedilmiş** (rejected) bir mesaj düşsün.", "Get a **rejected** message into the `dead` queue."),
    hint: l("İşçi bir mesajı geri koymadan reddedebilir.", "The worker can reject a message without putting it back."),
    par: 2,
    check: (ctx) => diedOf(ctx, "rejected"),
  },
  {
    id: "expired",
    title: l("Süresi dolan", "Expired"),
    goal: l("Bir mesajın **süresi dolsun** ve `dead`'e gitsin.", "Let a message **expire** and go to `dead`."),
    hint: l(
      "Boşta bir işçi TTL'li mesajı hemen alır. Mesajın kuyrukta beklemesi için işçinin elinin dolu olması gerekir.",
      "An idle worker takes a TTL message at once. For it to wait in the queue, the worker's hands must be full.",
    ),
    par: 4,
    check: (ctx) => diedOf(ctx, "expired"),
  },
  {
    id: "overflow",
    title: l("Taşan kuyruk", "Overflow"),
    goal: l(
      "`work` taşsın ve en eski bekleyen mesaj **maxlen** sebebiyle `dead`'e gitsin.",
      "Overflow `work` so the oldest waiting message goes to `dead` for **maxlen**.",
    ),
    hint: l("`work` en fazla 2 bekleyen mesaj alır; işçinin elindeki sayılmaz.", "`work` takes at most 2 waiting messages; the one in the worker's hands does not count."),
    par: 4,
    check: (ctx) => diedOf(ctx, "maxlen"),
  },
];
