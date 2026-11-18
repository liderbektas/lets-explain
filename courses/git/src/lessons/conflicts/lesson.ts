import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const conflicts: Lesson = {
  slug: "conflicts",
  title: l("Conflict", "Conflicts"),
  summary: l(
    "İki branch aynı yeri farklı değiştirince Git durur ve sana sorar. İşaretleri okumayı, bir taraf seçmeyi, merge'ü bitirmeyi ve vazgeçmeyi öğren.",
    "When two branches change the same place differently, Git stops and asks you. Learn to read the markers, pick a side, finish the merge, or back out.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Conflict'in neden çıktığını anlamak", "Understand why a conflict happens"), step: 1 },
    { text: l("`<<<<<<<`, `=======`, `>>>>>>>` işaretlerini okumak", "Read the `<<<<<<<`, `=======`, `>>>>>>>` markers"), step: 2 },
    { text: l("`git merge --abort` ile güvenle vazgeçmek", "Back out safely with `git merge --abort`"), step: 3 },
    { text: l("Conflict'i çözüp merge'ü commit ile bitirmek", "Resolve a conflict and finish the merge with a commit"), step: 6 },
  ],
  steps: [
    {
      short: l("İki taraf", "Two sides"),
      tag: "problem",
      title: l("İki branch aynı dosyaya dokundu", "Two branches touched the same file"),
      body: [
        l(
          "Mağaza projesinde iki iş paralel yürüdü. `feature` branch'inde dükkânın adı **Online Mağaza** oldu. Aynı sırada `main`'de başlığa **Büyük indirim** eklendi.",
          "Two pieces of work ran in parallel on the shop project. On `feature`, the shop was renamed **Online Mağaza**. Meanwhile on `main`, **Büyük indirim** (big sale) went into the title.",
        ),
        l(
          "İkisi de `title.txt`'yi değiştirdi ve ikisi de kendi `CHANGELOG.md` satırını yazdı. Sağdaki panel, `main`'de olduğumuz için klasördeki dosyaların main'deki halini gösteriyor.",
          "Both changed `title.txt`, and both wrote their own `CHANGELOG.md` line. Since we are on `main`, the panel on the right shows the folder's files as they are on main.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline --graph --all", note: l("Bütün branch'leri bir arada, grafik olarak gösterir.", "Shows every branch together, as a graph.") },
          { cmd: "git diff main...feature", note: l("feature'ın, ayrıldığı yerden beri neleri değiştirdiğini gösterir.", "Shows what feature changed since it branched off.") },
        ],
      },
    },
    {
      short: l("Merge", "Merge"),
      tag: "experiment",
      predict: {
        question: l(
          "`main`'deyken `git merge feature` çalıştıracağız. İki taraf da `title.txt`'yi farklı değiştirdi. Ne olur?",
          "On `main`, we will run `git merge feature`. Both sides changed `title.txt` differently. What happens?",
        ),
        options: [
          l("Son yapılan değişiklik kazanır", "The most recent change wins"),
          l("Git durur ve hangisini istediğini sorar", "Git stops and asks which one you want"),
          l("feature'ın hali her zaman kazanır", "feature's version always wins"),
        ],
        answer: 1,
        why: l(
          "Git, aynı yeri iki farklı şekilde değiştiren iki taraf arasında kendi başına seçim yapmaz. Merge'ü yarıda durdurur ve kararı sana bırakır. Buna [[conflict]] denir.",
          "Git never chooses on its own between two sides that changed the same place differently. It stops the merge halfway and leaves the decision to you. That is a [[conflict]].",
        ),
      },
      title: l("Git durdu: conflict", "Git stopped: a conflict"),
      body: [
        l(
          "Merge yarıda kaldı. Git iki dosyada da karar veremedi: `title.txt` ve `CHANGELOG.md` artık **conflict** durumunda.",
          "The merge stopped halfway. Git could not decide for either file: `title.txt` and `CHANGELOG.md` are now in **conflict**.",
        ),
        l(
          "Henüz yeni bir commit yok ve main yerinden kıpırdamadı. Git iki tarafı da dosyaların içine yazdı ve senin karar vermeni bekliyor.",
          "There is no new commit yet and main has not moved. Git wrote both sides into the files and is waiting for you to decide.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git merge feature" },
          { cmd: "git status", note: l("Conflict'li dosyaları \"both modified\" olarak listeler.", "Lists conflicted files as \"both modified\".") },
        ],
      },
    },
    {
      short: l("İşaretler", "Markers"),
      tag: "how",
      title: l("Conflict işaretlerini okumak", "Reading the conflict markers"),
      body: [
        l(
          "Sağdaki `title.txt`'ye bak. Git dosyaya üç işaret koydu. `<<<<<<< HEAD` ile `=======` arası **bizim** taraf, yani üzerinde olduğun main.",
          "Look at `title.txt` on the right. Git put three markers in the file. Between `<<<<<<< HEAD` and `=======` is **our** side: main, where you are.",
        ),
        l(
          "`=======` ile `>>>>>>> feature` arası **onların** tarafı, yani merge etmeye çalıştığın branch. Senin işin bu bloğu istediğin son hale getirmek ve işaretleri silmek.",
          "Between `=======` and `>>>>>>> feature` is **their** side: the branch you are merging in. Your job is to turn the block into what you want and delete the markers.",
        ),
        l(
          "`CHANGELOG.md` biraz farklı: dosyayı iki taraf da sıfırdan oluşturdu. Burada doğru cevap bir tarafı seçmek değil, **ikisini de** tutmak.",
          "`CHANGELOG.md` is a bit different: both sides created it from scratch. Here the right answer is not picking one side but keeping **both**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Conflict bir hata değil, bir soru: \"İkiniz de burayı değiştirdiniz, hangisi doğru?\" Çoğu zaman cevap ikisinin karışımıdır.",
            "A conflict is not an error but a question: \"You both changed this; which is right?\" Often the answer is a mix of both.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git diff", note: l("Conflict sırasında iki tarafı yan yana gösterir.", "During a conflict, shows both sides side by side.") },
          { cmd: "git config --global merge.conflictStyle zdiff3", note: l("İşaretlerin arasına ortak atanın halini de ekler; neyin değiştiği daha kolay anlaşılır.", "Also shows the common ancestor's version between the markers, so it is easier to see what changed.") },
        ],
      },
    },
    {
      short: l("abort", "abort"),
      tag: "how",
      predict: {
        question: l(
          "Kararı sonraya bırakmak istiyoruz: `git merge --abort` çalıştıracağız. Ne olur?",
          "We want to decide later, so we will run `git merge --abort`. What happens?",
        ),
        options: [
          l("Merge yarım haliyle kaydedilir", "The half-done merge is saved"),
          l("Her şey merge'ten önceki haline döner", "Everything goes back to how it was before the merge"),
          l("Conflict'li dosyalar silinir", "The conflicted files are deleted"),
        ],
        answer: 1,
        why: l(
          "`--abort` merge'ü hiç başlamamış gibi geri alır: dosyalar main'deki haline döner, işaretler kaybolur, branch'lerin hiçbiri değişmez.",
          "`--abort` undoes the merge as if it never started: the files go back to main's version, the markers disappear, and no branch changes.",
        ),
      },
      title: l("Vazgeçmek her zaman serbest", "You can always back out"),
      body: [
        l(
          "`git merge --abort` merge'ü iptal etti. Dosyalar main'deki haline döndü, işaretler kayboldu ve klasör temiz.",
          "`git merge --abort` called the merge off. The files went back to main's version, the markers disappeared, and the folder is clean.",
        ),
        l(
          "Conflict seni korkutmasın: emin değilsen vazgeç, takım arkadaşınla konuş, sonra tekrar dene. Hiçbir şey kaybolmadı.",
          "Do not let a conflict scare you: if unsure, back out, talk to your teammate, and try again. Nothing was lost.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git merge --abort", note: l("Yarım kalmış merge'ü iptal eder.", "Calls off a half-done merge.") }],
      },
    },
    {
      short: l("Bir taraf seç", "Pick a side"),
      tag: "how",
      title: l("Bir tarafı seç, sonra add et", "Pick a side, then add"),
      body: [
        l(
          "Konuştuk ve yeni isimde karar kıldık. Merge'ü tekrar başlattık ve `title.txt` için **onların** halini, yani `Online Mağaza`'yı seçtik. İşaretler gitti.",
          "We talked and agreed on the new name. We started the merge again and picked **their** version of `title.txt`, `Online Mağaza`. The markers are gone.",
        ),
        l(
          "Sonra `git add title.txt`. Conflict sırasında `add`'in özel bir anlamı var: Git'e \"bu dosyayı çözdüm\" demek. Dosyanın etiketi \"temiz\" oldu ama `CHANGELOG.md` hâlâ conflict'li.",
          "Then `git add title.txt`. During a conflict, `add` has a special meaning: telling Git \"I resolved this file\". Its label is now \"clean\", but `CHANGELOG.md` is still in conflict.",
        ),
      ],
      practice: {
        intro: l(
          "Gerçek projede dosyayı editörde açıp istediğin hale getirirsin. Tamamen bir tarafı seçmek için kısayollar:",
          "In a real project you open the file in your editor and edit it. To take one side entirely, there are shortcuts:",
        ),
        commands: [
          { cmd: "git checkout --theirs title.txt", note: l("Onların halini alır.", "Takes their version.") },
          { cmd: "git checkout --ours title.txt", note: l("Bizim halimizi alır.", "Takes our version.") },
          { cmd: "git add title.txt", note: l("Git'e dosyanın çözüldüğünü söyler.", "Tells Git the file is resolved.") },
        ],
      },
    },
    {
      short: l("İkisi de", "Both"),
      tag: "how",
      predict: {
        question: l(
          "`CHANGELOG.md`'de iki satırı da tutup dosyayı add edeceğiz. Dosya ne olur?",
          "In `CHANGELOG.md` we will keep both lines and add the file. What does the file become?",
        ),
        options: [
          l("İki satır alt alta, işaretler olmadan", "Both lines one under the other, with no markers"),
          l("İki satır, işaretlerle birlikte", "Both lines, with the markers still in"),
          l("Sadece bizim satırımız", "Only our line"),
        ],
        answer: 0,
        why: l(
          "Çözmek, işaretleri silip dosyayı son haline getirmek demek. İki satır da kalır, işaretler gider. İşaretli bir dosyayı add edersen işaretler commit'e girer, bu yüzden add etmeden önce bak.",
          "Resolving means deleting the markers and making the file final. Both lines stay and the markers go. Adding a file with markers would commit the markers, so look before you add.",
        ),
      },
      title: l("Bazen doğru cevap: ikisi de", "Sometimes the right answer is both"),
      body: [
        l(
          "`CHANGELOG.md` artık iki satır: **Şifre sıfırlama eklendi** ve **Karanlık tema eklendi**. İşaretler yok ve dosya add edildi.",
          "`CHANGELOG.md` now has two lines, **Şifre sıfırlama eklendi** and **Karanlık tema eklendi**. No markers, and the file is added.",
        ),
        l(
          "Bütün conflict'ler çözüldü. Merge hâlâ sürüyor ama artık tek eksik bir commit.",
          "All conflicts are resolved. The merge is still running, but all it needs now is a commit.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "İşaretleri silmeyi unutmak en sık hatadır. Commit'ten önce `git diff --staged` ile bak ya da projende `<<<<<<<` ara.",
            "Forgetting to delete the markers is the most common slip. Before committing, look with `git diff --staged` or search the project for `<<<<<<<`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git add CHANGELOG.md" },
          { cmd: 'git grep -n "<<<<<<<"', note: l("Unutulmuş işaret kalmış mı diye bakar.", "Checks for any forgotten markers.") },
        ],
      },
    },
    {
      short: l("commit", "commit"),
      tag: "how",
      predict: {
        question: l("Şimdi `git commit` atıp merge'ü bitireceğiz. Yeni commit'in kaç ebeveyni olur?", "Now we finish the merge with `git commit`. How many parents does the new commit have?"),
        options: [l("Bir: main'in son commit'i", "One: main's last commit"), l("İki: main'in ve feature'ın son commit'i", "Two: main's and feature's last commits"), l("Hiç", "None")],
        answer: 1,
        why: l(
          "Merge commit'i iki geçmişi birleştirir, bu yüzden iki ebeveyni vardır: bir tanesi main'in, diğeri feature'ın son commit'i. Grafikte iki çizgi bu commit'te buluşur.",
          "A merge commit joins two histories, so it has two parents: main's last commit and feature's. In the graph, two lines meet at it.",
        ),
      },
      title: l("Merge commit'i: iki geçmiş buluştu", "The merge commit: two histories meet"),
      body: [
        l(
          "`git commit` merge'ü bitirdi. Mesajı Git hazırladı: `Merge branch 'feature'`. Yeni commit'in iki ebeveyni var, grafikte iki çizgi onda birleşiyor.",
          "`git commit` finished the merge. Git wrote the message, `Merge branch 'feature'`. The new commit has two parents, and the two lines in the graph meet at it.",
        ),
        l(
          "main artık iki tarafın işini de içeriyor: yeni isim, indirim değil; CHANGELOG'da iki satır. Senin verdiğin kararlar bu commit'in içinde.",
          "main now holds both sides' work: the new name instead of the sale, and two lines in the CHANGELOG. The decisions you made are inside this commit.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git commit", note: l("Editörde hazır merge mesajıyla açılır; kaydedip kapat.", "Opens the editor with the merge message ready; save and close.") },
          { cmd: "git merge --continue", note: l("Aynı işi yapar: çözülmüş merge'ü bitirir.", "Does the same: finishes a resolved merge.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Daha az conflict için", "For fewer conflicts"),
      body: [
        l(
          "Conflict'ler ne kadar uzun süre ayrı çalışırsan o kadar büyür. **Küçük commit'ler** at, branch'lerini **kısa ömürlü** tut ve ana branch'i sık sık kendi branch'ine al (`git pull` ya da `git merge main`).",
          "Conflicts grow the longer you work apart. Make **small commits**, keep branches **short-lived**, and bring the main branch into yours often (`git pull` or `git merge main`).",
        ),
        l(
          "Aynı dosyada çalışacağını bildiğin biri varsa önceden konuş. Biçimlendirme gibi her satıra dokunan değişiklikleri ayrı bir commit'te ve herkesle aynı anda yap.",
          "If you know someone will work in the same file, talk first. Do changes that touch every line, like reformatting, in a separate commit and at a time everyone agrees on.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her dosya tek parça birleşir: iki taraf aynı dosyayı değiştirince conflict çıkar. Gerçek Git satır satır çalışır: iki taraf **farklı satırları** değiştirdiyse kendisi birleştirir, conflict sadece **aynı satırlar** değişince çıkar ve işaretler sadece o satırları sarar.",
            "In this scene each file merges as one piece, so two sides changing the same file conflict. Real Git works line by line: if the sides changed **different lines** it merges them itself, a conflict appears only when the **same lines** changed, and the markers wrap just those lines.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Git'in varsayılan merge stratejisi `ort`. Aynı conflict'i tekrar tekrar çözüyorsan `git config --global rerere.enabled true` ile Git'in senin çözümünü hatırlayıp bir dahakine kendisi uygulamasını sağlayabilirsin.",
            "Git's default merge strategy is `ort`. If you keep solving the same conflict, `git config --global rerere.enabled true` makes Git remember your resolution and apply it next time.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git merge main", note: l("Kendi branch'indeyken main'deki yenilikleri alır; conflict'ler küçükken çıkar.", "On your own branch, brings in what is new on main, so conflicts show up while they are small.") },
          { cmd: "git mergetool", note: l("Conflict'leri görsel bir araçta çözmek için.", "To resolve conflicts in a visual tool.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Başa döndük: `main` ve `feature` yine aynı iki dosyayı farklı değiştirmiş durumda. Merge'ü başlat, her dosya için bir taraf seç (ya da ikisini birden), add et ve commit'le bitir. İstersen vazgeç.",
          "We are back at the start: `main` and `feature` again changed the same two files differently. Start the merge, pick a side for each file (or both), add, and finish with a commit. Or back out.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Her düğme bir hamle; az hamleyle 3 yıldız.",
          "Under the scene there are **3 missions**. Every button is a move; few moves earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "İki branch aynı yeri farklı değiştirdiyse merge durur: buna [[conflict]] denir. Git kendi başına seçmez.",
      "If two branches changed the same place differently, the merge stops: that is a [[conflict]]. Git does not choose on its own.",
    ),
    l(
      "`<<<<<<< HEAD` ile `=======` arası bizim taraf, `=======` ile `>>>>>>>` arası onların. Çözmek, bloğu son haline getirip işaretleri silmektir.",
      "Between `<<<<<<< HEAD` and `=======` is our side; between `=======` and `>>>>>>>` is theirs. Resolving means making the block final and deleting the markers.",
    ),
    l("Conflict sırasında `git add dosya`, Git'e \"bu dosyayı çözdüm\" demektir.", "During a conflict, `git add file` tells Git \"I resolved this file\"."),
    l("Bütün dosyalar çözülünce `git commit` iki ebeveynli bir merge commit'i oluşturur.", "Once every file is resolved, `git commit` creates a merge commit with two parents."),
    l("`git merge --abort` her şeyi merge'ten önceki haline döndürür; vazgeçmek her zaman güvenli.", "`git merge --abort` puts everything back as it was before the merge; backing out is always safe."),
    l("Küçük commit'ler, kısa ömürlü branch'ler ve sık senkron conflict'leri küçük tutar.", "Small commits, short-lived branches and frequent syncing keep conflicts small."),
  ],
  quiz: [
    {
      question: l(
        "Bir conflict'li dosyada `<<<<<<< HEAD` ile `=======` arasında ne vardır?",
        "In a conflicted file, what is between `<<<<<<< HEAD` and `=======`?",
      ),
      options: [
        l("Merge ettiğin branch'in hali", "The version from the branch you are merging in"),
        l("Üzerinde olduğun branch'in hali", "The version from the branch you are on"),
        l("Ortak atanın hali", "The common ancestor's version"),
        l("Git'in önerdiği çözüm", "Git's suggested fix"),
      ],
      answer: 1,
      explain: l("HEAD, üzerinde olduğun yerdir; ilk blok bizim taraftır. Onların tarafı `=======`'den sonra gelir.", "HEAD is where you are, so the first block is our side. Their side comes after `=======`."),
      reviewStep: 2,
    },
    {
      question: l("Conflict'i dosyada çözdün. Git'e bunu nasıl söylersin?", "You fixed the conflict in the file. How do you tell Git?"),
      options: [l("`git commit -a`", "`git commit -a`"), l("`git add dosya`", "`git add file`"), l("`git resolve dosya`", "`git resolve file`"), l("`git merge --continue` hemen", "`git merge --continue` right away")],
      answer: 1,
      explain: l(
        "Conflict sırasında `git add` dosyayı \"çözüldü\" olarak işaretler. Hepsi bitince `git commit` ya da `git merge --continue`.",
        "During a conflict, `git add` marks the file as resolved. Once all are done, `git commit` or `git merge --continue`.",
      ),
      reviewStep: 4,
    },
    {
      question: l("Merge sırasında conflict çıktı ve şimdi karar vermek istemiyorsun. Ne yaparsın?", "A merge hit a conflict and you do not want to decide now. What do you do?"),
      options: [
        l("`git merge --abort`", "`git merge --abort`"),
        l("Dosyaları silip commit atarım", "Delete the files and commit"),
        l("`git reset --hard` ile her şeyi silerim", "Wipe everything with `git reset --hard`"),
        l("Branch'i silerim", "Delete the branch"),
      ],
      answer: 0,
      explain: l("`--abort` merge'ü güvenle geri alır; ne commit ne branch kaybolur.", "`--abort` safely undoes the merge; no commit or branch is lost."),
      reviewStep: 3,
    },
    {
      question: l(
        "Sen ve takım arkadaşın aynı dosyanın **farklı satırlarını** değiştirdiniz. Gerçek Git'te merge sırasında ne olur?",
        "You and a teammate changed **different lines** of the same file. In real Git, what happens on merge?",
      ),
      options: [
        l("Her zaman conflict çıkar", "There is always a conflict"),
        l("Git iki değişikliği de kendisi birleştirir", "Git combines both changes itself"),
        l("Son push eden kazanır", "Whoever pushed last wins"),
        l("Dosya iki kopyaya bölünür", "The file is split into two copies"),
      ],
      answer: 1,
      explain: l(
        "Gerçek Git satır satır birleştirir. Conflict sadece aynı satırlar farklı değiştiğinde çıkar. Bu sahne her dosyayı tek parça saydığı için orada conflict çıkıyor.",
        "Real Git merges line by line, and a conflict appears only when the same lines changed differently. This scene counts each file as one piece, which is why it conflicts there.",
      ),
      reviewStep: 7,
    },
  ],
};
