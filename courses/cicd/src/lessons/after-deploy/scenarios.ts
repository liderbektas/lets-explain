import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import type { CiScenario, DeskCtx } from "../shared/ci";
import { ALL, deployWf, NONE, type Checks } from "./workflow";

const crashed = (w: World, sha: string | null | undefined) => Boolean(sha) && commitOf(w, sha!).bugs.includes("crash");
const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);

/**
 * Staging runs a healthy first version; Bora's new cart is already on main (it crashes once
 * deployed, and no test catches it). Whatever pushes next ships it with the workflow then on GitHub.
 */
const beforeTheCart = (checks: Checks) =>
  deskOf(
    play(freshWorld({ envs: [{ name: "staging", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } }), [
      { type: "push", add: ["crash"], message: "new cart" },
      { type: "setWorkflow", workflow: deployWf(checks) },
    ]),
  );

/** The pipeline already rolled the broken cart back; the fix waits in Bora's PR. */
const FIX_WAITING = deskOf(
  play(freshWorld({ envs: [{ name: "staging", sha: SHAS[0]! }], secrets: { DEPLOY_TOKEN: "dpl_live" } }), [
    { type: "push", add: ["crash"], message: "new cart" },
    { type: "setWorkflow", workflow: deployWf(ALL) },
    { type: "push", message: "cart discounts" },
    { type: "push", branch: "fix-cart", fix: ["crash"], message: "fix the cart crash" },
    { type: "openPr", branch: "fix-cart" },
  ]),
);

const smokeFailed = (ctx: DeskCtx) => ctx.state.world.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === "smoke" && s.status === "failure")));
const crashReachedStaging = (ctx: DeskCtx) => ctx.events.flat().some((e) => e.type === "deployed" && e.env === "staging" && crashed(ctx.state.world, e.sha));
const healed = (ctx: DeskCtx) => crashReachedStaging(ctx) && !crashed(ctx.state.world, ctx.state.world.envs.staging?.sha) && ctx.events.flat().some((e) => e.type === "rolledBack");

const SMOKE = "`- run: curl --fail --retry 3 https://staging.shop.example/health`";
const ROLLBACK = "`- run: ./deploy.sh staging --previous` + `if: failure()`";
const NOTIFY = '`- run: ./notify.sh "Deploy to staging failed and was rolled back"` + `if: failure()`';

export const scenarios: CiScenario[] = [
  {
    id: "catch",
    title: l("Kırmızıya çevir", "Turn it red"),
    story: l(
      "Geçen hafta yeşil bir deploy staging'i bozdu ve kimse saatlerce fark etmedi: workflow sadece deploy komutunun bitip bitmediğine bakıyor. Bora'nın yeni sepeti main'de ve bir sonraki push'la staging'e çıkacak.",
      "Last week a green deploy broke staging and nobody noticed for hours: the workflow only checks that the deploy command finished. Bora's new cart is on main and goes out to staging with the next push.",
    ),
    goal: l("Bozuk bir deploy olursa run **smoke test adımında** kırmızıya dönsün.", "If a deploy is broken, the run turns red **at the smoke test step**."),
    start: beforeTheCart(NONE),
    hints: [
      l("Deploy'un bitmesi sitenin çalıştığını söylemez. Deploy'dan hemen sonra biri siteye bakmalı.", "A finished deploy does not mean the site works. Right after the deploy, something has to look at it."),
      l("`deploy` job'ının sonuna sağlık adresine `curl --fail` atan bir adım ekle ve push'la; push Bora'nın sepetini de götürür.", "Add a step at the end of the `deploy` job that runs `curl --fail` on the health URL, and push; the push takes Bora's cart along."),
      l(`\`nano .github/workflows/deploy.yml\` → ${SMOKE} → \`git commit -am "Smoke test"\` → \`git push\``, `\`nano .github/workflows/deploy.yml\` → ${SMOKE} → \`git commit -am "Smoke test"\` → \`git push\``),
    ],
    par: 3,
    check: smokeFailed,
  },
  {
    id: "self-heal",
    title: l("Kendi kendini toparla", "Heal by itself"),
    story: l(
      "Smoke test artık bozuk bir deploy'u yakalıyor ama staging bozuk kalıyor ve biri gelip elle geri alana kadar QA çalışamıyor. Bora'nın sepeti yine main'de, bir sonraki push'u bekliyor.",
      "The smoke test now catches a broken deploy, but staging stays broken and QA is stuck until someone rolls it back by hand. Bora's cart is on main again, waiting for the next push.",
    ),
    goal: l("Bozuk commit staging'e çıksın ve pipeline **kendisi** staging'i sağlam sürüme geri alsın.", "The broken commit reaches staging, and the pipeline **itself** puts staging back on a healthy version."),
    start: beforeTheCart({ smoke: true, rollback: false, notify: false }),
    hints: [
      l("Smoke test kırılınca çalışacak bir adım lazım. Normal adımlar, önceki bir adım kırılınca atlanır.", "You need a step that runs when the smoke test fails. Normal steps are skipped once an earlier one fails."),
      l("`./deploy.sh staging --previous` bir önceki sürümü geri koyar; `if: failure()` onu sadece bir şey kırılınca çalıştırır.", "`./deploy.sh staging --previous` puts the previous version back; `if: failure()` runs it only when something failed."),
      l(`\`nano .github/workflows/deploy.yml\` → smoke'tan sonra ${ROLLBACK} → \`git commit -am "Roll back on failure"\` → \`git push\``, `\`nano .github/workflows/deploy.yml\` → after the smoke test ${ROLLBACK} → \`git commit -am "Roll back on failure"\` → \`git push\``),
    ],
    par: 3,
    check: healed,
  },
  {
    id: "tell-team",
    title: l("Ekibe haber ver", "Tell the team"),
    story: l(
      "Pipeline bozuk deploy'u artık kendisi geri alıyor. Ama geçen sefer geri alındığını kimse bilmedi; Bora sepetinin yayında olduğunu sandı. Bir geri alma olunca #deploys kanalına mesaj gitmeli.",
      "The pipeline now rolls a broken deploy back by itself. But last time nobody knew it had; Bora thought his cart was live. A rollback should post to the #deploys channel.",
    ),
    goal: l("Pipeline bozuk deploy'u kendisi geri alsın **ve** ekibe bir mesaj göndersin.", "The pipeline rolls the broken deploy back by itself **and** sends the team a message."),
    start: beforeTheCart({ smoke: true, rollback: true, notify: false }),
    hints: [
      l("Mesaj da sadece bir şey kırılınca gitmeli.", "The message should also go only when something failed."),
      l('Projede `./notify.sh "<metin>"` var. Geri almadan sonra, o da `if: failure()` ile.', 'The project has `./notify.sh "<text>"`. After the rollback, with `if: failure()` too.'),
      l(`\`nano .github/workflows/deploy.yml\` → ${NOTIFY} → \`git commit -am "Tell the team"\` → \`git push\``, `\`nano .github/workflows/deploy.yml\` → ${NOTIFY} → \`git commit -am "Tell the team"\` → \`git push\``),
    ],
    par: 3,
    check: (ctx) => healed(ctx) && ctx.events.flat().some((e) => e.type === "notified"),
  },
  {
    id: "fix-forward",
    title: l("İleri düzelt", "Fix it forward"),
    story: l(
      "Pipeline bozuk sepeti yakaladı ve staging'i eski sürüme geri aldı; main hâlâ bozuk commit'te. Bora düzeltmeyi `fix-cart` branch'inde hazırladı ve PR #1'i açtı. Staging'in en yeni kodu sağlam haliyle çalıştırması gerekiyor.",
      "The pipeline caught the broken cart and put staging back on the old version; main is still on the broken commit. Bora prepared the fix on the `fix-cart` branch and opened PR #1. Staging should run the newest code, healthy.",
    ),
    goal: l("Staging, main'in en son commit'ini çalıştırsın ve sağlıklı olsun.", "Staging runs main's newest commit, and it is healthy."),
    start: FIX_WAITING,
    hints: [
      l("Düzeltme hazır ama henüz main'de değil. main'e gelen her şey staging'e kendiliğinden gider.", "The fix is ready but not on main yet. Everything that lands on main goes to staging by itself."),
      l("PR'ı terminalden `gh pr merge` merge eder; `gh pr list` açık PR'ları gösterir.", "`gh pr merge` merges the PR from the terminal; `gh pr list` shows the open PRs."),
      l("`gh pr merge 1`", "`gh pr merge 1`"),
    ],
    par: 1,
    check: ({ state }) => {
      const w = state.world;
      return w.envs.staging?.sha === w.heads.main && !crashed(w, w.heads.main);
    },
  },
];
