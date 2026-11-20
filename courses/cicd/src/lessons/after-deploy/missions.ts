import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf, type World } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");
const crashReachedStaging = (ctx: CiCtx) => ctx.events.flat().some((e) => e.type === "deployed" && e.env === "staging" && crashed(ctx.state, e.sha));
const smokeFailed = (ctx: CiCtx) => ctx.state.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === "smoke" && s.status === "failure")));
const healed = (ctx: CiCtx) => crashReachedStaging(ctx) && !crashed(ctx.state, ctx.state.envs.staging?.sha) && ctx.events.flat().some((e) => e.type === "rolledBack");

export const missions: Mission<CiCtx>[] = [
  {
    id: "catch",
    title: l("Kırmızıya çevir", "Turn it red"),
    goal: l(
      "Bozuk bir deploy, run'ı **smoke test adımında** kırmızıya çevirsin.",
      "Make a broken deploy turn the run red **at the smoke test step**.",
    ),
    hint: l("Deploy'un başarılı olması sitenin çalıştığını söylemez; birinin bakması gerek.", "A successful deploy does not mean the site works; something has to look."),
    par: 2,
    check: smokeFailed,
  },
  {
    id: "self-heal",
    title: l("Kendi kendini toparla", "Heal by itself"),
    goal: l(
      "Bozuk bir commit staging'e çıksın ve pipeline **kendisi** staging'i sağlam sürüme geri alsın.",
      "A broken commit reaches staging, and the pipeline **itself** puts staging back on a healthy version.",
    ),
    hint: l("Geri alma adımı sadece önceki bir adım kırılırsa çalışır.", "The rollback step only runs if an earlier step failed."),
    par: 3,
    check: healed,
  },
  {
    id: "tell-team",
    title: l("Ekibe haber ver", "Tell the team"),
    goal: l(
      "Pipeline bozuk deploy'u kendisi geri alsın **ve** ekibe bir mesaj göndersin.",
      "The pipeline rolls the broken deploy back by itself **and** sends the team a message.",
    ),
    hint: l("Haber verme adımı da `if: failure()` ile çalışır.", "The message step runs with `if: failure()` too."),
    par: 4,
    check: (ctx) => healed(ctx) && ctx.events.flat().some((e) => e.type === "notified"),
  },
];
