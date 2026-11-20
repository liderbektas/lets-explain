import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, type CiAction, type Filter, type JobDef, type Run, type Status, type Workflow } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { PREP, TEST } from "../../engine/presets";
import { liveWorkflow, wouldStart, type CiScenario, type DeskCtx } from "../shared/ci";

const test = (id = "test"): JobDef => ({ id, steps: [...PREP, TEST] });
const onPush = (f: Filter): Workflow => ({ name: "CI", on: { push: { branches: ["main"], ...f } }, jobs: [test()] });

/** The required check `CI / test`, behind a `paths` filter: a docs-only PR never reports it. */
const TRAP: Workflow = { name: "CI", on: { pull_request: { paths: ["src/**"] } }, jobs: [test()] };
/** One repo, two apps, and both are tested on every push. */
const BOTH_APPS: Workflow = { name: "CI", on: { push: { branches: ["main"] } }, jobs: [test("web"), test("api")] };

const REQUIRED = "CI / test";

/** The shop's two apps in one repo. */
const APPS = { "web/index.html": "<!doctype html>\n<title>Shop</title>", "api/server.ts": 'import { createServer } from "node:http";\n\ncreateServer().listen(3000);' };

/** main is protected; a docs-only branch is pushed and its PR waits for a check that never comes. */
function blockedPr(): Desk {
  let w = freshWorld({ workflows: [TRAP], protection: [REQUIRED] });
  for (const a of [{ type: "push", branch: "docs", paths: ["docs/guide.md"], message: "docs: install guide" }, { type: "openPr", branch: "docs" }] as CiAction[]) w = apply(w, a).state;
  return deskOf(w);
}

const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const jobStatus = (r: Run, id: string): Status | undefined => r.jobs.find((j) => j.id === id)?.status;

const CHANGES = l(
  "Workflow her zaman başlasın, kararı bir `changes` job'ı versin: `dorny/paths-filter@v3` (`id: filter`, `filters: |` altında `src:` ve `- 'src/**'`), job `outputs:` ile `src: ${{ steps.filter.outputs.src }}`. test job'ına `needs: changes` ve `if: needs.changes.outputs.src == 'true'`.",
  "Let the workflow always start, and let a `changes` job decide: `dorny/paths-filter@v3` (`id: filter`, under `filters: |` put `src:` and `- 'src/**'`), job `outputs:` with `src: ${{ steps.filter.outputs.src }}`. On the test job, `needs: changes` and `if: needs.changes.outputs.src == 'true'`.",
);

export const scenarios: CiScenario[] = [
  {
    id: "unblock",
    title: l("Kilitli PR", "The stuck PR"),
    story: l(
      "`main` korumalı ve `CI / test` zorunlu bir check. Dakika boşa gitmesin diye PR workflow'una `paths: ['src/**']` eklenmiş. Teknik yazarın sadece dokümanı değiştiren `docs` PR'ı o günden beri \"Expected — Waiting for status to be reported\" diye bekliyor ve merge edilemiyor.",
      "`main` is protected and `CI / test` is a required check. To save minutes, someone added `paths: ['src/**']` to the PR workflow. Since then the technical writer's `docs` PR, which only changes docs, has been sitting at \"Expected — Waiting for status to be reported\" and can't be merged.",
    ),
    goal: l(
      "`docs` PR'ını (#1) merge et, ama `test` job'ı hiçbir run'da **çalışmasın** (atlanabilir).",
      "Merge the `docs` PR (#1) without the `test` job **running** in any run (skipping is fine).",
    ),
    start: blockedPr(),
    hints: [
      l(
        "Workflow hiç başlamazsa zorunlu check hiç raporlanmaz ve PR sonsuza kadar bekler. GitHub **atlanan** bir job'ı geçmiş sayar: filtreyi workflow'dan job'a taşı.",
        "If the workflow never starts, the required check is never reported and the PR waits forever. GitHub counts a **skipped** job as passing: move the filter from the workflow to the job.",
      ),
      CHANGES,
      l(
        "`git switch docs` → `nano .github/workflows/ci.yml` (`paths`'i kaldır, `changes` job'ını ve test'e `needs` + `if` ekle) → `git commit -am \"ci: skip tests per job, not per workflow\"` → `git push` → `gh pr merge`",
        "`git switch docs` → `nano .github/workflows/ci.yml` (remove `paths`, add the `changes` job, and `needs` + `if` on test) → `git commit -am \"ci: skip tests per job, not per workflow\"` → `git push` → `gh pr merge`",
      ),
    ],
    par: 5,
    check: (ctx) => {
      const runs = fresh(ctx);
      return ctx.state.world.prs[0]?.state === "merged" && runs.some((r) => r.pr === 1) && runs.every((r) => jobStatus(r, "test") === undefined || jobStatus(r, "test") === "skipped");
    },
  },
  {
    id: "two-apps",
    title: l("İki uygulama, bir repo", "Two apps, one repo"),
    story: l(
      "Repoda iki uygulama var: `web/` (site) ve `api/` (sunucu). CI her push'ta ikisinin testlerini de çalıştırıyor; sitede bir başlığı düzeltmek bile API testlerini bekletiyor.",
      "The repo holds two apps: `web/` (the site) and `api/` (the server). CI runs both apps' tests on every push; even fixing a heading on the site waits for the API tests.",
    ),
    goal: l("Sadece `web/`'i değiştiren bir push'ta `web` testleri çalışsın, `api` atlansın.", "On a push that only changes `web/`, the `web` tests run and `api` is skipped."),
    start: deskOf(freshWorld({ workflows: [BOTH_APPS] }), APPS),
    hints: [
      l("İki job'ın önüne neyin değiştiğine bakan bir `changes` job'ı koy; her job sadece kendi klasörü değiştiyse çalışsın.", "Put a `changes` job in front of the two that looks at what changed; each job runs only when its own folder changed."),
      l(
        "`dorny/paths-filter@v3` ile `web: ['web/**']` ve `api: ['api/**']` filtreleri, `outputs:` ile ikisini dışarı ver; `web`'e `if: needs.changes.outputs.web == 'true'`, `api`'ye `... .api == 'true'`.",
        "`dorny/paths-filter@v3` with filters `web: ['web/**']` and `api: ['api/**']`, both handed out under `outputs:`; `if: needs.changes.outputs.web == 'true'` on `web`, `... .api == 'true'` on `api`.",
      ),
      l(
        "`nano .github/workflows/ci.yml` (`changes` job + `needs` + `if`'ler) → `echo \"<h1>Shop</h1>\" >> web/index.html` → `git commit -am \"ci: test only the app that changed\"` → `git push`",
        "`nano .github/workflows/ci.yml` (`changes` job + `needs` + the `if`s) → `echo \"<h1>Shop</h1>\" >> web/index.html` → `git commit -am \"ci: test only the app that changed\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => fresh(ctx).some((r) => r.changed.every((p) => !p.startsWith("api/")) && jobStatus(r, "web") === "success" && jobStatus(r, "api") === "skipped"),
  },
  {
    id: "dependencies",
    title: l("Bağımlılık da kod", "Dependencies are code too"),
    story: l(
      "CI sadece `src/**` değişince çalışıyor. Dün bir bot `package-lock.json`'da bir paketi güncelledi, CI hiç çalışmadı ve `main` sessizce bozuldu.",
      "CI only runs when `src/**` changes. Yesterday a bot bumped a package in `package-lock.json`, CI never ran, and `main` quietly broke.",
    ),
    goal: l(
      "`main`'e push'ta CI, `src/` **ya da** `package.json`/`package-lock.json` değişince çalışsın; sadece `docs/` değişince çalışmasın.",
      "On pushes to `main`, CI runs when `src/` **or** `package.json`/`package-lock.json` changes, and not when only `docs/` changes.",
    ),
    start: deskOf(freshWorld({ workflows: [onPush({ paths: ["src/**"] })] })),
    hints: [
      l("`paths` bir liste: listedeki herhangi bir dosya değişirse workflow başlar.", "`paths` is a list: if any file on it changes, the workflow starts."),
      l("Listeye iki dosyayı daha ekle: `package.json` ve `package-lock.json`.", "Add two more files to the list: `package.json` and `package-lock.json`."),
      l(
        "`nano .github/workflows/ci.yml` → `paths: ['src/**', 'package.json', 'package-lock.json']` → `git commit -am \"ci: dependencies are code too\"` → `git push`",
        "`nano .github/workflows/ci.yml` → `paths: ['src/**', 'package.json', 'package-lock.json']` → `git commit -am \"ci: dependencies are code too\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state);
      const runs = (paths: string[]) => wouldStart(wf, "push", "main", paths);
      return runs(["package-lock.json"]) && runs(["package.json"]) && runs(["src/cart.ts"]) && !runs(["docs/guide.md"]);
    },
  },
  {
    id: "nested-docs",
    title: l("İç içe dokümanlar", "Nested docs"),
    story: l(
      "Doküman değişikliklerinin CI başlatmaması için `paths-ignore: ['docs/*', '*.md']` yazılmış. Ama `docs/api/auth.md` ya da `api/README.md` değişince CI yine çalışıyor ve ekip nedenini anlamıyor.",
      "To keep docs changes from starting CI, someone wrote `paths-ignore: ['docs/*', '*.md']`. But when `docs/api/auth.md` or `api/README.md` changes, CI still runs, and the team can't see why.",
    ),
    goal: l(
      "`docs/` altındaki **herhangi bir** dosya ya da **herhangi bir** klasördeki `.md` dosyası tek başına değişince CI başlamasın; `src/` değişince başlasın.",
      "When only files anywhere under `docs/`, or `.md` files in any folder, change, CI doesn't start; when `src/` changes, it does.",
    ),
    start: deskOf(freshWorld({ workflows: [onPush({ pathsIgnore: ["docs/*", "*.md"] })] })),
    hints: [
      l("Filtrelerde `*` klasör sınırını geçmez: `docs/*` sadece `docs/guide.md`'yi yakalar, `docs/api/auth.md`'yi değil.", "In filters, `*` doesn't cross folders: `docs/*` catches `docs/guide.md` but not `docs/api/auth.md`."),
      l("Klasörlerin içine inmek için `**`: `docs/**` ve `**/*.md`.", "To go into folders, use `**`: `docs/**` and `**/*.md`."),
      l(
        "`nano .github/workflows/ci.yml` → `paths-ignore: ['docs/**', '**/*.md']` → `git commit -am \"ci: ignore nested docs\"` → `git push`",
        "`nano .github/workflows/ci.yml` → `paths-ignore: ['docs/**', '**/*.md']` → `git commit -am \"ci: ignore nested docs\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state);
      const runs = (paths: string[]) => wouldStart(wf, "push", "main", paths);
      return ["docs/api/auth.md", "docs/guide.md", "api/README.md", "README.md"].every((p) => !runs([p])) && runs(["src/cart.ts"]) && runs(["docs/guide.md", "src/cart.ts"]);
    },
  },
];
