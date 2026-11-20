import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { IGNORE, MONO, prWorkflow, scene } from "./Scene";

export const pathFilters: Lesson = {
  slug: "path-filters",
  title: l("Sadece değişen kod için çalıştır", "Run only for what changed"),
  summary: l(
    "`paths` ve `paths-ignore` ile bir README düzeltmesi testleri çalıştırmaz; monorepoda sadece değişen uygulamanın job'ı çalışır. Ama zorunlu bir check'i path filtresiyle susturursan PR sonsuza kadar bekler; çözümü de göreceğiz.",
    "With `paths` and `paths-ignore` a README fix does not run the tests, and in a monorepo only the changed app's job runs. But silence a required check with a path filter and the PR waits forever; we will see the fix too.",
  ),
  minutes: 16,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`paths-ignore` ile dokümana dokunan push'larda CI'ı atlamak", "Skip CI on pushes that only touch docs with `paths-ignore`"), step: 1 },
    { text: l("Bir monorepoda sadece değişen kısmın job'ını çalıştırmak", "Run only the changed part's job in a monorepo"), step: 3 },
    { text: l("Zorunlu check + path filtresi tuzağını tanımak", "Recognise the required check + path filter trap"), step: 4 },
    { text: l("Tuzağı job seviyesinde atlayarak çözmek", "Fix the trap by skipping at the job level"), step: 5 },
  ],
  steps: [
    {
      short: l("Boşa test", "Wasted tests"),
      tag: "problem",
      title: l("Bir yazım hatası için üç dakika", "Three minutes for a typo"),
      body: [
        l(
          "README'deki bir yazım hatasını düzelttik ve push'ladık. CI baştan sona çalıştı: `npm ci`, lint, 70 saniyelik testler, build. Toplam 2 dakika 53 saniye ve 3 dakika faturalandı.",
          "We fixed a typo in the README and pushed. CI ran end to end: `npm ci`, lint, 70 seconds of tests, the build. 2 minutes 53 seconds in all, 3 minutes billed.",
        ),
        l(
          "Bir Markdown dosyası uygulamanın hiçbir testini değiştiremez. Günde onlarca böyle push olan bir ekipte bu hem dakika hem bekleme demek.",
          "A Markdown file cannot change the result of any test. In a team with dozens of such pushes a day, that is both minutes and waiting.",
        ),
      ],
    },
    {
      short: l("paths-ignore", "paths-ignore"),
      tag: "how",
      title: l("paths-ignore: bu dosyalar değiştiyse çalışma", "paths-ignore: do not run if only these changed"),
      body: [
        l(
          "Tetikleyiciye bir [[pathFilter|path filtresi]] ekledik: `paths-ignore: [docs/**, '**/*.md']`. Aynı README push'u bu sefer hiçbir run başlatmadı. Ardından `src/cart.ts`'yi değiştiren push geldi ve CI normal şekilde çalıştı.",
          "We added a [[pathFilter|path filter]] to the trigger: `paths-ignore: [docs/**, '**/*.md']`. The same README push started no run this time. Then a push changing `src/cart.ts` came and CI ran as usual.",
        ),
        l(
          "`**` klasörleri de kapsar, `*` kapsamaz: `**/*.md` her klasördeki Markdown dosyalarını, `*.md` sadece kök dizindekileri tutar. Tersini istersen `paths:` yazarsın: \"sadece bunlar değişince çalış\".",
          "`**` crosses folders, `*` does not: `**/*.md` matches Markdown in every folder, `*.md` only in the root. For the opposite, write `paths:`: \"run only when these change\".",
        ),
      ],
      practice: {
        snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(IGNORE) }],
        commands: [{ cmd: "git diff --name-only HEAD~1", note: l("Son commit'in değiştirdiği dosyalar: filtre bunlara bakar.", "The files the last commit changed: the filter looks at these.") }],
      },
    },
    {
      short: l("Karışık commit", "Mixed commit"),
      tag: "experiment",
      predict: {
        question: l(
          "Bir commit hem `README.md`'yi hem `src/cart.ts`'yi değiştiriyor. `paths-ignore: [docs/**, '**/*.md']` varken CI çalışır mı?",
          "One commit changes both `README.md` and `src/cart.ts`. With `paths-ignore: [docs/**, '**/*.md']`, does CI run?",
        ),
        options: [
          l("Hayır, README yüzünden atlanır", "No, the README makes it skip"),
          l("Evet: atlamak için değişen **bütün** dosyaların yok sayılması gerekir", "Yes: to skip, **every** changed file must be ignored"),
          l("Sadece yarısı çalışır", "Only half of it runs"),
        ],
        answer: 1,
        why: l(
          "`paths-ignore` ancak değişen dosyaların hepsi listedeyse workflow'u atlar. Tek bir kod dosyası bile yeter.",
          "`paths-ignore` only skips the workflow when every changed file is on the list. One code file is enough to run it.",
        ),
      },
      title: l("Tek bir kod dosyası yeter", "One code file is enough"),
      body: [
        l(
          "Run #3 başladı ve yeşil bitti. Filtre workflow'un tamamını açıp kapatır: ya her şey çalışır ya hiçbir şey.",
          "Run #3 started and finished green. The filter switches the whole workflow on or off: either everything runs or nothing does.",
        ),
      ],
    },
    {
      short: l("Monorepo", "Monorepo"),
      tag: "how",
      predict: {
        question: l(
          "Repoda `web/` ve `api/` diye iki uygulama var. Bir commit sadece `web/index.html`'i değiştirdi. Hangi test job'ları çalışır?",
          "The repo has two apps, `web/` and `api/`. A commit changed only `web/index.html`. Which test jobs run?",
        ),
        options: [l("İkisi de", "Both"), l("Sadece `web`; `api` atlanır", "Only `web`; `api` is skipped"), l("Hiçbiri", "Neither")],
        answer: 1,
        why: l(
          "`changes` job'ı hangi klasörlerin değiştiğini çıktı olarak verir; her test job'ı kendi `if:` koşuluna bakar.",
          "The `changes` job outputs which folders changed; each test job checks its own `if:`.",
        ),
      },
      title: l("Workflow aynı, job'lar seçici", "Same workflow, choosy jobs"),
      body: [
        l(
          "Bir monorepoda workflow'u açıp kapatmak yetmez: bir şey değişince hepsi çalışır. Bunun yerine önce küçük bir `changes` job'ı `dorny/paths-filter` ile neyin değiştiğine bakar: `web=true`, `api=false`.",
          "In a monorepo switching the whole workflow is not enough: change anything and everything runs. Instead, a small `changes` job first checks what changed with `dorny/paths-filter`: `web=true`, `api=false`.",
        ),
        l(
          "Diğer job'lar `needs: changes` ile onu bekler ve `if: needs.changes.outputs.web == 'true'` gibi bir koşulla kendine karar verir. Run'da `web` çalıştı, `api` atlandı.",
          "The other jobs wait for it with `needs: changes` and decide with a condition like `if: needs.changes.outputs.web == 'true'`. In the run `web` ran and `api` was skipped.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(MONO), note: l("Filtre adları (`web`, `api`) job çıktısı olarak `needs.changes.outputs.<ad>` ile okunur.", "Filter names (`web`, `api`) are read as job outputs with `needs.changes.outputs.<name>`.") }] },
    },
    {
      short: l("Tuzak", "The trap"),
      tag: "experiment",
      predict: {
        question: l(
          "main korumalı ve `CI / test` zorunlu check. PR workflow'unda `paths: [src/**]` var. Sadece `docs/guide.md`'yi değiştiren bir PR açıldı. Ne olur?",
          "main is protected and `CI / test` is a required check. The PR workflow has `paths: [src/**]`. A PR changing only `docs/guide.md` is opened. What happens?",
        ),
        options: [
          l("CI atlanır, PR merge edilebilir", "CI is skipped, the PR can merge"),
          l("PR merge edilemez: zorunlu check hiç raporlanmaz ve hep \"bekleniyor\" kalır", "The PR cannot merge: the required check never reports and stays \"expected\""),
          l("GitHub CI'ı yine de çalıştırır", "GitHub runs CI anyway"),
        ],
        answer: 1,
        why: l(
          "Workflow hiç başlamadığı için `CI / test` diye bir check de oluşmadı. Branch protection ise o adda geçmiş bir check bekliyor.",
          "The workflow never started, so no check called `CI / test` exists. Branch protection keeps waiting for a passing check with that name.",
        ),
      },
      title: l("Hiç gelmeyen check", "The check that never comes"),
      body: [
        l(
          "PR #1 açıldı, workflow filtreye takıldı ve başlamadı. PR'da `CI / test` için \"bekleniyor\" yazıyor ve merge düğmesi kilitli. Merge denememiz de reddedildi.",
          "PR #1 opened, the workflow hit the filter and did not start. The PR shows `CI / test` as \"expected\" and the merge button is locked. Our merge attempt was refused too.",
        ),
        l(
          "Ekipler bunu genelde \"bir kere boş bir commit atalım\" ya da \"korumayı geçici kapatalım\" diye çözer. İkisi de kötü fikir.",
          "Teams often get around it with \"let us push an empty commit\" or \"switch protection off for a minute\". Both are bad ideas.",
        ),
      ],
    },
    {
      short: l("Çözüm", "The fix"),
      tag: "how",
      title: l("Workflow hep başlasın, job atlasın", "Always start the workflow, skip the job"),
      body: [
        l(
          "Path filtresini tetikleyiciden kaldırdık ve monorepodaki yöntemi kullandık: `changes` job'ı `src/**` değişti mi diye bakıyor, `test` job'ı `if:` ile kendini atlıyor.",
          "We removed the path filter from the trigger and used the monorepo trick: the `changes` job checks whether `src/**` changed, and the `test` job skips itself with `if:`.",
        ),
        l(
          "Yeni bir doküman push'u geldi: workflow başladı, `test` atlandı. GitHub atlanan bir job'ı **geçmiş** sayar, bu yüzden zorunlu check yeşile döndü ve PR merge edildi. Testler sıfır dakika harcadı.",
          "A new docs push came: the workflow started and `test` was skipped. GitHub counts a skipped job as **passing**, so the required check turned green and the PR merged. The tests cost zero minutes.",
        ),
      ],
      practice: {
        snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(prWorkflow(false, true)) }],
        commands: [{ cmd: "gh pr checks", note: l("PR'ın check'lerini ve durumlarını terminalde gör.", "See the PR's checks and their state in the terminal.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Ne zaman hangisi:** zorunlu olmayan workflow'larda (doküman sitesi, gece build'i) `paths` / `paths-ignore` en basit çözüm. Zorunlu check'lerde ise workflow'u hep başlat ve job'ı atla.",
          "**Which when:** for workflows that are not required (a docs site, a nightly build) `paths` / `paths-ignore` is the simplest. For required checks, always start the workflow and skip the job.",
        ),
        l(
          "**Filtreyi dar tutma:** `src/**` yazıp `package.json`'ı unutursan, bir bağımlılık güncellemesi testsiz geçer. Filtreye testleri etkileyen her şeyi ekle: lockfile, config dosyaları, workflow'un kendisi.",
          "**Do not make it too narrow:** write `src/**` and forget `package.json`, and a dependency update merges untested. Put everything that can change test results in the filter: the lockfile, config files, the workflow itself.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede bir PR'ın \"değişen dosyaları\" branch'teki bütün commit'lerin dosyaları. Gerçekte GitHub PR'larda base ile karşılaştırır, push'larda ise önceki commit'le; ilk push'ta ya da force-push'ta bu fark beklenmedik sonuç verebilir. `changes` job'ı da burada 3 saniye sürüyor; gerçekte runner'ın açılmasıyla birlikte 10-20 saniye bekleyebilirsin.",
            "On this stage a PR's \"changed files\" are the files of every commit on the branch. In reality GitHub compares PRs with the base and pushes with the previous commit, which can surprise you on a first push or a force-push. The `changes` job takes 3 seconds here; in reality, with the runner starting up, expect 10-20 seconds.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Aşağıda gerçek işten **4 senaryo** var: zorunlu check yüzünden kilitlenen bir PR, iki uygulamalı bir repo, unutulan bağımlılıklar ve iç içe dokümanlar. Workflow'u `nano .github/workflows/ci.yml` ile düzenle, `git commit` ve `git push` ile gönder; PR'ı `gh pr merge` ile merge et.",
          "Below are **4 scenarios** from real work: a PR stuck on a required check, a repo with two apps, forgotten dependencies, and nested docs. Edit the workflow with `nano .github/workflows/ci.yml`, send it with `git commit` and `git push`, and merge the PR with `gh pr merge`.",
        ),
        l(
          "Hatırla: `*` klasör sınırını geçmez, `**` geçer; workflow seviyesindeki bir filtre zorunlu check'i hiç raporlatmaz, job seviyesindeki bir `if` onu atlanmış olarak raporlar. Az komutla bitirirsen 3 yıldız alırsın.",
          "Remember: `*` doesn't cross folders, `**` does; a filter on the workflow means a required check is never reported, an `if` on the job reports it as skipped. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`paths-ignore` değişen dosyaların **hepsi** listedeyse workflow'u atlar; `paths` sadece listedekiler değişince çalıştırır.", "`paths-ignore` skips the workflow only if **every** changed file is listed; `paths` runs it only when listed files change."),
    l("`**` klasörleri kapsar, `*` kapsamaz: `**/*.md` her yerdeki Markdown'ı tutar.", "`**` crosses folders, `*` does not: `**/*.md` matches Markdown anywhere."),
    l("Monorepoda bir `changes` job'ı neyin değiştiğini söyler, diğer job'lar `if:` ile karar verir.", "In a monorepo a `changes` job says what changed and other jobs decide with `if:`."),
    l("Path filtresiyle hiç başlamayan zorunlu bir check \"bekleniyor\" kalır ve PR'ı kilitler.", "A required check whose workflow a path filter never starts stays \"expected\" and locks the PR."),
    l("Zorunlu check'lerde workflow'u hep başlat, job'ı atla: atlanan job geçmiş sayılır.", "For required checks, always start the workflow and skip the job: a skipped job counts as passing."),
  ],
  quiz: [
    {
      question: l("`paths-ignore: ['**/*.md']` varken bir commit `README.md` ve `src/app.ts`'yi değiştirdi. Ne olur?", "With `paths-ignore: ['**/*.md']`, a commit changes `README.md` and `src/app.ts`. What happens?"),
      options: [l("Workflow atlanır", "The workflow is skipped"), l("Workflow çalışır", "The workflow runs"), l("Sadece Markdown kontrol edilir", "Only the Markdown is checked"), l("Hata verir", "It errors")],
      answer: 1,
      explain: l("Atlamak için değişen dosyaların hepsinin yok sayılması gerekir; `src/app.ts` yok sayılmıyor.", "To skip, every changed file must be ignored; `src/app.ts` is not."),
      reviewStep: 2,
    },
    {
      question: l("`*.md` ile `**/*.md` arasındaki fark nedir?", "What is the difference between `*.md` and `**/*.md`?"),
      options: [
        l("Fark yok", "None"),
        l("`*.md` sadece kök dizindekileri, `**/*.md` her klasördekileri tutar", "`*.md` matches only the root, `**/*.md` every folder"),
        l("`**/*.md` sadece alt klasörleri tutar", "`**/*.md` matches only subfolders"),
        l("`*.md` dosya adında yıldız arar", "`*.md` looks for a star in the name"),
      ],
      answer: 1,
      explain: l("`*` bir klasör sınırını geçmez, `**` geçer.", "`*` does not cross a folder boundary, `**` does."),
      reviewStep: 1,
    },
    {
      question: l("Zorunlu bir check'in workflow'u path filtresi yüzünden başlamadı. PR'da ne görürsün?", "A required check's workflow did not start because of a path filter. What does the PR show?"),
      options: [l("Check atlandı, merge serbest", "The check was skipped, merge is open"), l("Check \"bekleniyor\", merge kilitli", "The check is \"expected\", merge is locked"), l("Check kırmızı", "The check is red"), l("Check otomatik yeşil", "The check turns green on its own")],
      answer: 1,
      explain: l("Hiç oluşmayan bir check'i GitHub bekler durur; atlanan bir job ise geçmiş sayılır.", "GitHub keeps waiting for a check that never appears; a skipped job, by contrast, counts as passing."),
      reviewStep: 4,
    },
    {
      question: l("Monorepoda sadece değişen uygulamanın testini çalıştırmanın yolu hangisi?", "How do you run only the changed app's tests in a monorepo?"),
      options: [
        l("Her uygulama için ayrı repo açmak", "One repo per app"),
        l("Bir `changes` job'ı + her test job'ında `needs` ve `if:`", "A `changes` job + `needs` and `if:` on each test job"),
        l("`[skip ci]` yazmak", "Writing `[skip ci]`"),
        l("Testleri gece çalıştırmak", "Running tests at night"),
      ],
      answer: 1,
      explain: l("`changes` job'ı çıktı verir, her job kendi koşuluna bakar; workflow her zaman başlar.", "The `changes` job outputs flags and each job checks its own condition; the workflow always starts."),
      reviewStep: 3,
    },
  ],
};
