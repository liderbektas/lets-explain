import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, headFiles, headId, isAncestor, status, type GitAction } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const save = (path: string, content: string, message: string): GitAction[] => [write(path, content), { type: "add", paths: [path] }, { type: "commit", message }];

/** A small shop app on its first commit. */
const APP = repoAfter(save("app.js", "showProducts()", "Başlangıç"), createRepo({ author: ADA }));

export const scenarios: GitScenario[] = [
  {
    id: "secrets",
    title: l("Gizli anahtar", "The secret key"),
    story: l(
      "Ödeme servisine bağlanmak için projeye bir `.env` dosyası ekledin; içinde gerçek API anahtarı var. Ekip lideri uyardı: \"Bu dosya **asla** repo'ya girmemeli, kimse yanlışlıkla eklemesin.\"",
      "To talk to the payment service you added a `.env` file to the project, holding the real API key. Your team lead warned you: \"This file must **never** get into the repo; make sure nobody adds it by accident.\"",
    ),
    goal: l("`.env` yok sayılsın ve klasörde kalsın; kural commit'lensin ki herkes için geçerli olsun.", "`.env` is ignored and stays in the folder; the rule is committed so it holds for everyone."),
    start: repoAfter([write(".env", "PAYMENT_KEY=sk_live_42")], APP),
    hints: [
      l("Git'e bir dosyayı hiç görmemesini söyleyen dosya `.gitignore`. Kendisi de commit'lenir.", "The file that tells Git never to see a file is `.gitignore`. It gets committed itself."),
      l("`echo \".env\" > .gitignore` kuralı yazar; sonra `.gitignore`'u add edip commit'le.", "`echo \".env\" > .gitignore` writes the rule; then add `.gitignore` and commit it."),
      l("`echo \".env\" > .gitignore`, `git add .gitignore`, `git commit -m \"Ignore .env\"`", "`echo \".env\" > .gitignore`, `git add .gitignore`, `git commit -m \"Ignore .env\"`"),
    ],
    par: 3,
    check: ({ state }) => {
      const files = headFiles(state);
      return ".gitignore" in files && !(".env" in files) && state.work[".env"] === "PAYMENT_KEY=sk_live_42" && status(state).ignored.includes(".env");
    },
  },
  {
    id: "safe-add-all",
    title: l("Güvenli add .", "A safe add ."),
    story: l(
      "`npm install` bir `node_modules/` klasörü oluşturdu, uygulama da her çalıştığında `app.log` yazıyor. `app.js`'te bir değişiklik yaptın ve alışkanlıkla `git add .` yazmak üzeresin. `.gitignore` şimdilik sadece `.env`'i biliyor.",
      "`npm install` created a `node_modules/` folder, and the app writes `app.log` every time it runs. You changed `app.js` and are about to type `git add .` out of habit. `.gitignore` only knows about `.env` so far.",
    ),
    goal: l(
      "`app.js` değişikliği commit'lensin; `app.log` ve `node_modules/` repo'ya girmesin, **yok sayılsın**. Güncellenen `.gitignore` da commit'te olsun.",
      "The `app.js` change is committed; `app.log` and `node_modules/` stay out of the repo and are **ignored**. The updated `.gitignore` is in the commit too.",
    ),
    start: repoAfter(
      [...save(".gitignore", ".env", ".gitignore eklendi"), write("app.js", "showProducts()\nshowCart()"), write("app.log", "server started"), write("node_modules/lib.js", "library"), write(".env", "PAYMENT_KEY=sk_live_42")],
      APP,
    ),
    hints: [
      l("`git status`'a bak: `git add .` şu an neleri alırdı? Önce kuralları yaz, sonra add et.", "Look at `git status`: what would `git add .` take right now? Write the rules first, then add."),
      l("`>>` dosyanın sonuna bir satır ekler. Bütün log'lar için `*.log`, klasör için sonda `/` olan `node_modules/`.", "`>>` adds a line at the end of a file. `*.log` for every log, and `node_modules/` with a trailing `/` for the folder."),
      l(
        "`echo \"*.log\" >> .gitignore`, `echo \"node_modules/\" >> .gitignore`, `git add .`, `git commit -m \"Show cart\"`",
        "`echo \"*.log\" >> .gitignore`, `echo \"node_modules/\" >> .gitignore`, `git add .`, `git commit -m \"Show cart\"`",
      ),
    ],
    par: 4,
    check: ({ state }) => {
      const files = headFiles(state);
      const st = status(state);
      return (
        files["app.js"] === "showProducts()\nshowCart()" &&
        ["app.log", "node_modules/lib.js", ".env"].every((p) => !(p in files) && st.ignored.includes(p)) &&
        files[".gitignore"] === state.work[".gitignore"] &&
        st.clean &&
        st.untracked.length === 0
      );
    },
  },
  {
    id: "tracked-log",
    title: l("Zaten commit'lenmiş", "Already committed"),
    story: l(
      "Projeye yeni katıldın ve `debug.log`'un aylar önce commit'lendiğini gördün: her çalıştırmada değişiyor ve herkesin `git status`'unu kirletiyor. Dosya senin makinende kalmalı ama repo'dan çıkmalı.",
      "You just joined the project and see that `debug.log` was committed months ago: it changes on every run and clutters everyone's `git status`. It should stay on your machine but leave the repo.",
    ),
    goal: l("`debug.log` repo'dan çıksın, klasörde kalsın ve bundan sonra yok sayılsın; kural da commit'te olsun.", "`debug.log` leaves the repo, stays in the folder and is ignored from now on; the rule is committed too."),
    start: repoAfter([...save("debug.log", "log 1", "Log eklendi"), write("debug.log", "log 2")], APP),
    hints: [
      l("Git zaten takip ettiği bir dosyayı `.gitignore` yüzünden bırakmaz. Önce onu unutması gerekir.", "Git won't let go of a file it already tracks just because of `.gitignore`. It has to forget it first."),
      l("`git rm --cached` dosyayı repo'dan çıkarır ama klasörde bırakır. Kuralı da `.gitignore`'a yaz.", "`git rm --cached` takes the file out of the repo but leaves it in the folder. Write the rule into `.gitignore` too."),
      l(
        "`echo \"*.log\" > .gitignore`, `git rm --cached debug.log`, `git add .gitignore`, `git commit -m \"Stop tracking debug.log\"`",
        "`echo \"*.log\" > .gitignore`, `git rm --cached debug.log`, `git add .gitignore`, `git commit -m \"Stop tracking debug.log\"`",
      ),
    ],
    par: 4,
    check: ({ state }) => {
      const files = headFiles(state);
      return !("debug.log" in files) && ".gitignore" in files && state.work["debug.log"] === "log 2" && status(state).ignored.includes("debug.log");
    },
  },
  {
    id: "tag-yesterday",
    title: l("Dünkü sürüm", "Yesterday's release"),
    story: l(
      "Dün `Ödeme sayfası` commit'i v1.0 olarak canlıya çıktı ama kimse tag koymadı. Bugün üstüne bir commit daha attın. Bir hata çıkarsa \"canlıdaki kod neydi?\" sorusunun cevabı tek bakışta görünmeli.",
      "Yesterday the `Ödeme sayfası` commit went live as v1.0, but nobody tagged it. Today you committed once more on top. If a bug shows up, \"what code is live?\" should be answerable at a glance.",
    ),
    goal: l("`v1.0` tag'i **dünkü** `Ödeme sayfası` commit'inde olsun, bugünkü commit'te değil.", "The `v1.0` tag sits on **yesterday's** `Ödeme sayfası` commit, not on today's."),
    start: repoAfter([...save("checkout.js", "ödeme sayfası", "Ödeme sayfası"), ...save("coupon.js", "kupon kodu", "Kupon kodu")], APP),
    hints: [
      l("`git log --oneline` ile commit'lere bak. Tag'i şu anki commit'e değil, ondan bir öncekine koyacaksın.", "Look at the commits with `git log --oneline`. The tag goes on the one before the current commit."),
      l("`git tag` isimden sonra bir commit de alır: id'si ya da `HEAD~1` gibi bir yol.", "`git tag` takes a commit after the name: its id, or a path like `HEAD~1`."),
      l("`git tag v1.0 HEAD~1`", "`git tag v1.0 HEAD~1`"),
    ],
    par: 1,
    check: ({ state, start }) => {
      const head = headId(start)!;
      return state.tags["v1.0"] === start.commits[head]!.parents[0] && headId(state) === head;
    },
  },
  {
    id: "hotfix",
    title: l("Acil düzeltme", "Hotfix"),
    story: l(
      "`v1.0` canlıda ve fiyatlar yanlış hesaplanıyor. Düzeltmeyi `app.js`'te yaptın bile, henüz commit'lemedin. Düzeltme `v1.0.1` olarak yayınlanacak; `v1.0` ise eski commit'i göstermeye devam etmeli.",
      "`v1.0` is live and prices come out wrong. You've already made the fix in `app.js` but haven't committed it. The fix ships as `v1.0.1`; `v1.0` must keep pointing at the old commit.",
    ),
    goal: l("Düzeltme yeni bir commit olsun ve `v1.0.1` o commit'te dursun; `v1.0` yerinden oynamasın.", "The fix becomes a new commit with `v1.0.1` on it; `v1.0` doesn't move."),
    start: repoAfter([{ type: "tag", name: "v1.0" }, write("app.js", "showProducts()\nfixPrices()")], APP),
    hints: [
      l("Tag konduğu commit'te çakılı kalır. Önce düzeltmeyi commit'le, sonra yeni commit'e yeni tag'i koy.", "A tag stays nailed to its commit. Commit the fix first, then put the new tag on the new commit."),
      l("`git commit -am` takip edilen dosyayı add edip commit'ler; sonra `git tag v1.0.1`.", "`git commit -am` stages the tracked file and commits it; then `git tag v1.0.1`."),
      l("`git commit -am \"Fix prices\"` sonra `git tag v1.0.1`", "`git commit -am \"Fix prices\"` then `git tag v1.0.1`"),
    ],
    par: 2,
    check: (ctx) => {
      const { state, start } = ctx;
      const fix = state.tags["v1.0.1"];
      return Boolean(
        fix &&
          fix === headId(state) &&
          state.tags["v1.0"] === headId(start) &&
          isAncestor(state, state.tags["v1.0"]!, fix) &&
          newCommits(ctx).some((c) => changedIn(state, c).includes("app.js")) &&
          state.commits[fix]!.files["app.js"] === "showProducts()\nfixPrices()",
      );
    },
  },
];
