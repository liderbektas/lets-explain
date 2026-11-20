import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { compositeYaml, testYaml, wfYaml } from "./model";
import { scene } from "./Scene";

const AFTER_COMPOSITE = scene.at(2);
const AFTER_REUSABLE = scene.at(4);

const CALLER = `name: CI
on: [push, pull_request]

${wfYaml(AFTER_REUSABLE, "ci")}`;

const CALLER_WITH_INPUTS = `jobs:
  test:
    uses: ./.github/workflows/test.yml
    with:
      node-version: '22'
    secrets: inherit`;

const CALLED_WITH_INPUTS = `on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '22'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
        with:
          node-version: \${{ inputs.node-version }}
      - run: npm test`;

export const reusableWorkflows: Lesson = {
  slug: "reusable-workflows",
  title: l("Ortak kodu tek yerde topla", "Keep shared steps in one place"),
  summary: l(
    "Aynı adımları üç workflow'a kopyalamak, bir değişikliği üç yerde yapmak demek. Tekrar eden adımları bir composite action'a (`action.yml`), tekrar eden job'ları bir reusable workflow'a (`workflow_call`) topla ve parametreyi `inputs` ile geç.",
    "Copying the same steps into three workflows means making every change three times. Gather repeated steps in a composite action (`action.yml`), repeated jobs in a reusable workflow (`workflow_call`), and pass parameters with `inputs`.",
  ),
  minutes: 16,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kopyalanan adımların neden sorun olduğunu görmek", "See why copied steps are a problem"), step: 1 },
    { text: l("Tekrar eden adımları bir composite action'a taşımak", "Move repeated steps into a composite action"), step: 2 },
    { text: l("Bütün bir job'ı reusable workflow ile paylaşmak", "Share a whole job with a reusable workflow"), step: 4 },
    { text: l("Hangisini ne zaman seçeceğini bilmek", "Know which one to pick when"), step: 5 },
  ],
  steps: [
    {
      short: l("Üç kopya", "Three copies"),
      tag: "problem",
      title: l("Aynı dört satır, üç dosyada", "The same four lines, in three files"),
      body: [
        l(
          "Repoda üç workflow var: her push'ta çalışan `ci.yml`, sürüm çıkaran `release.yml` ve her gece çalışan `nightly.yml`. Üçü de aynı şekilde başlıyor: checkout, Node 20 kurulumu, `npm ci`. Bu satırlar bir dosyadan diğerine kopyalanmış.",
          "The repo has three workflows: `ci.yml` on every push, `release.yml` for releases and `nightly.yml` every night. All three start the same way: checkout, set up Node 20, `npm ci`. Those lines were copied from one file to the next.",
        ),
        l("Üçünü çalıştırdık: hepsi Node 20 kullanıyor. Şimdilik sorun yok.", "We ran all three: they all use Node 20. No problem yet."),
      ],
    },
    {
      short: l("Unutulan kopya", "The forgotten copy"),
      tag: "experiment",
      predict: {
        question: l(
          "Node 22'ye geçmeye karar verdik. Birisi `ci.yml` ile `release.yml`'yi güncelledi. Üç workflow'u çalıştırınca `nightly.yml` hangi Node'u kullanır?",
          "We decided to move to Node 22. Someone updated `ci.yml` and `release.yml`. When the three workflows run, which Node does `nightly.yml` use?",
        ),
        options: [l("22: GitHub hepsini aynı tutar", "22: GitHub keeps them in sync"), l("20: o dosyaya kimse dokunmadı", "20: nobody touched that file"), l("Kırılır", "It fails")],
        answer: 1,
        why: l(
          "Her dosya kendi kopyasını taşır. Hangisini düzeltmeyi unutursan o eskide kalır, ve gece testleri farklı bir Node'da çalışır.",
          "Every file carries its own copy. Whichever you forget stays old, and the nightly tests now run on a different Node.",
        ),
      },
      title: l("Biri hep unutulur", "One always gets forgotten"),
      body: [
        l(
          "`ci` ve `release` Node 22'de, `nightly` hâlâ Node 20'de. Gece kırılan bir test \"bizde çalışıyor\" diye ciddiye alınmayabilir, ya da tersine, gece geçen bir test gündüz kırılır.",
          "`ci` and `release` are on Node 22, `nightly` is still on Node 20. A test failing at night may be shrugged off as \"works for us\", or the other way round, something passing at night breaks in the day.",
        ),
      ],
    },
    {
      short: l("Composite action", "Composite action"),
      tag: "how",
      title: l("Adımları bir composite action'a topla", "Gather the steps in a composite action"),
      body: [
        l(
          "`.github/actions/setup/action.yml` diye bir dosya açtık. İçinde `runs: using: composite` ve tekrar eden adımlar var: Node kurulumu ve `npm ci`. Node sürümü bir `input`; varsayılanı 22.",
          "We created `.github/actions/setup/action.yml`. It has `runs: using: composite` and the repeated steps: set up Node and `npm ci`. The Node version is an `input` that defaults to 22.",
        ),
        l(
          "Üç workflow'da o dört satır tek satıra indi: `- uses: ./.github/actions/setup`. Bir [[compositeAction|composite action]] tek bir adım gibi çağrılır ama içinde birden çok adım çalışır. Üçü de artık Node 22'de.",
          "In the three workflows those four lines became one: `- uses: ./.github/actions/setup`. A [[compositeAction|composite action]] is called like a single step but runs several inside. All three are on Node 22 now.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Checkout adımı workflow'da kaldı: `./.github/actions/setup` reponun içindeki bir dosya, runner onu ancak kod geldikten sonra bulabilir. Composite action'larda her `run:` adımına `shell: bash` yazmak da zorunlu.",
            "Checkout stayed in the workflow: `./.github/actions/setup` is a file inside the repo, so the runner only finds it after the code is there. In composite actions every `run:` step must also say `shell: bash`.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "mkdir -p .github/actions/setup" }],
        snippets: [
          { label: ".github/actions/setup/action.yml", code: compositeYaml(AFTER_COMPOSITE) },
          { label: ".github/workflows/ci.yml (jobs)", code: wfYaml(AFTER_COMPOSITE, "ci") },
        ],
      },
    },
    {
      short: l("Tek düzenleme", "One edit"),
      tag: "experiment",
      predict: {
        question: l("Node 24 çıktı. Üç workflow'u da Node 24'e geçirmek için kaç dosya düzenlemen gerekir?", "Node 24 is out. How many files do you edit to move all three workflows to it?"),
        options: [l("1", "1"), l("3", "3"), l("4", "4")],
        answer: 0,
        why: l("Node sürümü artık tek bir yerde: action.yml'deki varsayılan değer.", "The Node version now lives in one place: the default in action.yml."),
      },
      title: l("Tek satır, üç workflow", "One line, three workflows"),
      body: [
        l(
          "action.yml'de `default: '24'` yaptık ve üçünü çalıştırdık: üçü de Node 24. Tek bir düzenleme, unutulacak kopya yok.",
          "We set `default: '24'` in action.yml and ran all three: all on Node 24. One edit, no copy to forget.",
        ),
      ],
    },
    {
      short: l("Reusable workflow", "Reusable workflow"),
      tag: "how",
      title: l("Bütün bir job'ı paylaşmak", "Sharing a whole job"),
      body: [
        l(
          "`ci.yml` ve `release.yml` sadece setup'ı değil, bütün `test` job'ını (lint + test) paylaşıyordu. Bunu `test.yml` adlı bir [[reusableWorkflow|reusable workflow]]'a taşıdık: tetikleyicisi `on: workflow_call`.",
          "`ci.yml` and `release.yml` shared not just the setup but the whole `test` job (lint + test). We moved it into a [[reusableWorkflow|reusable workflow]] called `test.yml`, triggered by `on: workflow_call`.",
        ),
        l(
          "İki dosyadaki `test` job'ı artık sadece onu çağırıyor: `uses: ./.github/workflows/test.yml` ve `secrets: inherit`. Dikkat: bu `uses:` bir adımın değil, **job'ın** altında; `runs-on` ve `steps` de yok.",
          "The `test` job in both files now just calls it: `uses: ./.github/workflows/test.yml` and `secrets: inherit`. Note this `uses:` sits under the **job**, not a step, and there is no `runs-on` or `steps`.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          { label: ".github/workflows/test.yml", code: testYaml(AFTER_REUSABLE) },
          { label: ".github/workflows/ci.yml", code: CALLER },
        ],
      },
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "idea",
      title: l("Composite action mı, reusable workflow mu?", "Composite action or reusable workflow?"),
      body: [
        l(
          "**Composite action:** tekrar eden **adımlar** için. Bir job'ın içinde, diğer adımların arasında çağrılır, aynı runner'da çalışır. Örnek: Node kur + `npm ci`, ya da \"Docker'a giriş yap\".",
          "**Composite action:** for repeated **steps**. Called inside a job, between other steps, on the same runner. Examples: set up Node + `npm ci`, or \"log in to Docker\".",
        ),
        l(
          "**Reusable workflow:** tekrar eden **job'lar** için. Kendi `runs-on`'u, kendi job'ları, kendi ortamı (environment) olur; çağıran workflow onu bir job gibi kullanır. Örnek: \"test et\" ya da \"staging'e deploy et\".",
          "**Reusable workflow:** for repeated **jobs**. It has its own `runs-on`, its own jobs, its own environment; the caller uses it like a job. Examples: \"run the tests\" or \"deploy to staging\".",
        ),
        l(
          "İkisi de `inputs` alır. Reusable workflow'a parametreyi `with:` ile verirsin, secret'ları ise `secrets: inherit` ile ya da tek tek geçirirsin; vermezsen göremez.",
          "Both take `inputs`. You pass parameters to a reusable workflow with `with:`, and secrets with `secrets: inherit` or one by one; without that it cannot see them.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          { label: ".github/workflows/test.yml", code: CALLED_WITH_INPUTS, note: l("`inputs` tanımla, composite action'a aktar.", "Declare `inputs` and pass them on to the composite action.") },
          { label: ".github/workflows/ci.yml (jobs)", code: CALLER_WITH_INPUTS },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Repolar arası:** başka bir repodaki action ya da workflow'u da çağırabilirsin: `uses: acme/ci/.github/workflows/test.yml@v2`. Birçok şirket ortak CI parçalarını tek bir repoda toplar.",
          "**Across repos:** you can call an action or workflow from another repo too: `uses: acme/ci/.github/workflows/test.yml@v2`. Many companies keep their shared CI pieces in one repo.",
        ),
        l(
          "**Sınırlar:** reusable workflow'lar en fazla birkaç kat iç içe çağrılabilir ve çağıranın `env:` değişkenlerini görmez; ihtiyacı olanı `inputs` ile ver.",
          "**Limits:** reusable workflows can only be nested a few levels deep, and they do not see the caller's `env:` variables; pass what they need as `inputs`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede dosyaların sadece ilgili kısmı görünüyor ve \"çalıştır\" düğmesi her workflow'un hangi Node'u kullandığını raporluyor; adımlar gerçekten çalışmıyor. Gerçekte bir reusable workflow, çağıran run'ın içinde ayrı bir job olarak görünür.",
            "On this stage only the relevant part of each file is shown, and \"run\" reports which Node each workflow uses; the steps do not really run. In reality a reusable workflow shows up as a separate job inside the caller's run.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Baştaki duruma döndük: üç workflow, üç kopya, hepsi Node 20. Bir dosyada Node'u 22 yapabilir, composite action ya da reusable workflow oluşturup kullanabilir ve üçünü çalıştırabilirsin.",
          "We are back at the start: three workflows, three copies, all on Node 20. You can set Node 22 in a file, create and use a composite action or a reusable workflow, and run all three.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Kopyalanan adımlar zamanla birbirinden ayrılır; biri hep unutulur.", "Copied steps drift apart over time; one always gets forgotten."),
    l("Tekrar eden adımlar: composite action (`action.yml`, `runs: using: composite`), `uses: ./yol` ile çağrılır.", "Repeated steps: a composite action (`action.yml`, `runs: using: composite`), called with `uses: ./path`."),
    l("Tekrar eden job'lar: reusable workflow (`on: workflow_call`), job seviyesinde `uses:` ile çağrılır.", "Repeated jobs: a reusable workflow (`on: workflow_call`), called with `uses:` at the job level."),
    l("Parametreler `inputs` ile gelir; reusable workflow'a `with:` ve `secrets:` ile verilir.", "Parameters come in as `inputs`; a reusable workflow gets them via `with:` and `secrets:`."),
    l("Yerel bir action'ı çağırmadan önce checkout gerekir.", "A local action needs checkout before it can be called."),
  ],
  quiz: [
    {
      question: l("Üç workflow aynı \"Node kur + npm ci\" adımlarını kullanıyor. En uygun çözüm?", "Three workflows use the same \"set up Node + npm ci\" steps. The best fit?"),
      options: [l("Kopyalamaya devam", "Keep copying"), l("Composite action", "A composite action"), l("Reusable workflow", "A reusable workflow"), l("`[skip ci]`", "`[skip ci]`")],
      answer: 1,
      explain: l("Paylaşılan şey birkaç adım; composite action adımları bir job'ın içinde tek adım gibi çalıştırır.", "What is shared is a few steps; a composite action runs them as one step inside a job."),
      reviewStep: 2,
    },
    {
      question: l("Bir reusable workflow'u çağırmak için `uses:` nereye yazılır?", "Where does `uses:` go to call a reusable workflow?"),
      options: [l("Bir adımın altına", "Under a step"), l("Job'ın altına, `runs-on` ve `steps` olmadan", "Under the job, without `runs-on` and `steps`"), l("`on:` altına", "Under `on:`"), l("Repo ayarlarına", "In repo settings")],
      answer: 1,
      explain: l("Reusable workflow bütün bir job'ın yerini alır.", "A reusable workflow stands in for a whole job."),
      reviewStep: 4,
    },
    {
      question: l("Bir reusable workflow'un tetikleyicisi nedir?", "What is a reusable workflow's trigger?"),
      options: [l("`on: push`", "`on: push`"), l("`on: workflow_call`", "`on: workflow_call`"), l("`on: schedule`", "`on: schedule`"), l("Tetikleyicisi olmaz", "It has none")],
      answer: 1,
      explain: l("`workflow_call` onu başka workflow'ların çağırabileceği hale getirir.", "`workflow_call` makes it callable by other workflows."),
      reviewStep: 4,
    },
    {
      question: l("Setup composite action'a taşındıktan sonra Node sürümünü yükseltmek kaç düzenleme ister?", "After the setup moved into a composite action, how many edits does a Node upgrade take?"),
      options: [l("Workflow sayısı kadar", "As many as there are workflows"), l("Bir", "One"), l("Hiç", "None"), l("İki", "Two")],
      answer: 1,
      explain: l("Sürüm tek bir yerde, action.yml'de.", "The version lives in one place, action.yml."),
      reviewStep: 3,
    },
  ],
};
