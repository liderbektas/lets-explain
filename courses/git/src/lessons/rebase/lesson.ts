import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const rebase: Lesson = {
  slug: "rebase",
  title: l("Rebase", "Rebase"),
  summary: l(
    "Rebase commit'lerini başka bir commit'in üstünde yeniden oynatır: geçmiş düz bir çizgi olur ama commit'ler yeni kimlik alır. Ne zaman kullanılır, ne zaman asla kullanılmaz?",
    "Rebase replays your commits on top of another commit: history becomes a straight line, but the commits get new ids. When to use it, and when never to.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Rebase'in commit'leri yeniden yazdığını ve yeni kimlik verdiğini görmek", "See that rebase rewrites commits and gives them new ids"), step: 1 },
    { text: l("Rebase sonrası fast-forward ile düz bir geçmiş elde etmek", "Get a straight history with a fast-forward after a rebase"), step: 2 },
    { text: l("Rebase sırasında çıkan conflict'i `--continue` ile bitirmek", "Finish a conflict during a rebase with `--continue`"), step: 6 },
    { text: l("Altın kuralı bilmek: başkalarının aldığı commit'ler rebase edilmez", "Know the golden rule: never rebase commits others already have"), step: 7 },
  ],
  steps: [
    {
      short: l("Geride kaldı", "Fell behind"),
      tag: "problem",
      title: l("feature yazılırken main ilerledi", "main moved on while feature was being written"),
      body: [
        l(
          "Blog projesinde `feature` branch'i iki commit attı: yazı listesi ve arama. Bu arada main'e bir **Hakkında** sayfası geldi.",
          "On the blog project, the `feature` branch made two commits: a post list and search. Meanwhile, an **About** page landed on main.",
        ),
        l(
          "Grafikte iki çizgi aynı commit'ten ayrılıyor. feature, main'in eski bir halinden başladı ve yeni Hakkında sayfasını içermiyor. Şu an `feature`'dayız.",
          "In the graph, two lines split from the same commit. feature started from an older main and does not have the new About page. We are on `feature`.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bunu bir önceki derste merge ile çözmüştük. Rebase aynı işi başka yoldan yapar: iki geçmişi birleştirmek yerine feature'ın commit'lerinin kopyalarını main'in ucuna dizer.",
            "The last lesson solved this with a merge. Rebase does the same job another way: instead of joining two histories, it lays copies of feature's commits on the tip of main.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline --graph --all" },
          { cmd: "git log main..feature --oneline", note: l("feature'da olup main'de olmayan commit'ler: rebase'in kopyalayacakları.", "Commits on feature that main does not have: the ones rebase will copy.") },
        ],
      },
    },
    {
      short: l("rebase main", "rebase main"),
      tag: "experiment",
      predict: {
        question: l(
          "feature'dayken `git rebase main` çalıştıracağız. feature'ın iki commit'inin kimliklerine (hash) ne olur?",
          "On feature, we will run `git rebase main`. What happens to the ids (hashes) of feature's two commits?",
        ),
        options: [
          l("Aynı kalırlar, sadece yerleri değişir", "They stay the same; only their place changes"),
          l("Yeni kimlik alırlar; eskileri hiçbir branch'te kalmaz", "They get new ids; the old ones are left on no branch"),
          l("Silinirler", "They are deleted"),
        ],
        answer: 1,
        why: l(
          "Bir commit'in kimliği, ebeveyni de dahil bütün içeriğinden hesaplanır. Rebase her commit'i yeni bir ebeveynin üstüne koyduğu için **yeni commit'ler** oluşur. Eskileri hayalet olarak kalır, ta ki Git bir gün onları temizleyene kadar.",
          "A commit's id is computed from all of its content, its parent included. Rebase puts every commit on a new parent, so it makes **new commits**. The old ones stay behind as ghosts, until Git eventually cleans them up.",
        ),
      },
      title: l("Commit'ler yeniden oynatıldı", "The commits were replayed"),
      body: [
        l(
          "Git, feature'ın iki commit'ini sırayla aldı ve main'in ucunun üstünde **yeniden oynattı**. Mesajlar ve değişiklikler aynı, ama ebeveynleri değişti, o yüzden kimlikleri de değişti.",
          "Git took feature's two commits in order and **replayed** them on top of main's tip. The messages and changes are the same, but the parents changed, so the ids changed too.",
        ),
        l(
          "Soluk, kesik çizgili istasyonlar eski commit'ler: artık hiçbir branch onları göstermiyor. Silinmediler ve `git reflog` ile bulunabilirler, ama artık geçmişin parçası değiller.",
          "The faded, dashed stations are the old commits: no branch points at them any more. They are not deleted and `git reflog` can still find them, but they are no longer part of the history.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch feature" },
          { cmd: "git rebase main", note: l("feature'ın commit'lerini main'in ucunda yeniden oynatır: yeni kimlikli kopyalar.", "Replays feature's commits on the tip of main: copies with new ids.") },
        ],
      },
    },
    {
      short: l("Fast-forward", "Fast-forward"),
      tag: "how",
      predict: {
        question: l(
          "Rebase'ten sonra main'e geçip `git merge feature` diyeceğiz. Ne olur?",
          "After the rebase, we switch to main and run `git merge feature`. What happens?",
        ),
        options: [
          l("İki ebeveynli bir merge commit'i oluşur", "A merge commit with two parents is made"),
          l("main sadece ileri kayar, yeni commit oluşmaz", "main just slides forward, with no new commit"),
          l("Conflict çıkar", "There is a conflict"),
        ],
        answer: 1,
        why: l(
          "feature artık main'in ucundan başlıyor, yani main'in tam devamı. Birleştirilecek iki ayrı geçmiş yok: main tabelası feature'ın ucuna kayar. Buna fast-forward denir.",
          "feature now starts from main's tip, so it is a straight continuation of main. There are no two histories to join: the main sign slides to feature's tip. That is a fast-forward.",
        ),
      },
      title: l("Sonuç: dümdüz bir geçmiş", "The result: a straight history"),
      body: [
        l(
          "main'e geçip feature'ı merge ettik ve Git sadece **fast-forward** yaptı: main tabelası ileri kaydı. Merge commit'i yok, hat dümdüz.",
          "We switched to main and merged feature, and Git just **fast-forwarded**: the main sign slid forward. No merge commit; the line is straight.",
        ),
        l(
          "Rebase + fast-forward, \"önce main'i al, sonra üstüne ekle\" demenin bir yolu. Geçmişi okumak kolaylaşır: her commit bir öncekinin üstüne gelir.",
          "Rebase plus fast-forward is a way of saying \"take main first, then add on top\". The history becomes easy to read: every commit sits on the one before.",
        ),
        l(
          "İşi biten `feature`'ı da `git branch -d feature` ile sildik. Commit'leri artık main'in geçmişinde, branch'i silmek onları kaybettirmez.",
          "We also deleted the finished `feature` with `git branch -d feature`. Its commits are in main's history now, so deleting the branch loses nothing.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git merge --ff-only feature", note: l("Sadece fast-forward mümkünse merge eder; değilse durur. Kazara merge commit'i oluşmaz.", "Merges only if a fast-forward is possible, and stops otherwise. No accidental merge commit.") },
          { cmd: "git branch -d feature", note: l("Merge edilmiş branch'i siler; merge edilmemişse Git uyarır ve silmez.", "Deletes a merged branch; if it is not merged, Git warns and refuses.") },
        ],
      },
    },
    {
      short: l("Merge mi, rebase mi?", "Merge or rebase?"),
      tag: "idea",
      title: l("Merge ile rebase arasındaki fark", "Merge versus rebase"),
      body: [
        l(
          "**Merge** geçmişi olduğu gibi korur: iki çizgi ayrıldı, iki çizgi birleşti. Kimin neyi paralel yaptığı görünür ama grafik karmaşıklaşabilir.",
          "**Merge** keeps history as it happened: two lines split and two lines joined. You can see who did what in parallel, but the graph can get busy.",
        ),
        l(
          "**Rebase** geçmişi yeniden yazar, sanki her şey sırayla yapılmış gibi. Çizgi düzdür ve okunması kolaydır, ama gerçekte paralel olan iş tek sıraya dizilmiş olur.",
          "**Rebase** rewrites history as if everything happened in order. The line is straight and easy to read, but work that really happened in parallel is lined up in one row.",
        ),
        l(
          "İkisi de doğru araç. Pek çok takım şunu yapar: kendi branch'ini güncel tutmak için rebase, işi main'e almak için merge (ya da pull request'te \"Rebase and merge\").",
          "Both are the right tool. Many teams do this: rebase to keep your own branch up to date, merge to bring the work into main (or \"Rebase and merge\" on a pull request).",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git merge feature", note: l("Geçmişi korur; gerekirse merge commit'i oluşturur.", "Keeps history; makes a merge commit when needed.") },
          { cmd: "git rebase main", note: l("Commit'lerin kopyalarını main'in ucuna dizer; geçmişi düzleştirir.", "Lays copies of the commits on main's tip; straightens history.") },
        ],
      },
    },
    {
      short: l("Aynı dosya", "Same file"),
      tag: "how",
      title: l("İki branch aynı dosyaya dokunuyor", "Two branches touch the same file"),
      body: [
        l(
          "Yeni bir iş: `theme` branch'inde site rengini **mavi** yaptık. Aynı sırada main'de biri rengi **kırmızı** yaptı. İkisi de `style.css`'i değiştirdi.",
          "New work: on a `theme` branch we made the site **blue**. Meanwhile someone on main made it **red**. Both changed `style.css`.",
        ),
        l(
          "Bu, bir önceki dersteki conflict durumunun aynısı. Fark şu: bu sefer merge yerine rebase deneyeceğiz.",
          "This is exactly the conflict situation from the last lesson. The difference: this time we will try a rebase instead of a merge.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git switch -c theme", note: l("Yeni bir branch açıp ona geçer.", "Creates a new branch and switches to it.") }],
      },
    },
    {
      short: l("Rebase'te conflict", "Conflict in rebase"),
      tag: "experiment",
      predict: {
        question: l(
          "theme'deyken `git rebase main` çalıştıracağız. Yeniden oynatılan \"Mavi tema\" commit'i main'deki kırmızıyla çakışıyor. Ne olur?",
          "On theme, we run `git rebase main`. The replayed \"Mavi tema\" commit clashes with main's red. What happens?",
        ),
        options: [
          l("Rebase o commit'te durur; çözüp devam etmeni bekler", "The rebase stops at that commit and waits for you to resolve and go on"),
          l("Git otomatik olarak main'in rengini seçer", "Git picks main's colour automatically"),
          l("Rebase tamamen iptal olur", "The rebase is cancelled entirely"),
        ],
        answer: 0,
        why: l(
          "Rebase commit'leri tek tek uygular. Bir commit çakışırsa tam orada durur. Sen dosyayı düzeltir, add eder ve `git rebase --continue` ile kalan commit'lere devam edersin.",
          "Rebase applies commits one by one. If one clashes, it stops right there. You fix the file, add it, and carry on with the rest using `git rebase --continue`.",
        ),
      },
      title: l("Rebase yarıda durdu", "The rebase stopped halfway"),
      body: [
        l(
          "Rebase \"Mavi tema\" commit'inde durdu ve `style.css`'e conflict işaretlerini yazdı. Şu an hiçbir branch'te değilsin: HEAD, yeniden oynatmanın ortasında bir commit'i gösteriyor.",
          "The rebase stopped at the \"Mavi tema\" commit and wrote conflict markers into `style.css`. Right now you are on no branch: HEAD points at a commit in the middle of the replay.",
        ),
        l(
          "İşaretlere dikkat: rebase sırasında **HEAD (bizim) taraf main'dir**, onların tarafı da yeniden oynatılan theme commit'idir. Merge'teki halinin tam tersi.",
          "Look at the markers: during a rebase, **HEAD (ours) is main**, and theirs is the theme commit being replayed. The exact opposite of a merge.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Rebase'te \"ours\" ve \"theirs\" ters döner. `git checkout --theirs dosya` rebase sırasında **senin** commit'inin halini alır.",
            "In a rebase, \"ours\" and \"theirs\" swap. During a rebase, `git checkout --theirs file` takes **your** commit's version.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git status", note: l("Rebase'in nerede durduğunu ve hangi dosyaların çakıştığını söyler.", "Tells you where the rebase stopped and which files clash.") },
          { cmd: "git rebase --abort", note: l("Vazgeçer: branch rebase'ten önceki haline döner.", "Backs out: the branch goes back to how it was before the rebase.") },
        ],
      },
    },
    {
      short: l("--continue", "--continue"),
      tag: "how",
      title: l("Çöz, add et, devam et", "Resolve, add, continue"),
      body: [
        l(
          "Mavide karar kıldık, yani yeniden oynatılan theme commit'inin tarafını seçtik. Sonra `git add style.css` ve `git rebase --continue`.",
          "We settled on blue, so we kept the side of the theme commit being replayed. Then `git add style.css` and `git rebase --continue`.",
        ),
        l(
          "Rebase bitti: theme artık main'in ucundan başlıyor ve rengi mavi. Eski \"Mavi tema\" commit'i de bir hayalet oldu.",
          "The rebase is done: theme now starts from main's tip and its colour is blue. The old \"Mavi tema\" commit became a ghost too.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her dosya tek parça birleşir. Gerçek Git satır satır çalışır, yani farklı satırlara dokunan commit'ler conflict çıkarmadan yeniden oynatılır. Rebase'te aynı conflict'i her commit'te tekrar çözüyorsan `git config rerere.enabled true` işini kolaylaştırır.",
            "In this scene each file merges as one piece. Real Git works line by line, so commits touching different lines replay without a conflict. If a rebase makes you solve the same conflict at every commit, `git config rerere.enabled true` helps.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git add style.css" },
          { cmd: "git rebase --continue", note: l("Kalan commit'leri oynatmaya devam eder.", "Goes on replaying the remaining commits.") },
          { cmd: "git rebase --skip", note: l("Duran commit'i atlar (değişikliği artık gerekmiyorsa).", "Skips the stopped commit (if its change is no longer needed).") },
        ],
      },
    },
    {
      short: l("Altın kural", "Golden rule"),
      tag: "reality",
      title: l("Altın kural: paylaşılmış commit'i rebase etme", "The golden rule: do not rebase shared commits"),
      body: [
        l(
          "Rebase eski commit'leri bırakıp yenilerini oluşturur. Bu commit'leri **başka biri zaten aldıysa** (push ettiysen ve biri pull ettiyse), onun elindeki geçmiş seninkinden ayrılır. Aynı iş iki farklı kimlikle dolaşır ve ortalık karışır.",
          "Rebase abandons the old commits and makes new ones. If **someone else already has** those commits (you pushed and they pulled), their history splits from yours. The same work travels around under two ids and things get messy.",
        ),
        l(
          "Kural basit: **sadece henüz kimseyle paylaşmadığın commit'leri rebase et.** Kendi bilgisayarındaki branch'te özgürsün, ortak main'de ise asla.",
          "The rule is simple: **only rebase commits you have not shared yet.** On a branch on your own machine you are free; on the shared main, never.",
        ),
        l(
          "Günlük işte rebase'in en güvenli kullanımı `git pull --rebase`: uzaktaki yeni commit'leri alır ve henüz push etmediğin kendi commit'lerini onların üstüne koyar.",
          "The safest everyday use of rebase is `git pull --rebase`: it brings in the remote's new commits and puts your own, not yet pushed, commits on top of them.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Push ettiğin bir branch'i rebase ettiysen normal `git push` reddedilir. Branch sadece senin olsa bile `git push --force-with-lease` kullan, düz `--force` değil: başkası bu arada bir şey push ettiyse durur.",
            "If you rebased a branch you had already pushed, a normal `git push` is rejected. Even if the branch is only yours, use `git push --force-with-lease`, not plain `--force`: it stops if someone pushed in the meantime.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git pull --rebase", note: l("Uzaktakini alır, kendi commit'lerini üstüne koyar.", "Brings in the remote, puts your commits on top.") },
          { cmd: "git config --global pull.rebase true", note: l("`git pull` her zaman böyle çalışsın.", "Makes `git pull` always work this way.") },
          { cmd: "git push --force-with-lease", note: l("Rebase ettiğin kendi branch'ini güvenli biçimde günceller.", "Safely updates your own rebased branch.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Blog projesi yine iki koldan ilerlemiş: `feature`'da yazı listesi ve arama, `theme`'de mavi renk; main ise Hakkında sayfası ve kırmızıyla ilerledi. Aşağıda gerçek işten **5 senaryo** var. Komutları terminale **kendin yaz**.",
          "Your turn. The blog project has again moved on two fronts: `feature` has the post list and search, `theme` has blue, and main moved on with the About page and red. Below are **5 scenarios** from real work. **Type the commands yourself** in the terminal.",
        ),
        l(
          "Grafikteki soluk kutular rebase'in geride bıraktığı eski commit'ler. Rebase durursa `git status` ne yapacağını söyler. Az komutla bitirirsen 3 yıldız alırsın.",
          "The faded boxes in the graph are the old commits a rebase leaves behind. If a rebase stops, `git status` tells you what to do. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "[[rebase|Rebase]] commit'leri başka bir commit'in üstünde yeniden oynatır. Ebeveynleri değiştiği için yeni kimlik alırlar; eskileri hiçbir branch'te kalmaz.",
      "[[rebase|Rebase]] replays commits on top of another commit. Their parents change, so they get new ids, and the old ones are left on no branch.",
    ),
    l("Rebase'ten sonra merge genelde fast-forward olur: merge commit'i olmadan düz bir geçmiş.", "After a rebase, the merge is usually a fast-forward: a straight history with no merge commit."),
    l("Merge geçmişi olduğu gibi korur, rebase onu sıraya dizer. İkisi de doğru araç.", "Merge keeps history as it happened; rebase lines it up. Both are the right tool."),
    l(
      "Rebase sırasında conflict çıkarsa: çöz, `git add`, `git rebase --continue`. Vazgeçmek için `git rebase --abort`.",
      "If a rebase hits a conflict: resolve, `git add`, `git rebase --continue`. To back out, `git rebase --abort`.",
    ),
    l("Rebase'te \"ours\" ve \"theirs\" ters döner: HEAD, üstüne taşındığın branch'tir.", "In a rebase, \"ours\" and \"theirs\" swap: HEAD is the branch you are moving onto."),
    l("Altın kural: başkasının zaten aldığı commit'leri rebase etme. Güvenli günlük kullanım `git pull --rebase`.", "Golden rule: never rebase commits someone else already has. The safe everyday use is `git pull --rebase`."),
  ],
  quiz: [
    {
      question: l("Bir branch'i rebase edince commit'lerinin kimlikleri neden değişir?", "Why do a branch's commit ids change when you rebase it?"),
      options: [
        l("Git her rebase'te rastgele kimlik verir", "Git hands out random ids on every rebase"),
        l("Kimlik içerikten hesaplanır ve ebeveyn de içeriğin parçasıdır", "The id is computed from the content, and the parent is part of the content"),
        l("Commit mesajları değiştiği için", "Because the commit messages change"),
        l("Değişmez", "They do not change"),
      ],
      answer: 1,
      explain: l(
        "Kimlik ağaç, ebeveyn, yazar, zaman ve mesajdan hesaplanır. Rebase ebeveyni değiştirdiği için kimlik de değişir.",
        "The id is computed from the tree, parent, author, time and message. Rebase changes the parent, so the id changes.",
      ),
      reviewStep: 1,
    },
    {
      question: l("feature'ı main'in üstüne rebase ettin. Şimdi main'de `git merge feature` ne yapar?", "You rebased feature onto main. What does `git merge feature` on main do now?"),
      options: [l("Fast-forward: main ileri kayar", "Fast-forward: main slides forward"), l("Merge commit'i oluşturur", "Makes a merge commit"), l("Conflict çıkarır", "Causes a conflict"), l("Hiçbir şey", "Nothing")],
      answer: 0,
      explain: l("feature artık main'in tam devamı; main'in sadece ileri kayması yeter.", "feature is now a straight continuation of main, so main only needs to slide forward."),
      reviewStep: 2,
    },
    {
      question: l("Rebase bir conflict'te durdu. Dosyayı düzelttin. Sırada ne var?", "A rebase stopped on a conflict. You fixed the file. What comes next?"),
      options: [
        l("`git commit -m \"...\"`", "`git commit -m \"...\"`"),
        l("`git add dosya` sonra `git rebase --continue`", "`git add file`, then `git rebase --continue`"),
        l("`git merge --continue`", "`git merge --continue`"),
        l("`git push`", "`git push`"),
      ],
      answer: 1,
      explain: l("Önce dosyayı çözüldü olarak işaretle (add), sonra rebase kalan commit'lere devam etsin.", "First mark the file resolved (add), then let the rebase go on with the remaining commits."),
      reviewStep: 6,
    },
    {
      question: l("Hangisi rebase için güvenli DEĞİLDİR?", "Which one is NOT safe to rebase?"),
      options: [
        l("Henüz push etmediğin kendi branch'in", "Your own branch that you have not pushed"),
        l("Takımın zaten pull ettiği ortak main", "The shared main your team already pulled"),
        l("`git pull --rebase` ile kendi yerel commit'lerin", "Your local commits, with `git pull --rebase`"),
        l("Bilgisayarındaki deneme branch'i", "A scratch branch on your machine"),
      ],
      answer: 1,
      explain: l(
        "Başkalarının elindeki commit'leri yeniden yazmak geçmişleri ayırır. Paylaşılmış branch'ler rebase edilmez.",
        "Rewriting commits other people have splits the histories. Shared branches are not rebased.",
      ),
      reviewStep: 7,
    },
  ],
};
