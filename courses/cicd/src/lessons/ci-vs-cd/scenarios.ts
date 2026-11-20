import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, headOf, latestRun, type Bug, type CiAction, type JobDef, type Run, type Workflow, type World } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";
import { BUILD_JOB, fresh, PIPELINE, STAGING_JOB } from "./model";

const after = (w: World, ...actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);
const push = (message: string, add: Bug[] = []): CiAction => ({ type: "push", message, add });

/** The production job as the lesson writes it, with a few things changed. */
const prodJob = (patch: Partial<JobDef>): JobDef => ({ ...PIPELINE.jobs[2]!, ...patch });
const pipeline = (prod: JobDef | null): Workflow => ({ ...PIPELINE, jobs: [BUILD_JOB, STAGING_JOB, ...(prod ? [prod] : [])] });

/** Production's job never names its environment, so the approval rule never applies. */
export const UNGUARDED = pipeline(prodJob({ environment: undefined }));
/** Production waits for the build only: it deploys side by side with staging. */
export const SIDE_BY_SIDE = pipeline(prodJob({ needs: ["build"] }));
/** Build and staging, nothing for production yet. */
export const NO_PROD = pipeline(null);

/** Runs started during the scenario. */
const newRuns = (ctx: DeskCtx) => ctx.state.world.runs.filter((r) => !ctx.start.world.runs.some((x) => x.id === r.id));
const prodMoved = (ctx: DeskCtx) => {
  const sha = ctx.state.world.envs.production?.sha;
  return Boolean(sha) && sha !== ctx.start.world.envs.production?.sha && sha === ctx.state.world.heads.main;
};
/** No environment got a commit with a bug in it during the scenario. */
const envsClean = (ctx: DeskCtx) =>
  Object.entries(ctx.state.world.envs).every(([name, e]) => e.history.slice(ctx.start.world.envs[name]?.history.length ?? 0).every((sha) => commitOf(ctx.state.world, sha).bugs.length === 0));
/** The job in the workflow on GitHub that deploys to an environment. */
const deployJob = (wf: Workflow | undefined, env: string) => wf?.jobs.find((j) => j.steps.some((s) => s.kind === "deploy" && (s.with?.env ?? "staging") === env));
const jobRun = (r: Run, def: JobDef | undefined) => (def ? r.jobs.find((j) => j.id === def.id) : undefined);

export const scenarios: CiScenario[] = [
  {
    id: "needs-a-reviewer",
    title: l("Onaysız geçti", "It slipped through"),
    story: l(
      "Ekip production için \"bir kişi onaylamadan deploy yok\" kuralı koydu ve kural ortam ayarlarında açık. Ama son push hiç beklemeden production'a çıktı: production job'ı ortamın adını hiç anmıyor, kural da hiç devreye girmiyor.",
      "The team set a rule for production: \"no deploy until a person approves it\", and the rule is on in the environment's settings. Yet the last push went straight to production without waiting: the production job never names the environment, so the rule never applies.",
    ),
    goal: l("Bir sonraki push'ta production deploy'u bir onay **beklesin**; production eski commit'te kalsın.", "On the next push, the production deploy **waits** for an approval; production stays on its old commit."),
    start: deskOf(after(fresh([UNGUARDED], true), push("wishlist: share button"))),
    hints: [
      l("Onay kuralı bir **ortama** bağlı. Bir job o kurala ancak hangi ortama deploy ettiğini söylerse takılır.", "The approval rule belongs to an **environment**. A job only hits the rule if it says which environment it deploys to."),
      l("Production job'ına `environment: production` ekle.", "Add `environment: production` to the production job."),
      l("`nano .github/workflows/pipeline.yml` → `production:` altına `    environment: production` → `git commit -am \"Gate production\"` → `git push`", "`nano .github/workflows/pipeline.yml` → under `production:` add `    environment: production` → `git commit -am \"Gate production\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const prod = deployJob(liveWorkflow(ctx.state, "Pipeline"), "production");
      const waiting = newRuns(ctx).some((r) => r.jobs.some((j) => j.status === "waiting" && j.environment === "production"));
      return prod?.environment === "production" && waiting && ctx.state.world.envs.production?.sha === ctx.start.world.envs.production?.sha;
    },
  },
  {
    id: "continuous-deployment",
    title: l("Sonuna kadar otomatik", "Automatic all the way"),
    story: l(
      "Pipeline her yeşil commit'i staging'e götürüyor, production'a ise biri elle kopyalıyor. Testlerine güvenen ekip artık continuous deployment istiyor: staging'de sorunsuz çalışan her commit production'a da **kendiliğinden** gitsin.",
      "The pipeline takes every green commit to staging, and someone copies it to production by hand. The team trusts its tests and now wants continuous deployment: every commit that works on staging goes to production **by itself** too.",
    ),
    goal: l("Production, staging'den sonra ve kimse onaylamadan yeni commit'i çalıştırsın.", "Production runs the new commit, after staging and with nobody approving."),
    start: deskOf(after(fresh([NO_PROD]), push("faster product page"))),
    hints: [
      l("Production için yeni bir job gerek: build'in bıraktığı `dist/`'i alıp production'a deploy eden.", "Production needs a new job: one that takes the `dist/` the build left and deploys it to production."),
      l("Staging job'ını örnek al: `actions/download-artifact` ve `./deploy.sh production`; staging bitince başlasın diye `needs: [build, staging]`.", "Copy the staging job: `actions/download-artifact` and `./deploy.sh production`; `needs: [build, staging]` so it starts after staging."),
      l(
        "`nano .github/workflows/pipeline.yml` → en alta `production:` job'ı: `needs: [build, staging]`, `runs-on: ubuntu-latest`, adımlar `- uses: actions/download-artifact@v4` (`name: dist`, `path: dist/`) ve `- run: ./deploy.sh production` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy to production\"` → `git push`",
        "`nano .github/workflows/pipeline.yml` → at the bottom a `production:` job: `needs: [build, staging]`, `runs-on: ubuntu-latest`, steps `- uses: actions/download-artifact@v4` (`name: dist`, `path: dist/`) and `- run: ./deploy.sh production` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy to production\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state, "Pipeline");
      const prod = deployJob(wf, "production");
      const staging = deployJob(wf, "staging");
      const approved = ctx.events.flat().some((e) => e.type === "approved");
      return prodMoved(ctx) && !approved && Boolean(prod && staging && (prod.needs ?? []).includes(staging.id));
    },
  },
  {
    id: "gate-holds",
    title: l("Kapı tuttu", "The gate held"),
    story: l(
      "Bir commit kargo kurallarını değiştirdi ve testleri kırdı. Pipeline build'de durdu: staging de production da eski sürümde. Kodu düzelt; düzeltme pipeline'dan geçip production'a kadar gitsin.",
      "A commit changed the shipping rules and broke the tests. The pipeline stopped at the build: staging and production are both on the old version. Fix the code; the fix should pass the pipeline and go all the way to production.",
    ),
    goal: l("Production düzeltilmiş commit'i çalıştırsın; hatalı commit hiçbir ortama gitmesin.", "Production runs the fixed commit; the broken one reaches no environment."),
    start: deskOf(after(fresh([PIPELINE]), push("new shipping rules", ["test"]))),
    hints: [
      l("`gh run view --log-failed`: hangi test, hangi değer? Pipeline'da değişecek bir şey yok.", "`gh run view --log-failed`: which test, which value? Nothing in the pipeline needs to change."),
      l("Test 120 bekliyor, 118 geliyor: `src/cart.ts`'teki oran.", "The test expects 120 and gets 118: the rate in `src/cart.ts`."),
      l("`nano src/cart.ts` → `1.18`'i `1.2` yap → `git commit -am \"Fix shipping rules\"` → `git push`", "`nano src/cart.ts` → change `1.18` to `1.2` → `git commit -am \"Fix shipping rules\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => prodMoved(ctx) && headOf(ctx.state.world).bugs.length === 0 && envsClean(ctx),
  },
  {
    id: "staging-first",
    title: l("Önce staging", "Staging first"),
    story: l(
      "Production job'ı sadece build'i bekliyor, yani staging ile aynı anda deploy ediliyor. Geçen hafta staging'de deploy kırıldığında production çoktan güncellenmişti. Ekip, production'ın staging bitmeden başlamamasını istiyor.",
      "The production job waits only for the build, so it deploys side by side with staging. Last week, when the staging deploy broke, production had already been updated. The team wants production not to start until staging is done.",
    ),
    goal: l("Production job'ı staging'i beklesin ve yeni bir push'ta production staging'den **sonra** deploy edilsin.", "The production job waits for staging, and on a new push production deploys **after** staging."),
    start: deskOf(after(fresh([SIDE_BY_SIDE]), push("faster product page"))),
    hints: [
      l("`gh run view`: staging ve production job'ları aynı anda başlıyor.", "`gh run view`: the staging and production jobs start at the same time."),
      l("Bir job'ı bekletmek `needs` ile olur; liste birden çok job alabilir.", "Making a job wait is `needs`; the list can hold more than one job."),
      l("`nano .github/workflows/pipeline.yml` → production'ın `needs: build` satırını `needs: [build, staging]` yap → `git commit -am \"Production after staging\"` → `git push`", "`nano .github/workflows/pipeline.yml` → change production's `needs: build` to `needs: [build, staging]` → `git commit -am \"Production after staging\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state, "Pipeline");
      const prod = deployJob(wf, "production");
      const staging = deployJob(wf, "staging");
      if (!prod || !staging || !(prod.needs ?? []).includes(staging.id)) return false;
      const r = latestRun(ctx.state.world);
      const p = r && newRuns(ctx).includes(r) ? jobRun(r, prod) : undefined;
      const s = r ? jobRun(r, staging) : undefined;
      return Boolean(p && s && p.status === "success" && p.start >= s.end) && prodMoved(ctx);
    },
  },
];
