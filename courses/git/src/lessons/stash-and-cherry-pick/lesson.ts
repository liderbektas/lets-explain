import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const stashAndCherryPick: Lesson = {
  slug: "stash-and-cherry-pick",
  title: l("stash ve cherry-pick", "stash and cherry-pick"),
  summary: l(
    "Yarım işini kaybetmeden başka bir branch'e geç (`git stash`) ve tek bir commit'i başka bir branch'e kopyala (`git cherry-pick`).",
    "Switch branches without losing half-done work (`git stash`) and copy a single commit onto another branch (`git cherry-pick`).",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kaydedilmemiş değişiklikle neden branch değiştiremediğini anlamak", "Understand why you cannot switch with unsaved changes"), step: 1 },
    { text: l("`git stash` ile yarım işi kenara kaldırıp geri getirmek", "Put half-done work aside with `git stash` and bring it back"), step: 4 },
    { text: l("`git cherry-pick` ile tek bir commit'i kopyalamak", "Copy a single commit with `git cherry-pick`"), step: 6 },
  ],
  steps: [
    {
      short: l("Yarım iş", "Half done"),
      tag: "problem",
      title: l("İşin yarısındasın ve acil bir hata geldi", "You are halfway through and an urgent bug comes in"),
      body: [
        l(
          "`feature` branch'inde arama özelliği üzerinde çalışıyorsun. `app.js`'e filtre eklemeye başladın ama bitmedi: değişiklik klasörde, commit edilmemiş duruyor.",
          "You are on the `feature` branch building search. You started adding a filter to `app.js` but it is not finished: the change sits in the folder, uncommitted.",
        ),
        l(
          "Tam o sırada haber geliyor: canlıdaki giriş sayfası bozuk, `main` üzerinde hemen düzeltilmesi lazım. Yarım işi commit etmek istemiyorsun, çünkü çalışmıyor.",
          "Right then the news comes: the live login page is broken and must be fixed on `main` now. You do not want to commit the half-done work, because it does not work yet.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git status", note: l("Yarım kalan değişiklikleri görürsün: \"Changes not staged for commit\".", "Shows your half-done changes: \"Changes not staged for commit\".") }],
      },
    },
    {
      short: l("Geçemezsin", "Blocked"),
      tag: "problem",
      predict: {
        question: l(
          "Yarım iş klasördeyken `git switch main` yazarsan ne olur? (main'deki app.js farklı bir halde.)",
          "What happens if you run `git switch main` with the half-done change in the folder? (app.js is different on main.)",
        ),
        options: [
          l("Geçer, yarım iş silinir", "It switches and the half-done work is deleted"),
          l("Git reddeder: değişiklik ezilecekti", "Git refuses: the change would be overwritten"),
          l("Geçer, yarım iş otomatik commit olur", "It switches and the work is committed automatically"),
        ],
        answer: 1,
        why: l(
          "main'e geçmek app.js'i main'deki haline çevirmek demek. Bu senin kaydedilmemiş değişikliğini ezerdi, Git de bunu yapmayı reddeder.",
          "Switching to main means turning app.js into main's version. That would overwrite your unsaved change, so Git refuses.",
        ),
      },
      title: l("Git, kaydedilmemiş işini ezmez", "Git will not overwrite unsaved work"),
      body: [
        l(
          "`git switch main` hata verdi: \"Your local changes to app.js would be overwritten\". HEAD hâlâ `feature`'da, hiçbir şey değişmedi.",
          "`git switch main` failed: \"Your local changes to app.js would be overwritten\". HEAD is still on `feature`; nothing changed.",
        ),
        l(
          "Bu iyi bir şey: Git kaybolacak işi korudu. Ama şimdi o işi bir yere kaldırman gerekiyor.",
          "That is a good thing: Git protected work that would have been lost. But now you need to put that work somewhere.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Değişen dosya iki branch'te aynıysa Git seni durdurmaz, değişikliği yanında taşır. Hata sadece değişiklik ezilecekse çıkar.",
            "If the changed file is the same on both branches, Git does not stop you; it carries the change along. The error only appears when the change would be overwritten.",
          ),
        },
      ],
    },
    {
      short: l("git stash", "git stash"),
      tag: "how",
      predict: {
        question: l("`git stash` çalıştıracağız. app.js'teki yarım iş nereye gider?", "We will run `git stash`. Where does the half-done work in app.js go?"),
        options: [
          l("Silinir", "It is deleted"),
          l("Stash'e kaldırılır, klasör son commit'e döner", "Into the stash; the folder goes back to the last commit"),
          l("Yeni bir commit olur", "It becomes a new commit"),
        ],
        answer: 1,
        why: l(
          "Stash, kaydedilmemiş değişiklikler için bir çekmece. İş oraya kaldırılır, klasör de son commit'teki haline döner.",
          "The stash is a drawer for unsaved changes. The work goes in there and the folder goes back to the last commit.",
        ),
      },
      title: l("git stash: yarım işi çekmeceye kaldır", "git stash: put the half-done work in a drawer"),
      body: [
        l(
          "`git stash` yarım işi aldı ve sağdaki Stash kutusuna `stash@{0}` olarak koydu. Klasör temiz: app.js son commit'teki haline döndü.",
          "`git stash` took the half-done work and put it in the Stash box on the right as `stash@{0}`. The folder is clean: app.js is back to the last commit.",
        ),
        l(
          "Grafikte yeni bir commit yok. Stash, branch'lerin dışında duran ayrı bir rafta saklanır.",
          "There is no new commit in the graph. The stash is kept on a separate shelf, outside the branches.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git stash push -m "filtre yarım"', note: l("Mesajla kaldırır; birden fazla stash olunca hangisi hangisi bilirsin.", "Stashes with a message, so you can tell several stashes apart.") },
          { cmd: "git stash list", note: l("Bütün stash kayıtlarını listeler.", "Lists every stash entry.") },
        ],
      },
    },
    {
      short: l("Hotfix", "Hotfix"),
      tag: "how",
      title: l("main'e geç ve hatayı düzelt", "Switch to main and fix the bug"),
      body: [
        l(
          "Klasör temiz olduğu için `git switch main` bu sefer çalıştı. login.js'teki hatayı düzelttik ve commit attık.",
          "With the folder clean, `git switch main` works this time. We fixed the bug in login.js and committed.",
        ),
        l(
          "Grafikte main'de yeni bir commit var: \"Giriş hatası düzeltildi\". Yarım iş bu sırada stash'te güvende bekliyor.",
          "The graph shows a new commit on main: \"Giriş hatası düzeltildi\". The half-done work waits safely in the stash meanwhile.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch main" },
          { cmd: "git add login.js" },
          { cmd: 'git commit -m "Giriş hatası düzeltildi"' },
        ],
      },
    },
    {
      short: l("stash pop", "stash pop"),
      tag: "how",
      predict: {
        question: l(
          "feature'a dönüp `git stash pop` yazacağız. Ne olur?",
          "We go back to feature and run `git stash pop`. What happens?",
        ),
        options: [
          l("Yarım iş klasöre geri gelir ve stash'ten silinir", "The half-done work comes back to the folder and leaves the stash"),
          l("Yarım iş commit olarak eklenir", "The work is added as a commit"),
          l("Stash'te kalır, sadece görüntülenir", "It stays in the stash and is only shown"),
        ],
        answer: 0,
        why: l(
          "`pop` = geri uygula ve sil. Değişiklik klasöre döner, stash kaydı kaldırılır. Kaydı silmeden uygulamak istersen `git stash apply` var.",
          "`pop` means apply and remove. The change returns to the folder and the entry is removed. To apply without removing, use `git stash apply`.",
        ),
      },
      title: l("git stash pop: kaldığın yerden devam", "git stash pop: pick up where you left off"),
      body: [
        l(
          "`git switch feature` ve `git stash pop`. Yarım iş klasöre geri geldi, app.js yine \"filtre (yarım)\" halinde. Stash kutusu boşaldı.",
          "`git switch feature` and `git stash pop`. The half-done work is back in the folder; app.js is \"filter (half done)\" again. The Stash box is empty.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git switch feature" },
          { cmd: "git stash pop", note: l("En üstteki stash'i geri uygular ve siler.", "Applies the top stash and removes it.") },
          { cmd: "git stash apply stash@{1}", note: l("Belirli bir stash'i silmeden uygular.", "Applies a specific stash without removing it.") },
        ],
      },
    },
    {
      short: l("İşi bitir", "Finish"),
      tag: "how",
      title: l("Yarım işi bitirip commit at", "Finish the work and commit"),
      body: [
        l(
          "Filtreyi bitirdik ve `git commit -a` ile kaydettik. feature'da artık iki commit var.",
          "We finished the filter and saved it with `git commit -a`. feature now has two commits.",
        ),
        l(
          "Ama bir sorun var: giriş hatasının düzeltmesi sadece main'de. feature'da çalışırken de o hata seni rahatsız ediyor.",
          "But there is a catch: the login fix is only on main. While you work on feature, the bug still gets in your way.",
        ),
      ],
      practice: {
        commands: [{ cmd: 'git commit -a -m "Filtre eklendi"' }],
      },
    },
    {
      short: l("cherry-pick", "cherry-pick"),
      tag: "experiment",
      predict: {
        question: l(
          "`git cherry-pick main` ile düzeltmeyi feature'a kopyalayacağız. feature'daki yeni commit'in kimliği main'dekiyle aynı mı olur?",
          "We will copy the fix onto feature with `git cherry-pick main`. Will the new commit on feature have the same id as the one on main?",
        ),
        options: [
          l("Aynı, çünkü aynı değişiklik", "The same, because it is the same change"),
          l("Farklı, çünkü ebeveyni farklı", "Different, because its parent is different"),
          l("Commit oluşmaz, sadece dosya değişir", "No commit, only the file changes"),
        ],
        answer: 1,
        why: l(
          "Bir commit'in kimliği içeriğinden ve ebeveyninden hesaplanır. Kopya farklı bir commit'in üstüne geldi, bu yüzden aynı mesajla ama yeni bir kimlikle oluşur.",
          "A commit's id is computed from its content and its parent. The copy sits on a different parent, so it gets the same message but a new id.",
        ),
      },
      title: l("git cherry-pick: tek bir commit'i kopyala", "git cherry-pick: copy a single commit"),
      body: [
        l(
          "`git cherry-pick main` main'in en üstündeki commit'in getirdiği değişikliği aldı ve feature'ın üstüne **yeni bir commit** olarak uyguladı. login.js feature'da da düzeldi.",
          "`git cherry-pick main` took the change from main's top commit and applied it on top of feature as **a new commit**. login.js is fixed on feature too.",
        ),
        l(
          "İki commit'e bak: mesajları aynı, kimlikleri farklı. Git onları iki ayrı commit olarak görür.",
          "Look at the two commits: same message, different ids. Git sees them as two separate commits.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log main --oneline -3", note: l("Kopyalamak istediğin commit'in kimliğini bul.", "Find the id of the commit you want to copy.") },
          { cmd: "git cherry-pick a1b2c3d", note: l("O commit'i bulunduğun branch'e kopyalar.", "Copies that commit onto the branch you are on.") },
          { cmd: "git cherry-pick -x a1b2c3d", note: l("Mesaja \"(cherry picked from commit …)\" satırı ekler; nereden geldiği belli olur.", "Adds a \"(cherry picked from commit …)\" line, so its origin is recorded.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Bilmen gereken ayrıntılar", "Details worth knowing"),
      body: [
        l(
          "`git stash` varsayılan olarak sadece **takip edilen** dosyalardaki değişiklikleri kaldırır. Hiç add edilmemiş yeni bir dosya klasörde kalır. Onu da almak için `git stash -u` kullan.",
          "By default `git stash` only puts away changes to **tracked** files. A brand-new file that was never added stays in the folder. Use `git stash -u` to take it too.",
        ),
        l(
          "Cherry-pick de merge gibi conflict verebilir. O zaman dosyayı düzeltir, `git add` yapar ve `git cherry-pick --continue` ile bitirirsin; vazgeçmek istersen `--abort`.",
          "Cherry-pick can conflict just like merge. Then you fix the file, `git add` it and finish with `git cherry-pick --continue`, or give up with `--abort`.",
        ),
        l(
          "Çok kullanılan bir iş yapma şekli: hatayı main'de düzelt ve normal yoldan (merge) dağıt. Cherry-pick'i sadece tek bir commit'e gerçekten başka bir yerde ihtiyaç olduğunda kullan, örneğin eski bir sürüm branch'ine hotfix taşırken.",
          "A common way of working: fix the bug on main and spread it the normal way (merge). Keep cherry-pick for when one commit is truly needed somewhere else, such as moving a hotfix onto an old release branch.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Stash kayıtları sadece senin bilgisayarında durur ve kolayca unutulur. Uzun süren işler için stash yerine bir \"wip\" commit'i ya da ayrı bir branch daha güvenli.",
            "Stash entries live only on your computer and are easy to forget. For long-running work, a \"wip\" commit or a separate branch is safer than the stash.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git stash -u", note: l("Takip edilmeyen yeni dosyaları da kaldırır.", "Also stashes untracked new files.") },
          { cmd: "git stash show -p stash@{0}", note: l("Stash'te ne olduğunu satır satır gösterir.", "Shows what is in a stash, line by line.") },
          { cmd: "git cherry-pick --abort", note: l("Yarım kalan cherry-pick'ten vazgeçer.", "Gives up a cherry-pick that stopped halfway.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: yarım işi kenara kaldırmak, iş ortasında acil bir düzeltme yapmak, başka bir branch'ten tek bir commit almak ve yanlış branch'e atılan commit'i taşımak. Komutları terminale **kendin yaz**.",
          "Your turn. Below are **4 scenarios** from real work: putting half-done work aside, making an urgent fix mid-task, taking a single commit from another branch, and moving a commit made on the wrong branch. **Type the commands yourself** in the terminal.",
        ),
        l(
          "`git status` yarım işini, `git stash list` stash'te ne olduğunu, `git log <branch> --oneline` kopyalayacağın commit'in kimliğini gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`git status` shows your half-done work, `git stash list` what's in the stash, and `git log <branch> --oneline` the id of the commit to copy. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "Git, kaydedilmemiş bir değişikliği ezecek bir branch değişikliğini reddeder: işin korunur.",
      "Git refuses a branch switch that would overwrite an unsaved change, so your work is protected.",
    ),
    l("`git stash` yarım işi çekmeceye kaldırır ve klasörü son commit'e döndürür.", "`git stash` puts half-done work in a drawer and returns the folder to the last commit."),
    l("`git stash pop` işi geri getirir ve kaydı siler; `apply` silmeden uygular; `drop` siler.", "`git stash pop` brings the work back and removes the entry; `apply` keeps it; `drop` deletes it."),
    l("`git cherry-pick` bir commit'in getirdiği değişikliği bulunduğun branch'e yeni bir commit olarak kopyalar.", "`git cherry-pick` copies a commit's change onto your branch as a new commit."),
    l("Kopyanın kimliği farklıdır, çünkü commit kimliği içerikten ve ebeveynden hesaplanır.", "The copy has a different id, because a commit id comes from its content and its parent."),
  ],
  quiz: [
    {
      question: l(
        "app.js'te kaydedilmemiş değişikliğin var ve app.js diğer branch'te farklı. `git switch diger` ne yapar?",
        "You have an unsaved change in app.js, and app.js differs on the other branch. What does `git switch other` do?",
      ),
      options: [
        l("Değişikliği siler ve geçer", "Deletes the change and switches"),
        l("Reddeder ve olduğun yerde kalırsın", "Refuses, and you stay where you are"),
        l("Değişikliği commit eder", "Commits the change"),
        l("Değişikliği diğer branch'e taşır", "Moves the change to the other branch"),
      ],
      answer: 1,
      explain: l("Değişiklik ezilecekse Git geçişi reddeder; önce commit et ya da stash'le.", "If the change would be overwritten, Git refuses; commit or stash first."),
      reviewStep: 1,
    },
    {
      question: l("`git stash pop` ile `git stash apply` arasındaki fark nedir?", "What is the difference between `git stash pop` and `git stash apply`?"),
      options: [
        l("pop uygular ve stash'ten siler; apply sadece uygular", "pop applies and removes from the stash; apply only applies"),
        l("apply commit atar, pop atmaz", "apply commits, pop does not"),
        l("Fark yok", "No difference"),
        l("pop uzaktaki stash'i alır", "pop fetches a remote stash"),
      ],
      answer: 0,
      explain: l("İkisi de değişikliği geri getirir; pop ayrıca kaydı siler.", "Both bring the change back; pop also removes the entry."),
      reviewStep: 4,
    },
    {
      question: l("Yeni oluşturduğun ama hiç add etmediğin bir dosya `git stash` ile kaldırılır mı?", "Is a new file you never added put away by `git stash`?"),
      options: [l("Evet, her zaman", "Yes, always"), l("Hayır, onun için `git stash -u` gerekir", "No, that needs `git stash -u`"), l("Sadece .gitignore'daysa", "Only if it is in .gitignore"), l("Dosya silinir", "The file is deleted")],
      answer: 1,
      explain: l("Varsayılan stash sadece takip edilen dosyaları alır; -u takip edilmeyenleri de ekler.", "A default stash takes only tracked files; -u adds untracked ones."),
      reviewStep: 7,
    },
    {
      question: l("Bir commit'i cherry-pick edince yeni commit'in kimliği neden değişir?", "Why does a cherry-picked commit get a new id?"),
      options: [
        l("Git rastgele kimlik verir", "Git picks ids at random"),
        l("Ebeveyni farklıdır ve kimlik ebeveyni de içerir", "Its parent differs, and the id includes the parent"),
        l("Mesajı değişir", "Its message changes"),
        l("Değişmez, aynı kalır", "It does not change"),
      ],
      answer: 1,
      explain: l("Commit kimliği dosyalardan, mesajdan, zamandan ve ebeveynden hesaplanır.", "A commit id is computed from the files, message, time and parent."),
      reviewStep: 6,
    },
  ],
};
