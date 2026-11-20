import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type CiEvent, type JobDef, type Run, type Workflow } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { BUILD, PREP, step } from "../../engine/presets";
import type { CiScenario, DeskCtx } from "../shared/ci";

const UPLOAD = step("upload");
const DOWNLOAD = step("download");
const DEPLOY = step("deploy");
const ON = { push: { branches: ["main"] } };

const build = (...extra: JobDef["steps"]): JobDef => ({ id: "build", steps: [...PREP, ...extra] });

/** deploy has only the deploy step: `dist/` never reaches it. */
const NO_BRIDGE: Workflow = { name: "CI", on: ON, jobs: [build(BUILD), { id: "deploy", needs: ["build"], steps: [DEPLOY] }] };
/** deploy downloads `dist`, but the build job never uploads it. */
const NO_UPLOAD: Workflow = { name: "CI", on: ON, jobs: [build(BUILD), { id: "deploy", needs: ["build"], steps: [DOWNLOAD, DEPLOY] }] };
/** The upload step sits before the build: there is no `dist/` yet. */
const TOO_EARLY: Workflow = { name: "CI", on: ON, jobs: [build(UPLOAD, BUILD), { id: "deploy", needs: ["build"], steps: [DOWNLOAD, DEPLOY] }] };
/** build, e2e and deploy each build the site again. */
const THREE_BUILDS: Workflow = {
  name: "CI",
  on: ON,
  jobs: [build(BUILD), { id: "e2e", needs: ["build"], steps: [...PREP, BUILD, step("e2e")] }, { id: "deploy", needs: ["e2e"], steps: [...PREP, BUILD, DEPLOY] }],
};

/** main after one push with this workflow; staging runs the first commit, the deploy token is set. */
function shop(wf: Workflow): Desk {
  const w = freshWorld({ workflows: [wf], secrets: { DEPLOY_TOKEN: "dpl_8f2c" }, envs: [{ name: "staging", sha: "3f2a1c9" }] });
  return deskOf(apply(w, { type: "push", paths: ["src/cart.ts"], message: "cart: add VAT" }).state);
}

const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const deployedRuns = (ctx: DeskCtx) => ctx.events.flat().filter((e): e is Extract<CiEvent, { type: "deployed" }> => e.type === "deployed").map((e) => e.run);
const builds = (r: Run) => r.jobs.reduce((n, j) => n + j.steps.filter((s) => s.kind === "build" && s.status === "success").length, 0);
/** A run of the scenario that put a build on staging, built exactly once. */
const shippedOnce = (ctx: DeskCtx, extra: (r: Run) => boolean = () => true) => {
  const ids = deployedRuns(ctx);
  return fresh(ctx).some((r) => ids.includes(r.id) && builds(r) === 1 && extra(r));
};

const UPLOAD_YAML = l(
  "build job'ının sonuna: `- uses: actions/upload-artifact@v4` · `with:` · `name: dist` · `path: dist/`",
  "At the end of the build job: `- uses: actions/upload-artifact@v4` · `with:` · `name: dist` · `path: dist/`",
);
const DOWNLOAD_YAML = l(
  "deploy job'ının başına: `- uses: actions/download-artifact@v4` · `with:` · `name: dist` · `path: dist/`",
  "At the start of the deploy job: `- uses: actions/download-artifact@v4` · `with:` · `name: dist` · `path: dist/`",
);

export const scenarios: CiScenario[] = [
  {
    id: "bridge",
    title: l("Köprü yok", "No bridge"),
    story: l(
      "Workflow ikiye bölündü: `build` job'ı siteyi derliyor, `deploy` job'ı staging'e yüklüyor. İlk run'da deploy `dist/ not found` diye kırıldı. Ekipten biri \"deploy'da da build etsek olur\" diyor ama ekip, test edilen build'in yayına giden build olmasını istiyor.",
      "The workflow was split in two: the `build` job builds the site, the `deploy` job ships it to staging. On the first run, deploy failed with `dist/ not found`. Someone suggests \"just build again in deploy\", but the team wants the build that was tested to be the one that ships.",
    ),
    goal: l("Yeni bir commit staging'e gitsin ve o run'da `npm run build` **sadece bir kez** çalışsın.", "Get a new commit onto staging, with `npm run build` running **only once** in that run."),
    start: shop(NO_BRIDGE),
    hints: [
      l("Her job boş bir makinede başlar; `needs` sırayı verir ama dosya taşımaz. Aynı run'daki job'lar arasında dosya taşımanın yolu artifact.", "Every job starts on an empty machine; `needs` sets the order but carries no files. Between jobs of the same run, files travel as an artifact."),
      l(`${UPLOAD_YAML.tr}. ${DOWNLOAD_YAML.tr}.`, `${UPLOAD_YAML.en}. ${DOWNLOAD_YAML.en}.`),
      l(
        "`nano .github/workflows/ci.yml` → build'in sonuna `upload-artifact`, deploy'un başına `download-artifact` → `git commit -am \"ci: pass dist/ to deploy\"` → `git push`",
        "`nano .github/workflows/ci.yml` → `upload-artifact` at the end of build, `download-artifact` at the start of deploy → `git commit -am \"ci: pass dist/ to deploy\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => shippedOnce(ctx),
  },
  {
    id: "not-found",
    title: l("Artifact bulunamadı", "Artifact not found"),
    story: l(
      "Dün biri `deploy` job'ına `download-artifact` ekledi ve gitti. Bu sabah deploy `Artifact not found for name: dist` ile kırmızı.",
      "Yesterday someone added `download-artifact` to the `deploy` job and went home. This morning deploy is red with `Artifact not found for name: dist`.",
    ),
    goal: l("Staging'e yeniden deploy edilsin, run'da tek bir build olsun.", "Get staging deployed again, with a single build in the run."),
    start: shop(NO_UPLOAD),
    hints: [
      l("`gh run view --log-failed`: indirilecek bir şey yoksa download-artifact ne der? `dist`'i kim yüklüyor?", "`gh run view --log-failed`: what does download-artifact say when there is nothing to download? Who uploads `dist`?"),
      UPLOAD_YAML,
      l(
        "`nano .github/workflows/ci.yml` → build job'ının sonuna `upload-artifact` (`name: dist`, `path: dist/`) → `git commit -am \"ci: upload dist\"` → `git push`",
        "`nano .github/workflows/ci.yml` → `upload-artifact` (`name: dist`, `path: dist/`) at the end of the build job → `git commit -am \"ci: upload dist\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => shippedOnce(ctx),
  },
  {
    id: "too-early",
    title: l("Erken yükleme", "Uploaded too early"),
    story: l(
      "Artifact adımları eklenmiş ama run kırmızı: build job'ı `No files were found with the provided path: dist/` diyor. Oysa `npm run build` aynı job'da ve sorunsuz çalışıyor.",
      "The artifact steps are there, but the run is red: the build job says `No files were found with the provided path: dist/`. Yet `npm run build` is in the same job and works fine.",
    ),
    goal: l("Staging'e deploy edilsin, run'da tek bir build olsun.", "Get staging deployed, with a single build in the run."),
    start: shop(TOO_EARLY),
    hints: [
      l("Adımlar yukarıdan aşağıya sırayla çalışır. Upload adımı çalıştığında `dist/` var mıydı?", "Steps run top to bottom. Did `dist/` exist when the upload step ran?"),
      l("`upload-artifact` adımını `npm run build`'in **altına** taşı.", "Move the `upload-artifact` step **below** `npm run build`."),
      l(
        "`nano .github/workflows/ci.yml` → upload adımını `- run: npm run build`'in altına taşı → `git commit -am \"ci: upload after the build\"` → `git push`",
        "`nano .github/workflows/ci.yml` → move the upload step below `- run: npm run build` → `git commit -am \"ci: upload after the build\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => shippedOnce(ctx),
  },
  {
    id: "test-what-ships",
    title: l("Test edilen yayına gitsin", "Ship what was tested"),
    story: l(
      "CI'da üç job var: `build`, ona bağlı `e2e`, ona bağlı `deploy`. Üçü de siteyi ayrı ayrı derliyor. Bu hem dakika yakıyor hem de e2e'nin test ettiği build ile yayına giden build'in aynı olduğunu garanti etmiyor.",
      "CI has three jobs: `build`, `e2e` after it, and `deploy` after that. All three build the site on their own. That burns minutes, and nothing guarantees the build e2e tested is the build that ships.",
    ),
    goal: l(
      "Bir run'da e2e geçsin ve staging'e deploy edilsin, ama `npm run build` tüm run'da **bir kez** çalışsın.",
      "Get a run where e2e passes and staging is deployed, with `npm run build` running **once** in the whole run.",
    ),
    start: shop(THREE_BUILDS),
    hints: [
      l("Build bir kez yapılsın, `dist/` artifact olsun, e2e ve deploy aynı `dist/`'i indirsin.", "Build once, make `dist/` an artifact, and have e2e and deploy download the same `dist/`."),
      l(
        "build'in sonuna `upload-artifact`. e2e'de `npm run build` yerine `download-artifact` (e2e paketlere hâlâ ihtiyaç duyar: `npm ci` kalsın). deploy'da checkout, setup-node, `npm ci` ve build yerine sadece `download-artifact`.",
        "`upload-artifact` at the end of build. In e2e, `download-artifact` instead of `npm run build` (e2e still needs the packages: keep `npm ci`). In deploy, just `download-artifact` instead of checkout, setup-node, `npm ci` and the build.",
      ),
      l(
        "`nano .github/workflows/ci.yml` → yukarıdaki üç değişiklik → `git commit -am \"ci: build once, test and ship the same dist/\"` → `git push`",
        "`nano .github/workflows/ci.yml` → the three changes above → `git commit -am \"ci: build once, test and ship the same dist/\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => shippedOnce(ctx, (r) => r.jobs.some((j) => j.id === "e2e" && j.status === "success")),
  },
];
