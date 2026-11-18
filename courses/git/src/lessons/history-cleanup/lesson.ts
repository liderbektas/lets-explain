import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const historyCleanup: Lesson = {
  slug: "history-cleanup",
  title: l("Geçmişi temizlemek", "Cleaning up history"),
  summary: l(
    "\"wip\", \"typo\", \"debug log\"... Push etmeden önce kendi commit'lerini toparla: `--amend` ile son commit'i düzelt, `rebase -i` ile birleştir, sil, yeniden adlandır.",
    "\"wip\", \"typo\", \"debug log\"... Tidy your own commits before you push: fix the last one with `--amend`, then combine, drop and rename with `rebase -i`.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`git commit --amend` ile son commit'i düzeltmek", "Fix the last commit with `git commit --amend`"), step: 1 },
    { text: l("`git rebase -i` yapılacaklar listesini okumak", "Read the `git rebase -i` todo list"), step: 2 },
    { text: l("fixup, squash, drop ve reword ile geçmişi toparlamak", "Tidy history with fixup, squash, drop and reword"), step: 5 },
    { text: l("Sadece push edilmemiş commit'leri temizlemek", "Clean up only commits you have not pushed"), step: 7 },
  ],
  steps: [
    {
      short: l("Dağınık", "Messy"),
      tag: "problem",
      title: l("Aceleyle yazılmış beş commit", "Five commits written in a hurry"),
      body: [
        l(
          "Giriş ve şifre özelliği üzerinde çalıştık. İş bitti ama geçmiş dağınık: bir \"yazım hatası\" düzeltmesi, unutulmuş bir \"debug log\", adı \"wip\" olan yarım bir commit ve son commit'in mesajında bir yazım hatası (\"kontorlü\").",
          "We worked on the login and password feature. The work is done, but the history is messy: a \"typo\" fix, a forgotten \"debug log\", a half-done commit called \"wip\", and a typo in the last commit's message (\"kontorlü\").",
        ),
        l(
          "Kesik çizgili `origin/main` etiketi, sunucuda zaten olan son commit'i gösteriyor. Üstündeki beş commit **sadece bizim bilgisayarımızda**. Henüz kimse onları görmedi, o yüzden düzeltmekte özgürüz.",
          "The dashed `origin/main` label marks the last commit already on the server. The five commits above it are **only on our machine**. Nobody has seen them yet, so we are free to fix them.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Temiz bir geçmiş bir hikâye anlatır: her commit tek bir anlamlı adımdır. Bir hatayı bulmak (`git bisect`), bir değişikliği geri almak (`git revert`) ve kodu incelemek böyle çok daha kolaydır.",
            "A clean history tells a story: each commit is one meaningful step. Finding a bug (`git bisect`), undoing a change (`git revert`) and reviewing code are all much easier that way.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline origin/main..HEAD", note: l("Henüz push etmediğin commit'leri listeler: temizleyebileceklerin bunlar.", "Lists the commits you have not pushed yet: these are the ones you may clean up.") },
        ],
      },
    },
    {
      short: l("--amend", "--amend"),
      tag: "how",
      predict: {
        question: l(
          "Son commit'in mesajını `git commit --amend -m \"Şifre kontrolü\"` ile düzelteceğiz. O commit'in kimliğine (hash) ne olur?",
          "We will fix the last commit's message with `git commit --amend -m \"Şifre kontrolü\"`. What happens to that commit's id (hash)?",
        ),
        options: [
          l("Aynı kalır, sadece mesaj değişir", "It stays the same; only the message changes"),
          l("Yeni bir commit oluşur; eskisi hiçbir branch'te kalmaz", "A new commit is made, and the old one is left on no branch"),
          l("Commit silinir", "The commit is deleted"),
        ],
        answer: 1,
        why: l(
          "Commit'ler değiştirilemez: mesaj da kimliğin parçası. `--amend` eskisinin yerine **yeni** bir commit koyar ve branch'i ona kaydırır. Eskisi hayalet olur.",
          "Commits cannot be changed, and the message is part of the id. `--amend` puts a **new** commit in place of the old one and moves the branch to it. The old one becomes a ghost.",
        ),
      },
      title: l("Son commit'i düzelt: --amend", "Fix the last commit: --amend"),
      body: [
        l(
          "`git commit --amend` son commit'i baştan yazdı: mesaj artık \"Şifre kontrolü\". Grafikte yeni bir commit parlıyor, eskisi soluk bir hayalet.",
          "`git commit --amend` rewrote the last commit: the message is now \"Şifre kontrolü\". A new commit glows in the graph, and the old one is a faded ghost.",
        ),
        l(
          "`--amend` sadece mesaj için değil. Unuttuğun bir dosyayı `git add` edip `git commit --amend --no-edit` dersen, o dosya mesaja dokunmadan son commit'e eklenir.",
          "`--amend` is not just for messages. If you `git add` a file you forgot and run `git commit --amend --no-edit`, the file joins the last commit without touching the message.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'git commit --amend -m "Şifre kontrolü"', note: l("Son commit'in mesajını değiştirir.", "Changes the last commit's message.") },
          { cmd: "git commit --amend --no-edit", note: l("Staging'dekini son commit'e ekler, mesaj aynı kalır.", "Adds what is staged to the last commit; the message stays.") },
        ],
      },
    },
    {
      short: l("rebase -i", "rebase -i"),
      tag: "how",
      title: l("rebase -i: geçmişi bir listeyle düzenle", "rebase -i: edit history as a list"),
      body: [
        l(
          "Daha eski commit'leri düzeltmek için `git rebase -i origin/main`. Git, push etmediğin commit'leri **en eskisi üstte** olacak şekilde bir yapılacaklar listesinde açar. Sağdaki koyu panel o liste.",
          "To fix older commits, run `git rebase -i origin/main`. Git opens the commits you have not pushed as a todo list, **oldest at the top**. The dark panel on the right is that list.",
        ),
        l(
          "Her satırın başındaki kelimeyi değiştirerek Git'e ne yapacağını söylersin: `pick` olduğu gibi tut, `reword` mesajını değiştir, `squash` öncekiyle birleştir (mesajları da birleştir), `fixup` öncekiyle birleştir (sadece öncekinin mesajını tut), `drop` tamamen at. Dosyayı kaydedip kapatınca Git listeyi yukarıdan aşağı uygular.",
          "You tell Git what to do by changing the first word of each line: `pick` keeps it, `reword` changes its message, `squash` merges it into the one above (joining messages), `fixup` merges it into the one above (keeping only that message), `drop` throws it away. Save and close, and Git applies the list top to bottom.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek listede ayrıca `edit` (o commit'te durup değiştirmene izin verir) ve satırların sırasını değiştirme var. Sırayı değiştirmek conflict'e yol açabilir; bu sahne sırayı korur ve conflict'siz planlar kullanır.",
            "The real list also has `edit` (stop at a commit so you can change it), and you can reorder lines. Reordering can cause conflicts; this scene keeps the order and uses plans without conflicts.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git rebase -i origin/main", note: l("Push etmediğin commit'leri düzenlemek için listeyi açar.", "Opens the list to edit the commits you have not pushed.") },
          { cmd: "git rebase -i HEAD~3", note: l("Son üç commit'i düzenler.", "Edits the last three commits.") },
        ],
      },
    },
    {
      short: l("fixup", "fixup"),
      tag: "experiment",
      predict: {
        question: l(
          "Listede `yazım hatası düzeltildi` satırını `fixup` yapacağız. Sonunda **Giriş formu** commit'inde login.js'in hangi hali olur?",
          "In the list we will mark the `yazım hatası düzeltildi` line as `fixup`. In the end, which login.js is in the **Giriş formu** commit?",
        ),
        options: [
          l("İlk hali: düzeltme ayrı bir commit olarak kalır", "The first one: the fix stays a separate commit"),
          l("Düzeltilmiş hali: iki commit tek commit oldu", "The fixed one: the two commits became one"),
          l("Hiçbiri: Giriş formu commit'i silinir", "Neither: the Giriş formu commit is deleted"),
        ],
        answer: 1,
        why: l(
          "fixup, düzeltmeyi bir önceki commit'in içine katar ve önceki commit'in mesajını tutar. Geriye, düzeltilmiş kodu içeren tek bir \"Giriş formu\" commit'i kalır.",
          "fixup folds the fix into the commit before it and keeps that commit's message. What is left is one \"Giriş formu\" commit with the fixed code.",
        ),
      },
      title: l("fixup: düzeltmeyi asıl commit'e kat", "fixup: fold a fix into its commit"),
      body: [
        l(
          "Plan uygulandı: \"yazım hatası düzeltildi\" artık ayrı bir commit değil, \"Giriş formu\"nun içinde. Kod aynı, commit sayısı bir azaldı.",
          "The plan ran: \"yazım hatası düzeltildi\" is no longer a separate commit but part of \"Giriş formu\". The code is the same, and there is one commit fewer.",
        ),
        l(
          "Üstteki bütün commit'ler de yeniden yazıldı, çünkü ebeveynleri değişti. Grafikte eskileri hayalet olarak görüyorsun. Rebase'te her zaman böyle olur.",
          "Every commit above it was rewritten as well, because their parents changed. You can see the old ones as ghosts in the graph. A rebase always works this way.",
        ),
      ],
      practice: {
        commands: [{ cmd: "fixup a1b2c3d yazım hatası düzeltildi", note: l("Listede satırın başını `pick`'ten `fixup`'a (ya da kısaca `f`) çevir.", "In the list, change the line's first word from `pick` to `fixup` (or just `f`).") }],
      },
    },
    {
      short: l("drop", "drop"),
      tag: "experiment",
      predict: {
        question: l(
          "Şimdi `debug log` satırını `drop` yapacağız. `debug.js` dosyasına ne olur?",
          "Now we will mark the `debug log` line as `drop`. What happens to the `debug.js` file?",
        ),
        options: [
          l("Klasörde takip edilmeyen bir dosya olarak kalır", "It stays in the folder as an untracked file"),
          l("O commit'le birlikte hem geçmişten hem dosyalardan çıkar", "It leaves both the history and the files, along with that commit"),
          l("Staging'de bekler", "It waits in staging"),
        ],
        answer: 1,
        why: l(
          "drop, commit'i hiç atılmamış gibi geçmişten çıkarır. debug.js'i sadece o commit eklediği için dosya da gider. Commit hayalet olarak bir süre reflog'da durur.",
          "drop takes the commit out of history as if it never happened. Only that commit added debug.js, so the file goes too. The commit lingers in the reflog as a ghost for a while.",
        ),
      },
      title: l("drop: istemediğin commit'i at", "drop: throw away a commit you do not want"),
      body: [
        l(
          "\"debug log\" commit'i gitti, `debug.js` de onunla. Kalan commit'ler yine yeniden yazıldı.",
          "The \"debug log\" commit is gone, and `debug.js` with it. The remaining commits were rewritten again.",
        ),
        l(
          "Sonradan pişman olursan endişelenme: atılan commit hâlâ reflog'da. `git reflog` ile kimliğini bulup geri alabilirsin.",
          "If you regret it later, do not worry: the dropped commit is still in the reflog. Find its id with `git reflog` and bring it back.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "drop 4e5f6a7 debug log", note: l("Listede satırı `drop` yap ya da satırı tamamen sil.", "In the list, mark the line `drop`, or delete the line entirely.") },
          { cmd: "git reflog", note: l("Yanlışlıkla atılan commit'i bulmak için.", "To find a commit you dropped by mistake.") },
        ],
      },
    },
    {
      short: l("squash", "squash"),
      tag: "how",
      title: l("squash: iki commit'i tek anlamlı adım yap", "squash: make two commits one meaningful step"),
      body: [
        l(
          "\"wip\" ve \"Şifre kontrolü\" aynı işin iki yarısı. Listede ikinciyi `squash` yaptık ve birleşik commit için tek bir mesaj yazdık: \"Şifre kontrolü\".",
          "\"wip\" and \"Şifre kontrolü\" are two halves of the same work. In the list we marked the second as `squash` and wrote one message for the combined commit: \"Şifre kontrolü\".",
        ),
        l(
          "Sonuç: origin/main'in üstünde iki temiz commit var, \"Giriş formu\" ve \"Şifre kontrolü\". Kod en baştakiyle aynı, ama artık her commit tek bir anlamlı adım.",
          "The result: two clean commits on top of origin/main, \"Giriş formu\" and \"Şifre kontrolü\". The code is the same as at the start, but each commit is now one meaningful step.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "squash ile fixup arasındaki tek fark mesaj: squash iki mesajı birleştirip düzenlemen için editörü açar, fixup ise sadece öncekinin mesajını tutar.",
            "The only difference between squash and fixup is the message: squash joins both messages and opens the editor for you, while fixup keeps just the earlier one.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "squash 9c8d7e6 Şifre kontrolü", note: l("Listede `squash` (ya da `s`); Git sonra birleşik mesajı düzenlemen için editörü açar.", "In the list, `squash` (or `s`); Git then opens the editor for the combined message.") },
          { cmd: "git log --oneline origin/main..HEAD", note: l("Sonucu kontrol et.", "Check the result.") },
        ],
      },
    },
    {
      short: l("Otomatik", "Automatic"),
      tag: "reality",
      title: l("Kısayol: --fixup ve --autosquash", "Shortcut: --fixup and --autosquash"),
      body: [
        l(
          "Bir hatayı fark ettiğin anda düzeltmeyi doğru commit'e işaretleyebilirsin: `git commit --fixup <commit>`. Git commit'e \"fixup! Giriş formu\" gibi bir mesaj verir.",
          "The moment you notice a mistake, you can mark the fix for the right commit: `git commit --fixup <commit>`. Git gives the commit a message like \"fixup! Giriş formu\".",
        ),
        l(
          "Sonra `git rebase -i --autosquash origin/main` listeyi senin yerine hazırlar: her fixup commit'ini hedefinin hemen altına taşır ve başına `fixup` yazar. Sen sadece kaydedip kapatırsın.",
          "Then `git rebase -i --autosquash origin/main` prepares the list for you: it moves each fixup commit right under its target and marks it `fixup`. You just save and close.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git commit --fixup a1b2c3d", note: l("Bu değişikliği a1b2c3d'nin düzeltmesi olarak işaretler.", "Marks this change as a fix for a1b2c3d.") },
          { cmd: "git rebase -i --autosquash origin/main", note: l("Fixup commit'lerini otomatik yerleştirir.", "Places the fixup commits automatically.") },
          { cmd: "git config --global rebase.autoSquash true", note: l("--autosquash her zaman açık olsun.", "Makes --autosquash always on.") },
        ],
      },
    },
    {
      short: l("Sadece senin", "Only yours"),
      tag: "reality",
      title: l("Sadece push etmediğin commit'leri temizle", "Clean up only what you have not pushed"),
      body: [
        l(
          "Burada yaptığımız her şey commit'leri yeniden yazdı. origin/main'in **üstündeki** commit'lere dokunduk, altındakilere asla. Sunucudaki commit'leri başkaları çoktan almış olabilir.",
          "Everything we did here rewrote commits. We only touched commits **above** origin/main, never below it. Other people may already have the commits on the server.",
        ),
        l(
          "Kendi feature branch'ini zaten push ettiysen ve onu sadece sen kullanıyorsan temizleyebilirsin. Ama sonra normal push reddedilir; `git push --force-with-lease` kullanman gerekir.",
          "If you already pushed your own feature branch and you are its only user, you can still clean it up. But then a normal push is rejected and you need `git push --force-with-lease`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Ortak bir branch'i (main gibi) asla yeniden yazma. Bir hatayı geri almak gerekiyorsa yeni bir commit ile `git revert` kullan.",
            "Never rewrite a shared branch like main. If a mistake needs undoing there, use `git revert`, which adds a new commit.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git status", note: l("\"Your branch is ahead of 'origin/main' by N commits\" der: bu N commit senin.", "Says \"Your branch is ahead of 'origin/main' by N commits\": those N are yours.") },
          { cmd: "git push --force-with-lease", note: l("Temizlediğin, sadece sana ait bir branch'i güncellemek için.", "To update a branch that is only yours, after cleaning it.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Aynı dağınık beş commit tekrar karşında. Her satırın yanındaki düğmeler, o commit için `rebase -i` listesinde yapacağın değişikliği uygular. `commit --amend` son commit'in mesajını düzeltir.",
          "The same five messy commits are back. The buttons next to each line apply the change you would make for that commit in the `rebase -i` list. `commit --amend` fixes the last commit's message.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Her düğme bir hamle; az hamleyle 3 yıldız.",
          "Under the scene there are **3 missions**. Every button is a move; few moves earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Commit'ler değiştirilemez: düzeltmek, yerine yeni bir commit koymak demektir. Eskisi hayalet olur ve reflog'da durur.", "Commits cannot be changed: fixing one means putting a new commit in its place. The old one becomes a ghost and stays in the reflog."),
    l("`git commit --amend` son commit'in mesajını ya da içeriğini düzeltir.", "`git commit --amend` fixes the last commit's message or content."),
    l("`git rebase -i` commit'leri en eskisi üstte bir liste olarak açar; satır başındaki kelime ne yapılacağını söyler.", "`git rebase -i` opens commits as a list, oldest at the top; the first word on each line says what to do."),
    l("`fixup` öncekiyle birleştirip onun mesajını tutar, `squash` mesajları birleştirir, `drop` atar, `reword` mesajı değiştirir.", "`fixup` merges into the previous commit and keeps its message, `squash` joins the messages, `drop` throws away, `reword` renames."),
    l("`git commit --fixup` ve `git rebase -i --autosquash` bu işi neredeyse otomatik yapar.", "`git commit --fixup` with `git rebase -i --autosquash` makes this almost automatic."),
    l("Sadece push etmediğin ya da yalnız senin kullandığın commit'leri temizle; ortak branch'lerde `git revert` kullan.", "Clean up only commits you have not pushed, or that only you use; on shared branches use `git revert`."),
  ],
  quiz: [
    {
      question: l("Son commit'e bir dosya eklemeyi unuttun. Mesajı değiştirmeden nasıl eklersin?", "You forgot to add a file to the last commit. How do you add it without changing the message?"),
      options: [
        l("`git add dosya` sonra `git commit --amend --no-edit`", "`git add file`, then `git commit --amend --no-edit`"),
        l("`git commit -m \"dosya eklendi\"`", "`git commit -m \"file added\"`"),
        l("`git rebase -i` ile drop", "`git rebase -i` with drop"),
        l("`git revert HEAD`", "`git revert HEAD`"),
      ],
      answer: 0,
      explain: l("`--amend --no-edit` staging'dekini son commit'e katar ve mesajı korur.", "`--amend --no-edit` folds what is staged into the last commit and keeps the message."),
      reviewStep: 1,
    },
    {
      question: l(
        "`rebase -i` listesinde bir commit'i öncekiyle birleştirmek ama **sadece öncekinin mesajını** tutmak istiyorsun. Hangi kelime?",
        "In a `rebase -i` list you want to merge a commit into the previous one but keep **only the previous message**. Which word?",
      ),
      options: [l("`squash`", "`squash`"), l("`fixup`", "`fixup`"), l("`reword`", "`reword`"), l("`drop`", "`drop`")],
      answer: 1,
      explain: l("fixup öncekinin mesajını tutar; squash iki mesajı birleştirip düzenlemeni ister.", "fixup keeps the previous message; squash joins both messages and asks you to edit them."),
      reviewStep: 3,
    },
    {
      question: l("`rebase -i` listesinde commit'ler hangi sırayla gelir?", "In what order are commits listed in `rebase -i`?"),
      options: [
        l("En yenisi üstte, `git log` gibi", "Newest at the top, like `git log`"),
        l("En eskisi üstte, uygulanacakları sırayla", "Oldest at the top, in the order they will be applied"),
        l("Alfabetik", "Alphabetical"),
        l("Rastgele", "Random"),
      ],
      answer: 1,
      explain: l("Liste yukarıdan aşağı uygulanır, bu yüzden en eski commit üsttedir. `git log`'un tersi.", "The list is applied top to bottom, so the oldest commit is at the top: the reverse of `git log`."),
      reviewStep: 2,
    },
    {
      question: l("Hangi commit'leri `rebase -i` ile temizlemek güvenlidir?", "Which commits are safe to clean up with `rebase -i`?"),
      options: [
        l("main'deki bütün commit'leri", "Every commit on main"),
        l("Henüz push etmediğin kendi commit'lerini", "Your own commits that you have not pushed"),
        l("Takım arkadaşının commit'lerini", "Your teammate's commits"),
        l("origin/main'in altındaki commit'leri", "Commits below origin/main"),
      ],
      answer: 1,
      explain: l(
        "Yeniden yazmak kimlikleri değiştirir. Başkasının elinde olmayan commit'lerde bu sorun değil; paylaşılmış commit'lerde geçmişleri ayırır.",
        "Rewriting changes ids. That is fine for commits nobody else has; for shared commits it splits histories.",
      ),
      reviewStep: 7,
    },
  ],
};
