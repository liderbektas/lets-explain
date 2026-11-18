import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "first-route",
    title: l("İlk yol", "First route"),
    goal: l("Bir `order.paid` mesajı **billing** kuyruğuna ulaşsın.", "Get an `order.paid` message into the **billing** queue."),
    hint: l("Exchange, kuralı olmayan bir kuyruğa mesaj koymaz.", "An exchange never puts a message into a queue it has no rule for."),
    par: 2,
    check: (ctx) => eventsOf(ctx, "routed").some((e) => e.routingKey === "order.paid" && e.queues.includes("billing")),
  },
  {
    id: "both",
    title: l("İki kuyruğa birden", "Two at once"),
    goal: l("**Tek bir** `order.paid` mesajı hem billing'e hem shipping'e gitsin.", "**One** `order.paid` message goes to both billing and shipping."),
    hint: l("Aynı key ile birden fazla kuyruk bağlanabilir.", "Several queues can be bound with the same key."),
    par: 3,
    check: (ctx) => eventsOf(ctx, "routed").some((e) => e.routingKey === "order.paid" && e.queues.includes("billing") && e.queues.includes("shipping")),
  },
  {
    id: "lost-then-found",
    title: l("Kayıp, sonra bulundu", "Lost, then found"),
    goal: l(
      "Önce bir `order.shipped` mesajı **hiçbir kuyruğa** gitmesin; sonra aynı key'li ikinci bir mesaj shipping'e ulaşsın.",
      "First let an `order.shipped` message reach **no queue**; then a second one with the same key reaches shipping.",
    ),
    hint: l("Binding olmadan gönderilen mesaj sessizce atılır.", "A message sent before the binding exists is silently dropped."),
    par: 3,
    check: (ctx) => {
      const flat = ctx.events.flat();
      const lost = flat.findIndex((e) => e.type === "unroutable" && e.routingKey === "order.shipped");
      const found = flat.findIndex((e, i) => i > lost && e.type === "routed" && e.routingKey === "order.shipped" && e.queues.includes("shipping"));
      return lost >= 0 && found > lost;
    },
  },
];
