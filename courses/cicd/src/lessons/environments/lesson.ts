import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { DEPLOY, MANUAL, scene } from "./Scene";

export const environments: Lesson = {
  slug: "environments",
  title: l("Ortamlar ve onaylar", "Environments and approvals"),
  summary: l(
    "Kod dev, staging ve production'dan sırayla geçer. Her job'a bir `environment` verirsin; production'a onay şartı koyunca run orada durur ve bir insan bakmadan devam etmez. `workflow_dispatch` ile istediğin sürümü elle de deploy edebilirsin.",
    "Code goes through dev, staging and production in turn. You give each job an `environment`; with an approval rule on production, the run stops there and does not go on until a person has looked. With `workflow_dispatch` you can also deploy any version by hand.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("dev → staging → production akışını ve `environment:` anahtarını tanımak", "Know the dev → staging → production flow and the `environment:` key"), step: 0 },
    { text: l("Production'a onay şartı koyup run'ı orada bekletmek", "Put an approval rule on production and make the run wait there"), step: 1 },
    { text: l("Staging'de bozuk görünen bir sürümü production'a geçirmemek", "Keep a version that looks broken on staging out of production"), step: 3 },
    { text: l("`workflow_dispatch` girdileriyle belirli bir sürümü elle deploy etmek", "Deploy a specific version by hand with `workflow_dispatch` inputs"), step: 5 },
  ],
  steps: [
    {
      short: l("Üç ortam", "Three environments"),
      tag: "problem",
      title: l("Push'ladın, prod'a kadar gitti", "You pushed, it went all the way to prod"),
      body: [
        l(
          "Deploy workflow'u her commit'ten bir image üretiyor, sonra onu sırayla üç [[environment|ortama]] koyuyor: **dev** (ekibin her şeyi ilk gördüğü yer), **staging** (production'a en çok benzeyen, testlerin yapıldığı yer) ve **production** (gerçek kullanıcılar).",
          "The deploy workflow builds an image from each commit, then puts it on three [[environment|environments]] in turn: **dev** (where the team sees everything first), **staging** (the closest copy of production, where testing happens) and **production** (real users).",
        ),
        l(
          "Yeni ödeme sayfası (`8b1d24e`) push'landı ve iki dakikadan kısa sürede üç ortamda birden çalışıyor. Hızlı, ama arada kimse staging'e bakmadı bile.",
          "The new checkout page (`8b1d24e`) was pushed and in under two minutes it runs on all three. Fast, but nobody even looked at staging in between.",
        ),
      ],
      practice: {
        intro: l("Her deploy job'ı `environment:` ile bir ortama bağlanır:", "Each deploy job is tied to an environment with `environment:`:"),
        commands: [],
        snippets: [{ label: workflowFile(DEPLOY), code: workflowYaml(DEPLOY), note: l("`needs` zinciri sırayı kurar: image → dev → staging → production.", "The `needs` chain sets the order: image → dev → staging → production.") }],
      },
    },
    {
      short: l("Onay şartı", "Approval rule"),
      tag: "how",
      predict: {
        question: l(
          "Repo ayarlarında production ortamına **required reviewers** ekledik. Şimdi yeni bir commit push'lanınca ne olur?",
          "In the repo settings we added **required reviewers** to the production environment. What happens when a new commit is pushed now?",
        ),
        options: [
          l("Run hiç başlamaz", "The run never starts"),
          l("dev ve staging'e gider, production job'ı onay bekler", "It goes to dev and staging; the production job waits for approval"),
          l("Production'a gider, sonra bir onay maili gelir", "It goes to production, then an approval email arrives"),
        ],
        answer: 1,
        why: l(
          "Onay şartı run'ı değil, o ortama bağlı job'ı durdurur. Önceki job'lar normal çalışır; production job'ı biri onaylayana kadar bekler.",
          "The rule does not stop the run, only the job tied to that environment. The jobs before it run as usual; the production job waits until someone approves.",
        ),
      },
      title: l("Run production'ın kapısında bekliyor", "The run waits at production's door"),
      body: [
        l(
          "Hızlı arama (`c41e0a7`) push'landı. dev ve staging yeni sürüme geçti, ama production job'ı sarı: \"onay bekliyor\". Bu sırada staging'e bakabilir, testlerin sonucunu okuyabilir, bir ürün sahibine gösterebilirsin.",
          "Faster search (`c41e0a7`) was pushed. dev and staging moved to it, but the production job is yellow: \"waiting for approval\". Meanwhile you can look at staging, read the test results, show it to a product owner.",
        ),
        l(
          "Bunu workflow dosyası değil, repo ayarları yapar: `environment: production` yazan her job bu kurala uyar. Kuralı kimin değiştirebildiği de ayrı bir yetkidir.",
          "This is set in the repo settings, not in the workflow file: every job with `environment: production` follows the rule. Who may change the rule is a separate permission too.",
        ),
      ],
      practice: {
        intro: l("Settings → Environments → production → **Required reviewers**'a bir kişi ya da ekip ekle.", "Settings → Environments → production → add a person or team under **Required reviewers**."),
        commands: [{ cmd: "gh run list --workflow deploy.yml --status waiting", note: l("Onay bekleyen run'lar.", "Runs waiting for approval.") }],
      },
    },
    {
      short: l("Onayla", "Approve"),
      tag: "how",
      title: l("Biri bakar, onaylar, devam eder", "Someone looks, approves, it goes on"),
      body: [
        l(
          "Staging'de her şey yolunda görünüyordu, run sayfasındaki **Review deployments** düğmesiyle onayladık. Production job'ı o an başladı ve production `c41e0a7`'ye geçti.",
          "Everything looked fine on staging, so we approved with the **Review deployments** button on the run's page. The production job started right then and production moved to `c41e0a7`.",
        ),
        l(
          "Bu artık [[cd|Continuous Delivery]]: her commit production'a hazır ama son adımı bir insan atıyor. GitHub kimin, ne zaman onayladığını run'ın geçmişinde saklar.",
          "This is now [[cd|Continuous Delivery]]: every commit is ready for production, but a person takes the last step. GitHub keeps who approved and when in the run's history.",
        ),
      ],
      practice: { commands: [{ cmd: "gh run view --web", note: l("Run sayfasını tarayıcıda açar; onay düğmesi orada.", "Opens the run's page in the browser; the approve button is there.") }] },
    },
    {
      short: l("Bozuk staging", "Broken staging"),
      tag: "experiment",
      predict: {
        question: l(
          "Kupon özelliği (`5d9b3f2`) geldi. Testler geçti ama staging 500 veriyor. Production job'ı onay bekliyor. Onaylamazsan ne olur?",
          "The coupons feature (`5d9b3f2`) arrived. Tests passed, but staging answers 500. The production job is waiting. If you do not approve, what happens?",
        ),
        options: [
          l("Bir süre sonra kendiliğinden production'a gider", "It goes to production by itself after a while"),
          l("Production önceki sağlam sürümde (`c41e0a7`) kalır", "Production stays on the last healthy version (`c41e0a7`)"),
          l("Production da 500 vermeye başlar", "Production starts answering 500 too"),
        ],
        answer: 1,
        why: l(
          "Onay verilmeyen job hiç çalışmaz. Kullanıcılar bu arada hiçbir şey fark etmez.",
          "A job nobody approves never runs. Users notice nothing in the meantime.",
        ),
      },
      title: l("Kapı kötü sürümü durdurdu", "The gate stopped the bad version"),
      body: [
        l(
          "dev ve staging bozuk `5d9b3f2`'yi çalıştırıyor, production ise hâlâ `c41e0a7` ve sağlıklı. Onay şartı olmasaydı aynı hata iki dakika içinde gerçek kullanıcılardaydı.",
          "dev and staging run the broken `5d9b3f2`, while production is still on `c41e0a7` and healthy. Without the approval rule, the same bug would have reached real users within two minutes.",
        ),
        l(
          "Staging tam olarak bunun için var: testlerin yakalayamadığı şeyleri, production'a benzeyen bir yerde gerçek gözlerle görmek.",
          "This is exactly what staging is for: seeing, with real eyes and somewhere like production, what the tests could not catch.",
        ),
      ],
    },
    {
      short: l("Düzelt, onayla", "Fix, approve"),
      tag: "how",
      title: l("Düzeltme gelir, onu onaylarsın", "The fix arrives, you approve that"),
      body: [
        l(
          "Düzeltme (`a07c6e1`) push'landı, yeni bir run başladı ve o da production'da durdu. Staging'in iyileştiğini görüp **bu** run'ı onayladık: production `a07c6e1`'e geçti.",
          "The fix (`a07c6e1`) was pushed, a new run started, and it stopped at production too. We saw staging recover and approved **this** run: production moved to `a07c6e1`.",
        ),
        l(
          "Bozuk sürümün run'ı hâlâ onay bekliyor; ona dokunmadık. Bekleyen bir run'ı reddedebilir ya da öylece bırakabilirsin.",
          "The broken version's run is still waiting; we left it alone. You can reject a waiting run or simply leave it.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Onaylarken **hangi** run'ı onayladığına bak. Eski bir run'ı onaylamak, eski bir commit'i production'a gönderir.",
            "When approving, check **which** run you approve. Approving an old run sends an old commit to production.",
          ),
        },
      ],
    },
    {
      short: l("Elle deploy", "By hand"),
      tag: "how",
      predict: {
        question: l(
          "Bir müşteri `c41e0a7` sürümünde bir hata bildirdi. \"Deploy by hand\" workflow'unu `version: c41e0a7` ile çalıştırıyoruz. Production'a ne olur?",
          "A customer reported a bug in version `c41e0a7`. We run the \"Deploy by hand\" workflow with `version: c41e0a7`. What happens to production?",
        ),
        options: [
          l("Production da `c41e0a7`'ye döner", "Production goes back to `c41e0a7` too"),
          l("Hiçbir şey: bu workflow sadece staging'e deploy ediyor", "Nothing: this workflow only deploys to staging"),
          l("Workflow hata verir, eski sürümler deploy edilemez", "The workflow fails; old versions cannot be deployed"),
        ],
        answer: 1,
        why: l(
          "Workflow'un tek job'ı `environment: staging` ve sadece staging'e deploy ediyor. Registry'deki her SHA etiketi hâlâ orada, eskisini çekmek sorun değil.",
          "The workflow's only job has `environment: staging` and deploys only to staging. Every SHA tag is still in the registry, so pulling an old one is no problem.",
        ),
      },
      title: l("workflow_dispatch: istediğin sürümü, istediğin zaman", "workflow_dispatch: any version, whenever you want"),
      body: [
        l(
          "`on: workflow_dispatch` ile bir workflow'u Actions sekmesindeki **Run workflow** düğmesiyle ya da `gh workflow run` ile elle başlatırsın. `inputs` altında tanımladığın her girdi bir form alanı olur; workflow içinde `${{ inputs.version }}` olarak okunur.",
          "With `on: workflow_dispatch` you start a workflow by hand, from the **Run workflow** button on the Actions tab or with `gh workflow run`. Every input you list under `inputs` becomes a form field and is read inside the workflow as `${{ inputs.version }}`.",
        ),
        l(
          "Staging şimdi `c41e0a7` çalıştırıyor, production ise `a07c6e1`'de. Hatayı staging'de tekrar üretip inceleyebilirsin.",
          "Staging now runs `c41e0a7` while production stays on `a07c6e1`. You can reproduce the bug on staging and look into it.",
        ),
      ],
      practice: {
        snippets: [{ label: workflowFile(MANUAL), code: workflowYaml(MANUAL) }],
        commands: [{ cmd: "gh workflow run deploy-by-hand.yml -f version=c41e0a7", note: l("Formu doldurmanın terminal yolu.", "The terminal way to fill in the form.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Ortamların başka neleri var?", "What else environments give you"),
      body: [
        l(
          "**Ortam secret'ları:** `DEPLOY_TOKEN` gibi bir secret'ı reponun geneline değil, sadece production ortamına koyabilirsin. O zaman production'a ait token'ı sadece `environment: production` yazan ve onaylanan job görür.",
          "**Environment secrets:** you can put a secret like `DEPLOY_TOKEN` on the production environment only, instead of the whole repo. Then only a job with `environment: production` that got approved can see the production token.",
        ),
        l(
          "**Başka kurallar:** bekleme süresi (wait timer), sadece `main`'den deploy izni (deployment branches) ve onaylayanın kendi run'ını onaylayamaması. **Onay bekleyen bir run** 30 gün sonra kendiliğinden iptal olur.",
          "**Other rules:** a wait timer, allowing deploys only from `main` (deployment branches), and preventing people from approving their own runs. **A run waiting for approval** is cancelled by itself after 30 days.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede onay tek bir düğme ve deploy anında bitiyor. Gerçekte onaylayıcılar bir bildirim alır, run sayfasında yorum yazarak onaylar ya da reddeder. Elle deploy'da ortamı da bir girdi yapıp `environment: ${{ inputs.environment }}` yazabilirsin; o zaman production seçilince onay kuralı yine çalışır.",
            "On this stage approval is one button and deploys finish at once. In reality reviewers get a notification and approve or reject on the run's page, with a comment. For deploys by hand you can make the environment an input too and write `environment: ${{ inputs.environment }}`; picking production then still triggers the approval rule.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "gh secret set DEPLOY_TOKEN --env production", note: l("Secret'ı sadece production ortamına ekler.", "Adds the secret to the production environment only.") },
          { cmd: "gh api repos/{owner}/{repo}/environments", note: l("Repodaki ortamları ve kurallarını listeler.", "Lists the repo's environments and their rules.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Deploy workflow'u yerinde, üç ortam da ilk sürümü (`3f2a1c9`) çalıştırıyor ve production'da onay şartı **yok**. Push'layabilir, onay şartını açıp kapatabilir, bekleyen run'ı onaylayabilir ya da bir önceki sürümü elle staging'e koyabilirsin.",
          "The deploy workflow is in place, all three environments run the first version (`3f2a1c9`) and production has **no** approval rule. You can push, turn the rule on and off, approve a waiting run, or put the previous version on staging by hand.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Kod dev → staging → production sırasıyla ilerler; `needs` zinciri bu sırayı kurar.", "Code goes dev → staging → production; a `needs` chain sets the order."),
    l("`environment:` bir job'ı bir ortama bağlar; ortamın kuralları o job'a uygulanır.", "`environment:` ties a job to an environment; the environment's rules apply to that job."),
    l("Required reviewers ile production job'ı biri onaylayana kadar bekler.", "With required reviewers, the production job waits until someone approves."),
    l("Staging'de kötü görünen bir run'ı onaylamazsan production yerinde kalır.", "If you do not approve a run that looks bad on staging, production stays put."),
    l("`workflow_dispatch` + `inputs` ile belirli bir sürümü elle deploy edersin.", "`workflow_dispatch` + `inputs` lets you deploy a specific version by hand."),
    l("Production'a ait secret'ları ortam secret'ı olarak sakla.", "Keep production's secrets as environment secrets."),
  ],
  quiz: [
    {
      question: l("Production'a onay şartı koyunca push sonrası ne olur?", "With an approval rule on production, what happens after a push?"),
      options: [
        l("Run hiç başlamaz", "The run does not start"),
        l("Önceki job'lar çalışır, production job'ı onay bekler", "Earlier jobs run; the production job waits for approval"),
        l("Bütün job'lar onay bekler", "Every job waits for approval"),
        l("Production'a gider, sonra onay istenir", "It goes to production, then asks for approval"),
      ],
      answer: 1,
      explain: l("Kural sadece o ortama bağlı job'ı durdurur.", "The rule only stops the job tied to that environment."),
      reviewStep: 1,
    },
    {
      question: l("Onay kuralı nerede tanımlanır?", "Where is the approval rule defined?"),
      options: [
        l("Workflow dosyasında `approve: true` ile", "In the workflow file with `approve: true`"),
        l("Repo ayarlarında, ortamın kurallarında", "In the repo settings, on the environment's rules"),
        l("`package.json`'da", "In `package.json`"),
        l("Commit mesajında", "In the commit message"),
      ],
      answer: 1,
      explain: l("Workflow sadece `environment: production` der; kuralı ortam ayarları koyar.", "The workflow only says `environment: production`; the environment's settings set the rule."),
      reviewStep: 1,
    },
    {
      question: l("Staging 500 veriyor ve production job'ı onay bekliyor. En doğru hamle?", "Staging answers 500 and the production job is waiting. The right move?"),
      options: [
        l("Onaylamak, prod'da düzelir", "Approve; it will be fine in prod"),
        l("Onaylamamak ve düzeltmenin run'ını onaylamak", "Do not approve, and approve the fix's run instead"),
        l("Onay kuralını kapatmak", "Turn off the approval rule"),
        l("Eski run'ı onaylamak", "Approve an older run"),
      ],
      answer: 1,
      explain: l("Bekleyen kötü sürüm production'a hiç ulaşmaz; düzeltme kendi run'ıyla gelir.", "The waiting bad version never reaches production; the fix comes with its own run."),
      reviewStep: 3,
    },
    {
      question: l("`workflow_dispatch` girdisi workflow içinde nasıl okunur?", "How is a `workflow_dispatch` input read inside the workflow?"),
      options: [l("`$VERSION`", "`$VERSION`"), l("`${{ inputs.version }}`", "`${{ inputs.version }}`"), l("`${{ secrets.version }}`", "`${{ secrets.version }}`"), l("Okunamaz", "It cannot be read")],
      answer: 1,
      explain: l("`inputs` altında tanımlanan her girdi `inputs.<ad>` olarak gelir.", "Every input listed under `inputs` arrives as `inputs.<name>`."),
      reviewStep: 5,
    },
  ],
};
