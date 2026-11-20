import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Status } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const merged = (ctx: CiCtx) => ctx.state.prs[0]?.state === "merged";
/** The status of the `test` job in every run of the try-it step. */
const testJobs = (ctx: CiCtx): Status[] => ctx.state.runs.flatMap((r) => r.jobs.filter((j) => j.id === "test").map((j) => j.status));

export const missions: Mission<CiCtx>[] = [
  {
    id: "unblock",
    title: l("Kilidi aç", "Unblock it"),
    goal: l(
      "Sadece dokümanı değiştiren PR #1'i merge et, ama `test` job'ı **hiç çalışmasın** (atlanabilir).",
      "Merge PR #1, which only changes docs, without the `test` job **ever running** (skipping is fine).",
    ),
    hint: l(
      "Zorunlu check'in raporlanması için workflow başlamalı; testi job seviyesinde atlat.",
      "The required check has to be reported, so the workflow must start; skip the test at the job level.",
    ),
    par: 4,
    check: (ctx) => merged(ctx) && testJobs(ctx).every((s) => s === "skipped"),
  },
  {
    id: "both-ways",
    title: l("İki yönde de", "Both ways"),
    goal: l(
      "Merge'den önce PR'da iki run görün: dokümana dokunan bir push'ta `test` **atlansın**, `src/`'ye dokunan bir push'ta `test` **çalışıp geçsin**. Sonra merge et.",
      "Before merging, the PR shows two runs: one push touching docs where `test` is **skipped**, one touching `src/` where `test` **runs and passes**. Then merge.",
    ),
    hint: l("Önce yapıyı düzelt, sonra iki farklı push dene.", "Fix the setup first, then try two different pushes."),
    par: 5,
    check: (ctx) => merged(ctx) && testJobs(ctx).includes("skipped") && testJobs(ctx).includes("success"),
  },
];
