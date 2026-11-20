import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Run } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

/** Runs started during the try-it step (the sandbox already has one red run). */
const fresh = (ctx: CiCtx): Run[] => ctx.state.runs.filter((r) => r.id > ctx.start.runs.length);
const kindsRan = (r: Run) => r.jobs[0]?.steps.filter((s) => s.status === "success").map((s) => s.kind) ?? [];

export const missions: Mission<CiCtx>[] = [
  {
    id: "fast-lint",
    title: l("Kötü haber çabuk gelsin", "Bad news, fast"),
    goal: l(
      "Lint hatası bir run'da **70 saniye içinde** yakalansın: run, lint adımında kırılsın.",
      "Have a run catch the lint error **within 70 seconds**: the run breaks on the lint step.",
    ),
    hint: l("Şu an lint en sonda, testlerin ve build'in arkasında bekliyor.", "Right now lint waits at the very end, behind the tests and the build."),
    par: 2,
    check: (ctx) => fresh(ctx).some((r) => r.status === "failure" && r.jobs[0]?.steps.find((s) => s.status === "failure")?.kind === "lint" && r.end - r.start <= 70),
  },
  {
    id: "right-order",
    title: l("Doğru sırayla yeşil", "Green, in the right order"),
    goal: l(
      "Yeşil bir run al. O run'da `lint` ve `typecheck`, `npm test`'ten **önce** çalışmış olsun.",
      "Get a green run in which `lint` and `typecheck` both ran **before** `npm test`.",
    ),
    hint: l("İki hatayı da düzeltmen gerek, ama önce ucuz kontrolleri öne al.", "You need to fix both errors, but move the cheap checks to the front first."),
    par: 4,
    check: (ctx) =>
      fresh(ctx).some((r) => {
        if (r.status !== "success") return false;
        const k = kindsRan(r);
        const t = k.indexOf("test");
        return t >= 0 && k.indexOf("lint") >= 0 && k.indexOf("lint") < t && k.indexOf("typecheck") >= 0 && k.indexOf("typecheck") < t;
      }),
  },
];
