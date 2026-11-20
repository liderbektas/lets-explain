import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";
import { CI, PROMOTE, REBUILD } from "./workflows";

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);
const promote = (env: string, sha: string): CiAction => ({ type: "dispatch", workflow: PROMOTE.name, inputs: { environment: env, version: sha } });
const rebuild = (env: string): CiAction => ({ type: "dispatch", workflow: REBUILD.name, inputs: { environment: env } });

/** The build-once workflows next to the old rebuild one; v1 everywhere and its image in the registry. */
const shop = (): World => {
  const w = freshWorld({
    workflows: [CI, PROMOTE, REBUILD],
    envs: [
      { name: "staging", sha: SHAS[0]! },
      { name: "production", sha: SHAS[0]! },
    ],
    secrets: { DEPLOY_TOKEN: "dpl_live" },
  });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
};

const GOOD = SHAS[1]!;
const BAD = SHAS[2]!;

const env = (ctx: DeskCtx, name: string) => ctx.state.world.envs[name]?.sha ?? null;
const healthy = (ctx: DeskCtx, sha: string | null) => Boolean(sha) && !commitOf(ctx.state.world, sha!).bugs.includes("crash");
/** Did `sha` run on staging at some point before production got it? */
const stagedFirst = (ctx: DeskCtx, sha: string) => {
  const arrived = ctx.states.findIndex((d) => d.world.envs.production?.sha === sha);
  return arrived >= 0 && ctx.states.slice(0, arrived + 1).some((d) => d.world.envs.staging?.sha === sha);
};

export const FREE = deskOf(shop());

/** GOOD was tested on staging; then BAD (it crashes) landed on main and got its own image. */
const testedThenMoved = play(shop(), [{ type: "push", message: "new checkout page" }, promote("staging", GOOD), { type: "push", add: ["crash"], message: "add coupons" }]);

/** GOOD was built and nothing has moved yet. */
const freshImage = play(shop(), [{ type: "push", message: "new checkout page" }]);

/** GOOD went everywhere; then someone rebuilt main (BAD) straight onto production. */
const badOnProd = play(shop(), [
  { type: "push", message: "new checkout page" },
  promote("staging", GOOD),
  promote("production", GOOD),
  { type: "push", add: ["crash"], message: "refactor prices" },
  rebuild("production"),
]);

export const scenarios: CiScenario[] = [
  {
    id: "ship-what-was-tested",
    title: l("Test edileni gönder", "Ship what was tested"),
    story: l(
      `Testçiler staging'deki \`${GOOD}\`'i bütün gün denedi ve onay verdi. Bu arada \`main\` ilerledi: \`${BAD}\` geldi, CI onun image'ını da üretti ama o daha kimsenin test etmediği bir commit. Şimdi production'a çıkma zamanı.`,
      `The testers tried \`${GOOD}\` on staging all day and gave the go-ahead. Meanwhile \`main\` moved on: \`${BAD}\` landed and CI built its image too, but nobody has tested that commit. Now it's time for production.`,
    ),
    goal: l(`Production, staging'de test edilen image'ı (\`${GOOD}\`) çalıştırsın.`, `Production runs the image that was tested on staging (\`${GOOD}\`).`),
    start: deskOf(testedThenMoved),
    hints: [
      l("`main`'in son hali test edilen şey değil. Production'a staging'de duran image gider.", "`main`'s newest commit is not what was tested. Production gets the image that is on staging."),
      l("`promote.yml` elle başlatılır ve iki input alır: `environment` ve `version` (commit).", "`promote.yml` is started by hand and takes two inputs: `environment` and `version` (the commit)."),
      l(`\`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``, `\`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``),
    ],
    par: 1,
    check: (ctx) => env(ctx, "production") === GOOD && healthy(ctx, GOOD),
  },
  {
    id: "staging-first",
    title: l("Önce staging", "Staging first"),
    story: l(
      `Yeni ödeme sayfası (\`${GOOD}\`) \`main\`'e girdi ve CI image'ını registry'e koydu. Henüz hiçbir ortamda değil. Ekibin kuralı: hiçbir şey staging'de çalışmadan production'a çıkmaz.`,
      `The new checkout page (\`${GOOD}\`) is on \`main\` and CI put its image in the registry. It isn't on any environment yet. The team's rule: nothing reaches production without running on staging first.`,
    ),
    goal: l(`\`${GOOD}\` önce staging'e, sonra **aynı image** production'a çıksın.`, `\`${GOOD}\` goes to staging first, then **the same image** to production.`),
    start: deskOf(freshImage),
    hints: [
      l("Aynı workflow'u iki kez başlatacaksın; değişen sadece `environment` input'u.", "You'll start the same workflow twice; only the `environment` input changes."),
      l("`gh workflow run promote.yml -f environment=staging -f version=…`, sonra aynısı `production` için.", "`gh workflow run promote.yml -f environment=staging -f version=…`, then the same for `production`."),
      l(
        `\`gh workflow run promote.yml -f environment=staging -f version=${GOOD}\` → \`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``,
        `\`gh workflow run promote.yml -f environment=staging -f version=${GOOD}\` → \`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``,
      ),
    ],
    par: 2,
    check: (ctx) => env(ctx, "production") === GOOD && stagedFirst(ctx, GOOD),
  },
  {
    id: "roll-back",
    title: l("Geri dön", "Roll back"),
    story: l(
      `Biri eski "main'den yeniden build" workflow'unu kullanıp \`main\`'i doğrudan production'a kurdu. Production o andan beri 500 veriyor: \`${BAD}\` hiç test edilmemişti. Bir önceki sağlam image (\`${GOOD}\`) registry'de duruyor.`,
      `Someone used the old "rebuild from main" workflow and put \`main\` straight onto production. Production has answered 500 ever since: \`${BAD}\` was never tested. The previous healthy image (\`${GOOD}\`) is still in the registry.`,
    ),
    goal: l(`Production yeniden \`${GOOD}\` image'ını çalıştırsın; hiçbir şey yeniden build edilmesin.`, `Production runs the \`${GOOD}\` image again, and nothing is rebuilt.`),
    start: deskOf(badOnProd),
    hints: [
      l("Geri dönmek de bir promote'tur: registry'deki eski image'ı production'a koyarsın.", "Rolling back is a promote too: you put the old image from the registry onto production."),
      l("Yeniden build `main`'i, yani bozuk commit'i tekrar kurar. `promote.yml`'ı eski commit'le başlat.", "A rebuild installs `main` again, the broken commit. Start `promote.yml` with the old commit."),
      l(`\`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``, `\`gh workflow run promote.yml -f environment=production -f version=${GOOD}\``),
    ],
    par: 1,
    check: (ctx) => env(ctx, "production") === GOOD && Object.keys(ctx.state.world.registry).join() === Object.keys(ctx.start.world.registry).join(),
  },
  {
    id: "retire-rebuild",
    title: l("Eski yolu kapat", "Close the old road"),
    story: l(
      "Production'ı bozan, test edilmemiş kodu doğrudan kuran \"Deploy (rebuild)\" workflow'u hâlâ duruyor ve elle başlatılabiliyor. Ekip onu kaldırmaya karar verdi; image üreten CI ve onları taşıyan Promote kalacak.",
      "The \"Deploy (rebuild)\" workflow, the one that put untested code straight onto production, is still there and can still be started by hand. The team decided to remove it; CI (which builds the images) and Promote (which moves them) stay.",
    ),
    goal: l("GitHub'da \"Deploy (rebuild)\" workflow'u olmasın; CI ve Promote kalsın.", "GitHub has no \"Deploy (rebuild)\" workflow any more; CI and Promote stay."),
    start: deskOf(testedThenMoved),
    hints: [
      l("Bir workflow, dosyası `.github/workflows/`'tan silinip bu silme push'lanınca kalkar. `ls .github/workflows` dosyaları gösterir.", "A workflow goes away when its file is deleted from `.github/workflows/` and that deletion is pushed. `ls .github/workflows` shows the files."),
      l("`rm` ile `deploy-rebuild.yml`'ı sil, `git commit -am` silmeyi de kaydeder, sonra push.", "Delete `deploy-rebuild.yml` with `rm`; `git commit -am` records the deletion too; then push."),
      l(
        "`rm .github/workflows/deploy-rebuild.yml` → `git commit -am \"Remove the rebuild workflow\"` → `git push`",
        "`rm .github/workflows/deploy-rebuild.yml` → `git commit -am \"Remove the rebuild workflow\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => !liveWorkflow(ctx.state, REBUILD.name) && Boolean(liveWorkflow(ctx.state, CI.name)) && Boolean(liveWorkflow(ctx.state, PROMOTE.name)),
  },
];
