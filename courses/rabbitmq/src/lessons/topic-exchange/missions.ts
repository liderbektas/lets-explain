import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { route } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

/** Routing keys waiting in `target` at the end. */
const inTarget = (ctx: BrokerCtx) => new Set((ctx.state.queues.target?.ready ?? []).map((m) => m.routingKey));
const published = (ctx: BrokerCtx) => new Set(eventsOf(ctx, "routed").map((e) => e.routingKey).concat(eventsOf(ctx, "unroutable").map((e) => e.routingKey)));
const exactly = (got: Set<string>, want: string[]) => got.size === want.length && want.every((k) => got.has(k));
/** Whether target's bindings at the end would take a key: the rule must be right, not just the timing. */
const takes = (ctx: BrokerCtx, key: string) => route(ctx.state, "events", key).includes("target");

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "eu-only",
    title: l("Sadece Avrupa", "Europe only"),
    goal: l(
      "`order.created.eu`, `order.paid.eu` ve `order.created.us`'yi gönder. `target` **sadece Avrupa** siparişlerini alsın.",
      "Publish `order.created.eu`, `order.paid.eu` and `order.created.us`. `target` gets **only the European** orders.",
    ),
    hint: l("Ortadaki kelime ne olursa olsun, son kelime `eu` olmalı.", "Whatever the middle word is, the last word must be `eu`."),
    par: 4,
    check: (ctx) =>
      ["order.created.eu", "order.paid.eu", "order.created.us"].every((k) => published(ctx).has(k)) &&
      exactly(inTarget(ctx), ["order.created.eu", "order.paid.eu"]) &&
      !takes(ctx, "order.created.us"),
  },
  {
    id: "all-orders",
    title: l("Bütün siparişler", "Every order"),
    goal: l("Üç siparişin de (`order.…`) `target`'a düşsün.", "Get all three orders (`order.…`) into `target`."),
    hint: l("Bir kalıp, `order`'dan sonra kaç kelime gelirse gelsin eşleşebilir.", "One pattern can match however many words follow `order`."),
    par: 4,
    check: (ctx) => ["order.created.eu", "order.paid.eu", "order.created.us"].every((k) => inTarget(ctx).has(k)),
  },
  {
    id: "two-rules",
    title: l("İki kural", "Two rules"),
    goal: l(
      "`target` hem `order.created.us`'yi hem `user.signup.eu`'yu alsın, ama kuralları `order.paid.eu`'yu **almasın**.",
      "`target` gets both `order.created.us` and `user.signup.eu`, but its rules do **not** take `order.paid.eu`.",
    ),
    hint: l("Bir kuyruğun birden fazla binding'i olabilir; biri uyması yeter.", "A queue can have several bindings; matching any one is enough."),
    par: 4,
    check: (ctx) => exactly(inTarget(ctx), ["order.created.us", "user.signup.eu"]) && !takes(ctx, "order.paid.eu"),
  },
];
