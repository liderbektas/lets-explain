import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type Bug, type JobDef, type JobRun, type Run, type StepKind, type Workflow } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { PREP, step } from "../../engine/presets";
import type { CiScenario, DeskCtx } from "../shared/ci";

const ON = { push: { branches: ["main"] } };
const job = (id: string, kinds: StepKind[], extra: Partial<JobDef> = {}): JobDef => ({ id, steps: [...PREP, ...kinds.map((k) => step(k))], ...extra });

/** Everything in one job, one step after another: 5m 43s. */
const ONE_JOB: Workflow = { name: "CI", on: ON, jobs: [job("ci", ["lint", "typecheck", "test", "e2e", "build"])] };
/** Split into jobs, but build does not wait for the checks. */
const NO_NEEDS: Workflow = { name: "CI", on: ON, jobs: [job("lint", ["lint", "typecheck"]), job("test", ["test"]), job("e2e", ["e2e"]), job("build", ["build"])] };
/** Split, with build after lint and test, and the tests on Node 20 and 22. */
const MATRIX: Workflow = {
  name: "CI",
  on: ON,
  jobs: [job("lint", ["lint", "typecheck"]), job("test", ["test"], { matrix: [20, 22] }), job("e2e", ["e2e"]), job("build", ["build"], { needs: ["lint", "test"] })],
};

/** Orders grouped by day with `Object.groupBy`: there since Node 21, missing on Node 20. */
export const GROUPBY = `import type { Order } from "./types";

export function byDay(orders: Order[]) {
  return Object.groupBy(orders, (o) => o.date.slice(0, 10));
}`;

/** The same without `Object.groupBy`: works on every Node version. */
export const REDUCE = `import type { Order } from "./types";

export function byDay(orders: Order[]) {
  return orders.reduce<Record<string, Order[]>>((days, o) => {
    (days[o.date.slice(0, 10)] ??= []).push(o);
    return days;
  }, {});
}`;

/** main after one push under this workflow. `bugs`: what the code already has; `add`: what the push brings. */
function shop(wf: Workflow, o: { bugs?: Bug[]; add?: Bug[]; message: string }): Desk {
  const w = apply(freshWorld({ workflows: [wf], bugs: o.bugs ?? [] }), { type: "push", add: o.add, paths: ["src/list.ts"], message: o.message }).state;
  const node20 = (o.bugs ?? []).includes("node20") || (o.add ?? []).includes("node20");
  return deskOf(w, { "src/list.ts": node20 ? GROUPBY : REDUCE });
}

const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const fast = (r: Run) => r.end - r.start <= 210;
const leg = (r: Run, node: number): JobRun | undefined => r.jobs.find((j) => j.id === "test" && j.node === node);
/** The tests ran on both Nodes: 20 failed on its own, 22 passed. */
const bothNodes = (r: Run) => leg(r, 20)?.status === "failure" && leg(r, 22)?.status === "success";

const MATRIX_YAML = l(
  "testi kendi job'ına al ve `strategy:` · `matrix:` · `node: [20, 22]` ekle; `setup-node`'da `node-version: ${{ matrix.node }}`",
  "move the tests into their own job and add `strategy:` · `matrix:` · `node: [20, 22]`; in `setup-node`, `node-version: ${{ matrix.node }}`",
);

export const scenarios: CiScenario[] = [
  {
    id: "split",
    title: l("Altı dakika bekleme", "Six minutes of waiting"),
    story: l(
      "Her push'tan sonra yeşil tik için 5 dakika 43 saniye bekliyorsun. Her şey tek bir `ci` job'ında, sırayla çalışıyor; en uzun adım 2,5 dakikalık tarayıcı testleri (`npm run e2e`) ve hiçbir şey onları beklemek zorunda değil.",
      "After every push you wait 5 minutes 43 seconds for the green tick. Everything runs in one `ci` job, one step after another; the longest step is the 2.5-minute browser tests (`npm run e2e`), and nothing has to wait for them.",
    ),
    goal: l("Bir run baştan sona **3 dakika 30 saniye** ya da daha kısa sürsün.", "Get a run that takes **3 minutes 30 seconds** or less, start to end."),
    start: shop(ONE_JOB, { message: "orders: group by day" }),
    hints: [
      l("Bir workflow'daki job'lar ayrı makinelerde **aynı anda** çalışır. Run en yavaş yolu kadar sürer.", "Jobs in a workflow run on separate machines **at the same time**. A run takes as long as its slowest path."),
      l("e2e'yi kendi job'ına al. Yeni makinede kod ve paketler yok: checkout, setup-node ve `npm ci` ile başlasın.", "Move e2e into its own job. The new machine has no code and no packages: start it with checkout, setup-node and `npm ci`."),
      l(
        "`nano .github/workflows/ci.yml` → `- run: npm run e2e`'yi `ci`'dan sil, altına checkout + setup-node + `npm ci` + `npm run e2e` adımlı bir `e2e:` job'ı ekle → `git commit -am \"ci: e2e in its own job\"` → `git push`",
        "`nano .github/workflows/ci.yml` → delete `- run: npm run e2e` from `ci`, add an `e2e:` job with checkout + setup-node + `npm ci` + `npm run e2e` → `git commit -am \"ci: e2e in its own job\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => fast(r) && r.status === "success"),
  },
  {
    id: "two-nodes",
    title: l("Node 20'deki müşteriler", "Customers on Node 20"),
    story: l(
      "Uygulamanı kendi sunucularında çalıştıran bazı müşteriler hâlâ Node 20'de ve sipariş listesinin çöktüğünü söylüyorlar. CI sadece Node 22'de test ediyor ve hep yeşil.",
      "Some customers who run your app on their own servers are still on Node 20, and they say the order list crashes. CI only tests on Node 22, and it is always green.",
    ),
    goal: l("Bir run'da testler hem Node 20 hem Node 22'de çalışsın: `test (20)` kırılsın, `test (22)` geçsin.", "Get a run where the tests run on both Node 20 and Node 22: `test (20)` fails and `test (22)` passes."),
    start: shop(ONE_JOB, { bugs: ["node20"], message: "orders: group by day" }),
    hints: [
      l("Aynı job'ı birkaç sürümde çalıştırmanın yolu bir matrix. Matrix bütün job'ı çoğaltır, o yüzden testler kendi job'ında olsun.", "Running one job on several versions is what a matrix does. A matrix copies the whole job, so give the tests their own job."),
      MATRIX_YAML,
      l(
        "`nano .github/workflows/ci.yml` → `- run: npm test`'i `ci`'dan sil, `test:` job'ı ekle (`strategy.matrix.node: [20, 22]`, `node-version: ${{ matrix.node }}`, `npm ci`, `npm test`) → `git commit -am \"ci: test on Node 20 and 22\"` → `git push`",
        "`nano .github/workflows/ci.yml` → delete `- run: npm test` from `ci`, add a `test:` job (`strategy.matrix.node: [20, 22]`, `node-version: ${{ matrix.node }}`, `npm ci`, `npm test`) → `git commit -am \"ci: test on Node 20 and 22\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some(bothNodes),
  },
  {
    id: "fix-node20",
    title: l("Her iki Node'da yeşil", "Green on both Nodes"),
    story: l(
      "Matrix işini yaptı: `test (20)` kırmızı, `test (22)` yeşil. Müşteriler Node 20'yi bir süre daha kullanacak, yani 20'yi matrix'ten çıkarmak çözüm değil.",
      "The matrix did its job: `test (20)` is red and `test (22)` is green. Customers will stay on Node 20 for a while, so dropping 20 from the matrix is not the answer.",
    ),
    goal: l("Matrix'te Node 20 ve 22 kalsın ve bir run'da ikisi de yeşil olsun.", "Keep Node 20 and 22 in the matrix, and get a run where both are green."),
    start: shop(MATRIX, { bugs: ["node20"], message: "orders: group by day" }),
    hints: [
      l("`gh run view --log-failed`: Node 20'de hangi fonksiyon yok, hangi dosyada?", "`gh run view --log-failed`: which function is missing on Node 20, and in which file?"),
      l("`Object.groupBy` Node 21'de geldi. `src/list.ts`'te aynı işi `reduce` ile yap.", "`Object.groupBy` arrived in Node 21. In `src/list.ts`, do the same with `reduce`."),
      l(
        "`nano src/list.ts` → `Object.groupBy(...)` yerine bir `reduce` → `git commit -am \"orders: group without Object.groupBy\"` → `git push`",
        "`nano src/list.ts` → a `reduce` instead of `Object.groupBy(...)` → `git commit -am \"orders: group without Object.groupBy\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => leg(r, 20)?.status === "success" && leg(r, 22)?.status === "success"),
  },
  {
    id: "build-waits",
    title: l("Kırık build yüklenmesin", "Don't build what failed"),
    story: l(
      "CI job'lara bölünmüş ama `build` hiçbir şeyi beklemiyor: testler kırıldığı run'da bile build çalışıp dakika harcıyor ve yayına hazır görünen bir `dist/` üretiyor.",
      "CI is split into jobs, but `build` waits for nothing: even in a run where the tests fail, the build runs, spends minutes, and makes a `dist/` that looks ready to ship.",
    ),
    goal: l("`build`, lint ve test geçene kadar beklesin: testlerin kırıldığı bir run'da build **hiç başlamasın** (atlansın).", "Make `build` wait for lint and test: in a run where the tests fail, build **never starts** (it is skipped)."),
    start: shop(NO_NEEDS, { add: ["test"], message: "cart: add VAT" }),
    hints: [
      l("Job'lar varsayılan olarak hepsi aynı anda başlar. Bir job'ın başkalarını beklemesini söyleyen anahtar `needs`.", "By default every job starts at once. The key that makes a job wait for others is `needs`."),
      l("`build:` job'ına `needs: [lint, test]` ekle. İhtiyaç duyduğu job kırılırsa build atlanır.", "Add `needs: [lint, test]` to the `build:` job. If a job it needs fails, build is skipped."),
      l(
        "`nano .github/workflows/ci.yml` → `build:` altına `    needs: [lint, test]` → `git commit -am \"ci: build after lint and test\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `build:` add `    needs: [lint, test]` → `git commit -am \"ci: build after lint and test\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) =>
      fresh(ctx).some((r) => r.jobs.some((j) => j.id === "test" && j.status === "failure") && r.jobs.some((j) => j.id === "build" && j.status === "skipped")),
  },
  {
    id: "fast-and-wide",
    title: l("Hem hızlı hem geniş", "Fast and wide"),
    story: l(
      "Yine tek job ve 5 dakika 43 saniye; Node 20'deki müşteriler de hâlâ sipariş listesinin çöktüğünü söylüyor. Bu sefer ikisini birden tek bir değişiklikle çöz.",
      "Back to one job and 5 minutes 43 seconds, and the customers on Node 20 still say the order list crashes. This time solve both with one change.",
    ),
    goal: l("Tek bir run hem 3 dakika 30 saniyenin altında bitsin hem de testleri Node 20 ve 22'de çalıştırsın (`test (20)` kırmızı, `test (22)` yeşil).", "Get one run that finishes in 3 minutes 30 seconds or less and also tests on Node 20 and 22 (`test (20)` red, `test (22)` green)."),
    start: shop(ONE_JOB, { bugs: ["node20"], message: "orders: group by day" }),
    hints: [
      l("Matrix testleri ayırır, ama run'ı uzatan başka bir adım var.", "The matrix splits off the tests, but something else makes the run long."),
      l(`Hem e2e'yi kendi job'ına al, hem de ${MATRIX_YAML.tr}.`, `Both move e2e into its own job and ${MATRIX_YAML.en}.`),
      l(
        "`nano .github/workflows/ci.yml` → `e2e:` job'ı ve matrix'li `test:` job'ı ekle, ikisini `ci`'dan sil → `git commit -am \"ci: parallel jobs, Node 20 and 22\"` → `git push`",
        "`nano .github/workflows/ci.yml` → add an `e2e:` job and a `test:` job with the matrix, delete both from `ci` → `git commit -am \"ci: parallel jobs, Node 20 and 22\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => fast(r) && bothNodes(r)),
  },
];
