import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf, SHAS, type World } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");

export const missions: Mission<CiCtx>[] = [
  {
    id: "gate",
    title: l("Kapıdan geçir", "Through the gate"),
    goal: l(
      "Production için onay şartı açık olsun ve yeni bir commit production'a **senin onayınla** gitsin.",
      "Production requires an approval, and a new commit reaches production **with your approval**.",
    ),
    hint: l("Önce kapıyı kur, sonra push'la; run production'da bekleyecek.", "Set up the gate first, then push; the run will wait at production."),
    par: 3,
    check: (ctx) =>
      Boolean(ctx.state.envs.production?.approval) &&
      ctx.state.envs.production?.sha !== SHAS[0] &&
      ctx.events.flat().some((e) => e.type === "approved" && e.env === "production"),
  },
  {
    id: "stop-bad",
    title: l("Kötü sürüm kapıda kalsın", "Stop the bad one at the gate"),
    goal: l(
      "Bozuk bir commit staging'e çıksın ama production'a **hiç** ulaşmasın.",
      "A broken commit reaches staging but **never** reaches production.",
    ),
    hint: l("Bozuk commit gelmeden önce production'a bir bekçi koy.", "Put a guard on production before the broken commit arrives."),
    par: 2,
    check: (ctx) => ctx.states.some((s) => crashed(s, s.envs.staging?.sha)) && !ctx.states.some((s) => crashed(s, s.envs.production?.sha)),
  },
  {
    id: "by-hand",
    title: l("Eski sürümü staging'de dene", "Try an old version on staging"),
    goal: l(
      "Staging, main'in son halinden **daha eski** bir commit çalıştırsın; bunu elle tetiklenen bir run yapsın.",
      "Staging runs a commit **older** than main's newest, put there by a run you started by hand.",
    ),
    hint: l("`workflow_dispatch` ile hangi sürümü istediğini söyleyebilirsin.", "With `workflow_dispatch` you can say which version you want."),
    par: 2,
    check: (ctx) => {
      const w = ctx.state;
      const last = [...w.runs].reverse().find((r) => r.jobs.some((j) => j.id === "staging" && j.status === "success"));
      return w.envs.staging?.sha !== w.heads.main && last?.event === "dispatch";
    },
  },
];
