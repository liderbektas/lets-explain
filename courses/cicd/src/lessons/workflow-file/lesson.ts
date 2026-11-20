import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { FULL, scene, wf } from "./Scene";

const FIRST = workflowYaml(wf(["checkout"]));
const TESTS = workflowYaml(wf(["checkout", "setup-node", "install", "test"]));
const FINAL = workflowYaml(FULL);

export const workflowFile: Lesson = {
  slug: "workflow-file",
  title: l("Workflow dosyası", "The workflow file"),
  summary: l(
    "`.github/workflows/` altındaki bir YAML dosyası: `on`, `jobs`, `runs-on`, `steps`. `uses:` ile hazır bir action, `run:` ile bir komut çağırırsın ve adımlar yukarıdan aşağı sırayla çalışır.",
    "A YAML file under `.github/workflows/`: `on`, `jobs`, `runs-on`, `steps`. `uses:` calls a ready-made action, `run:` calls a command, and steps run top to bottom.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Workflow dosyasının nereye konduğunu ve ana anahtarlarını bilmek", "Know where the workflow file goes and its main keys"), step: 0 },
    { text: l("`uses:` ile `run:` arasındaki farkı görmek", "See the difference between `uses:` and `run:`"), step: 1 },
    { text: l("Eksik ya da yanlış sıradaki bir adımın neden kırıldığını okumak", "Read why a missing or out-of-order step fails"), step: 3 },
    { text: l("Lint, test ve build yapan bir CI dosyasını kendin yazmak", "Write a CI file that lints, tests and builds"), step: 4 },
  ],
  steps: [
    {
      short: l("Dosya", "The file"),
      tag: "how",
      title: l("Her şey bir YAML dosyasıyla başlar", "It all starts with one YAML file"),
      body: [
        l(
          "GitHub Actions, reponda `.github/workflows/` klasöründeki her `.yml` dosyasını bir [[workflow]] olarak okur. Ayrı bir sunucu kurmazsın, bir ayar sayfası doldurmazsın: dosyayı commit'leyip push'larsın, o kadar.",
          "GitHub Actions reads every `.yml` file in your repo's `.github/workflows/` folder as a [[workflow]]. You set up no server and fill in no settings page: you commit the file and push it, that is all.",
        ),
        l(
          "En küçük workflow üç şey söyler: adı (`name`), ne zaman çalışacağı (`on: push`) ve ne yapacağı (`jobs`). Bizimkinde `test` adında tek bir [[job]] var. `runs-on: ubuntu-latest` bu job'ın GitHub'ın Linux makinesinde çalışacağını söyler. Tek adımı da kodu makineye çekmek.",
          "The smallest workflow says three things: its name (`name`), when it runs (`on: push`) and what it does (`jobs`). Ours has a single [[job]] called `test`. `runs-on: ubuntu-latest` says it runs on GitHub's Linux machine. Its only step is to fetch the code onto that machine.",
        ),
        l("Push'ladık: sağda #1 numaralı [[run]] başladı ve 3 saniyede yeşil bitti.", "We pushed: on the right, [[run]] #1 started and finished green in 3 seconds."),
      ],
      practice: {
        intro: l("Projende klasörü aç ve dosyayı ekle:", "Create the folder in your project and add the file:"),
        commands: [
          { cmd: "mkdir -p .github/workflows" },
          { cmd: "git add .github/workflows/ci.yml && git commit -m \"Add CI\" && git push" },
        ],
        snippets: [{ label: ".github/workflows/ci.yml", code: FIRST }],
      },
    },
    {
      short: l("uses ve run", "uses and run"),
      tag: "how",
      title: l("uses: hazır bir action, run: bir komut", "uses: is a ready-made action, run: is a command"),
      body: [
        l(
          "Adımlar iki türlü yazılır. `uses: actions/setup-node@v4` başkasının yazdığı hazır bir [[action]] çağırır: Node'u indirip kurar. `@v4` hangi sürümünü kullandığını söyler. `run: npm ci` ise makinenin terminalinde bu komutu çalıştırır, tıpkı senin bilgisayarında yazdığın gibi.",
          "Steps come in two kinds. `uses: actions/setup-node@v4` calls a ready-made [[action]] someone else wrote: it downloads and installs Node. `@v4` says which version of it you use. `run: npm ci` runs that command in the machine's terminal, exactly as you would type it on your laptop.",
        ),
        l(
          "Checkout, Node kurulumu, `npm ci`, `npm test`: dört adım, yukarıdan aşağı sırayla. Run #2 yeşil; test adımı 70 saniye sürdü.",
          "Checkout, set up Node, `npm ci`, `npm test`: four steps, run top to bottom. Run #2 is green; the test step took 70 seconds.",
        ),
        l(
          "Job kartının altındaki tezgah, job'ın çalıştığı makine. Boş başlıyor; her adım koyduğu şeyi oraya bırakıyor: checkout kodu, setup-node Node'u, `npm ci` `node_modules`'ı. Job bitince makine silindiği için tezgah da boşalıyor.",
          "The bench under the job card is the machine the job runs on. It starts empty, and each step leaves what it made there: checkout the code, setup-node Node, `npm ci` the `node_modules`. When the job ends the machine is deleted, so the bench is cleared.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "`with:` bir action'a parametre verir. Burada `node-version: 22` hangi Node'un kurulacağını söylüyor. Her action'ın kabul ettiği parametreler kendi README'sinde yazar.",
            "`with:` passes parameters to an action. Here `node-version: 22` says which Node to install. Each action lists the parameters it accepts in its README.",
          ),
        },
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: TESTS }] },
    },
    {
      short: l("Checkout yok", "No checkout"),
      tag: "experiment",
      predict: {
        question: l(
          "Birisi \"kod zaten repoda, checkout'a gerek yok\" deyip ilk adımı sildi. Run'da ne olur?",
          "Someone said \"the code is already in the repo, we do not need checkout\" and deleted the first step. What happens in the run?",
        ),
        options: [l("Hiçbir şey değişmez, yeşil kalır", "Nothing changes, it stays green"), l("`npm ci` package.json'ı bulamaz ve kırılır", "`npm ci` cannot find package.json and fails"), l("Workflow hiç başlamaz", "The workflow never starts")],
        answer: 1,
        why: l(
          "Workflow repoda yaşar ama job boş bir makinede çalışır. Kodu o makineye getiren tek şey `actions/checkout`'tır.",
          "The workflow lives in the repo, but the job runs on an empty machine. The only thing that brings the code onto it is `actions/checkout`.",
        ),
      },
      title: l("Makine boş başlar", "The machine starts empty"),
      body: [
        l(
          "Run #3 kırmızı. Node kuruldu ama `npm ci` `package.json` dosyasını bulamadı ve `ENOENT` hatasıyla kırıldı. Sonraki `npm test` adımı hiç çalışmadı: bir adım kırılınca job'ın geri kalanı atlanır.",
          "Run #3 is red. Node got installed, but `npm ci` could not find `package.json` and failed with `ENOENT`. The `npm test` step after it never ran: once a step fails, the rest of the job is skipped.",
        ),
        l(
          "Bunu aklında tut: [[runner]] senin bilgisayarın değil. Üzerinde hiçbir şey yokmuş gibi düşün; her şeyi bir adımla oraya koyman gerekir.",
          "Keep this in mind: the [[runner]] is not your laptop. Think of it as having nothing on it; everything has to be put there by a step.",
        ),
      ],
    },
    {
      short: l("Yanlış sıra", "Wrong order"),
      tag: "experiment",
      predict: {
        question: l("Şimdi checkout geri geldi ama `npm test`, `npm ci`'dan **önce** yazılmış. Ne olur?", "Checkout is back, but `npm test` is written **before** `npm ci`. What happens?"),
        options: [
          l("GitHub adımları kendisi doğru sıraya koyar", "GitHub puts the steps in the right order itself"),
          l("Test, test aracını bulamaz ve kırılır", "The test cannot find the test tool and fails"),
          l("Test geçer, `npm ci` sonra çalışır", "The test passes, `npm ci` runs after"),
        ],
        answer: 1,
        why: l(
          "Adımlar dosyadaki sırayla çalışır, GitHub sırayı tahmin etmez. `npm test` çalıştığında `node_modules` henüz yoktu, yani `vitest` de yoktu.",
          "Steps run in the file's order; GitHub does not guess. When `npm test` ran there was no `node_modules` yet, so no `vitest` either.",
        ),
      },
      title: l("Adımlar yazıldığı sırayla çalışır", "Steps run in the order you wrote them"),
      body: [
        l(
          "Run #4 kırmızı: `sh: 1: vitest: not found`, [[exitCode|exit code]] 127. 127, kabuğun \"böyle bir komut yok\" deme şekli. `npm ci` aşağıda kaldığı için hiç çalışmadı.",
          "Run #4 is red: `sh: 1: vitest: not found`, [[exitCode|exit code]] 127. 127 is the shell's way of saying \"no such command\". `npm ci` was below it, so it never ran.",
        ),
        l(
          "İki hatayı karşılaştır: dosya yoksa `ENOENT`, komut yoksa `command not found` / `not found` ve 127. Logda bunları görünce hangi adımın eksik ya da yanlış yerde olduğunu hemen anlarsın.",
          "Compare the two errors: a missing file says `ENOENT`, a missing command says `command not found` / `not found` with 127. When you see these in a log, you know at once which step is missing or misplaced.",
        ),
      ],
    },
    {
      short: l("Tam dosya", "Whole file"),
      tag: "how",
      title: l("Lint, test, build: ilk gerçek CI'ın", "Lint, test, build: your first real CI"),
      body: [
        l(
          "Sırayı düzelttik ve iki adım ekledik: testlerden önce `npm run lint` (kod stili ve basit hatalar), sonra `npm run build` (uygulama gerçekten derleniyor mu?). Run #5 altı adımın hepsini geçti.",
          "We fixed the order and added two steps: `npm run lint` before the tests (code style and simple mistakes), and `npm run build` after (does the app really compile?). Run #5 passed all six steps.",
        ),
        l(
          "Dosyayı baştan oku: `name` arayüzde görünen ad. `on` [[trigger|tetikleyici]]. `jobs` altındaki her anahtar bir job, `runs-on` makinesini seçer ve `steps` sırayla çalışır. Her adımın girintisi önemli: YAML'da girinti yapıyı belirler.",
          "Read the file from the top: `name` is what the UI shows. `on` is the [[trigger]]. Every key under `jobs` is a job, `runs-on` picks its machine, and `steps` run in order. Indentation matters: in YAML it is the structure.",
        ),
      ],
      practice: {
        intro: l("`package.json`'da bu script'lerin olduğundan emin ol: `lint`, `test`, `build`.", "Make sure `package.json` has these scripts: `lint`, `test`, `build`."),
        commands: [{ cmd: "npm run lint && npm test && npm run build", note: l("Push'lamadan önce aynı adımları kendi makinende dene.", "Try the same steps on your machine before pushing.") }],
        snippets: [{ label: ".github/workflows/ci.yml", code: FINAL }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede bilmen gerekenler", "What to know in a real project"),
      body: [
        l(
          "**Bozuk YAML:** girinti hatası ya da yanlış bir anahtar varsa GitHub run'ı hiç başlatmaz ve Actions sekmesinde \"Invalid workflow file\" der. Editöründe bir YAML eklentisi ve GitHub Actions şeması bu hataları yazarken gösterir.",
          "**Broken YAML:** with an indentation mistake or an unknown key, GitHub does not start the run and the Actions tab says \"Invalid workflow file\". A YAML plugin with the GitHub Actions schema in your editor shows these as you type.",
        ),
        l(
          "**`ubuntu-latest` zamanla değişir:** bugün bir Ubuntu sürümünü, birkaç ay sonra yenisini gösterir. Bir şeyin aniden kırılmasını istemiyorsan `ubuntu-24.04` gibi sabit bir sürüm yaz. **Action sürümleri** de artar; `@v4` yerine yenisi çıktıysa action'ın sayfasına bak.",
          "**`ubuntu-latest` moves:** today it points to one Ubuntu release, in a few months to a newer one. If you do not want surprises, pin a version like `ubuntu-24.04`. **Action versions** move up too; check the action's page if a newer one than `@v4` is out.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede adım süreleri yuvarlak ve her zaman aynı: checkout 3 sn, `npm ci` 45 sn, `npm test` 70 sn. Gerçekte süreler run'dan run'a biraz oynar ve runner'ın açılması için birkaç saniye beklersin.",
            "On this stage step times are round and always the same: checkout 3 s, `npm ci` 45 s, `npm test` 70 s. In reality times vary a little from run to run, and you wait a few seconds for the runner to start.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "gh workflow list", note: l("Repodaki workflow'lar (GitHub CLI).", "The repo's workflows (GitHub CLI).") },
          { cmd: "gh run list --limit 5", note: l("Son run'lar ve sonuçları.", "The latest runs and their results.") },
          { cmd: "gh run watch", note: l("Çalışan run'ı terminalden izle.", "Watch the running run from your terminal.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda mağaza projesi ve gerçek işten **5 senaryo** var: hiç CI olmayan bir repo, `npm: command not found`, bulunamayan bir `package.json`, yanlış sırada adımlar. Workflow'u `nano .github/workflows/ci.yml` ile **kendin yaz**, `git push` ile GitHub'a gönder; sahne run'ı ve her adımın sonucunu gösterir.",
          "Your turn. Below is the shop project and **5 scenarios** from real work: a repo with no CI, `npm: command not found`, a `package.json` that can't be found, steps in the wrong order. **Write the workflow yourself** with `nano .github/workflows/ci.yml` and send it to GitHub with `git push`; the scene shows the run and every step's result.",
        ),
        l(
          "Kırmızı bir run'da önce `gh run view --log-failed` ile logu oku. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "On a red run, read the log first with `gh run view --log-failed`. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Workflow'lar `.github/workflows/*.yml` dosyalarıdır; commit'leyip push'lamak yeter.", "Workflows are `.github/workflows/*.yml` files; committing and pushing is enough."),
    l("`on` ne zaman, `jobs` ne yapılacağını söyler; `runs-on` job'ın makinesini seçer.", "`on` says when, `jobs` says what; `runs-on` picks a job's machine."),
    l("`uses:` hazır bir action çağırır (`with:` ile parametre alır), `run:` bir komut çalıştırır.", "`uses:` calls a ready-made action (parameters via `with:`), `run:` runs a command."),
    l("Runner boş başlar: kod için checkout, Node için setup-node, bağımlılıklar için `npm ci` gerekir.", "The runner starts empty: checkout for the code, setup-node for Node, `npm ci` for dependencies."),
    l("Adımlar yazıldığı sırayla çalışır; biri kırılınca gerisi atlanır.", "Steps run in the order written; once one fails, the rest are skipped."),
    l("`ENOENT` eksik bir dosya, 127 eksik bir komut demektir.", "`ENOENT` means a missing file, 127 a missing command."),
  ],
  quiz: [
    {
      question: l("Bir workflow dosyası repoda nereye konur?", "Where does a workflow file go in the repo?"),
      options: [l("Kök dizine `ci.yml` olarak", "In the root as `ci.yml`"), l("`.github/workflows/` altına", "Under `.github/workflows/`"), l("`src/ci/` altına", "Under `src/ci/`"), l("Repoya değil, GitHub ayarlarına", "Not in the repo, in GitHub settings")],
      answer: 1,
      explain: l("GitHub sadece `.github/workflows/` altındaki `.yml` / `.yaml` dosyalarını workflow olarak okur.", "GitHub only reads `.yml` / `.yaml` files under `.github/workflows/` as workflows."),
      reviewStep: 0,
    },
    {
      question: l("`uses: actions/setup-node@v4` ile `run: npm ci` arasındaki fark nedir?", "What is the difference between `uses: actions/setup-node@v4` and `run: npm ci`?"),
      options: [
        l("İkisi aynı şey", "They are the same"),
        l("`uses:` hazır bir action çağırır, `run:` bir kabuk komutu çalıştırır", "`uses:` calls a ready-made action, `run:` runs a shell command"),
        l("`uses:` sadece Docker image'ları içindir", "`uses:` is only for Docker images"),
        l("`run:` sadece Windows'ta çalışır", "`run:` only works on Windows"),
      ],
      answer: 1,
      explain: l("Action'lar paketlenmiş adımlardır; `run:` ise doğrudan terminale yazdığın komuttur.", "Actions are packaged steps; `run:` is a command typed straight into the terminal."),
      reviewStep: 1,
    },
    {
      question: l("Logda `npm error enoent Could not read package.json` görüyorsun. En olası neden?", "The log says `npm error enoent Could not read package.json`. The most likely cause?"),
      options: [l("Node sürümü eski", "Node is too old"), l("`actions/checkout` adımı yok ya da `npm ci`'dan sonra", "`actions/checkout` is missing or after `npm ci`"), l("Testler kırık", "The tests are broken"), l("Secret eksik", "A secret is missing")],
      answer: 1,
      explain: l("Runner boş başlar; `package.json` ancak checkout'tan sonra makinede olur.", "The runner starts empty; `package.json` is only there after checkout."),
      reviewStep: 2,
    },
    {
      question: l("Bir adım kırılınca aynı job'daki sonraki adımlara ne olur?", "When a step fails, what happens to the next steps in the same job?"),
      options: [l("Hepsi yine çalışır", "They all still run"), l("Atlanırlar", "They are skipped"), l("Job baştan başlar", "The job starts over"), l("Bir sonraki push'ta çalışırlar", "They run on the next push")],
      answer: 1,
      explain: l("Varsayılan olarak her adım sadece öncekiler başarılıysa çalışır. Bunu değiştirmenin yollarını \"Koşullar ve çıktılar\" dersinde göreceğiz.", "By default a step only runs if everything before it passed. You will see how to change that in \"Conditions and outputs\"."),
      reviewStep: 3,
    },
  ],
};
