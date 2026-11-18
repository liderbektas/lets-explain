import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

/** Ids acked during the try-it step, across every consumer that ever existed. */
const ackedIds = (ctx: BrokerCtx) => new Set(eventsOf(ctx, "acked").flatMap((e) => e.ids));

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "all-done",
    title: l("Hepsi bitsin", "All done"),
    goal: l(
      "**3 mesaj** gönder ve üçü de işlensin: hepsi ack'lensin, kuyruk boş kalsın.",
      "Send **3 messages** and have all three processed: every one acked and the queue empty.",
    ),
    hint: l("Bir işçi birden fazla mesajı tek seferde onaylayabilir.", "A worker can ack several messages at once."),
    par: 5,
    check: (ctx) => eventsOf(ctx, "routed").length >= 3 && ackedIds(ctx).size >= 3 && depth(ctx.state, "tasks").total === 0,
  },
  {
    id: "rescued",
    title: l("Kurtarılan mesaj", "Rescued"),
    goal: l(
      "Bir işçi bir mesajı elindeyken çöksün, ama mesaj **kaybolmadan** diğer işçide işlensin.",
      "Let a worker crash while holding a message, but the message is **not lost**: the other worker finishes it.",
    ),
    hint: l("Ack gelmeyen mesaj kuyruğa geri döner.", "A message that was never acked goes back to the queue."),
    par: 5,
    check: (ctx) => {
      const crashed = new Set(eventsOf(ctx, "consumerGone").filter((e) => e.crashed).map((e) => e.tag));
      const acked = eventsOf(ctx, "acked");
      return (
        lostSince(ctx).length === 0 &&
        eventsOf(ctx, "delivered").some((d) => d.redelivered && acked.some((a) => a.ids.includes(d.id) && a.tag === d.tag && !crashed.has(d.tag)))
      );
    },
  },
  {
    id: "share",
    title: l("İşi paylaştır", "Share the work"),
    goal: l("İki işçiye de **en az birer** mesaj gitsin.", "Get **at least one** message to each of the two workers."),
    hint: l("Birden fazla işçi aynı kuyruğu dinleyince mesajlar sırayla dağılır.", "When several workers listen to one queue, messages take turns."),
    par: 4,
    check: (ctx) => {
      const got = new Set(eventsOf(ctx, "delivered").map((d) => d.tag));
      return got.has("w1") && got.has("w2");
    },
  },
];
