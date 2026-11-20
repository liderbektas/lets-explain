import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type Bug, type CiAction, type World } from "../../engine/ci";
import { deskOf, sourceFiles, type Desk } from "../../engine/desk";
import { ciWorkflow, withJob } from "../../engine/presets";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import type { CiScenario, DeskCtx } from "../shared/ci";

const CI = ciWorkflow();
const RENAMED = withJob(CI, "ci", (j) => ({ ...j, id: "test" }));

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);

/**
 * The shop on main, with Bora's `feature` branch on GitHub carrying `bugs` and an open PR #1.
 * The desk's view of that branch has the same bugs in its files, so fixing a file fixes the check.
 */
function withPr(init: { protection?: string[]; renamed?: boolean }, bugs: Bug[]): Desk {
  const wf = init.renamed ? RENAMED : CI;
  const w = play(freshWorld({ workflows: [wf], protection: init.protection ?? null }), [
    { type: "push", branch: "feature", add: bugs, paths: ["src/cart.ts"], message: "cart: add VAT" },
    { type: "openPr", branch: "feature" },
  ]);
  const d = deskOf(w);
  const files = { ...sourceFiles(bugs), [workflowFile(wf)]: workflowYaml(wf) };
  d.remote.feature = { ...files };
  d.synced.feature = { ...files };
  return d;
}

/** Free play: main unprotected, PR #1 red on a real test bug. */
export const FREE = withPr({}, ["test"]);

/** For every merge in the scenario: the protection in force at that moment and the run main got. */
function merges(ctx: DeskCtx) {
  const out: { protection: string[] | null; green: boolean }[] = [];
  ctx.events.forEach((evs, i) => {
    for (const e of evs) {
      if (e.type !== "merged") continue;
      const after = ctx.states[i + 1]!.world;
      const run = after.runs.find((r) => r.sha === e.sha && r.event === "push");
      out.push({ protection: ctx.states[i]!.world.protection, green: run?.status === "success" });
    }
  });
  return out;
}

const PROTECT = '{"required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":true,"required_pull_request_reviews":null,"restrictions":null}';
const PUT = "gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input protection.json";

export const scenarios: CiScenario[] = [
  {
    id: "guard",
    title: l("Kapıya bekçi", "A guard at the door"),
    story: l(
      "Geçen hafta kırmızı bir PR merge edildi ve `main` iki gün kırık kaldı. Bugün Bora'nın PR #1'i yine kırmızı. Ekip kuralı netleştirdi: `ci` check'i geçmeyen hiçbir şey `main`'e girmeyecek. Ayar ekranı yerine GitHub'ın API'sini kullanacaksın.",
      "Last week a red PR got merged and `main` stayed broken for two days. Today Bora's PR #1 is red again. The team set the rule: nothing gets into `main` unless the `ci` check passes. You'll use GitHub's API instead of the settings page.",
    ),
    goal: l("`main` korumalı olsun, `ci` check'i zorunlu olsun; PR #1 merge **edilmemiş** kalsın.", "`main` is protected with the `ci` check required, and PR #1 stays **unmerged**."),
    start: withPr({}, ["test"]),
    hints: [
      l("Koruma bir API kaydıdır: `PUT repos/{owner}/{repo}/branches/main/protection`. Gövdesi JSON; dört alanı da ister.", "Protection is an API record: `PUT repos/{owner}/{repo}/branches/main/protection`. Its body is JSON and needs all four fields."),
      l(
        "Gövdeyi `nano protection.json` ile yaz: `required_status_checks` (`strict` ve `contexts: [\"ci\"]`), `enforce_admins`, `required_pull_request_reviews: null`, `restrictions: null`. Sonra `gh api -X PUT … --input protection.json`.",
        "Write the body with `nano protection.json`: `required_status_checks` (`strict` and `contexts: [\"ci\"]`), `enforce_admins`, `required_pull_request_reviews: null`, `restrictions: null`. Then `gh api -X PUT … --input protection.json`.",
      ),
      l(`\`nano protection.json\` → \`${PROTECT}\` → \`${PUT}\``, `\`nano protection.json\` → \`${PROTECT}\` → \`${PUT}\``),
    ],
    par: 2,
    check: (ctx) => Boolean(ctx.state.world.protection?.includes("CI / ci")) && ctx.state.world.prs[0]?.state === "open",
  },
  {
    id: "fix-the-pr",
    title: l("PR'ı yeşile çek", "Turn the PR green"),
    story: l(
      "`main` artık korumalı. Bora tatilde, ama PR #1'in bugün çıkması lazım. Check kırmızı: KDV testi düşüyor. Bora'nın `feature` branch'ine geçip hatayı düzelteceksin.",
      "`main` is protected now. Bora is on holiday, but PR #1 has to ship today. Its check is red: the VAT test fails. You'll switch to Bora's `feature` branch and fix the bug.",
    ),
    goal: l("PR #1, `main` **korumalıyken** merge edilsin ve merge'den sonra `main`'deki run yeşil olsun.", "PR #1 merges **while `main` is protected**, and the run on `main` after the merge is green."),
    start: withPr({ protection: ["CI / ci"] }, ["test"]),
    hints: [
      l("`gh pr checks` ve `gh run view --log-failed` hangi testin neden düştüğünü söyler. Düzeltme PR'ın branch'ine gider.", "`gh pr checks` and `gh run view --log-failed` tell you which test fails and why. The fix goes onto the PR's branch."),
      l("`git switch feature`, `src/cart.ts`'te KDV oranını düzelt (%20 → `1.2`), commit'le ve push'la; check yeniden çalışır. Yeşilse `gh pr merge`.", "`git switch feature`, fix the VAT rate in `src/cart.ts` (20% → `1.2`), commit and push; the check runs again. When it's green, `gh pr merge`."),
      l("`git switch feature` → `nano src/cart.ts` (`1.18` → `1.2`) → `git commit -am \"fix: VAT rate\"` → `git push` → `gh pr merge`", "`git switch feature` → `nano src/cart.ts` (`1.18` → `1.2`) → `git commit -am \"fix: VAT rate\"` → `git push` → `gh pr merge`"),
    ],
    par: 5,
    check: (ctx) => merges(ctx).some((m) => Boolean(m.protection?.includes("CI / ci")) && m.green),
  },
  {
    id: "ghost-check",
    title: l("Hiç gelmeyen check", "The check that never comes"),
    story: l(
      "Geçen hafta biri workflow'daki job'ın adını `ci`'dan `test`'e çevirdi. O günden beri her PR'da \"Expected — Waiting for status to be reported\" yazıyor ve hiçbir şey merge edilemiyor. Bora'nın PR #1'i yeşil, ama yine de bekliyor.",
      "Last week someone renamed the workflow's job from `ci` to `test`. Since then every PR says \"Expected — Waiting for status to be reported\" and nothing can merge. Bora's PR #1 is green and still stuck.",
    ),
    goal: l("PR #1 merge edilsin; `main` korumalı kalsın ve zorunlu check gerçekten çalışan bir check olsun.", "PR #1 merges; `main` stays protected, and the required check is one that really runs."),
    start: withPr({ protection: ["CI / ci"], renamed: true }, []),
    hints: [
      l("`gh pr checks` iki satır gösterir: biri gelen (`test`), biri hiç gelmeyen (`ci`). Zorunlu check'in adı job'ın adıyla birebir aynı olmalı.", "`gh pr checks` shows two lines: the one that arrives (`test`) and the one that never does (`ci`). A required check's name must match the job's name exactly."),
      l("Korumayı kaldırma: aynı `PUT …/branches/main/protection` çağrısını `contexts: [\"test\"]` ile yeniden yap, sonra merge et.", "Don't remove protection: send the same `PUT …/branches/main/protection` again with `contexts: [\"test\"]`, then merge."),
      l(`\`nano protection.json\` → \`${PROTECT.replace('"ci"', '"test"')}\` → \`${PUT}\` → \`gh pr merge 1\``, `\`nano protection.json\` → \`${PROTECT.replace('"ci"', '"test"')}\` → \`${PUT}\` → \`gh pr merge 1\``),
    ],
    par: 3,
    check: (ctx) => merges(ctx).some((m) => Boolean(m.protection && m.protection.length > 0)),
  },
  {
    id: "protect-and-land",
    title: l("Önce kural, sonra merge", "Rule first, then merge"),
    story: l(
      "Bugün sürüm sorumlusu sensin. `main` hâlâ korumasız ve Bora'nın PR #1'i kırmızı: CI bir lint hatası buldu. Sırayla: önce `main`'i koru ki bir daha kimse kırmızıyı merge edemesin, sonra PR'ı düzelt ve merge et.",
      "You're the release lead today. `main` is still unprotected and Bora's PR #1 is red: CI found a lint error. In order: protect `main` first so nobody can merge red again, then fix the PR and merge it.",
    ),
    goal: l("`ci` zorunluyken PR #1 merge edilsin ve merge'den sonra `main` yeşil olsun.", "PR #1 merges while `ci` is required, and `main` is green after the merge."),
    start: withPr({}, ["lint"]),
    hints: [
      l("İki iş var: koruma (API ile) ve hatayı düzeltmek (PR'ın branch'inde). `gh run view --log-failed` lint'in hangi satıra kızdığını gösterir.", "Two jobs: protection (with the API) and fixing the bug (on the PR's branch). `gh run view --log-failed` shows which line lint complains about."),
      l("Korumayı `protection.json` + `gh api -X PUT …` ile kur. Sonra `git switch feature`, `src/cart.ts`'teki kullanılmayan `total` değişkenini sil, commit, push, `gh pr merge`.", "Set protection with `protection.json` + `gh api -X PUT …`. Then `git switch feature`, delete the unused `total` variable in `src/cart.ts`, commit, push, `gh pr merge`."),
      l(
        `\`nano protection.json\` → \`${PROTECT}\` → \`${PUT}\` → \`git switch feature\` → \`nano src/cart.ts\` (\`const total = subtotal;\` satırını sil) → \`git commit -am "fix: lint"\` → \`git push\` → \`gh pr merge\``,
        `\`nano protection.json\` → \`${PROTECT}\` → \`${PUT}\` → \`git switch feature\` → \`nano src/cart.ts\` (delete \`const total = subtotal;\`) → \`git commit -am "fix: lint"\` → \`git push\` → \`gh pr merge\``,
      ),
    ],
    par: 7,
    check: (ctx) => merges(ctx).some((m) => Boolean(m.protection?.includes("CI / ci")) && m.green),
  },
];
