import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { ancestors, currentBranch, isAncestor, status, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn, newCommits } from "../shared/missionHelpers";

/** Commits I made that changed app.js. */
const mine = (ctx: GitCtx) => newCommits(ctx).filter((c) => ctx.state.commits[c]!.author === ctx.state.author && changedIn(ctx.state, c).includes("app.js"));

/** True when every commit on the remote's main has at most one parent: a straight line. */
const linear = (repo: Repo, tip: string) => [...ancestors({ ...repo, commits: { ...repo.commits, ...repo.remote!.commits } }, tip)].every((c) => (repo.remote!.commits[c] ?? repo.commits[c])!.parents.length <= 1);

export const missions: Mission<GitCtx>[] = [
  {
    id: "feature-pr",
    title: l("PR'a hazır", "Ready for a PR"),
    goal: l(
      "`feature` adlı bir branch aç, orada `app.js`'i değiştirip commit at ve branch'i origin'e gönder. **main'e dokunma.**",
      "Open a branch called `feature`, change `app.js` there and commit, then send the branch to origin. **Leave main alone.**",
    ),
    hint: l("Yeni bir branch'i ilk kez gönderirken Git'e nereye gideceğini söylemen gerekir.", "The first push of a new branch needs to tell Git where it goes."),
    par: 4,
    check: (ctx) => {
      const r = ctx.state.remote!;
      const tip = r.branches.feature;
      if (!tip || ctx.state.branches.main !== ctx.start.branches.main) return false;
      return mine(ctx).some((c) => isAncestor({ ...ctx.state, commits: { ...ctx.state.commits, ...r.commits } }, c, tip)) && ctx.state.upstream.feature === "origin/feature";
    },
  },
  {
    id: "trunk",
    title: l("Düz çizgi", "A straight line"),
    goal: l(
      "Doğrudan main'de `app.js`'i değiştir, commit at ve push et. Uzakta henüz görmediğin bir commit var: geçmiş **düz kalsın**, merge commit olmasın.",
      "Change `app.js` straight on main, commit and push. The remote has a commit you have not seen yet: keep history **a straight line**, with no merge commit.",
    ),
    hint: l("Başkalarının işini alırken kendi commit'ini onların üstüne koymanın bir yolu var.", "There is a way to take the others' work and put your commit on top of it."),
    par: 4,
    check: (ctx) => {
      const r = ctx.state.remote!;
      const tip = r.branches.main!;
      const all = { ...ctx.state, commits: { ...ctx.state.commits, ...r.commits } };
      const teammate = ctx.start.remote!.branches.main!;
      return (
        mine(ctx).some((c) => isAncestor(all, c, tip)) &&
        isAncestor(all, teammate, tip) &&
        linear(ctx.state, tip) &&
        ctx.state.branches.main === tip
      );
    },
  },
  {
    id: "wrong-branch",
    title: l("Yanlış branch", "Wrong branch"),
    goal: l(
      "Bir değişikliği **yanlışlıkla main'de** commit'le (henüz push etme). Sonra o commit'i `feature` adlı bir branch'e taşı ve main'i `origin/main` ile aynı yap.",
      "Commit a change **on main by mistake** (do not push). Then move that commit to a branch called `feature` and make main match `origin/main` again.",
    ),
    hint: l(
      "Önce commit'e bir isim ver ki kaybolmasın; sonra main'i geri çek.",
      "Give the commit a name first so it is not lost; then pull main back.",
    ),
    par: 4,
    check: (ctx) => {
      const onMain = ctx.events.flat().some((e) => e.type === "committed" && e.branch === "main");
      const feature = ctx.state.branches.feature;
      return (
        onMain &&
        Boolean(feature) &&
        mine(ctx).some((c) => isAncestor(ctx.state, c, feature!) && !isAncestor(ctx.state, c, ctx.state.branches.main!)) &&
        ctx.state.branches.main === ctx.state.tracking["origin/main"] &&
        currentBranch(ctx.state) === "main" &&
        status(ctx.state).clean
      );
    },
  },
];
