import { l } from "@lets-explain/core/i18n";
import { ADA, asRemote, BORA, cloned, createRepo, simulate, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

/** origin on GitHub: two commits on main. Every lesson in this chapter starts from a clone of it. */
export const ORIGIN = asRemote(
  simulate(
    [
      write("README.md", "v1"),
      write("app.js", "v1"),
      { type: "add", paths: "." },
      commit("İlk commit"),
      write("README.md", "v2"),
      commit("README güncellendi", true),
    ],
    createRepo({ author: ADA }),
  ).states[6]!,
);

/** A fresh clone of origin: where this lesson and free play start. */
export const START: Repo = cloned(ORIGIN);

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

/** A commit origin did not have when the scenario began. */
const newOnOrigin = (ctx: GitCtx, id: string) => !ctx.start.remote?.commits[id];
const commitOf = (repo: Repo, id: string) => repo.commits[id] ?? repo.remote?.commits[id];

/** Your fix: a local commit on main that origin does not have yet. */
const FIX = repoAfter([write("app.js", "v2"), commit("Fix checkout", true)], START);

/** Bora pushed to origin; you have not fetched. */
const BORA_PUSHED = repoAfter([teammate("team.txt", "Bora'nın notu", "Bora: not eklendi")], START);

export const scenarios: GitScenario[] = [
  {
    id: "not-pushed",
    title: l("Push edilmedi", "Not pushed"),
    story: l(
      "Dün akşam `app.js`'teki ödeme hatasını düzeltip commit'ledin, ama çıkarken push etmeyi unuttun. Sabah ekip arkadaşın yazıyor: \"GitHub'da düzeltmeni göremiyorum.\"",
      "Last night you fixed the checkout bug in `app.js` and committed it, but forgot to push before leaving. In the morning a teammate writes: \"I can't see your fix on GitHub.\"",
    ),
    goal: l("Düzeltme commit'in origin'deki `main`'de olsun.", "Your fix commit is on `main` on origin."),
    start: FIX,
    hints: [
      l("`git status`'a bak: branch'in `origin/main`'den kaç commit önde?", "Look at `git status`: how many commits ahead of `origin/main` is your branch?"),
      l("Yerel commit'leri uzağa gönderen komut `git push`.", "The command that sends local commits to the remote is `git push`."),
      l("`git push`", "`git push`"),
    ],
    par: 1,
    check: (ctx) => onOrigin(ctx.state, "main").has(ctx.start.branches.main!),
  },
  {
    id: "just-look",
    title: l("Önce bak", "Look first"),
    story: l(
      "Bora sabah main'e bir şey push ettiğini söyledi. Kendi branch'ine bir şey karıştırmadan önce ne geldiğini görmek istiyorsun.",
      "Bora said he pushed something to main this morning. Before anything gets mixed into your branch, you want to see what came in.",
    ),
    goal: l(
      "Bora'nın commit'i senin bilgisayarında `origin/main`'de görünsün; kendi `main`'in **yerinden oynamasın**.",
      "Bora's commit shows up in `origin/main` on your computer; your own `main` **does not move**.",
    ),
    start: BORA_PUSHED,
    hints: [
      l("Uzaktakini indiren ama hiçbir şeyi birleştirmeyen bir komut var.", "There is a command that downloads without combining anything."),
      l("`git fetch` sadece `origin/...` tabelalarını taşır. `git pull` ise birleştirir de.", "`git fetch` moves only the `origin/...` signs. `git pull` also combines."),
      l("`git fetch` (sonra istersen `git log --oneline origin/main`)", "`git fetch` (then, if you like, `git log --oneline origin/main`)"),
    ],
    par: 1,
    check: (ctx) => {
      const tracking = ctx.state.tracking["origin/main"];
      return Boolean(tracking && tracking === ctx.state.remote?.branches.main && tracking !== ctx.start.tracking["origin/main"]) && ctx.state.branches.main === ctx.start.branches.main;
    },
  },
  {
    id: "catch-up",
    title: l("Yetiş", "Catch up"),
    story: l(
      "Bora'nın commit'ini fetch ettin ve `origin/main`'de inceledin; iyi görünüyor. Şimdi onu kendi `main`'ine almak istiyorsun.",
      "You fetched Bora's commit and looked at it in `origin/main`; it looks good. Now you want it in your own `main`.",
    ),
    goal: l("Kendi `main`'in `origin/main` ile aynı yerde olsun.", "Your own `main` is at the same place as `origin/main`."),
    start: repoAfter([{ type: "fetch" }], BORA_PUSHED),
    hints: [
      l("İndirmek bitti; şimdi birleştirme zamanı.", "The download is done; now it is time to combine."),
      l("`origin/main` de bir branch gibi birleştirilebilir.", "`origin/main` can be merged like any branch."),
      l("`git merge origin/main`", "`git merge origin/main`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches.main === ctx.state.tracking["origin/main"] && ctx.state.branches.main !== ctx.start.branches.main,
  },
  {
    id: "rejected",
    title: l("Reddedildi", "Rejected"),
    story: l(
      "Düzeltmeni push ettin ama Git reddetti: `! [rejected] main -> main (fetch first)`. Bora senden birkaç dakika önce push etmiş. Ekipten biri \"`--force` ile geç\" diyor.",
      "You pushed your fix but Git refused: `! [rejected] main -> main (fetch first)`. Bora pushed a few minutes before you. Someone on the team says \"just use `--force`\".",
    ),
    goal: l(
      "origin'deki `main`'de hem senin düzeltmen hem Bora'nın commit'i olsun: **kimsenin işi kaybolmasın**.",
      "`main` on origin has both your fix and Bora's commit: **nobody's work is lost**.",
    ),
    start: repoAfter([write("app.js", "v2"), commit("Fix checkout", true), teammate("team.txt", "Bora'nın notu", "Bora: not eklendi")], START),
    hints: [
      l("`--force` Bora'nın commit'ini origin'den siler. Önce onun işini kendine almalısın.", "`--force` would wipe Bora's commit off origin. You need to bring his work in first."),
      l("`git pull` uzaktakini indirip seninkiyle birleştirir; sonra push kabul edilir.", "`git pull` downloads the remote work and combines it with yours; then the push is accepted."),
      l("`git pull` sonra `git push`", "`git pull` then `git push`"),
    ],
    par: 2,
    check: (ctx) => {
      const main = onOrigin(ctx.state, "main");
      const bora = ctx.start.remote!.branches.main!;
      const yours = [...main].some((c) => newOnOrigin(ctx, c) && commitOf(ctx.state, c)!.author !== BORA && commitOf(ctx.state, c)!.files["app.js"] === "v2");
      return main.has(bora) && yours;
    },
  },
  {
    id: "publish",
    title: l("Branch'i yayınla", "Publish a branch"),
    story: l(
      "Arama özelliği için `search` branch'ini açtın ve commit attın. Yarın izindesin; kod sadece senin bilgisayarında kalmasın. Dönünce de sadece `git push` yazarak devam etmek istiyorsun.",
      "You opened a `search` branch for the search feature and committed. You're off tomorrow, and the code shouldn't live only on your laptop. When you're back you want to carry on with a plain `git push`.",
    ),
    goal: l("`search` branch'i origin'de olsun ve **takip bağlantısı** kurulsun (`origin/search`).", "The `search` branch is on origin with **tracking** set up (`origin/search`)."),
    start: repoAfter([{ type: "switch", target: "search", create: true }, write("search.js", "arama"), { type: "add", paths: ["search.js"] }, commit("Arama kutusu")], START),
    hints: [
      l("Düz `git push` dene: Git, bu branch'in uzakta bir karşılığı olmadığını söyleyecek.", "Try a plain `git push`: Git will tell you this branch has no counterpart on the remote."),
      l("Yeni bir branch'i ilk kez gönderirken `-u` (`--set-upstream`) bağlantıyı da kurar.", "When you push a new branch the first time, `-u` (`--set-upstream`) also sets up the link."),
      l("`git push -u origin search`", "`git push -u origin search`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.remote?.branches.search === ctx.state.branches.search && ctx.state.upstream.search === "origin/search",
  },
];
