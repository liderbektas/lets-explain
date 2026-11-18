import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const branches: Lesson = {
  slug: "branches",
  title: l("Branch", "Branches"),
  summary: l(
    "Branch açmak, branch'ler arasında geçmek ve silmek. Commit'in sadece bulunduğun branch'i ilerlettiğini, commit edilmemiş değişikliklerin seninle geldiğini gör.",
    "Creating, switching and deleting branches. See that a commit moves only the branch you are on, and that uncommitted changes travel with you.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`git switch -c` ile branch açmak", "Open a branch with `git switch -c`"), step: 1 },
    { text: l("Commit'in sadece bulunduğun branch'i ilerlettiğini görmek", "See that a commit moves only the branch you are on"), step: 2 },
    { text: l("Branch değiştirince klasöre ne olduğunu bilmek", "Know what happens to the folder when you switch"), step: 5 },
    { text: l("`git branch -d` ile `-D` arasındaki farkı bilmek", "Know the difference between `git branch -d` and `-D`"), step: 7 },
  ],
  steps: [
    {
      short: l("Ucuz işaret", "Cheap marker"),
      tag: "how",
      title: l("Branch, ayrı bir çalışma yolu", "A branch is a separate line of work"),
      body: [
        l(
          "Projede iki commit var ve `main` sonuncusunu gösteriyor. Şimdi bir giriş ekranı yazacağız ama main'i yarım işle bozmak istemiyoruz.",
          "The project has two commits and `main` points at the last one. Now we want to build a login screen without breaking main with half-done work.",
        ),
        l(
          "Bunun için yeni bir [[branch]] açarız. Önceki dersten hatırla: branch sadece bir commit'i gösteren küçük bir dosya. Yüz tane açsan da Git hiçbir dosyayı kopyalamaz.",
          "So we open a new [[branch]]. Remember the last lesson: a branch is just a tiny file pointing at a commit. Open a hundred and Git still copies no files.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git branch", note: l("Branch'leri listeler; bulunduğunun önünde `*` vardır.", "Lists branches; the current one has a `*` in front.") },
          { cmd: "git branch -v", note: l("Her branch'in gösterdiği son commit'i de yazar.", "Also prints the last commit each branch points at.") },
        ],
      },
    },
    {
      short: l("switch -c", "switch -c"),
      tag: "how",
      predict: {
        question: l(
          "`git switch -c login` ile yeni bir branch açacağız. Kaç commit kopyalanır?",
          "We will open a new branch with `git switch -c login`. How many commits are copied?",
        ),
        options: [
          l("Bütün commit'ler: login kendi kopyasını alır", "All of them: login gets its own copy"),
          l("Hiçbiri: aynı commit'i gösteren yeni bir isim oluşur", "None: a new name pointing at the same commit appears"),
          l("Sadece son commit", "Only the last commit"),
        ],
        answer: 1,
        why: l(
          "Yeni branch, bulunduğun commit'i gösteren yeni bir isimdir. Commit'ler ortak; hiçbir şey kopyalanmaz.",
          "A new branch is a new name pointing at the commit you are on. The commits are shared; nothing is copied.",
        ),
      },
      title: l("git switch -c: aç ve geç", "git switch -c: create and switch"),
      body: [
        l(
          "Aynı commit'in üstünde artık iki bayrak var: `main` ve `login`. HEAD sekmesi `login`'e geçti, yani bundan sonraki commit'ler login'e gidecek.",
          "There are now two flags on the same commit: `main` and `login`. The HEAD tab moved to `login`, so the next commits go to login.",
        ),
        l(
          "`-c` \"create\" demek: branch'i oluşturur ve hemen ona geçer. Sadece oluşturup geçmemek için `git branch login` yeter.",
          "`-c` means \"create\": it makes the branch and switches to it at once. To create it without switching, `git branch login` is enough.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch -c login", note: l("Branch açar ve ona geçer.", "Creates a branch and switches to it.") },
          { cmd: "git checkout -b login", note: l("Aynı işin eski yazılışı; hâlâ çalışır.", "The older spelling of the same thing; still works.") },
        ],
      },
    },
    {
      short: l("Commit", "Commit"),
      tag: "how",
      predict: {
        question: l("login'deyken bir commit atacağız. Hangi branch ilerler?", "We are on login and will commit. Which branch moves?"),
        options: [
          l("main ve login birlikte", "Both main and login"),
          l("Sadece login: HEAD ona bağlı", "Only login: HEAD is attached to it"),
          l("Sadece main", "Only main"),
        ],
        answer: 1,
        why: l("Commit, HEAD'in bağlı olduğu branch'i ilerletir. main olduğu yerde kalır.", "A commit moves the branch HEAD is attached to. main stays where it was."),
      },
      title: l("Commit sadece bulunduğun branch'i ilerletir", "A commit moves only the branch you are on"),
      body: [
        l(
          "\"Giriş formu\" commit'i yeni bir şeritte göründü. `login` ona kaydı, `main` ise yerinde duruyor.",
          "The \"Giriş formu\" commit appeared on a new lane. `login` slid onto it while `main` stayed put.",
        ),
        l(
          "main'de çalışan biri bu commit'ten etkilenmez. Giriş ekranı bitene kadar login'de istediğin kadar commit atabilirsin.",
          "Someone working on main is not affected by this commit. You can commit on login as often as you like until the login screen is done.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add login.js" },
          { cmd: 'git commit -m "Giriş formu"' },
          { cmd: "git log --oneline --graph --all", note: l("Bütün branch'leri grafik olarak gösterir.", "Draws every branch as a graph.") },
        ],
      },
    },
    {
      short: l("Geri geç", "Switch back"),
      tag: "how",
      predict: {
        question: l("Şimdi `git switch main` diyeceğiz. Klasördeki login.js'e ne olur?", "Now we run `git switch main`. What happens to login.js in the folder?"),
        options: [
          l("Klasörde kalır", "It stays in the folder"),
          l("Klasörden kaybolur ama login branch'inde güvende", "It disappears from the folder but is safe on the login branch"),
          l("Tamamen silinir", "It is gone for good"),
        ],
        answer: 1,
        why: l(
          "Branch değiştirmek klasörü o branch'in son commit'ine benzetir. main'de login.js yok, o yüzden klasörden çıkar; login'e dönünce geri gelir.",
          "Switching makes the folder look like that branch's last commit. main has no login.js, so it leaves the folder and comes back when you switch to login.",
        ),
      },
      title: l("Branch değiştirmek klasörü değiştirir", "Switching changes the folder"),
      body: [
        l(
          "HEAD main'e geçti ve `login.js` klasörden çıktı. Korkma: dosya login'deki commit'te güvende. Alttaki şeritte klasör temiz görünüyor.",
          "HEAD moved to main and `login.js` left the folder. Do not worry: the file is safe in the commit on login. The strip at the bottom shows a clean folder.",
        ),
        l(
          "Git, klasörü her seferinde HEAD'in gösterdiği commit'e göre düzenler. Aynı klasörde birden fazla sürümü böyle sırayla açabilirsin.",
          "Git arranges the folder to match whatever commit HEAD points at. That is how one folder can hold several versions, one at a time.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git switch -", note: l("Bir önceki branch'e geri döner.", "Goes back to the previous branch.") },
        ],
      },
    },
    {
      short: l("Ayrıldılar", "They diverge"),
      tag: "how",
      title: l("İki yol ayrıldı", "Two paths split"),
      body: [
        l(
          "main'de de bir commit attık: \"README eklendi\". Artık main ve login farklı commit'leri gösteriyor ve ikisinin de diğerinde olmayan bir commit'i var.",
          "We committed on main too: \"README eklendi\". Now main and login point at different commits, and each has a commit the other does not.",
        ),
        l(
          "Ekiplerde her gün olan şey bu: herkes kendi branch'inde ilerler. Bu yolları tekrar birleştirmek bir sonraki dersin konusu: merge.",
          "This is what happens in teams every day: everyone moves ahead on their own branch. Joining these paths again is the next lesson: merge.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git log --oneline --graph --all", note: l("Ayrılan iki yolu grafikte gösterir.", "Shows the two split paths in the graph.") }],
      },
    },
    {
      short: l("Değişiklik gelir", "Changes come along"),
      tag: "experiment",
      title: l("Commit edilmemiş değişiklik seninle gelir", "Uncommitted changes come with you"),
      body: [
        l(
          "Klasörde yeni bir `notlar.txt` oluşturduk ama commit atmadık. Sonra login'e geçtik: dosya hâlâ klasörde.",
          "We created a new `notlar.txt` in the folder without committing, then switched to login: the file is still in the folder.",
        ),
        l(
          "Commit edilmemiş değişiklikler bir branch'e ait değildir, **klasöre** aittir. Git, geçişte onlara dokunmadan taşıyabiliyorsa taşır.",
          "Uncommitted changes do not belong to a branch, they belong to the **folder**. If Git can carry them across without touching them, it does.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git status", note: l("Geçişten sonra da değişikliğin listede olduğunu görürsün.", "After switching you still see the change listed.") }],
      },
    },
    {
      short: l("Reddedildi", "Refused"),
      tag: "problem",
      title: l("Git bazen geçişi reddeder", "Sometimes Git refuses to switch"),
      body: [
        l(
          "login'de `login.js`'i değiştirdik ve commit atmadan main'e geçmeyi denedik. Git reddetti ve HEAD login'de kaldı.",
          "On login we changed `login.js` and tried to switch to main without committing. Git refused and HEAD stayed on login.",
        ),
        l(
          "Sebep: main'de login.js yok. Geçseydi dosya klasörden kalkacak ve senin değişikliğin gidecekti. Git işini kaybettirmek yerine durur ve şunu söyler: \"Your local changes … would be overwritten\".",
          "The reason: main has no login.js. Switching would remove the file from the folder and your change with it. Rather than lose your work, Git stops and says: \"Your local changes … would be overwritten\".",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Çıkış yolu üç tane: değişikliği commit et, `git stash` ile kenara kaldır ya da istemiyorsan `git restore` ile at.",
            "There are three ways out: commit the change, put it aside with `git stash`, or throw it away with `git restore` if you do not want it.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: 'git commit -am "Şifre alanı"', note: l("Değişikliği kaydedip öyle geç.", "Save the change, then switch.") },
          { cmd: "git stash", note: l("Ya da kenara kaldır; sonra `git stash pop` ile geri al.", "Or put it aside; bring it back later with `git stash pop`.") },
        ],
      },
    },
    {
      short: l("Silmek", "Deleting"),
      tag: "how",
      predict: {
        question: l(
          "login'deki işi commit'leyip main'e döndük. login henüz main'e birleştirilmedi. `git branch -d login` ne yapar?",
          "We committed the work on login and went back to main. login has not been merged into main yet. What does `git branch -d login` do?",
        ),
        options: [
          l("Branch'i siler", "Deletes the branch"),
          l("Reddeder: login'in main'de olmayan commit'leri var", "Refuses: login has commits main does not have"),
          l("login'in commit'lerini main'e taşır", "Moves login's commits onto main"),
        ],
        answer: 1,
        why: l(
          "Küçük `-d` güvenli silmedir: sadece işi zaten başka bir yere birleştirilmiş branch'leri siler. Aksi halde commit'ler sahipsiz kalırdı.",
          "Lower-case `-d` is the safe delete: it only removes branches whose work is already merged elsewhere. Otherwise those commits would be left orphaned.",
        ),
      },
      title: l("Güvenli silme: git branch -d", "Safe delete: git branch -d"),
      body: [
        l(
          "Git silmeyi reddetti: \"The branch 'login' is not fully merged\". `login` bayrağı yerinde duruyor, commit'leri de.",
          "Git refused: \"The branch 'login' is not fully merged\". The `login` flag is still there, and so are its commits.",
        ),
        l(
          "Bir branch'i silmek commit'leri silmez, sadece ismi kaldırır. Ama isimsiz kalan commit'ler kaybolmuş sayılır. `-d` bu yüzden seni korur.",
          "Deleting a branch does not delete commits, only the name. But commits left without a name are as good as lost. That is why `-d` protects you.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git branch -d login", note: l("Sadece birleştirilmiş branch'i siler.", "Deletes only a merged branch.") },
          { cmd: "git branch --merged", note: l("Silinmesi güvenli olan branch'leri listeler.", "Lists branches that are safe to delete.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Günlük işte branch'ler", "Branches in daily work"),
      body: [
        l(
          "Bir branch'in işinden gerçekten vazgeçtiysen büyük `-D` ile zorla silersin. Commit'ler sahipsiz kalır; yanlışlıkla sildiysen bir süre `git reflog` ile geri bulabilirsin.",
          "If you really are done with a branch's work, delete it by force with capital `-D`. Its commits are left orphaned; if it was a mistake, `git reflog` can find them for a while.",
        ),
        l(
          "Ekipler branch'lere ne iş yapıldığını anlatan isimler verir: `feature/login`, `fix/sepet-toplam`. Adı yanlış koyduysan `git branch -m yeni-isim` ile değiştirebilirsin.",
          "Teams give branches names that say what the work is: `feature/login`, `fix/cart-total`. If you got the name wrong, change it with `git branch -m new-name`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede Git dosyaları tek parça olarak karşılaştırır. Gerçek Git bir geçişte satır satır bakmaz ama dosya düzeyinde aynı kuralı uygular: senin değişikliğin ezilecekse geçişi reddeder.",
            "Here files are compared as a whole. Real Git applies the same rule per file when switching: if your change would be overwritten, it refuses.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git branch -D login", note: l("Merge edilmemiş olsa bile siler. Emin ol.", "Deletes even if unmerged. Be sure.") },
          { cmd: "git branch -m feature/login", note: l("Bulunduğun branch'in adını değiştirir.", "Renames the branch you are on.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "main'de iki commit var ve `login` branch'i aynı yerde. Branch'ler arasında geçebilir, `menu` adında yeni bir branch açabilir, `app.js`'i düzenleyip commit atabilir ve branch silebilirsin.",
          "main has two commits and the `login` branch sits in the same place. You can switch between branches, open a new `menu` branch, edit `app.js` and commit, and delete branches.",
        ),
        l(
          "Alttaki şerit klasördeki commit edilmemiş değişiklikleri gösterir. Sahnenin altında **3 görev** var.",
          "The strip at the bottom shows uncommitted changes in the folder. Under the scene there are **3 missions**.",
        ),
      ],
    },
  ],
  recap: [
    l("Branch, bir commit'i gösteren hareketli bir isimdir; açmak hiçbir şey kopyalamaz.", "A branch is a moving name that points at a commit; creating one copies nothing."),
    l("`git switch -c isim` branch açar ve ona geçer; `git switch isim` var olana geçer.", "`git switch -c name` creates a branch and switches to it; `git switch name` switches to an existing one."),
    l("Commit sadece HEAD'in bağlı olduğu branch'i ilerletir.", "A commit moves only the branch HEAD is attached to."),
    l("Branch değiştirmek klasörü o branch'in son commit'ine benzetir; commit edilmemiş değişiklikler mümkünse seninle gelir.", "Switching makes the folder match that branch's last commit; uncommitted changes come along when they can."),
    l("Değişikliğin ezilecekse Git geçişi reddeder: commit et, stash'le ya da at.", "If your change would be overwritten, Git refuses to switch: commit, stash or throw it away."),
    l("`git branch -d` sadece birleştirilmiş branch'i siler; `-D` zorla siler.", "`git branch -d` only deletes a merged branch; `-D` deletes by force."),
  ],
  quiz: [
    {
      question: l("`git switch -c feature` sonrası kaç yeni commit oluşur?", "How many new commits exist after `git switch -c feature`?"),
      options: [l("Hiç", "None"), l("Bir", "One"), l("Branch'teki commit sayısı kadar", "As many as the branch has"), l("İki", "Two")],
      answer: 0,
      explain: l("Branch açmak sadece yeni bir isim yazar; commit oluşmaz.", "Creating a branch only writes a new name; no commit is made."),
      reviewStep: 1,
    },
    {
      question: l("feature'dasın ve iki commit attın. main'e ne olur?", "You are on feature and make two commits. What happens to main?"),
      options: [l("İki commit ilerler", "It moves two commits ahead"), l("Yerinde kalır", "It stays where it was"), l("Silinir", "It is deleted"), l("feature ile birleşir", "It merges with feature")],
      answer: 1,
      explain: l("Commit'ler sadece bulunduğun branch'i ilerletir.", "Commits move only the branch you are on."),
      reviewStep: 2,
    },
    {
      question: l(
        "Commit edilmemiş bir değişikliğin var ve Git \"would be overwritten\" diyerek geçişi reddetti. Hangisi işini kaybetmeden geçmeni sağlar?",
        "You have an uncommitted change and Git refused to switch with \"would be overwritten\". Which lets you switch without losing your work?",
      ),
      options: [l("`git restore .`", "`git restore .`"), l("`git stash`", "`git stash`"), l("`git branch -D`", "`git branch -D`"), l("`git switch -f`", "`git switch -f`")],
      answer: 1,
      explain: l(
        "`git stash` değişikliği kenara kaldırır; sonra `git stash pop` ile geri alırsın. `restore` ve `-f` değişikliği atar.",
        "`git stash` puts the change aside so you can bring it back with `git stash pop`. `restore` and `-f` throw it away.",
      ),
      reviewStep: 6,
    },
    {
      question: l("`git branch -d deneme` reddedildi. Bu ne demek?", "`git branch -d deneme` was refused. What does that mean?"),
      options: [
        l("deneme'de başka yerde olmayan commit'ler var", "deneme has commits that are nowhere else"),
        l("deneme diye bir branch yok", "There is no branch called deneme"),
        l("Klasör temiz değil", "The folder is not clean"),
        l("deneme zaten main'e birleştirilmiş", "deneme is already merged into main"),
      ],
      answer: 0,
      explain: l("`-d` sadece işi başka bir branch'te olan branch'leri siler. Yoksa `-D` gerekir.", "`-d` only removes branches whose work is on another branch. Otherwise it takes `-D`."),
      reviewStep: 7,
    },
  ],
};
