import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const reflog: Lesson = {
  slug: "reflog",
  title: l("reflog: kaybolanı bul", "reflog: find what was lost"),
  summary: l(
    "`reset --hard` ya da silinen bir branch commit'lerini götürdü mü? Çoğu zaman hayır. HEAD'in günlüğü `git reflog` ile kaybolan commit'i bul ve geri getir.",
    "Did a `reset --hard` or a deleted branch take your commits? Usually not. Find and restore them with HEAD's diary, `git reflog`.",
  ),
  minutes: 11,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Reflog'un HEAD'in her hareketini kaydettiğini görmek", "See that the reflog records every move of HEAD"), step: 0 },
    { text: l("`reset --hard` sonrası kaybolan commit'i geri getirmek", "Bring back a commit lost after `reset --hard`"), step: 3 },
    { text: l("Silinen bir branch'in commit'ini yeni bir branch'le kurtarmak", "Rescue a deleted branch's commit with a new branch"), step: 5 },
    { text: l("Reflog'un neyi kurtaramayacağını bilmek", "Know what the reflog cannot save"), step: 6 },
  ],
  steps: [
    {
      short: l("HEAD'in günlüğü", "HEAD's diary"),
      tag: "how",
      title: l("Git, HEAD'in nerelerde olduğunu not eder", "Git notes everywhere HEAD has been"),
      body: [
        l(
          "Soldaki grafikte main'de üç commit var, `deneme` branch'inde de bir tane. Sağdaki koyu panel `git reflog` çıktısı: HEAD'in son hareketleri, en yenisi üstte.",
          "The graph on the left has three commits on main and one on `deneme`. The dark panel on the right is `git reflog`: HEAD's latest moves, newest first.",
        ),
        l(
          "Her commit, her branch değişimi ve her reset buraya bir satır olarak düşer. `HEAD@{0}` şu an, `HEAD@{1}` bir önceki hareket, `HEAD@{2}` ondan önceki.",
          "Every commit, branch switch and reset adds a line. `HEAD@{0}` is now, `HEAD@{1}` the move before, `HEAD@{2}` the one before that.",
        ),
        l(
          "[[reflog|Reflog]], \"kaybettim\" sandığın commit'lerin çoğunu geri getirmenin yolu.",
          "The [[reflog]] is how you get back most commits you think you lost.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git reflog", note: l("HEAD'in son hareketlerini, en yenisi üstte listeler.", "Lists HEAD's recent moves, newest first.") },
          { cmd: "git reflog show main", note: l("Sadece main branch'inin hareketleri.", "Only the moves of the main branch.") },
        ],
      },
    },
    {
      short: l("Kaza", "Accident"),
      tag: "problem",
      predict: {
        question: l(
          "Yanlışlıkla `git reset --hard HEAD~1` yapacağız. \"Önemli iş\" commit'ine ne olur?",
          "We will run `git reset --hard HEAD~1` by mistake. What happens to the \"Önemli iş\" commit?",
        ),
        options: [
          l("Sonsuza kadar silinir", "It is deleted forever"),
          l("Repo'da durur ama hiçbir branch onu göstermez", "It stays in the repo, but no branch points at it"),
          l("Otomatik olarak başka bir branch'e taşınır", "It moves to another branch on its own"),
        ],
        answer: 1,
        why: l(
          "Reset sadece branch'i taşır; commit nesnesi silinmez. Artık hiçbir branch onu göstermediği için `git log`'da görünmez, ama reflog nerede olduğunu biliyor.",
          "Reset only moves the branch; the commit object is not deleted. With no branch on it, `git log` stops showing it, but the reflog knows where it is.",
        ),
      },
      title: l("Yanlışlıkla reset --hard", "An accidental reset --hard"),
      body: [
        l(
          "main bir commit geri gitti ve \"Önemli iş\" soluk bir küp oldu. `git log` artık onu göstermiyor; ilk bakışta iş kaybolmuş gibi.",
          "main went back one commit and \"Önemli iş\" became a faded cube. `git log` no longer shows it; at first glance the work seems gone.",
        ),
        l(
          "Ama reflog'un en üstüne yeni bir satır düştü: `reset: moving to HEAD~1`. Ve bir alttaki satır, `HEAD@{1}`, hâlâ \"Önemli iş\"i gösteriyor. Yanında kırmızı \"kayıp\" etiketi var.",
          "But a new line appeared at the top of the reflog: `reset: moving to HEAD~1`. And the line below it, `HEAD@{1}`, still points at \"Önemli iş\", with a red \"lost\" label.",
        ),
      ],
    },
    {
      short: l("Reflog'u oku", "Read the reflog"),
      tag: "how",
      title: l("Kaybolan commit'i reflog'da bul", "Find the lost commit in the reflog"),
      body: [
        l(
          "Reflog'da \"commit: Önemli iş\" satırını ara. Solundaki sarı kısaltma o commit'in kimliği. Yanındaki `HEAD@{n}` da aynı commit'i gösterir.",
          "Look for the \"commit: Önemli iş\" line in the reflog. The yellow short code on its left is the commit's id. The `HEAD@{n}` next to it names the same commit.",
        ),
        l(
          "Yani kurtarmak için iki şeyden birini kullanabilirsin: kimliği (`a1b2c3d`) ya da reflog adını (`HEAD@{1}`).",
          "So to rescue it you can use either the id (`a1b2c3d`) or its reflog name (`HEAD@{1}`).",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir şeyi \"kaybettim\" diye düşündüğünde ilk iş başka komut çalıştırmamak, önce `git reflog`'a bakmak. Her yeni hareket listeye satır ekler ama eskileri silmez.",
            "When you think you lost something, do not run more commands: look at `git reflog` first. Every move adds a line, but none erases the old ones.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git reflog", note: l("\"commit: Önemli iş\" satırını bul.", "Find the \"commit: Önemli iş\" line.") },
          { cmd: "git show HEAD@{1}", note: l("O girişteki commit'in içeriğine bak.", "Look at the commit in that entry.") },
        ],
      },
    },
    {
      short: l("Geri getir", "Bring it back"),
      tag: "how",
      predict: {
        question: l(
          "`git reset --hard <Önemli iş'in kimliği>` çalıştıracağız. Sonuç ne olur?",
          "We will run `git reset --hard <the id of Önemli iş>`. What is the result?",
        ),
        options: [
          l("main yine \"Önemli iş\"i gösterir, dosyalar geri gelir", "main points at \"Önemli iş\" again and its files are back"),
          l("\"Önemli iş\"in yeni bir kopyası oluşur", "A new copy of \"Önemli iş\" is made"),
          l("Olmaz: kaybolan commit'e reset atılamaz", "It does not work: you cannot reset to a lost commit"),
        ],
        answer: 0,
        why: l(
          "Commit hiç silinmemişti, sadece hiçbir branch onu göstermiyordu. Reset main'i o commit'e geri taşır; aynı kimlik, aynı dosyalar.",
          "The commit was never deleted; no branch pointed at it. Reset moves main back onto it: same id, same files.",
        ),
      },
      title: l("Reset ile main'i geri taşı", "Move main back with reset"),
      body: [
        l(
          "`git reset --hard <kimlik>` main'i \"Önemli iş\"e geri taşıdı. Küp yine canlı, important.js klasörde. Hiçbir şey kaybolmamıştı.",
          "`git reset --hard <id>` moved main back onto \"Önemli iş\". The cube is solid again and important.js is back in the folder. Nothing was ever lost.",
        ),
        l(
          "Aynı şeyi `git reset --hard HEAD@{1}` ile de yapabilirdin. Ama dikkat: her hareketten sonra numaralar kayar, bu yüzden kimliği kullanmak daha güvenli.",
          "`git reset --hard HEAD@{1}` would have done the same. But careful: the numbers shift after every move, so the id is safer.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git reset --hard a1b2c3d", note: l("Bulunan kimlikle main'i geri taşı (kendi kimliğini yaz).", "Move main back to the id you found (use your own id).") },
          { cmd: "git reset --hard HEAD@{1}", note: l("Aynısı, reflog adıyla.", "The same, by reflog name.") },
        ],
      },
    },
    {
      short: l("Silinen branch", "Deleted branch"),
      tag: "problem",
      predict: {
        question: l(
          "`git branch -D deneme` ile branch'i sileceğiz. \"Deneme\" commit'ine ne olur?",
          "We will delete the branch with `git branch -D deneme`. What happens to the \"Deneme\" commit?",
        ),
        options: [
          l("Branch'le birlikte silinir", "It is deleted with the branch"),
          l("Durur, ama artık hiçbir branch onu göstermez", "It stays, but no branch points at it any more"),
          l("main'e taşınır", "It moves to main"),
        ],
        answer: 1,
        why: l(
          "Branch sadece bir commit'i gösteren isimdir. İsim gider, commit kalır. HEAD o commit'te bulunduğu için reflog onu hatırlıyor.",
          "A branch is just a name pointing at a commit. The name goes; the commit stays. HEAD was on that commit once, so the reflog remembers it.",
        ),
      },
      title: l("Bir branch'i yanlışlıkla sildin", "You deleted a branch by mistake"),
      body: [
        l(
          "`-D` bayrağı, birleştirilmemiş bir branch'i de zorla siler. `deneme` gitti ve \"Deneme\" commit'i soluk bir küp oldu.",
          "The `-D` flag deletes a branch even if it was never merged. `deneme` is gone and the \"Deneme\" commit is a faded cube.",
        ),
        l(
          "Reflog'da \"commit: Deneme\" satırı duruyor, çünkü o commit'i atarken HEAD oradaydı.",
          "The reflog still has a \"commit: Deneme\" line, because HEAD was there when you made that commit.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git branch -d deneme", note: l("Küçük `-d`, merge edilmemiş branch'i silmeyi reddeder. Önce bunu dene.", "Lowercase `-d` refuses to delete an unmerged branch. Try it first.") },
          { cmd: "git branch -D deneme", note: l("Büyük `-D` zorla siler.", "Uppercase `-D` deletes anyway.") },
        ],
      },
    },
    {
      short: l("Branch'le kurtar", "Rescue with a branch"),
      tag: "how",
      title: l("Kaybolan commit'e yeni bir branch koy", "Put a new branch on the lost commit"),
      body: [
        l(
          "Bu sefer main'i taşımak istemiyoruz. Onun yerine `git branch deneme <kimlik>` ile commit'in üstüne yeni bir isim koyduk. Küp yeniden canlandı.",
          "This time we do not want to move main. Instead, `git branch deneme <id>` put a new name on the commit, and the cube came back to life.",
        ),
        l(
          "Kural basit: **bir commit'i kurtarmak, üstüne tekrar bir isim koymaktır.** Bunu reset ile main'i taşıyarak ya da yeni bir branch açarak yaparsın.",
          "The rule is simple: **rescuing a commit means putting a name on it again**. You do that by moving main with reset or by creating a new branch.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git branch kurtar a1b2c3d", note: l("Kaybolan commit'e yeni bir branch açar.", "Creates a new branch on the lost commit.") },
          { cmd: "git switch -c kurtar a1b2c3d", note: l("Aynısı, üstelik o branch'e geçer.", "The same, and switches to it.") },
        ],
      },
    },
    {
      short: l("Kurtarılamayan", "Not recoverable"),
      tag: "experiment",
      predict: {
        question: l(
          "README.md'de commit'lemediğimiz bir değişiklik var ve `git reset --hard HEAD` yapacağız. Reflog bu değişikliği kurtarabilir mi?",
          "README.md has a change we never committed, and we will run `git reset --hard HEAD`. Can the reflog save that change?",
        ),
        options: [
          l("Evet, HEAD@{1}'de duruyor", "Yes, it is at HEAD@{1}"),
          l("Hayır: değişiklik hiç commit olmadı, reflog'da yok", "No: the change was never a commit, so it is not in the reflog"),
          l("Evet, ama sadece 30 gün içinde", "Yes, but only within 30 days"),
        ],
        answer: 1,
        why: l(
          "Reflog commit'lerin ve HEAD hareketlerinin günlüğüdür. Commit'lenmemiş bir değişiklik hiçbir zaman bir commit olmadığı için orada bir izi yoktur.",
          "The reflog is a diary of commits and HEAD's moves. An uncommitted change was never a commit, so it leaves no trace there.",
        ),
      },
      title: l("Reflog'un kurtaramadığı tek şey", "The one thing the reflog cannot save"),
      body: [
        l(
          "README.md'ye \"yarım kalmış iş\" yazdık ve commit'lemeden `git reset --hard HEAD` yaptık. Değişiklik gitti ve reflog'da ona ait hiçbir satır yok.",
          "We wrote \"yarım kalmış iş\" into README.md and ran `git reset --hard HEAD` without committing. The change is gone, and the reflog has no line for it.",
        ),
        l(
          "Ders: **commit'lenen her şey kurtarılabilir, commit'lenmeyen kurtarılamaz.** Riskli bir komuttan önce küçük bir commit at ya da `git stash` kullan.",
          "The lesson: **anything committed can be recovered; anything uncommitted cannot.** Before a risky command, make a small commit or use `git stash`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`git restore`, `git reset --hard` ve `git checkout -- dosya` commit'lenmemiş işi geri dönüşsüz siler. Bunlardan önce `git status`'a bak.",
            "`git restore`, `git reset --hard` and `git checkout -- file` delete uncommitted work for good. Check `git status` before any of them.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: 'git stash push -m "yedek"', note: l("Riskli bir işten önce değişiklikleri kenara kaldır.", "Put changes aside before something risky.") },
          { cmd: 'git commit -am "WIP"', note: l("Ya da küçük bir ara commit at; sonra amend ya da reset ile toparlarsın.", "Or make a small work-in-progress commit; tidy it later with amend or reset.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Reflog yereldir ve sonsuza kadar sürmez", "The reflog is local and does not last forever"),
      body: [
        l(
          "Reflog **sadece senin bilgisayarında** durur. Push edilmez, clone ile gelmez. Bir takım arkadaşının kaybettiği commit'i senin reflog'unda bulamazsın.",
          "The reflog lives **only on your machine**. It is not pushed and does not come with a clone. You cannot find a teammate's lost commit in your reflog.",
        ),
        l(
          "Girişler varsayılan olarak **90 gün** saklanır (`gc.reflogExpire`). Hiçbir branch'ten erişilemeyen commit'lerin girişleri ise **30 gün** sonra silinir (`gc.reflogExpireUnreachable`). Sonra `git gc` o commit'leri gerçekten temizler.",
          "Entries are kept for **90 days** by default (`gc.reflogExpire`). Entries for commits no branch can reach are dropped after **30 days** (`gc.reflogExpireUnreachable`). After that, `git gc` really removes those commits.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahne sadece HEAD'in reflog'unu gösteriyor. Gerçek Git her branch için de ayrı bir reflog tutar (`git reflog show main`). `HEAD@{yesterday}` ya da `main@{2.hours.ago}` gibi zamanla da arayabilirsin. Reflog'da bile olmayan commit'ler için son çare `git fsck --lost-found`.",
            "This scene shows only HEAD's reflog. Real Git also keeps one per branch (`git reflog show main`), and you can search by time: `HEAD@{yesterday}` or `main@{2.hours.ago}`. For commits not even in the reflog, the last resort is `git fsck --lost-found`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git reflog --date=relative", note: l("Her girişin ne zaman olduğunu gösterir.", "Shows when each entry happened.") },
          { cmd: "git fsck --lost-found", note: l("Reflog'da bile olmayan sahipsiz commit'leri arar.", "Searches for dangling commits not even in the reflog.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "İki kaza birden oldu: main bir commit geri gitti ve `deneme` branch'i silindi. Reflog panelinde kırmızı \"kayıp\" etiketli girişleri gör.",
          "Two accidents at once: main went back one commit and the `deneme` branch was deleted. Spot the red \"lost\" entries in the reflog panel.",
        ),
        l(
          "Her reflog girişi için iki düğme var: main'i oraya taşımak (`reset --hard`) ya da oraya yeni bir branch koymak. **3 görev** seni bekliyor.",
          "Each reflog entry has two buttons: move main there (`reset --hard`) or put a new branch there. **3 missions** are waiting.",
        ),
      ],
    },
  ],
  recap: [
    l("`git reflog` HEAD'in her hareketini kaydeder: commit, branch değişimi, reset, merge.", "`git reflog` records every move of HEAD: commits, switches, resets, merges."),
    l("`reset --hard` ya da `branch -D` commit'leri silmez; sadece onları gösteren ismi kaldırır.", "`reset --hard` or `branch -D` do not delete commits; they only remove the name pointing at them."),
    l("Kurtarmak, kaybolan commit'e tekrar bir isim koymaktır: `git reset --hard <kimlik>` ya da `git branch <ad> <kimlik>`.", "Rescuing means putting a name on the lost commit again: `git reset --hard <id>` or `git branch <name> <id>`."),
    l("Reflog yereldir; girişler 90 gün, erişilemeyen commit'lerinkiler 30 gün saklanır.", "The reflog is local; entries last 90 days, those for unreachable commits 30."),
    l("Commit'lenmemiş değişiklikler reflog'da yoktur ve kurtarılamaz.", "Uncommitted changes are not in the reflog and cannot be recovered."),
  ],
  quiz: [
    {
      question: l(
        "`git reset --hard HEAD~2` ile iki commit'i \"kaybettin\". Onları nasıl geri getirirsin?",
        "You \"lost\" two commits with `git reset --hard HEAD~2`. How do you get them back?",
      ),
      options: [
        l("Getiremezsin, silindiler", "You cannot; they are deleted"),
        l("`git reflog` ile eski kimliği bul, `git reset --hard <kimlik>` çalıştır", "Find the old id with `git reflog`, then run `git reset --hard <id>`"),
        l("`git revert HEAD~2`", "`git revert HEAD~2`"),
        l("`git restore .`", "`git restore .`"),
      ],
      answer: 1,
      explain: l("Commit'ler silinmedi; reflog reset'ten önceki yeri hatırlar ve reset main'i oraya geri taşır.", "The commits are not deleted; the reflog remembers where you were and reset moves main back there."),
      reviewStep: 3,
    },
    {
      question: l("Silinen bir branch'in commit'ini main'e dokunmadan kurtarmak istiyorsun. Hangi komut?", "You want to rescue a deleted branch's commit without touching main. Which command?"),
      options: [l("`git branch kurtar <kimlik>`", "`git branch rescue <id>`"), l("`git reset --hard <kimlik>`", "`git reset --hard <id>`"), l("`git commit --amend`", "`git commit --amend`"), l("`git fetch`", "`git fetch`")],
      answer: 0,
      explain: l("Yeni bir branch commit'e isim koyar ve main olduğu yerde kalır.", "A new branch puts a name on the commit, and main stays where it is."),
      reviewStep: 5,
    },
    {
      question: l("Hangisi reflog ile kurtarılamaz?", "Which of these cannot be recovered with the reflog?"),
      options: [
        l("`reset --hard` sonrası kaybolan bir commit", "A commit lost after `reset --hard`"),
        l("Silinen bir branch'teki commit", "A commit on a deleted branch"),
        l("Hiç commit'lenmemiş bir değişiklik", "A change that was never committed"),
        l("Amend'den önceki eski commit", "The old commit from before an amend"),
      ],
      answer: 2,
      explain: l("Reflog sadece commit'leri ve HEAD hareketlerini tutar; commit'lenmemiş iş hiç kaydedilmedi.", "The reflog only holds commits and HEAD's moves; uncommitted work was never saved."),
      reviewStep: 6,
    },
    {
      question: l(
        "Takım arkadaşın kendi bilgisayarında bir commit'i kaybetti. Onu senin `git reflog`'unda bulabilir misin?",
        "A teammate lost a commit on their own machine. Can you find it in your `git reflog`?",
      ),
      options: [l("Evet, reflog push ile paylaşılır", "Yes, the reflog is shared on push"), l("Hayır, reflog her bilgisayarda yereldir", "No, every machine's reflog is local"), l("Sadece main'deyse", "Only if it was on main"), l("Sadece 30 gün içinde", "Only within 30 days")],
      answer: 1,
      explain: l("Reflog hiçbir zaman push edilmez ya da clone ile gelmez; o commit'i sadece onun reflog'u bilir.", "The reflog is never pushed or cloned; only their reflog knows that commit."),
      reviewStep: 7,
    },
  ],
};
