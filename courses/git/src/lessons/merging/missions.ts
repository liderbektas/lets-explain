import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headId, isAncestor } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { newCommits } from "../shared/missionHelpers";

const merged = (ctx: GitCtx, branch: string) => {
  const tip = ctx.start.branches[branch]!;
  const main = ctx.state.branches.main;
  return Boolean(main) && isAncestor(ctx.state, tip, main!);
};

const newMerges = (ctx: GitCtx) => newCommits(ctx).filter((c) => ctx.state.commits[c]!.parents.length > 1);

export const missions: Mission<GitCtx>[] = [
  {
    id: "one-merge",
    title: l("Tek merge", "One merge"),
    goal: l(
      "`login` ve `menu`'nün ikisini de main'e al; geçmişte **tek bir** merge commit olsun.",
      "Bring both `login` and `menu` into main, with **only one** merge commit in the history.",
    ),
    hint: l(
      "Hangisi fast-forward olabilir? Sıra önemli.",
      "Which one can fast-forward? The order matters.",
    ),
    par: 2,
    check: (ctx) => merged(ctx, "login") && merged(ctx, "menu") && newMerges(ctx).length === 1,
  },
  {
    id: "keep-record",
    title: l("İz bırak", "Leave a trace"),
    goal: l(
      "`login`'i main'e **merge commit ile** al (fast-forward olmasın) ve sonra `login` branch'ini sil.",
      "Bring `login` into main **with a merge commit** (no fast-forward), then delete the `login` branch.",
    ),
    hint: l("Fast-forward mümkün olsa bile merge commit isteyen bir seçenek var.", "There is an option that asks for a merge commit even when a fast-forward is possible."),
    par: 2,
    check: (ctx) => {
      const tip = ctx.start.branches.login!;
      const record = newMerges(ctx).some((c) => ctx.state.commits[c]!.parents[1] === tip);
      return record && !ctx.state.branches.login && headId(ctx.state) === ctx.state.branches.main;
    },
  },
  {
    id: "clean-up",
    title: l("Temizlik", "Clean up"),
    goal: l(
      "İki branch'i de main'e al ve ikisini de sil. Sonunda geriye **sadece main** kalsın, hiçbir commit kaybolmasın.",
      "Bring both branches into main and delete both. In the end **only main** is left, and no commit is lost.",
    ),
    hint: l("`-d` merge edilmemiş bir branch'i silmez: önce birleştir, sonra sil.", "`-d` will not delete an unmerged branch: merge first, then delete."),
    par: 4,
    check: (ctx) =>
      Object.keys(ctx.state.branches).join(",") === "main" && merged(ctx, "login") && merged(ctx, "menu"),
  },
];
