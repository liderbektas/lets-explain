import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, headId, status, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** The shop project on its first commit. */
export const SHOP = repoAfter(
  [write("README.md", "# Shop"), write("app.js", "showProducts()"), { type: "add", paths: "." }, commit("Initial shop")],
  createRepo({ author: ADA }),
);

const tip = (r: Repo) => r.commits[headId(r)!]!;
/** The last commit was replaced, not added to: the new one sits where the old one did. */
const replaced = (ctx: GitCtx) => headId(ctx.state) !== headId(ctx.start) && JSON.stringify(tip(ctx.state).parents) === JSON.stringify(tip(ctx.start).parents);

export const scenarios: GitScenario[] = [
  {
    id: "typo-message",
    title: l("Mesajda yazım hatası", "Typo in the message"),
    story: l(
      "Ödeme hatasını düzelttin ve hızlıca commit attın. Sonra `git log`'a bakınca mesajın **Fix chekout** olduğunu gördün. Henüz push etmedin.",
      "You fixed the checkout bug and committed quickly. Then `git log` showed the message is **Fix chekout**. You haven't pushed yet.",
    ),
    goal: l("Son commit'in mesajı **Fix checkout** olsun; yeni bir commit eklenmesin.", "The last commit's message reads **Fix checkout**; no new commit is added."),
    start: repoAfter([write("app.js", "showProducts()\nfixCheckout()"), { type: "add", paths: ["app.js"] }, commit("Fix chekout")], SHOP),
    hints: [
      l("Push edilmemiş son commit'i yeni bir commit açmadan **yerinde** değiştirebilirsin.", "A last commit you haven't pushed can be changed **in place**, without a new commit."),
      l("`git commit --amend` son commit'i yeniden yazar; `-m` ile yeni mesajı verirsin.", "`git commit --amend` rewrites the last commit; `-m` gives the new message."),
      l('`git commit --amend -m "Fix checkout"`', '`git commit --amend -m "Fix checkout"`'),
    ],
    par: 1,
    check: (ctx) => replaced(ctx) && tip(ctx.state).message.trim() === "Fix checkout" && tip(ctx.state).files["app.js"] === tip(ctx.start).files["app.js"],
  },
  {
    id: "forgot-file",
    title: l("Unutulan dosya", "The forgotten file"),
    story: l(
      "Sepet özelliğini \"Add cart\" mesajıyla commit'ledin. Sonra `git status` yeni yazdığın `cart.css`'in hâlâ dışarıda kaldığını gösterdi: onu `add` etmeyi unutmuşsun.",
      "You committed the cart feature as \"Add cart\". Then `git status` showed that the `cart.css` you wrote is still left out: you forgot to `add` it.",
    ),
    goal: l("`cart.css` **aynı commit'e** girsin, mesaj \"Add cart\" kalsın; ikinci bir commit olmasın.", "`cart.css` goes into **that same commit**, the message stays \"Add cart\"; no second commit."),
    start: repoAfter([write("cart.js", "addToCart()"), { type: "add", paths: ["cart.js"] }, commit("Add cart"), write("cart.css", ".cart { display: flex }")], SHOP),
    hints: [
      l("Yeni bir commit açmak yerine, dosyayı staging'e koyup son commit'e katabilirsin.", "Instead of a new commit, you can stage the file and fold it into the last commit."),
      l("`--amend` staging'deki her şeyi son commit'e katar; `--no-edit` mesajı olduğu gibi bırakır.", "`--amend` folds everything staged into the last commit; `--no-edit` leaves the message as it is."),
      l("`git add cart.css` sonra `git commit --amend --no-edit`", "`git add cart.css` then `git commit --amend --no-edit`"),
    ],
    par: 2,
    check: (ctx) => replaced(ctx) && tip(ctx.state).message === "Add cart" && "cart.css" in tip(ctx.state).files && status(ctx.state).clean,
  },
  {
    id: "staged-mistake",
    title: l("Staging'deki hata", "The staged mistake"),
    story: l(
      "`app.js`'te hızlı bir çözüm denedin ve `git add` bile yaptın. Şimdi bunun yanlış olduğunu anladın. Bu arada `README.md`'ye yazdığın kurulum notu iyi, o kalmalı.",
      "You tried a quick hack in `app.js` and even ran `git add`. Now you see it's wrong. Meanwhile the setup note you wrote in `README.md` is good and must stay.",
    ),
    goal: l("`app.js` hem staging'de hem klasörde son commit'teki haline dönsün; README notu klasörde kalsın.", "`app.js` goes back to its last committed version, in staging and in the folder; the README note stays in the folder."),
    start: repoAfter([write("app.js", "showProducts()\nhack()"), { type: "add", paths: ["app.js"] }, write("README.md", "# Shop\nRun: npm start")], SHOP),
    hints: [
      l("Değişiklik iki yerde: staging'de ve klasörde. Geri almak da iki adım.", "The change is in two places: staging and the folder. Undoing it takes two steps too."),
      l("Önce `git restore --staged` ile staging'den çıkar, sonra `git restore` ile klasörden at.", "First take it out of staging with `git restore --staged`, then throw it out of the folder with `git restore`."),
      l("`git restore --staged app.js` sonra `git restore app.js`", "`git restore --staged app.js` then `git restore app.js`"),
    ],
    par: 2,
    check: (ctx) => {
      const committed = tip(ctx.state).files["app.js"];
      return (
        headId(ctx.state) === headId(ctx.start) &&
        ctx.state.index["app.js"] === committed &&
        ctx.state.work["app.js"] === committed &&
        ctx.state.work["README.md"] === ctx.start.work["README.md"]
      );
    },
  },
  {
    id: "amend-carefully",
    title: l("Dikkatli amend", "Amend with care"),
    story: l(
      "Son commit'in mesajı **Add serach box** olmuş. Düzelteceksin, ama staging'de yarım kalmış bir `app.js` değişikliği bekliyor. O değişiklik bu commit'e **girmemeli**; işine sonra devam edeceksin.",
      "The last commit's message came out as **Add serach box**. You'll fix it, but a half-done `app.js` change is sitting in staging. That change must **not** go into this commit; you'll keep working on it later.",
    ),
    goal: l(
      "Mesaj **Add search box** olsun, commit'in içeriği değişmesin; yarım `app.js` değişikliği klasörde dursun.",
      "The message reads **Add search box** and the commit's content doesn't change; the half-done `app.js` change stays in the folder.",
    ),
    start: repoAfter(
      [write("search.js", "searchBox()"), { type: "add", paths: ["search.js"] }, commit("Add serach box"), write("app.js", "showProducts()\nsearchBox( // yarım"), { type: "add", paths: ["app.js"] }],
      SHOP,
    ),
    hints: [
      l("`--amend` staging'de ne varsa onu da son commit'e katar. `git status`'a bak: staging boş mu?", "`--amend` also folds whatever is staged into the last commit. Check `git status`: is staging empty?"),
      l("Önce `app.js`'i staging'den çıkar (klasörde kalır), sonra amend et.", "Unstage `app.js` first (it stays in the folder), then amend."),
      l('`git restore --staged app.js` sonra `git commit --amend -m "Add search box"`', '`git restore --staged app.js` then `git commit --amend -m "Add search box"`'),
    ],
    par: 2,
    check: (ctx) =>
      replaced(ctx) &&
      tip(ctx.state).message.trim() === "Add search box" &&
      tip(ctx.state).files["app.js"] === SHOP.work["app.js"] &&
      ctx.state.work["app.js"] === ctx.start.work["app.js"],
  },
];
