import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const refsAndHead: Lesson = {
  slug: "refs-and-head",
  title: l("Ref'ler ve HEAD", "Refs and HEAD"),
  summary: l(
    "Branch'in aslında içinde bir commit id'si yazan küçük bir dosya olduğunu, HEAD'in neyi gösterdiğini ve detached HEAD'de işini nasıl kaybetmeyeceğini gör.",
    "See that a branch is really a tiny file holding a commit id, what HEAD points at, and how not to lose work on a detached HEAD.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Branch'in bir commit id'si tutan bir dosya olduğunu bilmek", "Know that a branch is a file holding a commit id"), step: 0 },
    { text: l("HEAD'in neyi gösterdiğini ve commit atınca neyin kaydığını görmek", "See what HEAD points at and what moves on a commit"), step: 2 },
    { text: l("`HEAD~2` ve `main^` gibi göreli isimleri okumak", "Read relative names like `HEAD~2` and `main^`"), step: 3 },
    { text: l("Detached HEAD'de atılan bir commit'i kurtarmak", "Rescue a commit made on a detached HEAD"), step: 7 },
  ],
  steps: [
    {
      short: l("Branch = dosya", "Branch = file"),
      tag: "how",
      title: l("Bir branch, içinde id yazan bir dosyadır", "A branch is a file with an id in it"),
      body: [
        l(
          "Grafikte üç commit var ve en sonuncusunun üstünde `main` bayrağı duruyor. Bu bayrak, yani [[branch]], Git'in içinde çok basit bir şey: `.git/refs/heads/main` adında, içinde tek satır olan bir dosya.",
          "The graph has three commits, with the `main` flag on the last one. That flag, a [[branch]], is something very simple inside Git: a file called `.git/refs/heads/main` with a single line in it.",
        ),
        l(
          "O satır, gösterdiği commit'in 40 karakterlik kimliği. Sonundaki satır sonuyla birlikte dosya **41 bayt**. Branch açmak bu kadar ucuz: Git hiçbir dosyayı kopyalamaz, sadece bu küçük dosyayı yazar.",
          "That line is the 40-character id of the commit it points at. With the newline at the end, the file is **41 bytes**. That is why branches are so cheap: Git copies no files, it just writes this tiny file.",
        ),
        l(
          "Branch'ler, tag'ler ve uzaktaki branch'lerin yerel kopyaları gibi bir commit'i isimle gösteren her şeye **ref** denir.",
          "Anything that names a commit like this, such as branches, tags and local copies of remote branches, is called a **ref**.",
        ),
      ],
      practice: {
        intro: l("Kendi repo'nun içinde:", "Inside your own repository:"),
        commands: [
          { cmd: "cat .git/refs/heads/main", note: l("Branch dosyasının içini gösterir: tek bir commit id'si.", "Prints the branch file: a single commit id.") },
          { cmd: "git rev-parse main", note: l("Bir ismin hangi commit'i gösterdiğini söyler. Dosya paketlenmiş olsa da çalışır.", "Says which commit a name points at, even when the file has been packed.") },
        ],
      },
    },
    {
      short: l("HEAD", "HEAD"),
      tag: "how",
      title: l("HEAD: şu an neredesin?", "HEAD: where are you now?"),
      body: [
        l(
          "`main` bayrağının solundaki koyu etiket [[head]]. HEAD, şu an üzerinde çalıştığın yeri gösterir ve çoğu zaman bir commit'i değil, **bir branch'i** gösterir.",
          "The dark tab on the left of the `main` flag is [[head]]. HEAD marks where you are working right now, and most of the time it points at **a branch**, not at a commit.",
        ),
        l(
          "Bu da bir dosya: `.git/HEAD`. İçinde `ref: refs/heads/main` yazar, yani \"main neredeyse ben oradayım\". Zincir şöyle: HEAD → main → commit.",
          "It is a file too: `.git/HEAD`. It says `ref: refs/heads/main`, meaning \"wherever main is, that is where I am\". The chain is HEAD → main → commit.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "cat .git/HEAD", note: l("Genelde `ref: refs/heads/main` gibi bir satır gösterir.", "Usually prints a line like `ref: refs/heads/main`.") },
          { cmd: "git branch --show-current", note: l("Hangi branch'te olduğunu söyler.", "Says which branch you are on.") },
        ],
      },
    },
    {
      short: l("Commit atınca", "On commit"),
      tag: "how",
      predict: {
        question: l(
          "main'deyken yeni bir commit atacağız. Hangi dosya değişecek?",
          "We are on main and will make a new commit. Which file changes?",
        ),
        options: [
          l("Sadece `.git/HEAD`: yeni commit'i göstermeye başlar", "Only `.git/HEAD`: it starts pointing at the new commit"),
          l("Sadece `main`: yeni commit'i gösterir, HEAD hâlâ main'i gösterir", "Only `main`: it points at the new commit, and HEAD still points at main"),
          l("Hiçbiri, sadece yeni commit eklenir", "Neither; only the new commit is added"),
        ],
        answer: 1,
        why: l(
          "HEAD bir branch'i gösterdiği sürece commit, o branch'i ileri taşır. `main` dosyasına yeni id yazılır, HEAD ise yine \"main\" der.",
          "While HEAD points at a branch, a commit moves that branch forward. The new id is written into `main`, and HEAD still says \"main\".",
        ),
      },
      title: l("Commit atınca branch ilerler, HEAD onunla gelir", "A commit moves the branch, and HEAD comes along"),
      body: [
        l(
          "\"Ödeme eklendi\" commit'i atıldı. `main` bayrağı yeni commit'e kaydı ve HEAD de onunla birlikte geldi, çünkü HEAD doğrudan bir commit'i değil `main`'i gösteriyor.",
          "The \"Ödeme eklendi\" commit was made. The `main` flag slid onto it and HEAD came along, because HEAD points at `main`, not at a commit.",
        ),
        l(
          "Git'in yaptığı tek şey `.git/refs/heads/main` dosyasına yeni id'yi yazmak oldu. Branch'ler bu yüzden \"hareket eden isimler\"dir.",
          "All Git did was write the new id into `.git/refs/heads/main`. That is why branches are called \"moving names\".",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git commit -m "Ödeme eklendi"' },
          { cmd: "git log --oneline --decorate", note: l("Commit'leri ve hangi ismin nerede durduğunu gösterir: `(HEAD -> main)`.", "Shows commits and which name sits where: `(HEAD -> main)`.") },
        ],
      },
    },
    {
      short: l("~ ve ^", "~ and ^"),
      tag: "how",
      title: l("Göreli isimler: HEAD~2 ve main^", "Relative names: HEAD~2 and main^"),
      body: [
        l(
          "Her commit'in id'sini ezberlemek zorunda değilsin. `HEAD~2` \"HEAD'den iki commit geri\" demek; `main^` ise \"main'in bir öncesi\". Grafikte bu ikisi parlıyor.",
          "You do not have to remember ids. `HEAD~2` means \"two commits back from HEAD\"; `main^` means \"the one before main\". Those two are glowing in the graph.",
        ),
        l(
          "`~n` her zaman ilk ebeveynden geri gider. `^` tek başına `~1` ile aynıdır; merge commit'lerde `^2` ikinci ebeveyni seçer.",
          "`~n` always walks back through the first parent. `^` on its own equals `~1`; on a merge commit, `^2` picks the second parent.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git show HEAD~2", note: l("İki commit önceki değişikliği gösterir.", "Shows the change from two commits back.") },
          { cmd: "git diff HEAD~1", note: l("Son commit'ten bu yana ne değiştiğini gösterir.", "Shows what changed since the commit before the last.") },
          { cmd: "git log main^ --oneline -1", note: l("main'in bir önceki commit'ini yazar.", "Prints the commit before main.") },
        ],
      },
    },
    {
      short: l("Detached", "Detached"),
      tag: "experiment",
      predict: {
        question: l(
          "`git switch --detach HEAD~2` ile iki commit önceye geçeceğiz. `main`'e ne olacak?",
          "We will go two commits back with `git switch --detach HEAD~2`. What happens to `main`?",
        ),
        options: [
          l("main de iki commit geri gelir", "main moves two commits back too"),
          l("main yerinde kalır; HEAD doğrudan o commit'i gösterir", "main stays put; HEAD points straight at that commit"),
          l("Son iki commit silinir", "The last two commits are deleted"),
        ],
        answer: 1,
        why: l(
          "Bir commit'e doğrudan geçince HEAD artık bir branch'i değil, o commit'i gösterir. Hiçbir branch kıpırdamaz, hiçbir commit silinmez.",
          "When you go to a commit directly, HEAD points at that commit instead of a branch. No branch moves and no commit is deleted.",
        ),
      },
      title: l("Bir commit'e doğrudan geçmek", "Going straight to a commit"),
      body: [
        l(
          "HEAD artık `main`'in yanında değil, eski bir commit'in üstünde tek başına duruyor. Buna **detached HEAD** denir: HEAD bir branch'e bağlı değil.",
          "HEAD is no longer next to `main`; it sits on its own above an old commit. This is called a **detached HEAD**: HEAD is not attached to a branch.",
        ),
        l(
          "`main` yerinde, son iki commit de duruyor. Klasördeki dosyalar o eski commit'teki hale döndü. Eski bir sürümü denemek, hatanın ne zaman başladığına bakmak için kullanışlı.",
          "`main` is where it was, and the last two commits are still there. The files in the folder went back to that old commit. Handy for trying an old version or checking when a bug began.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch --detach HEAD~2", note: l("Modern yol.", "The modern way.") },
          { cmd: "git checkout HEAD~2", note: l("Eski yol; aynı işi yapar. Git \"You are in 'detached HEAD' state\" uyarısı verir.", "The older way; does the same. Git prints a \"You are in 'detached HEAD' state\" note.") },
        ],
      },
    },
    {
      short: l("Orada commit", "Commit there"),
      tag: "problem",
      title: l("Detached HEAD'de commit atmak", "Committing on a detached HEAD"),
      body: [
        l(
          "Burada bir deneme yaptık ve commit attık. Yeni commit oluştu ve HEAD onunla ilerledi.",
          "We tried something here and committed. A new commit appeared and HEAD moved along with it.",
        ),
        l(
          "Ama dikkat: bu commit'i gösteren **hiçbir branch yok**. Onu bulmanın tek yolu şu an HEAD'in onu göstermesi.",
          "But careful: **no branch** points at this commit. The only thing that finds it right now is HEAD.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git status", note: l("İlk satırda `HEAD detached at …` yazar; hangi durumda olduğunu her zaman buradan anlarsın.", "The first line says `HEAD detached at …`; it always tells you which state you are in.") }],
      },
    },
    {
      short: l("Geri dön", "Go back"),
      tag: "problem",
      predict: {
        question: l(
          "Şimdi `git switch main` ile geri döneceğiz. \"Deneme\" commit'ine ne olur?",
          "Now we go back with `git switch main`. What happens to the \"Deneme\" commit?",
        ),
        options: [
          l("main'e taşınır", "It moves to main"),
          l("Hiçbir isim onu göstermez, grafikte soluklaşır", "No name points at it any more; it fades in the graph"),
          l("Hemen silinir", "It is deleted at once"),
        ],
        answer: 1,
        why: l(
          "HEAD main'e geçince \"Deneme\"yi gösteren hiçbir ref kalmaz. Commit hemen silinmez ama artık hiçbir branch'ten görünmez; bir süre sonra Git onu temizleyebilir.",
          "Once HEAD moves to main, no ref points at \"Deneme\". It is not deleted right away, but no branch shows it; after a while Git may clean it up.",
        ),
      },
      title: l("Geri dönünce commit sahipsiz kalır", "Going back leaves the commit orphaned"),
      body: [
        l(
          "\"Deneme\" commit'i grafikte soluk duruyor: hiçbir branch onu göstermiyor. `git log` artık onu listelemez.",
          "The \"Deneme\" commit is faded in the graph: no branch points at it. `git log` no longer lists it.",
        ),
        l(
          "Git, branch'siz commit'leri hemen silmez. Bir süre (varsayılan olarak en az iki hafta) saklar ve sonra çöpe atar. Bu sürede id'sini bilirsen geri getirebilirsin.",
          "Git does not delete branchless commits right away. It keeps them for a while (at least two weeks by default) before throwing them out. Within that time you can bring one back if you know its id.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Git ayrılırken uyarır: \"Warning: you are leaving 1 commit behind, not connected to any of your branches\". Bu uyarıyı görürsen dur ve o commit'e bir isim ver.",
            "Git warns as you leave: \"Warning: you are leaving 1 commit behind, not connected to any of your branches\". If you see it, stop and give that commit a name.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git reflog", note: l("HEAD'in gittiği her yeri listeler; kaybolan commit'in id'si burada.", "Lists everywhere HEAD has been; the lost commit's id is here.") },
        ],
      },
    },
    {
      short: l("İsim ver", "Name it"),
      tag: "how",
      predict: {
        question: l(
          "Soluk commit'e geri gidip `git switch -c deneme` diyeceğiz. Bu ne yapar?",
          "We will go back to the faded commit and run `git switch -c deneme`. What does that do?",
        ),
        options: [
          l("Commit'i kopyalayıp yeni bir commit yapar", "Copies the commit into a new commit"),
          l("O commit'te `deneme` adında bir branch açar ve HEAD'i ona bağlar", "Creates a branch called `deneme` on that commit and attaches HEAD to it"),
          l("Commit'i main'e taşır", "Moves the commit onto main"),
        ],
        answer: 1,
        why: l(
          "`switch -c` bulunduğun yerde yeni bir branch dosyası yazar ve HEAD'i ona bağlar. Commit aynı commit; artık bir ismi olduğu için kaybolmaz.",
          "`switch -c` writes a new branch file right where you are and attaches HEAD to it. The commit is the same one; with a name, it can no longer get lost.",
        ),
      },
      title: l("Commit'i kurtarmak: ona bir isim ver", "Rescue a commit: give it a name"),
      body: [
        l(
          "Commit'in id'siyle oraya geçtik ve `git switch -c deneme` dedik. Soluk commit yeniden renklendi, üstünde `deneme` bayrağı ve HEAD var.",
          "We went to the commit by its id and ran `git switch -c deneme`. The faded commit is colourful again, with the `deneme` flag and HEAD on it.",
        ),
        l(
          "Kural basit: Git'te bir commit'i görünür tutan şey, onu gösteren bir isimdir. Detached HEAD'de işe yarar bir şey yaptıysan, ayrılmadan önce `switch -c` ile isim ver.",
          "The rule is simple: what keeps a commit visible in Git is a name pointing at it. If you did something useful on a detached HEAD, name it with `switch -c` before you leave.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch -c deneme", note: l("Detached HEAD'deyken: bulunduğun commit'e branch açar.", "On a detached HEAD: creates a branch at the current commit.") },
          { cmd: "git branch deneme <id>", note: l("Oraya geçmeden, id'sini bildiğin bir commit'e branch koyar.", "Puts a branch on a commit by id, without going there.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Ref'lerin gerçek hali", "Refs for real"),
      body: [
        l(
          "Repo büyüdükçe Git birçok ref dosyasını tek bir `.git/packed-refs` dosyasına toplar. O yüzden `.git/refs/heads/` altında her branch'i görmeyebilirsin; `git rev-parse` ve `git show-ref` her durumda doğru cevabı verir.",
          "As a repo grows, Git packs many ref files into a single `.git/packed-refs`. So you may not see every branch under `.git/refs/heads/`; `git rev-parse` and `git show-ref` give the right answer either way.",
        ),
        l(
          "Varsayılan branch adı `init.defaultBranch` ayarından gelir. GitHub ve birçok ekip `main` kullanır; eski projelerde `master` görebilirsin.",
          "The default branch name comes from the `init.defaultBranch` setting. GitHub and many teams use `main`; older projects may use `master`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede id'ler gerçek Git id'leri ama ilk 5 karakterini gösteriyoruz. Git genelde 7 karakter gösterir ve gerekirse daha fazlasını kullanır. Yeni Git sürümleri ref'leri isteğe bağlı olarak \"reftable\" adlı başka bir formatta da tutabilir; mantık aynıdır.",
            "The ids here are real Git ids, but we show the first 5 characters. Git usually shows 7 and uses more when needed. Newer Git can optionally store refs in a different format called \"reftable\"; the idea is the same.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git show-ref", note: l("Bütün ref'leri ve gösterdikleri id'leri listeler.", "Lists every ref and the id it points at.") },
          { cmd: "git config --global init.defaultBranch main", note: l("Yeni repo'larda ilk branch'in adını main yapar.", "Makes main the first branch name in new repositories.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Bu repo'da main üzerinde dört commit var. HEAD'i geri götürebilir, `app.js`'i düzenleyip commit atabilir, yeni bir branch açabilir ve main'e dönebilirsin.",
          "This repo has four commits on main. You can move HEAD back, edit `app.js` and commit, open a new branch, and return to main.",
        ),
        l(
          "Üstteki sayaçlara bak: \"Branch'siz commit\" sıfırdan büyükse bir commit'i sahipsiz bıraktın demektir. Sahnenin altında **3 görev** var.",
          "Watch the counters: if \"Commits on no branch\" is above zero, you have left a commit orphaned. Under the scene there are **3 missions**.",
        ),
      ],
    },
  ],
  recap: [
    l("Branch, içinde bir commit id'si yazan 41 baytlık bir dosyadır. Bu yüzden branch açmak bedavadır.", "A branch is a 41-byte file holding a commit id. That is why branches cost nothing."),
    l("HEAD genelde bir branch'i gösterir (`ref: refs/heads/main`); commit attığında o branch ilerler.", "HEAD usually points at a branch (`ref: refs/heads/main`); committing moves that branch forward."),
    l("`HEAD~2` iki commit geri, `main^` main'in bir öncesi demektir.", "`HEAD~2` means two commits back, `main^` the one before main."),
    l("Bir commit'e doğrudan geçince HEAD detached olur; hiçbir branch kıpırdamaz.", "Going straight to a commit detaches HEAD; no branch moves."),
    l("Detached HEAD'de atılan commit'e ayrılmadan önce `git switch -c` ile isim ver, yoksa sahipsiz kalır.", "Name a commit made on a detached HEAD with `git switch -c` before leaving, or it is left orphaned."),
  ],
  quiz: [
    {
      question: l("`.git/refs/heads/feature` dosyasının içinde ne yazar?", "What is inside the file `.git/refs/heads/feature`?"),
      options: [
        l("feature'daki bütün dosyalar", "All the files on feature"),
        l("feature'ın gösterdiği commit'in id'si", "The id of the commit feature points at"),
        l("feature'daki commit'lerin listesi", "The list of commits on feature"),
        l("`ref: refs/heads/feature`", "`ref: refs/heads/feature`"),
      ],
      answer: 1,
      explain: l("Branch dosyası tek bir satırdır: gösterdiği commit'in 40 karakterlik id'si.", "A branch file is a single line: the 40-character id of the commit it points at."),
      reviewStep: 0,
    },
    {
      question: l("main'desin ve commit atıyorsun. Ne değişir?", "You are on main and you commit. What changes?"),
      options: [
        l("`.git/HEAD` yeni id'yi yazar", "`.git/HEAD` gets the new id"),
        l("main yeni commit'i gösterir; HEAD hâlâ main'i gösterir", "main points at the new commit; HEAD still points at main"),
        l("Hiçbir ref değişmez", "No ref changes"),
        l("Bütün branch'ler ilerler", "Every branch moves forward"),
      ],
      answer: 1,
      explain: l("HEAD bir branch'i gösterdiğinde commit sadece o branch'i taşır.", "When HEAD points at a branch, a commit moves only that branch."),
      reviewStep: 2,
    },
    {
      question: l("`git log` çıktısının en üstü C, altında B, altında A. `HEAD~2` hangisi?", "`git log` shows C at the top, then B, then A. Which one is `HEAD~2`?"),
      options: [l("C", "C"), l("B", "B"), l("A", "A"), l("Hiçbiri", "None")],
      answer: 2,
      explain: l("HEAD C'yi gösterir; bir geri B, iki geri A.", "HEAD is C; one back is B, two back is A."),
      reviewStep: 3,
    },
    {
      question: l(
        "Detached HEAD'de önemli bir commit attın. Git'in onu unutmaması için ne yapmalısın?",
        "You made an important commit on a detached HEAD. What should you do so Git keeps it?",
      ),
      options: [
        l("Hemen `git switch main`", "Run `git switch main` right away"),
        l("`git switch -c yeni-isim` ile ona bir branch aç", "Open a branch on it with `git switch -c new-name`"),
        l("Hiçbir şey; Git commit'leri hep saklar", "Nothing; Git always keeps commits"),
        l("`git restore .`", "`git restore .`"),
      ],
      answer: 1,
      explain: l(
        "Bir commit'i görünür tutan, onu gösteren bir isimdir. Branch'siz commit'ler bir süre sonra temizlenebilir.",
        "What keeps a commit visible is a name pointing at it. Branchless commits can be cleaned up after a while.",
      ),
      reviewStep: 7,
    },
  ],
};
