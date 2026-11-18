import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";

/** Message bodies waiting in a queue at the end. */
const bodies = (ctx: BrokerCtx, q: string) => (ctx.state.queues[q]?.ready ?? []).map((m) => m.body);

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "everyone",
    title: l("Herkese", "Everyone"),
    goal: l("Bir haber yayınla ve **üç kuyruğa da** kopyası düşsün.", "Publish one item and have a copy land in **all three** queues."),
    hint: l("Fanout sadece bağlı kuyruklara kopyalar.", "Fanout only copies to queues that are bound."),
    par: 4,
    check: (ctx) => ["a", "b", "c"].every((q) => bodies(ctx, q).length > 0),
  },
  {
    id: "not-b",
    title: l("b hariç", "All but b"),
    goal: l("Bir haber `a` ve `c`'ye gitsin, ama `b`'ye **gitmesin**.", "One item reaches `a` and `c` but **not** `b`."),
    hint: l("Routing key işe yaramaz: fanout ona bakmaz. Kimin alacağını binding'ler belirler.", "The routing key will not help: fanout ignores it. Bindings decide who gets it."),
    par: 3,
    check: (ctx) => bodies(ctx, "a").length > 0 && bodies(ctx, "c").length > 0 && bodies(ctx, "b").length === 0,
  },
  {
    id: "late",
    title: l("Geç kalan", "Late joiner"),
    goal: l("`a` iki haberi de alsın; `c` ise ilkini kaçırıp **sadece ikincisini** alsın.", "`a` gets both items; `c` misses the first and gets **only the second**."),
    hint: l("Bağlanmadan önce yayınlanan mesaj o kuyruğa hiç gelmez.", "A message published before a queue is bound never reaches it."),
    par: 4,
    check: (ctx) => {
      const a = bodies(ctx, "a");
      const c = bodies(ctx, "c");
      return a.length === 2 && c.length === 1 && c[0] === a[1] && bodies(ctx, "b").length === 0;
    },
  },
];
