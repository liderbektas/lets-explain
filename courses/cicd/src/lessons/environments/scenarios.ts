import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, SHAS, type CiAction, type World } from "../../engine/ci";
import { applyDesk, deskOf, type DeskAction } from "../../engine/desk";
import { envId, USER_ID } from "../../engine/ghApi";
import type { CiScenario, DeskCtx } from "../shared/ci";
import { DEPLOY, ENVS, MANUAL } from "./workflows";

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);

/** dev → staging → production, every environment on the first commit, its image in the registry. */
const shop = (o: { gate?: boolean; token?: boolean } = {}): World => {
  const w = freshWorld({
    workflows: [DEPLOY, MANUAL],
    envs: ENVS.map((name) => ({ name, sha: SHAS[0]!, approval: name === "production" && Boolean(o.gate) })),
    secrets: o.token === false ? {} : { DEPLOY_TOKEN: "dpl_live" },
  });
  return { ...w, registry: { [`sha-${SHAS[0]}`]: SHAS[0]! } };
};

/** Your "faster search" commit, made and waiting to be pushed. */
const ready = (w: World) =>
  ([
    { type: "write", path: "src/app.ts", content: 'import { total } from "./cart";\n\nexport function render(items: number[]) {\n  return `Total: ${total(items)} (search is faster now)`;\n}' },
    { type: "commit", message: "faster search", all: true },
  ] as DeskAction[]).reduce((d, a) => applyDesk(d, a).state, deskOf(w));

const deployed = (ctx: DeskCtx, env: string) => ctx.state.world.envs[env]?.sha ?? null;
const fresh = (ctx: DeskCtx) => ctx.state.world.runs.slice(ctx.start.world.runs.length);

/** The gated push from the second scenario: run #1 waits at production with the new commit. */
const WAITING = play(shop({ gate: true }), [{ type: "push", message: "faster search" }]);
const WAITING_SHA = WAITING.heads.main!;
const PROD_ID = envId("production");

/** Two releases since the first commit, both on every environment, both images kept. */
const RELEASED = play(shop(), [
  { type: "push", message: "new checkout page" },
  { type: "push", message: "add coupons" },
]);
const OLDER = SHAS[1]!;

export const FREE = deskOf(shop());

const REVIEWER = `-F 'reviewers[][type]=User' -F 'reviewers[][id]=${USER_ID}'`;
const APPROVE = `-F 'environment_ids[]=${PROD_ID}' -f state=approved -f comment='QA passed on staging'`;

export const scenarios: CiScenario[] = [
  {
    id: "gate",
    title: l("Production'a kapı", "A gate on production"),
    story: l(
      "Geçen cuma bir push dev'den staging'e, oradan production'a hiç durmadan aktı; kimse staging'e bakmaya fırsat bulamadı. \"faster search\" commit'in hazır, push'lanmayı bekliyor. Bu sefer production'a çıkmadan önce senin onayın gerekecek.",
      "Last Friday a push flowed from dev to staging to production without stopping; nobody had time to look at staging. Your \"faster search\" commit is ready, waiting to be pushed. This time it must need your approval before production.",
    ),
    goal: l("Production için onaylayıcı sen ol, sonra commit'i push'la: run production'ın kapısında beklesin, production eski sürümde kalsın.", "Make yourself production's reviewer, then push the commit: the run waits at production's gate and production stays on the old version."),
    start: ready(shop()),
    hints: [
      l("Onay bir ortam kuralıdır: `PUT repos/{owner}/{repo}/environments/production` ve bir `reviewers` listesi. Sıra önemli: kapı push'tan **önce** kurulmalı.", "Approval is an environment rule: `PUT repos/{owner}/{repo}/environments/production` with a `reviewers` list. Order matters: the gate must be set up **before** the push."),
      l("Bir onaylayıcı `type` ve `id` ister. Kendi id'ni `gh api user --jq .id` söyler; gh dizideki nesneyi `-F 'reviewers[][type]=User' -F 'reviewers[][id]=…'` ile kurar.", "A reviewer needs a `type` and an `id`. `gh api user --jq .id` tells you yours; gh builds the object in the array with `-F 'reviewers[][type]=User' -F 'reviewers[][id]=…'`."),
      l(`\`gh api -X PUT repos/{owner}/{repo}/environments/production ${REVIEWER}\` → \`git push\``, `\`gh api -X PUT repos/{owner}/{repo}/environments/production ${REVIEWER}\` → \`git push\``),
    ],
    par: 2,
    check: (ctx) =>
      Boolean(ctx.state.world.envs.production?.approval) &&
      deployed(ctx, "production") === SHAS[0] &&
      fresh(ctx).some((r) => r.status === "waiting" && r.jobs.some((j) => j.status === "waiting" && j.environment === "production")),
  },
  {
    id: "approve",
    title: l("Onayla", "Approve it"),
    story: l(
      "\"faster search\" staging'de; run production'ın kapısında senin onayını bekliyor. Testçiler staging'i kontrol etti ve onay verdi. Tarayıcıyı açmadan onaylayacaksın.",
      "\"faster search\" is on staging; the run waits at production's gate for your approval. The testers checked staging and gave the go-ahead. You'll approve without opening a browser.",
    ),
    goal: l("Bekleyen deploy'u onayla: production yeni commit'i çalıştırsın.", "Approve the waiting deployment: production runs the new commit."),
    start: deskOf(WAITING),
    hints: [
      l("`gh run list` bekleyen run'ı gösterir. Onay, run'ın `pending_deployments` kaydına gönderilir.", "`gh run list` shows the waiting run. Approval goes to the run's `pending_deployments` record."),
      l(
        "`gh api repos/{owner}/{repo}/actions/runs/1/pending_deployments` hangi ortamın beklediğini ve id'sini söyler. Aynı adrese `POST` ile `environment_ids[]`, `state=approved` ve bir `comment` gönder.",
        "`gh api repos/{owner}/{repo}/actions/runs/1/pending_deployments` tells you which environment waits and its id. `POST` to the same path with `environment_ids[]`, `state=approved` and a `comment`.",
      ),
      l(`\`gh api -X POST repos/{owner}/{repo}/actions/runs/1/pending_deployments ${APPROVE}\``, `\`gh api -X POST repos/{owner}/{repo}/actions/runs/1/pending_deployments ${APPROVE}\``),
    ],
    par: 1,
    check: (ctx) => deployed(ctx, "production") === WAITING_SHA && ctx.events.flat().some((e) => e.type === "approved" && e.env === "production"),
  },
  {
    id: "env-tokens",
    title: l("Her ortama kendi token'ı", "A token per environment"),
    story: l(
      "Güvenlik ekibi repo seviyesindeki `DEPLOY_TOKEN`'ı sildi: her workflow, PR'lardakiler bile, onu okuyabiliyordu. Artık her ortamın kendi token'ı var: dev `dpl_dev_4k2`, staging `dpl_stg_9x1`, production `dpl_prod_7q8`. O yüzden son push dev'de `DEPLOY_TOKEN is empty` ile düştü.",
      "The security team deleted the repo-level `DEPLOY_TOKEN`: every workflow, even on PRs, could read it. Now every environment has its own token: dev `dpl_dev_4k2`, staging `dpl_stg_9x1`, production `dpl_prod_7q8`. That's why the last push failed at dev with `DEPLOY_TOKEN is empty`.",
    ),
    goal: l("Her ortamın token'ı o ortamın secret'ı olsun, repo seviyesinde `DEPLOY_TOKEN` olmasın, ve son commit production'a kadar çıksın.", "Each environment's token is that environment's secret, there is no repo-level `DEPLOY_TOKEN`, and the latest commit makes it all the way to production."),
    start: deskOf(play(shop({ token: false }), [{ type: "push", message: "faster search" }])),
    hints: [
      l("Ortam secret'larını sadece `environment:` ile o ortama bağlanan job'lar görür. Deploy job'ları zaten bağlı.", "Environment secrets are seen only by jobs bound to that environment with `environment:`. The deploy jobs already are."),
      l("`gh secret set DEPLOY_TOKEN --env dev --body …`, aynısı staging ve production için. Sonra kırmızı run'ı yeniden çalıştır.", "`gh secret set DEPLOY_TOKEN --env dev --body …`, the same for staging and production. Then run the red run again."),
      l(
        "`gh secret set DEPLOY_TOKEN --env dev --body dpl_dev_4k2` → `gh secret set DEPLOY_TOKEN --env staging --body dpl_stg_9x1` → `gh secret set DEPLOY_TOKEN --env production --body dpl_prod_7q8` → `gh run rerun`",
        "`gh secret set DEPLOY_TOKEN --env dev --body dpl_dev_4k2` → `gh secret set DEPLOY_TOKEN --env staging --body dpl_stg_9x1` → `gh secret set DEPLOY_TOKEN --env production --body dpl_prod_7q8` → `gh run rerun`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const w = ctx.state.world;
      const tokens: Record<string, string> = { dev: "dpl_dev_4k2", staging: "dpl_stg_9x1", production: "dpl_prod_7q8" };
      return !("DEPLOY_TOKEN" in w.secrets) && ENVS.every((e) => w.envs[e]?.secrets?.DEPLOY_TOKEN === tokens[e]) && deployed(ctx, "production") === w.heads.main;
    },
  },
  {
    id: "by-hand",
    title: l("Eski sürüm staging'de", "An old version on staging"),
    story: l(
      `Bir müşteri, indirim kodlarının "geçen haftadan beri" bozuk olduğunu söylüyor. Hatanın \`${OLDER}\` commit'inde olup olmadığını görmek için o commit'in image'ını staging'e koyacaksın. Production'a dokunulmayacak.`,
      `A customer says discount codes have been broken "since last week". To see whether the bug is already in commit \`${OLDER}\`, you'll put that commit's image on staging. Production must not be touched.`,
    ),
    goal: l(`Staging \`${OLDER}\`'i çalıştırsın, bunu elle başlatılan bir run yapsın; production değişmesin.`, `Staging runs \`${OLDER}\`, put there by a run you started by hand; production stays as it is.`),
    start: deskOf(RELEASED),
    hints: [
      l("`.github/workflows/` altında elle başlatılan bir workflow var; hangi sürümü istediğini bir input'la söylüyorsun.", "There's a workflow under `.github/workflows/` you start by hand; you tell it which version you want with an input."),
      l("`gh workflow run` dosya adını ve input'u alır: `-f version=…`.", "`gh workflow run` takes the file name and the input: `-f version=…`."),
      l(`\`gh workflow run deploy-by-hand.yml -f version=${OLDER}\``, `\`gh workflow run deploy-by-hand.yml -f version=${OLDER}\``),
    ],
    par: 1,
    check: (ctx) => {
      const last = [...ctx.state.world.runs].reverse().find((r) => r.jobs.some((j) => j.id === "staging" && j.status === "success"));
      return deployed(ctx, "staging") === OLDER && last?.event === "dispatch" && deployed(ctx, "production") === ctx.start.world.envs.production?.sha;
    },
  },
];
