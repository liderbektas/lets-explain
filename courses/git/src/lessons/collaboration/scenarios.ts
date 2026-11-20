import { l } from "@lets-explain/core/i18n";
import { BORA, cloned, currentBranch, type GitAction, type Repo } from "../../engine/git";
import { onOrigin, ORIGIN } from "../remotes/scenarios";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });
const teammate = (path: string, content: string, message: string): GitAction => ({ type: "teammate", branch: "main", path, content, message });

/** A fresh clone of the team's origin. */
export const START: Repo = cloned(ORIGIN);

const isNew = (ctx: GitCtx, id: string) => !ctx.start.commits[id] && !ctx.start.remote?.commits[id];
const commitOf = (repo: Repo, id: string) => repo.commits[id] ?? repo.remote?.commits[id];

/** Every commit Bora ever pushed is still reachable from origin's main. */
const boraSafe = (ctx: GitCtx) => {
  const remote = ctx.state.remote;
  if (!remote) return false;
  const main = onOrigin(ctx.state, "main");
  return Object.values(remote.commits).every((c) => c.author !== BORA || main.has(c.id));
};

const usedForce = (ctx: GitCtx) => ctx.actions.some((a) => a.type === "push" && a.force === "force");

/** Your feature branch is on origin, and Bora merged its pull request on GitHub (a merge commit on main). */
const OPENED = repoAfter(
  [{ type: "switch", target: "feature", create: true }, write("search.js", "arama"), { type: "add", paths: ["search.js"] }, commit("Arama kutusu"), { type: "push", setUpstream: true }],
  START,
);
const MERGED_ON_GITHUB = repoAfter([{ type: "merge", target: "origin/feature", noFf: true }, { type: "push" }], cloned(OPENED.remote!, { author: BORA, time: OPENED.time + 600 }));
const PR_MERGED: Repo = { ...OPENED, remote: structuredClone(MERGED_ON_GITHUB.remote!) };

export const scenarios: GitScenario[] = [
  {
    id: "straight-line",
    title: l("Düz çizgi", "Straight line"),
    story: l(
      "Ekip geçmişin düz bir çizgi olmasını istiyor; \"Merge branch 'main'\" commit'leri kimse sevmiyor. Düzeltmeni commit'ledin ama push reddedildi: Bora senden önce göndermiş.",
      "The team wants history to be a straight line; nobody likes \"Merge branch 'main'\" commits. You committed your fix, but the push was refused: Bora got there first.",
    ),
    goal: l(
      "origin'deki `main`'in en üstünde senin commit'in, hemen altında Bora'nınki olsun; **merge commit olmasın**.",
      "On origin, `main` has your commit on top with Bora's right under it, and **no merge commit**.",
    ),
    start: repoAfter([write("app.js", "v2"), commit("app.js: yeni başlık", true), teammate("team.txt", "not", "Bora: not eklendi")], START),
    hints: [
      l("Düz `git pull` iki ucu bir merge commit'iyle bağlar. Senin commit'ini onunkinin **üstüne taşıyan** bir yolu var.", "A plain `git pull` joins the two ends with a merge commit. There is a way that **moves your commit on top** of his."),
      l("`git pull --rebase` önce indirir, sonra senin commit'ini yeni ucun üstünde yeniden oynatır.", "`git pull --rebase` downloads first, then replays your commit on top of the new tip."),
      l("`git pull --rebase` sonra `git push`", "`git pull --rebase` then `git push`"),
    ],
    par: 2,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      if (!tip || !isNew(ctx, tip) || commitOf(ctx.state, tip)!.author === BORA) return false;
      const main = [...onOrigin(ctx.state, "main")].filter((c) => isNew(ctx, c));
      return commitOf(ctx.state, tip)!.parents[0] === ctx.start.remote!.branches.main && !main.some((c) => commitOf(ctx.state, c)!.parents.length > 1);
    },
  },
  {
    id: "safe-amend",
    title: l("Güvenli düzeltme", "Safe fix-up"),
    story: l(
      "Az önce push ettiğin commit'in mesajında yazım hatası var: \"Fix chekout\". Henüz kimse üstüne bir şey eklemedi. Mesajı düzeltmek istiyorsun, ama ekipte kural net: `--force` yok.",
      "The commit you just pushed has a typo in its message: \"Fix chekout\". Nobody has built on it yet. You want to fix the message, but the team rule is clear: no `--force`.",
    ),
    goal: l(
      "origin'deki son commit'in mesajı düzelsin; `--force` **kullanılmasın** ve Bora'nın hiçbir commit'i kaybolmasın.",
      "The last commit on origin gets a fixed message; **no `--force`**, and none of Bora's commits may disappear.",
    ),
    start: repoAfter([write("app.js", "v2"), commit("Fix chekout", true), { type: "push" }], START),
    hints: [
      l("Son commit'in mesajını `--amend` değiştirir, ama bu yeni bir commit demek: düz `git push` reddedilir.", "`--amend` changes the last commit's message, but that makes a new commit: a plain `git push` is refused."),
      l("Zorla göndermenin güvenli hali `--force-with-lease`: uzakta görmediğin bir şey varsa reddeder.", "The safe way to force is `--force-with-lease`: it refuses if the remote has something you haven't seen."),
      l("`git commit --amend -m \"Fix checkout\"` sonra `git push --force-with-lease`", "`git commit --amend -m \"Fix checkout\"` then `git push --force-with-lease`"),
    ],
    par: 2,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.main;
      const before = ctx.start.branches.main;
      if (!tip || !before || !isNew(ctx, tip)) return false;
      const amended = commitOf(ctx.state, tip)!;
      const original = ctx.start.commits[before]!;
      return amended.parents.join() === original.parents.join() && amended.message !== original.message && !usedForce(ctx) && boraSafe(ctx);
    },
  },
  {
    id: "pr-ready",
    title: l("PR'a hazır", "Ready for a PR"),
    story: l(
      "Yeni iş: arama kutusu. Ekipte kural basit: main'e doğrudan commit yok, her iş kendi branch'inde ve pull request ile gelir. Kodu `search.js`'e yazdın bile, ama henüz hiçbir şey commit'lemedin.",
      "New task: a search box. The team rule is simple: no direct commits to main; every piece of work comes in its own branch through a pull request. You've already written the code in `search.js`, but haven't committed anything.",
    ),
    goal: l(
      "`search.js` `search` adlı bir branch'te commit'lensin ve origin'e **takip bağlantısıyla** gönderilsin; `main`'e dokunulmasın.",
      "`search.js` is committed on a branch called `search` and sent to origin **with tracking**; `main` stays untouched.",
    ),
    start: repoAfter([write("search.js", "arama kutusu")], START),
    hints: [
      l("Commit atmadan önce branch'i aç: commit, o an bulunduğun branch'e gider.", "Open the branch before you commit: a commit goes to whatever branch you are on."),
      l("`git switch -c` açar ve geçer; yeni branch'in ilk push'u `-u` ister.", "`git switch -c` creates and switches; a new branch's first push needs `-u`."),
      l("`git switch -c search`, `git add search.js`, `git commit -m \"Add search box\"`, `git push -u origin search`", "`git switch -c search`, `git add search.js`, `git commit -m \"Add search box\"`, `git push -u origin search`"),
    ],
    par: 4,
    check: (ctx) => {
      const tip = ctx.state.remote?.branches.search;
      const base = ctx.start.branches.main;
      const onSearch = tip ? [...onOrigin(ctx.state, "search")].some((c) => isNew(ctx, c) && commitOf(ctx.state, c)!.files["search.js"] !== undefined && commitOf(ctx.state, c)!.parents[0] === base) : false;
      return (
        onSearch &&
        ctx.state.upstream.search === "origin/search" &&
        ctx.state.branches.main === base &&
        ctx.state.remote?.branches.main === ctx.start.remote?.branches.main
      );
    },
  },
  {
    id: "after-merge",
    title: l("Merge'den sonra", "After the merge"),
    story: l(
      "Bora PR'ını inceledi ve GitHub'da merge etti. Sen hâlâ `feature` branch'indesin; senin `main`'in ise merge'den habersiz. Sıradaki işe temiz başlamak istiyorsun.",
      "Bora reviewed your PR and merged it on GitHub. You're still on the `feature` branch, and your `main` knows nothing about the merge. You want a clean start for the next task.",
    ),
    goal: l(
      "`main`'de ol, `main` origin'deki birleşmiş haliyle aynı olsun ve artık gereksiz `feature` branch'i yerelde silinsin.",
      "Be on `main`, with `main` matching the merged version on origin, and the no-longer-needed `feature` branch deleted locally.",
    ),
    start: PR_MERGED,
    hints: [
      l("Önce `main`'e dön; birleşmiş iş origin'de, sende değil.", "Go back to `main` first; the merged work is on origin, not on your machine."),
      l("`git pull` merge'ü getirir. Sonra `git branch -d` birleşmiş bir branch'i güvenle siler.", "`git pull` brings in the merge. Then `git branch -d` safely deletes a merged branch."),
      l("`git switch main`, `git pull`, `git branch -d feature`", "`git switch main`, `git pull`, `git branch -d feature`"),
    ],
    par: 3,
    check: (ctx) =>
      currentBranch(ctx.state) === "main" &&
      ctx.state.branches.main === ctx.state.remote?.branches.main &&
      ctx.state.branches.main !== ctx.start.branches.main &&
      !ctx.state.branches.feature,
  },
];
