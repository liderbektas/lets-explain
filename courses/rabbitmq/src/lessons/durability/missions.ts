import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";

const JOBS = "jobs";

/** Index of each restart in the try-it run. */
const restarts = (ctx: BrokerCtx) => ctx.actions.flatMap((a, i) => (a.type === "restart" ? [i] : []));

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "survivors",
    title: l("Hayatta kalanlar", "Survivors"),
    goal: l(
      "Broker yeniden başlasın ve sonrasında `jobs` kuyruğunda **en az 2 mesaj** kalsın.",
      "Restart the broker and still have **at least 2 messages** in `jobs` afterwards.",
    ),
    hint: l("İkisi birden lazım: kuyruk durable, mesaj persistent.", "You need both: a durable queue and persistent messages."),
    par: 4,
    check: (ctx) => restarts(ctx).length > 0 && (ctx.state.queues[JOBS]?.ready.length ?? 0) >= 2 && ctx.actions.at(-1)?.type === "restart",
  },
  {
    id: "empty-shelf",
    title: l("Raf duruyor, içi boş", "Shelf stays, empty"),
    goal: l(
      "`jobs`'ta 2 mesaj varken broker yeniden başlasın. Sonra kuyruk **yerinde dursun ama boş** olsun.",
      "Restart the broker while `jobs` holds 2 messages. Afterwards the queue **still exists but is empty**.",
    ),
    hint: l("Durable bir kuyruk, persistent olmayan mesajları restart'ta korumaz.", "A durable queue does not keep non-persistent messages across a restart."),
    par: 4,
    check: (ctx) =>
      restarts(ctx).some((i) => (ctx.states[i]!.queues[JOBS]?.ready.length ?? 0) >= 2) &&
      Boolean(ctx.state.queues[JOBS]) &&
      ctx.state.queues[JOBS]!.ready.length === 0,
  },
  {
    id: "no-shelf",
    title: l("Raf bile yok", "Not even a shelf"),
    goal: l(
      "`jobs`'a **persistent** bir mesaj koy, ama restart'tan sonra kuyruğun kendisi hiç kalmasın.",
      "Put a **persistent** message in `jobs`, yet after a restart the queue itself is gone.",
    ),
    hint: l("Persistent mesaj, geçici bir kuyruğu kurtaramaz.", "A persistent message cannot save a transient queue."),
    par: 3,
    check: (ctx) =>
      restarts(ctx).length > 0 &&
      ctx.actions.some((a) => a.type === "publish" && a.persistent) &&
      ctx.events.flat().some((e) => e.type === "routed" && e.queues.includes(JOBS)) &&
      !ctx.state.queues[JOBS],
  },
];
