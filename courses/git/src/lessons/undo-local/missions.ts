import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headId, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

const FIXED = "app.js güncellendi";
const TYPO = "app.js gncellendi";
const NEW_README = "Merhaba, hoş geldin";

const head = (r: Repo) => r.commits[headId(r)!]!;
/** The last commit was replaced in place: same parents as the one we started with. */
const replacedInPlace = (ctx: GitCtx) => JSON.stringify(head(ctx.state).parents) === JSON.stringify(head(ctx.start).parents);

export const missions: Mission<GitCtx>[] = [
  {
    id: "drop-staged",
    title: l("Staging'deki hata", "The staged mistake"),
    goal: l(
      "`app.js`'teki hatalı değişiklik staging'de bekliyor. Onu **tamamen** at: app.js son commit'teki haline dönsün. README.md'deki değişiklik klasörde kalsın, commit atma.",
      "A wrong change to `app.js` is staged. Throw it away **completely**: app.js goes back to the last commit. The README.md change stays in the folder, and no commit.",
    ),
    hint: l(
      "Staging'deki bir değişikliği atmak iki adım: önce staging'den çıkar, sonra klasörden at.",
      "Throwing away a staged change takes two steps: unstage it, then throw it out of the folder.",
    ),
    par: 2,
    check: (ctx) => {
      const s = ctx.state;
      const committed = head(s).files["app.js"];
      return headId(s) === headId(ctx.start) && s.index["app.js"] === committed && s.work["app.js"] === committed && s.work["README.md"] === NEW_README;
    },
  },
  {
    id: "fix-message",
    title: l("Yazım hatası", "The typo"),
    goal: l(
      "Son commit'in mesajını **app.js güncellendi** olarak düzelt. Yeni commit ekleme ve hatalı app.js değişikliği commit'e girmesin.",
      "Fix the last commit's message to **app.js güncellendi**. Do not add a new commit, and keep the wrong app.js change out of it.",
    ),
    hint: l(
      "`--amend` staging'de ne varsa onu da son commit'e katar. Önce staging'i temizle.",
      "`--amend` also folds whatever is staged into the last commit. Clear staging first.",
    ),
    par: 2,
    check: (ctx) => head(ctx.state).message === FIXED && replacedInPlace(ctx) && head(ctx.state).files["app.js"] === "v2",
  },
  {
    id: "forgotten",
    title: l("Unutulan değişiklik", "The forgotten change"),
    goal: l(
      "README.md'deki değişikliği son commit'e koymayı unuttun. Onu son commit'e ekle: mesaj aynı kalsın, yeni commit açma, hatalı app.js de girmesin.",
      "You forgot to put the README.md change into the last commit. Add it there: same message, no new commit, and keep the wrong app.js out.",
    ),
    hint: l(
      "Staging'e sadece README.md kalsın, sonra mesajı değiştirmeden amend et.",
      "Leave only README.md in staging, then amend without changing the message.",
    ),
    par: 3,
    check: (ctx) => {
      const h = head(ctx.state);
      return h.message === TYPO && replacedInPlace(ctx) && h.files["README.md"] === NEW_README && h.files["app.js"] === "v2";
    },
  },
];
