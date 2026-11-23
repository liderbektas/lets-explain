import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const collaboration: Lesson = {
  slug: "collaboration",
  title: l("Birlikte çalışmak", "Working together"),
  summary: l(
    "İki kişi aynı branch'e push edince ne olur? Reddedilen push, pull ile merge ve rebase, `--force` ile `--force-with-lease` farkı ve GitHub'da pull request akışı.",
    "What happens when two people push to the same branch? A rejected push, pulling with merge or rebase, `--force` versus `--force-with-lease`, and the pull request flow on GitHub.",
  ),
  minutes: 16,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Push'un neden reddedildiğini anlamak", "Understand why a push is rejected"), step: 1 },
    { text: l("pull'un merge ve rebase hallerini karşılaştırmak", "Compare pull with merge and with rebase"), step: 4 },
    { text: l("`--force-with-lease`'in başkasının işini nasıl koruduğunu görmek", "See how `--force-with-lease` protects other people's work"), step: 5 },
    { text: l("Branch, push ve pull request akışını kendi projende uygulamak", "Run the branch, push and pull request flow in your own project"), step: 7 },
  ],
  steps: [
    {
      short: l("İkiniz de", "Both of you"),
      tag: "problem",
      title: l("Sen ve Bora aynı anda çalışıyorsunuz", "You and Bora work at the same time"),
      body: [
        l(
          "Sen app.js'te bir değişiklik yapıp commit attın, henüz göndermedin. Bu sırada takım arkadaşın Bora da bir not ekleyip origin'e **senden önce** push etti.",
          "You changed app.js and committed, but have not sent it yet. Meanwhile your teammate Bora added a note and pushed to origin **before you**.",
        ),
        l(
          "Grafiklere bak: solda senin main'in senin commit'inde, sağda origin'in main'i Bora'nın commit'inde. İkisi de aynı yerden ayrıldı ama farklı yönlere gitti.",
          "Look at the graphs: on the left your main is on your commit, on the right origin's main is on Bora's. Both started from the same commit and went different ways.",
        ),
      ],
    },
    {
      short: l("Reddedildi", "Rejected"),
      tag: "problem",
      predict: {
        question: l("Şimdi `git push` yazarsan ne olur?", "What happens if you type `git push` now?"),
        options: [
          l("Bora'nın commit'inin üstüne yazar", "It overwrites Bora's commit"),
          l("Reddedilir: origin'deki main ilerlemiş", "It is rejected: main on origin has moved on"),
          l("İkisini otomatik birleştirir", "It merges the two automatically"),
        ],
        answer: 1,
        why: l(
          "Push sadece uzaktaki branch'i ileri kaydırabilir (fast-forward). Senin commit'in Bora'nınkinin üstüne kurulmadığı için kabul etmek onun commit'ini silmek olurdu; Git reddeder.",
          "A push may only slide the remote branch forward (fast-forward). Your commit is not built on Bora's, so accepting it would erase his. Git refuses.",
        ),
      },
      title: l("Push reddedildi", "The push is rejected"),
      body: [
        l(
          "`git push` geri çevrildi: \"rejected … (fetch first)\". origin'de hiçbir şey değişmedi; Bora'nın işi güvende.",
          "`git push` was turned down: \"rejected … (fetch first)\". Nothing changed on origin; Bora's work is safe.",
        ),
        l(
          "Bu bir hata değil, bir uyarı: \"önce başkalarının yaptığını al\". Çözüm her zaman aynı: önce pull, sonra push.",
          "This is not a failure but a warning: \"get what others did first\". The fix is always the same: pull, then push.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git push", note: l("\"! [rejected] main -> main (fetch first)\" görürsen önce pull yap.", "If you see \"! [rejected] main -> main (fetch first)\", pull first.") }],
      },
    },
    {
      short: l("pull (merge)", "pull (merge)"),
      tag: "how",
      predict: {
        question: l("`git pull` çalıştıracağız. Sonra senin geçmişin nasıl görünür?", "We will run `git pull`. What does your history look like afterwards?"),
        options: [
          l("İkisini birleştiren, iki ebeveynli bir merge commit oluşur", "A merge commit with two parents joins the two"),
          l("Senin commit'in silinir", "Your commit is deleted"),
          l("Bora'nın commit'i silinir", "Bora's commit is deleted"),
        ],
        answer: 0,
        why: l(
          "pull önce Bora'nın commit'ini indirir, sonra iki ucu merge eder. İkisi de farklı dosyaları değiştirdiği için conflict çıkmaz ve iki ebeveynli bir merge commit oluşur.",
          "pull downloads Bora's commit, then merges the two tips. They changed different files, so there is no conflict and a merge commit with two parents appears.",
        ),
      },
      title: l("git pull: onunkini al, birleştir", "git pull: take his, merge"),
      body: [
        l(
          "`git pull` Bora'nın commit'ini indirdi ve senin commit'inle birleştirdi. Solda yeni bir **merge commit** var; iki ebeveyni, iki ayrı çizgiyi bir araya getiriyor.",
          "`git pull` downloaded Bora's commit and merged it with yours. A new **merge commit** appears on the left, with two parents joining the two lines.",
        ),
        l("Artık senin main'in Bora'nın commit'ini de içeriyor, yani origin'in bir adım ilerisinde.", "Your main now contains Bora's commit too, so it is one step ahead of origin."),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Git 2.27'den beri, iki taraf ayrılmışsa ve ne yapacağını ayarlamadıysan pull bir uyarı verir (daha yeni sürümlerde durur) ve seçmeni ister: `git config pull.rebase false` (merge), `true` (rebase) ya da `pull.ff only` (sadece fast-forward). Bir kez seç, sonra sormaz.",
            "Since Git 2.27, if the branches have diverged and you never configured it, pull warns (and in newer versions stops) and asks you to choose: `git config pull.rebase false` (merge), `true` (rebase) or `pull.ff only` (fast-forward only). Choose once and it stops asking.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git pull", note: l("Uzaktakini alır ve birleştirir.", "Fetches and merges.") },
          { cmd: "git config --global pull.rebase false", note: l("Ayrılan branch'lerde pull merge yapsın (bu adımdaki davranış).", "Make pull merge on diverged branches (the behaviour in this step).") },
        ],
      },
    },
    {
      short: l("push", "push"),
      tag: "how",
      title: l("Şimdi push kabul edilir", "Now the push is accepted"),
      body: [
        l(
          "Senin main'in artık Bora'nın commit'ini içerdiği için origin'in main'ini sadece ileri kaydırmak yetiyor. `git push` geçti; sağda da merge commit göründü.",
          "Your main now contains Bora's commit, so origin's main only needs to slide forward. `git push` goes through, and the merge commit appears on the right too.",
        ),
      ],
      practice: { commands: [{ cmd: "git push" }] },
    },
    {
      short: l("pull --rebase", "pull --rebase"),
      tag: "experiment",
      predict: {
        question: l(
          "Aynı durum bir kez daha oldu, bu sefer `git pull --rebase` kullanacağız. Senin commit'inin kimliğine ne olur?",
          "The same thing happened again; this time we use `git pull --rebase`. What happens to your commit's id?",
        ),
        options: [
          l("Aynı kalır", "It stays the same"),
          l("Değişir: commit Bora'nınkinin üstüne yeniden yazılır", "It changes: the commit is rewritten on top of Bora's"),
          l("Commit silinir", "The commit is deleted"),
        ],
        answer: 1,
        why: l(
          "Rebase senin commit'ini Bora'nınkinin üstünde yeniden oynatır. Ebeveyni değiştiği için yeni bir commit, yeni bir kimlik olur. Karşılığında merge commit oluşmaz, geçmiş düz bir çizgi kalır.",
          "Rebase replays your commit on top of Bora's. Its parent changes, so it becomes a new commit with a new id. In return there is no merge commit and history stays a straight line.",
        ),
      },
      title: l("git pull --rebase: düz bir çizgi", "git pull --rebase: a straight line"),
      body: [
        l(
          "Sen \"app.js: renkler\" commit'ini attın, Bora yine senden önce push etti. `git pull --rebase` senin commit'ini Bora'nınkinin **üstünde** yeniden oynattı: yeni kimlikli bir kopya oldu, merge commit yok.",
          "You committed \"app.js: renkler\" and Bora pushed first again. `git pull --rebase` replayed your commit **on top of** his: it became a copy with a new id, and there is no merge commit.",
        ),
        l(
          "Sonra `git push` doğrudan geçti. Sağdaki geçmiş tek bir çizgi: önce Bora, sonra sen.",
          "Then `git push` went straight through. The history on the right is a single line: Bora first, then you.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Merge mi rebase mi? Merge olanı olduğu gibi kaydeder, rebase okunması kolay düz bir geçmiş verir. Birçok takım kendi yerel commit'lerini güncellemek için `pull --rebase` kullanır, branch'leri birleştirmek için de merge.",
            "Merge or rebase? Merge records what happened as it was; rebase gives a straight history that is easy to read. Many teams use `pull --rebase` to update their own local commits and merge to join branches.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git pull --rebase", note: l("Yerel commit'lerini uzaktakilerin üstünde yeniden oynatır.", "Replays your local commits on top of the remote ones.") },
          { cmd: "git config --global pull.rebase true", note: l("Bundan sonra her pull rebase yapsın.", "Make every pull rebase from now on.") },
        ],
      },
    },
    {
      short: l("Lease", "Lease"),
      tag: "experiment",
      predict: {
        question: l(
          "Son commit'inin mesajını `--amend` ile düzelttin ve `git push --force-with-lease` yazdın. Ama Bora bu arada bir commit daha push etmişti ve sen onu henüz görmedin. Ne olur?",
          "You fixed your last commit's message with `--amend` and ran `git push --force-with-lease`. But Bora pushed another commit meanwhile and you have not seen it. What happens?",
        ),
        options: [
          l("Zorla gönderir, Bora'nın commit'i gider", "It forces the push and Bora's commit is gone"),
          l("Reddeder: uzakta görmediğin bir commit var", "It refuses: there is a commit on the remote you have not seen"),
          l("Bora'nın commit'ini otomatik alır", "It brings in Bora's commit automatically"),
        ],
        answer: 1,
        why: l(
          "--force-with-lease \"zorla gönder, ama sadece uzak branch hâlâ en son gördüğüm yerdeyse\" der. Bora onu ilerletmiş, `origin/main` de bunu bilmiyor; o yüzden push durur.",
          "--force-with-lease says \"force it, but only if the remote branch is still where I last saw it\". Bora moved it and your `origin/main` does not know, so the push stops.",
        ),
      },
      title: l("--force-with-lease: güvenli zorlama", "--force-with-lease: forcing safely"),
      body: [
        l(
          "Daha önce push ettiğin bir commit'i değiştirince (amend, rebase) yerel geçmişin uzaktakiyle uyuşmaz ve düz push reddedilir. Göndermek için zorlamak gerekir.",
          "Once you change a commit you already pushed (amend, rebase), your local history no longer matches the remote and a plain push is refused. Sending it needs a force.",
        ),
        l(
          "`--force-with-lease` reddetti: origin'de Bora'nın \"README düzeltildi\" commit'i var ve senin `origin/main`'in onu hiç görmedi. Kilit (lease) onu korudu.",
          "`--force-with-lease` refused: origin has Bora's \"README düzeltildi\" commit, which your `origin/main` never saw. The lease protected it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git commit --amend -m "Daha iyi mesaj"' },
          { cmd: "git push --force-with-lease", note: l("Uzakta görmediğin bir şey varsa reddeder.", "Refuses if the remote has something you have not seen.") },
        ],
      },
    },
    {
      short: l("--force", "--force"),
      tag: "problem",
      title: l("--force: başkasının işini siler", "--force: it erases other people's work"),
      body: [
        l(
          "Aynı yerde düz `git push --force` yazınca soru sorulmadı. origin'in main'i senin commit'ine kaydı; Bora'nın commit'i sağda soluk, kesik çizgili duruyor: artık hiçbir branch onu göstermiyor.",
          "A plain `git push --force` at the same point asks nothing. origin's main jumps to your commit; Bora's commit on the right is faded and dashed: no branch points at it any more.",
        ),
        l(
          "Bora bir sonraki pull'da işinin kaybolduğunu görecek. Paylaşılan bir branch'e **asla düz --force yapma**; gerekirse `--force-with-lease` kullan ve önce takımla konuş.",
          "Bora will find his work gone at his next pull. **Never plain --force a shared branch**; if you must, use `--force-with-lease` and talk to the team first.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "GitHub'da main gibi önemli branch'ler için \"branch protection\" açılabilir: force push'u ve doğrudan push'u engeller, değişikliklerin pull request ile gelmesini zorunlu kılar.",
            "On GitHub you can turn on branch protection for important branches like main: it blocks force pushes and direct pushes, and requires changes to come through pull requests.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "git push --force", note: l("Uzaktakinin üstüne koşulsuz yazar. Paylaşılan branch'lerde kullanma.", "Overwrites the remote unconditionally. Do not use on shared branches.") }],
      },
    },
    {
      short: l("PR: branch", "PR: branch"),
      tag: "how",
      title: l("Pull request için bir branch aç ve gönder", "Create a branch for a pull request and push it"),
      body: [
        l(
          "Takımlar genelde main'e doğrudan push etmez. Her iş kendi branch'inde yapılır: `feature` açtık, `search.js` ekleyip commit attık ve `git push -u origin feature` ile gönderdik.",
          "Teams usually do not push straight to main. Each piece of work gets its own branch: we created `feature`, added `search.js`, committed, and sent it with `git push -u origin feature`.",
        ),
        l(
          "Sağda origin'de artık `feature` branch'i var. GitHub bu noktada \"Compare & pull request\" düğmesini gösterir.",
          "origin on the right now has a `feature` branch. At this point GitHub shows a \"Compare & pull request\" button.",
        ),
      ],
      practice: {
        intro: l("Bir pull request'in yolu, kendi projende:", "The path of a pull request, in your own project:"),
        commands: [
          { cmd: "git switch -c arama-ozelligi", note: l("İş için kısa ömürlü bir branch aç.", "Open a short-lived branch for the work.") },
          { cmd: 'git commit -am "Arama kutusu eklendi"' },
          { cmd: "git push -u origin arama-ozelligi", note: l("Branch'i GitHub'a gönder.", "Send the branch to GitHub.") },
          { cmd: "gh pr create --fill", note: l("GitHub CLI ile PR aç (ya da GitHub'da \"Compare & pull request\").", "Open the PR with the GitHub CLI (or \"Compare & pull request\" on GitHub).") },
        ],
      },
    },
    {
      short: l("PR: merge", "PR: merge"),
      tag: "how",
      title: l("PR merge edildi: main'i güncelle, branch'i sil", "The PR is merged: update main, delete the branch"),
      body: [
        l(
          "Takım arkadaşların PR'ı inceledi ve onayladı. GitHub'daki \"Merge\" düğmesi, burada yaptığımızla aynı işi yapar: main'e geç, feature'ı merge et, gönder.",
          "Your teammates reviewed and approved the PR. GitHub's \"Merge\" button does what we did here: switch to main, merge feature, push.",
        ),
        l(
          "İş bittiği için yerel `feature` branch'ini sildik (`git branch -d feature`). Commit'ler main'de duruyor; branch sadece bir tabelaydı.",
          "With the work done, we deleted the local `feature` branch (`git branch -d feature`). The commits stay on main; the branch was only a sign.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "GitHub'da merge'i düğmeyle yaparsan kendi bilgisayarında `git switch main` ve `git pull` ile main'i güncellemen gerekir. Uzaktaki branch'i GitHub'daki \"Delete branch\" düğmesi ya da `git push origin --delete feature` siler. Bu sahnede origin'deki feature tabelası bu yüzden duruyor.",
            "If you merge with the button on GitHub, update main on your computer with `git switch main` and `git pull`. The remote branch is deleted with GitHub's \"Delete branch\" button or `git push origin --delete feature`; that is why the feature sign is still on origin in this scene.",
          ),
        },
      ],
      practice: {
        intro: l("PR GitHub'da merge edildikten sonra:", "After the PR is merged on GitHub:"),
        commands: [
          { cmd: "git switch main" },
          { cmd: "git pull", note: l("Merge edilmiş işi kendi main'ine al.", "Bring the merged work into your main.") },
          { cmd: "git branch -d arama-ozelligi", note: l("Yerel branch'i sil (merge edilmediyse Git uyarır).", "Delete the local branch (Git warns if it was not merged).") },
          { cmd: "git fetch --prune", note: l("Uzakta silinen branch'lerin kayıtlarını temizle.", "Clean up refs for branches deleted on the remote.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Takımda sorunsuz çalışmak için", "Working smoothly in a team"),
      body: [
        l(
          "Sık pull et: ne kadar uzun beklersen iki taraf o kadar ayrılır ve conflict ihtimali artar. Güne `git pull` ile başlamak iyi bir alışkanlık.",
          "Pull often: the longer you wait, the further the two sides drift and the likelier conflicts become. Starting the day with `git pull` is a good habit.",
        ),
        l(
          "Küçük ve kısa ömürlü branch'ler aç, PR'ları küçük tut. Küçük bir PR hızlı incelenir, hızlı merge edilir ve az conflict çıkarır.",
          "Open small, short-lived branches and keep PRs small. A small PR is reviewed and merged quickly and causes few conflicts.",
        ),
        l(
          "Kuralı unutma: **başkalarının da kullandığı commit'leri yeniden yazma.** Amend ve rebase'i sadece henüz push etmediğin ya da sadece senin kullandığın branch'lerde yap.",
          "Remember the rule: **do not rewrite commits other people use.** Amend and rebase only what you have not pushed yet, or branches only you use.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede dosyalar her zaman farklı olduğu için pull hiç conflict çıkarmadı. Gerçekte ikiniz aynı satırı değiştirdiyseniz pull conflict ile durur; çözümü Conflict dersinde.",
            "Files never overlapped in this scene, so pull never conflicted. In reality, if you both changed the same lines, pull stops with a conflict; see the Conflicts lesson.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git pull --rebase && git push", note: l("Göndermeden önce en güncel haline geç.", "Catch up before you send.") },
          { cmd: "git log --oneline --graph --all", note: l("Kimin neyi nereye push ettiğini grafikle gösterir.", "Shows who pushed what where, as a graph.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Solda senin repo'n, sağda takımın paylaştığı origin var. Aşağıda ekip işinden **4 senaryo** bekliyor: reddedilen bir push'u düz çizgiyle göndermek, push edilmiş bir mesajı güvenle düzeltmek, PR için branch açmak ve merge'den sonra toparlanmak. Komutları terminale **kendin yaz**.",
          "Your turn. Your repo is on the left, the team's shared origin on the right. Below are **4 scenarios** from teamwork: sending a refused push as a straight line, safely fixing a pushed message, opening a branch for a PR, and tidying up after the merge. **Type the commands yourself** in the terminal.",
        ),
        l(
          "Takılırsan `git status` ve `git log --oneline --all` yaz. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `git status` and `git log --oneline --all`. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Başkası senden önce push ettiyse push reddedilir: önce pull, sonra push.", "If someone pushed before you, your push is rejected: pull first, then push."),
    l("`git pull` ayrılan iki ucu merge commit ile birleştirir; `git pull --rebase` senin commit'lerini onlarınkinin üstüne yazar ve geçmiş düz kalır.", "`git pull` joins diverged tips with a merge commit; `git pull --rebase` rewrites your commits on top of theirs and keeps history straight."),
    l("Push edilmiş bir commit'i değiştirince göndermek için zorlamak gerekir.", "Changing a commit you already pushed means you have to force the push."),
    l("`--force-with-lease`, uzakta görmediğin bir commit varsa reddeder; düz `--force` başkasının işini sessizce siler.", "`--force-with-lease` refuses if the remote has a commit you have not seen; plain `--force` silently erases other people's work."),
    l("Takımlar işi branch'lerde yapar ve pull request ile main'e alır: branch aç, `push -u`, PR aç, incelet, merge et, branch'i sil, main'i pull et.", "Teams work on branches and bring work into main through pull requests: branch, `push -u`, open a PR, review, merge, delete the branch, pull main."),
  ],
  quiz: [
    {
      question: l("Push'un \"rejected (fetch first)\" ile reddedildi. İlk ne yapmalısın?", "Your push was rejected with \"rejected (fetch first)\". What should you do first?"),
      options: [l("`git push --force`", "`git push --force`"), l("`git pull` (veya `git pull --rebase`)", "`git pull` (or `git pull --rebase`)"), l("Repo'yu silip yeniden clone'lamak", "Delete the repo and clone again"), l("`git commit --amend`", "`git commit --amend`")],
      answer: 1,
      explain: l("Uzakta senin bilmediğin commit'ler var; önce onları al, sonra gönder.", "The remote has commits you do not have; bring them in first, then send."),
      reviewStep: 1,
    },
    {
      question: l("`git pull` ile `git pull --rebase` arasındaki fark?", "What is the difference between `git pull` and `git pull --rebase`?"),
      options: [
        l("pull merge commit oluşturabilir; --rebase senin commit'lerini onlarınkinin üstünde yeniden oynatır", "pull may create a merge commit; --rebase replays your commits on top of theirs"),
        l("--rebase uzaktakini siler", "--rebase deletes the remote's commits"),
        l("Fark yok", "No difference"),
        l("pull sadece indirir, --rebase gönderir", "pull only downloads, --rebase sends"),
      ],
      answer: 0,
      explain: l("İkisi de önce fetch eder; biri merge ile, diğeri rebase ile birleştirir.", "Both fetch first; one combines by merging, the other by rebasing."),
      reviewStep: 4,
    },
    {
      question: l("`--force-with-lease` hangi durumda reddeder?", "When does `--force-with-lease` refuse?"),
      options: [
        l("Uzak branch, en son fetch ettiğin yerden ilerlemişse", "When the remote branch has moved since you last fetched"),
        l("Her zaman", "Always"),
        l("Hiçbir zaman", "Never"),
        l("Yerel değişikliğin varsa", "When you have local changes"),
      ],
      answer: 0,
      explain: l("Uzak branch hâlâ `origin/...`'de gördüğün yerdeyse zorlar, değilse durur.", "It forces only if the remote branch is still where your `origin/...` saw it; otherwise it stops."),
      reviewStep: 5,
    },
    {
      question: l("Bir PR GitHub'da merge edildi. Kendi bilgisayarında ne yaparsın?", "A PR was merged on GitHub. What do you do on your computer?"),
      options: [
        l("`git switch main`, `git pull`, sonra `git branch -d` ile eski branch'i sil", "`git switch main`, `git pull`, then delete the old branch with `git branch -d`"),
        l("Hiçbir şey, kendiliğinden güncellenir", "Nothing; it updates on its own"),
        l("`git push --force`", "`git push --force`"),
        l("Branch'te çalışmaya devam edersin", "Keep working on the branch"),
      ],
      answer: 0,
      explain: l("Merge uzakta oldu; main'ini pull ile güncellersin ve bitmiş branch'i silersin.", "The merge happened on the remote; you pull it into main and delete the finished branch."),
      reviewStep: 8,
    },
  ],
};
