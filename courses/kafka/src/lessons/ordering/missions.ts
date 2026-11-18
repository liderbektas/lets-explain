import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { violations, type OAction, type OEvent, type OState } from "./model";

/** What a mission can look at: where the try-it step began, every move made, and what each did. */
export interface SandboxCtx {
  start: OState;
  state: OState;
  actions: OAction[];
  events: OEvent[][];
}

const usedUnkeyed = (ctx: SandboxCtx) => ctx.actions.some((a) => a.type === "write" && !a.keyed);

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "break",
    title: l("Sırayı boz", "Break the order"),
    goal: l(
      "Bir siparişin **sonraki** olayı, öncekinden **önce** işlensin.",
      "Get an order's **later** event handled **before** an earlier one.",
    ),
    hint: l(
      "Key'siz yazılan olaylar partition'lara sırayla dağılır. İkinci olayın düştüğü partition'ı okuyan consumer'ı çalıştır.",
      "Events without a key are spread over the partitions in turn. Run the consumer that owns the second event's partition.",
    ),
    par: 3,
    check: (ctx) => violations(ctx.state) > 0,
  },
  {
    id: "rekey",
    title: l("Key bile yetmedi", "Even the key wasn't enough"),
    goal: l(
      "Sadece **key ile** yazarak bir siparişin sırasını boz.",
      "Break an order's sequence while writing **with a key only**.",
    ),
    hint: l(
      "Aynı key hep aynı partition'a gider, partition sayısı değişmediği sürece.",
      "The same key always goes to the same partition, as long as the partition count stays the same.",
    ),
    par: 4,
    check: (ctx) => !usedUnkeyed(ctx) && violations(ctx.state) > 0,
  },
  {
    id: "drain",
    title: l("Önce boşalt, sonra büyüt", "Drain, then grow"),
    goal: l(
      "Topic 4 partition'a çıksın. **1042**'nin olayları iki ayrı partition'a düşsün ama sıra **hiç** bozulmasın. Sadece key ile yaz.",
      "Grow the topic to 4 partitions. Order **1042**'s events land in two different partitions, yet the order **never** breaks. Write with a key only.",
    ),
    hint: l(
      "Eski partition'daki olay işlenmeden partition eklersen, yeni olay onu geçebilir. Önce eskisini okut.",
      "If you add a partition before the old partition's event is handled, the new event can overtake it. Have the old one read first.",
    ),
    par: 5,
    check: (ctx) => {
      if (usedUnkeyed(ctx) || ctx.state.partitions.length < 4 || violations(ctx.state) > 0) return false;
      const where = new Set(ctx.state.partitions.flatMap((p, i) => (p.some((r) => r.order === "1042") ? [i] : [])));
      const written = ctx.state.written["1042"] ?? 0;
      const handled = ctx.state.processed.filter((x) => x.order === "1042").length;
      return where.size >= 2 && handled === written;
    },
  },
];
