import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import type { CiScenario, DeskCtx } from "../shared/ci";
import { DEPLOY, freshStart } from "./workflow";

const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");
const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);

const GOOD = SHAS[1]!;
/** Two deploys: "search filters" (good), then "new cart", which answers 500 in production. */
const BROKEN: CiAction[] = [
  { type: "push", message: "search filters" },
  { type: "push", add: ["crash"], message: "new cart" },
];

const PROD_DOWN = deskOf(play(freshStart(), BROKEN));

/** Production is down and Bora's fix is waiting in PR #1. */
const FIX_IN_PR = deskOf(
  play(freshStart(), [...BROKEN, { type: "push", branch: "fix-cart", fix: ["crash"], message: "fix the cart crash" }, { type: "openPr", branch: "fix-cart" }]),
);

/** Production is down, and a retention policy has already deleted the good image from the registry. */
const IMAGE_GONE = (() => {
  const w = play(freshStart(), BROKEN);
  const registry = { ...w.registry };
  delete registry[`sha-${GOOD}`];
  return deskOf({ ...w, registry });
})();

/** Production is down and there is no redeploy workflow at all, only the deploy on push. */
const NO_BUTTON = deskOf(
  play({ ...freshWorld({ workflows: [DEPLOY], envs: [{ name: "production", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } }), registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } }, BROKEN),
);

const prod = (ctx: DeskCtx) => ctx.state.world.envs.production?.sha;

export const scenarios: CiScenario[] = [
  {
    id: "prod-down",
    title: l("Production çöktü", "Production is down"),
    story: l(
      "Saat 14:05: \"new cart\" production'a çıktı ve ödeme sayfası 500 veriyor. Düzeltme en az bir saat sürer. Bir önceki sürüm (\"search filters\") sağlamdı ve image'ı registry'de duruyor.",
      "14:05: \"new cart\" reached production and the checkout page answers 500. A fix will take at least an hour. The previous version (\"search filters\") was healthy, and its image is still in the registry.",
    ),
    goal: l(
      "Production bir önceki sağlam sürümü (\"search filters\") çalıştırsın; düzeltmeyi beklemeden, main'e dokunmadan.",
      "Production runs the previous healthy version (\"search filters\") without waiting for a fix and without touching main.",
    ),
    start: PROD_DOWN,
    hints: [
      l("Geri almak yeni bir build değil: sağlam image'ı yeniden deploy etmek. Hangi SHA olduğunu son başarılı deploy'lar söyler.", "Rolling back is not a new build: it's redeploying the good image. The latest successful deploys tell you which SHA."),
      l(
        "`gh run list --workflow deploy.yml` SHA'ları gösterir. Repoda elle çalıştırılan bir `redeploy.yml` var; sürümü `-f version=` ile alır.",
        "`gh run list --workflow deploy.yml` shows the SHAs. The repo has `redeploy.yml`, started by hand; it takes the version with `-f version=`.",
      ),
      l(`\`gh workflow run redeploy.yml -f version=${GOOD}\``, `\`gh workflow run redeploy.yml -f version=${GOOD}\``),
    ],
    par: 1,
    check: (ctx) => prod(ctx) === GOOD && crashed(ctx.state.world, ctx.state.world.heads.main),
  },
  {
    id: "then-fix",
    title: l("Önce geri al, sonra düzelt", "Roll back, then fix"),
    story: l(
      "Production yine yanıyor. Bora düzeltmeyi hazırlamış, PR #1 açık. Ekibin kuralı net: önce kullanıcıları kurtar, düzeltmeyi sonra normal yoldan gönder.",
      "Production is burning again. Bora has prepared a fix, and PR #1 is open. The team's rule is clear: rescue the users first, then send the fix the normal way.",
    ),
    goal: l(
      "Önce production sağlam sürüme dönsün; sonra düzeltme main'e girsin ve production main'in en yeni halini sağlıklı çalıştırsın.",
      "First production goes back to the healthy version; then the fix lands on main and production runs main's newest commit, healthy.",
    ),
    start: FIX_IN_PR,
    hints: [
      l("İki ayrı iş var ve sıraları önemli: kanamayı durdur, sonra düzelt.", "There are two jobs and their order matters: stop the bleeding, then fix."),
      l("Geri almak `gh workflow run redeploy.yml -f version=…`; düzeltmeyi main'e `gh pr merge` getirir ve main'e gelen her şey production'a gider.", "Rolling back is `gh workflow run redeploy.yml -f version=…`; `gh pr merge` brings the fix to main, and everything on main goes to production."),
      l(`\`gh workflow run redeploy.yml -f version=${GOOD}\` → \`gh pr merge 1\``, `\`gh workflow run redeploy.yml -f version=${GOOD}\` → \`gh pr merge 1\``),
    ],
    par: 2,
    check: (ctx) => {
      const w = ctx.state.world;
      const rescuedFirst = ctx.states.some((d) => {
        const x = d.world;
        return x.envs.production?.sha && !crashed(x, x.envs.production.sha) && crashed(x, x.heads.main);
      });
      return rescuedFirst && prod(ctx) === w.heads.main && !crashed(w, w.heads.main);
    },
  },
  {
    id: "image-gone",
    title: l("Image gitmiş", "The image is gone"),
    story: l(
      "Production çöktü, sen de hemen `redeploy.yml`'yi çalıştırdın ama run kırmızı: \"image not found\". Registry'nin saklama kuralı eski image'ları silmiş. Neyse ki o sürümü deploy eden run duruyor.",
      "Production is down, and you ran `redeploy.yml` right away, but the run is red: \"image not found\". The registry's retention rule deleted old images. Luckily the run that deployed that version is still there.",
    ),
    goal: l("Production yine \"search filters\" sürümünü çalıştırsın.", "Production runs the \"search filters\" version again."),
    start: IMAGE_GONE,
    hints: [
      l("Image yoksa yeniden üretilmesi gerek. O sürümü bir zamanlar build edip deploy eden run, aynı commit'te tekrar çalıştırılabilir.", "If the image is gone, it has to be built again. The run that once built and deployed that version can run again on the same commit."),
      l("`gh run list --workflow deploy.yml` eski run'ı ve ID'sini gösterir; `gh run rerun <id>` onu aynı commit'te yeniden çalıştırır.", "`gh run list --workflow deploy.yml` shows the old run and its ID; `gh run rerun <id>` runs it again on the same commit."),
      l("`gh run rerun 1`", "`gh run rerun 1`"),
    ],
    par: 1,
    check: (ctx) => prod(ctx) === GOOD,
  },
  {
    id: "add-button",
    title: l("Geri alma düğmesi", "A rollback button"),
    story: l(
      "Bu repoda sadece main'e push'ta çalışan bir `deploy.yml` var; production'ı belirli bir sürüme döndürmenin yolu yok. Production şu an 500 veriyor ve \"search filters\" sürümünün image'ı registry'de.",
      "This repo has only a `deploy.yml` that runs on pushes to main; there is no way to put production on a chosen version. Production answers 500 right now, and the image of the \"search filters\" version is in the registry.",
    ),
    goal: l(
      "Elle çalıştırılan, sürümü girdi olarak alan bir `redeploy.yml` yaz ve onunla production'ı \"search filters\" sürümüne döndür.",
      "Write a `redeploy.yml` that runs by hand and takes the version as an input, and use it to put production back on \"search filters\".",
    ),
    start: NO_BUTTON,
    hints: [
      l("Elle çalışan bir workflow `workflow_dispatch:` ile başlar; `inputs:` altında bir `version` girdisi olsun. Deploy adımı `deploy.yml`'deki gibi, image etiketi yerine girdiyle.", "A workflow you run by hand starts with `workflow_dispatch:`; give it a `version` input under `inputs:`. The deploy step is like the one in `deploy.yml`, with the input instead of the image tag."),
      l(
        "Job: `runs-on: ubuntu-latest`, `environment: production`, adım `run: ./deploy.sh production ${{ inputs.version }}`. Yeni dosya `git add` ister. GitHub'a ulaştıktan sonra `gh workflow run`.",
        "Job: `runs-on: ubuntu-latest`, `environment: production`, step `run: ./deploy.sh production ${{ inputs.version }}`. A new file needs `git add`. Once it is on GitHub, `gh workflow run`.",
      ),
      l(
        `\`nano .github/workflows/redeploy.yml\` → yukarıdaki workflow → \`git add .\` → \`git commit -m "Redeploy workflow"\` → \`git push\` → \`gh workflow run redeploy.yml -f version=${GOOD}\``,
        `\`nano .github/workflows/redeploy.yml\` → the workflow above → \`git add .\` → \`git commit -m "Redeploy workflow"\` → \`git push\` → \`gh workflow run redeploy.yml -f version=${GOOD}\``,
      ),
    ],
    par: 5,
    check: (ctx) => prod(ctx) === GOOD && ctx.state.world.runs.some((r) => r.event === "dispatch"),
  },
];
