import { l } from "@lets-explain/core/i18n";
import { ADA, ancestors, apply, asRemote, BORA, cloned, createRepo, currentBranch, isAncestor, simulate, status, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const bora = (content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path: "README.md", content, message });

/** The team's shared repo on GitHub: two commits on main. */
export const ORIGIN = asRemote(
  simulate(
    [
      write("README.md", "Takvim uygulaması"),
      write("app.js", "v1"),
      { type: "add", paths: "." },
      { type: "commit", message: "Proje başladı" },
      write("app.js", "v1.1"),
      { type: "commit", all: true, message: "Ekran" },
    ],
    createRepo({ author: ADA }),
  ).states[6]!,
);

/** You, Ada, have just cloned it. */
export const START: Repo = cloned(ORIGIN);

/** A fresh clone, and a teammate has already pushed something you have not fetched. */
export const SANDBOX: Repo = apply(START, bora("Takvim uygulaması (kurulum)", "Kurulum notları")).state;

/** origin's commits and yours together, for ancestry questions that cross the two. */
const both = (repo: Repo): Repo => ({ ...repo, commits: { ...repo.commits, ...repo.remote!.commits } });
const commitOf = (repo: Repo, id: string) => repo.commits[id] ?? repo.remote?.commits[id];
const isNew = (ctx: GitCtx, id: string) => !ctx.start.commits[id] && !ctx.start.remote?.commits[id];
const usedForce = (ctx: GitCtx) => ctx.actions.some((a) => a.type === "push" && a.force === "force");

/** Every new commit below `tip` has at most one parent: a straight line. */
const straight = (ctx: GitCtx, tip: string) => [...ancestors(both(ctx.state), tip)].filter((c) => isNew(ctx, c)).every((c) => commitOf(ctx.state, c)!.parents.length <= 1);

/** Your open PR branch: one commit, pushed with -u; meanwhile Bora pushed to main. */
const PR_OPEN = repoAfter(
  [
    { type: "switch", target: "feature/login", create: true },
    write("login.js", "form"),
    { type: "add", paths: ["login.js"] },
    { type: "commit", message: "Giriş formu" },
    { type: "push", setUpstream: true },
    bora("Takvim uygulaması (kurulum)", "Kurulum notları"),
  ],
  START,
);

export const scenarios: GitScenario[] = [
  {
    id: "start-feature",
    title: l("Güne başla", "Start the day"),
    story: l(
      "Yeni iş: giriş sayfası. Branch'ini açmadan önce bir şey var: yerel `main`'in dünden kalma, Bora gece main'e kurulum notlarını push etmiş. Eski koddan başlayan bir branch, PR'da gereksiz conflict demek.",
      "New task: the login page. Before opening your branch, one thing: your local `main` is from yesterday, and Bora pushed setup notes to main overnight. A branch that starts from old code means needless conflicts in the PR.",
    ),
    goal: l("`feature/login` branch'inde ol; branch, Bora'nın commit'i dahil **güncel main'den** başlasın.", "Be on `feature/login`, starting from the **latest main**, Bora's commit included."),
    start: SANDBOX,
    hints: [
      l("Önce `main`'i güncelle, sonra branch'i aç: branch, açıldığı andaki commit'ten başlar.", "Update `main` first, then open the branch: a branch starts from the commit you are on when you open it."),
      l("`git pull` main'i günceller; `git switch -c` açar ve geçer.", "`git pull` updates main; `git switch -c` creates and switches."),
      l("`git pull` sonra `git switch -c feature/login`", "`git pull` then `git switch -c feature/login`"),
    ],
    par: 2,
    check: (ctx) => currentBranch(ctx.state) === "feature/login" && ctx.state.branches["feature/login"] === ctx.start.remote!.branches.main,
  },
  {
    id: "update-pr",
    title: l("PR'ı güncelle", "Update the PR"),
    story: l(
      "PR'ın açık. Bu arada main'e Bora'nın kurulum notları girdi. İnceleyen yazıyor: \"Branch'ini güncel main'in üstüne alır mısın? Merge commit istemiyoruz.\"",
      "Your PR is open. Meanwhile Bora's setup notes landed on main. The reviewer writes: \"Can you put your branch on top of the latest main? We don't want a merge commit.\"",
    ),
    goal: l(
      "origin'deki `feature/login`, Bora'nın commit'inin **üstünde** dursun; merge commit olmasın, `--force` kullanılmasın.",
      "`feature/login` on origin sits **on top of** Bora's commit, with no merge commit and no `--force`.",
    ),
    start: PR_OPEN,
    hints: [
      l("Önce Bora'nın işini indir; sonra kendi commit'ini onun üstüne taşı. Bu, branch'in geçmişini değiştirir.", "Download Bora's work first, then move your commit on top of it. That rewrites your branch's history."),
      l("`git fetch` ve `git rebase origin/main`. Yeniden yazılmış bir branch'i göndermenin güvenli yolu `--force-with-lease`.", "`git fetch` and `git rebase origin/main`. The safe way to push a rewritten branch is `--force-with-lease`."),
      l("`git fetch`, `git rebase origin/main`, `git push --force-with-lease`", "`git fetch`, `git rebase origin/main`, `git push --force-with-lease`"),
    ],
    par: 3,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches["feature/login"];
      if (!tip || !isNew(ctx, tip) || usedForce(ctx)) return false;
      const all = both(ctx.state);
      return isAncestor(all, ctx.start.remote!.branches.main!, tip) && commitOf(ctx.state, tip)!.files["login.js"] !== undefined && straight(ctx, tip);
    },
  },
  {
    id: "trunk",
    title: l("Doğrudan main", "Straight to main"),
    story: l(
      "Bu ekip trunk-based çalışıyor: herkes küçük commit'leri doğrudan main'e atıyor ve geçmiş düz kalıyor. `app.js`'te tarih biçimini düzelttin, henüz commit'lemedin. Bu arada Bora da main'e push etmiş.",
      "This team works trunk-based: everyone commits small changes straight to main, and history stays straight. You fixed the date format in `app.js` but haven't committed it. Meanwhile Bora pushed to main.",
    ),
    goal: l(
      "Düzeltmen origin'deki `main`'de, Bora'nın commit'inin **üstünde** olsun; geçmiş düz kalsın (merge commit yok).",
      "Your fix is on `main` on origin, **on top of** Bora's commit, with history kept straight (no merge commit).",
    ),
    start: repoAfter([write("app.js", "v1.2")], SANDBOX),
    hints: [
      l("Önce düzeltmeyi commit'le: Git, commit'lenmemiş değişiklikle rebase yapmaz.", "Commit the fix first: Git won't rebase with uncommitted changes."),
      l("`git pull --rebase` Bora'nın işini alır ve seninkini üstüne koyar.", "`git pull --rebase` takes Bora's work and puts yours on top."),
      l("`git commit -am \"Fix date format\"`, `git pull --rebase`, `git push`", "`git commit -am \"Fix date format\"`, `git pull --rebase`, `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      if (!tip) return false;
      const all = both(ctx.state);
      const mine = Object.keys(all.commits).some((c) => isNew(ctx, c) && commitOf(ctx.state, c)!.author !== BORA && commitOf(ctx.state, c)!.files["app.js"] === "v1.2" && isAncestor(all, c, tip));
      return mine && isAncestor(all, ctx.start.remote!.branches.main!, tip) && straight(ctx, tip) && ctx.state.branches.main === tip;
    },
  },
  {
    id: "wrong-branch",
    title: l("Yanlış branch", "Wrong branch"),
    story: l(
      "Bir saat odaklanıp çalıştın ve commit attın... sonra fark ettin ki `main`'desin. Ekip kuralı: main'e doğrudan commit yok. Neyse ki henüz push etmedin.",
      "You worked with focus for an hour and committed... then noticed you're on `main`. Team rule: no direct commits to main. Luckily you haven't pushed yet.",
    ),
    goal: l(
      "Commit `feature` adlı bir branch'te dursun, `main` `origin/main` ile aynı yere dönsün ve çalışmaya `feature`'da devam et.",
      "The commit lives on a branch called `feature`, `main` goes back to `origin/main`, and you carry on working on `feature`.",
    ),
    start: repoAfter([write("app.js", "v1.2"), { type: "commit", all: true, message: "Tarih biçimi" }], START),
    hints: [
      l("Önce commit'e bir isim ver ki kaybolmasın; sonra main'i geri çek.", "Give the commit a name first so it isn't lost; then pull main back."),
      l("`git branch` bulunduğun yerde branch açar ama geçmez. `git reset --hard origin/main` main'i uzaktaki haline götürür.", "`git branch` creates a branch where you are without switching. `git reset --hard origin/main` takes main back to the remote's version."),
      l("`git branch feature`, `git reset --hard origin/main`, `git switch feature`", "`git branch feature`, `git reset --hard origin/main`, `git switch feature`"),
    ],
    par: 3,
    check: (ctx) => {
      const feature = ctx.state.branches.feature;
      const mistake = ctx.start.branches.main!;
      return (
        Boolean(feature) &&
        isAncestor(ctx.state, mistake, feature!) &&
        ctx.state.branches.main === ctx.state.tracking["origin/main"] &&
        currentBranch(ctx.state) === "feature" &&
        status(ctx.state).clean
      );
    },
  },
  {
    id: "good-message",
    title: l("İyi bir mesaj", "A good message"),
    story: l(
      "Tarih biçimi hatasını düzelttin. Ekip commit mesajlarında kısa bir başlık ve altında bir paragraf \"neden\" istiyor: altı ay sonra `git log` okuyan biri ne olduğunu anlamalı.",
      "You fixed the date format bug. The team wants commit messages with a short title and a paragraph below saying \"why\": someone reading `git log` six months from now should understand what happened.",
    ),
    goal: l(
      "`app.js` değişikliği, **başlık + boş satır + açıklama** biçiminde bir mesajla commit'lensin (başlık en fazla 72 karakter).",
      "Commit the `app.js` change with a message shaped **title + blank line + body** (title at most 72 characters).",
    ),
    start: repoAfter([write("app.js", "v1.2")], START),
    hints: [
      l("Tek satırlık `-m` sadece başlık verir. Açıklama, başlıktan bir boş satır sonra gelir.", "A single `-m` gives only a title. The body comes after a blank line below the title."),
      l("İkinci bir `-m` açıklama paragrafı olur. Ya da `-m` vermeden `git commit -a` yazıp mesajı editörde yazarsın.", "A second `-m` becomes the body paragraph. Or type `git commit -a` with no `-m` and write it in the editor."),
      l(
        "`git commit -am \"fix: keep dates in DD.MM format\" -m \"Users saw MM/DD after the refactor.\"`",
        "`git commit -am \"fix: keep dates in DD.MM format\" -m \"Users saw MM/DD after the refactor.\"`",
      ),
    ],
    par: 1,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const commit = ctx.state.commits[c]!;
        const [title, blank, ...body] = commit.message.split("\n");
        return changedIn(ctx.state, c).includes("app.js") && Boolean(title?.trim()) && title!.length <= 72 && blank === "" && body.join("").trim().length > 0;
      }),
  },
];
