import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, headOf, latestRun, SHAS, type CiAction, type Workflow, type World } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { BUILD, LINT, PREP, TEST, step } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { liveWorkflow, wouldStart, type CiScenario, type DeskCtx } from "../shared/ci";
import { CI, fresh } from "./model";

const after = (w: World, ...actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);

/** A desk with a file that exists only in the folder: never added, never committed. */
const withLocalFile = (d: Desk, path: string, text: string): Desk => ({ ...d, files: { ...d.files, [path]: text } });

/** The deploy job builds on its own and never waits for the tests: a red commit still ships. */
export const RACE: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [
    { id: "ci", steps: [...PREP, LINT, TEST, BUILD] },
    { id: "deploy", steps: [...PREP, BUILD, step("deploy")] },
  ],
};

/** Runs started during the scenario. */
const newRuns = (ctx: DeskCtx) => ctx.state.world.runs.filter((r) => !ctx.start.world.runs.some((x) => x.id === r.id));
const mainGreen = (ctx: DeskCtx) => {
  const r = latestRun(ctx.state.world);
  return Boolean(r && r.branch === "main" && r.status === "success" && newRuns(ctx).includes(r));
};
const stagingClean = (ctx: DeskCtx) => (ctx.state.world.envs.staging?.history ?? []).slice((ctx.start.world.envs.staging?.history ?? []).length).every((sha) => commitOf(ctx.state.world, sha).bugs.length === 0);
/** The job that deploys, and whether it waits for the job that runs the tests. */
const deployWaitsForTests = (wf: Workflow | undefined) => {
  const deploy = wf?.jobs.find((j) => j.steps.some((s) => s.kind === "deploy"));
  const tests = wf?.jobs.find((j) => j.steps.some((s) => s.kind === "test"));
  return Boolean(deploy && tests && deploy !== tests && (deploy.needs ?? []).includes(tests.id));
};

export const scenarios: CiScenario[] = [
  {
    id: "never-pushed",
    title: l("Hiç push'lanmamış", "Never pushed"),
    story: l(
      "Geçen hafta bir arkadaşın senin bilgisayarında `.github/workflows/ci.yml` dosyasını yazdı ama dosya hiç commit'lenmedi. O günden beri main'e giren commit'leri hiçbir şey kontrol etmiyor.",
      "Last week a teammate wrote `.github/workflows/ci.yml` on your laptop, but the file was never committed. Since then nothing has checked the commits landing on main.",
    ),
    goal: l("Workflow GitHub'da olsun ve main'e yapılan bir push gerçekten bir CI run'ı başlatsın.", "The workflow is on GitHub, and a push to main really starts a CI run."),
    start: withLocalFile(deskOf(fresh()), workflowFile(CI), workflowYaml(CI)),
    hints: [
      l("`git status`'a bak: dosya Git'in henüz takip etmediği bir dosya. GitHub sadece push'lanmış dosyaları görür.", "Look at `git status`: Git isn't tracking the file yet. GitHub only sees files that were pushed."),
      l("Yeni bir dosya `git commit -a` ile gelmez; önce `git add` gerekir.", "A new file is not picked up by `git commit -a`; it needs `git add` first."),
      l("`git add .github/workflows/ci.yml` → `git commit -m \"Add CI\"` → `git push`", "`git add .github/workflows/ci.yml` → `git commit -m \"Add CI\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => wouldStart(liveWorkflow(ctx.state), "push", "main", ["src/app.ts"]) && newRuns(ctx).some((r) => r.branch === "main"),
  },
  {
    id: "red-main",
    title: l("main kırmızı", "main is red"),
    story: l(
      "Sabah açtığında main'deki son run kırmızı. Ekipte kural belli: main kırmızıyken üstüne yeni iş eklenmez, önce o düzeltilir. Ne kırıldığını loglardan bul.",
      "When you open your laptop in the morning, the last run on main is red. The team's rule is clear: nothing new goes on top of a red main; fix it first. Find out from the logs what broke.",
    ),
    goal: l("Hatayı kodda düzelt; main'deki yeni run yeşil olsun.", "Fix the bug in the code; the new run on main is green."),
    start: deskOf(after(fresh([CI]), { type: "push", add: ["test"], message: "add VAT to cart total" })),
    hints: [
      l("`gh run view --log-failed` kırılan adımın logunu gösterir: hangi test, hangi değer?", "`gh run view --log-failed` shows the failing step's log: which test, which value?"),
      l("Test 120 bekliyor ama 118 geliyor: `src/cart.ts`'teki KDV oranına bak. Düzelttikten sonra commit ve push.", "The test expects 120 but gets 118: look at the VAT rate in `src/cart.ts`. Then commit and push."),
      l(
        "`nano src/cart.ts` → `1.18`'i `1.2` yap → `git commit -am \"Fix VAT rate\"` → `git push`",
        "`nano src/cart.ts` → change `1.18` to `1.2` → `git commit -am \"Fix VAT rate\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => mainGreen(ctx) && headOf(ctx.state.world).bugs.length === 0,
  },
  {
    id: "auto-staging",
    title: l("Staging kendiliğinden", "Staging by itself"),
    story: l(
      "Her cuma biri yeşil build'i staging'e elle kopyalıyor; staging hâlâ ilk commit'i çalıştırıyor. Ekip, testleri geçen her main commit'inin staging'e **kendiliğinden** gitmesini istiyor.",
      "Every Friday someone copies a green build to staging by hand; staging still runs the very first commit. The team wants every main commit that passes the tests to go to staging **by itself**.",
    ),
    goal: l("Staging, pipeline'ın getirdiği yeni bir commit'i çalıştırsın; deploy testleri beklesin.", "Staging runs a new commit brought by the pipeline, and the deploy waits for the tests."),
    start: deskOf(fresh([CI])),
    hints: [
      l("Workflow'a ikinci bir job ekle: CI job'ı bittikten sonra çalışan bir deploy job'ı.", "Add a second job to the workflow: a deploy job that runs after the CI job."),
      l(
        "Her job temiz bir makinede başlar: CI job'ı `dist/`'i `actions/upload-artifact` ile bıraksın, deploy job'ı `needs: ci` ile beklesin, `actions/download-artifact` ile alsın ve `./deploy.sh staging` çalıştırsın.",
        "Every job starts on a clean machine: the CI job leaves `dist/` with `actions/upload-artifact`, the deploy job waits with `needs: ci`, picks it up with `actions/download-artifact` and runs `./deploy.sh staging`.",
      ),
      l(
        "`nano .github/workflows/ci.yml` → CI job'ının sonuna `- uses: actions/upload-artifact@v4` (`name: dist`, `path: dist/`) ekle; altına `deploy:` job'ı: `needs: ci`, `runs-on: ubuntu-latest`, adımlar `actions/download-artifact@v4` ve `run: ./deploy.sh staging` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy to staging\"` → `git push`",
        "`nano .github/workflows/ci.yml` → at the end of the CI job add `- uses: actions/upload-artifact@v4` (`name: dist`, `path: dist/`); below it a `deploy:` job: `needs: ci`, `runs-on: ubuntu-latest`, steps `actions/download-artifact@v4` and `run: ./deploy.sh staging` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy to staging\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const env = ctx.state.world.envs.staging;
      return Boolean(env?.sha && env.sha !== SHAS[0] && env.sha === ctx.state.world.heads.main) && deployWaitsForTests(liveWorkflow(ctx.state)) && stagingClean(ctx);
    },
  },
  {
    id: "red-reached-staging",
    title: l("Kırmızı staging'e çıktı", "Red reached staging"),
    story: l(
      "Dünkü push'ta testler kırmızıydı, ama deploy job'ı testleri beklemeden kendi build'ini yapıp staging'e çıktı. Test ekibi bütün öğleden sonra yanlış KDV'li sepetle uğraştı.",
      "Yesterday's push had red tests, but the deploy job built on its own without waiting for them and went to staging. The QA team spent the whole afternoon on a cart with the wrong VAT.",
    ),
    goal: l("Deploy job'ı testleri beklesin ve staging düzeltilmiş commit'i çalıştırsın.", "The deploy job waits for the tests, and staging runs the fixed commit."),
    start: deskOf(after(fresh([RACE]), { type: "push", add: ["test"], message: "add VAT to cart total" })),
    hints: [
      l("İki şey bozuk: kod (testler kırmızı) ve pipeline (deploy kimseyi beklemiyor). Biri olmadan diğeri yetmez.", "Two things are broken: the code (red tests) and the pipeline (the deploy waits for nobody). One without the other isn't enough."),
      l("Deploy job'ına `needs: ci` ekle; `src/cart.ts`'te KDV oranını düzelt. İkisi aynı commit'te gidebilir.", "Add `needs: ci` to the deploy job; fix the VAT rate in `src/cart.ts`. Both can go in the same commit."),
      l(
        "`nano .github/workflows/ci.yml` → `deploy:` altına `    needs: ci` → `nano src/cart.ts` → `1.18`'i `1.2` yap → `git commit -am \"Deploy only green builds\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `deploy:` add `    needs: ci` → `nano src/cart.ts` → change `1.18` to `1.2` → `git commit -am \"Deploy only green builds\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const env = ctx.state.world.envs.staging;
      return deployWaitsForTests(liveWorkflow(ctx.state)) && Boolean(env?.sha && env.sha === ctx.state.world.heads.main) && headOf(ctx.state.world).bugs.length === 0;
    },
  },
];
