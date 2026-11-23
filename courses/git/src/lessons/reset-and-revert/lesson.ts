import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const resetAndRevert: Lesson = {
  slug: "reset-and-revert",
  title: l("reset ve revert", "reset and revert"),
  summary: l(
    "Bir commit'i geri almanın iki yolu: `reset` branch'i geri taşır, `revert` geri alan yeni bir commit ekler. Hangisini ne zaman kullanacağını öğren.",
    "Two ways to undo a commit: `reset` moves the branch back, `revert` adds a new commit that undoes it. Learn which to use when.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`reset`'in branch'i taşıdığını görmek", "See that `reset` moves the branch"), step: 1 },
    { text: l("`--soft`, `--mixed` ve `--hard`'ın değişiklikleri nereye bıraktığını bilmek", "Know where `--soft`, `--mixed` and `--hard` leave your changes"), step: 4 },
    { text: l("`revert`'in geçmişi bozmadan geri aldığını görmek", "See that `revert` undoes without rewriting history"), step: 5 },
    { text: l("Push edilmiş commit'te revert, yerel commit'te reset seçmek", "Choose revert for pushed commits and reset for local ones"), step: 6 },
  ],
  steps: [
    {
      short: l("Hatalı commit", "Bad commit"),
      tag: "problem",
      title: l("Son commit hatalı", "The last commit is wrong"),
      body: [
        l(
          "main'de dört commit var. Sonuncusu, \"Hatalı deneme\", app.js'i bozdu. Bunu nasıl geri alacağız?",
          "There are four commits on main. The last one, \"Hatalı deneme\", broke app.js. How do we undo it?",
        ),
        l(
          "İki yol var. **`git reset`** branch'i geri taşır, sanki o commit hiç olmamış gibi. **`git revert`** ise geçmişe dokunmaz: üstüne, değişikliği tersine çeviren yeni bir commit ekler.",
          "There are two ways. **`git reset`** moves the branch back, as if the commit never happened. **`git revert`** leaves history alone and adds a new commit on top that reverses the change.",
        ),
        l(
          "Sahnenin altındaki şerit her adımdan sonra değişikliğin nerede olduğunu gösteriyor: klasörde mi, staging'de mi, yoksa hiçbir yerde mi.",
          "The strip under the scene shows where the change is after every step: in the folder, in staging, or nowhere.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline", note: l("Geri gideceğin commit'i bul.", "Find the commit you want to go back to.") },
          { cmd: "git show HEAD", note: l("Son commit'in neyi değiştirdiğini gösterir.", "Shows what the last commit changed.") },
        ],
      },
    },
    {
      short: l("--soft", "--soft"),
      tag: "how",
      predict: {
        question: l(
          "`git reset --soft HEAD~1` çalıştıracağız. \"Hatalı deneme\"nin app.js değişikliği nerede olacak?",
          "We will run `git reset --soft HEAD~1`. Where will \"Hatalı deneme\"'s app.js change be?",
        ),
        options: [l("Tamamen silinir", "Deleted completely"), l("Staging'de, commit'lenmeye hazır", "In staging, ready to commit"), l("Klasörde ama staging'de değil", "In the folder but not staged")],
        answer: 1,
        why: l(
          "`--soft` sadece branch'i geri taşır. Staging'e ve klasöre dokunmaz, bu yüzden commit'in değişiklikleri staging'de hazır bekler.",
          "`--soft` only moves the branch back. It does not touch staging or the folder, so the commit's changes wait in staging.",
        ),
      },
      title: l("reset --soft: commit'i geri al, değişikliği tut", "reset --soft: undo the commit, keep the change staged"),
      body: [
        l(
          "`HEAD~1` \"bir önceki commit\" demek. `git reset --soft HEAD~1` main'i bir commit geri taşıdı. \"Hatalı deneme\" soluk görünüyor: hiçbir branch onu göstermiyor.",
          "`HEAD~1` means \"one commit before\". `git reset --soft HEAD~1` moved main back one commit. \"Hatalı deneme\" is faded: no branch points at it.",
        ),
        l(
          "Değişikliği ise kaybetmedik: app.js staging'de bekliyor. `--soft`, \"commit'i yanlış attım, yeniden atacağım\" durumu için.",
          "We did not lose the change: app.js is waiting in staging. `--soft` is for \"I made that commit wrong and will redo it\".",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git reset --soft HEAD~1", note: l("Son commit'i geri alır, değişiklikler staging'de kalır.", "Undoes the last commit; its changes stay staged.") },
          { cmd: "git reset --soft HEAD~3", note: l("Son üç commit'i geri alır, hepsinin değişikliği staging'de birleşir.", "Undoes the last three commits; all their changes are staged together.") },
        ],
      },
    },
    {
      short: l("Yeniden commit", "Commit again"),
      tag: "how",
      title: l("Düzeltip yeniden commit at", "Fix it and commit again"),
      body: [
        l(
          "app.js'i düzelttik, add ettik ve \"Deneme, düzgün\" diye yeniden commit attık. Yeni commit eski hatalı olanın yerinde, aynı ebeveynin üstünde.",
          "We fixed app.js, added it and committed again as \"Deneme, düzgün\". The new commit sits where the bad one was, on the same parent.",
        ),
        l(
          "Hatalı commit hâlâ soluk bir istasyon olarak duruyor. Git hiçbir commit'i hemen silmez; ama hiçbir branch'te olmadığı için `git log`'da artık görünmez.",
          "The bad commit is still a faded station. Git never deletes a commit right away, but with no branch on it, it no longer shows up in `git log`.",
        ),
      ],
    },
    {
      short: l("--mixed", "--mixed"),
      tag: "how",
      predict: {
        question: l(
          "Şimdi `git reset --mixed HEAD~1`. Bu sefer app.js değişikliği nerede olur?",
          "Now `git reset --mixed HEAD~1`. Where is the app.js change this time?",
        ),
        options: [l("Staging'de", "In staging"), l("Klasörde, staging'de değil", "In the folder, not staged"), l("Hiçbir yerde", "Nowhere")],
        answer: 1,
        why: l(
          "`--mixed` branch'i taşır ve staging'i de o commit'e döndürür, ama klasöre dokunmaz. Değişiklik klasörde, add edilmemiş olarak kalır.",
          "`--mixed` moves the branch and resets staging to that commit, but leaves the folder alone. The change stays in the folder, not added.",
        ),
      },
      title: l("reset --mixed: varsayılan mod", "reset --mixed: the default"),
      body: [
        l(
          "main yine bir commit geri gitti. Değişiklik bu sefer staging'de değil, **klasörde**: app.js \"değişti\" olarak bekliyor.",
          "main went back one commit again. This time the change is not in staging but **in the folder**: app.js is waiting as \"changed\".",
        ),
        l(
          "Mod yazmazsan Git `--mixed` kullanır: `git reset HEAD~1` ile aynı şey. Değişikliği baştan düzenleyip bambaşka commit'lere bölmek istediğinde işe yarar.",
          "If you give no mode, Git uses `--mixed`: it is the same as `git reset HEAD~1`. Use it when you want to rework the change and split it into different commits.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git reset HEAD~1", note: l("`--mixed` ile aynı: commit geri alınır, değişiklik klasörde kalır.", "Same as `--mixed`: the commit is undone, the change stays in the folder.") }],
      },
    },
    {
      short: l("--hard", "--hard"),
      tag: "experiment",
      predict: {
        question: l(
          "Klasördeki değişikliği de istemiyoruz: `git reset --hard HEAD`. app.js'teki \"düzgün\" değişikliğine ne olur?",
          "We do not want the folder change either: `git reset --hard HEAD`. What happens to the \"düzgün\" change in app.js?",
        ),
        options: [l("Staging'e taşınır", "It moves to staging"), l("Silinir ve geri getirilemez", "It is deleted and cannot be brought back"), l("Yeni bir commit olur", "It becomes a new commit")],
        answer: 1,
        why: l(
          "`--hard` staging'i ve klasörü de o commit'e eşitler. Commit edilmemiş değişiklik hiçbir yere kaydedilmediği için kurtarılamaz.",
          "`--hard` resets staging and the folder to that commit too. An uncommitted change was never saved anywhere, so it cannot be recovered.",
        ),
      },
      title: l("reset --hard: her şeyi o commit'e eşitle", "reset --hard: make everything match that commit"),
      body: [
        l(
          "`--hard` üç alanı birden o commit'e eşitledi: branch, staging ve klasör. Klasör temiz; app.js son commit'teki haline döndü.",
          "`--hard` made all three areas match that commit: the branch, staging and the folder. The folder is clean; app.js is back to the last commit.",
        ),
        l(
          "Commit'lenmiş işler soluk istasyonlar olarak duruyor ve reflog ile geri getirilebilir. Ama klasördeki **commit'lenmemiş** değişiklik gitti. `--hard`'dan önce iki kez düşün.",
          "Committed work survives as faded stations and can come back through the reflog. But the **uncommitted** change in the folder is gone. Think twice before `--hard`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`git reset --hard` Git'in veri kaybettirebildiği az sayıdaki komuttan biri. Klasörde önemli bir şey varsa önce `git stash` ile kenara kaldır.",
            "`git reset --hard` is one of the few Git commands that can lose data. If the folder holds anything important, `git stash` it first.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git reset --hard HEAD", note: l("Commit'lenmemiş bütün değişiklikleri atar.", "Throws away every uncommitted change.") },
          { cmd: "git reset --hard HEAD~1", note: l("Son commit'i ve değişikliklerini tamamen atar.", "Throws away the last commit and its changes completely.") },
        ],
      },
    },
    {
      short: l("revert", "revert"),
      tag: "how",
      predict: {
        question: l(
          "\"Renkler değişti\" commit'i de yanlışmış. Bu sefer `git revert HEAD` kullanacağız. O commit'e ne olur?",
          "The \"Renkler değişti\" commit was wrong too. This time we will use `git revert HEAD`. What happens to that commit?",
        ),
        options: [
          l("Silinir, branch geri gider", "It is removed and the branch moves back"),
          l("Yerinde kalır; üstüne onu tersine çeviren yeni bir commit gelir", "It stays; a new commit that reverses it is added on top"),
          l("İçeriği değiştirilir", "Its content is edited"),
        ],
        answer: 1,
        why: l(
          "Revert geçmişe dokunmaz. Commit'in değişikliğini tersine çeviren yeni bir commit yapar: style.css silinir, ama \"Renkler değişti\" geçmişte durur.",
          "Revert does not touch history. It makes a new commit that reverses the change: style.css is removed, but \"Renkler değişti\" stays in history.",
        ),
      },
      title: l("revert: geri alan yeni bir commit", "revert: a new commit that undoes"),
      body: [
        l(
          "`git revert HEAD` \"Revert \\\"Renkler değişti\\\"\" adında yeni bir commit ekledi. style.css gitti, ama geçmiş aynen duruyor: hiçbir commit soluklaşmadı.",
          "`git revert HEAD` added a new commit called \"Revert \\\"Renkler değişti\\\"\". style.css is gone, but history is untouched: no commit faded.",
        ),
        l(
          "Bu yüzden revert **paylaşılmış** geçmişte güvenli. Takım arkadaşların bir sonraki pull'da bu commit'i alır ve herkesin geçmişi uyumlu kalır.",
          "That is why revert is safe on **shared** history. Your teammates get this commit on their next pull, and everyone's history stays consistent.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git revert HEAD", note: l("Son commit'i geri alan yeni bir commit yapar.", "Makes a new commit that undoes the last one.") },
          { cmd: "git revert a1b2c3d", note: l("Herhangi bir commit'i kimliğiyle geri alır.", "Undoes any commit by its id.") },
        ],
      },
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "idea",
      title: l("Push ettin mi? İşte karar", "Did you push? That decides it"),
      body: [
        l(
          "Tek bir soru yeter: **bu commit'i başkasıyla paylaştın mı?** Yani push ettin mi?",
          "One question is enough: **have you shared this commit with anyone?** In other words, did you push it?",
        ),
        l(
          "**Henüz push etmediysen** `git reset` kullan. Geçmiş sadece senin bilgisayarında, istediğin gibi düzenleyebilirsin.",
          "**Not pushed yet**: use `git reset`. The history is only on your machine, so tidy it however you like.",
        ),
        l(
          "**Push ettiysen** `git revert` kullan. Reset ile geçmişi yeniden yazıp zorla push edersen takım arkadaşlarının elindeki geçmişle çakışır ve onların işi kaybolabilir.",
          "**Already pushed**: use `git revert`. Rewriting history with reset and force-pushing clashes with your teammates' copies, and their work can get lost.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Reset bir müsveddeyi silmek, revert ise yayımlanmış bir yazının altına \"düzeltme\" notu eklemek gibi. Basılmış gazeteyi geri toplayamazsın.",
            "Reset is like erasing a draft; revert is like adding a correction under a published article. You cannot recall a newspaper that is already printed.",
          ),
        },
      ],
      practice: {
        intro: l("Karar kısaca:", "The decision in short:"),
        commands: [
          { cmd: "git reset --soft HEAD~1", note: l("Yerel commit'i yeniden yapmak için.", "To redo a local commit.") },
          { cmd: "git reset --hard HEAD~1", note: l("Yerel commit'i tamamen atmak için.", "To throw a local commit away completely.") },
          { cmd: "git revert <commit>", note: l("Push edilmiş bir commit'i geri almak için.", "To undo a pushed commit.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("HEAD~n, ORIG_HEAD ve güvenlik ağı", "HEAD~n, ORIG_HEAD and the safety net"),
      body: [
        l(
          "`HEAD~1` bir önceki commit, `HEAD~3` üç önceki. Kimliğini kopyalayıp `git reset a1b2c3d` da yazabilirsin. Merge commit'lerinin iki ebeveyni olduğu için `HEAD^2` ikinci ebeveyni gösterir.",
          "`HEAD~1` is the commit before, `HEAD~3` three before. You can also paste an id: `git reset a1b2c3d`. Merge commits have two parents, and `HEAD^2` points at the second.",
        ),
        l(
          "Yanlış bir reset yaptıysan panik yapma. Git, reset'ten önceki yeri `ORIG_HEAD` olarak hatırlar: `git reset --hard ORIG_HEAD` seni geri götürür. Daha eskisi için bir sonraki ders olan reflog var.",
          "If you reset to the wrong place, do not panic. Git remembers where you were as `ORIG_HEAD`: `git reset --hard ORIG_HEAD` takes you back. For anything older, there is the reflog, the next lesson.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede reset sadece HEAD'den geri gider. Gerçek Git'te `git reset origin/main` gibi herhangi bir commit'e de taşıyabilirsin. Revert'te de conflict çıkabilir; o zaman merge'deki gibi çözüp `git revert --continue` yazarsın.",
            "Here reset only goes back from HEAD. Real Git can move to any commit, such as `git reset origin/main`. Revert can conflict too; then you resolve it like a merge and run `git revert --continue`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git reset --hard ORIG_HEAD", note: l("Son reset'i geri alır.", "Undoes the last reset.") },
          { cmd: "git revert --no-edit HEAD", note: l("Mesaj sormadan revert eder.", "Reverts without asking for a message.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: commit'leri birleştirmek, paylaşılmış bir hatayı geçmişi bozmadan geri almak, bir commit'i ikiye bölmek ve kötü bir denemeyi çöpe atmak. Komutları terminale **kendin yaz**.",
          "Your turn. Below are **4 scenarios** from real work: squashing commits, undoing a shared mistake without rewriting history, splitting a commit, and binning a bad experiment. **Type the commands yourself** in the terminal.",
        ),
        l(
          "Önce `git log --oneline` ile geçmişe, `git status` ile klasöre bak. Asıl soru hep aynı: commit paylaşıldı mı? İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "Look at history with `git log --oneline` and at the folder with `git status` first. The key question is always the same: has the commit been shared? Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`git reset` branch'i geri taşır. Geride kalan commit'ler silinmez ama hiçbir branch'te görünmez.", "`git reset` moves the branch back. The commits left behind are not deleted, but no branch shows them."),
    l("`--soft` değişiklikleri staging'de, `--mixed` (varsayılan) klasörde tutar; `--hard` ikisini de atar.", "`--soft` keeps changes staged, `--mixed` (the default) keeps them in the folder, `--hard` throws both away."),
    l("`--hard` commit'lenmemiş değişiklikleri kalıcı olarak siler.", "`--hard` permanently deletes uncommitted changes."),
    l("`git revert` geçmişe dokunmadan, geri alan yeni bir commit ekler.", "`git revert` adds a new commit that undoes, without touching history."),
    l("Push etmediysen reset, push ettiysen revert.", "Not pushed: reset. Pushed: revert."),
  ],
  quiz: [
    {
      question: l(
        "Son commit'i geri almak ama değişikliklerini staging'de tutmak istiyorsun. Hangi komut?",
        "You want to undo the last commit but keep its changes staged. Which command?",
      ),
      options: [l("`git reset --soft HEAD~1`", "`git reset --soft HEAD~1`"), l("`git reset --hard HEAD~1`", "`git reset --hard HEAD~1`"), l("`git revert HEAD`", "`git revert HEAD`"), l("`git restore .`", "`git restore .`")],
      answer: 0,
      explain: l("`--soft` sadece branch'i taşır; değişiklikler staging'de kalır.", "`--soft` only moves the branch; the changes stay staged."),
      reviewStep: 1,
    },
    {
      question: l("Mod belirtmeden `git reset HEAD~1` yazarsan ne olur?", "What happens with `git reset HEAD~1` and no mode?"),
      options: [
        l("`--soft` gibi davranır", "It acts like `--soft`"),
        l("`--mixed` gibi: değişiklik klasörde kalır", "Like `--mixed`: the change stays in the folder"),
        l("`--hard` gibi: her şey silinir", "Like `--hard`: everything is deleted"),
        l("Hata verir", "It fails"),
      ],
      answer: 1,
      explain: l("Varsayılan mod `--mixed`'dir: staging o commit'e döner, klasör değişmez.", "The default is `--mixed`: staging goes back to that commit, the folder does not change."),
      reviewStep: 3,
    },
    {
      question: l("Push ettiğin bir commit hatalı çıktı. Ne yaparsın?", "A commit you pushed turns out to be wrong. What do you do?"),
      options: [l("`git reset --hard HEAD~1` ve zorla push", "`git reset --hard HEAD~1` and force-push"), l("`git revert <commit>` ve push", "`git revert <commit>` and push"), l("`git commit --amend`", "`git commit --amend`"), l("Hiçbir şey yapılamaz", "Nothing can be done")],
      answer: 1,
      explain: l(
        "Revert geçmişi yeniden yazmaz; takım arkadaşlarının geçmişiyle çakışmadan geri alır.",
        "Revert does not rewrite history; it undoes without clashing with your teammates' copies.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "Klasörde commit'lemediğin önemli bir değişiklik varken `git reset --hard HEAD~1` yaptın. O değişikliğe ne oldu?",
        "You ran `git reset --hard HEAD~1` while an important uncommitted change sat in the folder. What happened to it?",
      ),
      options: [l("Staging'de duruyor", "It is in staging"), l("Reflog'dan geri getirilebilir", "It can be brought back from the reflog"), l("Kayboldu: hiç commit'lenmemişti", "It is lost: it was never committed"), l("Stash'e kaydedildi", "It was saved to the stash")],
      answer: 2,
      explain: l(
        "Reflog sadece commit'leri hatırlar. Commit'lenmemiş bir değişiklik hiçbir yere kaydedilmediği için `--hard` ile kalıcı olarak gider.",
        "The reflog only remembers commits. An uncommitted change was never saved, so `--hard` removes it for good.",
      ),
      reviewStep: 4,
    },
  ],
};
