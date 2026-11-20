import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, resolve, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const save = (path: string, content: string, message: string): GitAction[] => [write(path, content), { type: "add", paths: [path] }, { type: "commit", message }];
const build = (actions: GitAction[]) => repoAfter(actions, createRepo({ author: ADA }));

/** A check the reader runs at each commit: does this file still say this? */
export interface BugTest {
  path: string;
  good: string;
}

/** Does the checked-out code pass the test? */
export const passes = (repo: Repo, test: BugTest) => (repo.work[test.path] ?? "").includes(test.good);

/** The date format broke in one of these commits; v1.0 was fine. */
export const DATES = build([
  ...save("format.js", "tarih: GG.AA.YYYY", "Tarih biçimi"),
  { type: "tag", name: "v1.0" },
  ...save("api.js", "istek", "API"),
  ...save("format.js", "tarih: AA/GG/YYYY", "format düzeni"),
  ...save("README.md", "Takvim", "README"),
  ...save("api.js", "istek v2", "API v2"),
  ...save("logo.svg", "logo", "Logo"),
  ...save("README.md", "Takvim v2", "README v2"),
  ...save("api.js", "istek v3", "Önbellek"),
]);
export const DATES_TEST: BugTest = { path: "format.js", good: "GG.AA" };

/** The cart adds price and quantity instead of multiplying. No tag: the good commit is "Sürüm 2.0". */
export const PRICES = build([
  ...save("cart.js", "toplam = fiyat * adet", "Sepet"),
  ...save("version.txt", "2.0", "Sürüm 2.0"),
  ...save("images.js", "ürün resimleri", "Ürün resimleri"),
  ...save("shipping.js", "kargo ücreti", "Kargo ücreti"),
  ...save("cart.js", "toplam = fiyat + adet", "Sepet sadeleşti"),
  ...save("banner.js", "kampanya", "Kampanya bandı"),
  ...save("search.js", "arama", "Arama"),
  ...save("search.js", "arama v2", "Arama v2"),
  ...save("style.css", "yazı tipleri", "Yazı tipleri"),
]);
export const PRICES_TEST: BugTest = { path: "cart.js", good: "fiyat * adet" };

/** Someone switched the password check off "to speed up the tests". v2.1 was fine. */
export const LOGIN = build([
  ...save("auth.js", "şifre kontrolü: açık", "Giriş"),
  { type: "tag", name: "v2.1" },
  ...save("profile.js", "profil", "Profil"),
  ...save("auth.js", "şifre kontrolü: kapalı", "Testleri hızlandır"),
  ...save("profile.js", "profil + fotoğraf", "Profil fotoğrafı"),
  ...save("notify.js", "bildirimler", "Bildirimler"),
  ...save("README.md", "Giriş servisi", "README"),
]);
export const LOGIN_TEST: BugTest = { path: "auth.js", good: "açık" };

/** Thumbnails came out ten times too big. A teammate started bisect and marked one commit. */
export const IMAGES = build([
  ...save("thumbs.js", "küçük resim: 200px", "Küçük resimler"),
  { type: "tag", name: "v3.0" },
  ...save("upload.js", "yükleme", "Yükleme"),
  ...save("upload.js", "yükleme + ilerleme", "Yükleme çubuğu"),
  ...save("gallery.js", "galeri", "Galeri"),
  ...save("thumbs.js", "küçük resim: 2000px", "Retina desteği"),
  ...save("gallery.js", "galeri + kaydırma", "Galeri kaydırma"),
  ...save("README.md", "Fotoğraflar", "README"),
  ...save("share.js", "paylaş", "Paylaşma"),
]);
export const IMAGES_TEST: BugTest = { path: "thumbs.js", good: "200px" };

/** The teammate's half-finished bisect: started between HEAD and v3.0, first commit marked honestly. */
const IMAGES_MIDWAY = (() => {
  const started = repoAfter([{ type: "bisectStart", bad: "HEAD", good: "v3.0" }], IMAGES);
  return repoAfter([{ type: "bisectMark", verdict: passes(started, IMAGES_TEST) ? "good" : "bad" }], started);
})();

/** Every history in the try-it step with the test that goes with it, so the scene can show the right one. */
export const HISTORIES: { repo: Repo; test: BugTest }[] = [
  { repo: DATES, test: DATES_TEST },
  { repo: PRICES, test: PRICES_TEST },
  { repo: LOGIN, test: LOGIN_TEST },
  { repo: IMAGES, test: IMAGES_TEST },
];

export const DATES_CULPRIT = resolve(DATES, "HEAD~5")!;
export const PRICES_CULPRIT = resolve(PRICES, "HEAD~4")!;
export const LOGIN_CULPRIT = resolve(LOGIN, "HEAD~3")!;
export const IMAGES_CULPRIT = resolve(IMAGES, "HEAD~3")!;

const found = (ctx: GitCtx, culprit: string) => ctx.events.flat().some((e) => e.type === "bisectFound" && e.id === culprit);
const backOnMain = (ctx: GitCtx) => !ctx.state.bisect && currentBranch(ctx.state) === "main";

export const scenarios: GitScenario[] = [
  {
    id: "dates",
    title: l("Bozuk tarih", "Broken dates"),
    story: l(
      "Bir kullanıcı yazdı: takvimde tarihler `GG.AA.YYYY` yerine `AA/GG/YYYY` çıkıyor. `v1.0`'da doğruydu, o günden beri yedi commit atıldı. Hangisinin bozduğunu kimse hatırlamıyor.",
      "A user wrote in: the calendar shows dates as `AA/GG/YYYY` instead of `GG.AA.YYYY`. It was right in `v1.0`, and seven commits have landed since. Nobody remembers which one broke it.",
    ),
    goal: l("Bisect, tarihi bozan **ilk** commit'i bulsun.", "Bisect finds the **first** commit that broke the date."),
    start: DATES,
    hints: [
      l("Bozuk olan şu an (`HEAD`), sağlam olan `v1.0`. Bisect'e bu iki ucu ver, gerisini o yarıya bölerek ilerletir.", "The broken end is now (`HEAD`), the good end is `v1.0`. Give bisect both ends; it moves on by halving."),
      l("Her durakta `cat format.js` ile ya da üstteki Test sayacıyla bak: `GG.AA` görüyorsan `git bisect good`, görmüyorsan `git bisect bad`.", "At each stop, check with `cat format.js` or the Test counter at the top: if you see `GG.AA`, `git bisect good`; if not, `git bisect bad`."),
      l("`git bisect start HEAD v1.0`, sonra her durakta teste göre `git bisect good` ya da `git bisect bad`", "`git bisect start HEAD v1.0`, then at every stop `git bisect good` or `git bisect bad`, as the test says"),
    ],
    par: 4,
    check: (ctx) => found(ctx, DATES_CULPRIT),
  },
  {
    id: "no-tag",
    title: l("Tag'siz", "No tag"),
    story: l(
      "Sepette toplam fiyat saçma çıkıyor: fiyatla adet çarpılmak yerine toplanıyor. Geçen haftaki `Sürüm 2.0` commit'inde doğruydu ama oraya tag konmamış. Suçluyu bulduktan sonra branch'ine geri dön: öğleden sonra düzeltmeyi yazacaksın.",
      "The cart total is nonsense: price and quantity get added instead of multiplied. It was right in last week's `Sürüm 2.0` commit, but nobody tagged it. Once you've found the culprit, get back to your branch: you'll write the fix this afternoon.",
    ),
    goal: l("Bisect hatayı getiren commit'i bulsun, sonra HEAD yine **main**'de olsun.", "Bisect finds the commit that brought the bug, then HEAD is back on **main**."),
    start: PRICES,
    hints: [
      l("Tag yoksa sağlam ucu commit id'siyle verirsin. `git log --oneline` ile `Sürüm 2.0`'ın id'sini bul.", "With no tag, give the good end as a commit id. Find the id of `Sürüm 2.0` with `git log --oneline`."),
      l("Her durakta `cat cart.js`: `fiyat * adet` ise good. Bitince bisect seni geçmişte bırakır; `git bisect reset` geri getirir.", "At each stop, `cat cart.js`: `fiyat * adet` means good. When it's done, bisect leaves you in the past; `git bisect reset` brings you back."),
      l(
        "`git log --oneline`, `git bisect start HEAD <Sürüm 2.0'ın id'si>`, teste göre `good`/`bad`, en sonda `git bisect reset`",
        "`git log --oneline`, `git bisect start HEAD <id of Sürüm 2.0>`, `good`/`bad` as the test says, then `git bisect reset`",
      ),
    ],
    par: 5,
    check: (ctx) => found(ctx, PRICES_CULPRIT) && backOnMain(ctx),
  },
  {
    id: "find-and-revert",
    title: l("Bul ve geri al", "Find it and revert"),
    story: l(
      "Güvenlik ekibi alarmda: giriş servisi şifre sormadan kullanıcı alıyor. `v2.1`'de şifre kontrolü açıktı. Hatayı getiren commit'i bul ve canlıya çıkmadan **sadece onu** geri al; sonraki işler yerinde kalsın.",
      "The security team is alarmed: the login service lets users in without a password. In `v2.1` the check was on. Find the commit that brought it and undo **just that one** before it ships; the later work stays.",
    ),
    goal: l(
      "main'de `auth.js` yine `şifre kontrolü: açık` desin, suçlu commit revert edilmiş olsun, sonraki commit'lerin değişiklikleri dursun.",
      "On main, `auth.js` says `şifre kontrolü: açık` again, the culprit is reverted, and the later commits' changes stay.",
    ),
    start: LOGIN,
    hints: [
      l("Önce suçluyu bisect ile bul, sonra main'e dön. Geçmişi silmek yerine tersine çeviren yeni bir commit ekle.", "Find the culprit with bisect first, then go back to main. Instead of erasing history, add a commit that undoes it."),
      l("`git bisect reset` main'e döndürür; `git revert <id>` o commit'in değişikliğini tersine çeviren yeni bir commit atar.", "`git bisect reset` takes you back to main; `git revert <id>` makes a new commit that undoes that commit's change."),
      l(
        "`git bisect start HEAD v2.1`, teste göre `good`/`bad`, `git bisect reset`, sonra `git revert <bulunan id>`",
        "`git bisect start HEAD v2.1`, `good`/`bad` as the test says, `git bisect reset`, then `git revert <found id>`",
      ),
    ],
    par: 6,
    check: (ctx) =>
      currentBranch(ctx.state) === "main" &&
      !ctx.state.bisect &&
      (ctx.state.work["auth.js"] ?? "").includes("açık") &&
      ctx.events.flat().some((e) => e.type === "reverted" && e.target === LOGIN_CULPRIT) &&
      ctx.state.work["profile.js"] === "profil + fotoğraf" &&
      ctx.state.work["notify.js"] === "bildirimler",
  },
  {
    id: "take-over",
    title: l("Devral", "Take over"),
    story: l(
      "Takım arkadaşın küçük resimlerin neden on kat büyük çıktığını bisect ile arıyordu; bir commit'i işaretleyip acil bir toplantıya girdi. Bisect hâlâ açık. Kaldığı yerden devam et ve iş bitince projeyi main'e geri bırak.",
      "Your teammate was bisecting why thumbnails came out ten times too big; they marked one commit and got pulled into an urgent meeting. The bisect is still running. Pick it up where they left off, and leave the project back on main when you're done.",
    ),
    goal: l("Bisect hatayı getiren commit'i bulsun, sonra HEAD yine **main**'de olsun.", "Bisect finds the commit that brought the bug, then HEAD is back on **main**."),
    start: IMAGES_MIDWAY,
    hints: [
      l("Ne durumda olduğunu anlamak için `git status` ya da `git log --oneline` yaz; istem satırı da `BISECTING` diyor.", "To see where things stand, type `git status` or `git log --oneline`; the prompt says `BISECTING` too."),
      l("Baştan başlamana gerek yok: her durakta `cat thumbs.js`, `200px` ise good. Sonunda `git bisect reset`.", "No need to start over: at each stop `cat thumbs.js`, `200px` means good. At the end, `git bisect reset`."),
      l("teste göre `git bisect good` ya da `git bisect bad`, en sonda `git bisect reset`", "`git bisect good` or `git bisect bad` as the test says, then `git bisect reset`"),
    ],
    par: 3,
    check: (ctx) => found(ctx, IMAGES_CULPRIT) && backOnMain(ctx),
  },
];
