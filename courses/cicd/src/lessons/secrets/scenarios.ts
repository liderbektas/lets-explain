import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type CiAction, type World } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { readWorkflow } from "../../engine/readYaml";
import { liveWorkflow, wouldStart, type CiScenario, type DeskCtx } from "../shared/ci";
import { LEAKED, relWf } from "./workflow";

/** The token in the reader's password manager (the lesson's), and the one made after a leak. */
export const TOKEN = "npm_8f2kQx7Lr0aW3mZt9";
export const NEW_TOKEN = "npm_R7vLq2Xw9TzK4mPa1c";

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);
const release: CiAction = { type: "push", message: "release 1.4.0" };

/** Runs started during the scenario. */
const fresh = (ctx: DeskCtx) => ctx.state.world.runs.slice(ctx.start.world.runs.length);
/** A run of ours (not a fork's) that got through `npm publish`. */
const published = (ctx: DeskCtx) => fresh(ctx).some((r) => !r.fork && r.jobs.some((j) => j.steps.some((s) => s.kind === "publish" && s.status === "success")));
/** Any file GitHub has, on any branch, with something shaped like an npm token in it. */
const leaked = (ctx: DeskCtx) => Object.values(ctx.state.remote).some((tree) => Object.values(tree).some((text) => /npm_[A-Za-z0-9]{16,}/.test(text)));
const publishStep = (ctx: DeskCtx) => liveWorkflow(ctx.state, "Release")?.jobs.find((j) => j.id === "publish")?.steps.find((s) => s.kind === "publish");

const leakedWorkflow = (() => {
  const r = readWorkflow(LEAKED, ".github/workflows/release.yml");
  if (!r.ok) throw new Error("the leaked workflow should read");
  return r.workflow;
})();

/** Free play: no token yet, publishing on every event, and a fork's PR is open. */
export const FREE = deskOf(
  play(freshWorld({ workflows: [relWf(false)] }), [
    { type: "push", branch: "contrib", message: "fix a typo in the cart page" },
    { type: "openPr", branch: "contrib", fork: true },
  ]),
);

export const scenarios: CiScenario[] = [
  {
    id: "first-release",
    title: l("İlk sürüm", "The first release"),
    story: l(
      `İlk sürümü yayınlamak için \`main\`'e push'ladın ama run kırmızı: \`npm error code ENEEDAUTH\`. Workflow \`secrets.NPM_TOKEN\` bekliyor, ama repoda öyle bir secret yok. npm token'ın parola yöneticinde: \`${TOKEN}\`.`,
      `You pushed to \`main\` to publish the first release, but the run is red: \`npm error code ENEEDAUTH\`. The workflow expects \`secrets.NPM_TOKEN\`, but the repo has no such secret. Your npm token is in your password manager: \`${TOKEN}\`.`,
    ),
    goal: l("Paket npm'e yayınlansın; token hiçbir dosyaya yazılmasın.", "The package is published to npm, and the token is written into no file."),
    start: deskOf(play(freshWorld({ workflows: [relWf(true)] }), [release])),
    hints: [
      l("Token dosyaya değil, repo'nun secret'larına girer. Workflow onu `secrets.NPM_TOKEN` diye zaten okuyor.", "The token goes into the repo's secrets, not into a file. The workflow already reads it as `secrets.NPM_TOKEN`."),
      l("`gh secret set NPM_TOKEN` değeri sorar (komut geçmişine düşmez). Sonra kırmızı run'ı yeniden çalıştır: `gh run rerun`.", "`gh secret set NPM_TOKEN` asks for the value (it stays out of your shell history). Then run the red run again: `gh run rerun`."),
      l(`\`gh secret set NPM_TOKEN\` → \`${TOKEN}\` yapıştır → \`gh run rerun\``, `\`gh secret set NPM_TOKEN\` → paste \`${TOKEN}\` → \`gh run rerun\``),
    ],
    par: 2,
    check: (ctx) => published(ctx) && !leaked(ctx),
  },
  {
    id: "leaked-token",
    title: l("Sızan token", "The leaked token"),
    story: l(
      `GitHub'ın secret taraması mail attı: npm token'ı \`.github/workflows/release.yml\` içinde açıkça yazıyor. Token git geçmişinde de duruyor, o yüzden npmjs.com'da eskisini iptal edip yenisini oluşturdun: \`${NEW_TOKEN}\`. Şimdi yenisini secret'a koyup dosyadan token'ı çıkaracaksın.`,
      `GitHub's secret scanning sent an email: the npm token is written in plain text in \`.github/workflows/release.yml\`. It's in the git history too, so you revoked the old one on npmjs.com and made a new one: \`${NEW_TOKEN}\`. Now you'll put the new one in a secret and take the token out of the file.`,
    ),
    goal: l("GitHub'daki workflow'da hiç token yazmasın, `secrets.NPM_TOKEN`'ı okusun, secret yeni token olsun ve bir push paketi yayınlasın.", "The workflow on GitHub has no token written in it and reads `secrets.NPM_TOKEN`, the secret is the new token, and a push publishes the package."),
    start: deskOf(play(freshWorld({ workflows: [leakedWorkflow] }), [release])),
    hints: [
      l("İki yer değişecek: repo'nun secret'ı (yeni token) ve workflow'daki `NODE_AUTH_TOKEN` satırı.", "Two places change: the repo's secret (the new token) and the `NODE_AUTH_TOKEN` line in the workflow."),
      l("`gh secret set NPM_TOKEN` ile yeni token'ı ver. Dosyada token yerine `${{ secrets.NPM_TOKEN }}` yaz, commit'le, push'la.", "Give the new token with `gh secret set NPM_TOKEN`. In the file, write `${{ secrets.NPM_TOKEN }}` instead of the token, then commit and push."),
      l(
        `\`gh secret set NPM_TOKEN --body ${NEW_TOKEN}\` → \`nano .github/workflows/release.yml\` (\`NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\`) → \`git commit -am "Read the npm token from a secret"\` → \`git push\``,
        `\`gh secret set NPM_TOKEN --body ${NEW_TOKEN}\` → \`nano .github/workflows/release.yml\` (\`NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}\`) → \`git commit -am "Read the npm token from a secret"\` → \`git push\``,
      ),
    ],
    par: 4,
    check: (ctx) => {
      const step = publishStep(ctx);
      return Boolean(step) && step!.with?.token === undefined && step!.with?.secret === undefined && ctx.state.world.secrets.NPM_TOKEN === NEW_TOKEN && !leaked(ctx) && published(ctx);
    },
  },
  {
    id: "fork-pr",
    title: l("Fork'un PR'ı kırmızı", "The fork's PR is red"),
    story: l(
      "Dışarıdan biri sepet sayfasındaki bir yazım hatasını düzelten bir PR açtı. PR kırmızı: `publish` job'ı PR'da da çalışıyor ve fork'tan gelen run'lar secret alamadığı için `npm publish` düşüyor. Katkıcının yapabileceği bir şey yok; düzeltme senin workflow'unda.",
      "Someone from outside opened a PR that fixes a typo on the cart page. The PR is red: the `publish` job runs on PRs too, and since runs from a fork get no secrets, `npm publish` fails. The contributor can't do anything about it; the fix is in your workflow.",
    ),
    goal: l("PR'larda testler çalışmaya devam etsin ama yayınlama sadece `main`'e push'ta olsun; `main`'e bir push paketi yayınlasın.", "Tests still run on PRs, but publishing happens only on pushes to `main`; a push to `main` publishes the package."),
    start: deskOf(
      play(freshWorld({ workflows: [relWf(false)], secrets: { NPM_TOKEN: TOKEN } }), [
        { type: "push", branch: "contrib", message: "fix a typo in the cart page" },
        { type: "openPr", branch: "contrib", fork: true },
      ]),
    ),
    hints: [
      l("Secret'ı fork'a vermek çözüm değil (GitHub da vermez). Yayınlamayı PR'larda hiç denememek gerek.", "Giving the fork the secret is no answer (GitHub won't either). Publishing must not be tried on PRs at all."),
      l("`publish:` job'ına olay adına bakan bir `if:` koy: `github.event_name == 'push'`.", "Put an `if:` on the `publish:` job that looks at the event name: `github.event_name == 'push'`."),
      l(
        "`nano .github/workflows/release.yml` → `publish:` altına `    if: github.event_name == 'push'` → `git commit -am \"Publish only on push\"` → `git push`",
        "`nano .github/workflows/release.yml` → under `publish:` add `    if: github.event_name == 'push'` → `git commit -am \"Publish only on push\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state, "Release");
      const job = wf?.jobs.find((j) => j.id === "publish");
      const guarded = (c?: string) => c === "push" || c === "main";
      const onlyPush = guarded(job?.if) || guarded(job?.steps.find((s) => s.kind === "publish")?.if);
      return onlyPush && wouldStart(wf, "pull_request", "main", ["src/cart.ts"]) && published(ctx);
    },
  },
  {
    id: "team-secret",
    title: l("Ekibin secret'ı", "The team's secret"),
    story: l(
      "Platform ekibi npm token'ını repoya `NPM_PUBLISH_TOKEN` adıyla koymuş; değerini sen göremezsin ve kopyalaman da istenmiyor. Senin workflow'un ise `secrets.NPM_TOKEN`'ı okuyor, o yüzden son sürüm `ENEEDAUTH` ile düştü.",
      "The platform team put the npm token in the repo as `NPM_PUBLISH_TOKEN`; you can't see its value and you're not supposed to copy it. Your workflow reads `secrets.NPM_TOKEN`, so the last release failed with `ENEEDAUTH`.",
    ),
    goal: l("Yayınlama ekibin `NPM_PUBLISH_TOKEN` secret'ıyla çalışsın; yeni bir secret oluşturulmasın.", "Publishing works with the team's `NPM_PUBLISH_TOKEN` secret, and no new secret is created."),
    start: deskOf(play(freshWorld({ workflows: [relWf(true)], secrets: { NPM_PUBLISH_TOKEN: TOKEN } }), [release])),
    hints: [
      l("`gh secret list` hangi secret'ların olduğunu söyler; değerlerini asla göstermez. Workflow'un hangisini okuduğuna bak.", "`gh secret list` tells you which secrets exist; it never shows their values. Look at which one the workflow reads."),
      l("Değeri kopyalamak yerine workflow'da secret'ın adını değiştir: `NODE_AUTH_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}`.", "Instead of copying the value, change the secret's name in the workflow: `NODE_AUTH_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}`."),
      l(
        "`nano .github/workflows/release.yml` → `NODE_AUTH_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}` → `git commit -am \"Use the team's npm secret\"` → `git push`",
        "`nano .github/workflows/release.yml` → `NODE_AUTH_TOKEN: ${{ secrets.NPM_PUBLISH_TOKEN }}` → `git commit -am \"Use the team's npm secret\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) =>
      published(ctx) &&
      publishStep(ctx)?.with?.secret === "NPM_PUBLISH_TOKEN" &&
      Object.keys(ctx.state.world.secrets).sort().join() === Object.keys(ctx.start.world.secrets).sort().join(),
  },
];
