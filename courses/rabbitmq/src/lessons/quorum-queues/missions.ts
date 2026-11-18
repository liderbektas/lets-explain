import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { queueAvailable } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { lostSince } from "../shared/missionHelpers";

/** Indexes of moves whose message reached `queue` and was confirmed (ok) or refused (not ok). */
function publishesTo(ctx: BrokerCtx, queue: string, ok: boolean): number[] {
  const out: number[] = [];
  ctx.events.forEach((evs, i) => {
    const routed = evs.find((e) => e.type === "routed" && e.queues.includes(queue));
    const confirm = evs.find((e) => e.type === "confirmed");
    if (routed && confirm && confirm.type === "confirmed" && confirm.ok === ok) out.push(i);
  });
  return out;
}

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "leader-moves",
    title: l("Lider değişsin", "New leader"),
    goal: l(
      "`jobs` kuyruğunun leader'ı başka bir node'a geçsin ve kuyruk **ondan sonra** gelen bir mesajı kabul etsin.",
      "Make the leader of `jobs` move to another node, and have the queue accept a message **after** that.",
    ),
    hint: l("Leader şu an rabbit@1'de.", "The leader is on rabbit@1 right now."),
    par: 2,
    check: (ctx) => {
      const moved = ctx.events.findIndex((evs) => evs.some((e) => e.type === "leaderMoved" && e.queue === "jobs"));
      return moved >= 0 && publishesTo(ctx, "jobs", true).some((i) => i > moved);
    },
  },
  {
    id: "one-survives",
    title: l("Biri kurtulsun", "One survives"),
    goal: l(
      "Bir node kapalıyken iki kuyruğa da mesaj gönder: `cache`'e giden **kaybolsun**, `jobs`'a giden **kabul edilsin**.",
      "While a node is down, send to both queues: the one for `cache` is **lost**, the one for `jobs` is **accepted**.",
    ),
    hint: l("Classic kuyruk tek bir node'da yaşar. Hangisi?", "A classic queue lives on a single node. Which one?"),
    par: 3,
    check: (ctx) =>
      lostSince(ctx).some((x) => x.reason === "queue-down") &&
      publishesTo(ctx, "jobs", true).some((i) => ctx.states[i + 1]!.nodes.some((n) => !n.alive)),
  },
  {
    id: "no-majority",
    title: l("Çoğunluk yok", "No majority"),
    goal: l(
      "`jobs` bir mesajı **reddetsin** (nack). Sonra kuyruğu yeniden çalışır hale getir ve bir mesajı **kabul ettir**.",
      "Make `jobs` **refuse** a message (nack). Then get the queue working again and have it **accept** one.",
    ),
    hint: l("Üç kopyalı bir quorum kuyruğu en az iki çalışan node ister.", "A three-copy quorum queue needs at least two nodes up."),
    par: 5,
    check: (ctx) => {
      const refused = publishesTo(ctx, "jobs", false);
      const accepted = publishesTo(ctx, "jobs", true);
      return refused.length > 0 && accepted.some((i) => i > refused[0]!) && queueAvailable(ctx.state, ctx.state.queues.jobs!);
    },
  },
];
