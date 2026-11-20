import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { CI, PROMOTE, REBUILD, scene } from "./Scene";

export const buildOnce: Lesson = {
  slug: "build-once",
  title: l("Bir kez build et", "Build once"),
  summary: l(
    "Her ortam için yeniden build etmek, test ettiğinden farklı bir şeyi prod'a göndermenin en kolay yoludur. Bunun yerine her commit'i bir kez build et, commit SHA'sıyla etiketle ve aynı image'ı ortamdan ortama taşı.",
    "Rebuilding for every environment is the easiest way to ship something other than what you tested. Instead, build each commit once, tag it with the commit SHA, and move that same image from environment to environment.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Ortam başına build'in neden tehlikeli olduğunu görmek", "See why a build per environment is dangerous"), step: 1 },
    { text: l("Image'ı bir kez build edip commit SHA'sıyla etiketlemek", "Build the image once and tag it with the commit SHA"), step: 2 },
    { text: l("`latest` yerine SHA etiketinin neden güvenli olduğunu bilmek", "Know why a SHA tag is safer than `latest`"), step: 3 },
    { text: l("Staging'de test edilen image'ı aynen production'a taşımak", "Promote the exact image tested on staging to production"), step: 4 },
  ],
  steps: [
    {
      short: l("Her ortama build", "A build per env"),
      tag: "problem",
      title: l("Her ortam kendi build'ini yapıyor", "Every environment does its own build"),
      body: [
        l(
          "Ekibin deploy workflow'u basit: hangi ortamı seçersen main'i checkout eder, `npm run build` yapar ve sonucu o ortama koyar. İlk bakışta mantıklı.",
          "The team's deploy workflow is simple: whichever environment you pick, it checks out main, runs `npm run build` and puts the result there. It looks reasonable at first.",
        ),
        l(
          "Yeni ödeme sayfası (`8b1d24e`) main'e geldi ve elle staging'e deploy edildi. Test ekibi şimdi staging'de bu sürümü deniyor. Aşağıda iki ortamı görüyorsun: staging `8b1d24e`, production hâlâ ilk sürüm `3f2a1c9`.",
          "The new checkout page (`8b1d24e`) landed on main and was deployed to staging by hand. The testers are now trying that version on staging. Below you see both environments: staging on `8b1d24e`, production still on the first version, `3f2a1c9`.",
        ),
      ],
      practice: {
        intro: l("Böyle bir workflow'u tanırsan, birazdan göreceğin tuzağı da tanırsın:", "If you recognise a workflow like this, you will recognise the trap coming next:"),
        commands: [],
        snippets: [{ label: workflowFile(REBUILD), code: workflowYaml(REBUILD), note: l("Her çalıştırmada main'in **o anki** halini build ediyor.", "Every run builds main **as it is at that moment**.") }],
      },
    },
    {
      short: l("Farklı şey gitti", "Something else went"),
      tag: "experiment",
      predict: {
        question: l(
          "Testler staging'de `8b1d24e`'yi onayladı. Bu arada main'e kimsenin denemediği `c41e0a7` geldi. Şimdi \"production'a deploy et\" dendi. Prod'a hangisi gider?",
          "The testers approved `8b1d24e` on staging. Meanwhile `c41e0a7`, which nobody tried, landed on main. Now someone runs \"deploy to production\". Which one reaches prod?",
        ),
        options: [l("`8b1d24e`: staging'de test edilen", "`8b1d24e`: the one tested on staging"), l("`c41e0a7`: main'in o anki hali", "`c41e0a7`: whatever main is now"), l("İkisi birden", "Both")],
        answer: 1,
        why: l(
          "Workflow production için de main'i checkout edip yeniden build ediyor. Staging'de neyin test edildiğini bilmiyor bile.",
          "The workflow checks out main and builds again for production too. It does not even know what was tested on staging.",
        ),
      },
      title: l("Test ettiğin şey prod'a gitmedi", "What you tested is not what shipped"),
      body: [
        l(
          "Production `c41e0a7`'ye geçti ve 500 veriyor. Hiç kimse bu sürümü staging'de görmedi: staging hâlâ `8b1d24e` çalıştırıyor. Testlerin onayladığı şey ile prod'a giden şey iki ayrı build.",
          "Production moved to `c41e0a7` and answers 500. Nobody saw this version on staging: staging still runs `8b1d24e`. What the testers approved and what went to prod are two separate builds.",
        ),
        l(
          "Aynı commit'ten yapılan iki build bile farklı çıkabilir: bu arada bir bağımlılığın yeni sürümü çıkmış, base image güncellenmiş ya da build sırasında bir ortam değişkeni farklı olabilir.",
          "Even two builds of the same commit can differ: a dependency may have released a new version in between, the base image may have been updated, or an environment variable may differ at build time.",
        ),
      ],
    },
    {
      short: l("Bir kez build", "Build once"),
      tag: "how",
      title: l("Her commit bir kez build edilir, bir image olur", "Each commit is built once and becomes an image"),
      body: [
        l(
          "Akışı ikiye ayırdık. **CI** workflow'u main'e gelen her commit'te testleri çalıştırıyor, sonra bir Docker image build edip registry'ye `sha-<commit>` etiketiyle gönderiyor. **Promote** workflow'u hiçbir şey build etmiyor: ona hangi image'ı hangi ortama koyacağını söylüyorsun, o kadar.",
          "We split the flow in two. The **CI** workflow runs the tests on every commit to main, then builds a Docker image and pushes it to the registry tagged `sha-<commit>`. The **Promote** workflow builds nothing: you tell it which image goes to which environment, that is all.",
        ),
        l(
          "Hatayı düzelten `5d9b3f2` geldi: CI testleri geçti ve `sha-5d9b3f2` image'ı registry'ye girdi. Sonra Promote ile staging'e koyduk.",
          "The fix, `5d9b3f2`, arrived: CI passed the tests and the image `sha-5d9b3f2` went into the registry. Then we put it on staging with Promote.",
        ),
      ],
      practice: {
        snippets: [{ label: workflowFile(CI), code: workflowYaml(CI), note: l("`packages: write`, workflow'un GHCR'a image göndermesine izin verir.", "`packages: write` lets the workflow push images to GHCR.") }],
        commands: [{ cmd: "docker pull ghcr.io/ada/shop:sha-5d9b3f2", note: l("CI'ın ürettiği image'ı her yerde aynen çekersin.", "Pull exactly the image CI built, anywhere.") }],
      },
    },
    {
      short: l("SHA etiketi", "SHA tag"),
      tag: "how",
      predict: {
        question: l(
          "Image'ı neden `latest` değil de `sha-5d9b3f2` gibi commit SHA'sıyla etiketliyoruz?",
          "Why do we tag the image with the commit SHA, like `sha-5d9b3f2`, instead of `latest`?",
        ),
        options: [
          l("Daha kısa olduğu için", "Because it is shorter"),
          l("`latest` her push'ta başka image'ı gösterir; SHA hep aynı image'ı", "`latest` points at another image after every push; a SHA always points at the same one"),
          l("Registry `latest`'i kabul etmediği için", "Because the registry does not accept `latest`"),
        ],
        answer: 1,
        why: l(
          "`latest` bir yer imi gibi sürekli kayar. Prod'da \"latest çalışıyor\" demek hangi kodun çalıştığını söylemez; bir sunucu yeniden başlarsa başka bir sürüme bile geçebilir.",
          "`latest` slides like a bookmark. \"Prod runs latest\" says nothing about which code runs, and a server that restarts may even switch to another version.",
        ),
      },
      title: l("main ilerler, etiketler yerinde kalır", "main moves on, tags stay put"),
      body: [
        l(
          "main'e kupon özelliği (`a07c6e1`) geldi. CI testleri geçti ve `sha-a07c6e1` registry'ye girdi. Ama bu commit'te testlerin yakalamadığı bir hata var. Staging'e kimse dokunmadı, hâlâ test edilmiş `5d9b3f2`'yi çalıştırıyor.",
          "The coupons feature (`a07c6e1`) landed on main. CI passed the tests and `sha-a07c6e1` went into the registry. But this commit has a bug the tests did not catch. Nobody touched staging; it still runs the tested `5d9b3f2`.",
        ),
        l(
          "Registry'ye bak: her commit'in kendi image'ı var ve hiçbiri yerinden oynamaz. Hangi ortamın hangi image'ı çalıştırdığı satırın yanında yazıyor.",
          "Look at the registry: every commit has its own image and none of them ever moves. Next to each row you see which environment runs it.",
        ),
      ],
    },
    {
      short: l("Aynısını taşı", "Promote it"),
      tag: "experiment",
      predict: {
        question: l(
          "main'in son hali bozuk `a07c6e1`. Promote'u `environment: production`, `version: 5d9b3f2` ile çalıştırıyoruz. Production'a ne gider?",
          "main's newest commit is the broken `a07c6e1`. We run Promote with `environment: production`, `version: 5d9b3f2`. What reaches production?",
        ),
        options: [
          l("`a07c6e1`, çünkü workflow main'den çalışıyor", "`a07c6e1`, because the workflow runs from main"),
          l("`5d9b3f2`: staging'de test edilen image'ın ta kendisi", "`5d9b3f2`: the very image tested on staging"),
          l("Hiçbiri, iki sürüm çakıştığı için kırılır", "Neither: it fails because the versions clash"),
        ],
        answer: 1,
        why: l(
          "Promote build etmez; adını verdiğin image'ı registry'den çeker. main'in nerede olduğu önemli değil.",
          "Promote does not build; it pulls the image you named from the registry. Where main is does not matter.",
        ),
      },
      title: l("Prod, staging'de gördüğün şeyi çalıştırır", "Prod runs what you saw on staging"),
      body: [
        l(
          "Production artık `5d9b3f2` çalıştırıyor ve sağlıklı. Bu, staging'de test edilen image'ın bit bit aynısı. main'deki bozuk `a07c6e1` ise sadece registry'de bekliyor; önce staging'e çıkıp test edilmeden kimseye ulaşmayacak.",
          "Production now runs `5d9b3f2` and is healthy. It is bit for bit the image tested on staging. The broken `a07c6e1` on main just waits in the registry; it reaches nobody until it goes to staging and gets tested.",
        ),
        l(
          "Run'ın başlığında main'in SHA'sını görürsün, çünkü workflow dosyası main'den okunuyor. Deploy edilen image ise `version` girdisinden geliyor.",
          "The run's header shows main's SHA, because the workflow file is read from main. The image that gets deployed comes from the `version` input.",
        ),
      ],
      practice: {
        snippets: [{ label: workflowFile(PROMOTE), code: workflowYaml(PROMOTE) }],
        commands: [
          { cmd: "gh workflow run promote.yml -f environment=staging -f version=5d9b3f2", note: l("Önce staging'e.", "Staging first.") },
          { cmd: "gh workflow run promote.yml -f environment=production -f version=5d9b3f2", note: l("Testler onaylayınca aynı image production'a.", "Once the testers approve, the same image to production.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede build once", "Build once in a real project"),
      body: [
        l(
          "**Ayarlar image'da değil, ortamda:** aynı image'ın staging'de ve prod'da çalışabilmesi için veritabanı adresi, API anahtarları gibi şeyler build sırasında gömülmez; ortam değişkeni olarak çalışırken verilir. Ortama özel bir şeyi build'e gömdüğün an \"bir kez build\" biter.",
          "**Settings live in the environment, not the image:** for the same image to run on staging and prod, things like the database URL and API keys are not baked in at build time; they are passed as environment variables at run time. The moment you bake something environment-specific into the build, \"build once\" is over.",
        ),
        l(
          "**Docker kullanmıyorsan:** fikir aynı. Build çıktısını (`dist/`, bir `.jar`, bir zip) bir kez üret, commit'le eşleşen bir adla sakla (GitHub Release, bir S3 klasörü, bir paket registry'si) ve ortamlara onu taşı. Artifact'ler varsayılan olarak 90 gün sonra silinir, uzun süre saklanacak şeyler için uygun değildir.",
          "**Without Docker:** same idea. Produce the build output (`dist/`, a `.jar`, a zip) once, store it under a name tied to the commit (a GitHub Release, an S3 folder, a package registry) and move that to each environment. Artifacts are deleted after 90 days by default, so they are not meant for long-term storage.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede deploy anında bitiyor ve `./deploy.sh` tek bir komut. Gerçekte deploy adımı Kubernetes'e, bir sunucuya ya da bir bulut servisine image'ı çalıştırmasını söyler. Bir etiketi kasten yerinden oynatmak mümkündür; tam güvence istiyorsan image'ı digest'iyle (`@sha256:…`) çek.",
            "On this stage a deploy finishes at once and `./deploy.sh` is a single command. In reality the deploy step tells Kubernetes, a server or a cloud service to run the image. A tag can be moved on purpose; for a full guarantee, pull the image by its digest (`@sha256:…`).",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker buildx imagetools inspect ghcr.io/ada/shop:sha-5d9b3f2", note: l("Image'ın digest'ini gösterir.", "Shows the image's digest.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Aşağıda gerçek işten **4 senaryo** var: test edilen image'ı production'a taşımak, önce staging'den geçirmek, kötü bir sürümden geri dönmek ve eski \"main'den yeniden build\" workflow'unu emekliye ayırmak. Komutları terminale **kendin yaz**: `gh run list`, `gh workflow run promote.yml -f environment=… -f version=…`, `rm`, `git commit -am`, `git push`.",
          "Below are **4 scenarios** from real work: shipping the tested image to production, going through staging first, rolling back from a bad version, and retiring the old \"rebuild from main\" workflow. **Type the commands yourself**: `gh run list`, `gh workflow run promote.yml -f environment=… -f version=…`, `rm`, `git commit -am`, `git push`.",
        ),
        l(
          "Her image commit'iyle etiketli (`sha-…`); hangi commit'in nerede çalıştığını sahnenin altı gösterir. Az komutla bitirirsen 3 yıldız.",
          "Every image is tagged with its commit (`sha-…`); the bottom of the scene shows which commit runs where. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Ortam başına yeniden build, test ettiğinden farklı bir şeyi prod'a gönderebilir.", "Rebuilding per environment can ship something other than what you tested."),
    l("Her commit'i bir kez build et ve commit SHA'sıyla etiketle (`sha-5d9b3f2`).", "Build each commit once and tag it with the commit SHA (`sha-5d9b3f2`)."),
    l("`latest` kayar; prod her zaman belirli bir SHA çalıştırsın.", "`latest` slides; prod always runs a specific SHA."),
    l("Promote build etmez: registry'deki image'ı ortamdan ortama taşır.", "Promote does not build: it moves an image from the registry to the next environment."),
    l("Ortama özel ayarlar image'a gömülmez, çalışırken ortam değişkeni olarak gelir.", "Environment-specific settings are not baked in; they arrive as environment variables at run time."),
  ],
  quiz: [
    {
      question: l("Production deploy'u main'i checkout edip yeniden build ediyorsa en büyük risk nedir?", "If the production deploy checks out main and builds again, what is the biggest risk?"),
      options: [
        l("Deploy biraz yavaşlar", "The deploy gets a bit slower"),
        l("Prod'a staging'de test edilmemiş bir şey gidebilir", "Something not tested on staging can reach prod"),
        l("Registry dolar", "The registry fills up"),
        l("Secret'lar sızar", "Secrets leak"),
      ],
      answer: 1,
      explain: l("main bu arada ilerlemiş olabilir ve aynı commit'in iki build'i bile farklı çıkabilir.", "main may have moved on in the meantime, and even two builds of one commit can differ."),
      reviewStep: 1,
    },
    {
      question: l("CI'ın ürettiği image için en iyi etiket hangisi?", "What is the best tag for the image CI builds?"),
      options: [l("`latest`", "`latest`"), l("`sha-<commit>`", "`sha-<commit>`"), l("Build tarihi", "The build date"), l("`prod`", "`prod`")],
      answer: 1,
      explain: l("SHA etiketi image'ı tek bir commit'e bağlar ve hiç kaymaz.", "A SHA tag ties the image to one commit and never slides."),
      reviewStep: 3,
    },
    {
      question: l("Promote workflow'u ne yapar?", "What does the Promote workflow do?"),
      options: [
        l("main'i checkout edip build eder", "Checks out main and builds it"),
        l("Adını verdiğin image'ı registry'den alıp bir ortama koyar", "Takes the image you name from the registry and puts it on an environment"),
        l("Testleri yeniden çalıştırır", "Runs the tests again"),
        l("Yeni bir etiket üretir", "Makes a new tag"),
      ],
      answer: 1,
      explain: l("Build bir kez, CI'da yapıldı. Promote sadece taşır.", "The build happened once, in CI. Promote only moves it."),
      reviewStep: 4,
    },
    {
      question: l("Aynı image'ı staging'de ve production'da çalıştırmak için veritabanı adresi nereden gelmeli?", "To run one image on staging and production, where should the database URL come from?"),
      options: [
        l("Build sırasında image'a gömülmeli", "Baked into the image at build time"),
        l("Çalışırken ortam değişkeni olarak", "An environment variable at run time"),
        l("Kodun içine yazılmalı", "Written in the code"),
        l("Image etiketinden", "From the image tag"),
      ],
      answer: 1,
      explain: l("Ortama özel her şey çalışırken verilir; image her ortamda aynı kalır.", "Everything environment-specific is given at run time; the image stays the same everywhere."),
      reviewStep: 5,
    },
  ],
};
