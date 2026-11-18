import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { aheadBehind, ancestors, BORA, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

/** Commits reachable from a branch on origin, using origin's own object store. */
export function onOrigin(repo: Repo, branch: string): Set<string> {
  const remote = repo.remote;
  const tip = remote?.branches[branch];
  if (!remote || !tip) return new Set();
  const seen = new Set<string>();
  const stack = [tip];
  while (stack.length) {
    const c = stack.pop()!;
    if (seen.has(c) || !remote.commits[c]) continue;
    seen.add(c);
    stack.push(...remote.commits[c]!.parents);
  }
  return seen;
}

/** Commits that did not exist anywhere when the try-it step began. */
const isNew = (ctx: GitCtx, id: string) => !ctx.start.commits[id] && !ctx.start.remote?.commits[id];
const authorOf = (repo: Repo, id: string) => (repo.commits[id] ?? repo.remote?.commits[id])?.author;

export const missions: Mission<GitCtx>[] = [
  {
    id: "you-on-top",
    title: l("En üstte sen", "You on top"),
    goal: l(
      "Bora **önce** push etsin. Sonra sen bir commit at ve gönder. Sonunda origin'deki main'in **en üstünde senin commit'in** olsun ve Bora'nınki de içinde dursun.",
      "Let Bora push **first**. Then make a commit and send it. In the end origin's main has **your commit on top**, with Bora's inside it too.",
    ),
    hint: l(
      "Bora'dan sonra yaptığın push reddedilir. Önce onun commit'ini kendine al.",
      "Your push after Bora's is rejected. Bring his commit in first.",
    ),
    par: 5,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      if (!tip || !isNew(ctx, tip) || authorOf(ctx.state, tip) === BORA) return false;
      return [...onOrigin(ctx.state, "main")].some((c) => isNew(ctx, c) && authorOf(ctx.state, c) === BORA);
    },
  },
  {
    id: "just-look",
    title: l("Sadece bak", "Just look"),
    goal: l(
      "Bora bir commit push etsin. Onu **kendi bilgisayarında** gör (`origin/main`), ama kendi `main` branch'in yerinden oynamasın.",
      "Let Bora push a commit. See it **on your computer** (`origin/main`), but your own `main` must not move.",
    ),
    hint: l("Uzaktakini indiren ama hiçbir şeyi birleştirmeyen komut hangisiydi?", "Which command downloads without merging anything?"),
    par: 2,
    check: (ctx) => {
      const tracking = ctx.state.tracking["origin/main"];
      if (!tracking || ctx.state.branches.main !== ctx.start.branches.main) return false;
      return [...ancestors(ctx.state, tracking)].some((c) => isNew(ctx, c) && authorOf(ctx.state, c) === BORA);
    },
  },
  {
    id: "two-ahead",
    title: l("İki adım önde", "Two ahead"),
    goal: l(
      "`main` branch'in `origin/main`'den **2 commit önde** olsun. Hiçbir şey göndermeden.",
      "Get `main` **2 commits ahead** of `origin/main`, without sending anything.",
    ),
    hint: l("Önde olmak, uzağın henüz bilmediği yerel commit'lerin olması demek.", "Being ahead means having local commits the remote does not know yet."),
    par: 4,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      const tracking = ctx.state.tracking["origin/main"];
      if (!main || !tracking) return false;
      return aheadBehind(ctx.state, main, tracking).ahead === 2 && ctx.state.remote?.branches.main === ctx.start.remote?.branches.main;
    },
  },
  {
    id: "publish",
    title: l("Branch'i yayınla", "Publish a branch"),
    goal: l(
      "`feature` adında bir branch aç, üstüne bir commit at ve onu **origin'e gönder**.",
      "Create a branch called `feature`, make a commit on it and **send it to origin**.",
    ),
    hint: l(
      "Yeni bir branch'i ilk kez gönderirken Git'e uzakta neyle eşleşeceğini söylemen gerekir.",
      "The first time you push a new branch, Git needs to be told what it matches on the remote.",
    ),
    par: 4,
    check: (ctx) => [...onOrigin(ctx.state, "feature")].some((c) => isNew(ctx, c) && authorOf(ctx.state, c) !== BORA && (ctx.state.remote!.commits[c]!.parents.length === 1)),
  },
];
