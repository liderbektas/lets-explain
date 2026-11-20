import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Run } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const fresh = (ctx: CiCtx): Run[] => ctx.state.runs.filter((r) => r.id > ctx.start.runs.length);
const fast = (r: Run) => r.end - r.start <= 210;
const legs = (r: Run) => {
  const n20 = r.jobs.find((j) => j.label === "test (20)");
  const n22 = r.jobs.find((j) => j.label === "test (22)");
  return Boolean(n20 && n22 && n20.status === "failure" && n22.status === "success");
};

export const missions: Mission<CiCtx>[] = [
  {
    id: "fast",
    title: l("3,5 dakikanın altı", "Under 3.5 minutes"),
    goal: l("Run'ı baştan sona **3 dakika 30 saniye** ya da daha kısa sürede bitir.", "Get a run that finishes in **3 minutes 30 seconds** or less, start to end."),
    hint: l("Run en yavaş yolu kadar sürer. En uzun adım hangisi?", "A run takes as long as its slowest path. Which step is the longest?"),
    par: 2,
    check: (ctx) => fresh(ctx).some(fast),
  },
  {
    id: "two-nodes",
    title: l("İki Node", "Two Nodes"),
    goal: l(
      "Bir run'da testler hem Node 20 hem Node 22'de çalışsın: `test (20)` kırılsın, `test (22)` geçsin.",
      "Get a run where the tests run on both Node 20 and Node 22: `test (20)` fails and `test (22)` passes.",
    ),
    hint: l("Matrix sadece kendi job'ı olan bir adıma uygulanabilir.", "A matrix can only go on a step that has its own job."),
    par: 3,
    check: (ctx) => fresh(ctx).some(legs),
  },
  {
    id: "fast-and-wide",
    title: l("Hem hızlı hem geniş", "Fast and wide"),
    goal: l("Tek bir run hem 3 dakika 30 saniyenin altında bitsin hem de testleri Node 20 ve 22'de çalıştırsın.", "Get one run that finishes under 3 minutes 30 seconds and also tests on Node 20 and 22."),
    hint: l("Matrix testleri ayırır ama run'ı uzatan şey başka bir adım.", "The matrix splits off the tests, but something else makes the run long."),
    par: 4,
    check: (ctx) => fresh(ctx).some((r) => fast(r) && legs(r)),
  },
];
