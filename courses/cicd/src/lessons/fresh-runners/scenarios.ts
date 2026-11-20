import { l } from "@lets-explain/core/i18n";
import { apply, type StepKind, type Workflow } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";
import { fresh, ONE_JOB, split } from "./model";

/** The shop with this deploy workflow, pushed once. */
const pushedWith = (w: Workflow) => deskOf(apply(fresh([w]), { type: "push", message: "add reviews" }).state);

const stagingMoved = (ctx: DeskCtx) => {
  const sha = ctx.state.world.envs.staging?.sha;
  return Boolean(sha) && sha !== ctx.start.world.envs.staging?.sha && sha === ctx.state.world.heads.main;
};
/** Artifact events during the scenario. */
const artifacts = (ctx: DeskCtx) => ctx.events.flat().filter((e) => e.type === "artifact");
const downloaded = (ctx: DeskCtx) => artifacts(ctx).some((e) => e.type === "artifact" && e.action === "downloaded");
const has = (steps: { kind: StepKind }[], kind: StepKind) => steps.some((s) => s.kind === kind);

const EMPTY = l(
  "Her job kendi boş makinesinde başlar: önceki job'ın klasörü, `node_modules`'ü ya da `dist/`'i oraya gelmez.",
  "Every job starts on its own empty machine: the previous job's folder, `node_modules` or `dist/` don't come along.",
);

export const scenarios: CiScenario[] = [
  {
    id: "dist-not-found",
    title: l("dist/ kayıp", "dist/ is missing"),
    story: l(
      "Deploy'u ayrı bir job'a ayırdın. `build` job'ı yeşil, ama `deploy` job'ı `./deploy.sh: dist/ not found` diye kırılıyor. Build aynı run'da birkaç saniye önce yapıldı; nereye gitti?",
      "You moved the deploy into a job of its own. The `build` job is green, but the `deploy` job fails with `./deploy.sh: dist/ not found`. The build ran in the same run seconds ago; where did it go?",
    ),
    goal: l("Build'i bir kez yap: `dist/` build job'ından deploy job'ına taşınsın ve staging yeni commit'i çalıştırsın.", "Build only once: `dist/` travels from the build job to the deploy job, and staging runs the new commit."),
    start: pushedWith(split([])),
    hints: [
      EMPTY,
      l("Bir job bir şeyi bırakmalı (`actions/upload-artifact`), diğeri onu almalı (`actions/download-artifact`). İkisinde de aynı `name`.", "One job leaves something behind (`actions/upload-artifact`), the other picks it up (`actions/download-artifact`). The same `name` in both."),
      l(
        "`nano .github/workflows/deploy.yml` → build job'ının sonuna `- uses: actions/upload-artifact@v4` (`with: name: dist`, `path: dist/`); deploy job'ında `./deploy.sh`'in üstüne `- uses: actions/download-artifact@v4` (`with: name: dist`, `path: dist/`) → `git commit -am \"Pass dist as an artifact\"` → `git push`",
        "`nano .github/workflows/deploy.yml` → at the end of the build job `- uses: actions/upload-artifact@v4` (`with: name: dist`, `path: dist/`); in the deploy job, above `./deploy.sh`, `- uses: actions/download-artifact@v4` (`with: name: dist`, `path: dist/`) → `git commit -am \"Pass dist as an artifact\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => stagingMoved(ctx) && downloaded(ctx),
  },
  {
    id: "no-artifacts",
    title: l("Artifact yok", "No artifacts"),
    story: l(
      "Şirketin artifact depolama kotası doldu ve yönetim bu repoda artifact kullanımını şimdilik yasakladı. Deploy job'ı yine `dist/ not found` diye kırılıyor; bu sefer `dist/`'i kendisi üretmek zorunda.",
      "The company ran out of artifact storage, and management has banned artifacts in this repo for now. The deploy job still fails with `dist/ not found`; this time it has to produce `dist/` itself.",
    ),
    goal: l("Hiç artifact **kullanmadan** staging yeni commit'i çalıştırsın.", "Staging runs the new commit **without** using any artifact."),
    start: pushedWith(split([])),
    hints: [
      EMPTY,
      l("Boş bir makinede build için sırayla: kod, Node, bağımlılıklar, sonra build.", "On an empty machine a build needs, in order: the code, Node, the dependencies, then the build."),
      l(
        "`nano .github/workflows/deploy.yml` → deploy job'ında `./deploy.sh`'in üstüne `- uses: actions/checkout@v4`, `- uses: actions/setup-node@v4` (`with: node-version: 22`), `- run: npm ci`, `- run: npm run build` → `git commit -am \"Build in the deploy job\"` → `git push`",
        "`nano .github/workflows/deploy.yml` → in the deploy job, above `./deploy.sh`: `- uses: actions/checkout@v4`, `- uses: actions/setup-node@v4` (`with: node-version: 22`), `- run: npm ci`, `- run: npm run build` → `git commit -am \"Build in the deploy job\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => stagingMoved(ctx) && artifacts(ctx).length === 0,
  },
  {
    id: "no-package-json",
    title: l("package.json yok", "No package.json"),
    story: l(
      "Bora deploy job'ına setup-node, `npm ci` ve build ekledi ama run yine kırmızı: deploy job'ında `npm ci` `Could not read package.json` diyor. Build job'ı aynı komutu sorunsuz çalıştırdı.",
      "Bora added setup-node, `npm ci` and a build to the deploy job, but the run is still red: in the deploy job, `npm ci` says `Could not read package.json`. The build job ran the same command without trouble.",
    ),
    goal: l("Deploy job'ı çalışsın ve staging yeni commit'i çalıştırsın.", "Make the deploy job work, and staging runs the new commit."),
    start: pushedWith(split(["setup-node", "install", "build"])),
    hints: [
      EMPTY,
      l("Build job'ının ilk adımına bak: deploy job'ında o adım yok.", "Look at the build job's first step: the deploy job doesn't have it."),
      l("`nano .github/workflows/deploy.yml` → deploy job'ının ilk adımı olarak `- uses: actions/checkout@v4` → `git commit -am \"Check out in deploy\"` → `git push`", "`nano .github/workflows/deploy.yml` → as the deploy job's first step, `- uses: actions/checkout@v4` → `git commit -am \"Check out in deploy\"` → `git push`"),
    ],
    par: 3,
    check: stagingMoved,
  },
  {
    id: "split-the-job",
    title: l("Deploy ayrı job'a", "Deploy in its own job"),
    story: l(
      "Tek bir job testleri çalıştırıyor, build yapıyor ve deploy ediyor. Ekip, deploy'u ayrı bir job'a taşımak istiyor: testler geçince başlasın, ama build'i baştan yapmasın; build job'ının ürettiği `dist/`'i kullansın.",
      "One job runs the tests, builds and deploys. The team wants the deploy in a job of its own: it starts once the tests pass, but doesn't build again; it uses the `dist/` the build job made.",
    ),
    goal: l("Deploy, build job'ını bekleyen ayrı bir job olsun; build'i tekrar yapmadan `dist/`'i artifact olarak alsın ve staging yeni commit'i çalıştırsın.", "Deploy is a separate job that waits for the build job, takes `dist/` as an artifact without building again, and staging runs the new commit."),
    start: pushedWith(ONE_JOB),
    hints: [
      l("İki job, `needs` ile sıralı. Biri `dist/`'i üretip bırakır, diğeri alır ve deploy eder.", "Two jobs, ordered with `needs`. One makes `dist/` and leaves it, the other picks it up and deploys."),
      l("Build job'ının sonunda `actions/upload-artifact`; deploy job'ında `needs: build`, `actions/download-artifact` ve `./deploy.sh staging`.", "At the end of the build job, `actions/upload-artifact`; in the deploy job, `needs: build`, `actions/download-artifact` and `./deploy.sh staging`."),
      l(
        "`nano .github/workflows/deploy.yml` → `ship:` job'ını `build:` yap, `./deploy.sh` adımı yerine `- uses: actions/upload-artifact@v4` (`name: dist`, `path: dist/`); altına `deploy:` job'ı: `needs: build`, `runs-on: ubuntu-latest`, adımlar `- uses: actions/download-artifact@v4` (`name: dist`, `path: dist/`) ve `- run: ./deploy.sh staging` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy in its own job\"` → `git push`",
        "`nano .github/workflows/deploy.yml` → rename the `ship:` job to `build:`, and replace its `./deploy.sh` step with `- uses: actions/upload-artifact@v4` (`name: dist`, `path: dist/`); below it a `deploy:` job: `needs: build`, `runs-on: ubuntu-latest`, steps `- uses: actions/download-artifact@v4` (`name: dist`, `path: dist/`) and `- run: ./deploy.sh staging` (`env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}`) → `git commit -am \"Deploy in its own job\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state, "Deploy");
      const deploy = wf?.jobs.find((j) => has(j.steps, "deploy"));
      const tests = wf?.jobs.find((j) => has(j.steps, "test"));
      return Boolean(deploy && tests && deploy !== tests && (deploy.needs ?? []).includes(tests.id) && !has(deploy.steps, "build")) && stagingMoved(ctx) && downloaded(ctx);
    },
  },
];
