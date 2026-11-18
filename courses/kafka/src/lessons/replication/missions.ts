import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import type { Ctx } from "./model";

export const missions: Mission<Ctx>[] = [
  {
    id: "new-leader",
    title: l("Yeni lider", "A new leader"),
    goal: l(
      "P0'ın leader'ı broker 1'den **başka** bir broker olsun ve yeni leader'a yazılan bir sipariş **onay** alsın.",
      "Make a broker **other than** broker 1 lead P0, and get an **ack** for an order written to the new leader.",
    ),
    hint: l("Leader'ın yerini kim alır? ISR listesindeki bir follower. Ona fırsat ver.", "Who takes over from a leader? A follower in the ISR. Give it the chance."),
    par: 2,
    check: (ctx) => {
      const p = ctx.state.partitions[0]!;
      if (p.leader === null || p.leader === 1) return false;
      return ctx.events.flat().some((e) => e.type === "acked") && ctx.events.flat().some((e) => e.type === "leaderElected");
    },
  },
  {
    id: "lonely-isr",
    title: l("Yalnız leader", "A lonely leader"),
    goal: l(
      "Hiçbir broker çökmeden P0'ın ISR listesinde **sadece leader** kalsın.",
      "Without crashing any broker, shrink P0's ISR down to **just the leader**.",
    ),
    hint: l(
      "Bir follower ancak geride kalırsa ve zaman geçerse ISR'den çıkar. Geride kalması için yeni kayıt gerekir.",
      "A follower leaves the ISR only if it falls behind and time passes. To fall behind, it needs new records to miss.",
    ),
    par: 4,
    check: (ctx) => ctx.state.brokers.every((b) => b.alive) && ctx.state.partitions[0]!.isr.length === 1,
  },
  {
    id: "unclean-loss",
    title: l("Bilerek kayıp", "Losing data on purpose"),
    goal: l(
      "Producer'a onaylanmış bir siparişin **kaybolmasına** yol aç. Kafka bunu varsayılan ayarlarla engeller; nasıl izin verildiğini bul.",
      "Cause an acknowledged order to be **lost**. Kafka prevents this with default settings; find out how it is allowed.",
    ),
    hint: l(
      "Geride kalmış bir broker'ın leader olabilmesi için senkron kopyaların hepsi gitmeli ve unclean seçime izin verilmeli.",
      "For a broker that fell behind to become leader, every in-sync copy must be gone and unclean election must be allowed.",
    ),
    par: 6,
    check: (ctx) => ctx.state.sends.some((x) => x.status === "lost"),
  },
];
