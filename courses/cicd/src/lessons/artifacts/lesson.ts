import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { scene, SHARED, wf } from "./Scene";

const RETENTION = `      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 5`;

export const artifacts: Lesson = {
  slug: "artifacts",
  title: l("Artifact'ler", "Artifacts"),
  summary: l(
    "Her job ayrı bir makinede çalıştığı için bir job'ın ürettiği dosyalar diğerine kendiliğinden geçmez. `upload-artifact` dosyaları run'a bırakır, aynı run'daki başka bir job `download-artifact` ile alır. Böylece bir kez build eder, aynı çıktıyı test edip deploy edersin.",
    "Each job runs on its own machine, so files one job makes do not reach another by themselves. `upload-artifact` leaves the files with the run, and another job in the same run picks them up with `download-artifact`. You build once, then test and deploy that same output.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir job'ın dosyalarının neden diğerine geçmediğini görmek", "See why one job's files do not reach another"), step: 0 },
    { text: l("`upload-artifact` ve `download-artifact` ile `dist/`'i taşımak", "Move `dist/` with `upload-artifact` and `download-artifact`"), step: 1 },
    { text: l("Aynı build çıktısını birden çok job'da kullanmak", "Use the same build output in several jobs"), step: 3 },
    { text: l("Artifact'in bir run'a ait olduğunu bilmek", "Know that an artifact belongs to one run"), step: 4 },
  ],
  steps: [
    {
      short: l("dist/ nerede?", "Where is dist/?"),
      tag: "problem",
      predict: {
        question: l(
          "`build` job'ı `npm run build` ile `dist/` klasörünü üretiyor. `deploy` job'ı `needs: build` ile ondan sonra çalışıyor ve `dist/`'i staging'e yüklüyor. Deploy `dist/`'i bulur mu?",
          "The `build` job makes the `dist/` folder with `npm run build`. The `deploy` job runs after it with `needs: build` and uploads `dist/` to staging. Does deploy find `dist/`?",
        ),
        options: [l("Evet, build az önce üretti", "Yes, build just made it"), l("Hayır, deploy başka bir makinede", "No, deploy is on another machine"), l("Sadece aynı branch'teyse", "Only on the same branch")],
        answer: 1,
        why: l(
          "Her job kendi boş [[runner]]'ında çalışır ve job bitince o makine silinir. `needs` sadece sırayı belirler, dosya taşımaz.",
          "Every job runs on its own empty [[runner]], and that machine is thrown away when the job ends. `needs` only sets the order; it does not carry files.",
        ),
      },
      title: l("needs sıra verir, dosya vermez", "needs gives order, not files"),
      body: [
        l(
          "Run #1'de build yeşil, deploy kırmızı: `./deploy.sh: dist/ not found`. `dist/` build job'ının makinesinde üretildi ve o makineyle birlikte gitti.",
          "In run #1 build is green and deploy is red: `./deploy.sh: dist/ not found`. `dist/` was made on the build job's machine and went away with it.",
        ),
      ],
    },
    {
      short: l("Yükle, indir", "Upload, download"),
      tag: "how",
      title: l("upload-artifact bırakır, download-artifact alır", "upload-artifact leaves it, download-artifact picks it up"),
      body: [
        l(
          "build job'ının sonuna `actions/upload-artifact` ekledik: `dist/`'i `dist` adıyla run'a bıraktı. deploy job'ının başına `actions/download-artifact` ekledik: aynı adla geri aldı. Bu dosyalara [[artifact]] denir.",
          "We added `actions/upload-artifact` at the end of the build job: it left `dist/` with the run under the name `dist`. We added `actions/download-artifact` at the start of the deploy job: it took it back by the same name. These files are called an [[artifact]].",
        ),
        l(
          "Run #2 yeşil ve staging artık bu commit'i çalıştırıyor. Sağdaki kartta run #2'nin `dist` artifact'ini görüyorsun.",
          "Run #2 is green and staging now runs this commit. The card on the right shows run #2's `dist` artifact.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(wf({ upload: true, download: true, rebuild: false })) }] },
    },
    {
      short: l("Yüklenmemiş", "Never uploaded"),
      tag: "experiment",
      predict: {
        question: l("Birisi build job'ını sadeleştirirken upload adımını sildi; deploy hâlâ indirmeye çalışıyor. Ne olur?", "While tidying the build job, someone deleted the upload step; deploy still tries to download. What happens?"),
        options: [l("Önceki run'ın `dist`'ini indirir", "It downloads the previous run's `dist`"), l("`Artifact not found` ile kırılır", "It fails with `Artifact not found`"), l("Boş bir klasörle devam eder", "It goes on with an empty folder")],
        answer: 1,
        why: l(
          "download-artifact sadece bu run'ın artifact'lerine bakar. Bu run hiçbir şey yüklemedi, önceki run'ınkine de dokunmaz.",
          "download-artifact only looks at this run's artifacts. This run uploaded nothing, and it does not touch the previous run's.",
        ),
      },
      title: l("İndirmek için önce yüklemek gerek", "You have to upload before you can download"),
      body: [
        l(
          "Run #3'te deploy ilk adımında kırıldı: `Unable to download artifact(s): Artifact not found for name: dist`. Bu hata iki şeyden birini söyler: ya upload hiç çalışmadı, ya da adlar (`name:`) eşleşmiyor.",
          "In run #3 deploy failed on its first step: `Unable to download artifact(s): Artifact not found for name: dist`. This error means one of two things: the upload never ran, or the names (`name:`) do not match.",
        ),
      ],
    },
    {
      short: l("İki kullanıcı", "Two users"),
      tag: "how",
      title: l("Bir kez build et, aynı çıktıyı test et ve deploy et", "Build once, test and deploy the same output"),
      body: [
        l(
          "Upload'ı geri koyduk ve araya bir e2e job'ı ekledik. e2e ve deploy aynı `dist` artifact'ini indiriyor: tarayıcı testleri, birazdan staging'e gidecek dosyaların ta kendisini deniyor.",
          "We put the upload back and added an e2e job in between. e2e and deploy download the same `dist` artifact: the browser tests try the very files that are about to go to staging.",
        ),
        l(
          "Her job'da yeniden build etseydin, test ettiğin şeyle deploy ettiğin şey farklı olabilirdi (başka bir zaman, başka bir paket sürümü). \"Bir kez build et\" fikrine Teslim bölümünde geri döneceğiz.",
          "If every job built again, what you tested and what you deployed could differ (another moment, another package version). We come back to \"build once\" in the Delivery chapter.",
        ),
      ],
      practice: {
        commands: [{ cmd: "gh run download <run-id> -n dist", note: l("Bir run'ın artifact'ini kendi bilgisayarına indir.", "Download a run's artifact to your own computer.") }],
        snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(SHARED) }],
      },
    },
    {
      short: l("Başka run", "Another run"),
      tag: "experiment",
      predict: {
        question: l(
          "Elle çalıştırılan ayrı bir \"Redeploy\" workflow'u yazdık; sadece `dist`'i indirip deploy ediyor. Run #4'ün `dist`'ini bulabilir mi?",
          "We wrote a separate \"Redeploy\" workflow you start by hand; it only downloads `dist` and deploys. Can it find run #4's `dist`?",
        ),
        options: [l("Evet, en son yüklenen `dist`'i alır", "Yes, it takes the latest uploaded `dist`"), l("Hayır, artifact'ler run'a aittir", "No, artifacts belong to a run"), l("Sadece aynı gün içindeyse", "Only within the same day")],
        answer: 1,
        why: l(
          "download-artifact varsayılan olarak yalnızca içinde çalıştığı run'a bakar. Redeploy yeni bir run, ve hiçbir şey yüklemedi.",
          "By default download-artifact only looks inside the run it runs in. Redeploy is a new run, and it uploaded nothing.",
        ),
      },
      title: l("Artifact bir run'a aittir", "An artifact belongs to one run"),
      body: [
        l(
          "Run #5 (Redeploy) `Artifact not found` ile kırıldı ve staging run #4'ün commit'inde kaldı. Artifact'ler bir run'ın içinde job'lar arasında dolaşmak için. Run'lar arasında paylaşılacak bir şey için başka yollar var: bir registry (image ya da paket) ya da bir sonraki derslerde göreceğin \"bir kez build et\" düzeni.",
          "Run #5 (Redeploy) failed with `Artifact not found`, and staging stayed on run #4's commit. Artifacts are for moving between the jobs of one run. For something shared across runs there are other ways: a registry (an image or a package), or the \"build once\" setup you will see in later lessons.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede artifact'ler", "Artifacts in a real project"),
      body: [
        l(
          "**Saklama süresi:** artifact'ler varsayılan olarak 90 gün durur ve repo depolamasından yer kaplar. Sadece deploy için lazımsa `retention-days` ile kısalt. Test raporları ve ekran görüntüleri gibi şeyleri de artifact olarak yükleyip arayüzden indirebilirsin.",
          "**Retention:** artifacts stay for 90 days by default and use the repo's storage. If you only need them for the deploy, shorten it with `retention-days`. Test reports and screenshots can be uploaded as artifacts too, and downloaded from the UI.",
        ),
        l(
          "**Başka run'dan indirmek mümkün ama açıkça:** `download-artifact@v4`'e `run-id` ve `github-token` verirsen başka bir run'ın artifact'ini indirebilirsin. Varsayılan davranış ise sadece kendi run'ı.",
          "**Downloading from another run is possible, but explicit:** give `download-artifact@v4` a `run-id` and a `github-token` and it can fetch another run's artifact. The default is only its own run.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede artifact yükleyip indirmek birkaç saniye sürüyor ve boyut önemsiz. Gerçekte büyük artifact'ler (yüzlerce MB) yükleme ve indirmeyi yavaşlatır, ve depolama kotanı doldurur. Sahne `run-id` ile başka run'dan indirmeyi ve saklama süresini göstermiyor.",
            "On stage uploading and downloading take a few seconds and size does not matter. In reality big artifacts (hundreds of MB) slow uploads and downloads and fill your storage quota. The stage does not show downloading from another run with `run-id`, or retention.",
          ),
        },
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: RETENTION, note: l("Sadece 5 gün sakla.", "Keep it for 5 days only.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "build job'ı `dist/` üretiyor, deploy job'ı onu staging'e yüklemek istiyor ama henüz bir köprü yok. Upload ve download adımlarını ekleyip çıkarabilir, deploy'da yeniden build etmeyi deneyebilir ve push'layabilirsin.",
          "The build job makes `dist/`, the deploy job wants to ship it to staging, but there is no bridge yet. You can add and remove the upload and download steps, try building again inside deploy, and push.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Her job ayrı makinede çalışır; `needs` sıra verir ama dosya taşımaz.", "Each job runs on its own machine; `needs` sets order but carries no files."),
    l("`upload-artifact` dosyaları run'a bırakır, `download-artifact` aynı adla geri alır.", "`upload-artifact` leaves files with the run; `download-artifact` takes them back by name."),
    l("`Artifact not found`: upload çalışmadı ya da adlar eşleşmiyor.", "`Artifact not found`: the upload did not run or the names do not match."),
    l("Bir kez build edip aynı artifact'i hem test hem deploy job'ında kullan.", "Build once and use the same artifact in both the test and deploy jobs."),
    l("Artifact'ler varsayılan olarak kendi run'larına aittir ve 90 gün saklanır.", "Artifacts belong to their own run by default and are kept for 90 days."),
  ],
  quiz: [
    {
      question: l("`deploy` job'ında `needs: build` var. build'in ürettiği `dist/` deploy'da hazır mıdır?", "The `deploy` job has `needs: build`. Is the `dist/` that build made ready in deploy?"),
      options: [l("Evet, needs bunu sağlar", "Yes, needs takes care of it"), l("Hayır, artifact ile taşınmalı", "No, it has to travel as an artifact"), l("Sadece cache açıksa", "Only with a cache"), l("Sadece matrix'te", "Only in a matrix")],
      answer: 1,
      explain: l("`needs` sadece sırayı belirler; job'lar ayrı makinelerde çalışır.", "`needs` only sets the order; jobs run on separate machines."),
      reviewStep: 0,
    },
    {
      question: l("Deploy job'ı `Artifact not found for name: dist` diyor. İlk bakacağın yer?", "The deploy job says `Artifact not found for name: dist`. Where do you look first?"),
      options: [l("Deploy script'i", "The deploy script"), l("Bu run'da upload adımı çalıştı mı ve adı aynı mı", "Whether this run's upload step ran and uses the same name"), l("Node sürümü", "The Node version"), l("Branch protection", "Branch protection")],
      answer: 1,
      explain: l("İndirilecek artifact bu run'da, bu adla yüklenmiş olmalı.", "The artifact must have been uploaded in this run, under this name."),
      reviewStep: 2,
    },
    {
      question: l("Aynı `dist/`'i hem e2e hem deploy job'ında kullanmanın faydası?", "What is the benefit of using the same `dist/` in both the e2e and deploy jobs?"),
      options: [l("Test ettiğin dosyaları deploy edersin", "You deploy exactly the files you tested"), l("Run daha çok dakika harcar", "The run uses more minutes"), l("Cache gerekmez", "No cache is needed"), l("Secret gerekmez", "No secret is needed")],
      answer: 0,
      explain: l("Tek build, tek çıktı: test edilen ile deploy edilen aynı.", "One build, one output: what was tested is what gets deployed."),
      reviewStep: 3,
    },
    {
      question: l("Ayrı, elle başlatılan bir workflow başka bir run'ın artifact'ini varsayılan ayarlarla indirebilir mi?", "Can a separate, manually started workflow download another run's artifact with default settings?"),
      options: [l("Evet, en sonuncusunu indirir", "Yes, it gets the latest"), l("Hayır, varsayılan olarak sadece kendi run'ına bakar", "No, by default it only looks at its own run"), l("Sadece main'de", "Only on main"), l("Sadece public repolarda", "Only in public repos")],
      answer: 1,
      explain: l("Başka bir run'dan indirmek için `run-id` ve token'ı açıkça vermen gerekir.", "To download from another run you must pass a `run-id` and a token explicitly."),
      reviewStep: 4,
    },
  ],
};
