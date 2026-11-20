import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const commitsAndHistory: Lesson = {
  slug: "commits-and-history",
  title: l("Commit ve geçmiş", "Commits and history"),
  summary: l(
    "Bir commit'in içinde ne var, commit'ler nasıl birbirine bağlanıp geçmişi oluşturur, `git log`, `git show` ve `HEAD~1` ile geçmişte nasıl gezilir.",
    "What is inside a commit, how commits link up into a history, and how to move around it with `git log`, `git show` and `HEAD~1`.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir commit'te neler saklandığını bilmek", "Know what a commit stores"), step: 0 },
    { text: l("Parent bağlantısının geçmişi nasıl kurduğunu görmek", "See how parent links build the history"), step: 1 },
    { text: l("`git log`, `git show` ve `HEAD~n` ile geçmişi okumak", "Read history with `git log`, `git show` and `HEAD~n`"), step: 3 },
    { text: l("İçerik değişince kimliğin de değiştiğini görmek", "See that the id changes when the content does"), step: 4 },
  ],
  steps: [
    {
      short: l("Commit'in içi", "Inside a commit"),
      tag: "how",
      title: l("Bir commit'in içinde ne var?", "What is inside a commit?"),
      body: [
        l(
          "Soldaki küp ilk commit. Sağdaki terminal, `git show` komutunun bu commit için yazdığı çıktı: senin bilgisayarında da aynen böyle görünür.",
          "The cube on the left is the first commit. The terminal on the right is what `git show` prints for it; it looks just like this on your computer too.",
        ),
        l(
          "Bir commit dört şey taşır: o anki **bütün dosyaların** tam hali, **yazar** ve **zaman**, bir **mesaj**, ve bir önceki commit'e bir bağlantı. İlk commit'in öncesi olmadığı için bu bağlantı yok.",
          "A commit carries four things: the full state of **all the files** at that moment, the **author** and **time**, a **message**, and a link to the commit before it. The first commit has nothing before it, so it has no link.",
        ),
        l(
          "En üstteki 40 karakterlik metin commit'in kimliği, [[hash]]. Grafikte ve `git log --oneline`'da bunun ilk 7 karakteri gösterilir.",
          "The 40-character string at the top is the commit's id, its [[hash]]. The graph and `git log --oneline` show its first 7 characters.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git show", note: l("Son commit'in yazarını, tarihini, mesajını ve değişikliklerini gösterir.", "Shows the last commit's author, date, message and changes.") },
          { cmd: "git show --stat", note: l("Değişikliklerin yerine sadece hangi dosyaların değiştiğini listeler.", "Lists which files changed instead of the full changes.") },
        ],
      },
    },
    {
      short: l("Parent", "Parent"),
      tag: "how",
      predict: {
        question: l(
          "Yeni bir dosya ekleyip ikinci commit'i atacağız. Bu commit'in parent'ı (bir önceki commit) ne olacak?",
          "We will add a new file and make a second commit. What will this commit's parent (the commit before it) be?",
        ),
        options: [l("İlk commit", "The first commit"), l("Hiçbiri, her commit bağımsızdır", "None, every commit stands alone"), l("Kendisi", "Itself")],
        answer: 0,
        why: l(
          "Her yeni commit, attığın andaki HEAD'i parent olarak kaydeder. Geçmiş, bu bağlantıların arka arkaya dizilmesidir.",
          "Every new commit records the HEAD at the time as its parent. History is just these links one after another.",
        ),
      },
      title: l("Her commit bir öncekini gösterir", "Every commit points at the one before"),
      body: [
        l(
          "`app.js`'i ekleyip ikinci commit'i attık. Terminalde `parent` satırı göründü: bu commit, ilk commit'in kimliğini taşıyor. Grafikte de iki küp bir çizgiyle bağlandı.",
          "We added `app.js` and made a second commit. A `parent` line appeared in the terminal: this commit carries the first commit's id. In the graph, the two cubes are now joined by a line.",
        ),
        l(
          "Geçmiş, sondan başa doğru bu bağlantılar takip edilerek okunur. `main` etiketi her zaman en yeni commit'te durur ve yeni commit atınca oraya kayar.",
          "History is read by following these links from the newest back to the start. The `main` label always sits on the newest commit and slides forward with every new one.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --graph --oneline", note: l("Commit'leri bağlantılarıyla birlikte, küçük bir grafik olarak çizer.", "Draws commits with their links as a small graph.") },
        ],
      },
    },
    {
      short: l("git log", "git log"),
      tag: "how",
      predict: {
        question: l(
          "İki commit daha atacağız ve `git log --oneline` çalıştıracağız. Liste hangi sırayla çıkar?",
          "We will make two more commits and run `git log --oneline`. In which order does the list come out?",
        ),
        options: [l("En eski commit en üstte", "Oldest commit first"), l("En yeni commit en üstte", "Newest commit first"), l("Alfabetik sırayla", "In alphabetical order")],
        answer: 1,
        why: l(
          "`git log` HEAD'den başlar ve parent bağlantılarını geriye doğru izler. Bu yüzden en yeni commit en üsttedir.",
          "`git log` starts at HEAD and follows the parent links backwards, so the newest commit comes first.",
        ),
      },
      title: l("git log: geçmişi oku", "git log: read the history"),
      body: [
        l(
          "README'yi ve app.js'i değiştiren iki commit daha attık. Terminal şimdi `git log --oneline` gösteriyor: her satırda kısa kimlik ve mesaj, en yeni en üstte.",
          "We made two more commits changing README and app.js. The terminal now shows `git log --oneline`: one short id and message per line, newest first.",
        ),
        l(
          "En üst satırdaki `(HEAD -> main)` şunu söylüyor: şu an `main` branch'indesin ve `main` bu commit'i gösteriyor.",
          "The `(HEAD -> main)` on the top line says: you are on the `main` branch right now, and `main` points at this commit.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline", note: l("Geçmişi tek satırlık özetlerle listeler.", "Lists history as one-line summaries.") },
          { cmd: "git log -3", note: l("Sadece son üç commit'i tam ayrıntıyla gösterir.", "Shows only the last three commits in full.") },
          { cmd: "git log -- app.js", note: l("Sadece app.js'i değiştiren commit'leri gösterir.", "Shows only commits that changed app.js.") },
        ],
      },
    },
    {
      short: l("HEAD~n", "HEAD~n"),
      tag: "how",
      predict: {
        question: l(
          "Son commit \"app.js v2\", ondan önceki \"README güncellendi\". `HEAD~2` hangi commit'tir?",
          "The last commit is \"app.js v2\" and the one before is \"README güncellendi\". Which commit is `HEAD~2`?",
        ),
        options: [l("\"README güncellendi\"", "\"README güncellendi\""), l("\"app.js eklendi\"", "\"app.js eklendi\""), l("\"İlk commit\"", "\"İlk commit\"")],
        answer: 1,
        why: l(
          "`HEAD~1` bir önceki, `HEAD~2` iki önceki commit'tir: app.js v2 → README güncellendi → app.js eklendi.",
          "`HEAD~1` is one back and `HEAD~2` is two back: app.js v2 → README güncellendi → app.js eklendi.",
        ),
      },
      title: l("HEAD~2: iki commit geri", "HEAD~2: two commits back"),
      body: [
        l(
          "Kimlikleri ezberlemene gerek yok. `HEAD~1` \"bir önceki\", `HEAD~2` \"iki önceki\" commit demektir. Terminal `git show HEAD~2` çıktısını gösteriyor ve o commit grafikte parlıyor.",
          "You do not need to memorise ids. `HEAD~1` means \"one back\" and `HEAD~2` \"two back\". The terminal shows `git show HEAD~2`, and that commit glows in the graph.",
        ),
        l(
          "Kısa kimlik de aynı işi görür: `git show` ile kimliğin ilk 7 karakterini yazman yeterli. Branch adları da kullanılabilir, örneğin `main~1`.",
          "A short id works too: give `git show` the first 7 characters of an id. Branch names work as well, such as `main~1`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git show HEAD~2", note: l("İki commit önceyi gösterir.", "Shows the commit two back.") },
          { cmd: "git diff HEAD~2 HEAD", note: l("İki commit önceden bugüne ne değiştiğini gösterir.", "Shows what changed from two commits back until now.") },
          { cmd: "git show HEAD~1:app.js", note: l("Bir önceki commit'teki app.js'in içeriğini yazar.", "Prints app.js as it was one commit back.") },
        ],
      },
    },
    {
      short: l("Yeni kimlik", "New id"),
      tag: "experiment",
      predict: {
        question: l(
          "Son commit'in sadece **mesajını** düzelteceğiz (`git commit --amend`). Commit'in kimliği ne olur?",
          "We will fix only the **message** of the last commit (`git commit --amend`). What happens to its id?",
        ),
        options: [l("Aynı kalır, sadece mesaj değişti", "It stays the same; only the message changed"), l("Değişir: yeni bir commit oluşur", "It changes: a new commit is made"), l("Mesajın sonuna eklenir", "It is added to the end of the message")],
        answer: 1,
        why: l(
          "Kimlik commit'in bütün içeriğinden (dosyalar, mesaj, yazar, zaman, parent) hesaplanır. Mesaj değişirse kimlik de değişir; Git eskisinin yerine yeni bir commit koyar.",
          "The id is computed from the commit's whole content: files, message, author, time and parent. Change the message and the id changes too; Git puts a new commit in place of the old one.",
        ),
      },
      title: l("İçerik değişirse kimlik de değişir", "Change the content and the id changes"),
      body: [
        l(
          "`git commit --amend -m \"app.js: sürüm 2\"` son commit'i yeni mesajla yeniden yazdı. Grafikte yeni bir küp var; eskisi soluk duruyor çünkü artık hiçbir branch onu göstermiyor.",
          "`git commit --amend -m \"app.js: sürüm 2\"` rewrote the last commit with a new message. There is a new cube in the graph; the old one is faded because no branch points at it any more.",
        ),
        l(
          "Bir commit asla \"düzenlenmez\": değişen her şey yeni bir commit demektir. Bu yüzden başkalarıyla paylaştığın commit'leri amend etme; onların elindeki kopyada eski kimlik kalır.",
          "A commit is never \"edited\": any change means a new commit. That is why you should not amend commits you have already shared; the copies others have still carry the old id.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Push ettiğin bir commit'i amend edersen, bir sonraki push reddedilir ve takım arkadaşlarının geçmişiyle çakışır. Amend'i sadece henüz kimseyle paylaşmadığın commit'lerde kullan.",
            "If you amend a commit you already pushed, your next push is rejected and clashes with your teammates' history. Only amend commits nobody else has yet.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: 'git commit --amend -m "Yeni mesaj"', note: l("Son commit'in mesajını değiştirir (yeni kimlikle).", "Changes the last commit's message (with a new id).") },
          { cmd: "git commit --amend --no-edit", note: l("Staging'e koyduğun değişikliği mesajı değiştirmeden son commit'e katar.", "Folds what you staged into the last commit, keeping its message.") },
        ],
      },
    },
    {
      short: l("git show", "git show"),
      tag: "how",
      title: l("git show: bu commit neyi değiştirdi?", "git show: what did this commit change?"),
      body: [
        l(
          "Bir commit dosyaların tam halini saklasa da, `git show` sana onu parent'ıyla karşılaştırıp sadece **farkı** gösterir. Terminalin altındaki satır, bu commit'in hangi dosyayı değiştirdiğini söylüyor.",
          "Even though a commit stores the full files, `git show` compares it with its parent and shows only the **difference**. The line at the bottom of the terminal says which file this commit changed.",
        ),
        l(
          "`app.js | 2 +-` bir satırın silinip yerine yenisinin geldiğini anlatır. Yeni bir dosya için `1 +`, silinen bir dosya için `1 -` görürsün.",
          "`app.js | 2 +-` means one line was removed and a new one added. For a new file you would see `1 +`, and for a deleted one `1 -`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git show HEAD", note: l("Son commit'in farkını satır satır gösterir: `-` silinen, `+` eklenen satır.", "Shows the last commit's diff line by line: `-` removed, `+` added.") },
          { cmd: "git log -p", note: l("Her commit'i farkıyla birlikte listeler.", "Lists every commit together with its diff.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Fark değil, fotoğraf", "Snapshots, not diffs"),
      body: [
        l(
          "Birçok eski sistem sürümleri \"değişiklik listesi\" olarak saklardı. Git her commit'te bütün projenin bir fotoğrafını saklar; farkları ise sen sorunca hesaplar.",
          "Many older systems stored versions as lists of changes. Git stores a snapshot of the whole project in every commit and works out the differences when you ask.",
        ),
        l(
          "Bu her seferinde her şeyi kopyalamak demek değil: değişmeyen dosyalar commit'ler arasında paylaşılır. Bunun nasıl çalıştığını ve kimliklerin nereden geldiğini bir sonraki bölümde, nesneler dersinde göreceksin.",
          "That does not mean copying everything every time: unchanged files are shared between commits. How that works, and where the ids come from, is the topic of the objects lesson in the next chapter.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her commit tek bir yazar ve zamanla gösteriliyor. Gerçek Git **author** (değişikliği yazan) ve **committer** (commit'i atan) için ayrı alanlar tutar. Rebase ya da cherry-pick sonrası bu ikisi farklı olabilir.",
            "Here every commit shows one author and time. Real Git keeps separate **author** (who wrote the change) and **committer** (who made the commit) fields; after a rebase or cherry-pick they can differ.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: 'git log --format="%h %an %ar %s"', note: l("Kısa kimlik, yazar, ne kadar önce ve mesajı yan yana yazar.", "Prints short id, author, how long ago and message side by side.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda bir mağaza projesi ve gerçek işten **4 senaryo** var: commit mesajında yazım hatası, unutulan bir dosya, birbirine karışmış iki iş. Komutları terminale **kendin yaz**; sahne geçmişin nasıl değiştiğini, sağdaki kart da son commit'i gösterir.",
          "Your turn. Below is a shop project and **4 scenarios** from real work: a typo in a commit message, a forgotten file, two jobs mixed together. **Type the commands yourself** in the terminal; the scene shows how the history changes and the card on the right shows the last commit.",
        ),
        l(
          "`git log --oneline` ve `git show` ile geçmişe istediğin zaman bakabilirsin. Soluk küpler, amend ile yerine yenisi konmuş eski commit'ler. Az komutla bitirirsen 3 yıldız alırsın.",
          "You can look at the history any time with `git log --oneline` and `git show`. Faded cubes are old commits replaced by an amend. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Bir commit bütün dosyaların tam halini, yazarı, zamanı, mesajı ve parent bağlantısını saklar.", "A commit stores the full files, the author, the time, the message and a parent link."),
    l("Commit'ler parent bağlantılarıyla zincir olur; `git log` bu zinciri en yeniden geriye doğru okur.", "Commits chain through their parent links; `git log` reads the chain from the newest backwards."),
    l("`HEAD~1`, `HEAD~2` bulunduğun yerden geriye sayar. Kısa kimlik ve branch adları da kullanılabilir.", "`HEAD~1` and `HEAD~2` count back from where you are. Short ids and branch names work too."),
    l("Kimlik commit'in bütün içeriğinden hesaplanır: mesaj bile değişse yeni bir commit oluşur.", "The id is computed from the whole commit: change even the message and you get a new commit."),
    l("`--amend` son commit'i yeniden yazar; paylaştığın commit'lerde kullanma.", "`--amend` rewrites the last commit; do not use it on commits you have shared."),
    l("Git sürümleri fark olarak değil fotoğraf olarak saklar; `git show` farkı istendiğinde hesaplar.", "Git stores snapshots, not diffs; `git show` works out the difference on demand."),
  ],
  quiz: [
    {
      question: l("İlk commit'in parent'ı nedir?", "What is the parent of the first commit?"),
      options: [l("Kendisi", "Itself"), l("Yoktur", "It has none"), l("main branch'i", "The main branch"), l("Son commit", "The last commit")],
      answer: 1,
      explain: l("İlk commit'ten önce bir şey olmadığı için parent bağlantısı yoktur.", "Nothing comes before the first commit, so it has no parent link."),
      reviewStep: 0,
    },
    {
      question: l("Geçmiş A → B → C → D (D en yeni). HEAD D'deyken `HEAD~2` hangisi?", "History is A → B → C → D (D newest). With HEAD on D, which is `HEAD~2`?"),
      options: [l("A", "A"), l("B", "B"), l("C", "C"), l("D", "D")],
      answer: 1,
      explain: l("D'den bir geri C, iki geri B.", "One back from D is C; two back is B."),
      reviewStep: 3,
    },
    {
      question: l("Sadece son commit'in mesajını `--amend` ile değiştirdin. Ne olur?", "You changed only the last commit's message with `--amend`. What happens?"),
      options: [
        l("Aynı commit, yeni mesaj", "Same commit, new message"),
        l("Yeni kimlikli yeni bir commit eskisinin yerini alır", "A new commit with a new id takes the old one's place"),
        l("Geçmişe ikinci bir commit eklenir", "A second commit is added to history"),
        l("Hiçbir şey, mesajlar değiştirilemez", "Nothing; messages cannot change"),
      ],
      answer: 1,
      explain: l("Kimlik içerikten hesaplandığı için yeni bir commit oluşur; geçmişin uzunluğu ise aynı kalır.", "The id comes from the content, so a new commit is made; the history keeps the same length."),
      reviewStep: 4,
    },
    {
      question: l("`git log` neden en yeni commit'i en üstte gösterir?", "Why does `git log` show the newest commit first?"),
      options: [
        l("Tarihe göre sıralar", "It sorts by date"),
        l("HEAD'den başlayıp parent bağlantılarını geriye doğru izler", "It starts at HEAD and follows parent links backwards"),
        l("Alfabetik sıralar", "It sorts alphabetically"),
        l("Rastgele sıralar", "It sorts at random"),
      ],
      answer: 1,
      explain: l("Her commit sadece parent'ını bilir, çocuklarını bilmez. Bu yüzden geçmiş en yeniden geriye okunur.", "Each commit knows only its parent, not its children, so history is read from the newest backwards."),
      reviewStep: 2,
    },
  ],
};
