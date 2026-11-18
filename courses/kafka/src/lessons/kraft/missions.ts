import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { stranded, type Ctx } from "./model";

const indexOf = (ctx: Ctx, test: (e: Ctx["events"][number][number]) => boolean, from = 0) => {
  for (let i = from; i < ctx.events.length; i++) if (ctx.events[i]!.some(test)) return i;
  return -1;
};

export const missions: Mission<Ctx>[] = [
  {
    id: "new-active",
    title: l("Taht değişimi", "Changing of the guard"),
    goal: l(
      "Aktif controller çöksün, yerine **yenisi seçilsin** ve sonra bir topic oluşturulsun.",
      "Bring the active controller down, get a **new one elected**, then create a topic.",
    ),
    hint: l("Hangi controller aktif? Üstündeki \"aktif\" etiketine bak.", "Which controller is active? Look for the \"active\" tag above it."),
    par: 2,
    check: (ctx) => {
      const at = indexOf(ctx, (e) => e.type === "elected");
      return at >= 0 && indexOf(ctx, (e) => e.type === "topicCreated", at) >= 0;
    },
  },
  {
    id: "frozen",
    title: l("Donmuş metadata", "Frozen metadata"),
    goal: l(
      "Bir topic oluşturma isteği **reddedilsin**, çünkü kimse metadata'ya yazamıyor.",
      "Get a create-topic request **refused** because nobody can write metadata.",
    ),
    hint: l("Bir değişiklik ancak controller'ların çoğunluğu ayaktaysa yazılabilir.", "A change can only be written while a majority of controllers is up."),
    par: 3,
    check: (ctx) => ctx.events.flat().some((e) => e.type === "rejected"),
  },
  {
    id: "stranded",
    title: l("Sahipsiz partition", "Stranded partition"),
    goal: l(
      "Bir partition'ın leader'ı çökmüş bir broker'da **takılı kalsın**: kimse yeni leader seçemesin.",
      "Leave a partition **stuck** with a crashed broker as its leader, with nobody able to pick a new one.",
    ),
    hint: l("Broker'ın çöktüğünü fark edip kararı yazacak bir aktif controller olmamalı.", "There must be no active controller to notice the broker died and write the decision."),
    par: 3,
    check: (ctx) => ctx.state.active === null && stranded(ctx.state).length > 0,
  },
  {
    id: "rescue",
    title: l("Kurtarma", "The rescue"),
    goal: l(
      "Önce bir partition sahipsiz kalsın (kimse karar yazamadığı için), sonra cluster kendini toparlasın: sonunda **bütün partition'ların** ayakta bir leader'ı olsun.",
      "First leave a partition stranded (because nobody can write decisions), then let the cluster recover: in the end **every partition** has a live leader.",
    ),
    hint: l(
      "Çoğunluğu geri getirmek yeter: yeni aktif controller, yokken olanları fark edip kararları yazar.",
      "Bringing the majority back is enough: the new active controller notices what happened while nobody was in charge and writes the decisions.",
    ),
    par: 4,
    check: (ctx) => {
      const stuck = indexOf(ctx, (e) => e.type === "brokerDown" && !e.noticed);
      return stuck >= 0 && indexOf(ctx, (e) => e.type === "leaderMoved", stuck) >= 0 && stranded(ctx.state).length === 0;
    },
  },
];
