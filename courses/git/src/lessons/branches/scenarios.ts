import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, isAncestor, reachable, status, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";
import { commitsOf } from "./parts";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** The shop on main: two commits, nothing pending. */
export const SHOP: Repo = repoAfter(
  commitsOf([
    ["app.js", "v1", "Proje başladı"],
    ["urunler.js", "ürünler", "Ürün listesi"],
  ]),
  createRepo({ author: ADA }),
);

const mainUntouched = (ctx: GitCtx) => ctx.state.branches.main === ctx.start.branches.main;

/** Commits made in the scenario whose branch (when made) was `branch`. */
const commitsOn = (ctx: GitCtx, branch: string) =>
  ctx.events.flat().flatMap((e) => (e.type === "committed" && e.branch === branch ? [e.id] : []));

export const scenarios: GitScenario[] = [
  {
    id: "new-feature",
    title: l("Yeni iş, yeni branch", "New work, new branch"),
    story: l(
      "Bugünkü iş: ürünlere bir arama kutusu. Ekip kuralı açık, main'e doğrudan yazılmaz. Arama kutusunu ayrı bir branch'te başlatman gerekiyor.",
      "Today's job: a search box for the products. The team rule is clear: nobody writes straight to main. You need to start the search box on its own branch.",
    ),
    goal: l(
      "`search` adında bir branch'te `search.js` dosyasını içeren bir commit olsun; **main yerinde kalsın**.",
      "A branch called `search` has a commit with a `search.js` file; **main stays where it is**.",
    ),
    start: SHOP,
    hints: [
      l("Önce yeni branch'i aç ve ona geç; commit her zaman bulunduğun branch'i ilerletir.", "First create the new branch and switch to it; a commit always moves the branch you are on."),
      l("`git switch -c` branch açar ve ona geçer. Dosyayı `echo` ile oluşturabilirsin.", "`git switch -c` creates a branch and switches to it. You can create the file with `echo`."),
      l(
        "`git switch -c search`, `echo \"ara()\" > search.js`, `git add search.js`, `git commit -m \"Search box\"`",
        "`git switch -c search`, `echo \"search()\" > search.js`, `git add search.js`, `git commit -m \"Search box\"`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const tip = ctx.state.branches.search;
      return Boolean(
        tip &&
          mainUntouched(ctx) &&
          isAncestor(ctx.state, ctx.start.branches.main!, tip) &&
          newCommits(ctx).some((c) => isAncestor(ctx.state, c, tip) && changedIn(ctx.state, c).includes("search.js")),
      );
    },
  },
  {
    id: "wrong-branch",
    title: l("Yanlış branch", "Wrong branch"),
    story: l(
      "Kahveni alıp oturdun ve `app.js`'te giriş ekranı için değişikliğe başladın. Sonra prompt'a baktın: main'desin. Bu iş `login` branch'ine aitti. Neyse ki henüz commit atmadın.",
      "You sat down with your coffee and started changing `app.js` for the login screen. Then you looked at the prompt: you're on main. This work belongs on the `login` branch. Luckily you haven't committed yet.",
    ),
    goal: l("Değişiklik `login` branch'inde commit'lensin; **main hiç değişmesin**.", "The change is committed on the `login` branch; **main does not change at all**."),
    start: repoAfter([{ type: "branch", name: "login" }, write("app.js", "v1\nshowLogin()")], SHOP),
    hints: [
      l("Commit edilmemiş değişiklikler branch'e değil klasöre aittir: başka bir branch'e geçerken seninle gelirler.", "Uncommitted changes belong to the folder, not to a branch: they come with you when you switch."),
      l("Önce `git switch` ile login'e geç, commit'i orada at.", "Switch to login with `git switch` first, then commit there."),
      l("`git switch login` sonra `git commit -am \"Login screen\"`", "`git switch login` then `git commit -am \"Login screen\"`"),
    ],
    par: 2,
    check: (ctx) =>
      mainUntouched(ctx) && commitsOn(ctx, "login").some((c) => changedIn(ctx.state, c).includes("app.js")) && Boolean(ctx.state.branches.login),
  },
  {
    id: "dead-end",
    title: l("Çıkmaz sokak", "Dead end"),
    story: l(
      "Yeni bir ödeme kütüphanesini denemek için `experiment` branch'i açıp bir commit atmıştın. Deneme işe yaramadı; bu commit hiçbir yere girmeyecek. Branch'i tamamen kaldırmak istiyorsun.",
      "To try a new payment library you opened an `experiment` branch and made a commit. The experiment didn't work out; that commit is going nowhere. You want the branch gone.",
    ),
    goal: l("`experiment` branch'i silinsin ve sen main'de ol.", "The `experiment` branch is deleted and you are on main."),
    start: repoAfter(
      [{ type: "switch", target: "experiment", create: true }, write("pay.js", "newPayLib()"), { type: "add", paths: ["pay.js"] }, { type: "commit", message: "Try new payment library" }],
      SHOP,
    ),
    hints: [
      l("Üzerinde durduğun branch'i silemezsin. Önce başka bir branch'e geç.", "You can't delete the branch you are on. Switch to another branch first."),
      l("`git branch -d` merge edilmemiş bir branch'i silmez. Emin olduğunda büyük `-D` gerekir.", "`git branch -d` won't delete an unmerged branch. When you are sure, it takes a capital `-D`."),
      l("`git switch main` sonra `git branch -D experiment`", "`git switch main` then `git branch -D experiment`"),
    ],
    par: 2,
    check: (ctx) => !ctx.state.branches.experiment && currentBranch(ctx.state) === "main" && !reachable(ctx.state).has(ctx.start.branches.experiment!),
  },
  {
    id: "already-in",
    title: l("Zaten içeride", "Already in"),
    story: l(
      "`login` branch'indeki iş geçen hafta main'e alındı. Branch listen kalabalıklaşmış ve bu branch artık bir işe yaramıyor. Silmeden önce emin olmak istiyorsun: işi gerçekten main'de mi?",
      "The work on the `login` branch went into main last week. Your branch list is getting crowded and this branch is no use any more. You want to be sure before deleting: is its work really in main?",
    ),
    goal: l("`login` silinsin; main'e girmemiş **hiçbir commit kaybolmasın**.", "`login` is deleted, and **no commit** that isn't in main gets lost."),
    start: repoAfter(
      [
        { type: "switch", target: "login", create: true },
        write("login.js", "form"),
        { type: "add", paths: ["login.js"] },
        { type: "commit", message: "Login form" },
        { type: "switch", target: "main" },
        { type: "merge", target: "login" },
      ],
      SHOP,
    ),
    hints: [
      l("`git branch -v` her branch'in hangi commit'i gösterdiğini yazar. `git log --oneline` ile main'in geçmişine bak.", "`git branch -v` prints the commit each branch points at. Look at main's history with `git log --oneline`."),
      l("Küçük `-d` güvenli silmedir: branch'in commit'leri bulunduğun branch'te değilse Git reddeder.", "Lower-case `-d` is the safe delete: Git refuses if the branch's commits aren't in the branch you're on."),
      l("`git branch -d login`", "`git branch -d login`"),
    ],
    par: 1,
    check: (ctx) => !ctx.state.branches.login && reachable(ctx.state).has(ctx.start.branches.login!),
  },
  {
    id: "refused",
    title: l("Geçiş reddedildi", "Switch refused"),
    story: l(
      "main'de `login.js`'te küçük bir yazım hatasını düzelttin ama commit atmadın. Şimdi `login` branch'ine geçmen gerek. `git switch login` yazınca Git reddediyor: login'de bu dosyanın başka bir hali var ve senin düzeltmen ezilecek.",
      "On main you fixed a small typo in `login.js` but didn't commit. Now you need to switch to the `login` branch. When you type `git switch login`, Git refuses: login has a different version of this file and your fix would be overwritten.",
    ),
    goal: l("Düzeltme main'de commit'lensin ve sonunda `login` branch'inde ol.", "The fix is committed on main, and you end up on the `login` branch."),
    start: repoAfter(
      [
        write("login.js", "form"),
        { type: "add", paths: ["login.js"] },
        { type: "commit", message: "Login stub" },
        { type: "switch", target: "login", create: true },
        write("login.js", "form + password"),
        { type: "commit", all: true, message: "Password field" },
        { type: "switch", target: "main" },
        write("login.js", "form (typo fixed)"),
      ],
      SHOP,
    ),
    hints: [
      l("Git'in hata mesajını oku: değişikliği ya kaydetmeni ya da kenara kaldırmanı istiyor.", "Read Git's error: it wants you to save the change or put it aside."),
      l("Düzeltmeyi main'de commit'le, sonra geçiş sorunsuz olur.", "Commit the fix on main, then the switch goes through."),
      l("`git commit -am \"Fix typo\"` sonra `git switch login`", "`git commit -am \"Fix typo\"` then `git switch login`"),
    ],
    par: 2,
    check: (ctx) => {
      const main = ctx.state.branches.main!;
      return currentBranch(ctx.state) === "login" && ctx.state.commits[main]!.files["login.js"] === ctx.start.work["login.js"] && status(ctx.state).clean;
    },
  },
];
