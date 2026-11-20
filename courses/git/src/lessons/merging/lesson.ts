import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const merging: Lesson = {
  slug: "merging",
  title: l("Merge", "Merging"),
  summary: l(
    "Bir branch'teki işi main'e almak. Fast-forward ile merge commit arasındaki farkı, merge base'i, `--no-ff` ve `--ff-only`'yi gör.",
    "Bringing a branch's work into main. See the difference between a fast-forward and a merge commit, the merge base, and `--no-ff` and `--ff-only`.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Fast-forward merge'ün yeni commit oluşturmadığını görmek", "See that a fast-forward merge makes no new commit"), step: 1 },
    { text: l("İki ebeveynli merge commit'in ne zaman oluştuğunu bilmek", "Know when a two-parent merge commit appears"), step: 3 },
    { text: l("Merge base'in ne olduğunu anlamak", "Understand what the merge base is"), step: 4 },
    { text: l("`--no-ff` ve `--ff-only`'yi ne zaman kullanacağını bilmek", "Know when to use `--no-ff` and `--ff-only`"), step: 6 },
  ],
  steps: [
    {
      short: l("Birleştirme", "Joining"),
      tag: "idea",
      title: l("Bitmiş işi main'e almak", "Bringing finished work into main"),
      body: [
        l(
          "`feature` branch'inde arama özelliği bitti: iki commit. Bu sırada main'de kimse bir şey yapmadı, yani `main` hâlâ feature'ın başladığı commit'te.",
          "The search feature is done on `feature`: two commits. Meanwhile nobody did anything on main, so `main` is still at the commit where feature started.",
        ),
        l(
          "Bir branch'in işini başka bir branch'e almaya [[merge]] denir. Merge her zaman **bulunduğun** branch'e yapılır: önce main'e geçer, sonra `git merge feature` dersin.",
          "Bringing one branch's work into another is called a [[merge]]. A merge always goes into the branch **you are on**: switch to main first, then run `git merge feature`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main", note: l("İşi alacak branch'e geç.", "Go to the branch that receives the work.") },
          { cmd: "git log --oneline --graph --all", note: l("Merge'den önce durumu gör.", "Look at the state before merging.") },
        ],
      },
    },
    {
      short: l("Fast-forward", "Fast-forward"),
      tag: "how",
      predict: {
        question: l(
          "main, feature ayrıldığından beri hiç ilerlemedi. `git merge feature` ne yapar?",
          "main has not moved since feature split off. What does `git merge feature` do?",
        ),
        options: [
          l("İki ebeveynli yeni bir merge commit oluşturur", "Makes a new merge commit with two parents"),
          l("main bayrağını feature'ın commit'ine kaydırır, yeni commit yok", "Slides the main flag onto feature's commit, with no new commit"),
          l("feature'ın commit'lerini main'e kopyalar", "Copies feature's commits onto main"),
        ],
        answer: 1,
        why: l(
          "main'den feature'a düz bir yol var. Git sadece main'i ileri kaydırır; buna **fast-forward** denir. Yeni commit, kopya yok.",
          "There is a straight road from main to feature. Git just slides main forward; this is a **fast-forward**. No new commit, no copies.",
        ),
      },
      title: l("Fast-forward: bayrağı ileri kaydır", "Fast-forward: slide the flag forward"),
      body: [
        l(
          "`main` bayrağı iki commit ileri kaydı ve artık `feature` ile aynı commit'i gösteriyor. Commit sayısı değişmedi.",
          "The `main` flag slid two commits forward and now points at the same commit as `feature`. The number of commits did not change.",
        ),
        l(
          "Git çıktısında `Fast-forward` yazar. Geçmiş düz bir çizgi olarak kalır; sanki her şey baştan main'de yapılmış gibi.",
          "Git prints `Fast-forward`. History stays a straight line, as if everything had been done on main from the start.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git merge feature", note: l("main ilerlemediyse fast-forward yapar.", "Fast-forwards when main has not moved.") }],
      },
    },
    {
      short: l("Ayrılan yollar", "Split paths"),
      tag: "how",
      title: l("İki taraf da ilerlerse", "When both sides move"),
      body: [
        l(
          "Bu sefer `sepet` branch'inde bir commit attık, ama bu sırada main'de de bir commit oldu: \"README\". İki yol ayrıldı.",
          "This time we committed on a `sepet` branch, but main also got a commit meanwhile: \"README\". The two paths split.",
        ),
        l(
          "Artık main'den sepet'e düz bir yol yok: main'i kaydırırsak README commit'i geride kalır. Git'in başka bir şey yapması gerekecek.",
          "There is no straight road from main to sepet any more: sliding main would leave the README commit behind. Git will need to do something else.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git log --oneline --graph --all", note: l("Ayrılan iki yolu gösterir.", "Shows the two split paths.") }],
      },
    },
    {
      short: l("Merge commit", "Merge commit"),
      tag: "how",
      predict: {
        question: l("İki taraf da ilerledi. `git merge sepet` ne yapar?", "Both sides moved. What does `git merge sepet` do?"),
        options: [
          l("Fast-forward yapar", "Fast-forwards"),
          l("İki ebeveynli yeni bir merge commit oluşturur", "Makes a new merge commit with two parents"),
          l("Reddeder", "Refuses"),
        ],
        answer: 1,
        why: l(
          "Düz yol olmadığı için Git iki tarafı birleştiren yeni bir commit yapar. Bu commit'in iki ebeveyni vardır: main'in ucu ve sepet'in ucu.",
          "With no straight road, Git makes a new commit that joins both sides. It has two parents: the tip of main and the tip of sepet.",
        ),
      },
      title: l("Merge commit: iki yolu bağla", "A merge commit ties the two paths"),
      body: [
        l(
          "main'de yeni bir commit oluştu. Mesajı Git'in varsayılanı: `Merge branch 'sepet'`. Noktalı çizgi ikinci ebeveyni, yani sepet'i gösteriyor.",
          "A new commit appeared on main with Git's default message: `Merge branch 'sepet'`. The dotted line shows its second parent, sepet.",
        ),
        l(
          "Bu commit'te iki tarafın değişiklikleri birlikte var: README de sepet.js de. sepet branch'i yerinde duruyor; merge onu değiştirmez.",
          "This commit has both sides' changes: README and sepet.js. The sepet branch stays where it was; a merge does not change it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git merge sepet", note: l("Git mesajı düzenlemen için editör açar; kaydedip kapatman yeter.", "Git opens an editor for the message; save and close it.") },
          { cmd: "git log --oneline --graph", note: l("Merge commit'i iki çizginin birleştiği nokta olarak gösterir.", "Shows the merge commit where two lines join.") },
        ],
      },
    },
    {
      short: l("Merge base", "Merge base"),
      tag: "how",
      title: l("Git neye göre birleştirir: üç commit", "How Git joins them: three commits"),
      body: [
        l(
          "Parlayan üç commit'e bak: main'in ucu, sepet'in ucu ve ikisinin **son ortak atası**. Bu ortak ataya **merge base** denir.",
          "Look at the three glowing commits: the tip of main, the tip of sepet, and their **last common ancestor**. That ancestor is the **merge base**.",
        ),
        l(
          "Git her dosya için üçünü karşılaştırır. Sadece bir taraf değiştirdiyse o değişikliği alır. İki taraf da aynı yeri farklı değiştirdiyse karar veremez: bu bir [[conflict]], bir sonraki dersin konusu.",
          "Git compares all three for each file. If only one side changed something, it takes that change. If both sides changed the same place differently, it cannot decide: that is a [[conflict]], the next lesson.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bir belgenin iki kopyasını iki kişi ayrı ayrı düzeltmiş gibi. Orijinali elinde tutarsan kimin neyi değiştirdiğini görürsün; merge base o orijinal.",
            "Like two people editing two copies of a document. If you keep the original, you can see who changed what; the merge base is that original.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git merge-base main sepet", note: l("İki branch'in ortak atasının id'sini yazar.", "Prints the id of the two branches' common ancestor.") },
          { cmd: "git diff main...sepet", note: l("Üç nokta: sepet'in merge base'den beri yaptığı değişiklikler.", "Three dots: what sepet changed since the merge base.") },
        ],
      },
    },
    {
      short: l("--no-ff", "--no-ff"),
      tag: "experiment",
      predict: {
        question: l(
          "`menu` branch'i main'den bir commit ileride; fast-forward mümkün. `git merge --no-ff menu` ne yapar?",
          "The `menu` branch is one commit ahead of main; a fast-forward is possible. What does `git merge --no-ff menu` do?",
        ),
        options: [
          l("Yine fast-forward yapar", "Fast-forwards anyway"),
          l("Yine de bir merge commit oluşturur", "Makes a merge commit anyway"),
          l("Reddeder", "Refuses"),
        ],
        answer: 1,
        why: l(
          "`--no-ff` \"fast-forward yapma\" demek. Git, düz yol olsa bile bir merge commit yapar; böylece bu işin ayrı bir branch'te yapıldığı geçmişte görünür kalır.",
          "`--no-ff` means \"do not fast-forward\". Git makes a merge commit even when there is a straight road, so the history shows this work was done on its own branch.",
        ),
      },
      title: l("--no-ff: her zaman merge commit", "--no-ff: always a merge commit"),
      body: [
        l(
          "menu'yü açıp bir commit attık ve main'e `--no-ff` ile aldık. Fast-forward mümkündü ama Git yine de iki ebeveynli bir merge commit yaptı.",
          "We opened menu, committed once and brought it in with `--no-ff`. A fast-forward was possible, but Git still made a two-parent merge commit.",
        ),
        l(
          "Bazı ekipler bunu tercih eder: her özellik geçmişte kendi \"kabarcığı\" olarak durur ve tek bir commit'le geri alınabilir.",
          "Some teams prefer this: each feature stays in history as its own \"bubble\" and can be undone with a single commit.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git merge --no-ff menu", note: l("Fast-forward mümkün olsa bile merge commit atar.", "Makes a merge commit even when a fast-forward is possible.") }],
      },
    },
    {
      short: l("--ff-only", "--ff-only"),
      tag: "problem",
      predict: {
        question: l(
          "`odeme` branch'inde bir commit var ve main de ilerledi. `git merge --ff-only odeme` ne yapar?",
          "The `odeme` branch has a commit and main has moved too. What does `git merge --ff-only odeme` do?",
        ),
        options: [
          l("Fast-forward yapar", "Fast-forwards"),
          l("Merge commit oluşturur", "Makes a merge commit"),
          l("Reddeder: fast-forward mümkün değil", "Refuses: a fast-forward is not possible"),
        ],
        answer: 2,
        why: l(
          "`--ff-only` \"sadece fast-forward\" demek. İki taraf da ilerlediği için düz yol yok; Git hiçbir şey yapmadan durur.",
          "`--ff-only` means \"only fast-forward\". Both sides moved, so there is no straight road; Git stops without doing anything.",
        ),
      },
      title: l("--ff-only: düz değilse dur", "--ff-only: stop if it is not straight"),
      body: [
        l(
          "Git reddetti: \"Not possible to fast-forward, aborting\". main ve odeme olduğu gibi kaldı.",
          "Git refused: \"Not possible to fast-forward, aborting\". main and odeme are left as they were.",
        ),
        l(
          "Bu seçenek, beklenmedik bir merge commit'in sessizce oluşmasını istemediğinde işe yarar. Özellikle `git pull` yaparken: uzaktaki değişikliği sadece düz bir ilerlemeyse al.",
          "This option is useful when you do not want an unexpected merge commit to appear quietly. Especially with `git pull`: take the remote change only if it is a straight move forward.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git merge --ff-only odeme" },
          { cmd: "git config --global pull.ff only", note: l("`git pull`'u sadece fast-forward yapacak şekilde ayarlar.", "Makes `git pull` fast-forward only.") },
        ],
      },
    },
    {
      short: l("Temizlik", "Clean up"),
      tag: "how",
      title: l("Birleşen branch'leri silmek", "Deleting merged branches"),
      body: [
        l(
          "odeme'yi normal bir merge ile aldık, sonra işi biten dört branch'i `git branch -d` ile sildik. Hepsi zaten main'e birleştiği için Git hiçbirini reddetmedi.",
          "We brought odeme in with a normal merge, then deleted the four finished branches with `git branch -d`. They were all merged into main, so Git refused none of them.",
        ),
        l(
          "Grafikte bütün commit'ler duruyor; kaybolan sadece isimler. Branch'ler iş bitince silinmek için var.",
          "Every commit is still in the graph; only the names are gone. Branches exist to be deleted once the work is done.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git branch --merged", note: l("main'e birleşmiş, silinmesi güvenli branch'ler.", "Branches merged into main, safe to delete.") },
          { cmd: "git branch -d feature sepet menu odeme" },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek Git'te merge", "Merging in real Git"),
      body: [
        l(
          "Git 2.34'ten beri varsayılan merge yöntemi `ort`. Merge commit'te Git `Merge made by the 'ort' strategy.` yazar.",
          "Since Git 2.34 the default merge strategy is `ort`. On a merge commit Git prints `Merge made by the 'ort' strategy.`",
        ),
        l(
          "`git pull` aslında iki adımdır: uzaktaki commit'leri indirir (`fetch`), sonra bulunduğun branch'e merge eder. Uzak depolar dersinde göreceğiz.",
          "`git pull` is really two steps: it downloads the remote commits (`fetch`) and then merges them into your branch. The remotes lesson covers it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her dosya tek parça olarak birleştirilir: iki taraf aynı dosyayı değiştirirse conflict olur. Gerçek Git satır satır bakar ve aynı dosyanın farklı satırlarındaki değişiklikleri kendisi birleştirir.",
            "Here each file merges as a single unit: if both sides change the same file, it conflicts. Real Git looks line by line and merges changes to different lines of the same file on its own.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git merge --abort", note: l("Yarım kalan bir merge'den vazgeçer ve her şeyi önceki haline döndürür.", "Gives up on an unfinished merge and puts everything back.") },
          { cmd: "git log --merges --oneline", note: l("Sadece merge commit'leri listeler.", "Lists only merge commits.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **5 senaryo** var: biten bir işi main'e almak, iki taraf da ilerlemişken birleştirmek, ekip kuralı gereği iz bırakmak, yayın gününde sadece kaydırılabileni almak ve iki branch'i tek bir merge commit'iyle toplamak. Komutları terminale **kendin yaz**.",
          "Your turn. Below are **5 scenarios** from real work: bringing finished work into main, joining two sides that both moved, leaving a trace because the team asks for it, taking only what can slide on release day, and gathering two branches with a single merge commit. **Type the commands yourself** in the terminal.",
        ),
        l(
          "Üstteki \"Merge commit\" sayacını izle. `git log --oneline --all` branch'lerin nerede durduğunu gösterir. Az komutla bitirirsen 3 yıldız alırsın.",
          "Watch the \"Merge commits\" counter. `git log --oneline --all` shows where the branches are. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Merge her zaman bulunduğun branch'e yapılır: `git switch main`, sonra `git merge feature`.", "A merge always goes into the branch you are on: `git switch main`, then `git merge feature`."),
    l("Bulunduğun branch ilerlemediyse Git fast-forward yapar: bayrak kayar, yeni commit oluşmaz.", "If your branch has not moved, Git fast-forwards: the flag slides, no new commit."),
    l("İki taraf da ilerlediyse iki ebeveynli bir merge commit oluşur.", "If both sides moved, a two-parent merge commit appears."),
    l("Git, iki ucu ve ortak atalarını (merge base) karşılaştırarak birleştirir.", "Git joins them by comparing both tips with their common ancestor (the merge base)."),
    l("`--no-ff` her zaman merge commit atar; `--ff-only` düz ilerleme değilse reddeder.", "`--no-ff` always makes a merge commit; `--ff-only` refuses unless it is a straight move."),
    l("Birleşen branch'ler `git branch -d` ile güvenle silinir; commit'ler yerinde kalır.", "Merged branches can be deleted safely with `git branch -d`; the commits stay."),
  ],
  quiz: [
    {
      question: l(
        "feature'da 3 commit var ve main ayrıldığından beri ilerlemedi. main'deyken `git merge feature` sonrası kaç yeni commit oluşur?",
        "feature has 3 commits and main has not moved since it split off. On main, how many new commits does `git merge feature` make?",
      ),
      options: [l("0", "0"), l("1", "1"), l("3", "3"), l("4", "4")],
      answer: 0,
      explain: l("Fast-forward: main sadece feature'ın ucuna kayar.", "A fast-forward: main just slides to feature's tip."),
      reviewStep: 1,
    },
    {
      question: l("Bir merge commit'in kaç ebeveyni vardır?", "How many parents does a merge commit have?"),
      options: [l("0", "0"), l("1", "1"), l("2 (ya da daha fazla)", "2 (or more)"), l("Branch sayısı kadar", "As many as there are branches")],
      answer: 2,
      explain: l("Birleştirdiği iki ucun ikisi de ebeveynidir. Git ikiden fazla branch'i tek seferde de birleştirebilir.", "Both tips it joins are its parents. Git can even join more than two branches at once."),
      reviewStep: 3,
    },
    {
      question: l("Merge base nedir?", "What is the merge base?"),
      options: [
        l("main'in ilk commit'i", "main's first commit"),
        l("İki branch'in son ortak atası", "The last common ancestor of the two branches"),
        l("Merge commit'in kendisi", "The merge commit itself"),
        l("Uzak depodaki main", "main on the remote"),
      ],
      answer: 1,
      explain: l("Git her iki tarafın o ortak noktadan beri ne değiştirdiğine bakarak birleştirir.", "Git joins them by looking at what each side changed since that shared point."),
      reviewStep: 4,
    },
    {
      question: l(
        "`git pull`'un sessizce merge commit oluşturmasını istemiyorsun. Hangi ayar?",
        "You do not want `git pull` to make merge commits quietly. Which setting?",
      ),
      options: [l("`--no-ff`", "`--no-ff`"), l("`--ff-only` (ya da `pull.ff only`)", "`--ff-only` (or `pull.ff only`)"), l("`-D`", "`-D`"), l("`--abort`", "`--abort`")],
      answer: 1,
      explain: l("`--ff-only` sadece düz ilerlemeyi kabul eder; değilse durur ve sana karar bırakır.", "`--ff-only` accepts only a straight move forward; otherwise it stops and leaves the choice to you."),
      reviewStep: 6,
    },
  ],
};
