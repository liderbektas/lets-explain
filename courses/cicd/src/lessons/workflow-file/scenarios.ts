import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, latestRun, type Run, type StepKind } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import type { CiScenario, DeskCtx } from "../shared/ci";
import { wf } from "./model";

/** The shop with this workflow pushed once, so its first run is already on GitHub. */
const pushedWith = (kinds: StepKind[]) => deskOf(apply(freshWorld({ workflows: [wf(kinds)] }), { type: "push", message: "add search box" }).state);

/** Runs started during the scenario. */
const newRuns = (ctx: DeskCtx) => ctx.state.world.runs.filter((r) => !ctx.start.world.runs.some((x) => x.id === r.id));
const ran = (r: Run, kind: StepKind) => r.jobs.some((j) => j.steps.some((s) => s.kind === kind && s.status === "success"));
/** The newest run is one of ours, green, on main, and really ran the tests. */
const greenWithTests = (ctx: DeskCtx) => {
  const r = latestRun(ctx.state.world);
  return Boolean(r && newRuns(ctx).includes(r) && r.branch === "main" && r.status === "success" && ran(r, "test"));
};

const RUNS_ON = l(
  "Her job boş bir makinede başlar: önce kod (`actions/checkout`), sonra Node (`actions/setup-node`), sonra bağımlılıklar (`npm ci`), en son testler.",
  "Every job starts on an empty machine: first the code (`actions/checkout`), then Node (`actions/setup-node`), then the dependencies (`npm ci`), and only then the tests.",
);

export const scenarios: CiScenario[] = [
  {
    id: "first-workflow",
    title: l("İlk workflow", "The first workflow"),
    story: l(
      "Mağaza projesinde hiç CI yok; testler sadece birinin aklına gelince elle çalışıyor. Ekip, main'e her push'ta testlerin GitHub'da kendiliğinden çalışmasını istiyor.",
      "The shop project has no CI at all; tests run only when someone remembers. The team wants the tests to run on GitHub by themselves on every push to main.",
    ),
    goal: l("`.github/workflows/ci.yml` GitHub'da olsun ve main'e push'ta `npm test`'in geçtiği yeşil bir run başlasın.", "`.github/workflows/ci.yml` is on GitHub, and a push to main starts a green run in which `npm test` passed."),
    start: deskOf(freshWorld()),
    hints: [
      l("Workflow dosyası `.github/workflows/` altında yaşar. `nano` yeni dosyayı da açar; yeni dosya `git add` ister.", "Workflow files live under `.github/workflows/`. `nano` opens a new file too; a new file needs `git add`."),
      l("`name`, `on: push` (main), bir job, `runs-on: ubuntu-latest` ve sırayla checkout, setup-node, `npm ci`, `npm test`.", "`name`, `on: push` (main), one job, `runs-on: ubuntu-latest`, and in order checkout, setup-node, `npm ci`, `npm test`."),
      l(
        "`nano .github/workflows/ci.yml` → `name: CI`, `on: push: branches: [main]`, `jobs: test: runs-on: ubuntu-latest`, `steps:` `- uses: actions/checkout@v4`, `- uses: actions/setup-node@v4` (`with: node-version: 22`), `- run: npm ci`, `- run: npm test` → `git add .github/workflows/ci.yml` → `git commit -m \"Add CI\"` → `git push`",
        "`nano .github/workflows/ci.yml` → `name: CI`, `on: push: branches: [main]`, `jobs: test: runs-on: ubuntu-latest`, `steps:` `- uses: actions/checkout@v4`, `- uses: actions/setup-node@v4` (`with: node-version: 22`), `- run: npm ci`, `- run: npm test` → `git add .github/workflows/ci.yml` → `git commit -m \"Add CI\"` → `git push`",
      ),
    ],
    par: 4,
    check: greenWithTests,
  },
  {
    id: "npm-not-found",
    title: l("npm bulunamadı", "npm not found"),
    story: l(
      "Bora ilk workflow'u yazdı ve push'ladı. Run kırmızı: `npm ci` adımı `npm: command not found` diyor. Kodu bilgisayarında sorunsuz çalışıyor.",
      "Bora wrote the first workflow and pushed it. The run is red: the `npm ci` step says `npm: command not found`. The code runs fine on Bora's laptop.",
    ),
    goal: l("Workflow'u düzelt; main'de testlerin geçtiği yeşil bir run olsun.", "Fix the workflow; get a green run on main in which the tests pass."),
    start: pushedWith(["checkout", "install", "test"]),
    hints: [l("`gh run view --log-failed` ile kırılan adımı oku. Runner'da kod var; başka ne eksik?", "Read the failing step with `gh run view --log-failed`. The runner has the code; what else is missing?"), RUNS_ON, l("`nano .github/workflows/ci.yml` → checkout'un altına `- uses: actions/setup-node@v4` (`with: node-version: 22`) → `git commit -am \"Set up Node\"` → `git push`", "`nano .github/workflows/ci.yml` → under checkout add `- uses: actions/setup-node@v4` (`with: node-version: 22`) → `git commit -am \"Set up Node\"` → `git push`")],
    par: 3,
    check: greenWithTests,
  },
  {
    id: "no-package-json",
    title: l("package.json nerede?", "Where is package.json?"),
    story: l(
      "Bu sefer `npm ci` başka bir hatayla kırılıyor: `npm error code ENOENT`, `Could not read package.json`. Node kurulu, ama npm projeyi bulamıyor.",
      "This time `npm ci` fails differently: `npm error code ENOENT`, `Could not read package.json`. Node is installed, but npm can't find the project.",
    ),
    goal: l("Workflow'u düzelt; main'de testlerin geçtiği yeşil bir run olsun.", "Fix the workflow; get a green run on main in which the tests pass."),
    start: pushedWith(["setup-node", "install", "test"]),
    hints: [l("Runner boş bir makine: senin repondan hiçbir dosya kendiliğinden gelmez.", "The runner is an empty machine: none of your repo's files arrive on their own."), RUNS_ON, l("`nano .github/workflows/ci.yml` → en üste `- uses: actions/checkout@v4` → `git commit -am \"Check out the code\"` → `git push`", "`nano .github/workflows/ci.yml` → at the top add `- uses: actions/checkout@v4` → `git commit -am \"Check out the code\"` → `git push`")],
    par: 3,
    check: greenWithTests,
  },
  {
    id: "wrong-order",
    title: l("Yanlış sıra", "Wrong order"),
    story: l(
      "Workflow'da bütün adımlar var ama run yine kırmızı: `npm test` adımı `sh: 1: vitest: not found` ile kırılıyor, `npm ci` ise ondan sonra yeşil yanıyor.",
      "The workflow has every step, yet the run is red: `npm test` fails with `sh: 1: vitest: not found`, and `npm ci` goes green right after it.",
    ),
    goal: l("Workflow'u düzelt; main'de testlerin geçtiği yeşil bir run olsun.", "Fix the workflow; get a green run on main in which the tests pass."),
    start: pushedWith(["checkout", "setup-node", "test", "install"]),
    hints: [l("Adımlar dosyadaki sırayla, yukarıdan aşağı çalışır.", "Steps run in the file's order, top to bottom."), l("`vitest` bir bağımlılık: testler çalışmadan önce `npm ci` onu kurmuş olmalı.", "`vitest` is a dependency: `npm ci` must have installed it before the tests run."), l("`nano .github/workflows/ci.yml` → `- run: npm ci` satırını `- run: npm test`'in üstüne taşı → `git commit -am \"Install before testing\"` → `git push`", "`nano .github/workflows/ci.yml` → move the `- run: npm ci` line above `- run: npm test` → `git commit -am \"Install before testing\"` → `git push`")],
    par: 3,
    check: greenWithTests,
  },
  {
    id: "build-too",
    title: l("Build da kontrol edilsin", "Check the build too"),
    story: l(
      "CI yeşil, ama dün testleri geçen bir commit production'da derlenmedi: kimse `npm run build`'i çalıştırmamıştı. Ekip build'in de her push'ta, testlerden sonra denenmesini istiyor.",
      "CI is green, but yesterday a commit that passed the tests didn't compile in production: nobody had run `npm run build`. The team wants the build tried on every push too, after the tests.",
    ),
    goal: l("Yeşil bir run'da hem `npm test` hem `npm run build` çalışsın ve build testten **sonra** gelsin.", "Get a green run where both `npm test` and `npm run build` ran, with the build **after** the tests."),
    start: pushedWith(["checkout", "setup-node", "install", "test"]),
    hints: [l("Yeni kontrol, mevcut job'a bir adım daha demek.", "A new check is one more step in the existing job."), l("Adımlar sırayla çalışır: build'i `npm test`'in altına koy.", "Steps run in order: put the build below `npm test`."), l("`nano .github/workflows/ci.yml` → en alta `- run: npm run build` → `git commit -am \"Build in CI\"` → `git push`", "`nano .github/workflows/ci.yml` → at the bottom add `- run: npm run build` → `git commit -am \"Build in CI\"` → `git push`")],
    par: 3,
    check: (ctx) => {
      const r = latestRun(ctx.state.world);
      if (!r || !greenWithTests(ctx)) return false;
      const kinds = r.jobs[0]?.steps.filter((s) => s.status === "success").map((s) => s.kind) ?? [];
      return kinds.includes("build") && kinds.indexOf("build") > kinds.indexOf("test");
    },
  },
];
