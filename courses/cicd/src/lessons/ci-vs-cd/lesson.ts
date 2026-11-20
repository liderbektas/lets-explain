import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { CI_ONLY, PIPELINE, scene } from "./Scene";

export const ciVsCd: Lesson = {
  slug: "ci-vs-cd",
  title: l("CI, Delivery ve Deployment", "CI, Delivery and Deployment"),
  summary: l(
    "Üç kavram, tek fark: CI kodu kontrol eder ve build'i hazırlar. Continuous Delivery her yeşil build'i staging'e götürür ve production için bir insanın onayını bekler. Continuous Deployment'ta bu onay da yoktur.",
    "Three ideas, one difference: CI checks the code and prepares the build. Continuous Delivery takes every green build to staging and waits for a person to approve production. Continuous Deployment has no approval at all.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("CI'ın nerede bittiğini görmek: yeşil bir build", "See where CI ends: a green build"), step: 0 },
    { text: l("Continuous Delivery'de production'ın onay beklediğini görmek", "See production wait for approval in Continuous Delivery"), step: 1 },
    { text: l("Continuous Deployment'ta onayın da kalktığını görmek", "See the approval go away in Continuous Deployment"), step: 3 },
    { text: l("İkisi arasında ne zaman hangisini seçeceğini bilmek", "Know when to pick which"), step: 5 },
  ],
  steps: [
    {
      short: l("Sadece CI", "CI only"),
      tag: "idea",
      title: l("CI: kontrol et ve build'i hazırla", "CI: check the code and prepare the build"),
      body: [
        l(
          "Workflow'umuzda şimdilik tek bir job var: `build`. Kodu çeker, testleri çalıştırır, uygulamayı derler ve çıkan dosyaları saklar. Push'ladık: run yeşil.",
          "For now our workflow has a single job: `build`. It fetches the code, runs the tests, compiles the app and keeps the output. We pushed: the run is green.",
        ),
        l(
          "Ama aşağıya bak: staging ve production hâlâ ilk commit'i çalıştırıyor. [[ci|CI]] burada biter. \"Bu kod sağlam ve build'i hazır\" der, ama yayına kendisi götürmez.",
          "But look below: staging and production still run the first commit. [[ci|CI]] stops here. It says \"this code is sound and its build is ready\", but it does not ship it itself.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/pipeline.yml", code: workflowYaml(CI_ONLY) }] },
    },
    {
      short: l("Delivery", "Delivery"),
      tag: "how",
      predict: {
        question: l("Pipeline'a staging ve production job'larını ekledik. Production'da onay şartı var. Push'tan sonra ne olur?", "We added staging and production jobs to the pipeline. Production requires an approval. What happens after a push?"),
        options: [
          l("Build ikisine birden hemen gider", "The build goes to both right away"),
          l("Staging güncellenir, production bir insanın onayını bekler", "Staging updates, production waits for a person's approval"),
          l("Hiçbir ortam güncellenmez", "No environment updates"),
        ],
        answer: 1,
        why: l(
          "Production job'ı `environment: production` diyor ve o [[environment]] onaylayıcı istiyor. Run orada durur ve \"onay bekliyor\" der.",
          "The production job says `environment: production`, and that [[environment]] requires a reviewer. The run stops there and says \"waiting\".",
        ),
      },
      title: l("Continuous Delivery: her yeşil build yayına hazır", "Continuous Delivery: every green build is ready to ship"),
      body: [
        l(
          "Build yeşil bitti, `staging` job'ı build'i staging'e koydu. `production` job'ı ise sarı: onay bekliyor. Run bitmedi, durakladı.",
          "The build went green and the `staging` job put it on staging. The `production` job is yellow: waiting for approval. The run is not over, it is paused.",
        ),
        l(
          "Continuous Delivery'nin sözü şu: main'deki her yeşil commit **yayına hazırdır** ve yayına çıkarmak tek bir tıklamadır. Ne zaman çıkacağına bir insan karar verir.",
          "Continuous Delivery's promise: every green commit on main is **ready to ship**, and shipping it is a single click. A person decides when.",
        ),
      ],
      practice: {
        intro: l("Onay şartını GitHub arayüzünden koyarsın: Settings → Environments → production → Required reviewers.", "You set the approval rule in GitHub's UI: Settings → Environments → production → Required reviewers."),
        commands: [{ cmd: "gh api -X PUT repos/OWNER/REPO/environments/production", note: l("`production` ortamını oluşturur; onaylayıcıları arayüzden ekle.", "Creates the `production` environment; add reviewers in the UI.") }],
        snippets: [{ label: ".github/workflows/pipeline.yml", code: workflowYaml(PIPELINE) }],
      },
    },
    {
      short: l("Onay", "Approve"),
      tag: "how",
      title: l("Bir insan onaylar, pipeline devam eder", "A person approves, the pipeline goes on"),
      body: [
        l(
          "Ekipten biri run sayfasında \"Review deployments\" düğmesine bastı ve production'ı onayladı. Bekleyen job aynı build'i aldı ve production'a koydu. Artık iki ortam da aynı commit'i çalıştırıyor.",
          "Someone on the team pressed \"Review deployments\" on the run page and approved production. The waiting job took the same build and put it on production. Both environments now run the same commit.",
        ),
        l(
          "Dikkat: production'a giden build, staging'de denenenle **aynı** build. Onay sırasında hiçbir şey yeniden derlenmedi.",
          "Note: the build that went to production is the **same** one tried on staging. Nothing was rebuilt at approval time.",
        ),
      ],
      practice: { commands: [{ cmd: "gh run list --workflow Pipeline --status waiting", note: l("Onay bekleyen run'lar.", "Runs waiting for approval.") }] },
    },
    {
      short: l("Deployment", "Deployment"),
      tag: "how",
      predict: {
        question: l("Production'daki onay şartını kaldırdık. Bir sonraki push nereye kadar gider?", "We dropped production's approval rule. How far does the next push go?"),
        options: [l("Sadece build'e", "Only to the build"), l("Staging'e kadar", "Up to staging"), l("Production'a kadar, kimse dokunmadan", "All the way to production, untouched by anyone")],
        answer: 2,
        why: l(
          "Pipeline'ı durduran tek şey onaydı. O kalkınca yeşil bir commit hiç beklemeden production'a ulaşır.",
          "The approval was the only thing that stopped the pipeline. Without it a green commit reaches production with no wait.",
        ),
      },
      title: l("Continuous Deployment: onay da yok", "Continuous Deployment: no approval either"),
      body: [
        l(
          "Yeni commit push'landı ve run tek seferde production'a kadar gitti. Kimse düğmeye basmadı. İşte Continuous Deployment: main'e giren her yeşil commit dakikalar içinde kullanıcılara ulaşır.",
          "The new commit was pushed and the run went all the way to production in one go. Nobody pressed a button. That is Continuous Deployment: every green commit on main reaches users within minutes.",
        ),
        l(
          "Workflow dosyası **hiç değişmedi**. Delivery ile Deployment arasındaki tek fark production ortamındaki o onay şartı.",
          "The workflow file **did not change at all**. The only difference between Delivery and Deployment is that approval rule on the production environment.",
        ),
      ],
    },
    {
      short: l("Kırmızı commit", "Red commit"),
      tag: "experiment",
      predict: {
        question: l("Onay yokken testleri kıran bir commit push'landı. Production'a ne olur?", "With no approval, a commit that breaks the tests is pushed. What happens to production?"),
        options: [l("Hatalı sürüm production'a gider", "The broken version goes to production"), l("Hiçbir şey: build kırılınca sonraki job'lar atlanır", "Nothing: when the build fails, the later jobs are skipped"), l("Production staging'e geri döner", "Production falls back to staging")],
        answer: 1,
        why: l(
          "`staging` job'ı `build`'e, `production` job'ı hem `build`'e hem `staging`'e bağlı (`needs`). Zincirin ilk halkası kırılınca gerisi hiç başlamaz.",
          "`staging` needs `build`; `production` needs both `build` and `staging`. When the first link breaks, the rest never starts.",
        ),
      },
      title: l("Onay yoksa kapıyı testler tutar", "Without an approval, the tests hold the gate"),
      body: [
        l(
          "`npm test` kırıldı, `build` kırmızı; `staging` ve `production` atlandı. İki ortam da bir önceki commit'te kaldı.",
          "`npm test` failed, `build` is red; `staging` and `production` were skipped. Both environments stayed on the previous commit.",
        ),
        l(
          "Continuous Deployment'ta production'ı koruyan tek şey testlerin. Testlerin yakalamadığı bir hata doğrudan kullanıcılara gider. Bu yüzden bu yolu seçen ekipler teste ve deploy sonrası kontrollere çok yatırım yapar.",
          "In Continuous Deployment the tests are the only thing guarding production. A bug they miss goes straight to users. That is why teams on this path invest heavily in tests and post-deploy checks.",
        ),
      ],
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "how",
      title: l("Hangisini seçmeli?", "Which one should you pick?"),
      body: [
        l(
          "Düzeltme geldi ve doğrudan production'a gitti. Hangisi doğru? Cevap ekibe göre değişir.",
          "The fix arrived and went straight to production. Which approach is right? It depends on the team.",
        ),
        l(
          "**Delivery** iyi bir başlangıçtır: yayın zamanını sen seçersin, bir insan son bir kez bakar, düzenleyici kurallar onay isteyebilir. **Deployment** testler ve izleme güçlüyse çok hızlıdır: küçük değişiklikler sık çıkar, her biri az risk taşır. İkisinde de [[ci|CI]] olmazsa olmazdır.",
          "**Delivery** is a good start: you pick when to release, a person takes one last look, and regulations may require an approval. **Deployment** is very fast when tests and monitoring are strong: small changes go out often and each carries little risk. Both need [[ci|CI]] underneath.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçekte", "In reality"),
      body: [
        l(
          "Environment'lar GitHub'da bundan fazlasını yapar: her birinin kendi secret'ları olabilir, onaydan önce bir bekleme süresi konabilir, ya da sadece `main`'den deploy'a izin verilebilir. Onay da bir kişiye değil bir takıma verilebilir.",
          "GitHub environments do more than this: each can have its own secrets, a wait timer before approval, or a rule that only `main` may deploy. Approval can also go to a team instead of one person.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede run'lar anında biter, onay bekleyen bir run sonsuza kadar bekler ve deploy tek bir `deploy.sh` komutu. Gerçekte GitHub onay bekleyen bir job'ı 30 gün sonra iptal eder, deploy da sunucuna ya da bulut sağlayıcına göre değişir. \"Delivery\" ve \"Deployment\" kelimeleri de her ekipte aynı anlamda kullanılmaz; bu ders en yaygın tanımı kullanıyor.",
            "On this stage runs finish instantly, a waiting run waits forever, and the deploy is a single `deploy.sh`. In reality GitHub cancels a job waiting for approval after 30 days, and the deploy depends on your server or cloud. Teams also do not all use \"Delivery\" and \"Deployment\" the same way; this lesson uses the most common definitions.",
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
          "Pipeline hazır: build, staging, production. Production'da onay şartı açık; iki ortam da ilk commit'i çalıştırıyor. Commit push'layabilir, bekleyen deploy'u onaylayabilir ya da onay şartını açıp kapatabilirsin.",
          "The pipeline is ready: build, staging, production. Production requires an approval; both environments run the first commit. You can push commits, approve a waiting deploy, or turn the approval rule on and off.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("CI kodu kontrol eder ve build'i hazırlar; yayına kendisi götürmez.", "CI checks the code and prepares the build; it does not ship it."),
    l("Continuous Delivery: her yeşil commit yayına hazırdır, production'a çıkışı bir insan onaylar.", "Continuous Delivery: every green commit is ready to ship, a person approves production."),
    l("Continuous Deployment: onay yoktur, yeşil olan production'a kendiliğinden gider.", "Continuous Deployment: no approval, green goes to production by itself."),
    l("İkisinin farkı workflow'da değil, production environment'ındaki onay şartındadır.", "The difference is not in the workflow but in the approval rule on the production environment."),
    l("Onay olsun olmasın, kırmızı bir build hiçbir ortama gitmez; `needs` zinciri durur.", "With or without approval, a red build reaches no environment; the `needs` chain stops."),
    l("Onay yoksa production'ı testler korur; testler o kadar iyi olmalı.", "Without approval, the tests guard production; they must be that good."),
  ],
  quiz: [
    {
      question: l("CI'ın işi nerede biter?", "Where does CI's job end?"),
      options: [l("Production'a deploy edince", "When it deploys to production"), l("Kod kontrol edilip build hazır olunca", "Once the code is checked and the build is ready"), l("Kod review'u bitince", "When code review is done"), l("Staging'e deploy edince", "When it deploys to staging")],
      answer: 1,
      explain: l("CI kodu entegre eder ve kontrol eder; yayına taşımak CD'nin işidir.", "CI integrates and checks code; carrying it out is CD's job."),
      reviewStep: 0,
    },
    {
      question: l("Continuous Delivery ile Continuous Deployment arasındaki fark nedir?", "What is the difference between Continuous Delivery and Continuous Deployment?"),
      options: [
        l("Delivery test çalıştırmaz", "Delivery does not run tests"),
        l("Delivery'de production'a çıkışı bir insan onaylar, Deployment'ta onay yoktur", "In Delivery a person approves production; in Deployment there is no approval"),
        l("Deployment staging kullanmaz", "Deployment uses no staging"),
        l("Deployment sadece gece çalışır", "Deployment only runs at night"),
      ],
      answer: 1,
      explain: l("İkisi de her yeşil commit'i yayına hazırlar; fark son adımdaki onaydır.", "Both make every green commit ready to ship; the difference is the approval at the last step."),
      reviewStep: 3,
    },
    {
      question: l("Bir job'ın production onayı beklemesini ne sağlar?", "What makes a job wait for a production approval?"),
      options: [
        l("Job'a `sleep` eklemek", "Adding a `sleep` to the job"),
        l("Job'da `environment: production` ve o ortamda onaylayıcı tanımlı olması", "`environment: production` on the job, with reviewers set on that environment"),
        l("Workflow'u elle çalıştırmak", "Running the workflow by hand"),
        l("`needs: approval` yazmak", "Writing `needs: approval`"),
      ],
      answer: 1,
      explain: l("Onay kuralı environment'ın ayarıdır; job ona `environment:` ile bağlanır.", "The approval rule is a setting of the environment; the job ties to it with `environment:`."),
      reviewStep: 1,
    },
    {
      question: l("Onay şartı yokken testleri kıran bir commit push'lanırsa ne olur?", "With no approval rule, what happens when a commit that breaks the tests is pushed?"),
      options: [l("Production'a gider", "It goes to production"), l("Sadece staging'e gider", "It goes to staging only"), l("Hiçbir ortama gitmez", "It reaches no environment"), l("Pipeline onay ister", "The pipeline asks for approval")],
      answer: 2,
      explain: l("Build kırılınca `needs` ile bağlı staging ve production job'ları atlanır.", "When the build fails, the staging and production jobs that `need` it are skipped."),
      reviewStep: 4,
    },
  ],
};
