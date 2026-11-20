import { l } from "@lets-explain/core/i18n";
import { ADA, ancestors, createRepo, currentBranch, resolve, short, status, type GitAction } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commitAll = (message: string): GitAction[] => [{ type: "add", paths: "." }, { type: "commit", message }];
const sw = (target: string, create = false): GitAction => ({ type: "switch", target, create: create || undefined });

/** The shop project on its first commit. */
export const SHOP = repoAfter(
  [write("README.md", "# Shop"), write("app.js", "showProducts()"), write("prices.js", "price = x * 1.2"), ...commitAll("Initial shop")],
  createRepo({ author: ADA }),
);

/** Half-done filter work in app.js, on `feature` (which already changed app.js, so main can't be checked out over it). */
export const WIP = "showProducts()\nsearch()\nfilter( // yarım";
const onFeature = (from = SHOP) => repoAfter([sw("feature", true), write("app.js", "showProducts()\nsearch()"), ...commitAll("Add search"), write("app.js", WIP)], from);

/** The half-done change is back in the folder on feature, still uncommitted, and the stash is empty. */
const wipWaiting = (ctx: GitCtx) => currentBranch(ctx.state) === "feature" && ctx.state.work["app.js"] === WIP && status(ctx.state).unstaged.some((c) => c.path === "app.js") && ctx.state.stash.length === 0;

/* A teammate's branch with one good commit between two experiments. */
const withExperiment = repoAfter(
  [
    sw("experiment", true),
    write("confetti.js", "confetti()"),
    ...commitAll("Try confetti"),
    write("prices.js", "price = round(x * 1.2, 2)"),
    ...commitAll("Fix price rounding"),
    write("confetti.js", "confetti({ big: true })"),
    ...commitAll("More confetti"),
    sw("main"),
  ],
  SHOP,
);
export const ROUNDING = resolve(withExperiment, "experiment~1")!;

/* A commit made on main that belonged on feature. */
const wrongBranch = repoAfter([sw("feature", true), write("search.js", "search()"), ...commitAll("Add search"), sw("main"), write("wishlist.js", "wishlist()"), ...commitAll("Add wishlist")], SHOP);
export const WISHLIST = wrongBranch.branches.main!;

export const scenarios: GitScenario[] = [
  {
    id: "put-aside",
    title: l("Kenara kaldır", "Put it aside"),
    story: l(
      "`feature`'da filtre üzerinde çalışıyorsun, `app.js` yarım. Testleri son commit üzerinde temiz bir klasörle çalıştırman gerekiyor. Yarım işi commit'lemek istemiyorsun, kaybetmek de.",
      "You're on `feature` building a filter, and `app.js` is half done. You need to run the tests on the last commit with a clean folder. You don't want to commit the half-done work, and you don't want to lose it.",
    ),
    goal: l("Klasör temiz olsun; yarım iş stash'te saklansın.", "The folder is clean; the half-done work is kept in the stash."),
    start: onFeature(),
    hints: [
      l("Commit atmadan değişiklikleri bir kenara kaldırıp sonra geri almanın yolu var.", "There's a way to put changes aside without a commit and take them back later."),
      l("`git stash` kaydedilmemiş değişiklikleri bir yığına koyar ve klasörü son commit'e döndürür. `-m` ile ad verebilirsin.", "`git stash` puts unsaved changes on a stack and returns the folder to the last commit. `-m` gives it a name."),
      l('`git stash push -m "filter wip"`', '`git stash push -m "filter wip"`'),
    ],
    par: 1,
    check: (ctx) => status(ctx.state).clean && ctx.state.stash.length === 1 && ctx.state.stash[0]!.work["app.js"] === WIP,
  },
  {
    id: "urgent-fix",
    title: l("Acil düzeltme", "Urgent fix"),
    story: l(
      "Filtre işin yarımken ekipten mesaj geldi: main'deki `README.md`'de başlık **# Sohp** yazıyor, hemen düzeltilmeli. main'e geçmeye çalışırsan Git yarım işin yüzünden reddedecek.",
      "Your filter work is half done when the team messages: `README.md` on main says **# Sohp**, fix it right now. If you try to switch to main, Git will refuse because of your half-done work.",
    ),
    goal: l(
      "main'de README başlığı **# Shop** olarak düzeltilip commit'lensin; sonra `feature`'a dön, yarım işin klasörde beklesin.",
      "On main, fix the README title to **# Shop** and commit; then go back to `feature` with your half-done work waiting in the folder.",
    ),
    start: onFeature(repoAfter([write("README.md", "# Sohp"), ...commitAll("Add README title")], SHOP)),
    hints: [
      l("Yarım işle branch değiştiremezsin. Önce onu kaldır, işin bitince geri aç.", "You can't switch branches with half-done work. Put it away first, and take it back when you're done."),
      l("`git stash`, `git switch main`, dosyayı düzelt ve commit at, `git switch feature`, `git stash pop`.", "`git stash`, `git switch main`, fix the file and commit, `git switch feature`, `git stash pop`."),
      l(
        '`git stash`, `git switch main`, `echo "# Shop" > README.md`, `git commit -am "Fix README title"`, `git switch feature`, `git stash pop`',
        '`git stash`, `git switch main`, `echo "# Shop" > README.md`, `git commit -am "Fix README title"`, `git switch feature`, `git stash pop`',
      ),
    ],
    par: 6,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      if (!main || ctx.state.commits[main]!.files["README.md"] !== "# Shop") return false;
      const onMain = ancestors(ctx.state, main);
      const fixed = newCommits(ctx).some((c) => onMain.has(c) && changedIn(ctx.state, c).includes("README.md"));
      return fixed && wipWaiting(ctx);
    },
  },
  {
    id: "pick-one",
    title: l("Sadece birini al", "Take just one"),
    story: l(
      "Bir takım arkadaşının `experiment` branch'inde üç commit var: iki konfeti denemesi ve arada **\"Fix price rounding\"**. Konfetiler main'e girmemeli, ama fiyat düzeltmesi hemen lazım.",
      "A teammate's `experiment` branch has three commits: two confetti experiments with **\"Fix price rounding\"** in between. The confetti must not reach main, but the price fix is needed now.",
    ),
    goal: l("main'e **sadece** \"Fix price rounding\" kopyalansın; konfeti dosyası main'e girmesin.", "**Only** \"Fix price rounding\" is copied onto main; no confetti file reaches main."),
    start: withExperiment,
    hints: [
      l("Bir branch'i merge etmek hepsini getirir. Tek bir commit'i kopyalamanın ayrı bir komutu var.", "Merging a branch brings everything. There's a separate command for copying one commit."),
      l("`git log experiment --oneline` ile commit'in kimliğini bul, sonra `git cherry-pick` ile kopyala.", "Find the commit's id with `git log experiment --oneline`, then copy it with `git cherry-pick`."),
      l(`\`git cherry-pick ${short(ROUNDING)}\``, `\`git cherry-pick ${short(ROUNDING)}\``),
    ],
    par: 1,
    check: (ctx) => {
      const tip = ctx.state.commits[ctx.state.branches.main!]!;
      return (
        tip.parents[0] === ctx.start.branches.main &&
        tip.message === "Fix price rounding" &&
        tip.files["prices.js"] === "price = round(x * 1.2, 2)" &&
        !("confetti.js" in tip.files) &&
        status(ctx.state).clean
      );
    },
  },
  {
    id: "wrong-branch",
    title: l("Yanlış branch", "Wrong branch"),
    story: l(
      "\"Add wishlist\" commit'ini attıktan sonra fark ettin: main'deymişsin, oysa bu iş `feature`'a aitti. Henüz push etmedin.",
      "Right after committing \"Add wishlist\" you noticed you were on main, but the work belonged on `feature`. You haven't pushed yet.",
    ),
    goal: l("\"Add wishlist\" `feature`'ın ucuna gelsin; main bu commit'ten önceki yerine dönsün.", "\"Add wishlist\" ends up on top of `feature`; main goes back to where it was before that commit."),
    start: wrongBranch,
    hints: [
      l("İki iş var: commit'i `feature`'a kopyalamak ve main'i bir commit geri almak. Commit hiçbir yerde kaybolmaz; kimliğini bilmen yeter.", "Two jobs: copy the commit onto `feature`, and move main back one commit. The commit isn't lost anywhere; you just need its id."),
      l("`git cherry-pick` commit'i bulunduğun branch'e kopyalar; `git reset --hard HEAD~1` main'i geri alır.", "`git cherry-pick` copies the commit onto the branch you're on; `git reset --hard HEAD~1` moves main back."),
      l(
        `\`git reset --hard HEAD~1\`, \`git switch feature\`, \`git cherry-pick ${short(WISHLIST)}\``,
        `\`git reset --hard HEAD~1\`, \`git switch feature\`, \`git cherry-pick ${short(WISHLIST)}\``,
      ),
    ],
    par: 3,
    check: (ctx) => {
      const feature = ctx.state.branches.feature;
      if (!feature) return false;
      const tip = ctx.state.commits[feature]!;
      return (
        tip.message === "Add wishlist" &&
        tip.parents[0] === ctx.start.branches.feature &&
        "wishlist.js" in tip.files &&
        ctx.state.branches.main === resolve(ctx.start, "main~1") &&
        status(ctx.state).clean
      );
    },
  },
];
