import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const objects: Lesson = {
  slug: "objects",
  title: l("Nesneler: blob, tree, commit", "Objects: blob, tree, commit"),
  summary: l(
    "Git her şeyi içeriğinden kimlik alan üç tür nesne olarak saklar. Aynı içerik neden tek bir kez saklanır, bir dosya değişince hangi nesneler yenilenir?",
    "Git stores everything as three kinds of object, each named after its content. Why is identical content stored only once, and which objects are renewed when one file changes?",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kimliğin içerikten hesaplandığını görmek", "See that an id is computed from the content"), step: 0 },
    { text: l("Blob, tree ve commit'in ne sakladığını bilmek", "Know what blobs, trees and commits store"), step: 2 },
    { text: l("Aynı içeriğin tek blob olduğunu görmek", "See that identical content is one blob"), step: 3 },
    { text: l("Bir dosya değişince hangi nesnelerin yenilendiğini görmek", "See which objects are renewed when one file changes"), step: 5 },
  ],
  steps: [
    {
      short: l("İçerikten kimlik", "Id from content"),
      tag: "idea",
      title: l("Kimlik, içeriğin parmak izi", "An id is the content's fingerprint"),
      body: [
        l(
          "Git'in içi şaşırtıcı derecede basit: bir **anahtar-değer deposu**. Her şey bir nesne olarak saklanır ve her nesnenin adı, içeriğinden hesaplanan bir [[hash]]'tir.",
          "Git's insides are surprisingly simple: a **key-value store**. Everything is kept as an object, and each object is named by a [[hash]] computed from its content.",
        ),
        l(
          "Klasörde \"Merhaba\" yazan bir README.md var. `git hash-object README.md` bu içeriğin kimliğini yazar: `41979c4…`. Aynı içerik her bilgisayarda, her zaman aynı kimliği verir. İçerikteki tek bir harf değişirse kimlik tamamen başka olur.",
          "The folder has a README.md that says \"Merhaba\". `git hash-object README.md` prints this content's id: `41979c4…`. The same content gives the same id on every computer, every time. Change a single letter and the id is completely different.",
        ),
        l(
          "Sahnedeki kesikli kart bu hesabı gösteriyor, ama nesne henüz `.git`'e yazılmadı.",
          "The dashed card in the scene shows that calculation, but the object has not been written to `.git` yet.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git hash-object README.md", note: l("Dosyanın blob kimliğini hesaplar, hiçbir şey yazmaz.", "Computes the file's blob id without writing anything.") },
          { cmd: "echo 'Merhaba' | git hash-object --stdin", note: l("Herhangi bir metnin kimliğini hesaplar. \"Merhaba\" için hep 41979c4… çıkar.", "Computes the id of any text. \"Merhaba\" always gives 41979c4….") },
        ],
      },
    },
    {
      short: l("blob", "blob"),
      tag: "how",
      predict: {
        question: l("`git add README.md` çalıştıracağız. `.git`'in içine ne yazılır?", "We will run `git add README.md`. What gets written inside `.git`?"),
        options: [
          l("Hiçbir şey, sadece commit'te yazılır", "Nothing; only a commit writes"),
          l("Dosyanın içeriği bir blob nesnesi olarak", "The file's content, as a blob object"),
          l("Bir commit", "A commit"),
        ],
        answer: 1,
        why: l(
          "`git add` dosyanın içeriğini hemen bir blob olarak saklar ve staging'e o blob'un kimliğini yazar. Commit sonra sadece bu blob'ları gösterir.",
          "`git add` stores the file's content as a blob right away and records that blob's id in staging. A commit later just points at these blobs.",
        ),
      },
      title: l("blob: sadece içerik", "blob: content only"),
      body: [
        l(
          "`git add` README.md'nin içeriğini bir **blob** olarak `.git/objects` içine yazdı. Blob sadece dosyanın içeriğidir: adı, yolu ya da izinleri yoktur.",
          "`git add` wrote README.md's content as a **blob** into `.git/objects`. A blob is just the file's content: no name, no path, no permissions.",
        ),
        l(
          "Dosyanın adı bir sonraki nesnede, tree'de saklanacak. Ad ile içeriğin ayrı tutulması, Git'in kopyaları nasıl ayıkladığının sırrı.",
          "The file name is stored in the next kind of object, a tree. Keeping names and content apart is the secret of how Git avoids duplicates.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add README.md" },
          { cmd: "git cat-file -t 41979c4", note: l("Nesnenin türünü yazar: blob.", "Prints the object's type: blob.") },
          { cmd: "git cat-file -p 41979c4", note: l("Nesnenin içeriğini yazar: Merhaba.", "Prints the object's content: Merhaba.") },
        ],
      },
    },
    {
      short: l("tree ve commit", "tree and commit"),
      tag: "how",
      predict: {
        question: l("Şimdi ilk commit'i atacağız. Commit kaç **yeni** nesne oluşturur?", "Now we make the first commit. How many **new** objects does it create?"),
        options: [l("1: commit", "1: the commit"), l("2: bir tree ve commit", "2: a tree and the commit"), l("3: blob, tree ve commit", "3: blob, tree and commit")],
        answer: 1,
        why: l(
          "Blob zaten `git add` ile yazılmıştı. Commit, staging'den bir **tree** (klasörün listesi) yapar ve o tree'yi gösteren bir **commit** ekler.",
          "The blob was already written by `git add`. The commit builds a **tree** (the folder's listing) from staging and adds a **commit** that points at it.",
        ),
      },
      title: l("tree klasörü, commit anı saklar", "A tree stores a folder, a commit stores a moment"),
      body: [
        l(
          "Ortadaki **tree** bir klasörün içeriğini listeler: her satırda nesnenin türü, kimliği ve adı. Burada tek satır var: README.md → blob 41979c4.",
          "The **tree** in the middle lists a folder: each line has an object's type, id and name. Here there is one line: README.md → blob 41979c4.",
        ),
        l(
          "Soldaki **commit** kökteki tree'nin kimliğini, parent'ını (ilk commit'te yok), yazarı, zamanı ve mesajı taşır. Commit'in kimliği de bütün bunlardan hesaplanır.",
          "The **commit** on the left carries the root tree's id, its parent (the first commit has none), the author, the time and the message. The commit's id is computed from all of that.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git cat-file -p HEAD", note: l("Son commit'in ham içeriği: tree, parent, author, committer, mesaj.", "The last commit's raw content: tree, parent, author, committer, message.") },
          { cmd: "git cat-file -p HEAD^{tree}", note: l("Son commit'in tree'si: her dosya için tür, kimlik ve ad.", "The last commit's tree: type, id and name for each file.") },
        ],
      },
    },
    {
      short: l("Aynı içerik", "Same content"),
      tag: "experiment",
      predict: {
        question: l(
          "İçinde yine \"Merhaba\" yazan `notes.txt` adında yeni bir dosya ekleyip commit atacağız. Depoda kaç blob olacak?",
          "We will add a new file `notes.txt` that also says \"Merhaba\" and commit. How many blobs will the repository hold?",
        ),
        options: [l("1", "1"), l("2", "2"), l("3", "3")],
        answer: 0,
        why: l(
          "Blob'un kimliği sadece içerikten gelir. İki dosyanın içeriği aynıysa kimlikleri de aynıdır; Git o içeriği bir kez saklar ve tree'de iki ad aynı blob'u gösterir.",
          "A blob's id comes only from its content. Two files with identical content get the same id, so Git stores that content once and the tree points both names at the same blob.",
        ),
      },
      title: l("Aynı içerik, tek blob", "Same content, one blob"),
      body: [
        l(
          "Yeni tree'de iki satır var: README.md ve notes.txt. İkisi de **aynı** blob'u, 41979c4'ü gösteriyor. Blob sayacı hâlâ 1.",
          "The new tree has two lines, README.md and notes.txt. Both point at the **same** blob, 41979c4. The blob counter is still 1.",
        ),
        l(
          "Yüzlerce dosyalık bir projede aynı lisans metni ya da aynı ikon on yerde dursa bile Git onu bir kez saklar.",
          "In a project with hundreds of files, even if the same licence text or icon appears in ten places, Git stores it once.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git ls-tree HEAD", note: l("Son commit'teki her dosyanın blob kimliğini listeler; aynı içerik aynı kimlikle çıkar.", "Lists each file's blob id in the last commit; identical content shows the same id.") }],
      },
    },
    {
      short: l("Klasörler", "Folders"),
      tag: "how",
      title: l("Klasör içinde klasör: tree içinde tree", "A folder in a folder: a tree in a tree"),
      body: [
        l(
          "`src/app.js` ekledik. Kök tree'de artık `src/` adında bir satır var ve o satır başka bir **tree**'yi gösteriyor. O tree de app.js'in blob'unu listeliyor.",
          "We added `src/app.js`. The root tree now has a line called `src/`, which points at another **tree**, and that tree lists app.js's blob.",
        ),
        l(
          "Böylece bütün proje, kökten başlayan bir ağaç olur: tree'ler klasörler, blob'lar dosyalar. Commit sadece en üstteki tree'yi gösterir; geri kalanı ona bağlıdır.",
          "So the whole project becomes a tree starting at the root: trees are folders and blobs are files. The commit points only at the top tree; everything else hangs off it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Git boş klasörleri saklamaz, çünkü içinde blob olmayan bir tree yazılmaz. Boş bir klasörü korumak için içine `.gitkeep` gibi küçük bir dosya koyulur.",
            "Git does not store empty folders, because a tree with nothing in it is not written. To keep an empty folder, people put a small file such as `.gitkeep` inside.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "git ls-tree -r HEAD", note: l("Alt klasörler dahil bütün dosyaları blob kimlikleriyle listeler.", "Lists every file, subfolders included, with blob ids.") }],
      },
    },
    {
      short: l("Bir dosya değişti", "One file changed"),
      tag: "experiment",
      predict: {
        question: l(
          "Sadece `src/app.js`'i değiştirip commit atacağız. README.md'nin blob'una ne olur?",
          "We will change only `src/app.js` and commit. What happens to README.md's blob?",
        ),
        options: [
          l("Yeniden yazılır, her commit her şeyi kopyalar", "It is written again; every commit copies everything"),
          l("Aynen yeniden kullanılır, yeni commit de aynı blob'u gösterir", "It is reused as is; the new commit points at the same blob"),
          l("Silinir", "It is deleted"),
        ],
        answer: 1,
        why: l(
          "README'nin içeriği değişmedi, yani kimliği de aynı. Yeni tree aynı kimliği listeler ve Git yeni bir kopya yazmaz.",
          "README's content did not change, so its id is the same. The new tree lists that same id, and Git writes no new copy.",
        ),
      },
      title: l("Değişen yeni, değişmeyen paylaşılır", "What changed is new, the rest is shared"),
      body: [
        l(
          "app.js'in yeni içeriği yeni bir blob oldu. Onu listeleyen `src` tree'si, onu gösteren kök tree ve en üstteki commit de yeni: değişiklik yukarı doğru zincirleme gider.",
          "app.js's new content became a new blob. The `src` tree listing it, the root tree pointing at that, and the commit on top are new too: a change ripples upwards.",
        ),
        l(
          "README.md ile notes.txt'in blob'u ise **paylaşılıyor**: iki commit de aynı nesneyi gösteriyor. Bu yüzden her commit projenin tam fotoğrafı olsa bile depo şişmez.",
          "README.md's and notes.txt's blob is **shared**: both commits point at the same object. That is why the repository does not swell, even though every commit is a full snapshot.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git rev-parse HEAD:README.md", note: l("Son commit'teki README'nin blob kimliği.", "README's blob id in the last commit.") },
          { cmd: "git rev-parse HEAD~1:README.md", note: l("Bir önceki commit'teki kimlik: aynı çıkar.", "The id one commit back: the same.") },
        ],
      },
    },
    {
      short: l("Ref'ler", "Refs"),
      tag: "how",
      title: l("Branch dediğin bir dosya", "A branch is just a file"),
      body: [
        l(
          "Nesneler değişmez ve kimlikleri uzun. Hatırlanması kolay adlar için Git **ref** kullanır: `.git/refs/heads/main` dosyasının içinde sadece son commit'in 40 karakterlik kimliği yazar.",
          "Objects never change and their ids are long. For easy names, Git uses **refs**: the file `.git/refs/heads/main` contains nothing but the last commit's 40-character id.",
        ),
        l(
          "`.git/HEAD` dosyası da genelde `ref: refs/heads/main` der: \"şu an main'deyim\". Yeni commit atınca Git yeni commit nesnesini yazar ve main dosyasındaki kimliği günceller. Branch'leri ve HEAD'i bir sonraki derste göreceksin.",
          "The file `.git/HEAD` usually says `ref: refs/heads/main`: \"I am on main\". When you commit, Git writes the new commit object and updates the id in the main file. Branches and HEAD come in the next lesson.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "cat .git/HEAD", note: l("Şu an hangi branch'te olduğunu gösterir.", "Shows which branch you are on.") },
          { cmd: "git rev-parse main", note: l("main'in gösterdiği commit kimliği.", "The commit id main points at.") },
          { cmd: "ls .git/objects", note: l("Nesneler kimliklerinin ilk iki karakterine göre klasörlenir: 41/979c4…", "Objects are filed by the first two characters of their id: 41/979c4….") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Sıkıştırma, paketler ve SHA-256", "Compression, packs and SHA-256"),
      body: [
        l(
          "Gerçek Git her nesneyi zlib ile sıkıştırarak yazar. Nesneler çoğalınca `git gc` onları **packfile** denen tek dosyalarda toplar ve birbirine benzeyen nesneleri fark olarak saklar. Bu bir depolama ayrıntısıdır; kimlikler ve commit'lerin fotoğraf olması değişmez.",
          "Real Git writes every object zlib-compressed. As objects pile up, `git gc` gathers them into single files called **packfiles** and stores similar objects as deltas. That is a storage detail: ids, and commits being snapshots, stay the same.",
        ),
        l(
          "Kimlikler varsayılan olarak SHA-1'dir ve bu sahnedeki kimlikler gerçek Git'in aynı içerik için yazacağı kimliklerdir. Git, isteğe bağlı olarak SHA-256 kullanan repo'ları da destekliyor (`git init --object-format=sha256`); bunlar henüz varsayılan değil.",
          "Ids are SHA-1 by default, and the ids in this scene are the ones real Git would print for the same content. Git also supports repositories that use SHA-256 (`git init --object-format=sha256`), though they are not the default yet.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnedeki dosyalar tek satırlık ve hepsinin izni normal dosya (100644). Gerçek tree'lerde çalıştırılabilir dosyalar (100755) ve sembolik bağlantılar (120000) da vardır.",
            "Files in this scene are one line long and all are ordinary files (100644). Real trees also hold executables (100755) and symbolic links (120000).",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git count-objects -v", note: l("Kaç nesne olduğunu ve ne kadar yer kapladığını gösterir.", "Shows how many objects there are and how much space they take.") },
          { cmd: "git gc", note: l("Nesneleri paketler ve gereksizleri temizler. Git bunu zaman zaman kendisi de yapar.", "Packs objects and cleans up. Git also does this on its own now and then.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda küçük bir proje ve gerçek işten **4 senaryo** var. Dosyaları `echo \"metin\" > dosya` ya da `touch` ile yazıp `git add` ve `git commit` ile kaydedeceksin. Sahne son commit'in ve bir öncekinin nesnelerini gösterir.",
          "Your turn. Below is a small project and **4 scenarios** from real work. You'll write files with `echo \"text\" > file` or `touch` and save them with `git add` and `git commit`. The scene shows the objects of the last commit and the one before.",
        ),
        l(
          "\"yeni\" ve \"paylaşılıyor\" etiketlerine dikkat et. Merak ettiğin bir kimliği `git cat-file -p <kimlik>` ile açabilirsin. Az komutla bitirirsen 3 yıldız alırsın.",
          "Watch the \"new\" and \"shared\" labels. Open any id you're curious about with `git cat-file -p <id>`. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Git bir anahtar-değer deposudur: her nesnenin adı, içeriğinden hesaplanan kimliğidir.", "Git is a key-value store: each object is named by an id computed from its content."),
    l("**blob** bir dosyanın içeriğini, **tree** bir klasörün listesini (ad → kimlik), **commit** kök tree'yi, parent'ı ve mesajı saklar.", "A **blob** stores a file's content, a **tree** a folder's listing (name → id), a **commit** the root tree, the parent and the message."),
    l("`git add` blob'u hemen yazar; commit tree'yi ve commit nesnesini ekler.", "`git add` writes the blob right away; a commit adds the tree and the commit object."),
    l("Aynı içerik her zaman aynı kimliği verir, bu yüzden bir kez saklanır.", "Identical content always gives the same id, so it is stored once."),
    l("Bir dosya değişince onun blob'u, onu içeren tree'ler ve commit yenilenir; geri kalan her şey paylaşılır.", "When one file changes, its blob, the trees containing it and the commit are renewed; everything else is shared."),
    l("Branch'ler ve HEAD birer ref'tir: içinde bir commit kimliği yazan küçük dosyalar.", "Branches and HEAD are refs: small files holding a commit id."),
  ],
  quiz: [
    {
      question: l("İki farklı dosyanın içeriği birebir aynı. Git kaç blob saklar?", "Two different files have exactly the same content. How many blobs does Git store?"),
      options: [l("1", "1"), l("2", "2"), l("Dosya sayısı kadar", "One per file"), l("Hiç", "None")],
      answer: 0,
      explain: l("Blob kimliği sadece içerikten gelir; aynı içerik aynı blob'dur. Adlar tree'de durur.", "A blob's id comes only from its content; same content, same blob. The names live in the tree."),
      reviewStep: 3,
    },
    {
      question: l("Bir blob neyi saklamaz?", "What does a blob not store?"),
      options: [l("Dosyanın içeriğini", "The file's content"), l("Dosyanın adını", "The file's name"), l("Hiçbirini", "Neither"), l("İkisini de saklar", "It stores both")],
      answer: 1,
      explain: l("Blob sadece içeriktir. Ad ve klasör yapısı tree'lerde tutulur.", "A blob is content only. Names and the folder structure are kept in trees."),
      reviewStep: 1,
    },
    {
      question: l(
        "Üç dosyalık bir projede sadece birini değiştirip commit attın (hepsi kökte). Kaç yeni nesne oluşur?",
        "In a project with three files (all at the root) you changed one and committed. How many new objects are created?",
      ),
      options: [l("1", "1"), l("3: blob, tree, commit", "3: blob, tree, commit"), l("5", "5"), l("Her dosya için bir tane", "One per file")],
      answer: 1,
      explain: l("Değişen dosyanın blob'u, onu listeleyen kök tree ve commit yenidir. Diğer iki blob paylaşılır.", "The changed file's blob, the root tree listing it and the commit are new. The other two blobs are shared."),
      reviewStep: 5,
    },
    {
      question: l("`.git/refs/heads/main` dosyasında ne yazar?", "What is in the file `.git/refs/heads/main`?"),
      options: [l("main'deki bütün dosyalar", "All the files on main"), l("Son commit'in kimliği", "The last commit's id"), l("Bütün commit'lerin listesi", "A list of all commits"), l("Branch'in açıklaması", "A description of the branch")],
      answer: 1,
      explain: l("Branch sadece bir commit kimliği taşıyan küçük bir dosyadır. Geçmiş, o commit'ten parent'lara gidilerek bulunur.", "A branch is just a small file holding one commit id. History is found by walking that commit's parents."),
      reviewStep: 6,
    },
  ],
};
