import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import type { Ctx } from "./model";

/** Sends made during the try-it step, not the lesson's earlier ones. */
const fresh = (ctx: Ctx) => ctx.state.sends.filter((x) => !ctx.start.sends.some((y) => y.id === x.id));

export const missions: Mission<Ctx>[] = [
  {
    id: "acked-loss",
    title: l("Onaylı ama kayıp", "Acked, then lost"),
    goal: l(
      "`acks=1` ile **onay almış** bir sipariş kaybolsun.",
      "Lose an order that was **acknowledged** with `acks=1`.",
    ),
    hint: l(
      "acks=1 sadece leader'ı bekler. Leader çöktüğünde yerine geçecek follower o kaydı henüz almamışsa? Leader'dan sonra kimin seçileceğine bak.",
      "acks=1 waits only for the leader. What if the follower that takes over has not copied the record yet? Check who is next in line after the leader.",
    ),
    par: 4,
    check: (ctx) => fresh(ctx).some((x) => x.acks === 1 && x.status === "lost"),
  },
  {
    id: "rejected",
    title: l("Kapı kapalı", "Door closed"),
    goal: l(
      "Bir yazma `NotEnoughReplicas` hatasıyla **reddedilsin**.",
      "Get a write **rejected** with `NotEnoughReplicas`.",
    ),
    hint: l("min.insync.replicas şu an 2. ISR bundan küçükse acks=all yazmalar kabul edilmez.", "min.insync.replicas is 2 right now. If the ISR is smaller, acks=all writes are refused."),
    par: 3,
    check: (ctx) => ctx.events.flat().some((e) => e.type === "rejected" && e.reason === "notEnoughReplicas"),
  },
  {
    id: "two-crashes",
    title: l("İki çökme, sıfır kayıp", "Two crashes, zero loss"),
    goal: l(
      "**İki broker** çöksün, `acks=all` ile en az bir sipariş **onaylansın** ve hiçbir onaylı kayıt kaybolmasın. Partition sonunda çalışıyor olsun.",
      "Get **two brokers** down, at least one order **acknowledged** with `acks=all`, and no acknowledged record lost. The partition must still be online at the end.",
    ),
    hint: l(
      "min.insync.replicas=2 ile ISR 1'e düşünce yazamazsın. Onayı ne zaman almalısın?",
      "With min.insync.replicas=2 you cannot write once the ISR is down to 1. When do you need to get the ack?",
    ),
    par: 3,
    check: (ctx) => {
      const sends = fresh(ctx);
      return (
        ctx.state.brokers.filter((b) => !b.alive).length >= 2 &&
        ctx.state.partitions[0]!.leader !== null &&
        sends.some((x) => x.acks === "all" && x.status === "acked") &&
        // Lost records from before the try-it step (the lesson lost one on purpose) do not count.
        ctx.state.sends.filter((x) => x.status === "lost").length === ctx.start.sends.filter((x) => x.status === "lost").length
      );
    },
  },
  {
    id: "after-append",
    title: l("Yazıldı ama onaylanmadı", "Written, not acked"),
    goal: l(
      "Bir sipariş log'a yazılsın ama producer `NotEnoughReplicasAfterAppend` hatası alsın.",
      "Get an order written to the log while the producer receives `NotEnoughReplicasAfterAppend`.",
    ),
    hint: l(
      "Yazma kabul edildiği anda ISR yeterliydi. Onay beklerken ISR küçülürse ne olur?",
      "The ISR was big enough when the write was accepted. What if it shrinks while the write waits for its ack?",
    ),
    par: 4,
    check: (ctx) => fresh(ctx).some((x) => x.status === "failed" && x.reason === "notEnoughReplicasAfterAppend"),
  },
];
