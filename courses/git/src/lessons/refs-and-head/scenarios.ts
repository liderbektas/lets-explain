import { l } from "@lets-explain/core/i18n";
import { ADA, ancestors, createRepo, currentBranch, headId, resolve, type GitAction } from "../../engine/git";
import { commitsOf } from "../branches/parts";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

/** Four commits on main. Free play starts here. */
export const BASE = repoAfter(
  commitsOf([
    ["app.js", "v1", "Proje başladı"],
    ["menu.js", "menü", "Menü eklendi"],
    ["sepet.js", "sepet", "Sepet eklendi"],
    ["odeme.js", "ödeme", "Ödeme eklendi"],
  ]),
  createRepo({ author: ADA }),
);

/** An experiment committed on a detached HEAD, one commit behind main. */
const experiment: GitAction[] = [
  { type: "checkout", target: "HEAD~1" },
  { type: "write", path: "menu.js", content: "yeni menü" },
  { type: "commit", all: true, message: "Yeni menüyü dene" },
];

/** Still on the detached HEAD, right after the experiment commit. */
const DETACHED = repoAfter(experiment, BASE);

/** The id of the experiment commit. */
export const EXPERIMENT = headId(DETACHED)!;

/** Back on main: the experiment is on no branch now. */
const LEFT = repoAfter([{ type: "switch", target: "main" }], DETACHED);

const mainUntouched = (ctx: GitCtx) => ctx.state.branches.main === ctx.start.branches.main;

/** Some branch other than main holds the commit. */
const named = (ctx: GitCtx, id: string) => Object.entries(ctx.state.branches).some(([b, tip]) => b !== "main" && ancestors(ctx.state, tip).has(id));

export const scenarios: GitScenario[] = [
  {
    id: "look-back",
    title: l("Geçmişe bak", "Look back"),
    story: l(
      "Bir müşteri \"menü son günlerde bozuldu\" diyor. Karşılaştırmak için kodu **iki commit önceki** haliyle açıp bakmak, sonra kaldığın yere dönmek istiyorsun. main'in yeri değişmemeli.",
      "A customer says the menu broke in the last few days. To compare, you want to open the code as it was **two commits ago**, then come back where you were. main must not move.",
    ),
    goal: l("İki commit önceye geç, sonra `main`'e dön; main aynı commit'i göstermeye devam etsin.", "Move to two commits back, then return to `main`; main still points at the same commit."),
    start: BASE,
    hints: [
      l("`HEAD~2` iki commit geri demek. Bir commit'e doğrudan geçince HEAD bir branch'te olmaz (detached HEAD).", "`HEAD~2` means two commits back. Moving straight to a commit leaves HEAD on no branch (detached HEAD)."),
      l("`git checkout HEAD~2` (ya da `git switch --detach HEAD~2`) gider; `git switch main` döner.", "`git checkout HEAD~2` (or `git switch --detach HEAD~2`) goes there; `git switch main` comes back."),
      l("`git checkout HEAD~2` sonra `git switch main`", "`git checkout HEAD~2` then `git switch main`"),
    ],
    par: 2,
    check: (ctx) => {
      const target = resolve(ctx.start, "main~2");
      return ctx.states.some((s) => s.head.kind === "detached" && s.head.id === target) && currentBranch(ctx.state) === "main" && mainUntouched(ctx);
    },
  },
  {
    id: "keep-experiment",
    title: l("Denemeyi sakla", "Keep the experiment"),
    story: l(
      "Eski bir commit'e geçip yeni bir menü denedin ve commit'ledin; sonuç güzel. Ama `git status` `HEAD detached` diyor: şimdi main'e dönersen bu commit'i hiçbir isim göstermeyecek.",
      "You moved to an old commit, tried a new menu and committed it; it looks good. But `git status` says `HEAD detached`: if you go back to main now, no name will point at this commit.",
    ),
    goal: l("Deneme commit'i bir branch'te dursun, sen de sonunda `main`'de ol.", "The experiment commit sits on a branch, and you end up on `main`."),
    start: DETACHED,
    hints: [
      l("Bir commit'i korumanın yolu ona bir isim vermek: bir branch.", "The way to keep a commit is to give it a name: a branch."),
      l("`git switch -c <ad>` bulunduğun commit'te yeni bir branch açar ve ona geçer.", "`git switch -c <name>` creates a branch at the current commit and moves onto it."),
      l("`git switch -c yeni-menu` sonra `git switch main`", "`git switch -c new-menu` then `git switch main`"),
    ],
    par: 2,
    check: (ctx) => currentBranch(ctx.state) === "main" && named(ctx, EXPERIMENT) && mainUntouched(ctx),
  },
  {
    id: "find-lost",
    title: l("Kayıp commit'i bul", "Find the lost commit"),
    story: l(
      "Dün detached HEAD'deyken bir menü denemesi commit'ledin, sonra düşünmeden `git switch main` yaptın. Commit grafikte soluklaştı; hiçbir branch onu göstermiyor. Ama Git onu hemen silmez ve HEAD'in gittiği her yeri hatırlar.",
      "Yesterday, on a detached HEAD, you committed a menu experiment, then ran `git switch main` without thinking. The commit faded in the graph; no branch points at it. But Git doesn't delete it right away, and it remembers everywhere HEAD has been.",
    ),
    goal: l("Kayıp commit'e bir branch koy, böylece bir daha kaybolmasın.", "Put a branch on the lost commit so it can't get lost again."),
    start: LEFT,
    hints: [
      l("`git reflog` HEAD'in gittiği her yeri listeler. \"Yeni menüyü dene\" commit'inin kimliği orada.", "`git reflog` lists everywhere HEAD has been. The id of the \"Yeni menüyü dene\" commit is there."),
      l("`git branch <ad> <kimlik>` oraya geçmeden, o commit'e bir branch koyar.", "`git branch <name> <id>` puts a branch on that commit without moving there."),
      l(`\`git reflog\` sonra \`git branch yeni-menu ${EXPERIMENT.slice(0, 7)}\``, `\`git reflog\` then \`git branch new-menu ${EXPERIMENT.slice(0, 7)}\``),
    ],
    par: 1,
    check: (ctx) => named(ctx, EXPERIMENT),
  },
  {
    id: "mark-release",
    title: l("Sürümü işaretle", "Mark the release"),
    story: l(
      "Test ekibi dün yayınlanan sürümün iki commit önceki hal olduğunu söylüyor: `main~2`. O noktaya bir isim koymak istiyorsun ki gerekirse hemen dönebilesin. Ama şu an main'de çalışmaya devam ediyorsun, oraya geçmek istemiyorsun.",
      "QA says the version shipped yesterday is two commits back: `main~2`. You want a name on that point so you can get back to it fast. But you're still working on main and don't want to move there.",
    ),
    goal: l("`release` adında bir branch `main~2`'yi göstersin; sen `main`'de kal.", "A branch called `release` points at `main~2`; you stay on `main`."),
    start: BASE,
    hints: [
      l("Branch sadece bir commit'i gösteren bir isimdir. Açmak için o commit'e gitmen gerekmez.", "A branch is just a name pointing at a commit. You don't have to go to the commit to create one."),
      l("`git branch <ad> <commit>` ismi, verdiğin commit'e koyar ve seni yerinde bırakır.", "`git branch <name> <commit>` puts the name on the commit you give and leaves you where you are."),
      l("`git branch release main~2`", "`git branch release main~2`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.branches.release === resolve(ctx.start, "main~2") && currentBranch(ctx.state) === "main" && mainUntouched(ctx),
  },
];
