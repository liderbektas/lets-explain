import { l } from "@lets-explain/core/i18n";
import { ADA, asRemote, cloned, createRepo, firstParents, headFiles, headId, resolve, status, type GitAction, type Repo } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const edit = (path: string, content: string, message: string): GitAction[] => [write(path, content), { type: "add", paths: [path] }, { type: "commit", message }];

/** One shared commit on origin; every scenario works on a clone with unpushed commits on top. */
export const ORIGIN = asRemote(repoAfter(edit("README.md", "Uygulama", "Proje başladı"), createRepo({ author: ADA })));
const clone = (actions: GitAction[]) => repoAfter(actions, cloned(ORIGIN));

/** The lesson's five commits written in a hurry. */
export const START: Repo = clone([
  ...edit("login.js", "giriş formu", "Giriş formu"),
  ...edit("login.js", "giriş formu (e-posta doğrulamalı)", "yazım hatası düzeltildi"),
  ...edit("debug.js", "console.log(user)", "debug log"),
  ...edit("password.js", "şifre kontrolü (yarım)", "wip"),
  ...edit("password.js", "şifre kontrolü", "Şifre kontorlü"),
]);

/** Local commits on top of origin/main, oldest first: what `git rebase -i origin/main` lists. */
export function onTop(repo: Repo): string[] {
  const base = resolve(repo, "origin/main");
  const chain = firstParents(repo, headId(repo));
  const cut = base ? chain.indexOf(base) : -1;
  return (cut < 0 ? chain : chain.slice(0, cut)).reverse();
}

export const messagesOnTop = (repo: Repo) => onTop(repo).map((id) => repo.commits[id]!.message);

/** The final code of `start` is still all there (minus the files named in `gone`). */
const sameCode = (state: Repo, start: Repo, gone: string[] = []) => {
  const want = { ...headFiles(start) };
  for (const g of gone) delete want[g];
  const have = headFiles(state);
  return Object.keys(want).length === Object.keys(have).length && Object.entries(want).every(([k, v]) => have[k] === v);
};

export const scenarios: GitScenario[] = [
  {
    id: "typo",
    title: l("Yazım hatası", "A typo"),
    story: l(
      "Sepet sayfasını bitirip commit'ledin, mesajı da hızlıca yazdın: `Sepet sayfsı`. Henüz push etmedin. PR'da bu hatalı mesaj herkesin gözüne batacak.",
      "You finished the cart page and committed it, typing the message quickly: `Sepet sayfsı`. You haven't pushed yet. In the PR, that typo will stand out to everyone.",
    ),
    goal: l("Son commit'in mesajı `Sepet sayfası` olsun; commit sayısı ve kod aynı kalsın.", "The last commit's message reads `Sepet sayfası`; the number of commits and the code stay the same."),
    start: clone(edit("cart.js", "sepet sayfası", "Sepet sayfsı")),
    hints: [
      l("Push etmediğin son commit'i düzeltmenin kısa bir yolu var: yenisini eklemek yerine onu yeniden yazmak.", "There's a short way to fix the last commit you haven't pushed: rewrite it instead of adding a new one."),
      l("`git commit --amend` son commit'i yenisiyle değiştirir; `-m` ile yeni mesajı verirsin.", "`git commit --amend` replaces the last commit; give the new message with `-m`."),
      l("`git commit --amend -m \"Sepet sayfası\"`", "`git commit --amend -m \"Sepet sayfası\"`"),
    ],
    par: 1,
    check: ({ state, start }) => messagesOnTop(state).join("|") === "Sepet sayfası" && sameCode(state, start),
  },
  {
    id: "forgot-file",
    title: l("Unutulan dosya", "The forgotten file"),
    story: l(
      "`Giriş formu` commit'ini attın, sonra `login.css`'i eklemeyi unuttuğunu fark ettin: dosya klasörde duruyor. Push etmedin. Ayrı bir \"css unutmuşum\" commit'i yerine düzeltme o commit'in içinde olmalı.",
      "You made the `Giriş formu` commit, then noticed you forgot `login.css`: the file is sitting in the folder. You haven't pushed. Instead of a separate \"forgot the css\" commit, the fix belongs inside that commit.",
    ),
    goal: l("`login.css` **aynı** `Giriş formu` commit'ine girsin; yeni commit eklenmesin, mesaj değişmesin.", "`login.css` goes into the **same** `Giriş formu` commit; no extra commit, same message."),
    start: clone([...edit("login.js", "giriş formu", "Giriş formu"), write("login.css", ".form { gap: 8px }")]),
    hints: [
      l("Amend sadece mesaj için değil: staging'deki her şeyi son commit'e katar.", "Amend isn't only for messages: it folds whatever is staged into the last commit."),
      l("Önce dosyayı staging'e koy, sonra `git commit --amend --no-edit`: mesaj olduğu gibi kalır.", "Stage the file first, then `git commit --amend --no-edit`: the message stays as it is."),
      l("`git add login.css` sonra `git commit --amend --no-edit`", "`git add login.css` then `git commit --amend --no-edit`"),
    ],
    par: 2,
    check: ({ state }) => {
      const files = headFiles(state);
      return messagesOnTop(state).join("|") === "Giriş formu" && files["login.css"] === ".form { gap: 8px }" && "login.js" in files && status(state).clean && status(state).untracked.length === 0;
    },
  },
  {
    id: "drop-debug",
    title: l("Debug commit'i", "The debug commit"),
    story: l(
      "PR açmadan önce `git log`'a baktın: iki özellik commit'inin arasında, hata ararken attığın bir `debug log` commit'i duruyor. İçindeki `debug.js` kullanıcı bilgisini konsola yazıyor; kimse görmemeli.",
      "Before opening the PR you looked at `git log`: between your two feature commits sits a `debug log` commit from when you were hunting a bug. Its `debug.js` prints user data to the console; nobody should see it.",
    ),
    goal: l("`debug log` commit'i geçmişten tamamen çıksın; iki özellik commit'i ve kodları kalsın.", "The `debug log` commit is gone from history entirely; the two feature commits and their code stay."),
    start: clone([
      ...edit("products.js", "ürün listesi", "Ürün listesi"),
      ...edit("debug.js", "console.log(user)", "debug log"),
      ...edit("filter.js", "fiyat filtresi", "Ürün filtresi"),
    ]),
    hints: [
      l("Ortadaki bir commit'i çıkarmak için push etmediğin commit'leri bir liste olarak açman gerekir.", "To take out a commit in the middle, open your unpushed commits as a list."),
      l("`git rebase -i origin/main` listeyi editörde açar. O satırın başını `drop` yap (ya da satırı sil) ve kaydet.", "`git rebase -i origin/main` opens the list in the editor. Change that line's first word to `drop` (or delete the line) and save."),
      l("`git rebase -i origin/main`, sonra editörde `pick … debug log` satırını `drop … debug log` yap ve kaydet", "`git rebase -i origin/main`, then in the editor change `pick … debug log` to `drop … debug log` and save"),
    ],
    par: 1,
    check: ({ state, start }) => messagesOnTop(state).join("|") === "Ürün listesi|Ürün filtresi" && sameCode(state, start, ["debug.js"]),
  },
  {
    id: "squash-wip",
    title: l("WIP'leri birleştir", "Squash the WIPs"),
    story: l(
      "Şifre kontrolünü yazarken her akşam `wip` diye commit attın: üç commit oldu. PR'ı inceleyecek kişi bunları tek tek okumak zorunda kalmamalı.",
      "While writing the password check you committed every evening as `wip`: three commits now. Whoever reviews the PR shouldn't have to read them one by one.",
    ),
    goal: l("origin/main'in üstünde **tek bir** `Şifre kontrolü` commit'i kalsın; son kod aynı olsun.", "Leave **a single** `Şifre kontrolü` commit on top of origin/main, with the same final code."),
    start: clone([
      ...edit("password.js", "şifre kontrolü (başlangıç)", "wip"),
      ...edit("password.js", "şifre kontrolü (yarım)", "wip 2"),
      ...edit("password.js", "şifre kontrolü", "çalışıyor galiba"),
    ]),
    hints: [
      l("Birden fazla commit'i tek commit'e katmak `rebase -i` listesinde yapılır.", "Folding several commits into one is done in the `rebase -i` list."),
      l("İlk satır `pick` (ya da mesajı değiştirmek için `reword`) kalsın, sonrakileri `squash` ya da `fixup` yap. Git sonra mesaj için editörü açar.", "Keep the first line as `pick` (or `reword` to change its message) and make the others `squash` or `fixup`. Git then opens the editor for the message."),
      l(
        "`git rebase -i origin/main`, listede 2. ve 3. satırı `squash` yap, kaydet; açılan mesaj editöründe her şeyi silip `Şifre kontrolü` yaz ve kaydet",
        "`git rebase -i origin/main`, make lines 2 and 3 `squash`, save; in the message editor that opens, replace everything with `Şifre kontrolü` and save",
      ),
    ],
    par: 1,
    check: ({ state, start }) => messagesOnTop(state).join("|") === "Şifre kontrolü" && sameCode(state, start),
  },
  {
    id: "ready-for-pr",
    title: l("PR'a hazırla", "Ready for the PR"),
    story: l(
      "Dersin başındaki beş dağınık commit karşında: bir düzeltme, bir debug izi, bir `wip` ve yazım hatalı bir mesaj. Bunları tek seferde, PR'a yakışır hale getir.",
      "The five messy commits from the start of the lesson are back: a fix-up, a debug trace, a `wip` and a misspelled message. Make them fit for a PR in one go.",
    ),
    goal: l(
      "Üstte sadece iki commit kalsın: `Giriş formu` ve `Şifre kontrolü` (doğru yazılmış). `debug.js` gitsin, diğer kod kaybolmasın.",
      "Leave just two commits on top: `Giriş formu` and `Şifre kontrolü` (spelled right). `debug.js` goes; no other code is lost.",
    ),
    start: START,
    hints: [
      l("Hepsi tek bir `rebase -i` listesinde olur: her satıra ayrı bir kelime.", "All of it fits in one `rebase -i` list: a word for each line."),
      l("`fixup` öncekine katar ve onun mesajını tutar, `drop` atar, `reword` mesajı değiştirir.", "`fixup` folds into the previous one and keeps its message, `drop` throws away, `reword` renames."),
      l(
        "`git rebase -i origin/main`; liste: `pick` Giriş formu, `fixup` yazım hatası düzeltildi, `drop` debug log, `reword` wip, `fixup` Şifre kontorlü. Kaydet, mesaj editöründe `Şifre kontrolü` yaz.",
        "`git rebase -i origin/main`; list: `pick` Giriş formu, `fixup` yazım hatası düzeltildi, `drop` debug log, `reword` wip, `fixup` Şifre kontorlü. Save, then type `Şifre kontrolü` in the message editor.",
      ),
    ],
    par: 1,
    check: ({ state }) => {
      const f = headFiles(state);
      return (
        messagesOnTop(state).join("|") === "Giriş formu|Şifre kontrolü" &&
        !("debug.js" in f) &&
        f["login.js"] === "giriş formu (e-posta doğrulamalı)" &&
        f["password.js"] === "şifre kontrolü"
      );
    },
  },
];
