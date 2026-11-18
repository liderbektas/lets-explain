import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { resolve, status } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

/** Message of the commit a branch points at, so missions do not depend on the lesson module. */
const messageAt = (ctx: GitCtx, id: string | undefined) => (id ? ctx.state.commits[id]?.message : undefined);

export const missions: Mission<GitCtx>[] = [
  {
    id: "bring-back",
    title: l("Önemli iş", "The important work"),
    goal: l(
      "Yanlışlıkla yapılan `reset --hard` \"Önemli iş\" commit'ini main'den düşürdü. Reflog'a bak ve onu **main'e geri getir**.",
      "An accidental `reset --hard` dropped \"Önemli iş\" from main. Look at the reflog and **bring it back to main**.",
    ),
    hint: l("Reflog'da kırmızı \"kayıp\" etiketli girişlerden hangisi \"Önemli iş\"?", "Which of the red \"lost\" entries in the reflog is \"Önemli iş\"?"),
    par: 1,
    check: (ctx) => messageAt(ctx, ctx.state.branches.main) === "Önemli iş",
  },
  {
    id: "both",
    title: l("İkisini de kurtar", "Rescue both"),
    goal: l(
      "\"Önemli iş\"i main'e geri getir **ve** silinen `deneme` branch'indeki \"Deneme\" commit'ini yeni bir branch'le kurtar.",
      "Bring \"Önemli iş\" back to main **and** rescue the \"Deneme\" commit from the deleted `deneme` branch with a new branch.",
    ),
    hint: l(
      "Commit'i main'e taşımak reset, başka bir yerde tutmak ise yeni bir branch işi.",
      "Moving a commit onto main is a reset; keeping one somewhere else is a new branch.",
    ),
    par: 2,
    check: (ctx) =>
      messageAt(ctx, ctx.state.branches.main) === "Önemli iş" &&
      Object.entries(ctx.state.branches).some(([name, id]) => name !== "main" && messageAt(ctx, id) === "Deneme"),
  },
  {
    id: "round-trip",
    title: l("Git ve geri gel", "There and back"),
    goal: l(
      "main'i `reset --hard HEAD~1` ile bir commit daha geri al. Sonra reflog'u kullanarak main'i **tam olarak başladığı commit'e** geri getir.",
      "Move main back one more commit with `reset --hard HEAD~1`. Then use the reflog to bring main back **to exactly the commit it started on**.",
    ),
    hint: l("Reset'ten hemen önceki yer reflog'da HEAD@{1}.", "The place right before the reset is HEAD@{1} in the reflog."),
    par: 2,
    check: (ctx) => {
      const startMain = ctx.start.branches.main!;
      const wentBack = ctx.events.flat().some((e) => e.type === "reset" && e.from === startMain && e.to === resolve(ctx.start, "HEAD~1"));
      return wentBack && ctx.state.branches.main === startMain && status(ctx.state).clean;
    },
  },
];
