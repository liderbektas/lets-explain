import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, SHAS, type Bug, type CiAction, type Workflow, type World } from "../../engine/ci";
import { applyDesk, deskOf, type Desk, type DeskAction } from "../../engine/desk";
import { liveWorkflow, wouldStart, type CiScenario, type DeskCtx } from "../shared/ci";
import { condWf, type Opts } from "./workflow";

const NAME = "CI/CD";
const SRC = ["src/app.ts"];

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);
const run = (d: Desk, actions: DeskAction[]) => actions.reduce((x, a) => applyDesk(x, a).state, d);

/** The shop with the CI/CD workflow, a staging environment on the first commit and a deploy token. */
const world = (wf: Workflow, bugs: Bug[] = []) =>
  freshWorld({ workflows: [wf], bugs, secrets: { DEPLOY_TOKEN: "dt_x" }, envs: [{ name: "staging", sha: SHAS[0]! }] });

/** The same workflow, but the build summary is written only when everything before it passed. */
const quietSummary = (o: Opts): Workflow => {
  const wf = condWf(o);
  return { ...wf, jobs: wf.jobs.map((j) => (j.id === "build" ? { ...j, steps: j.steps.map((s) => (s.kind === "summary" ? { ...s, if: undefined } : s)) } : j)) };
};

const live = (ctx: DeskCtx) => liveWorkflow(ctx.state, NAME);
const job = (ctx: DeskCtx, id: string) => live(ctx)?.jobs.find((j) => j.id === id);
/** Runs started during the scenario. */
const fresh = (ctx: DeskCtx) => ctx.state.world.runs.slice(ctx.start.world.runs.length);
const stagingCommit = (ctx: DeskCtx) => {
  const sha = ctx.state.world.envs.staging?.sha;
  return ctx.state.world.commits.find((c) => c.sha === sha);
};
const newCommit = (ctx: DeskCtx, sha: string | undefined) => Boolean(sha) && !ctx.start.world.commits.some((c) => c.sha === sha);

/** A `feature` push already went to staging: the reason the team wants a rule. */
const featureDeployed = deskOf(play(world(condWf({ mainOnly: false, notify: "failure", softLint: false })), [{ type: "push", branch: "feature", message: "try a new banner" }]));

/** main has a lint error in another team's file, and your hotfix is committed but not pushed. */
const hotfixWaiting = run(deskOf(world(condWf({ mainOnly: true, notify: "failure", softLint: false }), ["lint"])), [
  { type: "write", path: "src/app.ts", content: 'import { total } from "./cart";\n\nexport function render(items: number[]) {\n  return `Total: ${total(items).toFixed(2)}`;\n}' },
  { type: "commit", message: "fix: show the total with two decimals", all: true },
]);

/** Free play: no conditions anywhere, as the try-it step always started. */
export const FREE = deskOf(world(condWf({ mainOnly: false, notify: "plain", softLint: false })));

export const scenarios: CiScenario[] = [
  {
    id: "staging-from-main",
    title: l("Staging sadece main'den", "Staging only from main"),
    story: l(
      "Dün Bora `feature` branch'ine yarım bir banner denemesi push'ladı ve CI onu doğrudan staging'e kurdu. Testçiler bütün öğleden sonra yarım bir sayfayı test etti. `feature` push'ları test edilmeye devam etmeli, ama staging'e sadece `main` çıkmalı.",
      "Yesterday Bora pushed a half-done banner experiment to `feature`, and CI put it straight on staging. The testers spent the afternoon on a half-done page. Pushes to `feature` should still be tested, but only `main` goes to staging.",
    ),
    goal: l("`deploy` job'ı sadece `main`'de çalışsın; `feature` push'ları yine build ve test edilsin; staging'e `main`'den yeni bir commit çıksın.", "The `deploy` job runs only on `main`; `feature` pushes are still built and tested; a new commit from `main` reaches staging."),
    start: featureDeployed,
    hints: [
      l("Bütün workflow'u değil, sadece bir job'ı koşula bağlaman gerek. Workflow `.github/workflows/ci-cd.yml`.", "You don't want to limit the whole workflow, only one job. The workflow is `.github/workflows/ci-cd.yml`."),
      l("`deploy:` job'ının altına bir `if:` koy: `github.ref` main'in ref'i olsun.", "Put an `if:` under the `deploy:` job: `github.ref` must be main's ref."),
      l(
        "`nano .github/workflows/ci-cd.yml` → `deploy:` altına `    if: github.ref == 'refs/heads/main'` → `git commit -am \"Deploy only from main\"` → `git push`",
        "`nano .github/workflows/ci-cd.yml` → under `deploy:` add `    if: github.ref == 'refs/heads/main'` → `git commit -am \"Deploy only from main\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = live(ctx);
      const c = stagingCommit(ctx);
      return job(ctx, "deploy")?.if === "main" && !job(ctx, "build")?.if && wouldStart(wf, "push", "feature", SRC) && c?.branch === "main" && newCommit(ctx, c.sha);
    },
  },
  {
    id: "speak-up",
    title: l("Kırılınca haber ver", "Speak up when it breaks"),
    story: l(
      "`main` bu sabahtan beri kırmızı ve kimse fark etmedi. Workflow'da bir `notify` job'ı var ama hiç mesaj atmadı: o da varsayılan koşulla çalışıyor, yani önceki job'lar geçtiyse. Tam ihtiyaç olduğunda susuyor.",
      "`main` has been red since this morning and nobody noticed. The workflow has a `notify` job, but it never posted: it runs with the default condition, only when the jobs before it passed. It goes quiet exactly when it's needed.",
    ),
    goal: l("`notify` sadece bir şey kırıldığında mesaj atsın, ve kırmızı `main` için gerçekten bir mesaj gitsin.", "`notify` posts only when something broke, and a message really goes out for the red `main`."),
    start: deskOf(world(condWf({ mainOnly: true, notify: "plain", softLint: false }), ["test"])),
    hints: [
      l("Bir job'ın varsayılan koşulu `success()`. `notify`'ın ihtiyaç duyduğu job'lar kırılınca o da atlanıyor.", "A job's default condition is `success()`. When the jobs `notify` needs fail, it is skipped too."),
      l("`notify:` job'ına `if: failure()` ekle ve push'la: `main` hâlâ kırık olduğu için bu push'un run'ı da kırılır ve mesaj gider.", "Add `if: failure()` to the `notify:` job and push: `main` is still broken, so this push's run fails too and the message goes out."),
      l(
        "`nano .github/workflows/ci-cd.yml` → `notify:` altına `    if: failure()` → `git commit -am \"Notify on failure\"` → `git push`",
        "`nano .github/workflows/ci-cd.yml` → under `notify:` add `    if: failure()` → `git commit -am \"Notify on failure\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) =>
      job(ctx, "notify")?.if === "failure" && fresh(ctx).some((r) => r.status === "failure" && r.jobs.some((j) => j.id === "notify" && j.status === "success")),
  },
  {
    id: "soft-lint",
    title: l("Lint beklesin, düzeltme çıksın", "Lint waits, the fix ships"),
    story: l(
      "Ödeme sayfasındaki toplam yanlış görünüyor ve düzeltmen commit'li, push'lanmayı bekliyor. Ama `main`'de başka bir ekibin `src/cart.ts`'inde kullanılmayan bir değişken var ve lint her şeyi durduruyor. O dosyaya dokunmayacaksın; ekip, lint'in pazartesiye kadar sadece uyarı vermesine karar verdi.",
      "The checkout total looks wrong and your fix is committed, waiting to be pushed. But on `main`, another team's `src/cart.ts` has an unused variable and lint stops everything. You won't touch that file; the team agreed lint only warns until Monday.",
    ),
    goal: l("Düzeltmen staging'e çıksın; lint adımı yine çalışsın ama job'ı durdurmasın; `src/cart.ts` değişmesin.", "Your fix reaches staging; the lint step still runs but doesn't stop the job; `src/cart.ts` stays as it is."),
    start: hotfixWaiting,
    hints: [
      l("Bir adımın kırılması job'ı durdurmasın istiyorsan, adıma bunu söylersin; adımı silmezsin.", "If a step's failure shouldn't stop the job, you tell the step that; you don't delete it."),
      l("`npm run lint` adımına `continue-on-error: true` ekle, sonra workflow değişikliğini ve düzeltmeni birlikte push'la.", "Add `continue-on-error: true` to the `npm run lint` step, then push the workflow change together with your fix."),
      l(
        "`nano .github/workflows/ci-cd.yml` → `- run: npm run lint` altına `        continue-on-error: true` → `git commit -am \"Lint warns only\"` → `git push`",
        "`nano .github/workflows/ci-cd.yml` → under `- run: npm run lint` add `        continue-on-error: true` → `git commit -am \"Lint warns only\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const c = stagingCommit(ctx);
      const lint = job(ctx, "build")?.steps.find((s) => s.kind === "lint");
      const shipped = ctx.state.remote.main?.["src/app.ts"] !== ctx.start.remote.main?.["src/app.ts"];
      const untouched = ctx.state.remote.main?.["src/cart.ts"] === ctx.start.remote.main?.["src/cart.ts"];
      return Boolean(lint?.continueOnError) && newCommit(ctx, c?.sha) && shipped && untouched;
    },
  },
  {
    id: "always-summary",
    title: l("Özet her zaman", "A summary every time"),
    story: l(
      "Testçiler her run'ın sayfasındaki özete (`### Build finished`) bakıyor. Ama özet adımı da varsayılan koşulla çalışıyor: testler kırılınca hiç yazılmıyor, yani tam bakılması gereken run'da boş kalıyor. `main`'de şu an kırık bir test var.",
      "The testers read the summary on each run's page (`### Build finished`). But the summary step runs with the default condition too: when tests fail it's never written, so it's empty exactly on the run they need to read. Right now `main` has a failing test.",
    ),
    goal: l("Kırmızı bir run da özetini yazsın; kırık kod staging'e **çıkmasın**.", "A red run still writes its summary; the broken code does **not** reach staging."),
    start: deskOf(world(quietSummary({ mainOnly: true, notify: "failure", softLint: false }), ["test"])),
    hints: [
      l("Adımların da `if:`'i olabilir. Ne olursa olsun çalışması gereken bir adım için bir koşul var.", "Steps can have an `if:` too. There's a condition for a step that must run no matter what."),
      l("Özet adımına (`echo \"### Build finished\" >> \"$GITHUB_STEP_SUMMARY\"`) `if: always()` ekle ve push'la.", "Add `if: always()` to the summary step (`echo \"### Build finished\" >> \"$GITHUB_STEP_SUMMARY\"`) and push."),
      l(
        "`nano .github/workflows/ci-cd.yml` → özet adımının altına `        if: always()` → `git commit -am \"Always write the summary\"` → `git push`",
        "`nano .github/workflows/ci-cd.yml` → under the summary step add `        if: always()` → `git commit -am \"Always write the summary\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const summary = job(ctx, "build")?.steps.find((s) => s.kind === "summary");
      return summary?.if === "always" && fresh(ctx).some((r) => r.status === "failure" && r.summary.includes("### Build finished")) && ctx.state.world.envs.staging?.sha === SHAS[0];
    },
  },
];

