import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type Bug, type CiAction, type Run, type Workflow } from "../../engine/ci";
import { deskOf, type Desk, type Files } from "../../engine/desk";
import { PREP, TEST, ciWorkflow, step } from "../../engine/presets";
import { GROUPBY } from "../parallel-and-matrix/scenarios";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";

const ON = { push: { branches: ["main"] } };
/** lint, test, build in one `ci` job, on pushes to main. */
const BASE: Workflow = ciWorkflow({ on: ON });
/** CI plus a separate job for the browser tests. */
const WITH_E2E: Workflow = { ...BASE, jobs: [BASE.jobs[0]!, { id: "e2e", steps: [...PREP, step("e2e")] }] };
/** Tests and browser tests on Node 20 and 22; fail-fast is GitHub's default. */
const MATRIX: Workflow = { ...BASE, jobs: [{ id: "test", matrix: [20, 22], steps: [...PREP, TEST, step("e2e")] }] };

/** A browser test that opens the site with no time limit: if the site never answers, it waits forever. */
export const HANGING_SPEC = `import { expect, test } from "@playwright/test";

test("checkout confirms the order", async ({ page }) => {
  await page.goto("http://localhost:3000/checkout", { timeout: 0 });
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Order confirmed")).toBeVisible();
});`;

/** main after one push with this workflow. */
function shop(wf: Workflow, o: { bugs?: Bug[]; files?: Files; message: string; paths?: string[] }): Desk {
  const push: CiAction = { type: "push", paths: o.paths ?? ["src/cart.ts"], message: o.message };
  return deskOf(apply(freshWorld({ workflows: [wf], bugs: o.bugs ?? [] }), push).state, o.files ?? {});
}

const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const leg = (r: Run, node: number) => r.jobs.find((j) => j.id === "test" && j.node === node);

export const scenarios: CiScenario[] = [
  {
    id: "only-last",
    title: l("Sadece sonuncusu", "Only the last one"),
    story: l(
      "Küçük düzeltmeleri art arda push'luyorsun ve her biri kendi run'ını başlatıyor. Bir sonraki push geldiğinde öncekinin sonucunu kimse okumuyor ama hepsi sonuna kadar çalışıp dakika yakıyor.",
      "You push small fixes one after another, and each one starts its own run. When the next push lands nobody reads the previous result, yet every run goes to the end and burns minutes.",
    ),
    goal: l(
      "Aynı branch'te yeni bir run başlayınca hâlâ çalışan eskisi **iptal olsun**, ve bunu bir kez gerçekten gör: arka arkaya iki push, ilkinin run'ı iptal.",
      "When a new run starts on the same branch, the older one still running is **cancelled**, and you see it happen once: two pushes in a row, the first one's run cancelled.",
    ),
    start: shop(BASE, { message: "cart: add VAT" }),
    hints: [
      l("Workflow'un en üstüne bir `concurrency` grubu: aynı gruptaki yeni run eskisini durdurabilir. Ayar ancak push'landıktan sonra geçerli.", "A `concurrency` group at the top of the workflow: a new run in the same group can stop the older one. The setting only counts once it is pushed."),
      l(
        "`jobs:`'ın üstüne: `concurrency:` · `group: ${{ github.workflow }}-${{ github.ref }}` · `cancel-in-progress: true`. Sonra iki push art arda.",
        "Above `jobs:`: `concurrency:` · `group: ${{ github.workflow }}-${{ github.ref }}` · `cancel-in-progress: true`. Then two pushes in a row.",
      ),
      l(
        "`nano .github/workflows/ci.yml` (concurrency) → `git commit -am \"ci: cancel older runs\"` → `git push` → `echo \"// tidy\" >> src/app.ts` → `git commit -am \"tidy\"` → `git push`",
        "`nano .github/workflows/ci.yml` (concurrency) → `git commit -am \"ci: cancel older runs\"` → `git push` → `echo \"// tidy\" >> src/app.ts` → `git commit -am \"tidy\"` → `git push`",
      ),
    ],
    par: 6,
    check: (ctx) => Boolean(liveWorkflow(ctx.state)?.concurrency) && fresh(ctx).some((r) => r.status === "cancelled") && fresh(ctx).some((r) => r.status === "success"),
  },
  {
    id: "six-hours",
    title: l("Altı saatlik run", "The six-hour run"),
    story: l(
      "Dünkü run 363 dakika faturaladı: tarayıcı testleri siteyi açmaya çalışırken takıldı ve GitHub job'ı 6 saat bekledi. Testler tekrar takılabilir; takılırsa da bu kadar pahalıya patlamamalı.",
      "Yesterday's run billed 363 minutes: the browser tests hung trying to open the site, and GitHub waited 6 hours for the job. The tests may hang again; if they do, it must not cost this much.",
    ),
    goal: l("`ci` job'ının geçtiği ve toplam **20 dakikadan az** faturalanan bir run al.", "Get a run where the `ci` job passes and the whole run bills **under 20 minutes**."),
    start: shop(WITH_E2E, { bugs: ["hang"], files: { "e2e/checkout.spec.ts": HANGING_SPEC }, message: "checkout: new confirmation page" }),
    hints: [
      l("Bir job'ın varsayılan süre sınırı 360 dakika. Takılan bir job'ı daha erken kesmek workflow'un işi.", "A job's default time limit is 360 minutes. Cutting a hanging job off sooner is the workflow's job."),
      l("`e2e:` job'ına `timeout-minutes: 15` ekle. (Testteki `timeout: 0` da sonsuz beklemenin sebebi.)", "Add `timeout-minutes: 15` to the `e2e:` job. (The `timeout: 0` in the test is why it waits forever, too.)"),
      l(
        "`nano .github/workflows/ci.yml` → `e2e:` altına `    timeout-minutes: 15` → `git commit -am \"ci: cap e2e at 15 minutes\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `e2e:` add `    timeout-minutes: 15` → `git commit -am \"ci: cap e2e at 15 minutes\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => r.jobs.some((j) => j.id === "ci" && j.status === "success") && r.minutes < 20),
  },
  {
    id: "typo",
    title: l("Bedava düzeltme", "A free fix"),
    story: l(
      "README'de bir yazım hatası buldun. Bu workflow'da yol filtresi yok; düzeltmeyi push'larsan 3 dakikalık bir CI başlar ve hiçbir şeyi test etmez.",
      "You found a typo in the README. This workflow has no path filter; pushing the fix would start a 3-minute CI run that tests nothing.",
    ),
    goal: l("README düzeltmesi `main`'e gitsin ama **hiçbir run** başlamasın.", "Get the README fix onto `main` without **any run** starting."),
    start: shop(BASE, { message: "cart: add VAT" }),
    hints: [
      l("Workflow'u değiştirmeden de GitHub'a bu commit için CI çalıştırmamasını söyleyebilirsin: commit mesajıyla.", "Without touching the workflow, you can tell GitHub not to run CI for this one commit: with the commit message."),
      l("Mesajın içinde `[skip ci]` geçen bir commit hiçbir push ya da PR workflow'unu başlatmaz.", "A commit whose message contains `[skip ci]` starts no push or PR workflow."),
      l(
        "`nano README.md` (yazım hatası) → `git commit -am \"docs: fix a typo [skip ci]\"` → `git push`",
        "`nano README.md` (the typo) → `git commit -am \"docs: fix a typo [skip ci]\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) =>
      ctx.state.world.heads.main !== ctx.start.world.heads.main &&
      ctx.state.remote.main?.["README.md"] !== ctx.start.remote.main?.["README.md"] &&
      fresh(ctx).length === 0,
  },
  {
    id: "fail-fast",
    title: l("İptal edilen Node 22", "Node 22, cancelled"),
    story: l(
      "Testler Node 20 ve 22'de çalışıyor. Node 20'de bir hata var, ve o kırılınca GitHub hâlâ çalışan Node 22'yi de iptal ediyor: Node 22'nin sağlam olup olmadığını hiç göremiyorsun.",
      "The tests run on Node 20 and 22. There is a bug on Node 20, and when it fails GitHub also cancels Node 22, which is still running: you never get to see whether Node 22 is fine.",
    ),
    goal: l("Bir run'da `test (20)` kırılsın ama `test (22)` **sonuna kadar çalışıp geçsin**.", "Get a run where `test (20)` fails but `test (22)` **runs to the end and passes**."),
    start: shop(MATRIX, { bugs: ["node20"], files: { "src/list.ts": GROUPBY }, message: "orders: group by day", paths: ["src/list.ts"] }),
    hints: [
      l("Matrix'te bir bacak kırılınca diğerlerini iptal eden ayar `fail-fast`, ve varsayılanı açık.", "The setting that cancels the other legs when one fails is `fail-fast`, and it is on by default."),
      l("`strategy:` altına `fail-fast: false`.", "Under `strategy:`, add `fail-fast: false`."),
      l(
        "`nano .github/workflows/ci.yml` → `strategy:` altına `      fail-fast: false` → `git commit -am \"ci: let every Node finish\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `strategy:` add `      fail-fast: false` → `git commit -am \"ci: let every Node finish\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => leg(r, 20)?.status === "failure" && leg(r, 22)?.status === "success"),
  },
];
