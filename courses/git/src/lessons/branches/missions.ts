import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { currentBranch, headId, isAncestor, reachable } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn } from "../shared/missionHelpers";

const commitsOn = (ctx: GitCtx, branch: string) =>
  ctx.events.flat().flatMap((e) => (e.type === "committed" && e.branch === branch ? [e.id] : []));

const mainUntouched = (ctx: GitCtx) => ctx.state.branches.main === ctx.start.branches.main;

export const missions: Mission<GitCtx>[] = [
  {
    id: "own-path",
    title: l("Kendi yolu", "Its own path"),
    goal: l(
      "`login` branch'inde bir commit at; **main yerinde kalsın**. Sonunda main'e geri dön.",
      "Make a commit on the `login` branch while **main stays put**. End on main.",
    ),
    hint: l("Commit, sadece HEAD'in bağlı olduğu branch'i ilerletir.", "A commit moves only the branch HEAD is attached to."),
    par: 4,
    check: (ctx) => {
      const login = ctx.state.branches.login;
      return (
        Boolean(login) &&
        login !== ctx.start.branches.login &&
        isAncestor(ctx.state, ctx.start.branches.main!, login!) &&
        mainUntouched(ctx) &&
        currentBranch(ctx.state) === "main"
      );
    },
  },
  {
    id: "force-delete",
    title: l("Zorla sil", "Force delete"),
    goal: l(
      "`menu` adında bir branch aç, orada bir commit at, sonra main'e dön ve `menu`'yü **sil**.",
      "Open a branch called `menu`, commit on it, then go back to main and **delete** `menu`.",
    ),
    hint: l(
      "`-d` merge edilmemiş bir branch'i silmez. Emin olduğunda büyük `-D` gerekir.",
      "`-d` will not delete an unmerged branch. When you are sure, it takes a capital `-D`.",
    ),
    par: 5,
    check: (ctx) => {
      if (ctx.state.branches.menu || currentBranch(ctx.state) !== "main") return false;
      const live = reachable(ctx.state);
      return commitsOn(ctx, "menu").some((c) => !live.has(c));
    },
  },
  {
    id: "carry",
    title: l("Değişikliği taşı", "Carry the change"),
    goal: l(
      "main'deyken `app.js`'i değiştir, **commit atmadan** login'e geç ve değişikliği orada commit et. main hiç değişmesin.",
      "While on main, change `app.js`, switch to login **without committing**, and commit the change there. main must not change.",
    ),
    hint: l(
      "Commit edilmemiş değişiklikler branch'e ait değildir, klasöre aittir. Geçişte seninle gelirler.",
      "Uncommitted changes belong to the folder, not to a branch. They come with you when you switch.",
    ),
    par: 3,
    check: (ctx) => {
      // The edit has to happen while on main, before any switch.
      const firstWrite = ctx.actions.findIndex((a) => a.type === "write");
      if (firstWrite < 0 || currentBranch(ctx.states[firstWrite]!) !== "main") return false;
      const onLogin = commitsOn(ctx, "login").some((c) => changedIn(ctx.state, c).includes("app.js"));
      return onLogin && mainUntouched(ctx) && headId(ctx.state) !== null;
    },
  },
];
