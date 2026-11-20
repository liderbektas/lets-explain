import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, type CiAction, type CiEvent, type Run, type StepDef, type Workflow } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { CHECKOUT, INSTALL, SETUP, TEST, step } from "../../engine/presets";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";

/** The test job with a given cache step (none, keyed by the lockfile, a fixed key, or the commit). */
function wf(cache: "none" | "hash" | "sha" | "stale"): Workflow {
  const steps: StepDef[] =
    cache === "none"
      ? [CHECKOUT, SETUP, INSTALL, TEST]
      : cache === "stale"
        ? [CHECKOUT, SETUP, step("cache", { with: { path: "node_modules", key: "static" } }), step("install", { if: "cache-miss" }), TEST]
        : [CHECKOUT, SETUP, step("cache", cache === "sha" ? { with: { key: "sha" } } : {}), INSTALL, TEST];
  return { name: "CI", on: { push: { branches: ["main"] } }, jobs: [{ id: "test", steps }] };
}

const code = (message: string): CiAction => ({ type: "push", paths: ["src/cart.ts"], message });
const dependency: CiAction = { type: "push", lock: true, paths: ["package.json", "package-lock.json", "src/date.ts"], message: "add dayjs for dates" };

/** main with this workflow and these pushes already behind it. */
function shop(cache: Parameters<typeof wf>[0], pushes: CiAction[]): Desk {
  let w = freshWorld({ workflows: [wf(cache)] });
  for (const a of pushes) w = apply(w, a).state;
  return deskOf(w);
}

const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const installSeconds = (r: Run) => r.jobs[0]?.steps.find((s) => s.kind === "install" && s.status === "success")?.seconds;
const cacheEvents = (ctx: DeskCtx) => ctx.events.flat().filter((e): e is Extract<CiEvent, { type: "cache" }> => e.type === "cache");

/** The cache can never hand back node_modules from an older lockfile: either the key follows the lockfile, or npm ci always runs. */
function safeCache(wf: Workflow | undefined): boolean {
  const steps = wf?.jobs.flatMap((j) => j.steps) ?? [];
  const modules = steps.filter((s) => s.kind === "cache" && s.with?.path === "node_modules");
  const skipsInstall = steps.some((s) => s.kind === "install" && s.if === "cache-miss");
  return modules.every((s) => s.with?.key !== "static" && s.with?.key !== "sha") || !skipsInstall;
}

const CACHE_STEP = l(
  "`npm ci`'dan önce, `setup-node`'un hemen altına: `- uses: actions/cache@v4` · `with:` · `path: ~/.npm` · `key: npm-${{ hashFiles('package-lock.json') }}`",
  "Just under `setup-node`, before `npm ci`: `- uses: actions/cache@v4` · `with:` · `path: ~/.npm` · `key: npm-${{ hashFiles('package-lock.json') }}`",
);

export const scenarios: CiScenario[] = [
  {
    id: "warm",
    title: l("Her seferinde 45 saniye", "45 seconds, every time"),
    story: l(
      "Takımın CI'ı gün boyu çalışıyor ve her run'ın ilk 45 saniyesi `npm ci`'a gidiyor: aynı 412 paket her seferinde internetten iniyor. Paketler sadece `package-lock.json` değişince değişiyor.",
      "The team's CI runs all day, and the first 45 seconds of every run go to `npm ci`: the same 412 packages come down from the internet every time. The packages only change when `package-lock.json` does.",
    ),
    goal: l("Bir run'da `npm ci` cache'ten gelen paketlerle **12 saniyede** bitsin.", "Get a run where `npm ci` finishes in **12 seconds**, using packages from the cache."),
    start: shop("none", [code("cart: add VAT")]),
    hints: [
      l("Cache ilk run'da boştur: o run kaydeder, **sonraki** run kullanır. Aynı commit'i yeniden çalıştırmak da bir sonraki run sayılır.", "The cache is empty on the first run: that run saves, the **next** run uses it. Running the same commit again counts as a next run too."),
      CACHE_STEP,
      l(
        "`nano .github/workflows/ci.yml` → cache adımını ekle → `git commit -am \"ci: cache npm\"` → `git push` → `gh run list` ile yeni run'ın numarasına bak → `gh run rerun 2`",
        "`nano .github/workflows/ci.yml` → add the cache step → `git commit -am \"ci: cache npm\"` → `git push` → check the new run's number with `gh run list` → `gh run rerun 2`",
      ),
    ],
    par: 4,
    check: (ctx) => fresh(ctx).some((r) => installSeconds(r) === 12),
  },
  {
    id: "new-dependency",
    title: l("Yeni bağımlılık", "A new dependency"),
    story: l(
      "CI artık `~/.npm`'yi lockfile'ın hash'iyle cache'liyor ve hızlı. Tarihleri biçimlendirmek için `dayjs` lazım. Bora endişeli: \"Cache eski paketleri getirir, CI kırılır.\" Ona tersini göster.",
      "CI now caches `~/.npm` keyed by the lockfile's hash, and it is fast. You need `dayjs` to format dates. Bora is worried: \"The cache will bring back the old packages and CI will break.\" Show Bora otherwise.",
    ),
    goal: l(
      "`dayjs`'i ekleyip push'la: o run cache'te **yeni bir anahtarla miss** olsun ve yine de yeşil bitsin.",
      "Add `dayjs` and push: that run **misses on a new cache key** and still finishes green.",
    ),
    start: shop("hash", [code("cart: add VAT"), code("cart: round totals")]),
    hints: [
      l("Bağımlılık eklemek iki dosyayı değiştirir: `package.json` ve `package-lock.json`. Anahtar ikincisinin hash'i.", "Adding a dependency changes two files: `package.json` and `package-lock.json`. The key is the second one's hash."),
      l("`npm install dayjs` ikisini de günceller; sonra ikisini birlikte commit'le.", "`npm install dayjs` updates both; then commit them together."),
      l("`npm install dayjs` → `git commit -am \"add dayjs for dates\"` → `git push`", "`npm install dayjs` → `git commit -am \"add dayjs for dates\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const before = new Set(Object.keys(ctx.start.world.cache));
      const lock = (r: Run) => commitOf(ctx.state.world, r.sha).lock;
      const startLock = commitOf(ctx.start.world, ctx.start.world.heads.main!).lock;
      return fresh(ctx).some(
        (r) =>
          r.status === "success" &&
          lock(r) > startLock &&
          cacheEvents(ctx).some((e) => e.run === r.id && e.result === "miss" && !before.has(e.key)) &&
          /"dayjs"/.test(ctx.state.remote.main?.["package.json"] ?? ""),
      );
    },
  },
  {
    id: "stale",
    title: l("Bayat node_modules", "Stale node_modules"),
    story: l(
      "Biri CI'ı hızlandırmak için `node_modules`'ü sabit bir anahtarla cache'lemiş ve cache bulunduğunda `npm ci`'ı atlıyor. Dün `dayjs` eklendi ve o günden beri testler `Cannot find module 'dayjs'` ile kırılıyor.",
      "Someone sped up CI by caching `node_modules` under a fixed key and skipping `npm ci` when the cache is found. Yesterday `dayjs` was added, and since then the tests fail with `Cannot find module 'dayjs'`.",
    ),
    goal: l(
      "CI yeniden yeşile dönsün ve bir dahaki bağımlılık değişikliğinde **aynı tuzağa düşmesin**.",
      "Get CI green again, in a way that **won't fall into the same trap** the next time a dependency changes.",
    ),
    start: shop("stale", [code("cart: add VAT"), dependency]),
    hints: [
      l("`gh run view --log-failed`: `node_modules` cache'ten geldi, ama lockfile o kayıttan beri değişti. Anahtar hiç değişmiyorsa cache neyi geri getirir?", "`gh run view --log-failed`: `node_modules` came from the cache, but the lockfile changed since that entry. If the key never changes, what does the cache bring back?"),
      l("Anahtarı lockfile'a bağla: `key: node_modules-${{ hashFiles('package-lock.json') }}`. (Ya da `npm ci`'ı her zaman çalıştır.)", "Tie the key to the lockfile: `key: node_modules-${{ hashFiles('package-lock.json') }}`. (Or always run `npm ci`.)"),
      l(
        "`nano .github/workflows/ci.yml` → `key: node_modules-deps` yerine `key: node_modules-${{ hashFiles('package-lock.json') }}` → `git commit -am \"ci: key the cache on the lockfile\"` → `git push`",
        "`nano .github/workflows/ci.yml` → replace `key: node_modules-deps` with `key: node_modules-${{ hashFiles('package-lock.json') }}` → `git commit -am \"ci: key the cache on the lockfile\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => safeCache(liveWorkflow(ctx.state)) && fresh(ctx).some((r) => r.status === "success"),
  },
  {
    id: "never-hits",
    title: l("Hiç tutmayan cache", "A cache that never hits"),
    story: l(
      "CI'da bir cache adımı var ama her run'ın logunda `Cache not found` yazıyor ve `npm ci` hep 45 saniye. Anahtara bakan kimse olmamış.",
      "CI has a cache step, but every run's log says `Cache not found`, and `npm ci` always takes 45 seconds. Nobody has looked at the key.",
    ),
    goal: l(
      "Arka arkaya iki **farklı commit**'in ikincisinde `npm ci` cache sayesinde 12 saniyede bitsin (yeniden çalıştırma değil, yeni bir push).",
      "Get two **different commits** in a row where the second one's `npm ci` takes 12 seconds thanks to the cache (a new push, not a re-run).",
    ),
    start: shop("sha", [code("cart: add VAT"), code("cart: round totals")]),
    hints: [
      l("`cat .github/workflows/ci.yml`: anahtar `github.sha`'ya bağlı. Her commit'in sha'sı farklı; yeni bir commit hangi anahtarı arar?", "`cat .github/workflows/ci.yml`: the key depends on `github.sha`. Every commit has a different sha; which key does a new commit look for?"),
      l("Anahtar, paketler değişince değişmeli, başka zaman değil: `npm-${{ hashFiles('package-lock.json') }}`. Sonra iki push gerekir: biri kaydeder, öbürü kullanır.", "The key should change when the packages change, and not otherwise: `npm-${{ hashFiles('package-lock.json') }}`. Then it takes two pushes: one saves, the other uses it."),
      l(
        "`nano .github/workflows/ci.yml` (anahtarı düzelt) → `git commit -am \"ci: key the cache on the lockfile\"` → `git push` → `echo \"// tidy\" >> src/app.ts` → `git commit -am \"tidy\"` → `git push`",
        "`nano .github/workflows/ci.yml` (fix the key) → `git commit -am \"ci: key the cache on the lockfile\"` → `git push` → `echo \"// tidy\" >> src/app.ts` → `git commit -am \"tidy\"` → `git push`",
      ),
    ],
    par: 6,
    check: (ctx) => fresh(ctx).some((r) => r.attempt === 1 && installSeconds(r) === 12),
  },
];
