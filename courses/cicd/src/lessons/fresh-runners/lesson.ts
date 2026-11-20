import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { ONE_JOB, scene, split } from "./Scene";

export const freshRunners: Lesson = {
  slug: "fresh-runners",
  title: l("Her job temiz bir makinede", "Every job gets a fresh machine"),
  summary: l(
    "Her job sıfırdan açılan ayrı bir runner'da çalışır: bir job'ın ürettiği `node_modules` ya da `dist/` sonraki job'da yoktur. İşi aynı job'da yaparsın ya da dosyayı artifact olarak taşırsın.",
    "Every job runs on a separate runner started from scratch: the `node_modules` or `dist/` one job produces is not there in the next. You either do the work in the same job or carry the files over as an artifact.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir job'ın dosyalarının sonraki job'a geçmediğini görmek", "See that one job's files do not reach the next"), step: 1 },
    { text: l("Checkout'un sadece repodaki kodu getirdiğini anlamak", "Understand that checkout only brings the repo's code"), step: 2 },
    { text: l("Sorunu iki yolla çözmek: yeniden üretmek ya da artifact", "Fix it two ways: rebuild or an artifact"), step: 4 },
    { text: l("Job'lar arasında neyin taşındığını, neyin kaybolduğunu bilmek", "Know what crosses between jobs and what is lost"), step: 5 },
  ],
  steps: [
    {
      short: l("Tek job", "One job"),
      tag: "how",
      title: l("Her şey aynı makinede", "Everything on one machine"),
      body: [
        l(
          "Deploy workflow'umuzda tek bir job var: `ship`. Kodu çeker, Node'u kurar, `npm ci`, test, build ve sonunda `./deploy.sh` ile `dist/` klasörünü staging'e koyar. Run yeşil, staging yeni commit'te.",
          "Our deploy workflow has a single job: `ship`. It fetches the code, sets up Node, runs `npm ci`, the tests and the build, and finally puts the `dist/` folder on staging with `./deploy.sh`. The run is green, staging is on the new commit.",
        ),
        l(
          "Bütün step'ler aynı [[runner]]'da çalıştığı için `npm run build`'in ürettiği `dist/` bir sonraki step'te hâlâ orada.",
          "Every step runs on the same [[runner]], so the `dist/` that `npm run build` produced is still there in the next step.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/deploy.yml", code: workflowYaml(ONE_JOB) }] },
    },
    {
      short: l("İki job", "Two jobs"),
      tag: "experiment",
      predict: {
        question: l(
          "Düzen olsun diye işi ikiye böldük: `build` job'ı test edip build alıyor, `deploy` job'ı sadece `./deploy.sh` çalıştırıyor. Ne olur?",
          "To keep things tidy we split the work: the `build` job tests and builds, the `deploy` job only runs `./deploy.sh`. What happens?",
        ),
        options: [
          l("Aynı şekilde çalışır", "It works just the same"),
          l("`deploy` job'ı `dist/`'i bulamaz ve kırılır", "The `deploy` job cannot find `dist/` and fails"),
          l("`build` job'ı kırılır", "The `build` job fails"),
        ],
        answer: 1,
        why: l(
          "`deploy` job'ı başka bir makinede, boş bir diskle başladı. `dist/` ilk makinede kaldı ve o makine job bitince silindi. Sahnede bunu tezgahlarda görüyorsun: `build`'in tezgahı `dist/` ile dolu ama job bitince silindi, `deploy`'un tezgahına `dist/` hiç gelmedi.",
          "The `deploy` job started on another machine with an empty disk. `dist/` stayed on the first machine, and that machine was deleted when its job ended. You can see it on the benches: `build`'s bench held `dist/` but was cleared when the job ended, and `dist/` never reached `deploy`'s bench.",
        ),
      },
      title: l("Yeni job, yeni makine", "New job, new machine"),
      body: [
        l(
          "`build` yeşil, `deploy` kırmızı: `./deploy.sh: dist/ not found`. `needs: build`, `deploy`'un `build`'i **beklemesini** sağlar, ama dosyalarını **paylaşmasını** sağlamaz.",
          "`build` is green, `deploy` is red: `./deploy.sh: dist/ not found`. `needs: build` makes `deploy` **wait** for `build`, but it does not make them **share** files.",
        ),
        l(
          "Bu, CI'a yeni başlayanların en sık takıldığı yer. Her job'ı ayrı bir bilgisayar gibi düşün: aynı ofiste ama masaları ayrı.",
          "This is where newcomers to CI trip most often. Think of each job as a separate computer: same office, separate desks.",
        ),
      ],
    },
    {
      short: l("Checkout yetmez", "Checkout is not enough"),
      tag: "experiment",
      predict: {
        question: l("`deploy` job'ının başına `actions/checkout` ekledik. `dist/` artık bulunur mu?", "We added `actions/checkout` at the start of the `deploy` job. Is `dist/` found now?"),
        options: [l("Evet, kod geldi", "Yes, the code is here"), l("Hayır: `dist/` repoda değil, build'in ürünü", "No: `dist/` is not in the repo, it is a build output"), l("Sadece main'de bulunur", "Only on main")],
        answer: 1,
        why: l(
          "Checkout repodaki dosyaları getirir. `dist/` ise `.gitignore`'da durur ve sadece build çalışınca oluşur.",
          "Checkout brings the files in the repo. `dist/` sits in `.gitignore` and only exists once a build has run.",
        ),
      },
      title: l("Checkout sadece repoyu getirir", "Checkout only brings the repo"),
      body: [
        l(
          "Yine kırmızı, yine `dist/ not found`. Checkout kaynak kodu getirdi ama derlenmiş çıktıyı getiremez; o hiçbir zaman repoya girmedi.",
          "Red again, `dist/ not found` again. Checkout brought the source code, but it cannot bring the compiled output; that never went into the repo.",
        ),
      ],
    },
    {
      short: l("Yeniden üret", "Rebuild"),
      tag: "how",
      title: l("Birinci yol: ihtiyacın olanı job'da üret", "Way one: produce what you need in the job"),
      body: [
        l(
          "`deploy` job'ına checkout, Node, `npm ci` ve `npm run build` ekledik. Artık `dist/`'i kendisi üretiyor ve run yeşil.",
          "We added checkout, Node, `npm ci` and `npm run build` to the `deploy` job. Now it produces `dist/` itself, and the run is green.",
        ),
        l(
          "Çalışıyor ama bedeli var: uygulama iki kez build edildi ve run 4 dakika 31 saniye sürdü. Daha kötüsü, staging'e giden build test edilen build değil; ikisi küçük farklarla ayrışabilir.",
          "It works, but at a price: the app was built twice and the run took 4 minutes 31 seconds. Worse, the build that reached staging is not the one that was tested; the two can drift apart in small ways.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/deploy.yml", code: workflowYaml(split(["checkout", "setup-node", "install", "build"])) }] },
    },
    {
      short: l("Artifact", "Artifact"),
      tag: "how",
      predict: {
        question: l(
          "İkinci yol: `build` job'ı `dist/`'i yükler, `deploy` job'ı indirir. Run önceki adıma göre nasıl sürer?",
          "Way two: the `build` job uploads `dist/`, the `deploy` job downloads it. How long does the run take compared to the step before?",
        ),
        options: [l("Daha uzun: yükleme ve indirme ekledik", "Longer: we added an upload and a download"), l("Daha kısa: ikinci build ve kurulum yok", "Shorter: no second build or install"), l("Aynı", "The same")],
        answer: 1,
        why: l(
          "Yüklemek ve indirmek birkaç saniye sürer; `npm ci` ve build ise yaklaşık bir buçuk dakika. `deploy` job'ı 28 saniyeye indi.",
          "Uploading and downloading take a few seconds; `npm ci` plus a build take about a minute and a half. The `deploy` job is down to 28 seconds.",
        ),
      },
      title: l("İkinci yol: dosyayı artifact olarak taşı", "Way two: carry the files as an artifact"),
      body: [
        l(
          "`build` job'ının sonuna `actions/upload-artifact`, `deploy` job'ının başına `actions/download-artifact` ekledik. `dist/` GitHub'da run'a ait bir [[artifact]] olarak saklandı ve ikinci makineye indirildi.",
          "We added `actions/upload-artifact` at the end of the `build` job and `actions/download-artifact` at the start of `deploy`. `dist/` was stored on GitHub as an [[artifact]] of the run and downloaded onto the second machine.",
        ),
        l(
          "Run 3 dakika 10 saniyeye indi ve staging'e giden, test edilen build'in **ta kendisi**. Artifact'lerin ayrıntılarını \"Artifact'ler\" dersinde göreceğiz.",
          "The run is down to 3 minutes 10 seconds, and what reached staging is **the very build** that was tested. Artifacts get the full treatment in the \"Artifacts\" lesson.",
        ),
      ],
      practice: { commands: [{ cmd: "gh run download", note: l("Bir run'ın artifact'lerini kendi bilgisayarına indir.", "Download a run's artifacts to your machine.") }], snippets: [{ label: ".github/workflows/deploy.yml", code: workflowYaml(split(["download"], true)) }] },
    },
    {
      short: l("Ne taşınır?", "What crosses?"),
      tag: "how",
      title: l("Job'lar arasında ne taşınır, ne kaybolur?", "What crosses between jobs, and what is lost?"),
      body: [
        l(
          "Soldaki şeyler bir job'dan diğerine ulaşabilir, ama hepsi bilerek yapılan bir adımla: checkout, secret, artifact, cache ya da job çıktısı. Sağdakiler ise job bitince makineyle birlikte gider.",
          "The things on the left can reach one job from another, but each only through a deliberate step: checkout, a secret, an artifact, the cache or a job output. The things on the right go away with the machine when the job ends.",
        ),
        l(
          "Bir şey \"bende çalışıyordu ama CI'da yok\" diyorsa ilk soracağın soru: bu şey bu job'ın makinesine nasıl geldi?",
          "When something \"works for me but is missing in CI\", the first question to ask is: how did this thing get onto this job's machine?",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçekte", "In reality"),
      body: [
        l(
          "GitHub'ın hosted runner'ları her job için yeni bir sanal makine açar ve job bitince siler. Kendi sunucunda çalışan **self-hosted runner**'lar ise bunu kendiliğinden yapmaz: önceki job'dan kalan dosyalar bir sonrakini şaşırtabilir. Orada da her job'ı temiz başlatmak iyi bir alışkanlıktır.",
          "GitHub's hosted runners start a new virtual machine for every job and delete it afterwards. **Self-hosted runners** on your own servers do not do that by themselves: files left by one job can surprise the next. Starting each job clean is a good habit there too.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede makineler anında açılır ve artifact yüklemek 4, indirmek 3 saniye sürer. Gerçekte büyük artifact'ler daha uzun sürer ve varsayılan olarak 90 gün saklanır. Bir job'ın içinde veritabanı gibi yardımcı servisler de çalıştırabilirsin (`services:`); onlar da job bitince gider.",
            "On this stage machines start at once, and an artifact takes 4 seconds to upload and 3 to download. In reality big artifacts take longer and are kept for 90 days by default. A job can also run helper services such as a database (`services:`); they go away when the job ends too.",
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
          "İki job'lu workflow hazır, `deploy` job'ında sadece `./deploy.sh` var ve staging ilk commit'te. `deploy` job'ına adımlar, `build` job'ına upload ekleyebilir ve push'layabilirsin.",
          "The two-job workflow is ready; the `deploy` job only has `./deploy.sh`, and staging is on the first commit. You can add steps to the `deploy` job, an upload to the `build` job, and push.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Aynı job'daki step'ler aynı makineyi ve aynı dosyaları paylaşır.", "Steps in the same job share one machine and the same files."),
    l("Her job sıfırdan açılan ayrı bir runner'da çalışır; önceki job'ın dosyaları orada yoktur.", "Every job runs on a separate runner started from scratch; the previous job's files are not there."),
    l("`needs` beklemeyi sağlar, dosya paylaşmayı değil.", "`needs` gives you waiting, not file sharing."),
    l("Checkout sadece repodaki dosyaları getirir; `dist/` gibi build çıktıları repoda değildir.", "Checkout only brings the repo's files; build outputs like `dist/` are not in the repo."),
    l("Çözüm: işi aynı job'da yap ya da dosyayı artifact olarak taşı.", "The fix: do the work in the same job, or carry the files over as an artifact."),
    l("Artifact hem daha hızlıdır hem de test edilen build'in aynısını yayına taşır.", "An artifact is faster and ships the very build that was tested."),
  ],
  quiz: [
    {
      question: l("`build` job'ı `dist/` üretti. `needs: build` olan `deploy` job'ında `dist/` var mı?", "The `build` job produced `dist/`. Is `dist/` there in a `deploy` job with `needs: build`?"),
      options: [l("Evet, `needs` dosyaları da taşır", "Yes, `needs` carries files too"), l("Hayır, `deploy` boş bir makinede başlar", "No, `deploy` starts on an empty machine"), l("Sadece aynı branch'teyse", "Only on the same branch"), l("Sadece cache açıksa", "Only if the cache is on")],
      answer: 1,
      explain: l("`needs` sadece sırayı belirler. Dosyalar için artifact ya da aynı job gerekir.", "`needs` only sets the order. Files need an artifact or the same job."),
      reviewStep: 1,
    },
    {
      question: l("`deploy` job'ına checkout eklemek `dist/` sorununu neden çözmez?", "Why does adding checkout to the `deploy` job not fix the `dist/` problem?"),
      options: [l("Checkout yanlış branch'i çeker", "Checkout fetches the wrong branch"), l("`dist/` repoda değil, build'in ürettiği bir çıktı", "`dist/` is not in the repo, it is something the build produces"), l("Checkout sadece main'de çalışır", "Checkout only works on main"), l("Secret eksik", "A secret is missing")],
      answer: 1,
      explain: l("Checkout repoyu getirir; derlenmiş dosyalar ancak build çalışınca ya da artifact indirilince olur.", "Checkout brings the repo; compiled files only exist after a build or an artifact download."),
      reviewStep: 2,
    },
    {
      question: l("Build'i ikinci job'da yeniden yapmanın sorunu nedir?", "What is wrong with building again in the second job?"),
      options: [
        l("Hiçbir sorunu yok", "Nothing is wrong with it"),
        l("Daha uzun sürer ve yayına giden build test edilenle aynı olmayabilir", "It takes longer, and the shipped build may not be the tested one"),
        l("GitHub buna izin vermez", "GitHub does not allow it"),
        l("Testleri atlar", "It skips the tests"),
      ],
      answer: 1,
      explain: l("Aynı işi iki kez yapmak dakika harcar; artifact ise test edilen dosyaların aynısını taşır.", "Doing the work twice costs minutes; an artifact carries the very files that were tested."),
      reviewStep: 3,
    },
    {
      question: l("Hangisi bir job'dan diğerine kendiliğinden geçmez?", "Which one does not pass from one job to the next by itself?"),
      options: [l("Bir step'te kurulan `node_modules`", "`node_modules` installed in a step"), l("Upload edilmiş bir artifact", "An uploaded artifact"), l("Repo'daki kod (checkout ile)", "The repo's code (via checkout)"), l("Bir secret", "A secret")],
      answer: 0,
      explain: l("Kurulan dosyalar makineyle birlikte silinir; diğerleri bilerek yapılan bir adımla her job'a ulaşır.", "Installed files are deleted with the machine; the others reach each job through a deliberate step."),
      reviewStep: 5,
    },
  ],
};
