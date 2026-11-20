import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { checksFor, type CheckState } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

/** For every refused merge in the try-it run: the state of each required check at that moment. */
function blocked(ctx: CiCtx): CheckState[][] {
  const out: CheckState[][] = [];
  ctx.events.forEach((evs, i) => {
    for (const e of evs) if (e.type === "mergeBlocked") out.push(checksFor(ctx.states[i]!, e.pr).filter((c) => c.required).map((c) => c.state));
  });
  return out;
}

export const missions: Mission<CiCtx>[] = [
  {
    id: "guard",
    title: l("Kapıda bekçi", "A guard at the door"),
    goal: l("Kırmızı PR #1'i merge etmeye çalış ve GitHub buna **izin vermesin**, çünkü zorunlu bir check kırık.", "Try to merge the red PR #1 and have GitHub **refuse**, because a required check is failing."),
    hint: l("Şu an main korumasız: Merge her şeyi kabul ediyor.", "Right now main is unprotected: Merge accepts anything."),
    par: 2,
    check: (ctx) => blocked(ctx).some((states) => states.includes("failure")),
  },
  {
    id: "safe-merge",
    title: l("Güvenli merge", "A safe merge"),
    goal: l("main **korumalıyken** PR #1'i merge et ve merge'den sonra main'deki run yeşil olsun.", "Merge PR #1 **while main is protected**, and have the run on main after the merge be green."),
    hint: l("Koruma kırmızı PR'ı durdurur; önce hatayı düzeltmen gerek.", "Protection stops a red PR; you have to fix the bug first."),
    par: 3,
    check: (ctx) =>
      ctx.events.some((evs, i) =>
        evs.some((e) => {
          if (e.type !== "merged" || !ctx.states[i]!.protection?.includes("CI / ci")) return false;
          const after = ctx.states[i + 1]!.runs.find((r) => r.sha === e.sha && r.event === "push");
          return after?.status === "success";
        }),
      ),
  },
  {
    id: "ghost-check",
    title: l("Hiç gelmeyen check", "The check that never comes"),
    goal: l(
      "Merge engellensin ama sebep kırık bir check değil, **hiç çalışmamış** (\"bekleniyor\") zorunlu bir check olsun.",
      "Get the merge blocked, not by a failing check, but by a required check that **never ran** (\"expected\").",
    ),
    hint: l("Zorunlu check'in adı, workflow'daki job'ın adıyla birebir aynı olmalı.", "A required check's name has to match the workflow's job name exactly."),
    par: 2,
    check: (ctx) => blocked(ctx).some((states) => states.includes("expected")),
  },
];
