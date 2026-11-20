import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

const minutes = (ctx: CiCtx) => ctx.state.runs.reduce((m, r) => m + r.minutes, 0);
const fresh = (ctx: CiCtx) => ctx.state.commits.slice(ctx.start.commits.length);

export const missions: Mission<CiCtx>[] = [
  {
    id: "only-last",
    title: l("Sadece sonuncusu", "Only the last one"),
    goal: l(
      "Arka arkaya **3 run** başlasın; sonuncusu dışındaki hepsi iptal olsun.",
      "Start **3 runs** in a row; every one except the last is cancelled.",
    ),
    hint: l("Yeni bir run, aynı branch'te hâlâ çalışan eskisini durdurabilir.", "A new run can stop an older one still going on the same branch."),
    par: 4,
    check: (ctx) => {
      const runs = ctx.state.runs;
      return runs.length >= 3 && runs.slice(0, -1).every((r) => r.status === "cancelled") && runs[runs.length - 1]!.status !== "cancelled";
    },
  },
  {
    id: "under-20",
    title: l("20 dakikanın altında", "Under 20 minutes"),
    goal: l(
      "Kodu push'la ve `ci` job'ı geçsin, ama toplam faturalanan süre **20 dakikanın altında** kalsın.",
      "Push code and have the `ci` job pass, while total billed time stays **under 20 minutes**.",
    ),
    hint: l("e2e job'ı takılıyor ve GitHub onu 6 saat bekler.", "The e2e job hangs, and GitHub waits 6 hours for it."),
    par: 2,
    check: (ctx) => ctx.state.runs.some((r) => r.jobs.some((j) => j.id === "ci" && j.status === "success")) && minutes(ctx) < 20,
  },
  {
    id: "typo",
    title: l("Bedava düzeltme", "A free fix"),
    goal: l(
      "Bir README düzeltmesi ve bir kod değişikliği main'e gelsin; **sadece bir** run başlasın.",
      "Get a README fix and a code change onto main with **only one** run started.",
    ),
    hint: l("Commit mesajı da workflow'a bir şey söyleyebilir.", "The commit message can tell the workflow something too."),
    par: 2,
    check: (ctx) => fresh(ctx).some((c) => c.paths.includes("README.md")) && fresh(ctx).some((c) => c.paths.includes("src/cart.ts")) && ctx.state.runs.length === 1,
  },
];
