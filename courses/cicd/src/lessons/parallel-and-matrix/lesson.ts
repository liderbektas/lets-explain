import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { MATRIX, PAR, scene } from "./Scene";

export const parallelAndMatrix: Lesson = {
  slug: "parallel-and-matrix",
  title: l("Paralel job'lar ve matrix", "Parallel jobs and matrix"),
  summary: l(
    "Job'lar varsayılan olarak aynı anda çalışır; `needs` onları sıraya koyar. Run, en yavaş yolu kadar sürer. `matrix` aynı job'ı birkaç Node sürümünde çalıştırır, `fail-fast` ise bir bacak kırılınca diğerlerini durdurur.",
    "Jobs run at the same time by default; `needs` puts them in order. A run takes as long as its slowest path. `matrix` runs the same job on several Node versions, and `fail-fast` stops the other legs once one fails.",
  ),
  minutes: 16,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kontrolleri paralel job'lara bölmek", "Split the checks into parallel jobs"), step: 1 },
    { text: l("Run süresinin en yavaş yol olduğunu görmek", "See that a run lasts as long as its slowest path"), step: 1 },
    { text: l("`needs` ile bir job'ı başkalarına bağlamak", "Make a job wait for others with `needs`"), step: 2 },
    { text: l("`matrix` ile birden çok Node sürümünde test etmek", "Test on several Node versions with `matrix`"), step: 3 },
  ],
  steps: [
    {
      short: l("Tek uzun job", "One long job"),
      tag: "problem",
      title: l("Her şey tek job'da, sırayla", "Everything in one job, one after another"),
      body: [
        l(
          "Projeye tarayıcıda çalışan uçtan uca testler (e2e) eklendi ve CI uzadı. Tek bir job her şeyi sırayla yapıyor: lint, typecheck, test, e2e, build. Run #1 **5 dakika 43 saniye** sürdü.",
          "The project got end-to-end tests (e2e) that run in a browser, and CI got longer. A single job does everything in turn: lint, typecheck, test, e2e, build. Run #1 took **5 minutes 43 seconds**.",
        ),
        l(
          "Sağdaki zaman çizelgesinde tek bir uzun çubuk var; içindeki çizgiler adımlar. Lint'in testleri, testlerin e2e'yi beklemesi için bir sebep yok, ama hepsi aynı makinede sırayla çalışıyor.",
          "The timeline on the right shows one long bar; the lines inside are the steps. There is no reason for lint to wait for the tests or the tests to wait for e2e, but they all run in turn on one machine.",
        ),
      ],
    },
    {
      short: l("Paralel", "Parallel"),
      tag: "idea",
      predict: {
        question: l(
          "Lint, test ve e2e'yi ayrı [[job]]'lara böldük; build lint ve testi bekliyor. Her job kendi checkout ve `npm ci`'ını yapıyor (53 sn). Run şimdi ne kadar sürer?",
          "We split lint, test and e2e into their own [[job|jobs]]; build waits for lint and test. Each job does its own checkout and `npm ci` (53 s). How long does the run take now?",
        ),
        options: [l("Yine 5 dakika 43 saniye", "Still 5 minutes 43 seconds"), l("En yavaş yol kadar: yaklaşık 3,5 dakika", "As long as the slowest path: about 3.5 minutes"), l("Adımların ortalaması kadar: 1 dakika", "The average step: 1 minute")],
        answer: 1,
        why: l(
          "Birbirini beklemeyen job'lar aynı anda başlar. Run, en uzun zincir kadar sürer: test (2:03) bitince build (1:28) başlar, toplam 3:31. e2e (3:23) bu zincirden biraz kısa.",
          "Jobs that do not wait for each other start together. The run lasts as long as the longest chain: test (2:03), then build (1:28), 3:31 in all. e2e (3:23) is a bit shorter than that chain.",
        ),
      },
      title: l("Job'lar aynı anda çalışır", "Jobs run at the same time"),
      body: [
        l(
          "Run #2 **3 dakika 31 saniye** sürdü. Zaman çizelgesinde lint, test ve e2e aynı anda başlıyor; build, testin bittiği yerden başlıyor. Run'ın süresini bu en uzun yol belirler.",
          "Run #2 took **3 minutes 31 seconds**. On the timeline lint, test and e2e start together; build starts where test ends. That longest path sets the run's length.",
        ),
        l(
          "Bedava değil: her job ayrı bir [[runner]] demek ve her biri checkout ile `npm ci`'ı yeniden yapıyor. Faturalanan dakika 6'dan 11'e çıktı. Daha kısa beklersin ama daha çok makine dakikası harcarsın.",
          "It is not free: each job is a separate [[runner]], and each one repeats checkout and `npm ci`. Billed minutes went from 6 to 11. You wait less but use more machine minutes.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(PAR) }] },
    },
    {
      short: l("needs", "needs"),
      tag: "how",
      predict: {
        question: l("Yeni commit'te bir test kırık. Build `needs: [lint, test]` diyor. e2e ve build'e ne olur?", "The new commit breaks a test. Build says `needs: [lint, test]`. What happens to e2e and build?"),
        options: [l("İkisi de durur", "Both stop"), l("e2e çalışır, build atlanır", "e2e runs, build is skipped"), l("İkisi de çalışır", "Both run")],
        answer: 1,
        why: l(
          "e2e kimseye bağlı değil, bu yüzden kendi işini bitirir. Build ise ihtiyaç duyduğu test job'ı kırıldığı için hiç başlamaz.",
          "e2e depends on nothing, so it finishes its work. Build never starts because a job it needs failed.",
        ),
      },
      title: l("needs: önce onlar bitsin", "needs: wait for them first"),
      body: [
        l(
          "Run #3'te test kırmızı, build \"atlandı: ihtiyaç duyduğu job kırıldı\". Lint ve e2e yeşil: paralel job'lar birbirinin sonucunu beklemez, bu yüzden tek run'da daha çok hata görürsün.",
          "In run #3 test is red and build says \"skipped: a job it needs failed\". Lint and e2e are green: parallel jobs do not wait for each other's results, so one run shows you more errors.",
        ),
        l(
          "`needs` iki şey yapar: sırayı belirler ve bir kapı koyar. İhtiyaç duyulan job başarısız olursa bağlı job varsayılan olarak çalışmaz.",
          "`needs` does two things: it sets the order and puts up a gate. If a needed job fails, the dependent job does not run by default.",
        ),
      ],
    },
    {
      short: l("Matrix", "Matrix"),
      tag: "how",
      title: l("Aynı job, iki Node sürümü", "The same job, two Node versions"),
      body: [
        l(
          "Uygulama hem Node 20 hem Node 22 kullanan sunucularda çalışacak. Test job'ına `strategy.matrix.node: [20, 22]` ekledik: GitHub aynı job'dan iki kopya açtı, `test (20)` ve `test (22)`. Kurulan Node sürümü `${{ matrix.node }}`'dan geliyor.",
          "The app will run on servers with Node 20 and Node 22. We added `strategy.matrix.node: [20, 22]` to the test job: GitHub started two copies of it, `test (20)` and `test (22)`. The Node to install comes from `${{ matrix.node }}`.",
        ),
        l(
          "Yeni commit `Object.groupBy` kullanıyor. Node 22'de var, Node 20'de yok: `test (20)` kırıldı, `test (22)` geçti. Tek Node ile test etseydin bu hatayı ancak sunucuda görürdün.",
          "The new commit uses `Object.groupBy`. Node 22 has it, Node 20 does not: `test (20)` failed and `test (22)` passed. Testing on one Node only, you would have found this on the server.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(MATRIX), note: l("Matrix'e başka eksenler de eklenebilir, örneğin `os: [ubuntu-latest, windows-latest]`; her kombinasyon ayrı bir job olur.", "You can add more axes, for example `os: [ubuntu-latest, windows-latest]`; every combination becomes a job.") }] },
    },
    {
      short: l("fail-fast", "fail-fast"),
      tag: "experiment",
      predict: {
        question: l(
          "e2e'yi de matrix job'ına taşıdık. `test (20)` testte kırıldı; o sırada `test (22)` hâlâ e2e çalıştırıyor. Ne olur?",
          "We moved e2e into the matrix job too. `test (20)` failed on the tests; at that moment `test (22)` is still running e2e. What happens?",
        ),
        options: [l("`test (22)` işini bitirir", "`test (22)` finishes its work"), l("`test (22)` iptal edilir", "`test (22)` is cancelled"), l("`test (20)` baştan başlar", "`test (20)` starts over")],
        answer: 1,
        why: l(
          "Matrix'in varsayılanı `fail-fast: true`: bir bacak kırılınca hâlâ çalışan diğer bacaklar iptal edilir. Sonuç zaten kırmızı olacak, dakika boşa gitmesin diye.",
          "A matrix defaults to `fail-fast: true`: once one leg fails, the legs still running are cancelled. The result is red anyway, so the minutes are not wasted.",
        ),
      },
      title: l("Bir bacak kırılınca diğerleri durur", "One leg fails, the others stop"),
      body: [
        l(
          "Run #5'te `test (22)` \"iptal\" oldu ve zaman çizelgesindeki çubuğu `test (20)`'nin kırıldığı anda kesildi. Build de atlandı.",
          "In run #5 `test (22)` was cancelled and its bar on the timeline stops exactly where `test (20)` failed. Build was skipped too.",
        ),
        l(
          "Bu dakika kazandırır ama bir bilgiyi de saklar: Node 22'de e2e geçiyor muydu? Her bacağın sonucunu görmek istersen `fail-fast: false` yazarsın; bunu \"Boşuna çalışmayı engelle\" dersinde tartacağız.",
          "That saves minutes but also hides something: would e2e have passed on Node 22? If you want every leg's result, write `fail-fast: false`; we weigh that in \"Stop wasted runs\".",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede paralel job'lar", "Parallel jobs in a real project"),
      body: [
        l(
          "**Sınırlar var:** ücretsiz planda aynı anda en fazla 20 job çalışır, bir matrix en fazla 256 job üretebilir. Fazlası sırada bekler.",
          "**There are limits:** on the free plan at most 20 jobs run at the same time, and one matrix can produce at most 256 jobs. The rest wait in a queue.",
        ),
        l(
          "**Tekrarlanan hazırlık:** her job checkout ve `npm ci`'ı yeniden yapar. Bunu cache ile kısaltırsın (\"Cache\" dersi); build çıktısını job'lar arasında taşımak için de artifact kullanırsın (\"Artifact'ler\" dersi).",
          "**Repeated setup:** every job repeats checkout and `npm ci`. You shorten that with a cache (the \"Caching\" lesson), and move build output between jobs with artifacts (the \"Artifacts\" lesson).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede her job sıra beklemeden, aynı saniyede başlıyor ve adım süreleri sabit. Gerçekte bir runner'ın açılması birkaç saniye sürer, yoğun saatlerde job'lar sırada bekleyebilir ve iki matrix bacağı aynı sürede bitmeyebilir.",
            "On stage every job starts in the same second with no queue, and step times are fixed. In reality a runner takes a few seconds to start, jobs can queue at busy times, and two matrix legs rarely take exactly the same time.",
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
          "Aşağıda gerçek işten **5 senaryo** var: yavaş bir run, Node 20'de çöken bir kod, beklemeyen bir build. Workflow'u `nano .github/workflows/ci.yml` ile düzenle, gerekiyorsa kodu da düzelt, `git commit` ve `git push` ile gönder.",
          "Below are **5 scenarios** from real work: a slow run, code that crashes on Node 20, a build that doesn't wait. Edit the workflow with `nano .github/workflows/ci.yml`, fix the code when it needs it, and send it with `git commit` and `git push`.",
        ),
        l(
          "Yeni bir job boş bir makinede başlar: checkout, setup-node ve `npm ci` olmadan hiçbir şey çalışmaz. Sağdaki zaman çizelgesi hangi job'ın ne zaman çalıştığını gösterir. Az komutla bitirirsen 3 yıldız alırsın.",
          "A new job starts on an empty machine: nothing works without checkout, setup-node and `npm ci`. The timeline on the right shows when each job ran. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Bir workflow'daki job'lar varsayılan olarak aynı anda, ayrı runner'larda çalışır.", "Jobs in a workflow run at the same time, on separate runners, by default."),
    l("Run, en uzun job zinciri kadar sürer; en yavaş adımı ayırmak en çok kazandırır.", "A run lasts as long as its longest chain; splitting off the slowest step saves the most."),
    l("Paralel job'lar daha az bekletir ama hazırlığı tekrarladığı için daha çok dakika harcar.", "Parallel jobs mean less waiting but more minutes, since each repeats the setup."),
    l("`needs` sırayı belirler; ihtiyaç duyulan job kırılırsa bağlı job atlanır.", "`needs` sets the order; if a needed job fails, the dependent job is skipped."),
    l("`matrix` aynı job'ı birkaç değerle çalıştırır; `fail-fast` varsayılan olarak açıktır.", "`matrix` runs one job with several values; `fail-fast` is on by default."),
  ],
  quiz: [
    {
      question: l("lint 1:08, test 2:03, e2e 3:23 sürüyor ve hepsi paralel. Başka job yok. Run ne kadar sürer?", "lint takes 1:08, test 2:03, e2e 3:23, all in parallel. No other jobs. How long is the run?"),
      options: [l("6:34 (toplam)", "6:34 (the sum)"), l("3:23 (en uzunu)", "3:23 (the longest)"), l("2:11 (ortalama)", "2:11 (the average)"), l("1:08 (en kısası)", "1:08 (the shortest)")],
      answer: 1,
      explain: l("Paralel job'lar aynı anda başlar; run en uzunu bitince biter.", "Parallel jobs start together; the run ends when the longest one does."),
      reviewStep: 1,
    },
    {
      question: l("Kontrolleri paralel job'lara bölünce faturalanan dakikaya ne olur?", "What happens to billed minutes when you split checks into parallel jobs?"),
      options: [l("Azalır", "They go down"), l("Genelde artar, çünkü her job hazırlığı tekrarlar", "They usually go up, since each job repeats the setup"), l("Değişmez", "They stay the same"), l("Sıfırlanır", "They drop to zero")],
      answer: 1,
      explain: l("Her job ayrı makinede checkout ve `npm ci` yapar; bekleme azalır, toplam iş artar.", "Each job does checkout and `npm ci` on its own machine; waiting goes down, total work goes up."),
      reviewStep: 1,
    },
    {
      question: l("`build` job'ında `needs: [test]` var ve test kırıldı. Build'e ne olur?", "The `build` job has `needs: [test]` and test failed. What happens to build?"),
      options: [l("Çalışır", "It runs"), l("Atlanır", "It is skipped"), l("Testi bekler", "It waits for the test"), l("İptal edilip yeniden başlar", "It is cancelled and restarted")],
      answer: 1,
      explain: l("İhtiyaç duyduğu job başarısız olunca bağlı job varsayılan olarak çalışmaz.", "When a needed job fails, the dependent job does not run by default."),
      reviewStep: 2,
    },
    {
      question: l("Matrix'te `test (20)` kırıldı ve `test (22)` hâlâ çalışıyordu. Varsayılan ayarla ne olur?", "In a matrix, `test (20)` failed while `test (22)` was still running. With the default settings, what happens?"),
      options: [l("`test (22)` iptal edilir", "`test (22)` is cancelled"), l("`test (22)` bitirir", "`test (22)` finishes"), l("İkisi de baştan başlar", "Both start over"), l("Matrix devre dışı kalır", "The matrix is turned off")],
      answer: 0,
      explain: l("`fail-fast: true` varsayılandır; hâlâ çalışan bacaklar iptal edilir.", "`fail-fast: true` is the default; legs still running are cancelled."),
      reviewStep: 4,
    },
  ],
};
