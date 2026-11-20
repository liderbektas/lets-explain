import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const ignoreAndTags: Lesson = {
  slug: "ignore-and-tags",
  title: l(".gitignore ve tag", ".gitignore and tags"),
  summary: l(
    "Repo'ya girmemesi gereken dosyaları `.gitignore` ile dışarıda tut, yanlışlıkla girmiş olanı çıkar ve sürümleri tag ile işaretle.",
    "Keep files that do not belong in the repo out with `.gitignore`, take out one that slipped in, and mark releases with tags.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`.gitignore` kurallarının neyi dışarıda tuttuğunu görmek", "See what `.gitignore` rules keep out"), step: 1 },
    { text: l("Zaten takip edilen bir dosyanın neden yok sayılmadığını anlamak", "Understand why an already tracked file is not ignored"), step: 3 },
    { text: l("`git rm --cached` ile bir dosyayı repo'dan çıkarıp klasörde tutmak", "Remove a file from the repo but keep it in the folder with `git rm --cached`"), step: 4 },
    { text: l("Sırların (.env) neden asla commit'lenmemesi gerektiğini bilmek", "Know why secrets (.env) must never be committed"), step: 5 },
    { text: l("Sürümleri tag ile işaretlemek", "Mark releases with tags"), step: 6 },
  ],
  steps: [
    {
      short: l("Dağınık klasör", "Messy folder"),
      tag: "problem",
      title: l("Her dosya repo'ya ait değil", "Not every file belongs in the repo"),
      body: [
        l(
          "Gerçek bir proje klasöründe Git'e girmemesi gereken şeyler birikir. Burada üç tane var: programın yazdığı bir log dosyası (`app.log`), indirilen kütüphaneler (`node_modules/`) ve şifrelerin durduğu `.env`.",
          "A real project folder collects things that should never go into Git. Here there are three: a log the program wrote (`app.log`), downloaded libraries (`node_modules/`) and `.env`, where the secrets live.",
        ),
        l(
          "Üçü de \"yeni\" görünüyor. Biri `git add .` derse hepsi bir sonraki commit'e girer; şifreler de, binlerce kütüphane dosyası da.",
          "All three show as \"new\". If someone runs `git add .`, they all go into the next commit: the secrets, and thousands of library files.",
        ),
        l(
          "Bir hata da çoktan yapılmış: `debug.log` ilk commit'e girmiş. Ona birazdan döneceğiz.",
          "One mistake has already happened: `debug.log` made it into the first commit. We will come back to it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git status", note: l("Takip edilmeyen dosyaları \"Untracked files\" başlığı altında listeler.", "Lists files Git does not track under \"Untracked files\".") },
          { cmd: "git status --ignored", note: l("Yok sayılan dosyaları da gösterir.", "Also shows the ignored files.") },
        ],
      },
    },
    {
      short: l(".gitignore", ".gitignore"),
      tag: "idea",
      predict: {
        question: l(
          "Klasöre `*.log`, `node_modules/` ve `.env` satırları olan bir `.gitignore` dosyası koyacağız. `app.log`'a ne olacak?",
          "We will add a `.gitignore` file with the lines `*.log`, `node_modules/` and `.env`. What happens to `app.log`?",
        ),
        options: [
          l("Klasörden silinir", "It is deleted from the folder"),
          l("Klasörde kalır ama Git onu artık görmezden gelir", "It stays in the folder, but Git ignores it from now on"),
          l("Hemen commit'ten çıkarılır", "It is taken out of the commit right away"),
        ],
        answer: 1,
        why: l(
          "`.gitignore` hiçbir dosyayı silmez. Sadece Git'e \"bu dosyaları takip etmeyi önerme\" der: dosya yerinde durur, `git status`'ta görünmez olur.",
          "`.gitignore` never deletes anything. It only tells Git \"do not offer to track these\": the file stays where it is and disappears from `git status`.",
        ),
      },
      title: l(".gitignore: Git'e neyi görmezden geleceğini söyle", ".gitignore: tell Git what to ignore"),
      body: [
        l(
          "Proje kökündeki `.gitignore` dosyası satır satır kural listesidir. `*.log` sonu .log olan her dosyayı, `node_modules/` o klasörün içindeki her şeyi, `.env` de o adlı dosyayı kapsar.",
          "The `.gitignore` file at the project root is a list of rules, one per line. `*.log` covers every file ending in .log, `node_modules/` everything inside that folder, and `.env` the file with that name.",
        ),
        l(
          "Üç dosya da artık \"yok sayılıyor\" etiketiyle soluk görünüyor. Klasörde duruyorlar; Git sadece onlara bakmıyor.",
          "All three now look faded with an \"ignored\" label. They are still in the folder; Git just does not look at them.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek `.gitignore` daha fazlasını bilir: `!` ile istisna (`!onemli.log`), `**` ile her seviye klasör, `/` ile sadece kökteki dosya. Dil ve araçlara göre hazır şablonlar için github.com/github/gitignore iyi bir başlangıç.",
            "Real `.gitignore` knows more: `!` for exceptions (`!important.log`), `**` for any depth, a leading `/` for the root only. github.com/github/gitignore has ready-made templates per language and tool.",
          ),
        },
      ],
      practice: {
        intro: l("Proje kökünde `.gitignore` oluştur, örneğin:", "Create `.gitignore` at the project root, for example:"),
        commands: [
          { cmd: "printf '*.log\\nnode_modules/\\n.env\\n' > .gitignore" },
          { cmd: "git check-ignore -v app.log", note: l("Bir dosyanın hangi kural yüzünden yok sayıldığını söyler.", "Tells you which rule ignores a file.") },
        ],
      },
    },
    {
      short: l("add .", "add ."),
      tag: "experiment",
      predict: {
        question: l(
          "Şimdi `git add .` çalıştıracağız. Hangi dosyalar staging'e girer?",
          "Now we will run `git add .`. Which files go into staging?",
        ),
        options: [
          l("Klasördeki her şey", "Everything in the folder"),
          l("Sadece `.gitignore`", "Only `.gitignore`"),
          l("Hiçbir şey, çünkü yok sayılan dosya var", "Nothing, because some files are ignored"),
        ],
        answer: 1,
        why: l(
          "`add .` yeni ve değişen dosyaları alır ama yok sayılanları atlar. Değişen tek şey yeni `.gitignore` dosyası, o yüzden staging'e sadece o girer.",
          "`add .` takes new and changed files but skips ignored ones. The only change left is the new `.gitignore` itself, so that is all that gets staged.",
        ),
      },
      title: l("add . yok sayılanları atlar", "add . skips what is ignored"),
      body: [
        l(
          "`git add .` sadece `.gitignore`'u staging'e koydu; ardından commit attık. Şifreler ve kütüphaneler repo'nun dışında kaldı.",
          "`git add .` staged only `.gitignore`, and then we committed. The secrets and libraries stayed out of the repo.",
        ),
        l(
          "`.gitignore` de commit'lenmeli. Böylece repo'yu klonlayan herkes aynı kurallarla başlar ve kimse yanlışlıkla `node_modules`'ü göndermez.",
          "`.gitignore` itself should be committed. That way everyone who clones the repo starts with the same rules, and nobody pushes `node_modules` by accident.",
        ),
        l(
          "Yok sayılan bir dosyayı adıyla eklemeye kalkarsan (`git add app.log`) Git reddeder. Gerçekten istiyorsan `-f` gerekir; neredeyse hiçbir zaman istemezsin.",
          "If you try to add an ignored file by name (`git add app.log`), Git refuses. You would need `-f`, and you almost never want that.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add .gitignore" },
          { cmd: 'git commit -m "Add .gitignore"' },
        ],
      },
    },
    {
      short: l("Takip edilen", "Already tracked"),
      tag: "problem",
      predict: {
        question: l(
          "`debug.log` artık `*.log` kuralına uyuyor ama ilk commit'te zaten vardı. Dosyayı değiştirince `git status` ne der?",
          "`debug.log` now matches `*.log`, but it was already in the first commit. When we change it, what does `git status` say?",
        ),
        options: [
          l("Hiçbir şey, dosya yok sayılıyor", "Nothing: the file is ignored"),
          l("\"modified\": dosya değişti", "\"modified\": the file changed"),
          l("Dosya otomatik olarak repo'dan çıkar", "The file leaves the repo on its own"),
        ],
        answer: 1,
        why: l(
          "`.gitignore` sadece **takip edilmeyen** dosyalar için geçerli. Bir dosya bir kez commit'lendiyse Git onu takip etmeye devam eder, kurala uysa bile.",
          "`.gitignore` only applies to **untracked** files. Once a file has been committed, Git keeps tracking it, even if it matches a rule.",
        ),
      },
      title: l(".gitignore takip edileni durdurmaz", ".gitignore does not stop a tracked file"),
      body: [
        l(
          "`debug.log`'u değiştirdik ve klasörde \"değişti\" olarak görünüyor. `*.log` kuralı ona işlemiyor, çünkü Git onu zaten takip ediyor.",
          "We changed `debug.log` and it shows as \"changed\" in the folder. The `*.log` rule does not apply to it, because Git already tracks it.",
        ),
        l(
          "Bu çok sık yapılan bir hata: önce dosya commit'lenir, `.gitignore`'a sonradan eklenir ve \"neden hâlâ görünüyor?\" diye sorulur.",
          "This is a very common mistake: the file gets committed first, added to `.gitignore` later, and then someone asks \"why is it still showing up?\".",
        ),
      ],
      practice: {
        commands: [{ cmd: "git ls-files", note: l("Git'in takip ettiği bütün dosyaları listeler.", "Lists every file Git tracks.") }],
      },
    },
    {
      short: l("rm --cached", "rm --cached"),
      tag: "how",
      predict: {
        question: l(
          "`git rm --cached debug.log` çalıştırıp commit atacağız. Klasördeki `debug.log`'a ne olur?",
          "We will run `git rm --cached debug.log` and commit. What happens to `debug.log` in the folder?",
        ),
        options: [
          l("Silinir", "It is deleted"),
          l("Kalır; artık takip edilmez ve yok sayılır", "It stays; it is no longer tracked and is now ignored"),
          l("Bir önceki haline döner", "It goes back to its previous version"),
        ],
        answer: 1,
        why: l(
          "`--cached` \"sadece staging'den çıkar\" demek. Dosya klasörde kalır, bir sonraki commit'te repo'dan silinmiş olur ve artık takip edilmediği için `*.log` kuralı ona da işler.",
          "`--cached` means \"remove from staging only\". The file stays in the folder, is removed from the repo in the next commit, and since it is no longer tracked, the `*.log` rule now applies to it.",
        ),
      },
      title: l("git rm --cached: unut ama silme", "git rm --cached: forget it, do not delete it"),
      body: [
        l(
          "`git rm --cached debug.log` dosyayı staging'den çıkardı, commit de onu repo'dan sildi. Klasördeki dosya yerinde ve artık \"yok sayılıyor\".",
          "`git rm --cached debug.log` took the file out of staging, and the commit removed it from the repo. The file is still in the folder, and now it is \"ignored\".",
        ),
        l(
          "`--cached` olmadan `git rm` dosyayı klasörden de siler. Log dosyası için sorun değil ama bir config dosyasında işini kaybettirebilir.",
          "Without `--cached`, `git rm` deletes the file from the folder too. That is fine for a log, but for a config file it could cost you work.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Dosya eski commit'lerde durmaya devam eder: `git rm --cached` sadece bundan sonrasını değiştirir. Geçmişteki kopyalar `git log -- debug.log` ile hâlâ bulunabilir.",
            "The file stays in old commits: `git rm --cached` only changes what comes next. The old copies can still be found with `git log -- debug.log`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git rm --cached debug.log", note: l("Repo'dan çıkarır, klasörde bırakır.", "Removes it from the repo, keeps it in the folder.") },
          { cmd: 'git commit -m "Stop tracking debug.log"' },
          { cmd: "git rm -r --cached node_modules", note: l("Klasör için `-r`.", "`-r` for a folder.") },
        ],
      },
    },
    {
      short: l("Sırlar", "Secrets"),
      tag: "reality",
      title: l("Şifreler asla commit'lenmez", "Secrets are never committed"),
      body: [
        l(
          "`.env` gibi dosyalarda API anahtarları, veritabanı şifreleri durur. Bunlar bir kez push edilirse, sonradan silsen bile geçmişte durur: repo'yu klonlayan herkes eski commit'ten okuyabilir.",
          "Files like `.env` hold API keys and database passwords. Once they are pushed, deleting them later does not help: they stay in history, and anyone who clones the repo can read them from an old commit.",
        ),
        l(
          "Yanlışlıkla bir anahtar push ettiysen ilk iş **anahtarı iptal edip yenisini almak** (rotate). Geçmişi temizlemek ikinci iş ve tek başına yetmez; o anahtar çoktan kopyalanmış olabilir.",
          "If you pushed a key by mistake, the first job is to **revoke it and get a new one** (rotate). Cleaning history comes second and is not enough on its own: the key may already have been copied.",
        ),
        l(
          "İyi alışkanlık: repo'ya `.env` yerine boş değerli bir `.env.example` koy. Herkes hangi ayarların gerektiğini görür, kimse gerçek değeri görmez.",
          "A good habit: commit a `.env.example` with empty values instead of `.env`. Everyone sees which settings are needed, and nobody sees the real values.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "GitHub gibi servisler push edilen anahtarları tarar ve bazılarını otomatik iptal ettirir. Bu bir güvenlik ağı, plan değil.",
            "Services like GitHub scan pushed keys and get some of them revoked automatically. That is a safety net, not a plan.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "echo .env >> .gitignore", note: l("İlk commit'ten önce yap.", "Do this before the first commit.") },
          { cmd: "cp .env .env.example", note: l("Sonra .env.example'daki değerleri boşalt ve onu commit'le.", "Then blank the values in .env.example and commit that.") },
          { cmd: "git log --all -- .env", note: l("`.env` hiç commit'lenmiş mi, kontrol et.", "Check whether `.env` was ever committed.") },
        ],
      },
    },
    {
      short: l("Tag", "Tag"),
      tag: "how",
      title: l("Tag: bir commit'e kalıcı isim", "A tag: a permanent name for a commit"),
      body: [
        l(
          "Bu sürümü kullanıcılara verdik ve ona `v1.0` diyoruz. `git tag v1.0` şu anki commit'e bu adı yapıştırdı: grafikte sarı etiket.",
          "We shipped this version to users and call it `v1.0`. `git tag v1.0` stuck that name on the current commit: the yellow label in the graph.",
        ),
        l(
          "Artık \"v1.0'daki kod\" demek için commit kimliğini hatırlamak gerekmez. `git checkout v1.0` ile o sürüme dönebilir, `git diff v1.0` ile o günden beri neyin değiştiğini görebilirsin.",
          "Now \"the code in v1.0\" does not need a commit id. `git checkout v1.0` takes you back to that release, and `git diff v1.0` shows what changed since.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git tag v1.0", note: l("Şu anki commit'e hafif (lightweight) tag koyar.", "Puts a lightweight tag on the current commit.") },
          { cmd: "git tag", note: l("Bütün tag'leri listeler.", "Lists every tag.") },
        ],
      },
    },
    {
      short: l("Tag kalır", "Tags stay"),
      tag: "experiment",
      predict: {
        question: l(
          "`v1.0` tag'ini koyduk. Şimdi yeni bir commit atacağız. Tag nerede olur?",
          "We placed the tag `v1.0`. Now we will make a new commit. Where is the tag afterwards?",
        ),
        options: [
          l("Branch gibi yeni commit'e kayar", "It moves to the new commit, like a branch"),
          l("Eski commit'te kalır", "It stays on the old commit"),
          l("Silinir", "It is deleted"),
        ],
        answer: 1,
        why: l(
          "Branch ile tag'in farkı tam bu: branch her commit'te ilerler, tag hiç kıpırdamaz. Bu yüzden sürümleri tag ile işaretleriz.",
          "That is exactly the difference between a branch and a tag: a branch moves with every commit, a tag never moves. That is why releases are marked with tags.",
        ),
      },
      title: l("Branch ilerler, tag yerinde durur", "Branches move, tags stay put"),
      body: [
        l(
          "Yeni commit attık: `main` ileri kaydı, `v1.0` eski commit'te kaldı. Bir yıl sonra bile `v1.0` aynı kodu gösterecek.",
          "We made a new commit: `main` moved forward and `v1.0` stayed on the old commit. A year from now, `v1.0` will still point at the same code.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline --decorate", note: l("Tag ve branch'leri commit'lerin yanında gösterir.", "Shows tags and branches next to commits.") },
          { cmd: "git diff v1.0", note: l("v1.0'dan beri neler değişti?", "What changed since v1.0?") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Annotated tag ve push --tags", "Annotated tags and push --tags"),
      body: [
        l(
          "Burada kullandığımız tag'ler \"lightweight\": sadece bir isim. Sürümler için genelde **annotated** tag tercih edilir: `git tag -a v1.0 -m \"İlk sürüm\"`. Kim, ne zaman, neden koydu bilgisi de saklanır ve imzalanabilir.",
          "The tags here are \"lightweight\": just a name. Releases usually get **annotated** tags: `git tag -a v1.0 -m \"First release\"`. They also store who placed them, when and why, and can be signed.",
        ),
        l(
          "Tag'ler `git push` ile kendiliğinden gitmez. Tek bir tag için `git push origin v1.0`, hepsi için `git push --tags` gerekir. GitHub'daki \"Releases\" sayfası bu tag'lerden oluşur.",
          "Tags do not go up with a plain `git push`. Push one with `git push origin v1.0`, or all of them with `git push --tags`. GitHub's \"Releases\" page is built from these tags.",
        ),
        l(
          "Sürüm adı için yaygın kural semver: `MAJOR.MINOR.PATCH`. Uyumu bozan değişiklik major'ı, yeni özellik minor'ı, hata düzeltmesi patch'i artırır.",
          "A common naming rule is semver: `MAJOR.MINOR.PATCH`. Breaking changes bump major, new features bump minor, and bug fixes bump patch.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git tag -a v1.1 -m "Giriş ekranı"', note: l("Mesajlı (annotated) tag.", "An annotated tag with a message.") },
          { cmd: "git push origin v1.1", note: l("Tek bir tag'i gönderir.", "Pushes one tag.") },
          { cmd: "git push --tags", note: l("Bütün tag'leri gönderir.", "Pushes all tags.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **5 senaryo** var: bir gizli anahtar, `node_modules`, yanlışlıkla commit'lenmiş bir log ve iki sürüm etiketi. Komutları terminale **kendin yaz**.",
          "Your turn. Below are **5 scenarios** from real work: a secret key, `node_modules`, a log committed by mistake, and two release tags. **Type the commands yourself** in the terminal.",
        ),
        l(
          "`.gitignore`'u `echo \"kural\" > .gitignore` ile yazabilir, `>>` ile satır ekleyebilir ya da `nano .gitignore` ile açabilirsin. `git status` neyin yok sayıldığını, `git log --oneline` tag'leri gösterir. Repo panelindeki sarı etiketler de tag'ler.",
          "You can write `.gitignore` with `echo \"rule\" > .gitignore`, add lines with `>>`, or open it with `nano .gitignore`. `git status` shows what is ignored, `git log --oneline` shows the tags. The yellow labels in the repo panel are tags too.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "`.gitignore` takip edilmeyen dosyaları Git'in gözünden saklar; dosyaları silmez. `.gitignore`'un kendisi commit'lenir.",
      "`.gitignore` hides untracked files from Git; it never deletes them. `.gitignore` itself gets committed.",
    ),
    l("`git add .` yok sayılan dosyaları atlar; adıyla eklemeye çalışmak reddedilir.", "`git add .` skips ignored files; adding one by name is refused."),
    l(
      "Zaten takip edilen dosyayı `.gitignore` durdurmaz. `git rm --cached` ile repo'dan çıkarıp klasörde tutarsın.",
      "`.gitignore` does not stop a file that is already tracked. `git rm --cached` takes it out of the repo and keeps it in the folder.",
    ),
    l(
      "Sırlar asla commit'lenmez. Yanlışlıkla push edildiyse önce anahtarı iptal et; geçmişte durmaya devam eder.",
      "Secrets are never committed. If one was pushed, revoke the key first: it stays in history.",
    ),
    l(
      "Tag bir commit'e kalıcı isim verir ve branch gibi ilerlemez. Sürümler için `git tag -a` ve `git push --tags`.",
      "A tag gives a commit a permanent name and does not move like a branch. For releases: `git tag -a` and `git push --tags`.",
    ),
  ],
  quiz: [
    {
      question: l(
        "`config.json` zaten commit'lenmiş. `.gitignore`'a ekledin ama `git status` hâlâ değişikliklerini gösteriyor. Ne yapmalısın?",
        "`config.json` is already committed. You added it to `.gitignore`, but `git status` still shows its changes. What should you do?",
      ),
      options: [
        l("`.gitignore`'u tekrar kaydet", "Save `.gitignore` again"),
        l("`git rm --cached config.json` ve commit", "`git rm --cached config.json` and commit"),
        l("`git rm config.json`", "`git rm config.json`"),
        l("Hiçbir şey, birazdan kendiliğinden geçer", "Nothing, it will sort itself out"),
      ],
      answer: 1,
      explain: l(
        "`.gitignore` takip edilen dosyalara işlemez. `--cached` dosyayı repo'dan çıkarır, klasörde bırakır; sonra kural işler.",
        "`.gitignore` does not apply to tracked files. `--cached` removes the file from the repo and keeps it in the folder; then the rule applies.",
      ),
      reviewStep: 4,
    },
    {
      question: l("`.gitignore` dosyası ne yapar?", "What does a `.gitignore` file do?"),
      options: [
        l("Listelenen dosyaları siler", "Deletes the listed files"),
        l("Takip edilmeyen dosyaları Git'in görmezden gelmesini sağlar", "Makes Git ignore untracked files that match"),
        l("Dosyaları şifreler", "Encrypts files"),
        l("Commit'lerden dosya siler", "Removes files from commits"),
      ],
      answer: 1,
      explain: l("Dosyalar yerinde kalır; Git sadece onları önermez ve `add .` onları almaz.", "The files stay; Git just stops offering them and `add .` skips them."),
      reviewStep: 1,
    },
    {
      question: l(
        "Bir API anahtarını içeren `.env`'i yanlışlıkla GitHub'a push ettin. İlk ne yapmalısın?",
        "You pushed a `.env` with an API key to GitHub by mistake. What is the first thing to do?",
      ),
      options: [
        l("Dosyayı silip yeni commit at", "Delete the file and commit"),
        l("Anahtarı iptal et ve yenisini oluştur", "Revoke the key and create a new one"),
        l("Repo'yu private yap", "Make the repo private"),
        l("`.gitignore`'a ekle", "Add it to `.gitignore`"),
      ],
      answer: 1,
      explain: l(
        "Anahtar geçmişte duruyor ve çoktan kopyalanmış olabilir. Önce onu geçersiz kıl; temizlik sonra gelir.",
        "The key is in history and may already have been copied. Make it useless first; the cleanup comes after.",
      ),
      reviewStep: 5,
    },
    {
      question: l("`v1.0` tag'ini koyduktan sonra üç commit daha attın. `v1.0` nerede?", "After tagging `v1.0` you made three more commits. Where is `v1.0`?"),
      options: [
        l("En son commit'te", "On the latest commit"),
        l("Konduğu commit'te", "On the commit where it was placed"),
        l("Silindi", "It was deleted"),
        l("main ile aynı yerde", "Wherever main is"),
      ],
      answer: 1,
      explain: l("Tag'ler hareket etmez; branch'ler her commit'te ilerler.", "Tags never move; branches move with every commit."),
      reviewStep: 7,
    },
  ],
};
