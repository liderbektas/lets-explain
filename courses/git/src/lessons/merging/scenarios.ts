import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, isAncestor, reachable, type GitAction, type Repo } from "../../engine/git";
import { commitsOf } from "../branches/parts";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { newCommits, repoAfter } from "../shared/missionHelpers";

const work = (path: string, content: string, message: string): GitAction[] => [
  { type: "write", path, content },
  { type: "add", paths: [path] },
  { type: "commit", message },
];
const sw = (target: string, create = false): GitAction => ({ type: "switch", target, create });

/** The shop on main: two commits. */
const SHOP: Repo = repoAfter(
  commitsOf([
    ["index.html", "<h1>Mağaza</h1>", "Proje başladı"],
    ["urunler.js", "ürünler", "Ürün listesi"],
  ]),
  createRepo({ author: ADA }),
);

/** `login` is one commit ahead of main (it can fast-forward); `menu` split off before main moved (it cannot). */
export const TWO_BRANCHES: Repo = repoAfter(
  [
    sw("menu", true),
    ...work("menu.js", "menü", "Menü"),
    sw("main"),
    ...work("index.html", "<h1>Mağaza</h1><nav>", "Ana sayfa"),
    sw("login", true),
    ...work("login.js", "giriş", "Giriş"),
    sw("main"),
  ],
  SHOP,
);

/** `branch`'s tip at the start is now in main. */
const inMain = (ctx: GitCtx, branch: string) => {
  const main = ctx.state.branches.main;
  return Boolean(main && isAncestor(ctx.state, ctx.start.branches[branch]!, main));
};

const newMerges = (ctx: GitCtx) => newCommits(ctx).filter((c) => ctx.state.commits[c]!.parents.length > 1);

/** Every commit reachable at the start is still reachable: nothing was thrown away. */
const nothingLost = (ctx: GitCtx) => {
  const live = reachable(ctx.state);
  return [...reachable(ctx.start)].every((c) => live.has(c));
};

export const scenarios: GitScenario[] = [
  {
    id: "bring-it-in",
    title: l("İşi main'e al", "Bring it into main"),
    story: l(
      "`search` branch'inde arama kutusunu bitirdin, testler geçiyor. Sen çalışırken main'e kimse bir şey eklemedi. Arama artık main'e girmeli. Şu an hâlâ `search`'tesin.",
      "You finished the search box on the `search` branch and the tests pass. Nobody added anything to main while you worked. Search should now go into main. You are still on `search`.",
    ),
    goal: l("Arama işi main'e girsin ve sen main'de ol.", "The search work is in main, and you are on main."),
    start: repoAfter([sw("search", true), ...work("arama.js", "arama kutusu", "Arama kutusu"), ...work("arama.js", "arama + sonuçlar", "Arama sonuçları")], SHOP),
    hints: [
      l("Merge her zaman **bulunduğun** branch'e yapılır. İşi alacak olan main.", "A merge always goes into the branch you are **on**. The one receiving the work is main."),
      l("Önce main'e geç, sonra `git merge` ile search'ü al.", "Switch to main first, then bring search in with `git merge`."),
      l("`git switch main` sonra `git merge search`", "`git switch main` then `git merge search`"),
    ],
    par: 2,
    check: (ctx) => inMain(ctx, "search") && currentBranch(ctx.state) === "main",
  },
  {
    id: "both-moved",
    title: l("İki taraf da ilerledi", "Both sides moved"),
    story: l(
      "`cart` branch'inde sepeti yazarken ekip main'e bir README ekledi. Sepet bitti; main'e alınmalı. İşi giren branch'e de artık gerek yok. main'desin.",
      "While you built the cart on the `cart` branch, the team added a README to main. The cart is done and should go into main. After that the branch is no longer needed. You are on main.",
    ),
    goal: l("Sepet main'e girsin, `cart` branch'i silinsin; **hiçbir commit kaybolmasın**.", "The cart is in main and the `cart` branch is deleted; **no commit is lost**."),
    start: repoAfter([sw("cart", true), ...work("sepet.js", "sepet", "Sepet"), sw("main"), ...work("README.md", "Mağaza projesi", "README")], SHOP),
    hints: [
      l("İki taraf da ilerlediği için düz bir kaydırma olmaz: Git iki ebeveynli bir merge commit'i atar.", "Both sides moved, so a straight slide is impossible: Git makes a merge commit with two parents."),
      l("Önce `git merge`, sonra güvenli silme `git branch -d`.", "First `git merge`, then the safe delete `git branch -d`."),
      l("`git merge cart` sonra `git branch -d cart`", "`git merge cart` then `git branch -d cart`"),
    ],
    par: 2,
    check: (ctx) => inMain(ctx, "cart") && !ctx.state.branches.cart && nothingLost(ctx),
  },
  {
    id: "leave-a-trace",
    title: l("İz bırak", "Leave a trace"),
    story: l(
      "Ekip kuralı: her özellik main'e bir **merge commit'iyle** girer, böylece geçmişte hangi commit'lerin birlikte geldiği görünür. `login` main'den bir commit ileride; düz bir merge sadece kaydırır, iz bırakmaz.",
      "Team rule: every feature goes into main with a **merge commit**, so the history shows which commits came in together. `login` is one commit ahead of main; a plain merge would just slide and leave no trace.",
    ),
    goal: l("`login` main'e bir merge commit'iyle girsin (fast-forward olmasın).", "`login` goes into main with a merge commit (no fast-forward)."),
    start: TWO_BRANCHES,
    hints: [
      l("`git log --oneline --all` ile bak: main kaymaya hazır. Kaydırmayı istemiyorsun.", "Look with `git log --oneline --all`: main is ready to slide. You don't want the slide."),
      l("Fast-forward mümkün olsa bile merge commit'i isteyen bir seçenek var: `--no-ff`.", "There's an option that asks for a merge commit even when a fast-forward is possible: `--no-ff`."),
      l("`git merge --no-ff login`", "`git merge --no-ff login`"),
    ],
    par: 1,
    check: (ctx) => newMerges(ctx).some((c) => ctx.state.commits[c]!.parents[1] === ctx.start.branches.login && c === ctx.state.branches.main),
  },
  {
    id: "release-day",
    title: l("Yayın günü", "Release day"),
    story: l(
      "Bugün yayın var ve kural sıkı: main'e sadece **düz kaydırmayla** (fast-forward) bir şey girecek, beklenmedik bir merge commit'i olmayacak. `login` ve `menu` hazır görünüyor, ama biri kaydırılabilir, diğeri değil. Sadece kaydırılabileni al.",
      "It's release day and the rule is strict: things go into main only by a **straight slide** (fast-forward), with no surprise merge commit. `login` and `menu` both look ready, but one can slide and the other can't. Take only the one that can.",
    ),
    goal: l("Kaydırılabilen branch main'e girsin; **yeni merge commit'i olmasın**, diğeri dışarıda kalsın.", "The branch that can slide is in main; **no new merge commit**, and the other one stays out."),
    start: TWO_BRANCHES,
    hints: [
      l("`git log --oneline --all` ile hangi branch'in main'in hemen üstünde durduğuna bak.", "Use `git log --oneline --all` to see which branch sits right on top of main."),
      l("`--ff-only` sadece kaydırma mümkünse merge eder; değilse durur. Yanlış seçersen bir şey bozulmaz.", "`--ff-only` merges only if a slide is possible, and stops otherwise. Pick wrong and nothing breaks."),
      l("`git merge --ff-only login`", "`git merge --ff-only login`"),
    ],
    par: 1,
    check: (ctx) => inMain(ctx, "login") && !inMain(ctx, "menu") && newMerges(ctx).length === 0,
  },
  {
    id: "one-merge",
    title: l("Tek merge", "One merge"),
    story: l(
      "Sprint bitti: `login` ve `menu`'nün ikisi de main'e girecek. Ekip geçmişin sade kalmasını istiyor: bu iki iş için **tek** bir merge commit'i yeterli. Sırayı doğru seçersen bu mümkün.",
      "The sprint is over: both `login` and `menu` go into main. The team wants a simple history: **one** merge commit is enough for the two. Pick the right order and that's possible.",
    ),
    goal: l("İkisi de main'e girsin; geçmişe **tek bir** yeni merge commit'i eklensin.", "Both are in main, with **only one** new merge commit in the history."),
    start: TWO_BRANCHES,
    hints: [
      l("Hangisi fast-forward olabilir? Kaydırma merge commit'i atmaz.", "Which one can fast-forward? A slide makes no merge commit."),
      l("Önce kaydırılabileni al; main ilerledikten sonra diğeri tek bir merge commit'iyle girer.", "Take the slidable one first; once main has moved, the other comes in with a single merge commit."),
      l("`git merge login` sonra `git merge menu`", "`git merge login` then `git merge menu`"),
    ],
    par: 2,
    check: (ctx) => inMain(ctx, "login") && inMain(ctx, "menu") && newMerges(ctx).length === 1,
  },
];
