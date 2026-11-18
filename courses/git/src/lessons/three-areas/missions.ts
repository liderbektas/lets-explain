import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { status } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn, newCommits } from "../shared/missionHelpers";

export const missions: Mission<GitCtx>[] = [
  {
    id: "only-app",
    title: l("Sadece app.js", "Only app.js"),
    goal: l(
      "`README.md` ve `app.js`'i değiştir, ama commit'e **sadece app.js** girsin. README'deki değişiklik klasörde beklemeye devam etsin.",
      "Change both `README.md` and `app.js`, but only **app.js** goes into the commit. The README change stays waiting in the folder.",
    ),
    hint: l("Commit, klasördekini değil staging'dekini kaydeder.", "A commit saves what is staged, not what is in the folder."),
    par: 4,
    check: (ctx) => {
      const onlyApp = newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.length === 1 && files[0] === "app.js";
      });
      return onlyApp && status(ctx.state).unstaged.some((c) => c.path === "README.md");
    },
  },
  {
    id: "change-mind",
    title: l("Fikrimi değiştirdim", "Changed my mind"),
    goal: l(
      "`app.js`'i değiştir ve staging'e koy. Sonra vazgeç: **hiç commit atmadan** her şeyi ilk haline döndür.",
      "Change `app.js` and stage it. Then change your mind: put everything back **without a single commit**.",
    ),
    hint: l(
      "Geri dönüş de iki adım: önce staging'den çıkar, sonra klasördeki değişikliği at.",
      "Going back is two steps as well: unstage first, then throw away the change in the folder.",
    ),
    par: 4,
    check: (ctx) =>
      newCommits(ctx).length === 0 &&
      ctx.events.flat().some((e) => e.type === "staged" && e.paths.includes("app.js")) &&
      status(ctx.state).clean &&
      ctx.state.work["app.js"] === ctx.start.work["app.js"],
  },
  {
    id: "together",
    title: l("Aynı commit'te", "In one commit"),
    goal: l(
      "`notes.txt` dosyasını oluştur ve README.md'deki bir değişiklikle **aynı commit'te** kaydet.",
      "Create `notes.txt` and save it in **the same commit** as a change to README.md.",
    ),
    hint: l("İkisini de staging'e koyduktan sonra commit at.", "Stage both, then commit."),
    par: 4,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.includes("notes.txt") && files.includes("README.md");
      }),
  },
];
