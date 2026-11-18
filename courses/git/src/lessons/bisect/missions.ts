import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { currentBranch, resolve } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

/** The commit that broke the date format in the try-it history (fixed by its shape, see Scene). */
const culprit = (ctx: GitCtx) => resolve(ctx.start, "HEAD~5");

const foundCulprit = (ctx: GitCtx) => ctx.events.flat().some((e) => e.type === "bisectFound" && e.id === culprit(ctx));

export const missions: Mission<GitCtx>[] = [
  {
    id: "find",
    title: l("Suçluyu bul", "Find the culprit"),
    goal: l(
      "Tarih biçimi bozulmuş: `format.js` artık `GG.AA` yazmıyor. `v1.0`'da çalışıyordu. Bisect ile **hatayı getiren ilk commit'i** bul. Her adımda üstteki Test sayacına bak.",
      "The date format broke: `format.js` no longer says `GG.AA`. It worked in `v1.0`. Use bisect to find **the first commit that broke it**. Check the Test counter at the top each time.",
    ),
    hint: l("Test geçiyorsa `good`, kalıyorsa `bad` de. Git her seferinde kalan aralığı yarıya böler.", "Say `good` when the test passes and `bad` when it fails. Git halves what is left each time."),
    par: 4,
    check: foundCulprit,
  },
  {
    id: "find-and-return",
    title: l("Bul ve dön", "Find it and go back"),
    goal: l(
      "Suçlu commit'i bul, sonra bisect'i bitir: HEAD tekrar **main** branch'inde olsun.",
      "Find the culprit commit, then finish bisect: HEAD should be back on the **main** branch.",
    ),
    hint: l("Bisect seni geçmişte bir commit'e götürür; geri dönmek için `bisect reset`.", "Bisect takes you to a commit in the past; `bisect reset` brings you back."),
    par: 5,
    check: (ctx) => foundCulprit(ctx) && !ctx.state.bisect && currentBranch(ctx.state) === "main",
  },
  {
    id: "fix",
    title: l("Düzelt", "Fix it"),
    goal: l(
      "Suçluyu bul, main'e dön ve o commit'i **revert** et. Sonunda main'deki `format.js` yine `GG.AA` yazsın; sonraki commit'ler yerinde kalsın.",
      "Find the culprit, go back to main and **revert** that commit. In the end, `format.js` on main says `GG.AA` again, and the later commits stay.",
    ),
    hint: l("Revert, sadece o commit'in değişikliğini tersine çeviren yeni bir commit ekler.", "Revert adds a new commit that undoes just that one commit's change."),
    par: 6,
    check: (ctx) =>
      currentBranch(ctx.state) === "main" &&
      (ctx.state.work["format.js"] ?? "").includes("GG.AA") &&
      ctx.events.flat().some((e) => e.type === "reverted" && e.target === culprit(ctx)) &&
      (ctx.state.work["api.js"] ?? "") === ctx.start.work["api.js"],
  },
];
