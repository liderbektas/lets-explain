import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DeathReason } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

const parkedFor = (ctx: BrokerCtx, reason: DeathReason) =>
  (ctx.state.queues.parking?.ready ?? []).some((m) => m.body.startsWith("bad") && m.deaths.some((d) => d.reason === reason));

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "limit",
    title: l("Sınıra çarp", "Hit the limit"),
    goal: l(
      "Bozuk bir mesaj park kuyruğuna düşsün ama onu **hiç reject etme**: sadece `nack (requeue)` kullan.",
      "Get a bad message into the parking queue without **ever rejecting** it: use only `nack (requeue)`.",
    ),
    hint: l("Bu kuyruğun delivery-limit'i 2.", "This queue's delivery limit is 2."),
    par: 4,
    check: (ctx) => parkedFor(ctx, "delivery_limit") && !ctx.actions.some((a) => a.type === "nack" && !a.requeue),
  },
  {
    id: "straight",
    title: l("Doğrudan park", "Straight to parking"),
    goal: l("Bozuk bir mesajı **tek hamlede** park kuyruğuna gönder: tekrar denemeye gerek yok.", "Send a bad message to parking in **one move**: no retries needed."),
    hint: l("Kalıcı bir hata için requeue etme.", "Do not requeue a permanent failure."),
    par: 2,
    check: (ctx) => parkedFor(ctx, "rejected"),
  },
  {
    id: "sort",
    title: l("Ayıkla", "Sort them"),
    goal: l(
      "Bir **bozuk** mesaj park kuyruğuna düşsün ve bir **sağlam** mesaj onaylansın.",
      "Get one **bad** message into parking and one **good** message acked.",
    ),
    hint: l("İşçi her seferinde en eski mesajına cevap verir.", "The worker always answers for its oldest message."),
    par: 4,
    check: (ctx) => {
      // Bodies of everything the worker ever held, by id, to tell good from bad.
      const bodies = new Map(ctx.states.flatMap((st) => st.consumers.w?.unacked ?? []).map((m) => [m.id, m.body]));
      const goodAcked = eventsOf(ctx, "acked").some((e) => e.ids.some((id) => bodies.get(id)?.startsWith("ok")));
      return goodAcked && (parkedFor(ctx, "rejected") || parkedFor(ctx, "delivery_limit"));
    },
  },
];
