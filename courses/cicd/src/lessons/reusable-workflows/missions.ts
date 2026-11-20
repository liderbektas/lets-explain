import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Ctx } from "../shared/SimScene";
import { nodeOf, PLACES, WFS, type RW, type RwAction, type RwEvent } from "./model";

export type RwCtx = Ctx<RW, RwAction, RwEvent>;

export const missions: Mission<RwCtx>[] = [
  {
    id: "node-22",
    title: l("Herkes Node 22'de", "Everyone on Node 22"),
    goal: l("Üç workflow'u çalıştır ve üçü de **Node 22** ile çalışsın.", "Run the three workflows and have all three use **Node 22**."),
    hint: l("Şimdilik en kısa yol, kopyaların her birini düzeltmek.", "For now the shortest way is to fix each copy."),
    par: 4,
    check: (ctx) => ctx.events.some((evs) => {
      const ran = evs.filter((e) => e.type === "ran");
      return ran.length === 3 && ran.every((e) => e.type === "ran" && e.node === 22);
    }),
  },
  {
    id: "one-edit",
    title: l("Bir sonraki sefer tek düzenleme", "Next time, one edit"),
    goal: l(
      "Üç workflow da Node 22 kullansın **ve** bundan sonraki Node yükseltmesi tek bir dosyada tek bir değişiklik olsun.",
      "All three workflows use Node 22 **and** the next Node upgrade becomes a single change in a single file.",
    ),
    hint: l("Setup adımlarını bir yere topla, Node'u orada değiştir.", "Gather the setup steps in one place and change Node there."),
    par: 5,
    check: ({ state: s }) =>
      s.composite.exists && s.composite.node === 22 && PLACES.every((p) => !s.places[p].exists || s.places[p].setup === "composite") && WFS.every((wf) => nodeOf(s, wf) === 22),
  },
  {
    id: "shared-job",
    title: l("Aynı job tek dosyada", "One job, one file"),
    goal: l("`ci.yml` ve `release.yml` aynı `test` job'ını tek bir dosyadan çağırsın.", "Have `ci.yml` and `release.yml` call the same `test` job from one file."),
    hint: l("Bütün bir job'ı paylaşmak için workflow'u çağrılabilir yap.", "To share a whole job, make a workflow callable."),
    par: 3,
    check: ({ state: s }) => s.calls.ci && s.calls.release,
  },
];
