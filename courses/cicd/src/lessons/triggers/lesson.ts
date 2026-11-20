import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { FINAL, scene, trig } from "./Scene";

export const triggers: Lesson = {
  slug: "triggers",
  title: l("Tetikleyiciler", "Triggers"),
  summary: l(
    "`on:` bir workflow'un ne zaman çalışacağını söyler: `push`, `pull_request`, `schedule` ve elle `workflow_dispatch`. Branch filtresi hangi branch'lerin sayılacağını seçer; dosya filtresiyle de ilk kez tanışırsın.",
    "`on:` says when a workflow runs: `push`, `pull_request`, `schedule` and the manual `workflow_dispatch`. A branch filter picks which branches count; you also meet the file filter for the first time.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`on: push`'un her branch'te çalıştığını görmek", "See that `on: push` runs on every branch"), step: 0 },
    { text: l("`branches:` filtresiyle push'ları main'e sınırlamak", "Limit pushes to main with a `branches:` filter"), step: 1 },
    { text: l("`pull_request` ile PR'larda kontrol çalıştırmak", "Run checks on PRs with `pull_request`"), step: 2 },
    { text: l("`schedule` ve `workflow_dispatch` ile push'suz run başlatmak", "Start runs without a push using `schedule` and `workflow_dispatch`"), step: 4 },
  ],
  steps: [
    {
      short: l("on: push", "on: push"),
      tag: "how",
      title: l("on: push: her push bir run", "on: push: every push is a run"),
      body: [
        l(
          "Workflow'umuz şimdilik sadece `on: push` diyor, filtresiz. main'e bir push geldi: run #1. Sonra biri `feature` branch'ine yarım bir iş push'ladı: run #2.",
          "Our workflow just says `on: push` for now, with no filter. A push landed on main: run #1. Then someone pushed half-done work to a `feature` branch: run #2.",
        ),
        l(
          "Filtresiz `push` **her branch'teki her push**'u dinler. Bu bazen istediğin şeydir, ama çok branch'li bir ekipte gereksiz dakika harcar.",
          "An unfiltered `push` listens to **every push on every branch**. Sometimes that is what you want, but in a team with many branches it burns minutes for nothing.",
        ),
      ],
    },
    {
      short: l("Branch filtresi", "Branch filter"),
      tag: "experiment",
      predict: {
        question: l("`push:` altına `branches: [main]` yazdık. `feature`'a bir push daha gelirse ne olur?", "We wrote `branches: [main]` under `push:`. What happens on another push to `feature`?"),
        options: [l("Yine run başlar", "A run starts again"), l("Run başlamaz", "No run starts"), l("Run başlar ama main'in koduyla", "A run starts, but with main's code")],
        answer: 1,
        why: l("Filtre, push'un hangi branch'e geldiğine bakar. `feature` listede olmadığı için workflow hiç çalışmaz.", "The filter looks at which branch the push went to. `feature` is not on the list, so the workflow does not run at all."),
      },
      title: l("branches: hangi branch'lerin sayılacağını seçer", "branches: picks which branches count"),
      body: [
        l(
          "Sağdaki listede yeni `feature` push'u \"run başlamadı\" diyor. Olaylar listesinde de sebebi yazar: branch filtresine uymuyor.",
          "In the list on the right, the new `feature` push says \"no run started\". The event list gives the reason: the branch filter does not match.",
        ),
        l(
          "`branches` glob da kabul eder: `release/**` bütün `release/` branch'lerini yakalar. Tersi için `branches-ignore` vardır.",
          "`branches` takes globs too: `release/**` catches every `release/` branch. For the opposite there is `branches-ignore`.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(trig({ mainOnly: true })) }] },
    },
    {
      short: l("pull_request", "pull_request"),
      tag: "how",
      predict: {
        question: l(
          "`pull_request` ekledik ve `feature → main` PR'ı açtık. Sonra `feature`'a bir commit daha push'landı. Ne çalışır?",
          "We added `pull_request` and opened a `feature → main` PR. Then another commit was pushed to `feature`. What runs?",
        ),
        options: [
          l("Hiçbir şey: push filtresi `feature`'ı dışarıda bırakıyor", "Nothing: the push filter leaves `feature` out"),
          l("Bir `pull_request` run'ı: PR'ın kodu değişti", "A `pull_request` run: the PR's code changed"),
          l("Hem push hem pull_request run'ı", "Both a push run and a pull_request run"),
        ],
        answer: 1,
        why: l(
          "PR açıkken branch'ine gelen her push PR'ı günceller ve `pull_request` olayını yeniden tetikler. `push` olayı ise hâlâ sadece main'i dinliyor.",
          "While a PR is open, every push to its branch updates the PR and fires `pull_request` again. The `push` event still listens to main only.",
        ),
      },
      title: l("pull_request: merge'den önce kontrol", "pull_request: checks before the merge"),
      body: [
        l(
          "PR açılınca bir run başladı, yeni commit gelince bir run daha. İkisi de sağda \"PR #1\" etiketiyle görünüyor. `pull_request: branches: [main]`, \"main'e açılan PR'lar\" demek: filtre burada PR'ın **hedef** branch'ine bakar.",
          "Opening the PR started a run, the new commit started another. Both show on the right tagged \"PR #1\". `pull_request: branches: [main]` means \"PRs into main\": here the filter looks at the PR's **target** branch.",
        ),
        l(
          "Bu, çoğu ekibin kullandığı ikili: main'e push'lar ve main'e açılan PR'lar. Kod main'e girmeden önce de, girdikten sonra da kontrol edilir.",
          "This is the pair most teams use: pushes to main and PRs into main. Code is checked both before it reaches main and after.",
        ),
      ],
      practice: { commands: [{ cmd: "gh pr create --base main --head feature", note: l("PR aç; `pull_request` run'ı başlar.", "Open a PR; a `pull_request` run starts.") }, { cmd: "gh pr checks", note: l("PR'daki run'ların durumu.", "The status of the PR's runs.") }] },
    },
    {
      short: l("schedule", "schedule"),
      tag: "how",
      title: l("schedule: saat gelince çalış", "schedule: run when the clock says so"),
      body: [
        l(
          "`schedule` bir cron ifadesi alır. `0 3 * * *` her gece saat 03:00 demek (UTC). Gece oldu ve main'in son commit'inde bir run başladı, kimse push'lamadan.",
          "`schedule` takes a cron expression. `0 3 * * *` means every night at 03:00 (UTC). Night came and a run started on main's latest commit, with no push at all.",
        ),
        l(
          "Ne işe yarar? Uzun süren testler, bağımlılıkların güvenlik taraması, ya da kod değişmese bile dışarıdaki bir şey (bir API, bir paket) değiştiğinde kırılan şeyleri yakalamak.",
          "What is it for? Long test suites, security scans of dependencies, or catching things that break when something outside changes (an API, a package) even if your code did not.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: "on:\n  schedule:\n    - cron: '0 3 * * *'   # every day 03:00 UTC" }] },
    },
    {
      short: l("Elle", "By hand"),
      tag: "how",
      title: l("workflow_dispatch: düğmeye bas", "workflow_dispatch: press the button"),
      body: [
        l(
          "`workflow_dispatch` eklenince GitHub'ın Actions sekmesinde workflow'un yanında bir \"Run workflow\" düğmesi belirir. Bastık ve run başladı.",
          "Once `workflow_dispatch` is added, a \"Run workflow\" button appears next to the workflow in GitHub's Actions tab. We pressed it and a run started.",
        ),
        l(
          "Elle tetikleme deploy'lar için çok kullanılır ve `inputs` ile parametre alabilir, örneğin hangi ortama deploy edileceği. Onu \"Ortamlar ve onaylar\" dersinde kullanacağız.",
          "Manual triggers are common for deploys and can take parameters with `inputs`, such as which environment to deploy to. We will use that in \"Environments and approvals\".",
        ),
      ],
      practice: { commands: [{ cmd: "gh workflow run CI --ref main", note: l("\"Run workflow\" düğmesinin terminaldeki karşılığı.", "The terminal version of the \"Run workflow\" button.") }] },
    },
    {
      short: l("Dosya filtresi", "File filter"),
      tag: "experiment",
      predict: {
        question: l("`paths-ignore: [docs/**, **/*.md]` ekledik. Sadece `README.md`'yi değiştiren bir push gelirse?", "We added `paths-ignore: [docs/**, **/*.md]`. What about a push that only changes `README.md`?"),
        options: [l("CI çalışır", "CI runs"), l("CI çalışmaz", "CI does not run"), l("Sadece lint çalışır", "Only lint runs")],
        answer: 1,
        why: l("Değişen her dosya `paths-ignore` listesindeyse workflow hiç başlamaz.", "If every changed file is on the `paths-ignore` list, the workflow does not start at all."),
      },
      title: l("Kısa bir bakış: sadece belgeler değiştiyse", "A quick look: when only docs changed"),
      body: [
        l(
          "README push'u main'e geldi ama run başlamadı: değişen tek dosya `.md`. Testleri belge değişikliği için 3 dakika çalıştırmak gereksizdi.",
          "The README push reached main, but no run started: the only changed file is a `.md`. Running 3 minutes of tests for a docs change was pointless.",
        ),
        l(
          "[[pathFilter|Path filtreleri]] güçlü ama bir tuzağı var: zorunlu bir check hiç çalışmazsa PR kilitlenebilir. Bunu ve çözümünü \"Sadece değişen kod için çalıştır\" dersinde göreceğiz.",
          "[[pathFilter|Path filters]] are powerful but have a trap: if a required check never runs, a PR can get stuck. You will see that and its fix in \"Run only for what changed\".",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(FINAL) }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçekte", "In reality"),
      body: [
        l(
          "**`pull_request` hangi kodu test eder?** Gerçekte GitHub, PR branch'ini main ile birleştirip o birleşimi test eder; böylece merge sonrası kırılacak şeyleri önceden görürsün. **Fork'tan gelen PR'lar** secret görmez; bunu \"Secret'lar\" dersinde göreceğiz.",
          "**Which code does `pull_request` test?** In reality GitHub merges the PR branch with main and tests that merge, so you see what would break after merging. **PRs from forks** see no secrets; more in the \"Secrets\" lesson.",
        ),
        l(
          "**Cron her zaman UTC'dir** ve yoğun saatlerde birkaç dakika gecikebilir. Açık kaynak repolarda 60 gün hiç commit gelmezse zamanlanmış workflow'lar kendiliğinden kapanır.",
          "**Cron is always UTC** and can be a few minutes late at busy times. In public repos, scheduled workflows switch off by themselves after 60 days without commits.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede PR run'ı branch'in son commit'ini test ediyor ve gece tek bir tıkla geliyor. Ayrıca burada sadece dört olay var; GitHub'da `release`, `issues`, `workflow_run` gibi onlarca olay daha bulunur.",
            "On this stage the PR run tests the branch's latest commit, and night arrives with one click. There are also only four events here; GitHub has dozens more, such as `release`, `issues` and `workflow_run`.",
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
          "Sıra sende. Aşağıda mağazanın deposu ve gerçek işten **5 senaryo** var. Workflow dosyasını `nano .github/workflows/ci.yml` ile **kendin düzenle**, `git commit` ve `git push` ile GitHub'a gönder; gerekirse `gh pr create` ya da `gh workflow run` yaz.",
          "Your turn. Below is the shop's repository and **5 scenarios** from real work. **Edit the workflow yourself** with `nano .github/workflows/ci.yml`, send it to GitHub with `git commit` and `git push`, and type `gh pr create` or `gh workflow run` when needed.",
        ),
        l(
          "Bir değişiklik ancak push'landığında GitHub'da geçerli olur. Takılırsan `cat .github/workflows/ci.yml` ve `gh run list` yaz; ipuçları adım adım açılır.",
          "A change only counts on GitHub once it is pushed. If you're stuck, type `cat .github/workflows/ci.yml` and `gh run list`; hints open one at a time.",
        ),
      ],
    },
  ],
  recap: [
    l("`on:` bir workflow'un hangi olaylarla başlayacağını söyler.", "`on:` says which events start a workflow."),
    l("Filtresiz `push` her branch'teki her push'ta çalışır; `branches:` bunu sınırlar.", "An unfiltered `push` runs on every push to every branch; `branches:` limits it."),
    l("`pull_request` PR açılınca ve PR'ın branch'ine her push'ta çalışır; filtresi hedef branch'e bakar.", "`pull_request` runs when a PR opens and on every push to its branch; its filter looks at the target branch."),
    l("`schedule` cron ile (UTC) belirli saatlerde çalışır, push gerekmez.", "`schedule` runs at set times via cron (UTC), no push needed."),
    l("`workflow_dispatch` bir \"Run workflow\" düğmesi ekler.", "`workflow_dispatch` adds a \"Run workflow\" button."),
    l("`paths-ignore` sadece belgeler değişince workflow'u susturur.", "`paths-ignore` keeps the workflow quiet when only docs change."),
  ],
  quiz: [
    {
      question: l("`on: push` (filtresiz) ne zaman çalışır?", "When does `on: push` (no filter) run?"),
      options: [l("Sadece main'e push'ta", "Only on pushes to main"), l("Her branch'teki her push'ta", "On every push to any branch"), l("Sadece PR'larda", "Only on PRs"), l("Günde bir kez", "Once a day")],
      answer: 1,
      explain: l("Filtre yoksa her push sayılır; main'e sınırlamak için `branches: [main]` yazarsın.", "Without a filter every push counts; to limit it to main you write `branches: [main]`."),
      reviewStep: 0,
    },
    {
      question: l("`pull_request: branches: [main]` neyi filtreler?", "What does `pull_request: branches: [main]` filter on?"),
      options: [l("PR'ın kaynak branch'ini", "The PR's source branch"), l("PR'ın hedef branch'ini", "The PR's target branch"), l("Commit mesajını", "The commit message"), l("PR'ı açan kişiyi", "Who opened the PR")],
      answer: 1,
      explain: l("Filtre, \"main'e açılan PR'lar\" der; PR hangi branch'ten gelirse gelsin.", "The filter means \"PRs into main\", whatever branch they come from."),
      reviewStep: 2,
    },
    {
      question: l("Kod değişmese bile her gece çalışan bir kontrol için hangisi?", "Which one for a check that runs every night even if the code did not change?"),
      options: [l("`push`", "`push`"), l("`pull_request`", "`pull_request`"), l("`schedule` ve bir cron ifadesi", "`schedule` with a cron expression"), l("`workflow_dispatch`", "`workflow_dispatch`")],
      answer: 2,
      explain: l("`schedule` saat gelince main'in son commit'inde çalışır; cron saatleri UTC'dir.", "`schedule` runs on main's latest commit at the set time; cron times are UTC."),
      reviewStep: 3,
    },
    {
      question: l("Actions sekmesinde \"Run workflow\" düğmesinin çıkması için ne gerekir?", "What makes a \"Run workflow\" button appear in the Actions tab?"),
      options: [l("Admin olmak", "Being an admin"), l("Workflow'a `workflow_dispatch` eklemek", "Adding `workflow_dispatch` to the workflow"), l("`schedule` eklemek", "Adding `schedule`"), l("Hiçbir şey, her zaman vardır", "Nothing, it is always there")],
      answer: 1,
      explain: l("Elle tetikleme ancak workflow `workflow_dispatch` olayını dinliyorsa mümkündür.", "Manual runs only work if the workflow listens to `workflow_dispatch`."),
      reviewStep: 4,
    },
  ],
};
