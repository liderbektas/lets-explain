import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { GOOD, scene, wf } from "./Scene";

const FINAL = workflowYaml(wf(GOOD));

const SCRIPTS = `{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "vite build"
  }
}`;

export const lintTestBuild: Lesson = {
  slug: "lint-test-build",
  title: l("Lint, test, build", "Lint, test, build"),
  summary: l(
    "Bir adım 0 dışında bir exit code ile bitince kırmızı olur ve job orada durur. Ucuz kontrolleri (lint, typecheck) öne, pahalıları (test, build) arkaya koyarsan kötü haberi dakikalar yerine saniyeler içinde alırsın.",
    "A step that ends with a non-zero exit code turns red and the job stops there. Put the cheap checks (lint, typecheck) first and the expensive ones (test, build) after, and bad news arrives in seconds instead of minutes.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir adımı neyin kırmızı yaptığını bilmek: exit code", "Know what turns a step red: the exit code"), step: 2 },
    { text: l("Kontrolleri ucuzdan pahalıya sıralamak", "Order checks from cheap to expensive"), step: 1 },
    { text: l("Kırılan adımdan sonrakilerin neden hiç çalışmadığını anlamak", "Understand why the steps after a failure never run"), step: 3 },
    { text: l("Lint, typecheck, test ve build yapan CI dosyasını yazmak", "Write a CI file that lints, type-checks, tests and builds"), step: 5 },
  ],
  steps: [
    {
      short: l("Geç gelen hata", "Late news"),
      tag: "problem",
      title: l("İki dakika bekledin, sebep kullanılmayan bir değişken", "You waited two minutes for an unused variable"),
      body: [
        l(
          "Bu workflow'da adımlar şöyle sıralı: önce `npm test`, sonra `npm run lint`, en son build. Kodda kullanılmayan bir değişken kaldı; bunu yakalamak lint'in işi.",
          "In this workflow the steps run in this order: `npm test` first, then `npm run lint`, then the build. An unused variable slipped into the code; catching that is lint's job.",
        ),
        l(
          "Run #1 kırmızı, ama hata ancak **2 dakika 18 saniye** sonra geldi: önce 70 saniyelik testlerin bitmesi gerekti. Lint'in kendisi 15 saniye sürüyor.",
          "Run #1 is red, but the error came only after **2 minutes 18 seconds**: the 70-second test step had to finish first. Lint itself takes 15 seconds.",
        ),
      ],
    },
    {
      short: l("Ucuzu öne al", "Cheap first"),
      tag: "idea",
      predict: {
        question: l("Lint'i testlerin önüne aldık ve aynı hatalı kodla tekrar çalıştırdık. Hata kaçıncı saniyede gelir?", "We moved lint before the tests and ran the same broken code again. When does the error arrive?"),
        options: [l("Yine 2 dakika 18 saniyede", "Still at 2 minutes 18 seconds"), l("Yaklaşık 1 dakikada", "After about 1 minute"), l("Hiç gelmez, lint testten sonra olmalı", "Never, lint has to run after the tests")],
        answer: 1,
        why: l(
          "Run artık checkout, Node ve `npm ci`'dan (53 sn) hemen sonra lint'i çalıştırıyor ve 15 saniyede kırılıyor: toplam 68 saniye. Testlere hiç sıra gelmiyor.",
          "The run now lints right after checkout, Node and `npm ci` (53 s) and breaks 15 seconds later: 68 seconds in all. The tests never get a turn.",
        ),
      },
      title: l("Ucuz kontroller öne, pahalılar arkaya", "Cheap checks first, expensive ones last"),
      body: [
        l(
          "Run #2 aynı hatayı **68 saniyede** buldu. Kural basit: en hızlı biten ve en sık kırılan kontrolü en öne koy. Lint ve typecheck saniyeler sürer, testler ve build dakikalar.",
          "Run #2 found the same error in **68 seconds**. The rule is simple: put the check that finishes fastest and breaks most often first. Lint and typecheck take seconds; tests and builds take minutes.",
        ),
        l(
          "Buna **fail fast** denir: kötü haber ne kadar erken gelirse, düzeltmeye o kadar erken başlarsın ve boşa o kadar az makine dakikası harcarsın.",
          "This is called **fail fast**: the sooner the bad news comes, the sooner you start fixing, and the fewer machine minutes you waste.",
        ),
      ],
    },
    {
      short: l("Exit code", "Exit code"),
      tag: "how",
      title: l("Adımı kırmızı yapan şey: exit code", "What turns a step red: the exit code"),
      body: [
        l(
          "GitHub logu okumaz, sadece komutun bitince verdiği sayıya bakar: [[exitCode|exit code]] 0 ise adım yeşil, başka bir şeyse kırmızı. ESLint hata bulunca 1 döner, `tsc` tip hatası bulunca 2.",
          "GitHub does not read the log; it only looks at the number the command returns when it ends: an [[exitCode|exit code]] of 0 is green, anything else is red. ESLint returns 1 when it finds an error, `tsc` returns 2 on a type error.",
        ),
        l(
          "Lint'i düzelttik ama yeni commit'te bir tip hatası var. Araya `npx tsc --noEmit` adımını ekledik: Run #3 typecheck'te exit code 2 ile kırıldı, 88. saniyede.",
          "We fixed lint, but the new commit has a type error. We added an `npx tsc --noEmit` step in between: run #3 broke on typecheck with exit code 2, at second 88.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bunun tersi de doğru: bir script hatayı ekrana yazıp yine de 0 dönerse CI yeşil kalır. Kendi script'lerinde hata olunca `exit 1` ile çıktığından emin ol.",
            "The reverse is true too: a script that prints an error but still returns 0 keeps CI green. Make sure your own scripts `exit 1` when something goes wrong.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "npm run lint; echo \"exit code: $?\"", note: l("`$?` son komutun exit code'unu gösterir.", "`$?` shows the last command's exit code.") },
          { cmd: "npx tsc --noEmit; echo \"exit code: $?\"" },
        ],
      },
    },
    {
      short: l("Gizlenen hata", "Hidden error"),
      tag: "experiment",
      predict: {
        question: l("Yeni commit'te hem bir test hem de build kırık. Run'ın logunda kaç hata görürsün?", "The new commit breaks both a test and the build. How many errors do you see in the run's log?"),
        options: [l("İkisini de", "Both"), l("Sadece test hatasını", "Only the test failure"), l("Sadece build hatasını", "Only the build failure")],
        answer: 1,
        why: l(
          "Job ilk kırılan adımda durur. Test kırılınca build adımı \"atlandı\" olarak kalır; build'in de bozuk olduğunu bu run'dan öğrenemezsin.",
          "A job stops at the first failing step. Once the tests fail, the build stays \"skipped\"; this run cannot tell you the build is broken too.",
        ),
      },
      title: l("Kırılan adımdan sonrası hiç çalışmaz", "Nothing runs after the failing step"),
      body: [
        l(
          "Run #4'te `npm test` kırıldı ve `npm run build` gri: atlandı. Build'deki hata hâlâ orada, sadece henüz görünmüyor.",
          "In run #4 `npm test` broke and `npm run build` is grey: skipped. The build error is still there; it just does not show yet.",
        ),
      ],
    },
    {
      short: l("Sıradaki hata", "Next error"),
      tag: "experiment",
      title: l("Bir hatayı düzelt, sıradaki görünsün", "Fix one error, the next one appears"),
      body: [
        l(
          "Testi düzeltip push'ladık. Run #5 bu sefer build'de kırıldı: `Rollup failed to resolve import`. Hatalar tek tek geliyor, her biri için bir run daha bekliyorsun.",
          "We fixed the test and pushed. Run #5 now breaks on the build: `Rollup failed to resolve import`. The errors arrive one by one, each costing another run.",
        ),
        l(
          "Bunu kısaltmanın en ucuz yolu push'lamadan önce aynı komutları kendi makinende çalıştırmak. CI senin unuttuğunu yakalamak için var, ilk kontrol olmak için değil.",
          "The cheapest way to shorten this is to run the same commands on your own machine before pushing. CI is there to catch what you forgot, not to be your first check.",
        ),
      ],
      practice: {
        intro: l("Push'tan önce hepsini sırayla dene; `&&` ilk hatada durur, tıpkı CI gibi.", "Run them all in order before pushing; `&&` stops at the first error, just like CI."),
        commands: [{ cmd: "npm run lint && npm run typecheck && npm test && npm run build" }],
        snippets: [{ label: "package.json", code: SCRIPTS, note: l("CI'daki adımlar bu script'leri çağırır; yerelde ve CI'da aynı komut çalışır.", "The CI steps call these scripts, so the same command runs locally and in CI.") }],
      },
    },
    {
      short: l("Yeşil", "Green"),
      tag: "how",
      title: l("Lint → typecheck → test → build", "Lint → typecheck → test → build"),
      body: [
        l(
          "Build'i de düzelttik: Run #6 yedi adımın hepsini geçti. Sıra ucuzdan pahalıya: lint (15 sn), typecheck (20 sn), test (70 sn), build (35 sn).",
          "We fixed the build too: run #6 passed all seven steps. The order goes from cheap to expensive: lint (15 s), typecheck (20 s), tests (70 s), build (35 s).",
        ),
        l(
          "Build en sonda çünkü testlerden geçmemiş kodu paketlemenin anlamı yok. Bir sonraki bölümde bu kontrolleri ayrı job'lara bölüp aynı anda çalıştıracağız.",
          "The build is last because there is no point packaging code that failed its tests. In the next chapter we split these checks into separate jobs that run at the same time.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: FINAL }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Uyarılar:** ESLint varsayılan olarak sadece hatalarda 1 döner, uyarılarda 0. Uyarıların da CI'ı kırmasını istiyorsan `eslint . --max-warnings=0` kullan.",
          "**Warnings:** by default ESLint returns 1 only on errors and 0 on warnings. If you want warnings to break CI too, use `eslint . --max-warnings=0`.",
        ),
        l(
          "**Hepsini görmek istersen:** bazen bir run'da bütün hataları birden görmek istersin. Kontrolleri ayrı job'lara bölmek (\"Paralel job'lar ve matrix\") ya da `if: always()` (\"Koşullar ve çıktılar\") bunu sağlar.",
          "**If you want to see everything:** sometimes you want every error in one run. Splitting the checks into separate jobs (\"Parallel jobs and matrix\") or `if: always()` (\"Conditions and outputs\") gives you that.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede her adımın süresi sabit ve hata mesajları kısaltılmış. Gerçekte lint ve test süreleri projenin büyüklüğüyle değişir; büyük projelerde typecheck da dakikalar sürebilir. Sıralamayı kendi run'larındaki sürelere bakarak yap.",
            "On stage every step has a fixed time and the error messages are shortened. In reality lint and test times grow with the project, and in big projects typecheck can take minutes too. Order the steps by looking at the times in your own runs.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "gh run view --log-failed", note: l("Son kırmızı run'ın sadece kırılan adımlarının logu.", "Only the failed steps' log of the latest red run.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Bu workflow'da sıra ters: test, typecheck, build, en sonda lint. Kodda bir lint ve bir tip hatası var; ilk run typecheck'te 2 dakika 23 saniyede kırıldı. Bir kontrolü öne alabilir, hataları düzeltip push'layabilirsin.",
          "This workflow has the order backwards: tests, typecheck, build, and lint last. The code has a lint error and a type error; the first run broke on typecheck after 2 minutes 23 seconds. You can move a check to the front and push fixes.",
        ),
        l("Sahnenin altında **2 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **2 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Bir adım, komutu 0 dışında bir exit code ile bitince kırmızı olur.", "A step turns red when its command ends with a non-zero exit code."),
    l("Job ilk kırılan adımda durur; sonraki adımlar atlanır ve onların hataları görünmez.", "A job stops at the first failing step; later steps are skipped and their errors stay hidden."),
    l("Ucuz ve sık kırılan kontrolleri öne koy: lint → typecheck → test → build.", "Put cheap, often-failing checks first: lint → typecheck → test → build."),
    l("Fail fast: hata ne kadar erken gelirse o kadar az bekler, o kadar az dakika harcarsın.", "Fail fast: the earlier the error, the less you wait and the fewer minutes you pay."),
    l("Push'lamadan önce aynı script'leri yerelde `&&` ile çalıştır.", "Before pushing, run the same scripts locally, chained with `&&`."),
  ],
  quiz: [
    {
      question: l("GitHub bir adımın başarısız olduğuna neye bakarak karar verir?", "How does GitHub decide that a step failed?"),
      options: [l("Logda \"error\" kelimesi geçmesine", "Whether the log contains \"error\""), l("Komutun exit code'unun 0 olmamasına", "Whether the command's exit code is not 0"), l("Adımın 1 dakikadan uzun sürmesine", "Whether the step took over a minute"), l("Logun kırmızı renkte olmasına", "Whether the log is red")],
      answer: 1,
      explain: l("Sadece exit code önemli: 0 başarı, diğer her şey başarısızlık.", "Only the exit code matters: 0 is success, anything else is failure."),
      reviewStep: 2,
    },
    {
      question: l("Lint 15, test 70 saniye sürüyor. Lint hatasını en erken görmek için ne yaparsın?", "Lint takes 15 seconds, tests take 70. How do you see a lint error as early as possible?"),
      options: [l("Lint'i testlerden sonraya koyarım", "Put lint after the tests"), l("Lint'i testlerden önceye koyarım", "Put lint before the tests"), l("Lint'i silerim", "Remove lint"), l("Testleri ikiye katlarım", "Run the tests twice")],
      answer: 1,
      explain: l("Ucuz kontrol önde olursa job, pahalı adımı beklemeden kırılır.", "With the cheap check first, the job breaks without waiting for the expensive step."),
      reviewStep: 1,
    },
    {
      question: l("Test adımı kırıldı, build adımı gri (atlandı). Build hakkında ne biliyorsun?", "The test step failed and the build step is grey (skipped). What do you know about the build?"),
      options: [l("Build sağlam", "The build is fine"), l("Build bozuk", "The build is broken"), l("Hiçbir şey: build hiç çalışmadı", "Nothing: the build never ran"), l("Build testten önce çalıştı", "The build ran before the tests")],
      answer: 2,
      explain: l("Atlanan adım çalışmamıştır; sağlam ya da bozuk olduğunu bu run söyleyemez.", "A skipped step did not run; this run cannot say whether it works."),
      reviewStep: 3,
    },
    {
      question: l("Bir script hatayı ekrana yazdı ama `exit 0` ile bitti. CI ne gösterir?", "A script printed an error but ended with `exit 0`. What does CI show?"),
      options: [l("Kırmızı", "Red"), l("Yeşil", "Green"), l("Sarı uyarı", "A yellow warning"), l("Run iptal olur", "The run is cancelled")],
      answer: 1,
      explain: l("Exit code 0 olduğu sürece adım yeşildir; hatayı exit code ile bildirmek script'in görevi.", "With exit code 0 the step is green; reporting the failure through the exit code is the script's job."),
      reviewStep: 2,
    },
  ],
};
