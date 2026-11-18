import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import type { Ctx } from "./model";

/** Index of the first move whose events include one matching `test`, at or after `from`. */
const firstEvent = (ctx: Ctx, from: number, test: (e: Ctx["events"][number][number]) => boolean) => {
  for (let i = from; i < ctx.events.length; i++) if (ctx.events[i]!.some(test)) return i;
  return -1;
};

export const missions: Mission<Ctx>[] = [
  {
    id: "empty-broker",
    title: l("Boş broker", "The empty broker"),
    goal: l(
      "Broker 3'te hiç partition yok. Bir partition'ı oraya taşı ve sonra o partition'a bir sipariş yaz, kayıt **broker 3**'e gitsin.",
      "Broker 3 holds no partition. Move one there, then write an order to it so the record lands on **broker 3**.",
    ),
    hint: l("Bir partition satırındaki \"→ B3\" düğmesi onu broker 3'e taşır.", "The \"→ B3\" button on a partition row moves it to broker 3."),
    par: 2,
    check: (ctx) => ctx.events.flat().some((e) => e.type === "produced" && e.leader === 3),
  },
  {
    id: "maintenance",
    title: l("Bakım günü", "Maintenance day"),
    goal: l(
      "Broker 1'i kapat ama P0'a yazmak hiç durmasın: broker 1 kapandıktan **sonra** P0'a başarılı bir yazma yap.",
      "Shut broker 1 down without stopping writes to P0: make a successful write to P0 **after** broker 1 is down.",
    ),
    hint: l(
      "Çöken bir broker'daki partition'ı taşıyamazsın; kopyalanacak kimse kalmaz. Önce taşı, sonra kapat.",
      "You cannot move a partition off a broker that is already down: there is nothing left to copy from. Move first, then shut down.",
    ),
    par: 3,
    check: (ctx) => {
      const down = ctx.state.brokers.find((b) => b.id === 1)?.alive === false;
      const crashAt = ctx.actions.findIndex((a) => a.type === "crash" && a.broker === 1);
      if (!down || crashAt < 0) return false;
      return firstEvent(ctx, crashAt + 1, (e) => e.type === "produced" && e.partition === 0) >= 0;
    },
  },
  {
    id: "outage",
    title: l("Kesinti ve dönüş", "Outage and back"),
    goal: l(
      "Bir partition'a yazma **reddedilsin**, sonra aynı partition'a yeniden **başarıyla** yazılsın.",
      "Make a write to a partition **fail**, then write to that same partition **successfully** again.",
    ),
    hint: l("Partition'ın tek kopyası bir broker'da. O broker yokken ne olur? Geri gelince?", "The partition's only copy is on one broker. What happens while that broker is gone? And when it is back?"),
    par: 4,
    check: (ctx) => {
      for (let i = 0; i < ctx.events.length; i++) {
        const rejected = ctx.events[i]!.find((e) => e.type === "rejected");
        if (!rejected || rejected.type !== "rejected") continue;
        if (firstEvent(ctx, i + 1, (e) => e.type === "produced" && e.partition === rejected.partition) >= 0) return true;
      }
      return false;
    },
  },
];
