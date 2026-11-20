import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf, SHAS, type World } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const START_SHA = SHAS[0]!;
const prod = (w: World) => w.envs.production?.sha ?? null;
const healthy = (w: World, sha: string | null) => Boolean(sha) && !commitOf(w, sha!).bugs.includes("crash");

/** Was `sha` running on staging in some state before index `i`? */
const stagedBefore = (ctx: CiCtx, sha: string, i: number) => ctx.states.slice(0, i).some((s) => s.envs.staging?.sha === sha);

/** Index of the first state where production runs its final commit. */
const prodArrived = (ctx: CiCtx) => ctx.states.findIndex((s) => prod(s) === prod(ctx.state));

export const missions: Mission<CiCtx>[] = [
  {
    id: "tested-to-prod",
    title: l("Test edilen prod'a", "Tested goes to prod"),
    goal: l(
      "Production yeni bir commit çalıştırsın, sağlam olsun ve o commit prod'dan **önce** staging'de çalışmış olsun.",
      "Get production running a new commit that is healthy and that ran on staging **before** it reached prod.",
    ),
    hint: l("Push'un ürettiği image önce staging'e, sonra aynısı production'a.", "The image a push produces goes to staging first, then the same one to production."),
    par: 3,
    check: (ctx) => {
      const sha = prod(ctx.state);
      return sha !== START_SHA && healthy(ctx.state, sha) && stagedBefore(ctx, sha!, prodArrived(ctx));
    },
  },
  {
    id: "untested",
    title: l("Kasten hata", "A mistake on purpose"),
    goal: l(
      "Tuzağı kendin gör: production, staging'de **hiç** çalışmamış yeni bir commit'e geçsin.",
      "See the trap yourself: get production onto a new commit that **never** ran on staging.",
    ),
    hint: l("Production'ı main'den yeniden build etmek, staging'e sormaz.", "Rebuilding production from main does not ask staging."),
    par: 2,
    check: (ctx) => {
      const sha = prod(ctx.state);
      return sha !== START_SHA && !ctx.states.some((s) => s.envs.staging?.sha === sha);
    },
  },
  {
    id: "main-moved",
    title: l("main ilerledi", "main moved on"),
    goal: l(
      "main'in son commit'i bozuk olsun ama production, staging'de test edilmiş yeni ve sağlam bir commit çalıştırsın.",
      "main's newest commit is broken, yet production runs a new, healthy commit that was tested on staging.",
    ),
    hint: l("Production'a gönderdiğin şey main'in son hali değil, staging'deki image.", "What you send to production is the image on staging, not whatever main is now."),
    par: 4,
    check: (ctx) => {
      const w = ctx.state;
      const sha = prod(w);
      return commitOf(w, w.heads.main!).bugs.includes("crash") && sha !== START_SHA && healthy(w, sha) && stagedBefore(ctx, sha!, prodArrived(ctx));
    },
  },
];
