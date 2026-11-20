import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const remotes: Lesson = {
  slug: "remotes",
  title: l("Remote: clone, fetch, pull, push", "Remotes: clone, fetch, pull, push"),
  summary: l(
    "GitHub'daki repo ile bilgisayarındaki repo iki ayrı kopya. `origin/main`'in ne olduğunu, `fetch`, `pull` ve `push`'un hangi okları taşıdığını gör.",
    "The repo on GitHub and the one on your computer are two separate copies. See what `origin/main` is, and which pointers `fetch`, `pull` and `push` move.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("clone'un tam bir kopya oluşturduğunu bilmek", "Know that clone makes a full copy"), step: 0 },
    { text: l("`origin/main`'in uzak branch'in son bilinen yeri olduğunu anlamak", "Understand that `origin/main` is the remote branch's last known position"), step: 3 },
    { text: l("`fetch` ile `pull` arasındaki farkı görmek", "See the difference between `fetch` and `pull`"), step: 6 },
    { text: l("Yeni bir branch'i `push -u` ile göndermek", "Push a new branch with `push -u`"), step: 8 },
  ],
  steps: [
    {
      short: l("clone", "clone"),
      tag: "how",
      title: l("clone: bütün geçmişin tam kopyası", "clone: a full copy of the whole history"),
      body: [
        l(
          "Sağda GitHub'daki repo var. Git ona varsayılan olarak [[remote]] adı `origin` der. Solda da `git clone` ile bilgisayarına indirdiğin kopya.",
          "On the right is the repo on GitHub. Git calls this [[remote]] `origin` by default. On the left is the copy you downloaded with `git clone`.",
        ),
        l(
          "İki grafik aynı: clone sadece son hali değil, **bütün commit'leri** indirir. Artık internet olmadan da geçmişe bakabilir, commit atabilir, branch açabilirsin.",
          "The two graphs match: clone downloads not just the latest files but **every commit**. Now you can browse history, commit and branch without the internet.",
        ),
        l(
          "Soldaki kesik çizgili `origin/main` etiketine dikkat: bu, senin bilgisayarının \"origin'deki main en son buradaydı\" notu.",
          "Note the dashed `origin/main` label on the left: it is your computer's note that \"main on origin was here last time I looked\".",
        ),
      ],
      practice: {
        intro: l("GitHub'daki bir projeyi bilgisayarına almak:", "Getting a GitHub project onto your computer:"),
        commands: [
          { cmd: "git clone https://github.com/kullanici/proje.git", note: l("Repo'yu `proje` klasörüne indirir ve `origin` adıyla bağlar.", "Downloads the repo into a `proje` folder and links it as `origin`.") },
          { cmd: "cd proje" },
          { cmd: "git remote -v", note: l("origin'in adresini gösterir.", "Shows origin's address.") },
          { cmd: "git branch -a", note: l("Yerel branch'leri ve `remotes/origin/...` takip branch'lerini listeler.", "Lists local branches and the `remotes/origin/...` tracking branches.") },
        ],
      },
    },
    {
      short: l("Yerel commit", "Local commit"),
      tag: "how",
      predict: {
        question: l(
          "Bilgisayarında bir commit atacağız. GitHub'daki (origin) main'e ne olur?",
          "We will make a commit on your computer. What happens to main on GitHub (origin)?",
        ),
        options: [
          l("Hemen o da ilerler", "It moves forward right away too"),
          l("Hiçbir şey: sen gönderene kadar haberi olmaz", "Nothing: it does not know until you send it"),
          l("origin/main silinir", "origin/main is deleted"),
        ],
        answer: 1,
        why: l(
          "Commit sadece senin bilgisayarındaki repo'ya yazılır. Git hiçbir şeyi kendiliğinden göndermez; uzağa sadece `git push` yazınca gider.",
          "A commit is written only to the repo on your computer. Git never sends anything on its own; it goes to the remote only when you `git push`.",
        ),
      },
      title: l("Commit önce sadece sende", "A commit lives only on your side at first"),
      body: [
        l(
          "app.js'i değiştirip commit attık. Solda `main` bir adım ilerledi, ama `origin/main` ve sağdaki origin yerinde duruyor.",
          "We changed app.js and committed. On the left `main` moved one step, but `origin/main` and origin on the right stay where they were.",
        ),
        l(
          "Sayaçta **Önde: 1** yazıyor: senin main'in, origin'in bilmediği bir commit'e sahip. `git status` de bunu \"Your branch is ahead of 'origin/main' by 1 commit\" diye söyler.",
          "The counter says **Ahead: 1**: your main has a commit origin does not know. `git status` says the same: \"Your branch is ahead of 'origin/main' by 1 commit\".",
        ),
      ],
      practice: {
        commands: [{ cmd: "git status", note: l("\"ahead of 'origin/main' by 1 commit\": gönderilmemiş 1 commit var.", "\"ahead of 'origin/main' by 1 commit\": 1 commit not sent yet.") }],
      },
    },
    {
      short: l("push", "push"),
      tag: "how",
      title: l("git push: commit'leri origin'e gönder", "git push: send your commits to origin"),
      body: [
        l(
          "`git push` senin main'indeki yeni commit'i origin'e gönderdi. Sağdaki main de aynı commit'i gösteriyor, `origin/main` de oraya kaydı.",
          "`git push` sent the new commit on your main to origin. main on the right points at the same commit, and `origin/main` moved there too.",
        ),
        l("Önde ve geride sayıları artık 0: iki taraf eşit.", "Ahead and behind are now 0: both sides match."),
      ],
      practice: {
        commands: [{ cmd: "git push", note: l("Bulunduğun branch'i bağlı olduğu uzak branch'e gönderir.", "Sends your branch to the remote branch it is linked to.") }],
      },
    },
    {
      short: l("Bora push etti", "Bora pushed"),
      tag: "how",
      predict: {
        question: l(
          "Takım arkadaşın Bora, origin'e bir commit push etti. Senin bilgisayarındaki `origin/main` şimdi neyi gösterir?",
          "Your teammate Bora pushed a commit to origin. What does `origin/main` on your computer show now?",
        ),
        options: [
          l("Bora'nın yeni commit'ini, kendiliğinden güncellenir", "Bora's new commit; it updates on its own"),
          l("Hâlâ eski commit'i: sen sorana kadar bilmez", "Still the old commit: it does not know until you ask"),
          l("Hiçbir şey, silinir", "Nothing; it is removed"),
        ],
        answer: 1,
        why: l(
          "`origin/main` canlı bir bağlantı değil, en son baktığın andan kalma bir not. Uzakta bir şey olunca bilgisayarın bundan haberdar olmaz.",
          "`origin/main` is not a live link but a note from the last time you looked. When something happens on the remote, your computer does not hear about it.",
        ),
      },
      title: l("origin/main: son bildiğin yer", "origin/main: where you last saw it"),
      body: [
        l(
          "Sağda origin'in main'i Bora'nın commit'ine ilerledi. Ama solda `origin/main` hâlâ eski yerde, çünkü bilgisayarın uzağa hiç sormadı.",
          "On the right, origin's main moved to Bora's commit. But on the left `origin/main` is still at the old place, because your computer never asked.",
        ),
        l(
          "Bu tür ref'lere **remote-tracking branch** denir. Kendin taşıyamazsın; sadece `fetch`, `pull` ve `push` onları günceller.",
          "These refs are called **remote-tracking branches**. You cannot move them yourself; only `fetch`, `pull` and `push` update them.",
        ),
      ],
    },
    {
      short: l("fetch", "fetch"),
      tag: "how",
      predict: {
        question: l("`git fetch` çalıştıracağız. Senin `main` branch'in nereye kayar?", "We will run `git fetch`. Where does your `main` branch move?"),
        options: [
          l("Bora'nın commit'ine ilerler", "Forward to Bora's commit"),
          l("Hiçbir yere: sadece origin/main güncellenir", "Nowhere: only origin/main is updated"),
          l("Silinir ve yeniden oluşturulur", "It is deleted and created again"),
        ],
        answer: 1,
        why: l(
          "fetch yeni commit'leri indirir ve `origin/main`'i taşır. Senin branch'lerine dokunmaz, yani her zaman güvenlidir.",
          "fetch downloads new commits and moves `origin/main`. It never touches your branches, so it is always safe.",
        ),
      },
      title: l("git fetch: indir ama dokunma", "git fetch: download, do not touch"),
      body: [
        l(
          "`git fetch` Bora'nın commit'ini indirdi ve `origin/main`'i oraya taşıdı. Senin `main`'in yerinde duruyor; sayaçta **Geride: 1** yazıyor.",
          "`git fetch` downloaded Bora's commit and moved `origin/main` there. Your `main` stays put; the counter shows **Behind: 1**.",
        ),
        l(
          "fetch, \"uzakta ne olmuş?\" sorusunun cevabı. Önce bakarsın, sonra ne yapacağına karar verirsin.",
          "fetch answers \"what happened on the remote?\". You look first, then decide what to do.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git fetch", note: l("Uzaktaki yenilikleri indirir; kendi branch'lerin değişmez.", "Downloads what is new on the remote; your branches do not change.") },
          { cmd: "git log main..origin/main --oneline", note: l("Uzakta olup sende olmayan commit'leri listeler.", "Lists the commits on the remote that you do not have.") },
        ],
      },
    },
    {
      short: l("Birleştir", "Merge in"),
      tag: "how",
      title: l("origin/main'i kendi main'ine al", "Bring origin/main into your main"),
      body: [
        l(
          "`git merge origin/main` ile indirilen commit'i kendi main'ine aldık. Sen yeni bir şey yapmadığın için bu bir **fast-forward**: main sadece ileri kaydı.",
          "`git merge origin/main` brought the downloaded commit into your main. You had nothing new, so this is a **fast-forward**: main just slid forward.",
        ),
        l("Önde ve geride tekrar 0.", "Ahead and behind are 0 again."),
      ],
      practice: {
        commands: [{ cmd: "git merge origin/main" }],
      },
    },
    {
      short: l("pull", "pull"),
      tag: "idea",
      title: l("git pull = fetch + merge", "git pull = fetch + merge"),
      body: [
        l(
          "Bora bir commit daha gönderdi. Bu sefer tek komut kullandık: `git pull`. Önce fetch yaptı (`origin/main` kaydı), sonra onu main'e birleştirdi.",
          "Bora sent one more commit. This time we used a single command: `git pull`. It fetched first (`origin/main` moved), then merged it into main.",
        ),
        l(
          "Pull pratik ama iki işi birden yapar. Uzakta ne olduğunu görmeden birleştirmek istemiyorsan önce `fetch`, sonra `merge` yap.",
          "Pull is handy but does two things at once. If you want to see what happened before merging, do `fetch` and then `merge`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`git pull --rebase` merge yerine rebase yapar: senin yerel commit'lerini uzaktakilerin üstüne yeniden yazar ve geçmiş düz kalır. Bir sonraki derste ikisini karşılaştırıyoruz.",
            "`git pull --rebase` rebases instead of merging: it replays your local commits on top of the remote ones, keeping history straight. The next lesson compares the two.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git pull", note: l("fetch + merge (veya ayarına göre rebase).", "fetch + merge (or rebase, depending on your settings).") },
          { cmd: "git pull --rebase", note: l("Yerel commit'lerini uzaktakilerin üstüne taşır.", "Moves your local commits on top of the remote ones.") },
        ],
      },
    },
    {
      short: l("Yeni branch", "New branch"),
      tag: "problem",
      predict: {
        question: l(
          "Yeni `feature` branch'inde bir commit attık. İlk kez sadece `git push` yazınca ne olur?",
          "We made a commit on a new `feature` branch. What happens the first time we type just `git push`?",
        ),
        options: [
          l("Gönderir, origin'de feature açılır", "It sends it and feature appears on origin"),
          l("Reddeder: bu branch'in uzakta karşılığı yok", "It refuses: this branch has no counterpart on the remote yet"),
          l("Commit'i main'e gönderir", "It sends the commit to main"),
        ],
        answer: 1,
        why: l(
          "Yeni bir branch'in henüz bağlı olduğu bir uzak branch (upstream) yok. Git nereye göndereceğini tahmin etmez ve `--set-upstream` ile söylemeni ister.",
          "A new branch has no upstream yet. Git does not guess where to send it and asks you to say so with `--set-upstream`.",
        ),
      },
      title: l("Yeni branch'in uzakta karşılığı yok", "A new branch has no remote counterpart"),
      body: [
        l(
          "`git switch -c feature` ile branch açtık, `search.js` ekleyip commit attık. `git push` reddetti: \"The current branch feature has no upstream branch.\"",
          "We created a branch with `git switch -c feature`, added `search.js` and committed. `git push` refused: \"The current branch feature has no upstream branch.\"",
        ),
        l("Sağdaki origin'de feature yok; hiçbir şey gönderilmedi.", "origin on the right has no feature; nothing was sent."),
      ],
      practice: {
        commands: [
          { cmd: "git switch -c feature" },
          { cmd: "git push", note: l("\"has no upstream branch\" hatası verir.", "Fails with \"has no upstream branch\".") },
        ],
      },
    },
    {
      short: l("push -u", "push -u"),
      tag: "how",
      title: l("git push -u: bir kez söyle, sonra hatırlasın", "git push -u: say it once, then it remembers"),
      body: [
        l(
          "`git push -u origin feature` branch'i origin'e gönderdi ve iki branch'i birbirine bağladı. Sağda feature göründü, solda da `origin/feature` etiketi.",
          "`git push -u origin feature` sent the branch to origin and linked the two. feature appears on the right, and `origin/feature` on the left.",
        ),
        l(
          "`-u` (`--set-upstream`) sadece ilk seferde gerekir. Bundan sonra bu branch'te düz `git push` ve `git pull` yeter.",
          "`-u` (`--set-upstream`) is only needed the first time. After that, plain `git push` and `git pull` work on this branch.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git push -u origin feature", note: l("Branch'i gönderir ve takip bağlantısını kurar.", "Sends the branch and sets up tracking.") },
          { cmd: "git config --global push.autoSetupRemote true", note: l("Yeni branch'lerde `-u`'yu kendisi yapar (Git 2.37+).", "Does the `-u` for new branches automatically (Git 2.37+).") },
        ],
      },
    },
    {
      short: l("Önde, geride", "Ahead, behind"),
      tag: "reality",
      title: l("Önde ve geride: her gün okuyacağın iki sayı", "Ahead and behind: two numbers you will read daily"),
      body: [
        l(
          "**Önde (ahead)**: sende olup uzakta olmayan commit sayısı, yani push edilmeyi bekleyenler. **Geride (behind)**: uzakta olup sende olmayanlar, yani pull edilmeyi bekleyenler.",
          "**Ahead**: commits you have that the remote does not, waiting to be pushed. **Behind**: commits on the remote that you do not have, waiting to be pulled.",
        ),
        l(
          "İkisi birden 0'dan büyükse branch'ler **ayrılmış** demektir: hem sen hem başkası commit atmış. Bu durumda push reddedilir; nasıl çözüleceği bir sonraki dersin konusu.",
          "If both are above 0 the branches have **diverged**: you and someone else both committed. Then push is refused; how to sort it out is the next lesson.",
        ),
        l(
          "Unutma: bu sayılar `origin/main`'e göre hesaplanır, o da en son fetch'ten kalmadır. Doğru sayı için önce `git fetch`.",
          "Remember: these numbers are computed against `origin/main`, which is only as fresh as your last fetch. For a true count, `git fetch` first.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede tek bir remote (origin) var. Gerçekte bir repo'nun birden fazla remote'u olabilir: örneğin fork'larda kendi kopyan `origin`, asıl proje `upstream` diye eklenir.",
            "This scene has one remote (origin). In reality a repo can have several: with forks, your copy is `origin` and the original project is usually added as `upstream`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git fetch && git status", note: l("Güncel önde/geride sayısını gösterir.", "Shows an up-to-date ahead/behind count.") },
          { cmd: "git branch -vv", note: l("Her branch'in neyi takip ettiğini ve önde/geride sayısını listeler.", "Lists each branch's upstream and its ahead/behind count.") },
          { cmd: "git fetch --prune", note: l("Uzakta silinmiş branch'lerin `origin/...` kayıtlarını da temizler.", "Also cleans up `origin/...` refs for branches deleted on the remote.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Solda senin repo'n, sağda GitHub'daki origin var. Aşağıda gerçek işten **5 senaryo** bekliyor: gönderilmemiş bir commit, Bora'nın push'u, reddedilen bir push, yeni bir branch. Komutları terminale **kendin yaz**; sahne her komutta iki tarafta ne olduğunu gösterir.",
          "Your turn. Your repo is on the left, origin on GitHub on the right. Below are **5 scenarios** from real work: a commit that was never pushed, Bora's push, a rejected push, a new branch. **Type the commands yourself** in the terminal; the scene shows what each one does on both sides.",
        ),
        l(
          "Takılırsan `git status` yaz: önde ya da geride olduğunu söyler. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `git status`: it tells you whether you're ahead or behind. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`git clone` uzaktaki repo'nun bütün geçmişini indirir; uzaktaki kopyanın adı varsayılan olarak `origin`.", "`git clone` downloads a remote repo's whole history; the remote copy is called `origin` by default."),
    l("`origin/main` uzaktaki main'in en son bilinen yeri; kendiliğinden güncellenmez.", "`origin/main` is where main on the remote was last seen; it does not update on its own."),
    l("`git fetch` indirir ve `origin/...`'leri taşır; senin branch'lerine dokunmaz.", "`git fetch` downloads and moves the `origin/...` refs; it never touches your branches."),
    l("`git pull` = fetch + merge (veya `--rebase` ile rebase).", "`git pull` = fetch + merge (or rebase with `--rebase`)."),
    l("`git push` commit'lerini gönderir; yeni bir branch'i ilk kez `git push -u origin branch` ile gönderirsin.", "`git push` sends your commits; you push a new branch the first time with `git push -u origin branch`."),
    l("Önde = gönderilmeyi bekleyen commit'ler, geride = alınmayı bekleyenler.", "Ahead = commits waiting to be pushed, behind = commits waiting to be pulled."),
  ],
  quiz: [
    {
      question: l("`git fetch` sonrası hangisi kesinlikle değişmez?", "After `git fetch`, which of these never changes?"),
      options: [l("`origin/main`", "`origin/main`"), l("Senin `main` branch'in", "Your `main` branch"), l("İndirilen commit'ler", "The downloaded commits"), l("`git status` çıktısı", "The output of `git status`")],
      answer: 1,
      explain: l("fetch sadece remote-tracking branch'leri taşır; yerel branch'lerine dokunmaz.", "fetch only moves remote-tracking branches; your local branches stay."),
      reviewStep: 4,
    },
    {
      question: l("`git pull` neye eşittir?", "What is `git pull` equal to?"),
      options: [l("`git push` + `git fetch`", "`git push` + `git fetch`"), l("`git fetch` + `git merge` (ya da rebase)", "`git fetch` + `git merge` (or rebase)"), l("`git clone`", "`git clone`"), l("`git commit` + `git push`", "`git commit` + `git push`")],
      answer: 1,
      explain: l("pull önce fetch eder, sonra indirileni bulunduğun branch'e birleştirir.", "pull fetches first, then merges what it downloaded into your branch."),
      reviewStep: 6,
    },
    {
      question: l("Yeni açtığın bir branch'i ilk kez göndermek için hangi komut?", "Which command sends a brand-new branch for the first time?"),
      options: [l("`git push`", "`git push`"), l("`git push -u origin feature`", "`git push -u origin feature`"), l("`git fetch feature`", "`git fetch feature`"), l("`git pull origin feature`", "`git pull origin feature`")],
      answer: 1,
      explain: l("`-u` branch'i gönderir ve uzaktakiyle bağlar; sonra düz `git push` yeter.", "`-u` sends the branch and links it; plain `git push` is enough after that."),
      reviewStep: 8,
    },
    {
      question: l("`git status` \"ahead by 2, behind by 1\" diyor. Ne demek?", "`git status` says \"ahead by 2, behind by 1\". What does it mean?"),
      options: [
        l("2 commit'in gönderilmedi, uzakta da sende olmayan 1 commit var", "2 of your commits are not pushed, and the remote has 1 you do not have"),
        l("3 commit kayboldu", "3 commits were lost"),
        l("2 dosya değişti, 1 dosya silindi", "2 files changed, 1 was deleted"),
        l("Her şey güncel", "Everything is up to date"),
      ],
      answer: 0,
      explain: l("Önde = gönderilmeyi bekleyen, geride = alınmayı bekleyen commit'ler. İkisi birden varsa branch'ler ayrılmıştır.", "Ahead = waiting to be pushed, behind = waiting to be pulled. Both means the branches have diverged."),
      reviewStep: 9,
    },
  ],
};
