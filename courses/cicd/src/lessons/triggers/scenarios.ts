import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, wouldStart, type CiScenario } from "../shared/ci";
import { trig } from "./workflow";

/** The shop with one CI workflow, checked out on main, folder and GitHub in sync. */
const shop = (o: Parameters<typeof trig>[0]) => deskOf(freshWorld({ workflows: [trig(o)] }));

/** A `coupons` branch a teammate already pushed; its pushes start nothing under main-only CI. */
const withCoupons = (() => {
  const w = freshWorld({ workflows: [trig({ mainOnly: true })] });
  return deskOf(apply(w, { type: "push", branch: "coupons", paths: ["src/coupons.ts"], message: "coupons: form" }).state);
})();

const SRC = ["src/app.ts"];
const DOCS = ["README.md", "docs/guide.md"];

export const scenarios: CiScenario[] = [
  {
    id: "main-only",
    title: l("Dakika yakıyor", "Burning minutes"),
    story: l(
      "Ekipte herkes günde onlarca kez kendi branch'ine push'luyor ve CI her birinde baştan çalışıyor. Bu ayın Actions dakikaları yarıda bitti. Ekip, CI'ın sadece `main`'e gelen push'larda çalışmasına karar verdi.",
      "Everyone on the team pushes to their own branch dozens of times a day, and CI runs from scratch on every one. This month's Actions minutes ran out halfway through. The team decided CI should run only on pushes to `main`.",
    ),
    goal: l("GitHub'daki workflow, `main`'e push'ta çalışsın, başka branch'lere push'ta çalışmasın.", "The workflow on GitHub runs on pushes to `main` and not on pushes to other branches."),
    start: shop({}),
    hints: [
      l("Workflow dosyası `.github/workflows/ci.yml`. `nano` ile aç; değişiklik ancak **push'landığında** GitHub'da geçerli olur.", "The workflow file is `.github/workflows/ci.yml`. Open it with `nano`; a change only counts on GitHub once it is **pushed**."),
      l("`push:` olayının altına bir `branches:` filtresi ekle.", "Add a `branches:` filter under the `push:` event."),
      l("`nano .github/workflows/ci.yml` → `push:` altına `    branches: [main]` → `git commit -am \"CI only on main\"` → `git push`", "`nano .github/workflows/ci.yml` → under `push:` add `    branches: [main]` → `git commit -am \"CI only on main\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state);
      return wouldStart(wf, "push", "main", SRC) && !wouldStart(wf, "push", "feature/login", SRC) && !wouldStart(wf, "push", "fix-typo", SRC);
    },
  },
  {
    id: "pr-checks",
    title: l("PR'da yeşil tik", "A green tick on the PR"),
    story: l(
      "CI artık sadece `main`'de çalışıyor, ama bu yüzden hatalar ancak merge'den **sonra** görünüyor. Bora `coupons` branch'ini push'ladı ve inceleme bekliyor. İnceleyen kişi, PR'da testlerin geçtiğini görmek istiyor.",
      "CI now runs only on `main`, so bugs only show up **after** the merge. Bora pushed the `coupons` branch and is waiting for a review. The reviewer wants to see the tests pass on the PR.",
    ),
    goal: l("`main`'e açılan PR'larda CI çalışsın ve `coupons` için açılan bir PR'da gerçekten bir run başlasın.", "CI runs on PRs into `main`, and a PR opened for `coupons` actually starts a run."),
    start: withCoupons,
    hints: [
      l("PR'lar ayrı bir olay: `pull_request`. Önce workflow'a ekleyip push'la, sonra PR'ı aç.", "PRs are a separate event: `pull_request`. Add it to the workflow and push first, then open the PR."),
      l("`on:` altına `pull_request:` ve `branches: [main]` ekle. PR'ı `gh pr create` açar; başka bir branch için `--head`.", "Under `on:` add `pull_request:` with `branches: [main]`. `gh pr create` opens the PR; `--head` for another branch."),
      l(
        "`nano .github/workflows/ci.yml` → `  pull_request:` ve `    branches: [main]` ekle → `git commit -am \"CI on PRs\"` → `git push` → `gh pr create --head coupons`",
        "`nano .github/workflows/ci.yml` → add `  pull_request:` and `    branches: [main]` → `git commit -am \"CI on PRs\"` → `git push` → `gh pr create --head coupons`",
      ),
    ],
    par: 4,
    check: (ctx) =>
      wouldStart(liveWorkflow(ctx.state), "pull_request", "main", SRC) && ctx.state.world.runs.some((r) => r.event === "pull_request" && r.branch === "coupons"),
  },
  {
    id: "by-hand",
    title: l("Push'suz çalıştır", "Run it without a push"),
    story: l(
      "Dün gece bir bağımlılık sunucusu çöktü ve `main`'deki son run kırmızı kaldı; kodda bir sorun yok. Sırf CI'ı yeniden başlatmak için boş bir commit push'lamak istemiyorsun. Workflow'a bir \"Run workflow\" düğmesi ekleyip onu kullanacaksın.",
      "Last night a package server went down and the last run on `main` stayed red; nothing is wrong with the code. You don't want to push an empty commit just to start CI again. You'll give the workflow a \"Run workflow\" button and use it.",
    ),
    goal: l("Workflow elle başlatılabilsin ve elle başlatılmış (`workflow_dispatch`) bir run olsun.", "The workflow can be started by hand, and there is a run started by hand (`workflow_dispatch`)."),
    start: shop({ mainOnly: true }),
    hints: [
      l("Elle başlatmak için workflow'un bunu kabul etmesi gerekir: bir olay daha.", "To start it by hand, the workflow has to accept that: one more event."),
      l("`on:` altına `workflow_dispatch:` ekle, push'la. Terminalden düğmeye basmak `gh workflow run`.", "Add `workflow_dispatch:` under `on:` and push. Pressing the button from the terminal is `gh workflow run`."),
      l("`nano .github/workflows/ci.yml` → `  workflow_dispatch:` ekle → `git commit -am \"Allow manual runs\"` → `git push` → `gh workflow run ci.yml`", "`nano .github/workflows/ci.yml` → add `  workflow_dispatch:` → `git commit -am \"Allow manual runs\"` → `git push` → `gh workflow run ci.yml`"),
    ],
    par: 4,
    check: (ctx) => Boolean(liveWorkflow(ctx.state)?.on.dispatch) && ctx.state.world.runs.some((r) => r.event === "dispatch"),
  },
  {
    id: "docs-quiet",
    title: l("Sadece belge", "Just docs"),
    story: l(
      "Teknik yazar her gün `README.md` ve `docs/` altındaki rehberleri düzeltiyor. Her düzeltme 4 dakikalık bir CI başlatıyor ve kod değişmediği için hep yeşil çıkıyor.",
      "The technical writer fixes `README.md` and the guides under `docs/` every day. Every fix starts a 4-minute CI run that is always green, since no code changed.",
    ),
    goal: l("Sadece `README.md` ya da `docs/` altını değiştiren bir push CI başlatmasın; `src/` değişince başlatsın.", "A push that only changes `README.md` or files under `docs/` starts no CI; a change to `src/` does."),
    start: shop({ mainOnly: true }),
    hints: [
      l("`push:` filtresi branch'lerin yanında dosyalara da bakabilir.", "The `push:` filter can look at files as well as branches."),
      l("`paths-ignore:` listesindeki dosyalar **sadece** onlar değiştiyse run başlatmaz.", "Files in a `paths-ignore:` list start no run when they are the **only** ones that changed."),
      l("`nano .github/workflows/ci.yml` → `push:` altına `    paths-ignore: ['docs/**', '**/*.md']` → `git commit -am \"Skip CI for docs\"` → `git push`", "`nano .github/workflows/ci.yml` → under `push:` add `    paths-ignore: ['docs/**', '**/*.md']` → `git commit -am \"Skip CI for docs\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state);
      return DOCS.every((p) => !wouldStart(wf, "push", "main", [p])) && !wouldStart(wf, "push", "main", DOCS) && wouldStart(wf, "push", "main", SRC) && wouldStart(wf, "push", "main", ["README.md", "src/app.ts"]);
    },
  },
  {
    id: "nightly",
    title: l("Gece kontrolü", "Nightly check"),
    story: l(
      "Gün içinde kimse push'lamasa bile, dışarıdaki bağımlılıklar değişince testler bozulabiliyor. Ekip, CI'ın her gece saat 03:00'te (UTC) kendiliğinden çalışmasını istiyor.",
      "Even on days nobody pushes, tests can break when outside dependencies change. The team wants CI to run on its own every night at 03:00 (UTC).",
    ),
    goal: l("GitHub'daki workflow her gece 03:00 UTC'de çalışacak şekilde zamanlansın; push'larda çalışmaya devam etsin.", "The workflow on GitHub is scheduled for 03:00 UTC every night, and still runs on pushes."),
    start: shop({ mainOnly: true }),
    hints: [
      l("Saate bağlı çalışma da bir olay: `schedule`, içinde bir `cron` satırıyla.", "Running on the clock is an event too: `schedule`, with a `cron` line in it."),
      l("Cron beş alandır: dakika saat gün ay haftanın-günü. Her gece 03:00 → `0 3 * * *`.", "Cron has five fields: minute hour day month weekday. Every night at 03:00 → `0 3 * * *`."),
      l("`nano .github/workflows/ci.yml` → `  schedule:` ve `    - cron: '0 3 * * *'` ekle → `git commit -am \"Nightly CI\"` → `git push`", "`nano .github/workflows/ci.yml` → add `  schedule:` and `    - cron: '0 3 * * *'` → `git commit -am \"Nightly CI\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const wf = liveWorkflow(ctx.state);
      return wf?.on.schedule?.trim().replace(/\s+/g, " ") === "0 3 * * *" && wouldStart(wf, "push", "main", SRC);
    },
  },
];
