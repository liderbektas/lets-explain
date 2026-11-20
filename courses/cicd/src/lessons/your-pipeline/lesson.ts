import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { pagesWf, scene } from "./Scene";

const BUILD_YAML = workflowYaml(pagesWf({ test: true, upload: false, deploy: false, onlyMain: false }));

const DEPLOY_JOB = `  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4`;

/** The complete, real workflow for this repository. */
export const PAGES_YAML = `# .github/workflows/pages.yml
name: Pages

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build          # tsc -b && vite build → dist/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4`;

export const yourPipeline: Lesson = {
  slug: "your-pipeline",
  title: l("Kendi pipeline'ını yaz", "Write your own pipeline"),
  summary: l(
    "Kursun öğrettiği her şeyi bir araya getirip bu sitenin kendisini yayına alan workflow'u yazıyoruz: her PR'da test ve build, main'e her merge'de GitHub Pages'e deploy. Sonunda projene doğrudan koyabileceğin tam bir dosya var.",
    "We put everything from the course together and write the workflow that ships this very site: tests and a build on every PR, a deploy to GitHub Pages on every merge to main. At the end you get a complete file you can drop into your project.",
  ),
  minutes: 18,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir projenin script'lerinden CI adımlarını çıkarmak", "Turn a project's scripts into CI steps"), step: 1 },
    { text: l("Build ile deploy'u iki job'a ayırıp artifact ile bağlamak", "Split build and deploy into two jobs joined by an artifact"), step: 2 },
    { text: l("PR'ların deploy etmesini bir `if` ile engellemek", "Keep PRs from deploying with an `if`"), step: 4 },
    { text: l("Branch protection ile kırık PR'ın merge edilmesini engellemek", "Block a broken PR from merging with branch protection"), step: 5 },
    { text: l("Projen için tam ve çalışan bir Pages workflow'u yazmak", "Write a complete, working Pages workflow for your project"), step: 6 },
  ],
  steps: [
    {
      short: l("Bu site", "This site"),
      tag: "problem",
      title: l("Şu an okuduğun site", "The site you are reading"),
      body: [
        l(
          "Let's explain bir Vite uygulaması. `package.json`'da iki script önemli: `npm test` (`vitest run`: simülasyonlar ve görev testleri), `npm run build` (`tsc -b && vite build`: önce tipleri kontrol eder, sonra `dist/` klasörüne statik dosyalar üretir). `vite.config.ts`'de `base: \"./\"` olduğu için site herhangi bir alt klasörden, GitHub Pages dahil, çalışır.",
          "Let's explain is a Vite app. Two scripts in `package.json` matter: `npm test` (`vitest run`: the simulations and mission tests) and `npm run build` (`tsc -b && vite build`: checks the types first, then writes static files to `dist/`). Since `vite.config.ts` has `base: \"./\"`, the site works from any subfolder, GitHub Pages included.",
        ),
        l(
          "Repoda henüz `.github/workflows/` yok. Push'ladık ve hiçbir şey olmadı: ne test, ne build, ne deploy. Bu derste onu sıfırdan kuruyoruz.",
          "The repo has no `.github/workflows/` yet. We pushed and nothing happened: no tests, no build, no deploy. In this lesson we build it from scratch.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "npm ci && npm test && npm run build", note: l("Pipeline'ın yapacağı her şeyi önce kendi makinende dene.", "Try everything the pipeline will do on your own machine first.") },
          { cmd: "ls dist", note: l("Yayınlanacak olan bu klasör.", "This is the folder that gets published.") },
        ],
      },
    },
    {
      short: l("Build job'ı", "Build job"),
      tag: "how",
      title: l("Önce build: script'ler adım olur", "Build first: the scripts become steps"),
      body: [
        l(
          "İlk job, bir geliştiricinin yeni bir bilgisayarda yapacaklarının aynısı: kodu çek, Node'u kur, `npm ci`, `npm test`, `npm run build`. Push'ladık; run yeşil.",
          "The first job does what a developer would do on a new laptop: get the code, install Node, `npm ci`, `npm test`, `npm run build`. We pushed; the run is green.",
        ),
        l(
          "Bu haliyle bile işe yarıyor: kimse kırık bir build'i fark etmeden main'e koyamaz. Ama site henüz hiçbir yere gitmiyor.",
          "Even like this it helps: nobody can put a broken build on main without noticing. But the site does not go anywhere yet.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/pages.yml", code: BUILD_YAML }] },
    },
    {
      short: l("Deploy job'ı", "Deploy job"),
      tag: "how",
      title: l("Build'in çıktısı deploy'a artifact olarak gider", "The build output reaches the deploy as an artifact"),
      body: [
        l(
          "Build job'ının sonuna `actions/upload-pages-artifact` ekledik: `dist/`'i paketleyip saklıyor. Yeni bir `deploy` job'ı `needs: build` ile build'i bekliyor, `environment: github-pages` ile Pages ortamına bağlanıyor ve `actions/deploy-pages` ile paketi yayınlıyor.",
          "We added `actions/upload-pages-artifact` at the end of the build job: it packs and stores `dist/`. A new `deploy` job waits for the build with `needs: build`, is tied to the Pages environment with `environment: github-pages`, and publishes the package with `actions/deploy-pages`.",
        ),
        l(
          "Neden iki job? Build herkes için çalışır (PR'lar dahil), deploy ise daha fazla yetki ister (`pages: write`). İkisini ayırmak, yetkiyi sadece ihtiyacı olan job'a vermeyi kolaylaştırır.",
          "Why two jobs? The build runs for everyone (PRs included), while the deploy needs more rights (`pages: write`). Splitting them makes it easy to give those rights only to the job that needs them.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "deploy job", code: DEPLOY_JOB }] },
    },
    {
      short: l("İlk PR", "First PR"),
      tag: "experiment",
      predict: {
        question: l(
          "Bir `feature` branch'i açıp PR gönderdin. Workflow'a göre bu PR'da hangi job'lar çalışır?",
          "You opened a PR from a `feature` branch. According to the workflow, which jobs run on this PR?",
        ),
        options: [
          l("Sadece build", "Only build"),
          l("Build ve deploy: PR'ın kodu yayına gider", "Build and deploy: the PR's code goes live"),
          l("Hiçbiri: workflow sadece main'i dinliyor", "Neither: the workflow only listens to main"),
        ],
        answer: 1,
        why: l(
          "Workflow `pull_request`'i dinliyor ve deploy job'ında hiçbir koşul yok. Yani deploy da çalışıyor; henüz review'dan geçmemiş kod yayına çıkıyor.",
          "The workflow listens to `pull_request` and the deploy job has no condition. So the deploy runs too, and code nobody has reviewed yet goes live.",
        ),
      },
      title: l("PR'ın kodu yayına çıktı", "The PR's code went live"),
      body: [
        l(
          "PR'ın run'ı build'i geçti, sonra deploy job'ı da çalıştı ve sahnede Pages artık `feature` branch'inin commit'ini gösteriyor. Henüz kimse bu PR'a bakmadı bile.",
          "The PR's run passed the build, then the deploy job ran too, and on stage Pages now serves the `feature` branch's commit. Nobody has even looked at this PR yet.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte GitHub'ın `github-pages` ortamı varsayılan olarak sadece varsayılan branch'ten deploy'a izin verir; bu job orada reddedilirdi. Ama başka bir hosting'de ya da ortam kuralı değiştirilmişse PR kodu gerçekten yayına çıkar. Niyetini workflow'da açıkça yaz.",
            "In reality GitHub's `github-pages` environment only allows deploys from the default branch by default, so this job would be rejected there. But on another host, or with that rule changed, the PR's code really would go live. Say what you mean in the workflow.",
          ),
        },
      ],
    },
    {
      short: l("Sadece main", "Main only"),
      tag: "how",
      title: l("Deploy'a bir koşul: sadece main", "A condition on deploy: main only"),
      body: [
        l(
          "Deploy job'ına `if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'` ekledik. PR'a yeni bir commit geldi: build yeşil, deploy **atlandı**. PR'lar artık sadece \"bu kod build oluyor ve testleri geçiyor mu?\" sorusunu cevaplıyor.",
          "We added `if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'` to the deploy job. A new commit came to the PR: build green, deploy **skipped**. PRs now only answer \"does this code build and pass the tests?\".",
        ),
        l("Pages hâlâ PR'dan kalan commit'i gösteriyor; bir sonraki merge bunu düzeltecek.", "Pages still shows the commit left over from the PR; the next merge fixes that."),
      ],
    },
    {
      short: l("Kırık PR", "Broken PR"),
      tag: "experiment",
      predict: {
        question: l(
          "main'i korumaya aldık ve `Pages / build`'i zorunlu check yaptık. PR'a testi kıran bir commit geldi. \"Merge\" düğmesine basınca ne olur?",
          "We protected main and made `Pages / build` a required check. A commit that breaks a test came to the PR. What happens when you press \"Merge\"?",
        ),
        options: [
          l("Merge olur, deploy job'ı zaten testleri tekrar çalıştırır", "It merges; the deploy job runs the tests again anyway"),
          l("Merge engellenir: zorunlu check geçmedi", "The merge is blocked: the required check did not pass"),
          l("Merge olur ama Pages güncellenmez", "It merges but Pages does not update"),
        ],
        answer: 1,
        why: l(
          "Branch protection, zorunlu check kırmızıyken merge düğmesini kilitler. Kırık kod main'e hiç giremez.",
          "Branch protection locks the merge button while a required check is red. Broken code cannot get into main at all.",
        ),
      },
      title: l("Kırık test main'in kapısında kaldı", "The broken test stayed outside main"),
      body: [
        l(
          "PR'ın run'ında build job'ı `npm test`'te kırıldı, deploy atlandı. Merge'e bastık ve GitHub reddetti: `Pages / build` geçmedi. Sağdaki PR kartında zorunlu check'i ve kilitli düğmeyi görüyorsun.",
          "In the PR's run the build job failed at `npm test` and the deploy was skipped. We pressed merge and GitHub refused: `Pages / build` did not pass. The PR card on the right shows the required check and the locked button.",
        ),
      ],
      practice: {
        intro: l("Settings → Branches → main için bir kural ekle → **Require status checks to pass** → `build`'i seç.", "Settings → Branches → add a rule for main → **Require status checks to pass** → pick `build`."),
        commands: [{ cmd: "gh pr checks", note: l("PR'ın check'lerini terminalden gösterir.", "Shows the PR's checks from the terminal.") }],
      },
    },
    {
      short: l("Merge ve yayın", "Merge and ship"),
      tag: "how",
      title: l("Düzelt, merge et, yayına çıksın", "Fix, merge, ship"),
      body: [
        l(
          "Testi düzelten commit geldi; PR yeşil. Merge ettik, main'e bir merge commit'i düştü ve aynı workflow bu kez `push` olayıyla çalıştı: build, sonra deploy. Pages artık main'in son halini gösteriyor.",
          "The commit that fixes the test arrived; the PR is green. We merged, a merge commit landed on main and the same workflow ran again, this time from a `push`: build, then deploy. Pages now serves main's newest commit.",
        ),
        l(
          "Aşağıdaki dosya bu sitenin tam pipeline'ı. Repoda **Settings → Pages → Source: GitHub Actions** seçip dosyayı `.github/workflows/pages.yml` olarak eklemen yeterli.",
          "The file below is this site's complete pipeline. In the repo pick **Settings → Pages → Source: GitHub Actions** and add the file as `.github/workflows/pages.yml`; that is all.",
        ),
      ],
      practice: {
        snippets: [{ label: ".github/workflows/pages.yml", code: PAGES_YAML, note: l("`cache: npm` setup-node'un kendi npm cache'i; ayrı bir cache adımına gerek kalmaz.", "`cache: npm` is setup-node's own npm cache; no separate cache step needed.") }],
        commands: [
          { cmd: "git switch -c add-pages && git add .github/workflows/pages.yml && git commit -m \"Deploy to GitHub Pages\"" },
          { cmd: "git push -u origin add-pages && gh pr create --fill", note: l("Önce PR: build'in geçtiğini gör, sonra merge et.", "PR first: see the build pass, then merge.") },
          { cmd: "gh run watch", note: l("Merge'den sonra deploy'u izle.", "Watch the deploy after the merge.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek dosyada sahnede olmayanlar", "What the real file has that the stage does not"),
      body: [
        l(
          "**Token yok, `id-token` var:** `deploy-pages` bir secret kullanmaz. `id-token: write` izniyle GitHub'dan kısa ömürlü bir kimlik (OIDC) alır ve Pages'e onunla bağlanır. **`configure-pages`** Pages'in ayarlarını okur; site adresini ve alt yolunu bilir. **Concurrency:** `cancel-in-progress: false`, yarıda kalmış bir yayın olmasın diye çalışan deploy'u iptal etmez, sıradakini bekletir.",
          "**No token, `id-token` instead:** `deploy-pages` uses no secret. With the `id-token: write` permission it gets a short-lived identity (OIDC) from GitHub and uses that to talk to Pages. **`configure-pages`** reads the Pages settings and knows the site's address and sub-path. **Concurrency:** `cancel-in-progress: false` does not cancel a deploy in progress, so no publish is cut in half; the next one waits.",
        ),
        l(
          "**Sürümler:** action'ların `@v4`, `@v5` sürümleri zamanla artar; eklemeden önce her birinin sayfasına bak. **Sonraki adımlar:** PR'lar için bir önizleme ortamı, `npm run build`'den sonra bir smoke test ya da bir Lighthouse kontrolü eklenebilir.",
          "**Versions:** the actions' `@v4`, `@v5` versions go up over time; check each one's page before adding it. **Next steps:** a preview environment for PRs, or a smoke test or Lighthouse check after `npm run build`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede GitHub Pages diğer derslerdeki gibi bir ortam olarak çiziliyor: deploy job'ı artifact'i indirip `./deploy.sh` gibi bir token ile yayınlıyormuş gibi çalışıyor ve süreler yuvarlak. Gerçekte `actions/deploy-pages` artifact'i kendisi alır ve tek adımda yayınlar; token yerine OIDC kullanır.",
            "On stage, GitHub Pages is drawn as an environment like in the other lessons: the deploy job downloads the artifact and publishes as if with a token, like `./deploy.sh`, and times are round. In reality `actions/deploy-pages` fetches the artifact itself and publishes in one step, using OIDC instead of a token.",
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
          "Pipeline yarım kalmış: build job'ında test yok, `dist/` hiçbir yere yüklenmiyor ve deploy job'ı her yerden çalışıyor. Eksik parçaları ekle, main'e ya da bir `feature` branch'ine push'la, PR aç.",
          "The pipeline is half done: the build job has no tests, `dist/` is not uploaded anywhere and the deploy job runs from anywhere. Add the missing pieces, push to main or a `feature` branch, open a PR.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Pipeline adımları projenin kendi script'leridir: `npm ci`, `npm test`, `npm run build`.", "Pipeline steps are the project's own scripts: `npm ci`, `npm test`, `npm run build`."),
    l("Build ve deploy ayrı job'lar; aralarındaki köprü bir artifact.", "Build and deploy are separate jobs; an artifact is the bridge between them."),
    l("PR'lar build ve test etsin, deploy sadece main'de çalışsın (`if:`).", "PRs build and test; deploy runs only on main (`if:`)."),
    l("Branch protection ile zorunlu check'ler kırık kodu main'in dışında tutar.", "Required checks in branch protection keep broken code out of main."),
    l("Pages için: `pages: write` + `id-token: write`, `configure-pages`, `upload-pages-artifact`, `deploy-pages`.", "For Pages: `pages: write` + `id-token: write`, `configure-pages`, `upload-pages-artifact`, `deploy-pages`."),
    l("Kendi projen için önce PR aç, build'in geçtiğini gör, sonra merge et.", "For your own project, open a PR first, see the build pass, then merge."),
  ],
  quiz: [
    {
      question: l("Build ve deploy neden ayrı job'lar?", "Why are build and deploy separate jobs?"),
      options: [
        l("GitHub tek job'a izin vermediği için", "Because GitHub does not allow one job"),
        l("Build herkes için çalışır, deploy'a ek yetki ve koşul verilebilir", "Build runs for everyone; deploy can get extra rights and a condition"),
        l("Daha az dakika harcadığı için", "Because it uses fewer minutes"),
        l("Artifact zorunlu olduğu için", "Because artifacts are required"),
      ],
      answer: 1,
      explain: l("Ayırmak, `pages: write` gibi yetkileri ve `if:` koşulunu sadece deploy'a vermeyi sağlar.", "Splitting lets you give rights like `pages: write` and an `if:` only to the deploy."),
      reviewStep: 2,
    },
    {
      question: l("Deploy job'ında koşul yoksa bir PR açıldığında ne olur?", "With no condition on the deploy job, what happens when a PR is opened?"),
      options: [
        l("Sadece build çalışır", "Only build runs"),
        l("Deploy da çalışır ve review edilmemiş kod yayına gidebilir", "Deploy runs too, and unreviewed code may go live"),
        l("Workflow hiç çalışmaz", "The workflow does not run"),
        l("PR otomatik merge edilir", "The PR merges itself"),
      ],
      answer: 1,
      explain: l("`pull_request` tetiklenince koşulsuz her job çalışır.", "When `pull_request` fires, every job without a condition runs."),
      reviewStep: 3,
    },
    {
      question: l("Kırık testli bir PR'ın merge edilmesini ne engeller?", "What stops a PR with a broken test from merging?"),
      options: [
        l("Deploy job'ı", "The deploy job"),
        l("Branch protection'da zorunlu check olarak işaretlenen build", "The build, marked as a required check in branch protection"),
        l("`concurrency`", "`concurrency`"),
        l("`id-token: write`", "`id-token: write`"),
      ],
      answer: 1,
      explain: l("Zorunlu check kırmızıyken merge düğmesi kilitlidir.", "While a required check is red, the merge button is locked."),
      reviewStep: 5,
    },
    {
      question: l("`actions/deploy-pages` neden `id-token: write` izni ister?", "Why does `actions/deploy-pages` need the `id-token: write` permission?"),
      options: [
        l("Secret'ları okumak için", "To read secrets"),
        l("GitHub'dan kısa ömürlü bir kimlik (OIDC) alıp Pages'e onunla bağlanmak için", "To get a short-lived identity (OIDC) from GitHub and use it with Pages"),
        l("Repoya commit atmak için", "To push commits to the repo"),
        l("Testleri çalıştırmak için", "To run the tests"),
      ],
      answer: 1,
      explain: l("Uzun ömürlü bir token saklamak yerine her run kendi kısa ömürlü kimliğini alır.", "Instead of storing a long-lived token, each run gets its own short-lived identity."),
      reviewStep: 7,
    },
  ],
};
