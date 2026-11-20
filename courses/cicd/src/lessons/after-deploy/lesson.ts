import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { ALL, deployWf, scene } from "./Scene";

const RELEASE_WF = `# .github/workflows/release.yml: a GitHub Release for every v* tag
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: gh release create "$GITHUB_REF_NAME" --generate-notes
        env:
          GH_TOKEN: \${{ github.token }}`;

export const afterDeploy: Lesson = {
  slug: "after-deploy",
  title: l("Deploy'dan sonra", "After the deploy"),
  summary: l(
    "Yeşil bir deploy, uygulamanın çalıştığını söylemez. Deploy'dan hemen sonra bir smoke test ile bak, kırılırsa `if: failure()` ile otomatik geri al ve ekibe haber ver. Çıkan her sürümü de SemVer, bir git tag ve bir GitHub Release ile işaretle.",
    "A green deploy does not mean the app works. Look right after it with a smoke test; if that fails, roll back automatically with `if: failure()` and tell the team. Mark every release with SemVer, a git tag and a GitHub Release.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Yeşil bir run'ın sağlam bir site demek olmadığını görmek", "See that a green run does not mean a healthy site"), step: 0 },
    { text: l("Deploy'dan sonra bir smoke test eklemek", "Add a smoke test after the deploy"), step: 1 },
    { text: l("`if: failure()` ile otomatik geri almak ve haber vermek", "Roll back and notify automatically with `if: failure()`"), step: 3 },
    { text: l("Sürümleri SemVer, git tag ve GitHub Release ile işaretlemek", "Mark releases with SemVer, a git tag and a GitHub Release"), step: 4 },
  ],
  steps: [
    {
      short: l("Yeşil ama bozuk", "Green but broken"),
      tag: "problem",
      predict: {
        question: l(
          "Yeni sepet (`c41e0a7`) testlerden geçti, deploy adımı da yeşil bitti. Staging şu an sağlıklı mı?",
          "The new cart (`c41e0a7`) passed the tests, and the deploy step finished green too. Is staging healthy right now?",
        ),
        options: [
          l("Evet: run yeşil", "Yes: the run is green"),
          l("Run'a bakarak bilemezsin: kimse siteye bakmadı", "You cannot tell from the run: nobody looked at the site"),
          l("Hayır: deploy'lar hep bozar", "No: deploys always break things"),
        ],
        answer: 1,
        why: l(
          "Deploy adımı sadece \"dosyaları koydum, komut 0 ile bitti\" der. Uygulamanın açılıp cevap verdiğine kimse bakmadı.",
          "The deploy step only says \"I put the files there and the command exited 0\". Nobody checked that the app starts and answers.",
        ),
      },
      title: l("Run yeşil, site 500", "The run is green, the site is 500"),
      body: [
        l(
          "Önce arama filtreleri (`8b1d24e`) sorunsuz çıktı. Sonra yeni sepet geldi: testlerin yakalamadığı bir hata yüzünden uygulama her isteğe 500 dönüyor. Ama run'ın her adımı yeşil, çünkü hiçbir adım siteye bakmıyor.",
          "First the search filters (`8b1d24e`) went out fine. Then the new cart came: a bug the tests missed makes the app answer every request with 500. Yet every step of the run is green, because no step looks at the site.",
        ),
        l("Bunu bir kullanıcı ya da gece nöbetindeki biri fark edecek. İkisi de iyi bir yol değil.", "A user or whoever is on call at night will notice. Neither is a good way to find out."),
      ],
    },
    {
      short: l("Smoke test", "Smoke test"),
      tag: "how",
      title: l("Deploy'dan hemen sonra bak", "Look right after the deploy"),
      body: [
        l(
          "Deploy job'ının sonuna bir adım ekledik: `curl --fail` ile staging'in `/health` adresine istek atıyor. `--fail`, 400 ve üstü bir cevapta curl'ün exit code 22 ile çıkmasını sağlar; yani adım kırmızı olur. Buna [[smokeTest|smoke test]] denir: \"duman çıkıyor mu?\" diye kısa bir bakış.",
          "We added a step at the end of the deploy job: `curl --fail` calls staging's `/health` URL. `--fail` makes curl exit with code 22 on any answer of 400 or more, so the step turns red. This is a [[smokeTest|smoke test]]: a quick look to see if anything is on fire.",
        ),
        l(
          "Düzeltme (`5d9b3f2`) geldi: deploy oldu, smoke test 200 aldı, run yeşil. Artık yeşil gerçekten bir şey söylüyor.",
          "The fix (`5d9b3f2`) arrived: deployed, the smoke test got 200, the run is green. Now green actually means something.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "İyi bir `/health` endpoint'i sadece \"çalışıyorum\" demez; veritabanına bağlanabiliyor mu, gerekli ayarlar yüklü mü gibi en temel şeyleri de kontrol eder. `--retry 3`, uygulama açılırken gelen ilk cevapsız saniyeleri tolere eder.",
            "A good `/health` endpoint does not just say \"I am up\"; it also checks the basics, such as reaching the database and having the settings it needs. `--retry 3` tolerates the first few seconds while the app is still starting.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "curl --fail --retry 3 https://staging.shop.example/health", note: l("Aynı kontrolü kendin de yapabilirsin.", "You can run the same check yourself.") }] },
    },
    {
      short: l("Yakaladı ama", "Caught, but"),
      tag: "experiment",
      predict: {
        question: l(
          "Sepet indirimleri (`a07c6e1`) yine bozuk çıktı ve smoke test kırıldı, run kırmızı. Staging şimdi hangi sürümü çalıştırıyor?",
          "Cart discounts (`a07c6e1`) turned out broken too, the smoke test failed and the run is red. Which version does staging run now?",
        ),
        options: [
          l("`5d9b3f2`: kırmızı run deploy'u geri alır", "`5d9b3f2`: a red run undoes the deploy"),
          l("`a07c6e1`: smoke test sadece fark eder, bir şeyi geri almaz", "`a07c6e1`: the smoke test only notices; it undoes nothing"),
          l("Hiçbiri: staging kapanır", "Neither: staging shuts down"),
        ],
        answer: 1,
        why: l(
          "Run kırmızıya döndü ama deploy çoktan oldu. Kırmızı bir adım sadece \"bir şey ters gitti\" der; geri almayı bir adımın yapması gerekir.",
          "The run turned red, but the deploy had already happened. A red step only says \"something went wrong\"; undoing it has to be some step's job.",
        ),
      },
      title: l("Fark etmek yetmez", "Noticing is not enough"),
      body: [
        l(
          "Smoke test 500 aldı ve run kırmızı. En azından artık biliyoruz. Ama staging hâlâ bozuk `a07c6e1`'i çalıştırıyor; biri gelip elle geri alana kadar öyle kalacak.",
          "The smoke test got 500 and the run is red. At least now we know. But staging still runs the broken `a07c6e1`, and it stays that way until someone rolls it back by hand.",
        ),
      ],
    },
    {
      short: l("Otomatik geri al", "Auto rollback"),
      tag: "how",
      title: l("if: failure(): kırılınca çalışan adımlar", "if: failure(): steps that run when something broke"),
      body: [
        l(
          "Önce staging'i elle `5d9b3f2`'ye geri aldık. Sonra workflow'a iki adım ekledik, ikisi de `if: failure()` ile: biri bir önceki sürümü yeniden deploy ediyor, diğeri ekibin sohbet kanalına mesaj atıyor. Normalde bir adım kırılınca sonrakiler atlanır; `failure()` bunun tersini söyler: **sadece** bir şey kırıldıysa çalış.",
          "First we rolled staging back to `5d9b3f2` by hand. Then we added two steps to the workflow, both with `if: failure()`: one redeploys the previous version, the other posts to the team's chat channel. Normally the steps after a failure are skipped; `failure()` says the opposite: run **only** if something broke.",
        ),
        l(
          "İndirimlerin ikinci denemesi (`e2f81b4`) de bozuktu. Bu kez smoke test kırıldı, geri alma adımı staging'i `5d9b3f2`'ye döndürdü ve ekibe haber gitti. Run yine kırmızı, çünkü bir şey gerçekten kırıldı; ama kullanıcılar sadece birkaç saniye etkilendi.",
          "The second try at discounts (`e2f81b4`) was broken too. This time the smoke test failed, the rollback step put staging back on `5d9b3f2` and the team got a message. The run is still red, because something really broke; but users were affected for only a few seconds.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: workflowFile(deployWf(ALL)), code: workflowYaml(deployWf(ALL)) }] },
    },
    {
      short: l("Sürüm numarası", "Version number"),
      tag: "how",
      predict: {
        question: l(
          "Son sürümün `v1.4.0`. Yeni özellik yok, sadece bir hatayı düzelttin. Yeni sürüm hangisi olmalı?",
          "Your last release is `v1.4.0`. No new features, you only fixed a bug. What should the new version be?",
        ),
        options: [l("`v1.4.1`", "`v1.4.1`"), l("`v1.5.0`", "`v1.5.0`"), l("`v2.0.0`", "`v2.0.0`")],
        answer: 0,
        why: l(
          "[[semver|SemVer]]'de düzeltme son sayıyı (patch) artırır. Yeni özellik ortadakini (minor), geriye uyumsuz değişiklik ilkini (major) artırır.",
          "In [[semver|SemVer]] a fix bumps the last number (patch). A new feature bumps the middle one (minor), a breaking change the first one (major).",
        ),
      },
      title: l("Çıkan her şeye bir ad ver", "Give everything you ship a name"),
      body: [
        l(
          "Commit SHA'ları makineler için mükemmel ama insanlar \"hangi sürümdesin?\" diye sorar. Bir sürüm çıkardığında commit'e `v1.4.1` gibi bir git tag'i koy ve GitHub'da bir Release aç: değişikliklerin listesi, kim ne yaptı, hangi PR'lar girdi.",
          "Commit SHAs are perfect for machines, but people ask \"which version are you on?\". When you ship a release, put a git tag like `v1.4.1` on the commit and open a Release on GitHub: the list of changes, who did what, which PRs went in.",
        ),
        l(
          "`gh release create --generate-notes` notları PR başlıklarından kendisi yazar. Release'i bir tag push'unun tetiklediği bir workflow da açabilir.",
          "`gh release create --generate-notes` writes the notes from the PR titles itself. A workflow triggered by a tag push can open the Release too.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git tag v1.4.1", note: l("Şu anki commit'e sürüm etiketi koyar.", "Tags the current commit with the version.") },
          { cmd: "git push origin v1.4.1", note: l("Tag'ler `git push` ile kendiliğinden gitmez.", "Tags are not sent by a plain `git push`.") },
          { cmd: "gh release create v1.4.1 --generate-notes", note: l("Notları PR'lardan üreterek Release açar.", "Opens a Release with notes built from the PRs.") },
        ],
        snippets: [{ label: ".github/workflows/release.yml", code: RELEASE_WF, note: l("`v` ile başlayan her tag'de Release'i workflow açar.", "The workflow opens the Release for every tag starting with `v`.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Deploy'dan sonra gerçekte neler olur?", "What really happens after a deploy"),
      body: [
        l(
          "**Smoke test sadece başlangıç:** ana sayfanın açılması, giriş yapılabilmesi gibi birkaç kritik yolu deneyen kısa testler de eklenir. **İzleme:** deploy'dan sonraki dakikalarda hata oranı ve gecikme grafiğine bakılır; bazı ekipler bunu da otomatik yapar ve eşik aşılırsa geri alır.",
          "**A smoke test is only the start:** short tests that try a few critical paths, such as loading the home page or logging in, are often added. **Monitoring:** in the minutes after a deploy someone watches the error rate and latency; some teams automate that too and roll back when a threshold is crossed.",
        ),
        l(
          "**Önceki sürüm hangisi?** Bu sahnede `--previous` ortamın deploy geçmişinden bir öncekini seçiyor. Gerçek bir script'te genelde son başarılı deploy'un SHA'sı bir yerde saklanır (bir dosya, ortamın etiketi, Kubernetes'in revizyon geçmişi).",
          "**Which version is the previous one?** On this stage `--previous` picks the one before in the environment's deploy history. In a real script the last good deploy's SHA is usually stored somewhere (a file, a label on the environment, Kubernetes' revision history).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada bozuk bir sürüm her isteğe 500 dönüyor, health check tek bir curl ve geri alma anında bitiyor. Gerçekte hatalar bazen sadece bazı isteklerde çıkar ve tek bir health check'ten kaçabilir; geri alma da birkaç dakika sürebilir. `./notify.sh` yerine Slack ya da Teams için hazır action'lar kullanılır.",
            "Here a broken version answers every request with 500, the health check is a single curl and a rollback finishes at once. In reality bugs sometimes hit only some requests and can slip past a single health check, and a rollback can take a few minutes. Instead of `./notify.sh`, ready-made actions for Slack or Teams are used.",
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
          "Aşağıda gerçek işten **4 senaryo** var: Bora'nın sepeti staging'i bozacak ve workflow deploy'dan sonra hiçbir şeye bakmıyor. `deploy` job'ına smoke test, geri alma ve haber verme adımlarını `nano .github/workflows/deploy.yml` ile **kendin ekle**, `git commit` ve `git push` ile gönder; push sepeti de staging'e götürür.",
          "Below are **4 scenarios** from real work: Bora's cart is going to break staging, and the workflow looks at nothing after the deploy. **Add the smoke test, rollback and notify steps yourself** to the `deploy` job with `nano .github/workflows/deploy.yml`, and send them with `git commit` and `git push`; the push takes the cart to staging too.",
        ),
        l(
          "Run'ı `gh run view` ve `gh run view --log-failed` ile incele; açık PR'ları `gh pr list` gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "Inspect the run with `gh run view` and `gh run view --log-failed`; `gh pr list` shows open PRs. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Yeşil bir deploy adımı sadece komutun 0 ile bittiğini söyler, sitenin çalıştığını değil.", "A green deploy step only says the command exited 0, not that the site works."),
    l("Deploy'dan hemen sonra `curl --fail` ile bir smoke test çalıştır.", "Run a smoke test with `curl --fail` right after the deploy."),
    l("`if: failure()` olan adımlar sadece önceki bir adım kırıldıysa çalışır: geri alma ve haber verme için ideal.", "Steps with `if: failure()` only run when an earlier step failed: ideal for rolling back and notifying."),
    l("Smoke test kırılınca run kırmızı kalmalı; geri alma kullanıcıyı korur, kırmızı da ekibi uyarır.", "When the smoke test fails the run should stay red; the rollback protects users, the red warns the team."),
    l("Sürümleri SemVer ile adlandır: düzeltme patch, özellik minor, uyumsuz değişiklik major.", "Name releases with SemVer: a fix is patch, a feature is minor, a breaking change is major."),
    l("`git tag` + `gh release create --generate-notes` ile her sürümün bir adı ve notları olur.", "`git tag` + `gh release create --generate-notes` give every release a name and notes."),
  ],
  quiz: [
    {
      question: l("Deploy adımı yeşil bitti. Bu ne demek?", "The deploy step finished green. What does that mean?"),
      options: [
        l("Site sağlıklı çalışıyor", "The site is working"),
        l("Deploy komutu 0 ile bitti; sitenin çalıştığı ayrıca kontrol edilmeli", "The deploy command exited 0; whether the site works must be checked separately"),
        l("Testler geçti", "The tests passed"),
        l("Kullanıcılar yeni sürümü sevdi", "Users like the new version"),
      ],
      answer: 1,
      explain: l("Deploy adımı sadece kendi işini bildirir; siteye smoke test bakar.", "The deploy step only reports its own job; the smoke test looks at the site."),
      reviewStep: 0,
    },
    {
      question: l("`curl --fail` neden smoke test için kullanılır?", "Why is `curl --fail` used for a smoke test?"),
      options: [
        l("Daha hızlı olduğu için", "Because it is faster"),
        l("Hatalı bir HTTP cevabında sıfır olmayan exit code ile çıktığı için", "Because it exits with a non-zero code on an error HTTP answer"),
        l("Sadece HTTPS'te çalıştığı için", "Because it only works over HTTPS"),
        l("Cevabı dosyaya yazdığı için", "Because it writes the answer to a file"),
      ],
      answer: 1,
      explain: l("`--fail` olmadan curl 500 alsa bile 0 ile çıkar ve adım yeşil kalır.", "Without `--fail`, curl exits 0 even on a 500 and the step stays green."),
      reviewStep: 1,
    },
    {
      question: l("`if: failure()` olan bir adım ne zaman çalışır?", "When does a step with `if: failure()` run?"),
      options: [
        l("Her zaman", "Always"),
        l("Sadece job'da önceki bir adım kırıldıysa", "Only if an earlier step in the job failed"),
        l("Sadece main branch'inde", "Only on the main branch"),
        l("Run iptal edilince", "When the run is cancelled"),
      ],
      answer: 1,
      explain: l("Varsayılan `success()`'in tersi: bir şey kırıldığında devreye girer.", "The opposite of the default `success()`: it steps in when something broke."),
      reviewStep: 3,
    },
    {
      question: l("`v1.4.1`'e geriye uyumsuz bir API değişikliği ekledin. Yeni sürüm?", "You added a breaking API change on top of `v1.4.1`. The new version?"),
      options: [l("`v1.4.2`", "`v1.4.2`"), l("`v1.5.0`", "`v1.5.0`"), l("`v2.0.0`", "`v2.0.0`"), l("`v1.4.1-new`", "`v1.4.1-new`")],
      answer: 2,
      explain: l("Uyumsuz değişiklik major'ı artırır ve diğerlerini sıfırlar.", "A breaking change bumps major and resets the others."),
      reviewStep: 4,
    },
  ],
};
