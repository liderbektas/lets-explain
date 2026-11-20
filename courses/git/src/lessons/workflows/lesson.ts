import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const workflows: Lesson = {
  slug: "workflows",
  title: l("Çalışma düzenleri", "Workflows"),
  summary: l(
    "Bir ekip Git'i nasıl birlikte kullanır: feature branch ve pull request, trunk-based çalışma, iyi commit mesajları ve her gün tekrarlayacağın komutlar.",
    "How a team uses Git together: feature branches and pull requests, trunk-based work, good commit messages, and the commands you will repeat every day.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Feature branch + pull request akışını baştan sona yürütmek", "Run the feature branch + pull request flow end to end"), step: 6 },
    { text: l("Branch'ini güncel main'e taşıyıp `--force-with-lease` ile göndermek", "Move your branch onto the latest main and send it with `--force-with-lease`"), step: 5 },
    { text: l("Trunk-based çalışmada `pull --rebase` ile düz geçmiş tutmak", "Keep a straight history with `pull --rebase` in trunk-based work"), step: 7 },
    { text: l("İyi commit mesajı yazmak ve main'i korumak", "Write good commit messages and protect main"), step: 8 },
    { text: l("Kendi projen için günlük bir Git rutini kurmak", "Set up a daily Git routine for your own project"), step: 9 },
  ],
  steps: [
    {
      short: l("Herkes main'de", "Everyone on main"),
      tag: "problem",
      title: l("Herkes doğrudan main'e yazarsa", "If everyone writes straight to main"),
      body: [
        l(
          "Solda senin bilgisayarındaki klon, sağda ekibin GitHub'daki ortak repo'su (origin). Şu an ikisi aynı: main'de iki commit var.",
          "On the left is the clone on your computer; on the right is the team's shared repo on GitHub (origin). Right now they match: main has two commits.",
        ),
        l(
          "Beş kişi aynı anda doğrudan main'e push ederse yarım kalmış işler main'e karışır, push'lar sürekli reddedilir ve kimse \"main çalışıyor mu?\" sorusuna emin cevap veremez.",
          "If five people push straight to main at once, half-finished work leaks into main, pushes keep getting rejected, and nobody can say for sure whether main works.",
        ),
        l(
          "Ekipler bunun için bir **çalışma düzeni** (workflow) seçer. En yaygın ikisi: feature branch + pull request, ve trunk-based development. İkisini de göreceğiz.",
          "Teams pick a **workflow** for this. The two most common are feature branch + pull request, and trunk-based development. We will see both.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git clone https://github.com/ekip/takvim.git", note: l("Ortak repo'nun kopyasını alır; origin otomatik ayarlanır.", "Copies the shared repo; origin is set up for you.") },
          { cmd: "git remote -v", note: l("origin'in adresini gösterir.", "Shows origin's address.") },
        ],
      },
    },
    {
      short: l("Feature branch", "Feature branch"),
      tag: "idea",
      title: l("Her iş kendi branch'inde", "Every piece of work on its own branch"),
      body: [
        l(
          "Giriş ekranını yapacağız. main'de değil, ona özel bir branch'te: `git switch -c feature/login`. Turuncu bayrak artık bu branch'te, main yerinde duruyor.",
          "We will build the login screen, not on main but on a branch of its own: `git switch -c feature/login`. The orange flag is now on that branch, and main stays where it was.",
        ),
        l(
          "Branch adında ne yaptığını söyle: `feature/login`, `fix/takvim-tarihi`, `docs/kurulum`. Ekipteki herkes listeye bakınca neyin üzerinde çalışıldığını anlar.",
          "Name the branch after what it does: `feature/login`, `fix/calendar-date`, `docs/setup`. Anyone looking at the list can tell what is being worked on.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git pull", note: l("Önce main'i güncelle ki branch güncel koddan başlasın.", "Update main first so the branch starts from the latest code.") },
          { cmd: "git switch -c feature/login" },
        ],
      },
    },
    {
      short: l("Küçük commit'ler", "Small commits"),
      tag: "how",
      title: l("Küçük, anlamlı commit'ler", "Small, meaningful commits"),
      body: [
        l(
          "İş iki commit'e bölündü: önce form, sonra şifre kontrolü. Her biri tek bir şeyi yapıyor ve kendi başına çalışıyor.",
          "The work is split into two commits: first the form, then the password check. Each does one thing and works on its own.",
        ),
        l(
          "Küçük commit'leri incelemek kolaydır, gerekirse tek başına geri alınabilir ve `git bisect` onlarla hatayı hızlı bulur.",
          "Small commits are easy to review, can be undone on their own, and let `git bisect` find bugs fast.",
        ),
        l(
          "Henüz hiçbir şey origin'e gitmedi: sağ taraf hâlâ aynı.",
          "Nothing has gone to origin yet: the right side has not changed.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add login.js" },
          { cmd: 'git commit -m "Add login form"' },
          { cmd: 'git commit -am "Check the password before signing in"' },
        ],
      },
    },
    {
      short: l("push -u", "push -u"),
      tag: "how",
      predict: {
        question: l(
          "`git push -u origin feature/login` çalıştıracağız. Sağdaki origin'de ne değişir?",
          "We will run `git push -u origin feature/login`. What changes on origin, on the right?",
        ),
        options: [
          l("main'e iki commit eklenir", "Two commits are added to main"),
          l("origin'de `feature/login` branch'i oluşur, main aynı kalır", "A `feature/login` branch appears on origin; main stays the same"),
          l("Hiçbir şey; önce PR açmak gerekir", "Nothing; a PR has to be opened first"),
        ],
        answer: 1,
        why: l(
          "Push sadece gönderdiğin branch'i günceller. origin'de yeni bir `feature/login` oluşur; main'e ancak PR birleştirilince bir şey girer.",
          "A push only updates the branch you send. A new `feature/login` appears on origin; nothing reaches main until the PR is merged.",
        ),
      },
      title: l("Branch'i gönder, PR aç", "Push the branch, open a PR"),
      body: [
        l(
          "`git push -u` branch'i origin'e gönderdi ve iki tarafı birbirine bağladı (upstream). Bundan sonra bu branch'te sadece `git push` yazman yeter.",
          "`git push -u` sent the branch to origin and linked the two (the upstream). From now on, a plain `git push` is enough on this branch.",
        ),
        l(
          "Şimdi GitHub'da bir **pull request** (PR) açarsın: \"feature/login'i main'e almak istiyorum\". Ekip kodu okur, yorum yapar, otomatik testler çalışır. Düzeltme gerekirse aynı branch'e yeni commit atıp push edersin; PR kendiliğinden güncellenir.",
          "Now you open a **pull request** (PR) on GitHub: \"I want to bring feature/login into main\". The team reads the code and comments, and automated tests run. If something needs fixing, you commit to the same branch and push, and the PR updates by itself.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git push -u origin feature/login", note: l("İlk push'ta `-u` ile upstream'i ayarla.", "Set the upstream with `-u` on the first push.") },
          { cmd: "gh pr create --fill", note: l("GitHub CLI ile terminalden PR açar (isteğe bağlı).", "Opens the PR from the terminal with the GitHub CLI (optional).") },
        ],
      },
    },
    {
      short: l("Ekip ilerledi", "The team moved on"),
      tag: "problem",
      predict: {
        question: l(
          "Bu arada Bora kendi PR'ını birleştirdi ve origin'deki main ilerledi. Senin bilgisayarındaki main'e ne olur?",
          "Meanwhile, Bora merged his PR and main on origin moved forward. What happens to main on your computer?",
        ),
        options: [
          l("Kendiliğinden güncellenir", "It updates by itself"),
          l("Hiçbir şey; sen fetch edene kadar haberin olmaz", "Nothing; you will not know until you fetch"),
          l("Conflict çıkar", "A conflict appears"),
        ],
        answer: 1,
        why: l(
          "Git asla kendiliğinden ağa bağlanmaz. Senin repo'n sen `fetch` ya da `pull` diyene kadar origin'deki değişiklikleri bilmez.",
          "Git never goes to the network on its own. Your repo does not know about changes on origin until you `fetch` or `pull`.",
        ),
      },
      title: l("main senin haberin olmadan ilerledi", "main moved on without you knowing"),
      body: [
        l(
          "Sağda origin'in main'ine Bora'nın commit'i eklendi. Solda hiçbir şey değişmedi: senin main'in ve `origin/main` etiketin hâlâ eski yerde.",
          "On the right, Bora's commit landed on origin's main. Nothing changed on the left: your main and your `origin/main` label are still in the old place.",
        ),
        l(
          "Senin PR'ın artık eski bir main'den başlıyor. Birleştirmeden önce onu güncel main'e taşımak iyi olur; böylece testler en son kodla çalışır.",
          "Your PR now starts from an old main. Before merging, it is good to move it onto the latest main, so the tests run against the newest code.",
        ),
      ],
    },
    {
      short: l("Güncelle", "Update"),
      tag: "how",
      predict: {
        question: l(
          "Branch'in commit'lerini `git rebase origin/main` ile güncel main'in üstünde yeniden oynattık. Şimdi normal `git push` dersek ne olur?",
          "We replayed the branch's commits on the latest main with `git rebase origin/main`. What happens with a plain `git push` now?",
        ),
        options: [
          l("Sorunsuz gider", "It goes through fine"),
          l("Reddedilir: rebase commit'leri yeniden yazdı, origin'deki eski halleri ortada kaldı", "It is rejected: the rebase rewrote the commits and origin still has the old ones"),
          l("origin'deki main de değişir", "main on origin changes too"),
        ],
        answer: 1,
        why: l(
          "Rebase commit'lere yeni kimlikler verir. origin'deki `feature/login` eski commit'leri gösterdiği için normal push reddedilir. `--force-with-lease` \"origin'de benim görmediğim bir şey yoksa üstüne yaz\" der.",
          "A rebase gives the commits new ids. Since `feature/login` on origin points at the old ones, a plain push is rejected. `--force-with-lease` says \"overwrite it, unless there is something there I have not seen\".",
        ),
      },
      title: l("Rebase ve --force-with-lease", "Rebase and --force-with-lease"),
      body: [
        l(
          "`git fetch` origin'deki yeniliği indirdi, `git rebase origin/main` senin iki commit'ini Bora'nın commit'inin üstüne yeniden yazdı. Ardından `git push --force-with-lease` PR branch'ini güncelledi.",
          "`git fetch` downloaded what was new on origin, and `git rebase origin/main` rewrote your two commits on top of Bora's. Then `git push --force-with-lease` updated the PR branch.",
        ),
        l(
          "Bu sadece **senin** branch'in için güvenli; aynı branch'te başkası da çalışıyorsa rebase yerine `git merge origin/main` kullan. main gibi paylaşılan branch'lere asla zorla push edilmez.",
          "This is only safe for **your own** branch; if someone else works on it too, use `git merge origin/main` instead. Shared branches like main are never force-pushed.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`--force` yerine her zaman `--force-with-lease`. Düz `--force` origin'de o arada biri bir şey push ettiyse onu sessizce siler.",
            "Always `--force-with-lease`, never plain `--force`. Plain `--force` silently deletes anything someone pushed in the meantime.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git fetch" },
          { cmd: "git rebase origin/main" },
          { cmd: "git push --force-with-lease" },
        ],
      },
    },
    {
      short: l("Birleştir", "Merge"),
      tag: "how",
      title: l("PR birleşti, branch silindi", "The PR is merged, the branch deleted"),
      body: [
        l(
          "PR onaylandı ve birleştirildi. GitHub'daki \"Merge pull request\" düğmesinin yaptığını burada elle yaptık: main'e geçip güncelledik, `feature/login`'i bir merge commit ile aldık ve push ettik.",
          "The PR was approved and merged. Here we did by hand what GitHub's \"Merge pull request\" button does: switched to main, updated it, brought in `feature/login` with a merge commit, and pushed.",
        ),
        l(
          "İş bitince branch silinir. Commit'ler kaybolmaz, main'in geçmişinde duruyorlar; sadece isim gider. Eski branch'ler listede birikmesin diye bu önemli.",
          "Once the work is in, the branch is deleted. The commits are not lost: they are in main's history, and only the name goes. This keeps old branches from piling up.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "GitHub'da birleştirmenin üç yolu var: merge commit (burada), \"squash and merge\" (bütün PR tek commit olur) ve \"rebase and merge\" (commit'ler main'in üstüne dizilir). Ekip birini seçip ona uyar. Uzaktaki branch'i silmek için GitHub'daki düğme ya da `git push origin --delete feature/login`.",
            "GitHub offers three ways to merge: a merge commit (shown here), \"squash and merge\" (the whole PR becomes one commit) and \"rebase and merge\" (the commits line up on top of main). Teams pick one and stick to it. To delete the remote branch, use GitHub's button or `git push origin --delete feature/login`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git pull", note: l("Birleşen PR'ı yerel main'e al.", "Bring the merged PR into your local main.") },
          { cmd: "git branch -d feature/login", note: l("Birleşmiş branch'i yerelde sil.", "Delete the merged branch locally.") },
          { cmd: "git fetch --prune", note: l("Uzakta silinmiş branch'lerin etiketlerini de temizler.", "Also cleans up labels of branches deleted on the remote.") },
        ],
      },
    },
    {
      short: l("Trunk-based", "Trunk-based"),
      tag: "idea",
      predict: {
        question: l(
          "main'de küçük bir commit attık ama Bora yine önce push etti. `git pull --rebase` ne yapar?",
          "We made a small commit on main, but Bora pushed first again. What does `git pull --rebase` do?",
        ),
        options: [
          l("Bir merge commit oluşturur", "Creates a merge commit"),
          l("Bora'nın commit'ini alır, seninkini onun üstüne koyar: geçmiş düz kalır", "Takes Bora's commit and puts yours on top: history stays a straight line"),
          l("Senin commit'ini siler", "Deletes your commit"),
        ],
        answer: 1,
        why: l(
          "`pull --rebase` önce uzaktakini alır, sonra senin henüz push edilmemiş commit'lerini onun üstünde yeniden oynatır. Merge commit oluşmaz.",
          "`pull --rebase` first takes what is on the remote, then replays your unpushed commits on top of it. No merge commit is made.",
        ),
      },
      title: l("Trunk-based: küçük ve sık", "Trunk-based: small and often"),
      body: [
        l(
          "Bazı ekipler uzun ömürlü branch açmaz: herkes küçük değişiklikleri günde birkaç kez doğrudan main'e (trunk) gönderir. Bitmemiş özellikler kodda kapalı bir anahtarın (feature flag) arkasında bekler.",
          "Some teams skip long-lived branches: everyone sends small changes straight to main (the trunk) several times a day. Unfinished features wait behind a switched-off feature flag.",
        ),
        l(
          "Burada \"Tarih biçimi\" commit'ini attık, Bora araya girdi, `git pull --rebase` bizim commit'i onunkinin üstüne koydu ve push etti. Geçmiş düz bir çizgi.",
          "Here we committed \"Tarih biçimi\", Bora got in first, `git pull --rebase` put our commit on top of his, and we pushed. History is a straight line.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Hangisi daha iyi? Küçük ve deneyimli ekipler trunk-based ile hızlanır; açık kaynak ve inceleme ağırlıklı ekipler PR akışını sever. İkisinde de anahtar aynı: küçük değişiklikler, sık birleştirme, her zaman çalışan bir main.",
            "Which is better? Small, experienced teams go faster trunk-based; open source and review-heavy teams like the PR flow. The key is the same in both: small changes, frequent merges, and a main that always works.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git config --global pull.rebase true", note: l("`git pull` her seferinde rebase yapsın.", "Make every `git pull` rebase.") },
          { cmd: "git pull --rebase" },
          { cmd: "git push" },
        ],
      },
    },
    {
      short: l("Commit mesajı", "Commit messages"),
      tag: "reality",
      title: l("İyi commit mesajı, korunan main", "Good commit messages, a protected main"),
      body: [
        l(
          "Commit mesajı altı ay sonraki sana ve ekibe bırakılan not. İlk satır kısa (yaklaşık 50 karakter) ve emir kipinde: \"Fix the date format\", \"Tarih biçimini düzelt\". Gerekirse bir boş satırdan sonra **neden** değiştiğini yaz.",
          "A commit message is a note to you and your team six months from now. The first line is short (about 50 characters) and in the imperative: \"Fix the date format\". If needed, add a blank line and explain **why** it changed.",
        ),
        l(
          "Bazı ekipler **Conventional Commits** kullanır: `feat: add login form`, `fix: keep dates in GG.AA format`, `docs: add setup notes`. Bu düzen sürüm notlarının otomatik çıkarılmasını kolaylaştırır.",
          "Some teams use **Conventional Commits**: `feat: add login form`, `fix: keep dates in GG.AA format`, `docs: add setup notes`. The pattern makes generating release notes easy.",
        ),
        l(
          "GitHub'da main için **branch protection** açılır: doğrudan push yasak, PR ve en az bir onay şart, testler geçmeden birleştirme yok. Böylece \"main çalışıyor mu?\" sorusunun cevabı hep evet olur.",
          "On GitHub, turn on **branch protection** for main: no direct pushes, a PR with at least one approval required, no merging until the tests pass. Then the answer to \"does main work?\" is always yes.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git commit -m "fix: keep dates in GG.AA format" -m "Users in Turkey saw AA/GG after the format refactor."', note: l("İkinci `-m` açıklama paragrafı olur.", "The second `-m` becomes the body paragraph.") },
          { cmd: "git log --oneline -10", note: l("Son 10 mesaj okunur mu? Kontrol et.", "Are the last 10 messages readable? Check.") },
        ],
      },
    },
    {
      short: l("Günlük rutin", "Daily routine"),
      tag: "how",
      title: l("Kendi projen için günlük rutin", "A daily routine for your own project"),
      body: [
        l(
          "Bu kursta gördüklerin bir günlük akışta birleşiyor. Aşağıdaki kutu baştan sona kopyalayabileceğin bir rutin: güne güncel main ile başla, işi bir branch'te küçük commit'lerle yap, gün içinde güncel kal, PR ile birleştir, temizle.",
          "What you saw in this course comes together in one daily flow. The card below is a routine you can copy as is: start the day from the latest main, do the work on a branch in small commits, stay up to date during the day, merge through a PR, and clean up.",
        ),
        l(
          "Bir şey ters giderse paniğe gerek yok: `git status` nerede olduğunu söyler, `git reflog` kaybolan commit'i bulur, `git restore` ve `git revert` geri almanın güvenli yolları.",
          "If something goes wrong, no need to panic: `git status` tells you where you are, `git reflog` finds a lost commit, and `git restore` and `git revert` are the safe ways back.",
        ),
      ],
      practice: {
        intro: l("Her gün, her iş için:", "Every day, for every piece of work:"),
        commands: [
          { cmd: "git switch main && git pull", note: l("1. Güne güncel main ile başla.", "1. Start from the latest main.") },
          { cmd: "git switch -c feature/kisa-ad", note: l("2. İş için bir branch aç.", "2. Open a branch for the work.") },
          { cmd: "git status", note: l("3. Ne değişti? Sık sık bak.", "3. What changed? Look often.") },
          { cmd: "git add -p", note: l("4. Sadece bu commit'e ait parçaları seç.", "4. Pick only the parts that belong in this commit.") },
          { cmd: 'git commit -m "feat: ..."', note: l("5. Küçük, tek konulu commit.", "5. A small, single-topic commit.") },
          { cmd: "git fetch && git rebase origin/main", note: l("6. Gün içinde güncel main'in üstünde kal.", "6. Stay on top of the latest main during the day.") },
          { cmd: "git push -u origin HEAD", note: l("7. Gönder; ilk seferden sonra sadece `git push` (rebase ettiysen `--force-with-lease`).", "7. Push; after the first time just `git push` (`--force-with-lease` if you rebased).") },
          { cmd: "gh pr create --fill", note: l("8. PR aç, inceleme iste.", "8. Open a PR and ask for review.") },
          { cmd: "git switch main && git pull && git branch -d feature/kisa-ad", note: l("9. Birleşince temizle.", "9. Clean up once it is merged.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Repo'yu yeni klonladın; o arada Bora origin'deki main'e bir commit push etti ama sen henüz görmedin. Sağda origin'i, solda kendi repo'nu izleyebilirsin.",
          "You just cloned the repo, and meanwhile Bora pushed a commit to main on origin that you have not seen yet. Watch origin on the right and your repo on the left.",
        ),
        l(
          "Sahnenin altında **3 görev** var: PR için bir branch göndermek, trunk-based çalışıp geçmişi düz tutmak ve yanlışlıkla main'e atılan bir commit'i kurtarmak.",
          "Under the scene there are **3 missions**: push a branch for a PR, work trunk-based and keep history straight, and rescue a commit made on main by mistake.",
        ),
      ],
      practice: {
        intro: l("Yanlış branch'e commit attıysan (push etmeden):", "If you committed to the wrong branch (before pushing):"),
        commands: [
          { cmd: "git branch feature", note: l("Commit'e bir branch adı ver.", "Give the commit a branch name.") },
          { cmd: "git reset --hard origin/main", note: l("main'i uzaktaki haline geri çek.", "Pull main back to the remote's version.") },
          { cmd: "git switch feature" },
        ],
      },
    },
  ],
  recap: [
    l(
      "Her iş kendi branch'inde yapılır, `git push -u` ile gönderilir ve pull request ile incelenip main'e alınır.",
      "Each piece of work lives on its own branch, is sent with `git push -u`, and reaches main through a reviewed pull request.",
    ),
    l(
      "Origin senin haberin olmadan ilerler. `fetch` / `pull` ile güncel kal; kendi branch'ini `rebase` edip `--force-with-lease` ile gönderebilirsin.",
      "Origin moves on without telling you. Stay current with `fetch` / `pull`; you can `rebase` your own branch and send it with `--force-with-lease`.",
    ),
    l(
      "Trunk-based ekipler küçük değişiklikleri sık sık doğrudan main'e gönderir; `pull --rebase` geçmişi düz tutar.",
      "Trunk-based teams send small changes to main often; `pull --rebase` keeps history straight.",
    ),
    l(
      "İyi commit mesajı kısa, emir kipinde ve nedenini söyler. Conventional Commits isteğe bağlı bir düzen.",
      "A good commit message is short, in the imperative, and says why. Conventional Commits is an optional pattern.",
    ),
    l(
      "main korunur: doğrudan push yok, PR ve testler şart, paylaşılan branch'e asla zorla push edilmez.",
      "main is protected: no direct pushes, PRs and tests required, and shared branches are never force-pushed.",
    ),
  ],
  quiz: [
    {
      question: l(
        "PR branch'ini güncel main'e rebase ettin. Branch'i nasıl göndermelisin?",
        "You rebased your PR branch onto the latest main. How should you push it?",
      ),
      options: [l("`git push`", "`git push`"), l("`git push --force-with-lease`", "`git push --force-with-lease`"), l("`git push --force`", "`git push --force`"), l("Yeni bir branch adıyla", "Under a new branch name")],
      answer: 1,
      explain: l(
        "Rebase commit'leri yeniden yazdığı için normal push reddedilir. `--force-with-lease`, origin'de görmediğin bir commit varsa durur; `--force` durmaz.",
        "The rebase rewrote the commits, so a plain push is rejected. `--force-with-lease` stops if origin has a commit you have not seen; `--force` does not.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Takım arkadaşın origin'deki main'e push etti. Senin bilgisayarındaki main ne zaman güncellenir?",
        "A teammate pushed to main on origin. When does main on your computer update?",
      ),
      options: [
        l("Hemen, kendiliğinden", "Right away, by itself"),
        l("Sen `git pull` (ya da fetch + merge/rebase) yaptığında", "When you run `git pull` (or fetch + merge/rebase)"),
        l("Bir sonraki commit'inde", "On your next commit"),
        l("Hiçbir zaman", "Never"),
      ],
      answer: 1,
      explain: l("Git ağa sadece sen istediğinde gider.", "Git only goes to the network when you ask it to."),
      reviewStep: 4,
    },
    {
      question: l("Hangisi iyi bir commit mesajının ilk satırı?", "Which is a good first line for a commit message?"),
      options: [l("\"değişiklikler\"", "\"changes\""), l("\"Fix date format for Turkish users\"", "\"Fix date format for Turkish users\""), l("\"asdf\"", "\"asdf\""), l("\"Cuma günü yaptıklarım\"", "\"Stuff I did on Friday\"")],
      answer: 1,
      explain: l("Kısa, emir kipinde ve neyi neden değiştirdiğini anlatıyor.", "Short, imperative, and it says what changed and for whom."),
      reviewStep: 8,
    },
    {
      question: l(
        "Yanlışlıkla main'de bir commit attın, henüz push etmedin. Onu bir feature branch'e nasıl taşırsın?",
        "You committed on main by mistake and have not pushed. How do you move it to a feature branch?",
      ),
      options: [
        l("`git branch feature` sonra `git reset --hard origin/main`", "`git branch feature`, then `git reset --hard origin/main`"),
        l("`git push --force`", "`git push --force`"),
        l("Commit'i silip baştan yaz", "Delete it and redo the work"),
        l("`git revert HEAD` ve devam", "`git revert HEAD` and carry on"),
      ],
      answer: 0,
      explain: l(
        "Önce commit'e bir branch adı verirsin, böylece kaybolmaz; sonra main'i uzaktaki haline geri çekersin.",
        "First give the commit a branch name so it is not lost; then pull main back to the remote's version.",
      ),
      reviewStep: 10,
    },
  ],
};
