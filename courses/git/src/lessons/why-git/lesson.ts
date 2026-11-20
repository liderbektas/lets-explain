import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const whyGit: Lesson = {
  slug: "why-git",
  title: l("Neden Git?", "Why Git?"),
  summary: l(
    "\"rapor_final_v2_SON.docx\" sorununu Git nasıl çözer: tek klasör, eksiksiz geçmiş, istediğin sürüme dönüş ve herkeste tam bir kopya.",
    "How Git solves the \"report_final_v2_LAST.docx\" problem: one folder, a complete history, going back to any version, and a full copy for everyone.",
  ),
  minutes: 10,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Dosya kopyalamanın neden yetmediğini görmek", "See why copying files is not enough"), step: 0 },
    { text: l("Bir commit'in kaydedilmiş bir sürüm olduğunu anlamak", "Understand that a commit is a saved version"), step: 2 },
    { text: l("Eski bir sürüme bakıp geri dönmek", "Look at an old version and come back"), step: 4 },
    { text: l("Git ile GitHub'ın farkını bilmek", "Know the difference between Git and GitHub"), step: 6 },
  ],
  steps: [
    {
      short: l("Kopya yığını", "Pile of copies"),
      tag: "problem",
      title: l("rapor_final_v2_SON.docx", "report_final_v2_LAST.docx"),
      body: [
        l(
          "Bir rapor yazıyorsun. Bozmaktan korktuğun için her büyük değişiklikten önce dosyanın bir kopyasını alıyorsun. Birkaç hafta sonra masaüstün şöyle görünüyor.",
          "You are writing a report. Afraid of breaking it, you copy the file before every big change. A few weeks later your desktop looks like this.",
        ),
        l(
          "Hangisi son hali? İki kopya arasında ne değişti? Üç gün önceki bir paragrafı geri istesen hangi dosyayı açarsın? Kopyalar bir **geçmiş** gibi görünüyor ama hiçbir soruya cevap vermiyor.",
          "Which one is the latest? What changed between two copies? If you wanted a paragraph from three days ago, which file would you open? The copies look like a **history** but answer none of these questions.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kod projelerinde durum daha kötü: tek bir dosya değil yüzlerce dosya birlikte değişir. Bir sürümü geri almak, hepsini aynı anın haline döndürmek demektir.",
            "Code projects are worse: not one file but hundreds change together. Going back to a version means putting all of them back to the same moment.",
          ),
        },
      ],
    },
    {
      short: l("Birlikte", "Together"),
      tag: "problem",
      predict: {
        question: l(
          "Ada ve Bora aynı raporun kopyasını ayrı ayrı düzenleyip birbirlerine e-postayla gönderiyor. Ne olur?",
          "Ada and Bora each edit their own copy of the report and email it to each other. What happens?",
        ),
        options: [
          l("Değişiklikler kendiliğinden birleşir", "The changes merge on their own"),
          l("Biri diğerinin işini elle birleştirmezse bir taraftaki değişiklikler kaybolur", "Unless someone merges by hand, one side's changes get lost"),
          l("Son gönderilen dosya her şeyi içerir", "The last file sent contains everything"),
        ],
        answer: 1,
        why: l(
          "Dosyalar kimin neyi değiştirdiğini bilmez. İki ayrı \"son hal\" olur ve birini seçmek ötekindeki işi çöpe atmak demektir.",
          "Files do not know who changed what. You end up with two separate \"latest\" versions, and picking one throws away the work in the other.",
        ),
      },
      title: l("İki kişi, iki \"son hal\"", "Two people, two \"latest\" versions"),
      body: [
        l(
          "Ada ve Bora aynı raporun kopyalarını ayrı ayrı düzenliyor. Her biri kendi kopyasını en güncel sanıyor.",
          "Ada and Bora edit separate copies of the same report. Each thinks theirs is the latest.",
        ),
        l(
          "Birleştirmek için biri iki dosyayı yan yana açıp satır satır karşılaştırmak zorunda. Bunu her gün, her dosya için yaptığını düşün.",
          "To combine them, someone has to open both files side by side and compare line by line. Now imagine doing that every day, for every file.",
        ),
      ],
    },
    {
      short: l("Git", "Git"),
      tag: "idea",
      title: l("Fikir: tek klasör, kaydedilmiş sürümler", "The idea: one folder, saved versions"),
      body: [
        l(
          "Git bir **sürüm kontrol sistemi**. Kopya almak yerine projenin o anki halini bir [[commit]] olarak kaydedersin. Her commit'in bir mesajı, yazarı, zamanı ve bir kimliği vardır.",
          "Git is a **version control system**. Instead of copying files, you save the project's current state as a [[commit]]. Every commit has a message, an author, a time and an id.",
        ),
        l(
          "Sahnede ilk commit'i görüyorsun: \"İlk taslak\". Küpün üstündeki harfler ve rakamlar onun kısa kimliği. Üstündeki `main` etiketi branch'in adı; şimdilik \"ana çizgi\" diye düşün.",
          "The scene shows the first commit: \"İlk taslak\". The letters and digits on the cube are its short id. The `main` label above it is the branch name; for now, think of it as \"the main line\".",
        ),
      ],
      practice: {
        intro: l("Proje klasöründe, ilk kez:", "In your project folder, the first time:"),
        commands: [
          { cmd: 'git config --global user.name "Adın Soyadın"', note: l("Commit'lerde görünecek adın. Bilgisayar başına bir kez.", "The name shown on your commits. Once per computer.") },
          { cmd: 'git config --global user.email "sen@ornek.com"', note: l("Commit'lerde görünecek e-posta.", "The email shown on your commits.") },
          { cmd: "git init", note: l("Bu klasörü bir Git repo'su yapar.", "Makes this folder a Git repository.") },
          { cmd: "git add rapor.md" },
          { cmd: 'git commit -m "İlk taslak"' },
        ],
      },
    },
    {
      short: l("Sürümler", "Versions"),
      tag: "how",
      predict: {
        question: l(
          "Raporu iki kez daha değiştirip her seferinde commit attık. Klasörde şimdi kaç tane rapor dosyası var?",
          "We changed the report twice more and committed each time. How many report files are in the folder now?",
        ),
        options: [l("3, her sürüm için bir dosya", "3, one per version"), l("1, sürümler Git'in içinde saklanır", "1, the versions are stored inside Git"), l("0, hepsi Git'e taşındı", "0, they all moved into Git")],
        answer: 1,
        why: l(
          "Klasörde hep tek bir `rapor.md` durur. Eski sürümler gizli `.git` klasöründe, commit'lerin içinde saklanır.",
          "The folder always holds a single `rapor.md`. Older versions are stored inside the hidden `.git` folder, in the commits.",
        ),
      },
      title: l("Klasörde tek dosya, Git'te üç sürüm", "One file in the folder, three versions in Git"),
      body: [
        l(
          "İki commit daha attık. Grafik büyüdü: her küp bir sürüm ve her biri bir öncekine bağlı. `main` etiketi her commit'te en yenisine kaydı.",
          "We made two more commits. The graph grew: every cube is a version, each linked to the one before. The `main` label moved to the newest one with every commit.",
        ),
        l(
          "Klasörde hâlâ tek bir `rapor.md` var: son hali. Kopya yığını yok, ama bütün geçmiş eksiksiz duruyor ve her sürümün ne zaman, kim tarafından, neden yapıldığı belli.",
          "The folder still holds one `rapor.md`: the latest one. No pile of copies, yet the whole history is there, with when, by whom and why each version was made.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline", note: l("Bütün sürümleri en yenisi üstte listeler.", "Lists every version, newest first.") },
          { cmd: "git log -p rapor.md", note: l("Bir dosyanın her sürümde nasıl değiştiğini gösterir.", "Shows how one file changed in each version.") },
        ],
      },
    },
    {
      short: l("Geri bak", "Look back"),
      tag: "experiment",
      predict: {
        question: l(
          "İlk taslağa geri dönüp bakacağız. Sonraki iki commit'e ne olur?",
          "We will go back and look at the first draft. What happens to the two later commits?",
        ),
        options: [
          l("Silinirler", "They are deleted"),
          l("Yerinde dururlar; istediğin an geri dönersin", "They stay; you can come back any time"),
          l("İlk taslakla birleşirler", "They merge into the first draft"),
        ],
        answer: 1,
        why: l(
          "Eski bir commit'e bakmak sadece klasördeki dosyaları o anki haline getirir. Commit'ler hiçbir yere gitmez.",
          "Looking at an old commit only puts the folder's files back to that moment. The commits do not go anywhere.",
        ),
      },
      title: l("Eski bir sürüme bakmak", "Looking at an old version"),
      body: [
        l(
          "`git checkout HEAD~2` ile iki sürüm geri gittik. Klasördeki rapor yine sadece \"Giriş\" diyor: ilk taslağın hali.",
          "With `git checkout HEAD~2` we went back two versions. The report in the folder says just \"Giriş\" again: the first draft.",
        ),
        l(
          "Sonraki iki commit grafikte duruyor. Koyu [[head]] etiketi şu an nerede olduğunu gösteriyor: `main` branch'inde değil, doğrudan eski commit'te. Buna **detached HEAD** denir; bakmak için güvenli, ama burada yeni iş yapma.",
          "The two later commits are still in the graph. The dark [[head]] label shows where you are now: not on the `main` branch, but straight on the old commit. This is called **detached HEAD**; it is safe for looking, but do not start new work here.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`HEAD~2` \"bulunduğum yerden iki commit geri\" demek. Kimliğin tamamını yazmana gerek yok; ilk 7 karakteri de yeter.",
            "`HEAD~2` means \"two commits back from where I am\". You do not need the full id either; the first 7 characters are enough.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git checkout HEAD~2", note: l("İki sürüm önceye bakar (detached HEAD).", "Looks at the version two back (detached HEAD).") },
          { cmd: "git show HEAD~2:rapor.md", note: l("Klasörü değiştirmeden eski bir sürümdeki dosyayı ekrana yazar.", "Prints a file from an old version without touching the folder.") },
        ],
      },
    },
    {
      short: l("Geri dön", "Come back"),
      tag: "how",
      title: l("En yeni hale geri dön", "Back to the latest"),
      body: [
        l(
          "`git switch main` ile tekrar `main`'e döndük. Klasördeki rapor yine son halinde ve HEAD yeniden `main` etiketinin yanında.",
          "With `git switch main` we are back on `main`. The report in the folder is the latest again, and HEAD sits next to the `main` label once more.",
        ),
        l(
          "Kopya yığınında yapamadığın her şeyi artık yapabilirsin: hangi sürümün son olduğunu görmek, neyin değiştiğini görmek ve istediğin ana gidip dönmek.",
          "Everything the pile of copies could not do, you can now: see which version is latest, see what changed, and travel to any moment and back.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main", note: l("main branch'ine, yani en yeni hale döner.", "Goes back to the main branch, the latest state.") },
          { cmd: "git status", note: l("Nerede olduğunu her zaman söyler: \"On branch main\".", "Always tells you where you are: \"On branch main\".") },
        ],
      },
    },
    {
      short: l("Herkeste kopya", "Everyone's copy"),
      tag: "reality",
      title: l("Herkeste tam bir kopya: Git ve GitHub", "A full copy for everyone: Git and GitHub"),
      body: [
        l(
          "Git **dağıtık** çalışır: projeyi `git clone` ile alan herkes bütün geçmişin tam bir kopyasını alır. İnternet olmadan commit atabilir, geçmişe bakabilir, branch açabilirsin.",
          "Git is **distributed**: everyone who gets a project with `git clone` gets a full copy of the whole history. You can commit, browse history and branch without the internet.",
        ),
        l(
          "Ada ile Bora artık birbirine dosya göndermez. İkisi de aynı repo'nun kopyasında çalışır, commit'lerini ortak bir yere gönderir (`push`) ve ötekinin commit'lerini alır (`pull`). Git kimin neyi değiştirdiğini bildiği için çoğu birleştirmeyi kendisi yapar.",
          "Ada and Bora no longer email files. Both work in a copy of the same repository, send their commits to a shared place (`push`) and fetch the other's (`pull`). Because Git knows who changed what, it does most merging on its own.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Git bilgisayarındaki programdır. GitHub, GitLab ve Bitbucket ise repo'ları internette saklayan ve üstüne pull request gibi araçlar ekleyen servislerdir. Git onlarsız da çalışır.",
            "Git is the program on your computer. GitHub, GitLab and Bitbucket are services that host repositories online and add tools such as pull requests. Git works without them too.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git clone https://github.com/kullanici/proje.git", note: l("Bir projenin bütün geçmişiyle kopyasını indirir.", "Downloads a project together with its whole history.") },
          { cmd: "git --version", note: l("Git'in kurulu olup olmadığını gösterir.", "Shows whether Git is installed.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda bir dönem raporu ve gerçek hayattan **4 senaryo** var: her birinde rapor bir durumda, bir şeyin yapılması gerekiyor. Komutları terminale **kendin yaz**; sahne her komutta ne olduğunu gösterir.",
          "Your turn. Below is a term report and **4 scenarios** from real life: in each, the report is in some state and something needs doing. **Type the commands yourself** in the terminal; the scene shows what each one does.",
        ),
        l(
          "Takılırsan `git status` yaz: Git nerede olduğunu ve ne yapabileceğini söyler. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `git status`: Git tells you where you are and what you can do. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Dosya kopyalamak geçmiş vermez: neyin, ne zaman, neden değiştiği kaybolur.", "Copying files gives no history: what changed, when and why is lost."),
    l("Git projenin o anki halini bir [[commit]] olarak kaydeder. Klasörde tek dosya durur, sürümler `.git`'in içindedir.", "Git saves the project's state as a [[commit]]. The folder keeps one file; the versions live inside `.git`."),
    l("Her commit bir öncekine bağlıdır; birlikte projenin eksiksiz geçmişini oluştururlar.", "Each commit links to the one before; together they form the project's complete history."),
    l("Eski bir sürüme bakmak (`git checkout HEAD~2`) sonraki commit'leri silmez; `git switch main` ile geri dönersin.", "Looking at an old version (`git checkout HEAD~2`) does not delete later commits; `git switch main` brings you back."),
    l("Git dağıtıktır: herkes bütün geçmişin bir kopyasını taşır. GitHub ise repo'ları barındıran bir servistir.", "Git is distributed: everyone carries a copy of the whole history. GitHub is a service that hosts repositories."),
  ],
  quiz: [
    {
      question: l("Üç commit attığın bir projede klasörde kaç tane rapor dosyası olur?", "In a project with three commits, how many report files are in the folder?"),
      options: [l("1", "1"), l("3", "3"), l("4", "4"), l("Hiç", "None")],
      answer: 0,
      explain: l("Klasörde her zaman tek bir dosya durur. Sürümler `.git` klasöründe saklanır.", "The folder always holds one file. The versions are stored in the `.git` folder."),
      reviewStep: 3,
    },
    {
      question: l("`git checkout HEAD~2` ile eski bir sürüme baktın. Sonraki commit'lere ne olur?", "You looked at an old version with `git checkout HEAD~2`. What happens to the later commits?"),
      options: [l("Silinir", "Deleted"), l("Yerinde durur", "They stay"), l("Eski sürümle birleşir", "Merged into the old version"), l("GitHub'a taşınır", "Moved to GitHub")],
      answer: 1,
      explain: l("Bakmak hiçbir şeyi silmez. `git switch main` ile en yeni hale dönersin.", "Looking deletes nothing. `git switch main` takes you back to the latest."),
      reviewStep: 4,
    },
    {
      question: l("Git ile GitHub arasındaki fark nedir?", "What is the difference between Git and GitHub?"),
      options: [
        l("Aynı şeyin iki adı", "Two names for the same thing"),
        l("Git bilgisayardaki sürüm kontrol programı, GitHub repo'ları internette barındıran bir servis", "Git is the version control program on your computer; GitHub is a service that hosts repositories online"),
        l("GitHub olmadan Git çalışmaz", "Git does not work without GitHub"),
        l("Git sadece GitHub'daki dosyalar içindir", "Git is only for files on GitHub"),
      ],
      answer: 1,
      explain: l("Git kendi başına çalışır. GitHub gibi servisler repo'yu paylaşmayı ve birlikte çalışmayı kolaylaştırır.", "Git works on its own. Services like GitHub make sharing a repository and working together easier."),
      reviewStep: 6,
    },
    {
      question: l("Bir projeyi `git clone` ile alan biri neyi alır?", "What does someone get with `git clone`?"),
      options: [l("Sadece son hali", "Only the latest state"), l("Bütün geçmişin tam bir kopyasını", "A full copy of the whole history"), l("Sadece kendi değiştirdiği dosyaları", "Only the files they changed"), l("Bir bağlantı, dosyalar uzakta kalır", "A link; the files stay remote")],
      answer: 1,
      explain: l("Git dağıtıktır: her kopya bütün commit'leri içerir, internet olmadan da çalışılır.", "Git is distributed: every copy contains all commits, so you can work offline too."),
      reviewStep: 6,
    },
  ],
};
