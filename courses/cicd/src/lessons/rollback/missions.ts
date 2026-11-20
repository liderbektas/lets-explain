import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf, type World } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");
const prodBroke = (ctx: CiCtx) => ctx.states.some((s) => crashed(s, s.envs.production?.sha));
const rolledBack = (ctx: CiCtx) => ctx.events.flat().some((e) => e.type === "rolledBack");

export const missions: Mission<CiCtx>[] = [
  {
    id: "undo",
    title: l("Önce geri al", "Roll back first"),
    goal: l(
      "Bozuk bir commit production'a çıksın, sonra production yine sağlıklı olsun. main'deki kod **hâlâ bozuk** kalsın.",
      "A broken commit reaches production, then production is healthy again while the code on main is **still broken**.",
    ),
    hint: l("Düzeltmeyi beklemene gerek yok: bir önceki image registry'de duruyor.", "You need not wait for a fix: the previous image is still in the registry."),
    par: 2,
    check: (ctx) => prodBroke(ctx) && crashed(ctx.state, ctx.state.heads.main) && !crashed(ctx.state, ctx.state.envs.production?.sha),
  },
  {
    id: "then-fix",
    title: l("Geri al, sonra düzelt", "Roll back, then fix"),
    goal: l(
      "Bozuk commit production'a çıksın, sen geri al, sonra bir düzeltme gelsin ve production main'in son halini sağlıklı çalıştırsın.",
      "A broken commit reaches production, you roll back, then a fix arrives and production runs main's newest commit, healthy.",
    ),
    hint: l("Geri almak zaman kazandırır; düzeltme normal yoldan, push ile gelir.", "Rolling back buys time; the fix comes the normal way, with a push."),
    par: 3,
    check: (ctx) => {
      const w = ctx.state;
      return prodBroke(ctx) && rolledBack(ctx) && w.envs.production?.sha === w.heads.main && !crashed(w, w.heads.main);
    },
  },
];
