import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

const reached = (ctx: BrokerCtx, key: string, queue: string) => eventsOf(ctx, "routed").some((e) => e.routingKey === key && e.queues.includes(queue));

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "right-door",
    title: l("Doğru kapı", "The right door"),
    goal: l(
      "Bir `image` mesajı **images** kuyruğuna, bir `email` mesajı da **emails** kuyruğuna ulaşsın.",
      "Get an `image` message into **images** and an `email` message into **emails**.",
    ),
    hint: l("Direct exchange, binding key'i routing key ile birebir aynı olan kuyruğa gönderir.", "A direct exchange sends to queues whose binding key equals the routing key exactly."),
    par: 4,
    check: (ctx) => reached(ctx, "image", "images") && reached(ctx, "email", "emails"),
  },
  {
    id: "video",
    title: l("Video da resim işçisine", "Videos to the image worker"),
    goal: l("Bir `video` mesajı **images** kuyruğuna ulaşsın.", "Get a `video` message into the **images** queue."),
    hint: l("Bir kuyruk birden fazla key ile bağlanabilir.", "One queue can be bound with several keys."),
    par: 2,
    check: (ctx) => reached(ctx, "video", "images"),
  },
  {
    id: "nothing-lost",
    title: l("Hiç kayıp yok", "Nothing lost"),
    goal: l(
      "Üç farklı key ile (`image`, `email`, `video`) birer mesaj gönder; **hiçbiri kaybolmasın**.",
      "Send one message with each of three keys (`image`, `email`, `video`); **none may be lost**.",
    ),
    hint: l("Bir mesaj göndermeden önce, onu alacak bir binding olsun.", "Before sending a message, make sure a binding will take it."),
    par: 6,
    check: (ctx) => {
      const keys = new Set(eventsOf(ctx, "routed").map((e) => e.routingKey));
      return ["image", "email", "video"].every((k) => keys.has(k)) && lostSince(ctx).length === 0;
    },
  },
];
