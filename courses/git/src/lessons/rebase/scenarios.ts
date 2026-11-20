import { l } from "@lets-explain/core/i18n";
import { ADA, ancestors, createRepo, currentBranch, headId, isAncestor, status, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

export const STYLE = "style.css";
const BLUE = "renk: mavi";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });
const sw = (target: string, create = false): GitAction => ({ type: "switch", target, create });

/**
 * The blog: `feature` built a post list and search, `theme` picked blue, and main moved on
 * with the About page and red. You are on feature.
 */
export const BLOG: Repo = repoAfter(
  [
    write("README.md", "Blog"),
    add("README.md"),
    commit("Proje başladı"),
    sw("theme", true),
    write(STYLE, BLUE),
    add(STYLE),
    commit("Mavi tema"),
    sw("main"),
    sw("feature", true),
    write("posts.md", "Yazılar"),
    add("posts.md"),
    commit("Yazı listesi"),
    write("search.js", "ara()"),
    add("search.js"),
    commit("Arama"),
    sw("main"),
    write("about.md", "Biz kimiz"),
    write(STYLE, "renk: kırmızı"),
    add("about.md", STYLE),
    commit("Hakkında ve kırmızı tema"),
    sw("feature"),
  ],
  createRepo({ author: ADA }),
);

/** The same blog, but on main. */
const ON_MAIN: Repo = repoAfter([sw("main")], BLOG);

/** `git rebase main` on theme, stopped on style.css. */
const THEME_STOPPED: Repo = repoAfter([sw("theme"), { type: "rebase", onto: "main" }], BLOG);

/** Merge commits anywhere behind a commit. */
const mergesBehind = (ctx: GitCtx, id: string | undefined) =>
  id ? [...ancestors(ctx.state, id)].filter((c) => ctx.state.commits[c]!.parents.length > 1).length : 0;

/** `branch` now sits on top of main's tip with a straight history and no rebase running. */
const onTopOfMain = (ctx: GitCtx, branch: string) => {
  const tip = ctx.state.branches[branch];
  return Boolean(!ctx.state.op && tip && isAncestor(ctx.state, ctx.state.branches.main!, tip) && mergesBehind(ctx, tip) === 0);
};

export const scenarios: GitScenario[] = [
  {
    id: "straight-line",
    title: l("Dümdüz geçmiş", "Straight history"),
    story: l(
      "Ekip main'in geçmişini düz bir çizgi olarak tutuyor: merge commit'i yok. `feature`'daki yazı listesi ve arama hazır; main'e girmeli. Sen ayrıldıktan sonra main'e Hakkında sayfası eklendi. Şu an feature'dasın.",
      "The team keeps main's history as one straight line: no merge commits. The post list and search on `feature` are ready to go into main. Since you branched off, main gained the About page. You are on feature.",
    ),
    goal: l("feature'ın işi main'e girsin; main'in geçmişinde **hiç merge commit'i olmasın**.", "feature's work is in main, with **no merge commit** anywhere in main's history."),
    start: BLOG,
    hints: [
      l("Düz merge iki ucu birleştirir ve merge commit'i atar. Önce feature'ı main'in üstüne taşırsan main sadece ileri kayabilir.", "A plain merge joins two tips with a merge commit. Move feature on top of main first, and main can simply slide forward."),
      l("feature'dayken `git rebase main`, sonra main'e geçip merge (fast-forward).", "On feature, `git rebase main`; then switch to main and merge (a fast-forward)."),
      l("`git rebase main`, `git switch main`, `git merge feature`", "`git rebase main`, `git switch main`, `git merge feature`"),
    ],
    par: 3,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      return Boolean(!ctx.state.op && main && main === ctx.state.branches.feature && mergesBehind(ctx, main) === 0 && ctx.state.commits[main]!.files["search.js"]);
    },
  },
  {
    id: "freshen-up",
    title: l("Branch'ini güncelle", "Freshen up your branch"),
    story: l(
      "Pull request açmak üzeresin. Gözden geçirecek kişi, branch'inin main'in **son haline** göre olmasını ve içinde merge commit'i olmamasını istiyor. main'e dokunmayacaksın; o işi PR yapacak. Şu an main'desin.",
      "You're about to open a pull request. Your reviewer wants your branch based on main's **latest** state, with no merge commit inside it. You won't touch main; the PR will do that. You are on main right now.",
    ),
    goal: l("`feature` main'in ucunun üstünde dursun, içinde merge commit'i olmasın; **main değişmesin**.", "`feature` sits on top of main's tip with no merge commit in it; **main does not change**."),
    start: ON_MAIN,
    hints: [
      l("Rebase, bulunduğun branch'in commit'lerini taşır. Taşınacak olan feature.", "Rebase moves the commits of the branch you are on. The one to move is feature."),
      l("feature'a geç, sonra `git rebase main`.", "Switch to feature, then `git rebase main`."),
      l("`git switch feature` sonra `git rebase main`", "`git switch feature` then `git rebase main`"),
    ],
    par: 2,
    check: (ctx) => onTopOfMain(ctx, "feature") && ctx.state.branches.main === ctx.start.branches.main && Boolean(ctx.state.commits[ctx.state.branches.feature!]!.files["search.js"]),
  },
  {
    id: "keep-blue",
    title: l("Mavi kalsın", "Keep it blue"),
    story: l(
      "`theme` branch'inde sitenin rengini maviye çevirdin; bu arada main'de biri kırmızı yapmış. Tasarımcı kararını verdi: **mavi** kalacak. `theme`'i main'in üstüne taşıman gerekiyor ve rebase bu dosyada duracak.",
      "On the `theme` branch you made the site blue; meanwhile someone made it red on main. The designer has decided: **blue** stays. You need to move `theme` on top of main, and the rebase will stop on this file.",
    ),
    goal: l("`theme` main'in üstüne rebase edilsin ve `style.css` mavi kalsın.", "`theme` is rebased onto main and `style.css` stays blue."),
    start: BLOG,
    hints: [
      l("Rebase sırasında \"bizim\" (ours) taraf main'dir; \"onların\" (theirs) taraf yeniden oynatılan theme commit'idir.", "During a rebase, \"ours\" is main and \"theirs\" is the theme commit being replayed."),
      l("theme'e geç, `git rebase main`; durunca `git checkout --theirs`, `git add`, `git rebase --continue`.", "Switch to theme, `git rebase main`; when it stops, `git checkout --theirs`, `git add`, `git rebase --continue`."),
      l(
        "`git switch theme`, `git rebase main`, `git checkout --theirs style.css`, `git add style.css`, `git rebase --continue`",
        "`git switch theme`, `git rebase main`, `git checkout --theirs style.css`, `git add style.css`, `git rebase --continue`",
      ),
    ],
    par: 5,
    check: (ctx) => onTopOfMain(ctx, "theme") && ctx.state.commits[ctx.state.branches.theme!]!.files[STYLE] === BLUE,
  },
  {
    id: "meeting",
    title: l("Toplantı var", "Meeting time"),
    story: l(
      "`theme`'i main'in üstüne taşımaya başladın ve rebase `style.css`'te durdu. Tam o sırada toplantıya çağrıldın; bu conflict'i şimdi çözecek vaktin yok. Her şeyi rebase'ten önceki haline döndürmek istiyorsun.",
      "You started moving `theme` on top of main and the rebase stopped on `style.css`. Right then you're called into a meeting; there's no time to solve this conflict now. You want everything back to how it was before the rebase.",
    ),
    goal: l("Rebase iptal edilsin: theme **eski commit'inde** kalsın, sen theme'de ol, klasör temiz olsun.", "The rebase is called off: theme stays on **its old commit**, you are on theme, and the folder is clean."),
    start: THEME_STOPPED,
    hints: [
      l("`git status` rebase'in nerede durduğunu ve nasıl çıkılacağını yazar.", "`git status` says where the rebase stopped and how to get out."),
      l("Yarım kalan bir rebase'in de kendi iptal komutu var.", "A half-done rebase has its own cancel command too."),
      l("`git rebase --abort`", "`git rebase --abort`"),
    ],
    par: 1,
    check: (ctx) =>
      !ctx.state.op &&
      ctx.state.branches.theme === BLOG.branches.theme &&
      currentBranch(ctx.state) === "theme" &&
      headId(ctx.state) === BLOG.branches.theme &&
      status(ctx.state).clean,
  },
  {
    id: "purple",
    title: l("Mor olsun", "Make it purple"),
    story: l(
      "Rebase `style.css`'te durdu: main kırmızı diyor, theme mavi. Tasarımcıyla konuştun ve ikisinin ortası olan **mor**da anlaştınız. Dosyaya `renk: mor` yazıp rebase'i bitirmen gerekiyor.",
      "The rebase stopped on `style.css`: main says red, theme says blue. You talked to the designer and you settled on **purple**, halfway between. Write `renk: mor` into the file and finish the rebase.",
    ),
    goal: l("Rebase bitsin; theme main'in üstünde dursun ve `style.css` içinde sadece `renk: mor` olsun.", "The rebase is finished; theme sits on top of main and `style.css` holds just `renk: mor`."),
    start: THEME_STOPPED,
    hints: [
      l("İki taraftan birini seçmek zorunda değilsin: dosyayı istediğin gibi yazabilirsin. İşaretler kalmamalı.", "You don't have to pick a side: you can write the file however you want. No markers may remain."),
      l("Dosyayı `echo` ya da `nano` ile yaz, `git add` ile çözüldü de, `git rebase --continue` ile devam et.", "Write the file with `echo` or `nano`, mark it resolved with `git add`, carry on with `git rebase --continue`."),
      l("`echo \"renk: mor\" > style.css`, `git add style.css`, `git rebase --continue`", "`echo \"renk: mor\" > style.css`, `git add style.css`, `git rebase --continue`"),
    ],
    par: 3,
    check: (ctx) => onTopOfMain(ctx, "theme") && ctx.state.commits[ctx.state.branches.theme!]!.files[STYLE] === "renk: mor",
  },
];
