import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf, type Run } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const fresh = (ctx: CiCtx): Run[] => ctx.state.runs.filter((r) => r.id > ctx.start.runs.length);
const failedWith = (r: Run, text: string) => r.jobs.some((j) => j.steps.some((s) => s.status === "failure" && s.log.some((x) => x.includes(text))));

export const missions: Mission<CiCtx>[] = [
  {
    id: "green",
    title: l("Yeşile dön", "Back to green"),
    goal: l("Yeşil bir run al.", "Get a green run."),
    hint: l("Önce logdaki hatayı oku: kod mu bozuk, yoksa zamanlama mı?", "Read the error in the log first: is the code broken, or is it timing?"),
    par: 2,
    check: (ctx) => fresh(ctx).some((r) => r.status === "success"),
  },
  {
    id: "clean",
    title: l("Temiz yeşil", "A clean green"),
    goal: l(
      "Yeşil bir run al ve o run'ın commit'inde **hiçbir hata kalmasın**: ne gerçek hata, ne de flaky test.",
      "Get a green run whose commit has **no problems left**: neither the real bug nor the flaky test.",
    ),
    hint: l("Re-run ile geçen bir test düzelmiş değildir; sadece bu sefer şanslıydın.", "A test that passes on a re-run is not fixed; you were just lucky this time."),
    par: 2,
    check: (ctx) => fresh(ctx).some((r) => r.status === "success" && commitOf(ctx.state, r.sha).bugs.length === 0),
  },
  {
    id: "prove",
    title: l("Re-run'ın sınırı", "What a re-run cannot do"),
    goal: l(
      "Gerçek hatalı run'ı yeniden çalıştır ve **yine** aynı hatayla (`AssertionError`) kırıldığını gör. Sonra yeşil bir run al.",
      "Re-run the run with the real bug and watch it fail **again** with the same error (`AssertionError`). Then get a green run.",
    ),
    hint: l("Kod değişmedikçe gerçek bir hata her denemede aynı yerde kırılır.", "Until the code changes, a real bug fails in the same place on every attempt."),
    par: 3,
    check: (ctx) => {
      const runs = fresh(ctx);
      const proof = runs.findIndex((r) => r.attempt > 1 && failedWith(r, "AssertionError"));
      return proof >= 0 && runs.slice(proof + 1).some((r) => r.status === "success");
    },
  },
];
