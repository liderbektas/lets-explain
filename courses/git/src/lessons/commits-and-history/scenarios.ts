import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, status, type GitAction } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { changedIn, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const addAll: GitAction = { type: "add", paths: "." };
const commit = (message: string): GitAction => ({ type: "commit", message });

/** A shop project with two commits: free play starts here. */
export const SHOP = repoAfter(
  [write("README.md", "# Shop"), write("app.js", "showProducts()"), addAll, commit("Initial shop"), write("app.js", "showProducts()\nshowCart()"), addAll, commit("Show the cart")],
  createRepo({ author: ADA }),
);

/** How many commits the current line of history has. */
const depth = (ctx: GitCtx, which: "start" | "state") => firstParents(ctx[which], headId(ctx[which])).length;

/** Commits on the current line that were not there at the start, newest first. */
function added(ctx: GitCtx): string[] {
  const before = new Set(firstParents(ctx.start, headId(ctx.start)));
  return firstParents(ctx.state, headId(ctx.state)).filter((c) => !before.has(c));
}

const amended = (ctx: GitCtx) => ctx.events.flat().some((e) => e.type === "committed" && e.amend);

export const scenarios: GitScenario[] = [
  {
    id: "typo-message",
    title: l("Mesajda yazım hatası", "Typo in the message"),
    story: l(
      "Az önce ödeme hatasını düzelten commit'i attın ve mesaja `Fix chekout` yazdın. Henüz kimseyle paylaşmadın, `git log`'da böyle görünmesini istemiyorsun.",
      "You just committed the checkout fix and typed `Fix chekout` as the message. You haven't shared it with anyone yet, and you don't want it to look like that in `git log`.",
    ),
    goal: l("Son commit'in mesajı `checkout` diye doğru yazılsın; geçmişe **yeni commit eklenmesin**.", "The last commit's message spells `checkout` right; **no new commit** is added to the history."),
    start: repoAfter([write("app.js", "showProducts()\nshowCart()\nfixCheckout()"), addAll, commit("Fix chekout")], SHOP),
    hints: [
      l("Son commit'i yeniden yazabilirsin; Git ona yeni bir kimlik verir ve eskisinin yerine koyar.", "You can rewrite the last commit; Git gives it a new id and puts it in place of the old one."),
      l("`git commit --amend` son commit'i yeniden yazar. `-m` ile yeni mesajı da verirsin.", "`git commit --amend` rewrites the last commit. With `-m` you give the new message too."),
      l("`git commit --amend -m \"Fix checkout\"`", "`git commit --amend -m \"Fix checkout\"`"),
    ],
    par: 1,
    check: (ctx) => {
      const head = headId(ctx.state)!;
      const message = ctx.state.commits[head]!.message.toLowerCase();
      return amended(ctx) && depth(ctx, "state") === depth(ctx, "start") && message.includes("checkout") && !message.includes("chekout");
    },
  },
  {
    id: "forgot-file",
    title: l("Unutulan dosya", "Forgotten file"),
    story: l(
      "Sepet özelliğini commit'ledin ama `cart.css` dosyasını eklemeyi unuttun: hâlâ klasörde, takip edilmiyor. Commit'i henüz paylaşmadın. \"cart.css eklendi\" diye ikinci bir commit geçmişi kirletir.",
      "You committed the cart feature but forgot to add `cart.css`: it's still in the folder, untracked. You haven't shared the commit yet. A second \"add cart.css\" commit would clutter the history.",
    ),
    goal: l("`cart.css` son commit'in içine girsin; commit sayısı ve mesajı aynı kalsın.", "`cart.css` goes into the last commit; the number of commits and its message stay the same."),
    start: repoAfter([write("cart.js", "addToCart()"), { type: "add", paths: ["cart.js"] }, commit("Add the cart"), write("cart.css", ".cart { display: flex }")], SHOP),
    hints: [
      l("Önce dosyayı staging'e koy. Sonra yeni commit yerine sonuncuyu genişlet.", "Stage the file first. Then extend the last commit instead of making a new one."),
      l("`--amend --no-edit` staging'dekini son commit'e katar ve mesajı olduğu gibi bırakır.", "`--amend --no-edit` folds what is staged into the last commit and keeps its message."),
      l("`git add cart.css` sonra `git commit --amend --no-edit`", "`git add cart.css` then `git commit --amend --no-edit`"),
    ],
    par: 2,
    check: (ctx) => {
      const head = ctx.state.commits[headId(ctx.state)!]!;
      return amended(ctx) && depth(ctx, "state") === depth(ctx, "start") && head.message === "Add the cart" && "cart.css" in head.files && "cart.js" in head.files;
    },
  },
  {
    id: "one-thing-each",
    title: l("Her commit tek iş", "One thing per commit"),
    story: l(
      "Gün boyu iki ayrı işi yaptın: `README.md`'deki kurulum adımlarını düzelttin ve `app.js`'e arama özelliğini ekledin. Yarın biri \"arama ne zaman geldi?\" diye `git log`'a bakacak; iki işi tek commit'e sıkıştırırsan cevap bulanıklaşır.",
      "You did two separate things today: fixed the setup steps in `README.md` and added search to `app.js`. Tomorrow someone will look at `git log` to see when search arrived; squeezing both into one commit blurs the answer.",
    ),
    goal: l("İki **ayrı** commit olsun: biri sadece `README.md`'yi, diğeri sadece `app.js`'i değiştirsin.", "Two **separate** commits: one changes only `README.md`, the other only `app.js`."),
    start: repoAfter([write("README.md", "# Shop\nnpm install && npm start"), write("app.js", "showProducts()\nshowCart()\nsearch()")], SHOP),
    hints: [
      l("Commit staging'dekini kaydeder. Her seferinde staging'e tek dosya koy.", "A commit saves what is staged. Stage one file at a time."),
      l("`git add README.md`, commit; sonra `git add app.js`, commit.", "`git add README.md`, commit; then `git add app.js`, commit."),
      l("`git add README.md`, `git commit -m \"Fix setup steps\"`, `git add app.js`, `git commit -m \"Add search\"`", "`git add README.md`, `git commit -m \"Fix setup steps\"`, `git add app.js`, `git commit -m \"Add search\"`"),
    ],
    par: 4,
    check: (ctx) => {
      const mine = added(ctx);
      if (mine.length !== 2 || !status(ctx.state).clean) return false;
      const files = mine.map((c) => changedIn(ctx.state, c).join()).sort();
      return files.join("|") === "README.md|app.js";
    },
  },
  {
    id: "wip",
    title: l("\"wip\" commit'i", "The \"wip\" commit"),
    story: l(
      "Akşam aceleyle `wip` mesajlı bir commit attın. Bu sabah eksik kalan testi `cart.test.js` olarak yazdın. Paylaşmadan önce o commit'i düzgün hale getirmek istiyorsun: test içinde olsun, mesaj ne yaptığını anlatsın.",
      "Last night you hurried out a commit with the message `wip`. This morning you wrote the missing test as `cart.test.js`. Before sharing, you want to tidy that commit: the test inside, and a message that says what it does.",
    ),
    goal: l("Son commit `cart.test.js`'i de içersin ve mesajı artık `wip` olmasın; yeni commit eklenmesin.", "The last commit also holds `cart.test.js` and its message is no longer `wip`; no new commit."),
    start: repoAfter([write("cart.js", "addToCart()\nremoveFromCart()"), { type: "add", paths: ["cart.js"] }, commit("wip"), write("cart.test.js", "test('adds an item')")], SHOP),
    hints: [
      l("Bu da son commit'i yeniden yazmak: hem içeriğini hem mesajını aynı anda değiştirebilirsin.", "This is rewriting the last commit again: you can change its content and its message at once."),
      l("Testi `git add` ile koy, sonra `git commit --amend -m \"...\"`.", "Stage the test with `git add`, then `git commit --amend -m \"...\"`."),
      l("`git add cart.test.js` sonra `git commit --amend -m \"Add removing from the cart\"`", "`git add cart.test.js` then `git commit --amend -m \"Add removing from the cart\"`"),
    ],
    par: 2,
    check: (ctx) => {
      const head = ctx.state.commits[headId(ctx.state)!]!;
      return amended(ctx) && depth(ctx, "state") === depth(ctx, "start") && "cart.test.js" in head.files && head.message.trim().toLowerCase() !== "wip" && head.message.trim() !== "";
    },
  },
];
