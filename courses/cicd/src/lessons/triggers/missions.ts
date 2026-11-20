import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

/** Feature commits that no push run was started for. */
const quietFeature = (ctx: CiCtx) => ctx.state.commits.filter((c) => c.branch === "feature" && !ctx.state.runs.some((r) => r.sha === c.sha && r.event === "push"));

export const missions: Mission<CiCtx>[] = [
  {
    id: "main-only",
    title: l("Sadece main", "Main only"),
    goal: l(
      "`feature`'a bir push **hiç run başlatmasın**, `main`'e bir push ise başlatsın.",
      "A push to `feature` should **start no run**, while a push to `main` should.",
    ),
    hint: l("`push` olayına bir branch filtresi koy.", "Put a branch filter on the `push` event."),
    par: 3,
    check: (ctx) => quietFeature(ctx).some((c) => !ctx.state.runs.some((r) => r.sha === c.sha)) && ctx.state.runs.some((r) => r.event === "push" && r.branch === "main"),
  },
  {
    id: "pr-only",
    title: l("PR'da kontrol", "Checks on the PR"),
    goal: l(
      "Bir `feature` commit'i push'landığında kendi başına run başlatmasın, ama bir PR açılınca CI o branch için çalışsın.",
      "A `feature` commit should start no run when pushed on its own, but once a PR is opened CI should run for that branch.",
    ),
    hint: l("İki ayar lazım: biri feature push'larını susturur, diğeri PR'ları dinler.", "You need two settings: one quiets feature pushes, the other listens to PRs."),
    par: 4,
    check: (ctx) => quietFeature(ctx).length > 0 && ctx.state.runs.some((r) => r.event === "pull_request"),
  },
  {
    id: "by-hand",
    title: l("Elle başlat", "Start it by hand"),
    goal: l("**Hiç push yapmadan** bir run başlat.", "Start a run **without any push**."),
    hint: l("GitHub'da bir \"Run workflow\" düğmesi var, ama önce workflow'un buna izin vermesi gerek.", "GitHub has a \"Run workflow\" button, but the workflow has to allow it first."),
    par: 2,
    check: (ctx) => ctx.state.commits.length === ctx.start.commits.length && ctx.state.runs.some((r) => r.event === "dispatch"),
  },
];
