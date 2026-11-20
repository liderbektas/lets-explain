import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

/** Runs started in the try-it step. */
const fresh = (ctx: CiCtx) => ctx.state.runs.slice(ctx.start.runs.length);
const published = (ctx: CiCtx) => fresh(ctx).some((r) => !r.fork && r.jobs.some((j) => j.steps.some((s) => s.kind === "publish" && s.status === "success")));

export const missions: Mission<CiCtx>[] = [
  {
    id: "release",
    title: l("Yayınla", "Publish it"),
    goal: l("main'e bir push paketi npm'e yayınlasın (`npm publish` geçsin).", "Have a push to main publish the package to npm (`npm publish` passes)."),
    hint: l("Token'ı dosyaya değil, repo ayarlarına koy.", "Put the token in the repo settings, not in the file."),
    par: 2,
    check: published,
  },
  {
    id: "fork-green",
    title: l("Fork'a da yeşil", "Green for the fork too"),
    goal: l(
      "Fork'tan gelen PR'ın yeni bir run'ı **yeşil** olsun (`publish` atlanabilir), main'e bir push da paketi yayınlasın.",
      "Get a new **green** run on the fork's PR (`publish` may be skipped), and have a push to main publish the package.",
    ),
    hint: l("Fork'un run'ında secret yok; yayınlamayı sadece push olayına bırak.", "A fork's run has no secrets; leave publishing to push events only."),
    par: 4,
    check: (ctx) => published(ctx) && fresh(ctx).some((r) => r.fork && r.status === "success"),
  },
];
