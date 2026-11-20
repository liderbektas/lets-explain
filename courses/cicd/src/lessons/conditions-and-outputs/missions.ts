import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

const commit = (ctx: CiCtx, sha: string | null) => ctx.state.commits.find((c) => c.sha === sha);
/** Commits made in the try-it step. */
const fresh = (ctx: CiCtx) => ctx.state.commits.slice(ctx.start.commits.length);
const notified = (ctx: CiCtx) => ctx.state.runs.filter((r) => r.jobs.some((j) => j.id === "notify" && j.status === "success"));

export const missions: Mission<CiCtx>[] = [
  {
    id: "feature-safe",
    title: l("Staging sadece main'den", "Staging only from main"),
    goal: l(
      "Bir `feature` push'u staging'e **deploy etmesin**, ardından main'e gelen yeşil bir push staging'e çıksın.",
      "A push to `feature` must **not** deploy to staging, and then a green push to main goes to staging.",
    ),
    hint: l("deploy job'ına hangi branch'te çalışacağını söyle.", "Tell the deploy job which branch it runs on."),
    par: 3,
    check: (ctx) => {
      const deployed = ctx.state.envs.staging?.history ?? [];
      const pushedFeature = fresh(ctx).some((c) => c.branch === "feature");
      const env = commit(ctx, ctx.state.envs.staging?.sha ?? null);
      return pushedFeature && !deployed.some((sha) => commit(ctx, sha)?.branch === "feature") && Boolean(env && env.branch === "main" && fresh(ctx).includes(env));
    },
  },
  {
    id: "hear-failure",
    title: l("Kırılınca haber ver", "Speak up when it breaks"),
    goal: l(
      "main kırılınca `notify` job'ı sohbete mesaj atsın; yeşil bir run'da ise **atmasın**.",
      "When main breaks, the `notify` job posts to chat; on a green run it must **not** post.",
    ),
    hint: l("Bir job'ın varsayılan koşulu `success()`: ihtiyaç duyduğu job'lar kırılınca atlanır.", "A job's default condition is `success()`: it is skipped when a job it needs fails."),
    par: 2,
    check: (ctx) => {
      const runs = notified(ctx);
      return runs.length > 0 && runs.every((r) => r.status === "failure");
    },
  },
  {
    id: "soft-lint",
    title: l("Lint durdurmasın", "Lint does not stop it"),
    goal: l("İçinde lint hatası olan bir commit staging'e çıksın.", "Get a commit that has a lint error onto staging."),
    hint: l("Bir adımın kırılması job'ı durdurmasın istiyorsan...", "If a step's failure should not stop the job..."),
    par: 2,
    check: (ctx) => Boolean(commit(ctx, ctx.state.envs.staging?.sha ?? null)?.bugs.includes("lint")),
  },
];
