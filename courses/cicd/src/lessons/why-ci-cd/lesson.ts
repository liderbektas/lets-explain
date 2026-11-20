import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { CI, CICD, scene } from "./Scene";

export const whyCiCd: Lesson = {
  slug: "why-ci-cd",
  title: l("CI/CD neden var?", "Why CI/CD?"),
  summary: l(
    "Kimse kontrol etmezse hatalı bir commit main'de sessizce bekler ve sonunda başka birinin commit'inde ortaya çıkar. CI her push'u anında kontrol eder; CD yeşil olanı kendiliğinden yayına taşır.",
    "If nobody checks, a broken commit waits quietly on main and finally shows up in someone else's commit. CI checks every push right away; CD carries what is green out by itself.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kontrolsüz bir main'de hatanın neden geç fark edildiğini görmek", "See why a bug on an unchecked main is found late"), step: 1 },
    { text: l("CI'ın her push'u kendi commit'inde kontrol ettiğini görmek", "See CI check every push on its own commit"), step: 2 },
    { text: l("\"Sık ve küçük entegre et\" fikrinin neden işe yaradığını anlamak", "Understand why \"integrate small and often\" works"), step: 3 },
    { text: l("CD'nin yeşil commit'i staging'e kendiliğinden taşıdığını görmek", "See CD carry a green commit to staging by itself"), step: 4 },
  ],
  steps: [
    {
      short: l("Kontrol yok", "No checks"),
      tag: "problem",
      title: l("Herkes main'e push'luyor, kimse kontrol etmiyor", "Everyone pushes to main, nobody checks"),
      body: [
        l(
          "Küçük bir ekip düşün. Ada giriş sayfasını ekledi, Bora sepet toplamına KDV ekledi; ikisi de kendi bilgisayarında denedi ve main'e push'ladı. Reponda hiç [[workflow]] yok, yani push'lar hiçbir şey başlatmıyor.",
          "Picture a small team. Ada added the login page, Bora added VAT to the cart total; both tried it on their own laptops and pushed to main. The repo has no [[workflow]], so pushes start nothing.",
        ),
        l(
          "Soldaki listeye bak: iki commit de gri, \"kontrol yok\". Bora'nın commit'inde testleri kıran bir hata var, ama listede iyi bir commit'ten farkı yok. Bora testleri çalıştırmayı unuttu; \"benim makinemde çalışıyordu\".",
          "Look at the list on the left: both commits are grey, \"not checked\". Bora's commit has a bug that breaks the tests, but it looks no different from a good commit. Bora forgot to run the tests; \"it worked on my machine\".",
        ),
      ],
    },
    {
      short: l("Geç fark", "Found late"),
      tag: "problem",
      predict: {
        question: l("Bora'nın hatası main'de duruyor. Ne zaman fark edilir?", "Bora's bug is sitting on main. When does someone notice?"),
        options: [
          l("Hemen: GitHub hatalı commit'leri reddeder", "At once: GitHub rejects broken commits"),
          l("Biri testleri çalıştırana ya da bir kullanıcı şikayet edene kadar fark edilmez", "Not until someone runs the tests or a user complains"),
          l("Bora'nın bir sonraki push'unda", "On Bora's next push"),
        ],
        answer: 1,
        why: l(
          "Git, kodun çalışıp çalışmadığına bakmaz; sadece değişiklikleri saklar. Kontrolü otomatik yapan bir şey yoksa hata ancak biri ona çarpınca bulunur.",
          "Git does not check whether code works; it only stores changes. Without something that checks automatically, a bug is only found when someone runs into it.",
        ),
      },
      title: l("Hata, başkasının commit'inde ortaya çıkıyor", "The bug shows up in someone else's commit"),
      body: [
        l(
          "Can footer'ı güncelledi, sonra ekip sonunda bir CI workflow'u ekledi. Bir sonraki push'ta, README'de yazım hatası düzelten zararsız bir commit'te, run kırmızı yandı: `npm test` kırıldı.",
          "Can updated the footer, then the team finally added a CI workflow. On the next push, a harmless commit fixing a typo in the README, the run went red: `npm test` failed.",
        ),
        l(
          "Şimdi ekip dedektif oluyor: hata hangi commit'te girdi? Arada üç commit var ve her biri başka birinin. Commit'ler biriktikçe bu arama zorlaşır; buna **integration hell** denir.",
          "Now the team turns detective: which commit brought the bug in? There are three commits in between, each by someone else. The more commits pile up, the harder that search gets; people call this **integration hell**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Gerçek projelerde bunun için `git bisect` vardır: commit'leri ikiye bölerek hatalı olanı bulur. İşe yarar, ama hatayı en baştan yakalamak her zaman daha ucuzdur.",
            "Real projects have `git bisect` for this: it halves the commits until it finds the bad one. It works, but catching the bug at the start is always cheaper.",
          ),
        },
      ],
    },
    {
      short: l("CI ile", "With CI"),
      tag: "idea",
      predict: {
        question: l("CI artık açık. Can, lint hatası olan bir commit push'luyor. Ne olur?", "CI is on now. Can pushes a commit with a lint error. What happens?"),
        options: [
          l("Yine bir sonraki commit'te fark edilir", "It is noticed on the next commit again"),
          l("Birkaç dakika içinde, tam o commit'in run'ı kırmızı olur", "Within minutes, that exact commit's run turns red"),
          l("Push reddedilir, commit main'e girmez", "The push is rejected and never reaches main"),
        ],
        answer: 1,
        why: l(
          "[[ci|CI]] her push'u ayrı ayrı kontrol eder. Kırmızı run, hatayı getiren commit'in yanında durur; kimin, neyi, ne zaman bozduğu bellidir. Push'u engellemek ise branch protection'ın işi, onu ileride göreceğiz.",
          "[[ci|CI]] checks every push separately. The red run sits right next to the commit that brought the bug; who broke what, and when, is clear. Blocking the push is branch protection's job; we will get to it later.",
        ),
      },
      title: l("Her push kendi kontrolünü alır", "Every push gets its own check"),
      body: [
        l(
          "Önce Bora'nın hatasını düzelten commit geldi: run yeşil. Sonra Can'ın \"hızlı refactor\" commit'i: 2 dakikadan kısa sürede kendi run'ı kırmızı yandı, `npm run lint` kullanılmayan bir değişkeni yakaladı.",
          "First came the commit fixing Bora's bug: the run is green. Then Can's \"quick refactor\": in under two minutes its own run went red; `npm run lint` caught an unused variable.",
        ),
        l(
          "Can'ın aklında değişiklik hâlâ taze. Nereye bakacağını biliyor, düzeltmesi bir dakika sürer. Hata ne kadar erken yakalanırsa o kadar ucuzdur.",
          "The change is still fresh in Can's mind. Can knows where to look; the fix takes a minute. The earlier a bug is caught, the cheaper it is.",
        ),
      ],
      practice: {
        intro: l("Projendeki en küçük CI dosyası bu kadar:", "This is all the smallest CI file in your project needs:"),
        commands: [{ cmd: "gh run list --limit 5", note: l("Son run'ları ve hangi commit'te kırmızı yandıklarını gör.", "See the latest runs and which commit each went red on.") }],
        snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(CI) }],
      },
    },
    {
      short: l("Sık ve küçük", "Small and often"),
      tag: "how",
      title: l("Continuous Integration: sık ve küçük", "Continuous Integration: small and often"),
      body: [
        l(
          "Can düzeltmeyi push'ladı ve main yine yeşil. CI'ın \"continuous\" kısmı tam da bu: herkes değişikliğini **sık sık** ve **küçük parçalar** halinde main'e katar, her katılım otomatik kontrol edilir.",
          "Can pushed the fix and main is green again. This is the \"continuous\" in CI: everyone merges their changes into main **often** and in **small pieces**, and every merge is checked automatically.",
        ),
        l(
          "Bir kural daha var: main kırmızıysa önce onu düzelt. Kırmızı main'in üstüne yeni commit eklemek, bir önceki adımdaki dedektiflik işini geri getirir.",
          "One more rule: if main is red, fix it first. Stacking new commits on a red main brings back the detective work from the step before.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bir haftalık bulaşığı tek seferde yıkamak yerine her yemekten sonra iki tabak yıkamak gibi: toplam iş aynı, ama hiçbir zaman büyüyüp seni bunaltmaz.",
            "Like washing two plates after every meal instead of a week of dishes at once: the total work is the same, but it never grows big enough to swamp you.",
          ),
        },
      ],
    },
    {
      short: l("CD", "CD"),
      tag: "how",
      title: l("CD: yeşil olan kendiliğinden yayına gider", "CD: what is green ships by itself"),
      body: [
        l(
          "Şimdiye kadar staging'i biri elle güncelliyordu: sunucuya bağlan, dosyaları kopyala, servisi yeniden başlat. Bir adım unutulunca staging bozulur ve kimse nedenini bilmez.",
          "Until now someone updated staging by hand: connect to the server, copy files, restart the service. Forget one step and staging breaks, and nobody knows why.",
        ),
        l(
          "Workflow'a bir `deploy` job'ı ekledik: `ci` job'ı yeşil biterse build'i staging'e kendisi koyar. Arama kutusu commit'i push'landı; run yeşil bitti ve staging artık o commit'i çalıştırıyor. İşte [[cd|CD]]: yayına çıkış da otomatik ve her seferinde aynı.",
          "We added a `deploy` job to the workflow: if the `ci` job ends green, it puts the build on staging itself. The search box commit was pushed; the run went green and staging now runs that commit. That is [[cd|CD]]: shipping is automatic too, and the same every time.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(CICD), note: l("`deploy.sh` senin sunucuna göre değişir; `DEPLOY_TOKEN` bir GitHub secret'ı. İkisini de ileride ayrı derslerde göreceğiz.", "`deploy.sh` depends on your server; `DEPLOY_TOKEN` is a GitHub secret. Both get their own lessons later.") }],
      },
    },
    {
      short: l("Kırmızı commit", "Red commit"),
      tag: "experiment",
      predict: {
        question: l("Testleri kıran bir commit push'landı. Staging'e ne olur?", "A commit that breaks the tests was pushed. What happens to staging?"),
        options: [
          l("Hatalı sürüm staging'e gider", "The broken version goes to staging"),
          l("Staging eski, çalışan sürümde kalır", "Staging stays on the old, working version"),
          l("Staging kapanır", "Staging shuts down"),
        ],
        answer: 1,
        why: l(
          "`deploy` job'ı `needs: ci` ile `ci`'a bağlı. `ci` kırılınca `deploy` atlanır; kırmızı bir commit hiçbir yere taşınmaz.",
          "The `deploy` job hangs on `ci` with `needs: ci`. When `ci` fails, `deploy` is skipped; a red commit is carried nowhere.",
        ),
      },
      title: l("Testler yayının kapısıdır", "The tests are the gate to release"),
      body: [
        l(
          "Run kırmızı: `npm test` kırıldı ve `deploy` job'ı \"atlandı\" yazıyor. Staging hâlâ bir önceki, çalışan commit'te. Kullanıcılar hiçbir şey fark etmedi.",
          "The run is red: `npm test` failed and the `deploy` job says \"skipped\". Staging is still on the previous, working commit. Users noticed nothing.",
        ),
        l(
          "Bu yüzden CD'yi CI olmadan kurmak tehlikelidir: kapıyı tutan şey testlerdir. Testler zayıfsa otomatik deploy, hataları da otomatik yayına taşır.",
          "That is why CD without CI is dangerous: the tests are what holds the gate. If the tests are weak, automatic deploys ship bugs automatically too.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek bir ekipte", "In a real team"),
      body: [
        l(
          "Gerçek ekipler genelde doğrudan main'e push'lamaz: her değişiklik bir branch'te yapılır, pull request açılır, CI orada çalışır ve kırmızıysa merge engellenir. Bunu \"PR check'leri\" dersinde kuracağız.",
          "Real teams usually do not push straight to main: each change lives on a branch, a pull request is opened, CI runs there, and a red check blocks the merge. We set that up in the \"PR checks\" lesson.",
        ),
        l(
          "CI aracı olarak burada GitHub Actions kullanıyoruz. GitLab CI, Jenkins, CircleCI ve diğerleri de aynı fikirle çalışır: bir olay gelir, bir makinede adımlar sırayla çalışır, sonuç commit'in yanına yazılır.",
          "We use GitHub Actions as the CI tool here. GitLab CI, Jenkins, CircleCI and the others work on the same idea: an event comes in, steps run in order on a machine, and the result is written next to the commit.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede run'lar push'landıkları anda biter ve her adımın süresi sabittir. Gerçekte bir run birkaç dakika sürer ve bu sürede yeni push'lar gelebilir. Staging'e deploy da burada tek bir `deploy.sh` komutu; gerçekte sunucuna, bulut sağlayıcına ya da Kubernetes'e göre değişir.",
            "On this stage runs finish the moment they are pushed, and every step takes a fixed time. In reality a run takes a few minutes and new pushes can arrive meanwhile. The staging deploy is a single `deploy.sh` here; in reality it depends on your server, cloud provider or Kubernetes.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "gh run list --branch main --status failure", note: l("main'de kırmızı yanan run'lar.", "Runs that went red on main.") },
          { cmd: "git bisect start HEAD 3f2a1c9", note: l("CI yokken giren bir hatayı commit'leri bölerek bul.", "Find a bug that slipped in without CI by halving the commits.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Repoda henüz workflow yok, staging ilk commit'i çalıştırıyor. Sadece CI ya da CI + deploy ekleyebilir, workflow'u silebilir, sağlam, hatalı ya da düzeltme commit'leri push'layabilirsin.",
          "The repo has no workflow yet, and staging runs the first commit. You can add CI only or CI + deploy, delete the workflow, and push good, broken or fixing commits.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Git kodun çalışıp çalışmadığına bakmaz; kontrol edilmeyen bir hata main'de sessizce bekler.", "Git does not check whether code works; an unchecked bug waits quietly on main."),
    l("Geç fark edilen bir hata başkasının commit'inde ortaya çıkar ve aramak zorlaşır.", "A bug found late shows up in someone else's commit, and hunting it gets hard."),
    l("CI her push'u kendi commit'inde, dakikalar içinde kontrol eder.", "CI checks every push on its own commit, within minutes."),
    l("Sık ve küçük entegre et; main kırmızıysa önce onu düzelt.", "Integrate small and often; if main is red, fix it first."),
    l("CD yeşil commit'i kendiliğinden yayına taşır; kırmızı commit hiçbir yere gitmez.", "CD carries a green commit out by itself; a red one goes nowhere."),
    l("CD'nin güveni testlerden gelir: testler zayıfsa hatalar da otomatik yayına çıkar.", "CD is only as safe as the tests: weak tests ship bugs automatically too."),
  ],
  quiz: [
    {
      question: l("CI olmayan bir repoda hatalı bir commit main'e push'lanınca ne olur?", "In a repo without CI, what happens when a broken commit is pushed to main?"),
      options: [l("Git push'u reddeder", "Git rejects the push"), l("Commit sessizce main'e girer, biri fark edene kadar kalır", "The commit quietly lands on main and stays until someone notices"), l("GitHub e-posta ile uyarır", "GitHub warns you by email"), l("Commit otomatik geri alınır", "The commit is reverted automatically")],
      answer: 1,
      explain: l("Git değişiklikleri saklar, kodu çalıştırmaz. Kontrolü otomatik yapan bir şey yoksa hatayı kimse görmez.", "Git stores changes; it does not run the code. Without an automatic check nobody sees the bug."),
      reviewStep: 0,
    },
    {
      question: l("CI'ın en büyük faydası nedir?", "What is CI's biggest benefit?"),
      options: [
        l("Kodu daha hızlı çalıştırması", "It makes the code run faster"),
        l("Hatayı, getiren commit'te ve hemen yakalaması", "It catches a bug right away, on the commit that brought it"),
        l("Test yazmayı gereksiz kılması", "It makes writing tests unnecessary"),
        l("Merge conflict'leri çözmesi", "It resolves merge conflicts"),
      ],
      answer: 1,
      explain: l("Her push kendi run'ını alır; kırmızı run hatayı getiren commit'in yanında durur ve değişiklik henüz tazeyken düzeltilir.", "Every push gets its own run; the red run sits next to the commit that brought the bug, and it is fixed while the change is still fresh."),
      reviewStep: 2,
    },
    {
      question: l("\"Continuous Integration\"daki \"continuous\" ne demek?", "What does \"continuous\" mean in \"Continuous Integration\"?"),
      options: [
        l("CI sunucusunun hiç kapanmaması", "The CI server never shuts down"),
        l("Değişiklikleri sık sık ve küçük parçalar halinde main'e katmak", "Merging changes into main often, in small pieces"),
        l("Testlerin sürekli tekrar çalışması", "Tests running over and over"),
        l("Her gün tek büyük merge yapmak", "One big merge every day"),
      ],
      answer: 1,
      explain: l("Küçük ve sık entegrasyon, her değişikliği kontrol edilebilir ve kolay geri alınabilir tutar.", "Small, frequent merges keep every change easy to check and easy to undo."),
      reviewStep: 3,
    },
    {
      question: l("CI + deploy workflow'unda testler kırılınca staging'e ne olur?", "In a CI + deploy workflow, what happens to staging when the tests fail?"),
      options: [l("Kırık sürüm deploy edilir", "The broken version is deployed"), l("Deploy job'ı atlanır, staging eski sürümde kalır", "The deploy job is skipped, staging stays on the old version"), l("Staging silinir", "Staging is deleted"), l("Deploy yine çalışır ama uyarı verir", "The deploy still runs but warns")],
      answer: 1,
      explain: l("`deploy` job'ı `needs: ci` ile bağlı; `ci` kırılınca hiç başlamaz.", "The `deploy` job hangs on `ci` via `needs: ci`; when `ci` fails it never starts."),
      reviewStep: 5,
    },
  ],
};
