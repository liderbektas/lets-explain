import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const threeAreas: Lesson = {
  slug: "three-areas",
  title: l("Üç alan: klasör, staging, repo", "Three areas: folder, staging, repo"),
  summary: l(
    "Bir değişiklik commit olana kadar üç yerden geçer. `git add`, `git commit` ve `git restore`'un tam olarak neyi nereye taşıdığını gör.",
    "A change passes through three places before it becomes a commit. See exactly what `git add`, `git commit` and `git restore` move where.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Klasör, staging ve repo'nun ne olduğunu bilmek", "Know what the folder, staging and repo are"), step: 0 },
    { text: l("`git add`'in değişikliği staging'e koyduğunu görmek", "See that `git add` puts a change into staging"), step: 1 },
    { text: l("Commit'in sadece staging'dekini kaydettiğini görmek", "See that a commit saves only what is staged"), step: 4 },
    { text: l("Bir değişikliği klasörden ve staging'den geri almak", "Take a change back out of the folder and out of staging"), step: 6 },
  ],
  steps: [
    {
      short: l("Üç alan", "Three areas"),
      tag: "how",
      title: l("Bir değişiklik üç yerden geçer", "A change passes through three places"),
      body: [
        l(
          "Git ile çalışırken dosyaların üç yerde yaşar. Soldaki **klasör**, her gün düzenlediğin normal proje klasörün. Git buna [[workingTree]] der.",
          "When you work with Git, your files live in three places. On the left is the **folder**, the ordinary project folder you edit every day. Git calls it the [[workingTree]].",
        ),
        l(
          "Ortadaki **staging**, bir sonraki commit'in hazırlandığı tezgâh. Sağdaki **repo** da projenin bütün geçmişi: commit'lerin saklandığı gizli `.git` klasörü, yani [[repository]].",
          "In the middle, **staging** is the bench where the next commit is put together. On the right, the **repo** holds the whole history: the hidden `.git` folder where commits are kept, the [[repository]].",
        ),
        l(
          "Şu an klasörde bir `README.md` var ama Git onu henüz takip etmiyor: üstünde \"yeni\" yazıyor. Staging ve repo boş.",
          "Right now there is a `README.md` in the folder, but Git is not tracking it yet: it is marked \"new\". Staging and the repo are empty.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Fotoğraf çekmek gibi: klasör sahne, staging kadraja aldıkların, commit de deklanşöre bastığın an. Kadraja almadığın şey fotoğrafa girmez.",
            "Like taking a photo: the folder is the scene, staging is what you frame, and a commit is pressing the shutter. What you did not frame is not in the photo.",
          ),
        },
      ],
      practice: {
        intro: l("Yeni bir proje klasöründe:", "In a new project folder:"),
        commands: [
          { cmd: "git init", note: l("Klasörü bir Git repo'su yapar (gizli `.git` klasörünü oluşturur).", "Makes the folder a Git repository (creates the hidden `.git` folder).") },
          { cmd: "git status", note: l("Üç alanın durumunu gösterir. En sık kullanacağın komut.", "Shows the state of the three areas. The command you will use most.") },
        ],
      },
    },
    {
      short: l("git add", "git add"),
      tag: "how",
      predict: {
        question: l(
          "`git add README.md` çalıştıracağız. Klasördeki README.md'ye ne olacak?",
          "We will run `git add README.md`. What happens to README.md in the folder?",
        ),
        options: [
          l("Klasörden çıkar, staging'e taşınır", "It leaves the folder and moves to staging"),
          l("Klasörde kalır, bir kopyası staging'e konur", "It stays in the folder, and a copy goes into staging"),
          l("Hemen commit olur", "It is committed right away"),
        ],
        answer: 1,
        why: l(
          "`git add` dosyayı taşımaz, o anki halinin bir kopyasını staging'e koyar. Klasördeki dosya yerinde durur.",
          "`git add` does not move the file. It puts a copy of its current content into staging, and the file stays in the folder.",
        ),
      },
      title: l("git add: kadraja al", "git add: frame it"),
      body: [
        l(
          "`git add README.md` dosyanın şu anki halini staging'e koydu. Ortadaki kartın üstünde \"hazır\" yazıyor: bu dosya bir sonraki commit'e girecek.",
          "`git add README.md` put the file's current content into staging. The card in the middle says \"staged\": this file goes into the next commit.",
        ),
        l(
          "Klasördeki dosya hâlâ yerinde. Staging'e konan şey, dosyanın o anki bir kopyası.",
          "The file in the folder is still there. What went into staging is a copy of it as it is right now.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add README.md", note: l("Tek bir dosyayı staging'e koyar.", "Stages one file.") },
          { cmd: "git add .", note: l("Bu klasördeki bütün değişiklikleri staging'e koyar.", "Stages every change in this folder.") },
        ],
      },
    },
    {
      short: l("git commit", "git commit"),
      tag: "how",
      predict: {
        question: l(
          "Şimdi `git commit` atacağız. Commit'ten sonra staging'de ne kalır?",
          "Now we will run `git commit`. What is left in staging after the commit?",
        ),
        options: [
          l("Hiçbir şey, staging boşalır", "Nothing, staging empties"),
          l("README.md durur: staging son commit'in tam bir kopyasıdır", "README.md stays: staging is a full copy of the last commit"),
          l("Sadece commit mesajı", "Only the commit message"),
        ],
        answer: 1,
        why: l(
          "Staging bir \"değişiklik listesi\" değil, bir sonraki commit'in tam hali. Commit'ten sonra son commit'le aynı olur, yani dosya orada durur ama artık \"hazır\" değildir.",
          "Staging is not a \"list of changes\" but the complete next commit. After a commit it equals the last commit, so the file stays there but is no longer \"staged\".",
        ),
      },
      title: l("git commit: deklanşöre bas", "git commit: press the shutter"),
      body: [
        l(
          "`git commit -m \"İlk commit\"` staging'deki her şeyin bir fotoğrafını çekip repo'ya kaydetti. Sağda ilk [[commit]] göründü, yanında kısa kimliği ve mesajı var.",
          "`git commit -m \"İlk commit\"` took a snapshot of everything in staging and saved it in the repo. The first [[commit]] appears on the right, with its short id and message.",
        ),
        l(
          "Staging boşalmadı: hâlâ README.md'yi tutuyor, ama artık son commit'le aynı olduğu için \"hazır\" etiketi yok. Üç alan da aynı içeriği gösteriyor; buna **temiz** durum denir.",
          "Staging did not empty: it still holds README.md, but since it now matches the last commit there is no \"staged\" label. All three areas show the same content, which is called **clean**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Commit mesajı geleceğe bırakılan not: \"ne\" değil \"neden\" değişti, onu yaz. \"fix\" yerine \"Giriş formunda boş şifreye izin verme\" gibi.",
            "A commit message is a note to the future: write why it changed, not just what. Instead of \"fix\", try \"Reject empty passwords on the login form\".",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: 'git commit -m "İlk commit"', note: l("Staging'dekini mesajıyla birlikte kaydeder.", "Saves what is staged, with a message.") },
          { cmd: "git log --oneline", note: l("Commit'leri kısa kimlikleriyle listeler.", "Lists commits with their short ids.") },
        ],
      },
    },
    {
      short: l("Değiştir", "Edit"),
      tag: "how",
      title: l("Dosyayı değiştir, yeni dosya ekle", "Edit a file, add a new one"),
      body: [
        l(
          "README.md'yi düzenledik ve yeni bir `app.js` oluşturduk. Klasörde README.md \"değişti\", app.js \"yeni\" görünüyor.",
          "We edited README.md and created a new `app.js`. In the folder, README.md shows \"changed\" and app.js shows \"new\".",
        ),
        l(
          "Staging ve repo değişmedi. Git'e söylemediğin sürece klasörde yaptığın hiçbir şey kaydedilmez.",
          "Staging and the repo did not change. Nothing you do in the folder is saved until you tell Git.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git status", note: l("Değişen ve yeni dosyaları ayrı ayrı listeler.", "Lists changed and new files separately.") },
          { cmd: "git diff", note: l("Klasördeki değişiklikleri satır satır gösterir (henüz add edilmemiş olanları).", "Shows the folder's changes line by line (the ones not added yet).") },
        ],
      },
    },
    {
      short: l("Seçerek commit", "Pick and commit"),
      tag: "experiment",
      predict: {
        question: l(
          "İki dosya da değişti ama sadece `app.js`'i add edip commit atacağız. Bu commit'te README.md'nin hangi hali olur?",
          "Both files changed, but we will add only `app.js` and commit. Which version of README.md is in that commit?",
        ),
        options: [
          l("Yeni hali, çünkü klasörde o var", "The new one, because that is what is in the folder"),
          l("Eski hali, çünkü staging'de o var", "The old one, because that is what is in staging"),
          l("README.md commit'te hiç olmaz", "README.md is not in the commit at all"),
        ],
        answer: 1,
        why: l(
          "Commit staging'in fotoğrafıdır. README.md'nin yeni hali staging'e hiç konmadı, o yüzden commit eski halini taşır ve yeni hal klasörde beklemeye devam eder.",
          "A commit is a snapshot of staging. The new README.md was never staged, so the commit carries the old one and the new one keeps waiting in the folder.",
        ),
      },
      title: l("Commit, staging'in fotoğrafıdır", "A commit is a snapshot of staging"),
      body: [
        l(
          "`git add app.js` ve ardından `git commit`. Yeni commit app.js'i içeriyor, README.md ise eski haliyle duruyor.",
          "`git add app.js` and then `git commit`. The new commit contains app.js, while README.md is the old version.",
        ),
        l(
          "README.md'deki değişiklik kaybolmadı: klasörde \"değişti\" olarak bekliyor. Staging sayesinde yarım kalmış işleri ayırıp **küçük, tek konulu** commit'ler atabilirsin.",
          "The README.md change is not lost: it is waiting in the folder as \"changed\". Staging lets you split unfinished work and make **small, single-topic** commits.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add app.js" },
          { cmd: 'git commit -m "app.js eklendi"' },
          { cmd: "git add -p", note: l("Bir dosyanın bile sadece bazı parçalarını seçip staging'e koymanı sağlar.", "Lets you stage only some parts of a file, hunk by hunk.") },
        ],
      },
    },
    {
      short: l("restore", "restore"),
      tag: "how",
      predict: {
        question: l(
          "README.md'deki değişikliği istemiyoruz: `git restore README.md` çalıştıracağız. Dosya hangi haline döner?",
          "We do not want the README.md change: we will run `git restore README.md`. Which version does the file go back to?",
        ),
        options: [
          l("Staging'deki haline", "The version in staging"),
          l("En ilk commit'teki haline", "The version in the very first commit"),
          l("Boş bir dosyaya", "An empty file"),
        ],
        answer: 0,
        why: l(
          "`git restore` klasördeki dosyayı staging'deki haliyle değiştirir. Staging son commit'le aynı olduğu için dosya son kaydedilmiş haline döner.",
          "`git restore` replaces the folder's file with the staged version. Staging matches the last commit here, so the file goes back to its last saved version.",
        ),
      },
      title: l("git restore: değişikliği at", "git restore: throw a change away"),
      body: [
        l(
          "`git restore README.md` klasördeki README.md'yi staging'deki haliyle değiştirdi. \"Değişti\" etiketi kayboldu ve klasör yine temiz.",
          "`git restore README.md` replaced the folder's README.md with the staged version. The \"changed\" label is gone and the folder is clean again.",
        ),
        l(
          "Dikkat: atılan değişiklik hiçbir yere kaydedilmemişti, yani **geri gelmez**. Emin değilsen önce commit at ya da `git stash` kullan.",
          "Careful: the thrown-away change was never saved anywhere, so it **cannot come back**. When unsure, commit first or use `git stash`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`git restore` ve `git checkout -- dosya` aynı işi yapar ve geri alınamaz. Git'in kayıp işi kurtaramadığı az sayıdaki durumdan biri budur.",
            "`git restore` and `git checkout -- file` do the same thing and cannot be undone. It is one of the few cases where Git cannot rescue lost work.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "git restore README.md", note: l("Klasördeki değişikliği atar; geri dönüşü yok.", "Throws away the folder's change; no way back.") }],
      },
    },
    {
      short: l("--staged", "--staged"),
      tag: "how",
      title: l("Staging'den geri çıkar", "Take a change back out of staging"),
      body: [
        l(
          "README.md'yi tekrar değiştirdik ve add ettik. Sonra fikrimizi değiştirip `git restore --staged README.md` çalıştırdık.",
          "We changed README.md again and added it. Then we changed our minds and ran `git restore --staged README.md`.",
        ),
        l(
          "Değişiklik staging'den çıktı ama klasörde duruyor: kart klasörde \"değişti\" olarak bekliyor. Bu komut işini **silmez**, sadece kadrajdan çıkarır.",
          "The change left staging but is still in the folder: the card waits there as \"changed\". This command does **not** delete your work; it just takes it out of the frame.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git restore --staged README.md", note: l("Staging'den çıkarır, klasördeki değişiklik kalır.", "Unstages; the change in the folder stays.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Günlük kullanımda kısayollar", "Shortcuts in daily use"),
      body: [
        l(
          "Her seferinde iki ayrı komut yazmak zorunda değilsin. `git commit -a` zaten takip edilen dosyalardaki bütün değişiklikleri önce staging'e koyar, sonra commit atar. Yeni dosyaları ise almaz, onları bir kez `git add` ile tanıtman gerekir.",
          "You do not have to type two commands every time. `git commit -a` stages every change to tracked files and commits in one go. It does not pick up new files: those need one `git add` first.",
        ),
        l(
          "Ne commit'leyeceğini görmek için `git diff --staged` kullan: staging'deki her şeyi son commit'le karşılaştırır. Commit atmadan önce bir kez bakmak iyi bir alışkanlık.",
          "To see what you are about to commit, use `git diff --staged`: it compares staging with the last commit. Looking once before every commit is a good habit.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede dosyalar tek satırlık. Gerçek Git dosyaları satır satır karşılaştırır ve `git add -p` ile bir dosyanın sadece bazı satırlarını staging'e koyabilirsin.",
            "Files here are one line long. Real Git compares files line by line, and with `git add -p` you can stage just some lines of a file.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git diff --staged", note: l("Commit'e girecek değişiklikleri gösterir.", "Shows what will go into the commit.") },
          { cmd: 'git commit -a -m "Mesaj"', note: l("Takip edilen dosyaları add edip commit atar.", "Adds tracked files and commits.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Bu repo'da tek commit var: `README.md` ve `app.js`. Her dosyayı düzenleyebilir, `add` ile staging'e koyabilir, `restore` ile geri alabilir ve commit atabilirsin.",
          "This repo has one commit with `README.md` and `app.js`. You can edit each file, stage it with `add`, take it back with `restore`, and commit.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Her düğme bir hamle sayılır; az hamleyle bitirirsen 3 yıldız alırsın.",
          "Under the scene there are **3 missions**. Every button is a move; finish in few moves for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "Dosyalar üç yerde yaşar: **klasör** ([[workingTree]]), **staging** ([[index]]) ve **repo** (commit'ler).",
      "Files live in three places: the **folder** ([[workingTree]]), **staging** ([[index]]) and the **repo** (commits).",
    ),
    l("`git add` bir dosyanın o anki halini staging'e kopyalar; dosya klasörde kalır.", "`git add` copies a file's current content into staging; the file stays in the folder."),
    l("`git commit` staging'in tam bir fotoğrafını kaydeder. Staging'e konmayan değişiklik commit'e girmez.", "`git commit` saves a full snapshot of staging. A change that was not staged is not in the commit."),
    l("`git restore dosya` klasördeki değişikliği atar ve bu geri alınamaz.", "`git restore file` throws away the folder's change, and that cannot be undone."),
    l("`git restore --staged dosya` değişikliği staging'den çıkarır ama klasörde bırakır.", "`git restore --staged file` takes a change out of staging but leaves it in the folder."),
  ],
  quiz: [
    {
      question: l(
        "`app.js`'i değiştirdin ve `git add app.js` yaptın, sonra app.js'i bir kez daha değiştirdin. Şimdi `git commit` atarsan commit'te app.js'in hangi hali olur?",
        "You changed `app.js`, ran `git add app.js`, then changed app.js again. If you commit now, which app.js is in the commit?",
      ),
      options: [
        l("İkinci değişiklikten sonraki hali", "The version after the second change"),
        l("Add ettiğin andaki hali", "The version from when you added it"),
        l("Commit hata verir", "The commit fails"),
        l("Değişikliklerin hiçbiri", "Neither change"),
      ],
      answer: 1,
      explain: l(
        "Commit staging'i kaydeder. Staging'de add ettiğin andaki hal var; ikinci değişiklik klasörde bekler.",
        "A commit saves staging, which holds the version from when you added it. The second change waits in the folder.",
      ),
      reviewStep: 4,
    },
    {
      question: l(
        "Bir değişikliği staging'den çıkarmak ama klasörde tutmak istiyorsun. Hangi komut?",
        "You want to take a change out of staging but keep it in the folder. Which command?",
      ),
      options: [l("`git restore dosya`", "`git restore file`"), l("`git restore --staged dosya`", "`git restore --staged file`"), l("`git rm dosya`", "`git rm file`"), l("`git commit`", "`git commit`")],
      answer: 1,
      explain: l("`--staged` sadece staging'i son commit'e döndürür; klasördeki değişiklik durur.", "`--staged` only resets staging to the last commit; the folder's change stays."),
      reviewStep: 6,
    },
    {
      question: l("Commit attıktan hemen sonra staging'de ne vardır?", "Right after a commit, what is in staging?"),
      options: [
        l("Hiçbir şey", "Nothing"),
        l("Son commit'in tam kopyası", "A full copy of the last commit"),
        l("Sadece son değişen dosyalar", "Only the files that just changed"),
        l("Bir sonraki commit'in mesajı", "The next commit's message"),
      ],
      answer: 1,
      explain: l(
        "Staging her zaman bir sonraki commit'in tam halidir; commit'ten hemen sonra son commit'le aynıdır.",
        "Staging is always the complete next commit; right after committing it equals the last commit.",
      ),
      reviewStep: 2,
    },
    {
      question: l("`git restore README.md` ile attığın değişikliği nasıl geri getirirsin?", "How do you get back a change you threw away with `git restore README.md`?"),
      options: [l("`git reflog` ile", "With `git reflog`"), l("`git restore --staged` ile", "With `git restore --staged`"), l("Getiremezsin: hiç kaydedilmemişti", "You cannot: it was never saved"), l("`git stash pop` ile", "With `git stash pop`")],
      answer: 2,
      explain: l(
        "Değişiklik ne staging'e ne de bir commit'e girmişti, Git onu hiç görmedi. Bu yüzden restore geri alınamaz.",
        "The change never reached staging or a commit, so Git never saw it. That is why restore cannot be undone.",
      ),
      reviewStep: 5,
    },
  ],
};
