import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { ONE, scene, split } from "./Scene";

export const pipelineAnatomy: Lesson = {
  slug: "pipeline-anatomy",
  title: l("Bir pipeline'ın parçaları", "The parts of a pipeline"),
  summary: l(
    "Trigger, workflow, run, job, step ve runner: her parçanın ne olduğunu ve birbirine nasıl bağlandığını gör. Job'lar varsayılan olarak aynı anda çalışır; `needs` onları sıraya koyar.",
    "Trigger, workflow, run, job, step and runner: see what each part is and how they connect. Jobs run at the same time by default; `needs` puts them in order.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Trigger, workflow ve run arasındaki farkı bilmek", "Tell a trigger, a workflow and a run apart"), step: 1 },
    { text: l("Job ve step'in ne olduğunu bilmek", "Know what a job and a step are"), step: 2 },
    { text: l("Job'ların varsayılan olarak paralel çalıştığını görmek", "See that jobs run in parallel by default"), step: 3 },
    { text: l("`needs` ile job'ları sıraya koymak", "Put jobs in order with `needs`"), step: 4 },
    { text: l("Her job'ın kendi runner'ında çalıştığını görmek", "See that every job runs on its own runner"), step: 6 },
  ],
  steps: [
    {
      short: l("Trigger", "Trigger"),
      tag: "idea",
      title: l("Her şey bir olayla başlar", "Everything starts with an event"),
      body: [
        l(
          "Bir pipeline'ı başlatan şeye [[trigger]] denir. Bizimkinde `on: push` yazıyor: main'e bir push gelince GitHub bu [[workflow]] dosyasını okur ve bir [[run]] başlatır.",
          "What starts a pipeline is called a [[trigger]]. Ours says `on: push`: when a push lands on main, GitHub reads this [[workflow]] file and starts a [[run]].",
        ),
        l(
          "Push'ladık ve sağda run #1 belirdi. Bu derste her parçaya tek tek bakacağız: olay, workflow, run, job, step ve hepsini çalıştıran makine.",
          "We pushed and run #1 appeared on the right. In this lesson we look at each part in turn: the event, the workflow, the run, the job, the step and the machine that runs them all.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(ONE) }] },
    },
    {
      short: l("Workflow ve run", "Workflow and run"),
      tag: "how",
      title: l("Workflow bir tarif, run onun bir pişirilişi", "A workflow is a recipe, a run is one cooking of it"),
      body: [
        l(
          "İki commit daha push'ladık. Workflow dosyası hâlâ tek, ama artık üç run var: #1, #2, #3. Her push aynı tarifi yeniden, o commit'in koduyla çalıştırır.",
          "We pushed two more commits. There is still one workflow file, but now there are three runs: #1, #2, #3. Every push runs the same recipe again, with that commit's code.",
        ),
        l(
          "Zaman çizelgesine bak: push'lar 30 saniye arayla geldi ve run'lar üst üste bindi. Run'lar birbirini beklemez; her biri ayrı makinelerde aynı anda çalışabilir.",
          "Look at the timeline: the pushes came 30 seconds apart and the runs overlap. Runs do not wait for each other; each can run at the same time on separate machines.",
        ),
      ],
      practice: { commands: [{ cmd: "gh run list --workflow CI", note: l("Bir workflow'un bütün run'ları, numaralarıyla.", "Every run of a workflow, with its number.") }] },
    },
    {
      short: l("Job ve step", "Job and step"),
      tag: "how",
      title: l("Run'ın içinde: job'lar ve step'ler", "Inside a run: jobs and steps"),
      body: [
        l(
          "Bir run bir ya da daha fazla [[job]]'dan oluşur. Bizim workflow'da tek job var: `ci`. Job, aynı makinede baştan sona çalışan bir iş paketidir.",
          "A run is made of one or more [[job|jobs]]. Our workflow has a single job: `ci`. A job is a bundle of work that runs start to finish on one machine.",
        ),
        l(
          "Job'ın içinde altı [[step]] var: checkout, Node kurulumu, `npm ci`, lint, test, build. Step'ler sırayla çalışır ve aynı dosyaları paylaşır: `npm ci`'ın kurduğu `node_modules`'ı bir sonraki step kullanır.",
          "Inside the job are six [[step|steps]]: checkout, set up Node, `npm ci`, lint, test, build. Steps run in order and share the same files: the `node_modules` that `npm ci` installs is used by the next step.",
        ),
      ],
    },
    {
      short: l("Paralel", "Parallel"),
      tag: "experiment",
      predict: {
        question: l("İşi üç job'a böldük: `lint`, `test`, `build`. Hangi sırayla çalışırlar?", "We split the work into three jobs: `lint`, `test`, `build`. In what order do they run?"),
        options: [l("Dosyada yazıldığı sırayla", "In the order they are written"), l("Üçü aynı anda", "All three at the same time"), l("Alfabetik sırayla", "In alphabetical order")],
        answer: 1,
        why: l(
          "Job'lar arasında bir bağ yazmadıysan GitHub hepsini aynı anda, ayrı makinelerde başlatır.",
          "Unless you write a link between them, GitHub starts all the jobs at once, on separate machines.",
        ),
      },
      title: l("Job'lar varsayılan olarak aynı anda çalışır", "Jobs run at the same time by default"),
      body: [
        l(
          "Alttaki çizelgede üç çubuk da 0. saniyede başladı. Run, en uzun süren job kadar sürdü: `test`'in 2 dakika 3 saniyesi. Tek job'ken 2 dakika 53 saniyeydi.",
          "On the timeline below, all three bars start at second 0. The run took as long as the longest job: `test`'s 2 minutes 3 seconds. As a single job it was 2 minutes 53 seconds.",
        ),
        l(
          "Ama bir sorun var: `build`, testlerin sonucunu beklemeden çalıştı. Testler kırılsa bile build'e dakika harcanacaktı.",
          "But there is a catch: `build` ran without waiting for the tests. Even if the tests failed, minutes would still go into the build.",
        ),
      ],
    },
    {
      short: l("needs", "needs"),
      tag: "how",
      predict: {
        question: l("`build` job'ına `needs: [lint, test]` yazdık. `build` ne zaman başlar?", "We wrote `needs: [lint, test]` on the `build` job. When does `build` start?"),
        options: [l("`lint` bitince", "When `lint` finishes"), l("İkisi de bitince, yani en yavaşı bitince", "When both finish, that is, when the slower one does"), l("Hemen, ama sonucu bekler", "Right away, but it waits for their results")],
        answer: 1,
        why: l("`needs` listedeki her job'ın başarıyla bitmesini bekler. `test` daha uzun sürdüğü için `build` onun bitişinde başlar.", "`needs` waits for every job in the list to finish successfully. `test` takes longer, so `build` starts when it ends."),
      },
      title: l("needs job'ları sıraya koyar", "needs puts jobs in order"),
      body: [
        l(
          "`lint` ve `test` yine birlikte başladı; `build` 2. dakikada, ikisi de bitince başladı. Run daha uzun sürdü (3 dakika 31 saniye), ama artık build sadece kontrollerden geçen kod için yapılıyor.",
          "`lint` and `test` started together again; `build` started at minute 2, once both were done. The run took longer (3 minutes 31 seconds), but now the build only happens for code that passed the checks.",
        ),
        l(
          "Sahnede oklar bu bağları gösteriyor. Hızla güvenlik arasında seçim yapıyorsun: paralel olan her şey zaman kazandırır, `needs` ile bağlanan her şey boşa iş yapmayı önler.",
          "On stage the arrows show these links. You are choosing between speed and safety: everything in parallel saves time, everything chained with `needs` avoids wasted work.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(split(["lint", "test"])) }] },
    },
    {
      short: l("Kırılınca", "On failure"),
      tag: "experiment",
      predict: {
        question: l("Lint hatası olan bir commit push'landı. `build` job'ına ne olur?", "A commit with a lint error is pushed. What happens to the `build` job?"),
        options: [l("Çalışır ve geçer", "It runs and passes"), l("Atlanır", "It is skipped"), l("Çalışır ama kırılır", "It runs and fails")],
        answer: 1,
        why: l("`build`, `lint`'e ihtiyaç duyuyor. `lint` kırılınca `build` hiç başlamaz ve \"atlandı\" olarak görünür.", "`build` needs `lint`. When `lint` fails, `build` never starts and shows as \"skipped\"."),
      },
      title: l("Kırık bir job, ona bağlı olanları durdurur", "A failed job stops the jobs that need it"),
      body: [
        l(
          "`lint` kırmızı, `test` yeşil (kendi işini bitirdi), `build` atlandı. Run başarısız sayılır, çünkü bir job kırıldı.",
          "`lint` is red, `test` is green (it finished its own work), `build` was skipped. The run counts as failed because a job failed.",
        ),
      ],
    },
    {
      short: l("Runner", "Runner"),
      tag: "how",
      title: l("Her job kendi makinesinde", "Every job on its own machine"),
      body: [
        l(
          "Hata düzeltildi, run yeşil. Şimdi çizelgedeki çubukların içindeki çizgilere bak: her job checkout, Node kurulumu ve `npm ci` ile başlıyor. Üç job, üç kez aynı hazırlık.",
          "The bug is fixed and the run is green. Now look at the lines inside the bars: every job begins with checkout, set up Node and `npm ci`. Three jobs, the same preparation three times.",
        ),
        l(
          "Çünkü her job ayrı bir [[runner]]'da, yani sıfırdan açılan ayrı bir makinede çalışır. Bir job'ın kurduğu şeyleri diğeri görmez. Bunun ne demek olduğunu \"Her job temiz bir makinede\" dersinde yakından göreceğiz.",
          "Because every job runs on a separate [[runner]], a separate machine started from scratch. What one job installs, the next does not see. You will see what that means up close in \"Every job gets a fresh machine\".",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçekte", "In reality"),
      body: [
        l(
          "Job'ları bölmek her zaman hızlandırmaz: her job'ın kendi hazırlığı ve makine açılma süresi var. Küçük projelerde tek job çoğu zaman yeterlidir; bölmek, uzun süren ve birbirinden bağımsız işler olduğunda kazandırır.",
          "Splitting jobs does not always make things faster: each job has its own preparation and machine start-up time. In small projects one job is often enough; splitting pays off when there is long, independent work.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her job anında bir makine bulur ve step süreleri sabittir. Gerçekte runner'ın açılması birkaç saniye sürer, ücretsiz planlarda aynı anda çalışabilen job sayısı sınırlıdır ve fazla job sırada bekler.",
            "On this stage every job finds a machine at once and step times are fixed. In reality a runner takes a few seconds to start, free plans limit how many jobs run at once, and extra jobs wait in a queue.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "gh run view --log", note: l("Bir run'ın bütün job ve step loglarını terminalde gör.", "See every job's and step's log of a run in your terminal.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda mağaza projesi ve gerçek işten **4 senaryo** var: üç dakikalık tek bir job, testler kırmızıyken boşuna çalışan bir build, hangisinin kırıldığı belli olmayan üç job. Workflow'u `nano .github/workflows/ci.yml` ile **kendin düzenle**, `git push` ile gönder; altta job'ların zaman çizelgesi belirir.",
          "Your turn. Below is the shop project and **4 scenarios** from real work: one three-minute job, a build that runs for nothing while the tests are red, three jobs and no idea which one broke. **Edit the workflow yourself** with `nano .github/workflows/ci.yml` and send it with `git push`; the jobs' timeline appears below.",
        ),
        l(
          "`gh run view` hangi job'ın kırıldığını, `--log-failed` nedenini gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`gh run view` shows which job broke, `--log-failed` why. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Trigger bir olaydır (push, PR…); workflow dosyası tariftir; run o tarifin bir kez çalışmasıdır.", "A trigger is an event (push, PR…); the workflow file is the recipe; a run is one execution of it."),
    l("Bir run job'lardan, bir job sırayla çalışan step'lerden oluşur.", "A run is made of jobs; a job is made of steps that run in order."),
    l("Job'lar varsayılan olarak aynı anda çalışır; run en uzun yol kadar sürer.", "Jobs run at the same time by default; a run lasts as long as its longest path."),
    l("`needs` bir job'ı başkalarının başarıyla bitmesine bağlar.", "`needs` makes a job wait for others to finish successfully."),
    l("Bağlı olduğu job kırılırsa job atlanır.", "If a job it needs fails, the job is skipped."),
    l("Her job kendi runner'ında, sıfırdan başlar.", "Every job starts from scratch on its own runner."),
  ],
  quiz: [
    {
      question: l("Bir workflow ile bir run arasındaki fark nedir?", "What is the difference between a workflow and a run?"),
      options: [
        l("Aynı şey", "They are the same"),
        l("Workflow dosyadaki tariftir, run onun bir kez çalışmasıdır", "The workflow is the recipe in the file, a run is one execution of it"),
        l("Run birden fazla workflow içerir", "A run holds several workflows"),
        l("Workflow sadece main'de vardır", "A workflow only exists on main"),
      ],
      answer: 1,
      explain: l("Bir workflow dosyası her tetiklendiğinde yeni bir run oluşur.", "Each time a workflow is triggered, a new run is created."),
      reviewStep: 1,
    },
    {
      question: l("İki job arasında hiçbir bağ yoksa nasıl çalışırlar?", "How do two jobs with no link between them run?"),
      options: [l("Yazıldıkları sırayla", "In the order written"), l("Aynı anda, ayrı makinelerde", "At the same time, on separate machines"), l("Aynı makinede sırayla", "One after the other on the same machine"), l("Sadece biri çalışır", "Only one runs")],
      answer: 1,
      explain: l("Varsayılan paraleldir; sıra istiyorsan `needs` yazarsın.", "Parallel is the default; for an order you write `needs`."),
      reviewStep: 3,
    },
    {
      question: l("`build: needs: [lint, test]` olan bir workflow'da `test` kırılırsa `build`'e ne olur?", "With `build: needs: [lint, test]`, what happens to `build` when `test` fails?"),
      options: [l("Çalışır", "It runs"), l("Atlanır", "It is skipped"), l("`lint`'i bekler, sonra çalışır", "It waits for `lint`, then runs"), l("Tekrar dener", "It retries")],
      answer: 1,
      explain: l("`needs` listesindeki her job başarılı olmalı; biri kırılınca bağlı job atlanır.", "Every job in `needs` must succeed; if one fails, the job that needs it is skipped."),
      reviewStep: 5,
    },
    {
      question: l("Neden her job'da yeniden checkout ve `npm ci` yapılıyor?", "Why does every job do checkout and `npm ci` again?"),
      options: [
        l("Workflow yanlış yazılmış", "The workflow is written wrong"),
        l("Her job sıfırdan açılan ayrı bir runner'da çalışır", "Every job runs on a separate runner started from scratch"),
        l("GitHub cache'i siler", "GitHub clears the cache"),
        l("Testler bunu ister", "The tests need it"),
      ],
      answer: 1,
      explain: l("Job'lar makine paylaşmaz; her biri kendi hazırlığını yapmak zorunda.", "Jobs do not share a machine; each must do its own preparation."),
      reviewStep: 6,
    },
  ],
};
