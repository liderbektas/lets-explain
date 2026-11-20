import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, status, type GitAction } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** The shop project as it is on the last commit: three files, nothing pending. */
export const SHOP = repoAfter(
  [
    write("README.md", "# Shop"),
    write("app.js", "showProducts()"),
    write("style.css", "body { color: #222 }"),
    { type: "add", paths: "." },
    { type: "commit", message: "Initial shop" },
  ],
  createRepo({ author: ADA }),
);

export const scenarios: GitScenario[] = [
  {
    id: "only-the-fix",
    title: l("Sadece düzeltme", "Only the fix"),
    story: l(
      "Sabahtan beri iki dosyada çalışıyorsun. `app.js`'teki ödeme hatasını düzelttin; bir de `README.md`'ye yarım kalmış bir not ekledin. Ekip düzeltmeyi bekliyor, ama README notu henüz hazır değil.",
      "You've been working in two files since the morning. You fixed the checkout bug in `app.js`, and you also started a note in `README.md` that isn't finished. The team is waiting for the fix, but the README note isn't ready.",
    ),
    goal: l("Düzeltme commit'lensin; README'deki not commit'e **girmesin**, klasörde beklesin.", "Commit the fix; the README note stays **out** of it, waiting in the folder."),
    start: repoAfter([write("app.js", "showProducts()\nfixCheckout()"), write("README.md", "# Shop\nTODO: kurulum adımları")], SHOP),
    hints: [
      l("Commit, klasördekini değil **staging'dekini** kaydeder. Önce neyin staging'e gireceğini seç.", "A commit saves what is **staged**, not what is in the folder. Choose what goes into staging first."),
      l("`git add` dosya adıyla tek dosyayı staging'e koyar.", "`git add` with a file name stages just that file."),
      l("`git add app.js` sonra `git commit -m \"Fix checkout\"`", "`git add app.js` then `git commit -m \"Fix checkout\"`"),
    ],
    par: 2,
    check: (ctx) => {
      const onlyApp = newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.length === 1 && files[0] === "app.js";
      });
      return onlyApp && status(ctx.state).unstaged.some((c) => c.path === "README.md");
    },
  },
  {
    id: "too-much-staged",
    title: l("Fazla eklendi", "Staged too much"),
    story: l(
      "Alışkanlıkla `git add .` yazdın. `app.js`'teki değişikliğin yanında, hata ararken oluşan `debug.log` da staging'e girdi. O dosya commit'e girmemeli, ama işin bitene kadar silmek de istemiyorsun.",
      "Out of habit you typed `git add .`. Along with your change to `app.js`, the `debug.log` you made while hunting a bug got staged too. It must not go into a commit, but you want to keep it until you're done.",
    ),
    goal: l("`debug.log` staging'den çıksın ama klasörde kalsın; `app.js` staging'de kalsın.", "`debug.log` leaves staging but stays in the folder; `app.js` stays staged."),
    start: repoAfter([write("app.js", "showProducts()\nshowCart()"), write("debug.log", "cart is undefined at line 2"), { type: "add", paths: "." }], SHOP),
    hints: [
      l("Önce `git status` ile neyin nerede olduğuna bak. Çıktı ne yapabileceğini de söyler.", "Look with `git status` first. Its output also tells you what you can do."),
      l("Staging'den çıkarmak `git restore --staged`. Dosya klasörde olduğu gibi kalır.", "Unstaging is `git restore --staged`. The file stays in the folder as it is."),
      l("`git restore --staged debug.log`", "`git restore --staged debug.log`"),
    ],
    par: 1,
    check: (ctx) => {
      const st = status(ctx.state);
      return (
        newCommits(ctx).length === 0 &&
        "debug.log" in ctx.state.work &&
        st.untracked.includes("debug.log") &&
        st.staged.some((c) => c.path === "app.js")
      );
    },
  },
  {
    id: "bad-experiment",
    title: l("Kötü deneme", "Bad experiment"),
    story: l(
      "`style.css`'te renklerle oynadın ve sonuç berbat oldu. Hiçbir şeyi kaydetmedin. Aynı anda `app.js`'te yaptığın küçük değişiklik ise iyi, o kalmalı.",
      "You played with the colours in `style.css` and it looks awful. You haven't saved anything. The small change you made in `app.js` meanwhile is good and should stay.",
    ),
    goal: l("`style.css` son commit'teki haline dönsün; `app.js`'teki değişiklik dursun.", "`style.css` goes back to its last committed version; the `app.js` change stays."),
    start: repoAfter([write("style.css", "body { color: hotpink; background: lime }"), write("app.js", "showProducts()\nshowBanner()")], SHOP),
    hints: [
      l("Klasördeki bir değişikliği atmak, dosyayı staging'deki haline geri koymaktır.", "Throwing away a change in the folder means putting the file back to its staged version."),
      l("`git restore` dosya adıyla sadece o dosyayı geri alır. Dikkat: bu geri alınamaz.", "`git restore` with a file name puts back just that file. Careful: this can't be undone."),
      l("`git restore style.css`", "`git restore style.css`"),
    ],
    par: 1,
    check: (ctx) => {
      const st = status(ctx.state);
      return (
        newCommits(ctx).length === 0 &&
        ctx.state.work["style.css"] === SHOP.work["style.css"] &&
        st.unstaged.some((c) => c.path === "app.js") &&
        ctx.state.work["app.js"] === ctx.start.work["app.js"]
      );
    },
  },
  {
    id: "together",
    title: l("Birlikte kaydet", "Save them together"),
    story: l(
      "Sepet özelliği için yeni bir `cart.js` dosyası yazdın ve `app.js`'ten onu çağırdın. İkisi birbirine bağlı: ayrı commit'lere bölünürse arada proje çalışmaz.",
      "For the cart feature you wrote a new file, `cart.js`, and called it from `app.js`. They depend on each other: split across two commits, the project would be broken in between.",
    ),
    goal: l("`cart.js` ve `app.js` **aynı commit'te** kaydedilsin.", "`cart.js` and `app.js` are saved in **the same commit**."),
    start: repoAfter([write("cart.js", "export function addToCart(id) {}"), write("app.js", "showProducts()\naddToCart(1)")], SHOP),
    hints: [
      l("Yeni bir dosyayı Git henüz tanımıyor: `git commit -a` onu almaz.", "Git doesn't know the new file yet: `git commit -a` won't pick it up."),
      l("İkisini birden staging'e koy, sonra tek commit at.", "Stage both, then make one commit."),
      l("`git add .` sonra `git commit -m \"Add cart\"`", "`git add .` then `git commit -m \"Add cart\"`"),
    ],
    par: 2,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.includes("cart.js") && files.includes("app.js");
      }),
  },
  {
    id: "changed-after-add",
    title: l("add'den sonra değişti", "Changed after add"),
    story: l(
      "`app.js`'i düzenleyip `git add` yaptın. Sonra bir yazım hatası fark edip dosyayı bir kez daha düzelttin. Commit'e dosyanın **son hali** girmeli.",
      "You edited `app.js` and ran `git add`. Then you spotted a typo and fixed the file once more. The commit must have the file's **latest** version.",
    ),
    goal: l("Yeni commit'te `app.js` klasördeki son haliyle olsun; geride bekleyen değişiklik kalmasın.", "The new commit has `app.js` as it is in the folder now; nothing is left pending."),
    start: repoAfter([write("app.js", "showProdcts()\nshowCart()"), { type: "add", paths: ["app.js"] }, write("app.js", "showProducts()\nshowCart()")], SHOP),
    hints: [
      l("`git status`'a bak: aynı dosya hem staging'de hem de klasörde değişmiş görünüyor. Staging'deki, düzeltmeden önceki hali.", "Check `git status`: the same file shows as both staged and changed in the folder. The staged one is the version before your fix."),
      l("`git add` dosyanın **o anki** halini staging'e kopyalar. Düzeltmeden sonra bir kez daha gerekiyor.", "`git add` copies the file as it is **at that moment**. You need it once more after the fix."),
      l("`git add app.js` sonra `git commit -m \"Show cart\"`", "`git add app.js` then `git commit -m \"Show cart\"`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = newCommits(ctx).at(-1);
      return Boolean(c && ctx.state.commits[c]!.files["app.js"] === ctx.start.work["app.js"] && status(ctx.state).clean);
    },
  },
];
