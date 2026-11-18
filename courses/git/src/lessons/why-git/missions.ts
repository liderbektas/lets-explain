import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { currentBranch, headId } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn, newCommits } from "../shared/missionHelpers";

export const missions: Mission<GitCtx>[] = [
  {
    id: "first-save",
    title: l("Yeni sürüm", "A new version"),
    goal: l("`rapor.md`'yi değiştir ve bunu **yeni bir sürüm** olarak kaydet.", "Change `rapor.md` and save it as **a new version**."),
    hint: l("Kaydetmek iki adım: önce staging'e koy, sonra commit at.", "Saving is two steps: stage it, then commit."),
    par: 3,
    check: (ctx) => currentBranch(ctx.state) === "main" && newCommits(ctx).some((c) => changedIn(ctx.state, c).includes("rapor.md")),
  },
  {
    id: "together",
    title: l("İkisi bir arada", "Both at once"),
    goal: l(
      "`notes.md` dosyasını oluştur ve rapor.md'deki bir değişiklikle **aynı sürümde** kaydet.",
      "Create `notes.md` and save it in **the same version** as a change to rapor.md.",
    ),
    hint: l("`add .` klasördeki bütün değişiklikleri birden staging'e koyar.", "`add .` stages every change in the folder at once."),
    par: 4,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.includes("notes.md") && files.includes("rapor.md");
      }),
  },
  {
    id: "time-travel",
    title: l("Zaman yolculuğu", "Time travel"),
    goal: l(
      "Yeni bir sürüm kaydet, sonra **bir önceki sürüme bak** ve tekrar **main'e dön**. Hiçbir sürüm kaybolmasın.",
      "Save a new version, then **look at the previous one** and come **back to main**. No version may be lost.",
    ),
    hint: l("Geçmişe bakmak, sonraki commit'leri silmez.", "Looking at the past does not delete the later commits."),
    par: 5,
    check: (ctx) => {
      const made = newCommits(ctx);
      if (!made.length || currentBranch(ctx.state) !== "main") return false;
      if (!made.includes(headId(ctx.state)!)) return false;
      const startHead = headId(ctx.start)!;
      return ctx.states.some((s) => s.head.kind === "detached" && s.head.id === startHead);
    },
  },
];
