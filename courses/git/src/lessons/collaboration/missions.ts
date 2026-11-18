import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { BORA, currentBranch, type Repo } from "../../engine/git";
import { onOrigin } from "../remotes/missions";
import type { GitCtx } from "../shared/GitScene";

const isNew = (ctx: GitCtx, id: string) => !ctx.start.commits[id] && !ctx.start.remote?.commits[id];
const commitOf = (repo: Repo, id: string) => repo.commits[id] ?? repo.remote?.commits[id];

/** Every commit Bora ever pushed is still reachable from origin's main. */
const boraSafe = (ctx: GitCtx) => {
  const remote = ctx.state.remote;
  if (!remote) return false;
  const main = onOrigin(ctx.state, "main");
  return Object.values(remote.commits).every((c) => c.author !== BORA || main.has(c.id));
};

export const missions: Mission<GitCtx>[] = [
  {
    id: "straight-line",
    title: l("Düz çizgi", "Straight line"),
    goal: l(
      "Bora **önce** push etsin, sonra sen bir commit at ve gönder. Sonunda origin'deki main'in **en üstünde senin commit'in**, altında Bora'nınki olsun ve **hiç merge commit olmasın**: geçmiş düz bir çizgi.",
      "Let Bora push **first**, then make a commit and send it. In the end origin's main has **your commit on top** with Bora's under it, and **no merge commit**: a straight line.",
    ),
    hint: l(
      "pull iki türlü birleştirebilir. Senin commit'ini onunkinin üstüne taşıyan hangisiydi?",
      "pull can combine in two ways. Which one moves your commit on top of his?",
    ),
    par: 5,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      // Bora first, you on top: the tip is yours and his commit sits underneath it.
      if (!tip || !isNew(ctx, tip) || commitOf(ctx.state, tip)!.author === BORA) return false;
      const main = [...onOrigin(ctx.state, "main")].filter((c) => isNew(ctx, c));
      const his = main.some((c) => commitOf(ctx.state, c)!.author === BORA);
      const merges = main.some((c) => commitOf(ctx.state, c)!.parents.length > 1);
      return his && !merges;
    },
  },
  {
    id: "safe-amend",
    title: l("Güvenli düzeltme", "Safe fix-up"),
    goal: l(
      "Son commit'in zaten origin'de. Mesajını `--amend` ile düzelt ve origin'e gönder. Kurallar: `--force` **kullanmak yok** ve Bora'nın hiçbir commit'i origin'den silinmeyecek.",
      "Your last commit is already on origin. Fix its message with `--amend` and send it to origin. Rules: **no `--force`**, and none of Bora's commits may disappear from origin.",
    ),
    hint: l(
      "Amend geçmişi değiştirir, düz push reddedilir. Zorla göndermenin bir de güvenli hali vardı.",
      "Amend rewrites history, so a plain push is refused. There is a safe way to force.",
    ),
    par: 2,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      const before = ctx.start.branches.main;
      if (!tip || !before || !isNew(ctx, tip)) return false;
      const amended = commitOf(ctx.state, tip)!;
      const original = ctx.start.commits[before]!;
      const sameParents = amended.parents.join() === original.parents.join();
      const noForce = !ctx.actions.some((a) => a.type === "push" && a.force === "force");
      return sameParents && amended.message !== original.message && noForce && boraSafe(ctx);
    },
  },
  {
    id: "pr-ready",
    title: l("PR'a hazır", "Ready for a PR"),
    goal: l(
      "`feature` branch'ini aç, bir commit at, origin'e **takip bağlantısıyla** gönder ve main'e geri dön. Artık GitHub'da pull request açılabilir.",
      "Create a `feature` branch, make a commit, send it to origin **with tracking set up**, and go back to main. Now a pull request can be opened on GitHub.",
    ),
    hint: l("Yeni branch'in ilk push'u `-u` ister.", "A new branch's first push needs `-u`."),
    par: 5,
    check: (ctx) => {
      // A new commit built on top of main, not an amended copy of an old one.
      const base = ctx.start.branches.main;
      const ok = [...onOrigin(ctx.state, "feature")].some((c) => isNew(ctx, c) && commitOf(ctx.state, c)!.parents[0] === base);
      return ok && ctx.state.upstream.feature === "origin/feature" && currentBranch(ctx.state) === "main";
    },
  },
];
