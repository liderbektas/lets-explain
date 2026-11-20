import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, headOf, latestRun, type Bug, type JobRun, type Run, type StepKind, type Workflow } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";
import { ONE, split } from "./model";

/** The shop with this workflow, after a push that brought these bugs. */
const pushedWith = (wf: Workflow, add: Bug[] = []) => deskOf(apply(freshWorld({ workflows: [wf] }), { type: "push", add, message: "product page: reviews" }).state);

/** Runs started during the scenario. */
const newRuns = (ctx: DeskCtx) => ctx.state.world.runs.filter((r) => !ctx.start.world.runs.some((x) => x.id === r.id));
const newest = (ctx: DeskCtx): Run | undefined => {
  const r = latestRun(ctx.state.world);
  return r && newRuns(ctx).includes(r) ? r : undefined;
};
const has = (steps: { kind: StepKind }[], kind: StepKind) => steps.some((s) => s.kind === kind);
/** The workflow's job that does only this kind of work, whatever the reader named it. */
const jobDoing = (wf: Workflow | undefined, kind: "lint" | "test" | "build") =>
  wf?.jobs.find((j) => has(j.steps, kind) && (["lint", "test", "build"] as const).every((k) => k === kind || !has(j.steps, k)));
/** A run's jobs by what they do. A skipped job has no steps in the run, so the workflow says which is which. */
const jobsByWork = (r: Run, wf: Workflow | undefined) => {
  const of = (kind: "lint" | "test" | "build") => {
    const def = jobDoing(wf, kind);
    return def ? r.jobs.find((j) => j.id === def.id) : undefined;
  };
  return { lint: of("lint"), test: of("test"), build: of("build") };
};
/** In the workflow on GitHub, the build job waits for the jobs that do these checks. */
const buildWaitsFor = (wf: Workflow | undefined, ...checks: ("lint" | "test")[]) => {
  const build = jobDoing(wf, "build");
  return Boolean(build) && checks.every((k) => (build!.needs ?? []).includes(jobDoing(wf, k)?.id ?? "?"));
};
const waited = (build: JobRun, ...before: (JobRun | undefined)[]) => before.every((j) => j && build.start >= j.end);

export const scenarios: CiScenario[] = [
  {
    id: "split",
    title: l("Tek uzun job", "One long job"),
    story: l(
      "CI tek bir job: lint, test ve build sırayla, bir makinede, her push'ta üç dakika. Lint ile testlerin birbirini beklemesi için bir sebep yok; ekip ikisinin aynı anda koşmasını, build'in ikisi de bitince başlamasını istiyor.",
      "CI is one job: lint, test and build in a row, on one machine, three minutes per push. There's no reason for lint and the tests to wait for each other; the team wants them side by side, with the build starting once both are done.",
    ),
    goal: l("Lint, test ve build ayrı job'lar olsun; lint ile test aynı anda başlasın, build ikisini beklesin ve run yeşil olsun.", "Lint, test and build are separate jobs; lint and test start together, build waits for both, and the run is green."),
    start: pushedWith(ONE),
    hints: [
      l("Job'lar varsayılan olarak aynı anda başlar; bir job'ı bekletmek `needs` ile olur.", "Jobs start at the same time by default; making one wait is what `needs` does."),
      l("Her job boş bir makinede başlar: her birinin kendi checkout, setup-node ve `npm ci` adımları olmalı.", "Every job starts on an empty machine: each needs its own checkout, setup-node and `npm ci`."),
      l(
        "`nano .github/workflows/ci.yml` → `lint:`, `test:` ve `build:` diye üç job; her birinde checkout, setup-node, `npm ci` ve kendi komutu; `build:` altına `needs: [lint, test]` → `git commit -am \"Split CI into jobs\"` → `git push`",
        "`nano .github/workflows/ci.yml` → three jobs `lint:`, `test:` and `build:`; each with checkout, setup-node, `npm ci` and its own command; under `build:` add `needs: [lint, test]` → `git commit -am \"Split CI into jobs\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const r = newest(ctx);
      if (!r || r.status !== "success") return false;
      const j = jobsByWork(r, liveWorkflow(ctx.state));
      return Boolean(j.lint && j.test && j.build && j.lint.start === j.test.start && waited(j.build, j.lint, j.test)) && buildWaitsFor(liveWorkflow(ctx.state), "lint", "test");
    },
  },
  {
    id: "skip-build",
    title: l("Boşuna build", "A wasted build"),
    story: l(
      "Testler kırmızıyken bile `build` job'ı iki dakika çalışıp bir paket üretiyor; kimse o paketi kullanmıyor. Testteki hatayı Bora kendi branch'inde düzeltiyor. Sen pipeline'ı düzelt: testler kırılınca build hiç başlamasın.",
      "Even when the tests are red, the `build` job runs for two minutes and makes a package nobody uses. Bora is fixing the failing test on a branch. You fix the pipeline: when the tests break, the build shouldn't start at all.",
    ),
    goal: l("`build`, `test`'i beklesin; yeni bir run'da test kırılınca build **atlansın**.", "`build` waits for `test`; in a new run, when the tests break, the build is **skipped**."),
    start: pushedWith(split([]), ["test"]),
    hints: [
      l("`gh run view` ile son run'ın job'larına bak: test kırmızı, build yeşil. Build kimseyi beklemiyor.", "Check the last run's jobs with `gh run view`: test is red, build is green. Build waits for nobody."),
      l("Bekleyen bir job, beklediği job kırılırsa hiç başlamaz: `needs`.", "A job that waits for another doesn't start at all if that one breaks: `needs`."),
      l("`nano .github/workflows/ci.yml` → `build:` altına `    needs: test` → `git commit -am \"Build after tests\"` → `git push`", "`nano .github/workflows/ci.yml` → under `build:` add `    needs: test` → `git commit -am \"Build after tests\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const r = newest(ctx);
      if (!r) return false;
      const j = jobsByWork(r, liveWorkflow(ctx.state));
      return j.test?.status === "failure" && j.build?.status === "skipped" && buildWaitsFor(liveWorkflow(ctx.state), "test");
    },
  },
  {
    id: "wait-for-both",
    title: l("İkisini de bekle", "Wait for both"),
    story: l(
      "`build` sadece `test`'i bekliyor. Dünkü push'ta lint kırmızıydı ama build yine çalıştı ve run'ın yarısı yeşil göründü. Hem pipeline'ı düzelt hem de lint hatasını gider.",
      "`build` waits only for `test`. Yesterday's push had a red lint, yet the build still ran and half the run looked green. Fix the pipeline and get rid of the lint error.",
    ),
    goal: l("`build` hem `lint`'i hem `test`'i beklesin ve main'de yeşil bir run olsun.", "`build` waits for both `lint` and `test`, and main gets a green run."),
    start: pushedWith(split(["test"]), ["lint"]),
    hints: [
      l("`gh run view --log-failed` lint'in neye takıldığını söyler. `needs` tek bir job değil, bir liste de alabilir.", "`gh run view --log-failed` tells you what lint tripped on. `needs` can take a list, not just one job."),
      l("`build:` altında `needs: [lint, test]`; `src/cart.ts`'te kullanılmayan değişkeni sil. İkisi aynı commit'e girebilir.", "Under `build:` use `needs: [lint, test]`; delete the unused variable in `src/cart.ts`. Both can go in one commit."),
      l(
        "`nano .github/workflows/ci.yml` → `needs: test`'i `needs: [lint, test]` yap → `nano src/cart.ts` → `const total = subtotal;` satırını sil → `git commit -am \"Build after all checks\"` → `git push`",
        "`nano .github/workflows/ci.yml` → change `needs: test` to `needs: [lint, test]` → `nano src/cart.ts` → delete the `const total = subtotal;` line → `git commit -am \"Build after all checks\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const r = newest(ctx);
      if (!r || r.status !== "success") return false;
      const j = jobsByWork(r, liveWorkflow(ctx.state));
      return Boolean(j.build && waited(j.build, j.lint, j.test)) && buildWaitsFor(liveWorkflow(ctx.state), "lint", "test");
    },
  },
  {
    id: "which-job",
    title: l("Hangi job?", "Which job?"),
    story: l(
      "Bildirim geldi: main'deki run kırmızı. Üç job var ve hangisinin neden kırıldığını bilmiyorsun. Loglardan bul, kodu düzelt.",
      "A notification: the run on main is red. There are three jobs and you don't know which one broke, or why. Find it in the logs and fix the code.",
    ),
    goal: l("Kırılan job'ın sebebini kodda düzelt; main'deki yeni run yeşil olsun.", "Fix in the code whatever broke the job; the new run on main is green."),
    start: pushedWith(split(["lint", "test"]), ["build"]),
    hints: [
      l("`gh run view` hangi job'ın kırıldığını, `gh run view --log-failed` neden kırıldığını gösterir.", "`gh run view` shows which job broke, `gh run view --log-failed` why."),
      l("Build, `src/cart.ts`'in import ettiği `./utils/money` dosyasını bulamıyor. O dosya hiç yok ve kod onu kullanmıyor.", "The build can't find `./utils/money`, which `src/cart.ts` imports. That file doesn't exist, and the code doesn't use it."),
      l("`nano src/cart.ts` → `import { money } from \"./utils/money\";` satırını sil → `git commit -am \"Remove unused import\"` → `git push`", "`nano src/cart.ts` → delete the `import { money } from \"./utils/money\";` line → `git commit -am \"Remove unused import\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => newest(ctx)?.status === "success" && newest(ctx)?.branch === "main" && headOf(ctx.state.world).bugs.length === 0,
  },
];
