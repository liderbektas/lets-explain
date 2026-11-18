import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

/** The slow worker held n jobs at some moment while the fast one was connected too. */
const slowHeldAtLeast = (ctx: BrokerCtx, n: number) => ctx.states.some((s) => (s.consumers.slow?.unacked.length ?? 0) >= n && Boolean(s.consumers.fast));
const fastDone = (ctx: BrokerCtx) => ctx.state.consumers.fast?.done.length ?? 0;

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "hoard",
    title: l("İstifçi", "The hoarder"),
    goal: l(
      "Hızlı işçi de bağlıyken yavaş işçinin elinde aynı anda **2 iş** birikmesini sağla.",
      "While the fast worker is connected too, get **2 jobs** piled up in the slow worker's hands at once.",
    ),
    hint: l("Sınır yokken broker işleri sırayla dağıtır, işçinin hızına bakmaz.", "With no limit, the broker hands jobs out in turn, whatever the worker's speed."),
    par: 4,
    check: (ctx) => slowHeldAtLeast(ctx, 2),
  },
  {
    id: "fair",
    title: l("Adil dağıtım", "Fair dispatch"),
    goal: l(
      "Yavaş işçiyi **prefetch 1** ile bağla, **3 iş** gönder ve en az 2'si bitsin. Sonunda yavaşın elinde en fazla 1 iş olsun.",
      "Connect the slow worker with **prefetch 1**, send **3 jobs**, and get at least 2 done. At the end the slow one holds at most 1.",
    ),
    hint: l("Önce yavaşı ayır, sonra prefetch 1 ile geri bağla.", "Disconnect the slow worker first, then reconnect it with prefetch 1."),
    par: 6,
    check: (ctx) => {
      const s = ctx.state.consumers.slow;
      return Boolean(s && s.prefetch === 1 && s.unacked.length <= 1) && eventsOf(ctx, "routed").length >= 3 && fastDone(ctx) >= 2;
    },
  },
  {
    id: "rescue",
    title: l("İşleri kurtar", "Rescue the jobs"),
    goal: l(
      "Yavaş işçinin elinde **2 iş** birikmesine izin ver, sonra o işleri hızlı işçiye devret: sonunda hızlı en az 3 iş bitirmiş, yavaşın elinde hiç iş kalmamış olsun.",
      "Let **2 jobs** pile up on the slow worker, then hand them to the fast one: at the end the fast worker has finished at least 3 and the slow one holds none.",
    ),
    hint: l("Bir işçi ayrılınca elinde onaylanmamış ne varsa kuyruğa geri döner.", "When a worker disconnects, whatever it had not acked goes back to the queue."),
    par: 6,
    check: (ctx) => slowHeldAtLeast(ctx, 2) && (ctx.state.consumers.slow?.unacked.length ?? 0) === 0 && fastDone(ctx) >= 3,
  },
];
