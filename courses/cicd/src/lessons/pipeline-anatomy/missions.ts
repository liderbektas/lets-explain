import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

const job = (r: CiCtx["state"]["runs"][number], id: string) => r.jobs.find((j) => j.id === id);

export const missions: Mission<CiCtx>[] = [
  {
    id: "skip-build",
    title: l("Boşuna build yok", "No wasted build"),
    goal: l("Bir run'da `test` job'ı kırılsın ve `build` job'ı **hiç çalışmadan atlansın**.", "Get a run where the `test` job fails and the `build` job is **skipped without running**."),
    hint: l("Job'lar varsayılan olarak birbirini beklemez.", "Jobs do not wait for each other by default."),
    par: 2,
    check: (ctx) => ctx.state.runs.some((r) => job(r, "test")?.status === "failure" && job(r, "build")?.status === "skipped"),
  },
  {
    id: "wait-for-both",
    title: l("İkisini de bekle", "Wait for both"),
    goal: l(
      "Yeşil bir run'da `build`, hem `lint`'i **hem** `test`'i beklesin (`needs`) ve ikisi bitince başlasın.",
      "Get a green run in which `build` waits for both `lint` **and** `test` (`needs`) and starts once they are done.",
    ),
    hint: l("`needs` bir liste alabilir.", "`needs` can take a list."),
    par: 3,
    check: (ctx) =>
      ctx.state.runs.some((r) => {
        const b = job(r, "build");
        const a = job(r, "lint");
        const t = job(r, "test");
        return r.status === "success" && Boolean(a && t && b) && b!.needs.includes("lint") && b!.needs.includes("test") && b!.start >= a!.end && b!.start >= t!.end;
      }),
  },
];
