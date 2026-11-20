import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, headId, isAncestor, resolve, status, type Files, type GitAction, type Repo } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { changedIn, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commitAll = (message: string): GitAction[] => [{ type: "add", paths: "." }, { type: "commit", message }];

/** The shop project on its first commit. */
export const SHOP = repoAfter([write("README.md", "# Shop"), write("app.js", "showProducts()"), ...commitAll("Initial shop")], createRepo({ author: ADA }));

const tip = (r: Repo) => r.commits[headId(r)!]!;
const sameFiles = (a: Files, b: Files) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export const scenarios: GitScenario[] = [
  {
    id: "squash-local",
    title: l("Üç commit'i birleştir", "Squash three commits"),
    story: l(
      "Arama özelliği üzerinde çalışırken üç küçük commit attın: \"WIP search\", \"WIP search 2\", \"Search works\". Henüz push etmedin ve geçmişte tek, düzgün bir commit görünsün istiyorsun.",
      "While building search you made three small commits: \"WIP search\", \"WIP search 2\", \"Search works\". You haven't pushed, and you want history to show one clean commit.",
    ),
    goal: l("Bu üç commit yerine **tek bir commit** olsun; dosyaların son hali değişmesin.", "Those three become **one commit**; the files end up exactly as they are now."),
    start: repoAfter(
      [write("search.js", "search("), ...commitAll("WIP search"), write("search.js", "search(q)"), ...commitAll("WIP search 2"), write("search.js", "search(q) { return find(q) }"), ...commitAll("Search works")],
      SHOP,
    ),
    hints: [
      l("Branch'i üç commit geri taşı ama değişiklikleri kaybetme: hepsi staging'de bir araya gelsin.", "Move the branch back three commits without losing the changes: let them all gather in staging."),
      l("`git reset --soft` branch'i geri taşır, değişiklikleri staging'de bırakır.", "`git reset --soft` moves the branch back and leaves the changes staged."),
      l('`git reset --soft HEAD~3` sonra `git commit -m "Add search"`', '`git reset --soft HEAD~3` then `git commit -m "Add search"`'),
    ],
    par: 2,
    check: (ctx) => {
      const t = tip(ctx.state);
      return t.parents.length === 1 && t.parents[0] === resolve(ctx.start, "HEAD~3") && sameFiles(t.files, tip(ctx.start).files) && status(ctx.state).clean;
    },
  },
  {
    id: "revert-shared",
    title: l("Paylaşılmış hata", "A shared mistake"),
    story: l(
      "Dün \"Change prices\" commit'ini push ettin ve ekip çekti. Bugün fiyatların yanlış olduğu çıktı. Ondan sonra gelen \"Update README\" commit'i ise doğru ve kalmalı. Geçmişi değiştirirsen herkesin repo'su bozulur.",
      "Yesterday you pushed \"Change prices\" and the team pulled it. Today the prices turn out wrong. The \"Update README\" commit that came after is fine and must stay. Rewriting history would break everyone's repo.",
    ),
    goal: l(
      "\"Change prices\"in etkisi geri alınsın, **geçmiş değişmeden**; README güncellemesi dursun.",
      "Undo the effect of \"Change prices\" **without rewriting history**; the README update stays.",
    ),
    start: repoAfter(
      [write("prices.js", "price = 10"), ...commitAll("Add prices"), write("prices.js", "price = 1"), ...commitAll("Change prices"), write("README.md", "# Shop\nPrices in EUR"), ...commitAll("Update README")],
      SHOP,
    ),
    hints: [
      l("Paylaşılmış geçmişte commit silinmez. Onu geri alan **yeni** bir commit eklenir.", "On shared history you never remove a commit. You add a **new** commit that undoes it."),
      l("`git revert` bir commit'in tersini yeni bir commit olarak ekler. Hedef son commit değil, bir önceki: `HEAD~1` ya da `git log --oneline`'daki kimliği.", "`git revert` adds the opposite of a commit as a new commit. The target is not the last commit but the one before: `HEAD~1`, or its id from `git log --oneline`."),
      l("`git revert HEAD~1`", "`git revert HEAD~1`"),
    ],
    par: 1,
    check: (ctx) => {
      const t = tip(ctx.state);
      return isAncestor(ctx.state, headId(ctx.start)!, t.id) && t.files["prices.js"] === "price = 10" && t.files["README.md"] === tip(ctx.start).files["README.md"] && status(ctx.state).clean;
    },
  },
  {
    id: "split-commit",
    title: l("Commit'i ikiye böl", "Split a commit"),
    story: l(
      "Son commit'in adı \"Cart and footer\": iki ilgisiz değişiklik, `cart.js` ve `footer.html`, tek commit'e girmiş. Henüz push etmedin. Kod incelemesi kolay olsun diye bunu **iki ayrı commit** yapmak istiyorsun.",
      "The last commit is \"Cart and footer\": two unrelated changes, `cart.js` and `footer.html`, went into one commit. You haven't pushed. To make review easy you want it as **two separate commits**.",
    ),
    goal: l("\"Cart and footer\" yerine iki commit olsun: biri sadece `cart.js`'i, diğeri sadece `footer.html`'i değiştirsin.", "Replace \"Cart and footer\" with two commits: one changes only `cart.js`, the other only `footer.html`."),
    start: repoAfter([write("cart.js", "addToCart()"), write("footer.html", "<footer>Shop</footer>"), ...commitAll("Cart and footer")], SHOP),
    hints: [
      l("Önce commit'i geri al ama değişiklikleri klasörde tut. Sonra parça parça yeniden commit at.", "First undo the commit but keep the changes in the folder. Then commit again, piece by piece."),
      l("`git reset HEAD~1` (yani `--mixed`) commit'i geri alır, değişiklikler klasörde kalır. Sonra her dosya için `git add` ve `git commit`.", "`git reset HEAD~1` (that is, `--mixed`) undoes the commit and leaves the changes in the folder. Then `git add` and `git commit` for each file."),
      l(
        '`git reset HEAD~1`, `git add cart.js`, `git commit -m "Add cart"`, `git add footer.html`, `git commit -m "Add footer"`',
        '`git reset HEAD~1`, `git add cart.js`, `git commit -m "Add cart"`, `git add footer.html`, `git commit -m "Add footer"`',
      ),
    ],
    par: 5,
    check: (ctx) => {
      const t = tip(ctx.state);
      const p = t.parents[0] ? ctx.state.commits[t.parents[0]] : undefined;
      if (!p || p.parents[0] !== resolve(ctx.start, "HEAD~1") || t.parents.length !== 1) return false;
      const touched = [changedIn(ctx.state, p.id), changedIn(ctx.state, t.id)];
      return touched.every((f) => f.length === 1) && touched.flat().sort().join() === "cart.js,footer.html" && status(ctx.state).clean;
    },
  },
  {
    id: "throw-experiment",
    title: l("Deneyi çöpe at", "Bin the experiment"),
    story: l(
      "Yeni bir sayfa düzeni denedin: iki commit attın (\"Try new layout\", \"More layout\") ve `app.js`'te kaydedilmemiş değişiklikler de var. Hepsi kötü oldu. Hiçbirini push etmedin.",
      "You tried a new page layout: two commits (\"Try new layout\", \"More layout\") plus unsaved changes in `app.js`. It all turned out bad. You pushed none of it.",
    ),
    goal: l("main denemeden önceki commit'e dönsün ve klasörde **hiçbir değişiklik** kalmasın.", "main goes back to the commit before the experiment, with **no changes** left in the folder."),
    start: repoAfter([write("layout.css", "grid"), ...commitAll("Try new layout"), write("layout.css", "grid; gap: 2px"), ...commitAll("More layout"), write("app.js", "showProducts()\nuseLayout()")], SHOP),
    hints: [
      l("İki commit'i de, kaydedilmemiş değişiklikleri de atmak istiyorsun. Bunu tek bir reset modu yapar.", "You want to drop both commits and the unsaved changes. One reset mode does all of that."),
      l("`git reset --hard` branch'i taşır, staging'i ve klasörü de oraya eşitler. Geri alınması zordur.", "`git reset --hard` moves the branch and makes staging and the folder match. It's hard to undo."),
      l("`git reset --hard HEAD~2`", "`git reset --hard HEAD~2`"),
    ],
    par: 1,
    check: (ctx) => headId(ctx.state) === resolve(ctx.start, "HEAD~2") && status(ctx.state).clean && status(ctx.state).untracked.length === 0,
  },
];
