import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const bisect: Lesson = {
  slug: "bisect",
  title: l("bisect: hatayı bul", "bisect: find the bug"),
  summary: l(
    "Bir şey bozulmuş ama ne zaman bozulduğunu bilmiyorsun. `git bisect` geçmişi ikiye bölerek hatayı getiren commit'i birkaç denemede bulur.",
    "Something broke and you do not know when. `git bisect` halves the history to find the commit that broke it in a handful of tries.",
  ),
  minutes: 11,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Neden ikiye bölerek aramanın hızlı olduğunu anlamak", "Understand why halving is fast"), step: 1 },
    { text: l("`git bisect start`, `good`, `bad` ile hatayı getiren commit'i bulmak", "Find the breaking commit with `git bisect start`, `good` and `bad`"), step: 5 },
    { text: l("Bisect'i bitirip bulunan commit'i revert ile geri almak", "Finish bisect and undo the found commit with revert"), step: 7 },
    { text: l("`git bisect run` ile aramayı bir teste bırakmak", "Hand the search to a test with `git bisect run`"), step: 8 },
  ],
  steps: [
    {
      short: l("Bir şey bozuldu", "Something broke"),
      tag: "problem",
      title: l("Toplama artık çıkarıyor", "Addition now subtracts"),
      body: [
        l(
          "Hesap makinesinde `2 + 3` artık `-1` veriyor. Son çalışan sürüm `v1.0`'dı ve o günden beri 7 commit atıldı. Hangisi bozdu?",
          "The calculator now says `2 + 3` is `-1`. The last version that worked was `v1.0`, and 7 commits have landed since. Which one broke it?",
        ),
        l(
          "Commit mesajlarına bakmak yetmiyor: hiçbiri \"toplamayı bozdum\" demiyor. Her commit'e tek tek dönüp denemek de 7 deneme demek, büyük projelerde yüzlerce.",
          "Reading the commit messages does not help: none of them says \"broke addition\". Checking every commit one by one is 7 tries here, and hundreds in a big project.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git log --oneline v1.0..HEAD", note: l("v1.0'dan beri gelen commit'leri listeler.", "Lists the commits since v1.0.") },
        ],
      },
    },
    {
      short: l("İkiye böl", "Halve it"),
      tag: "idea",
      predict: {
        question: l(
          "7 aday commit var. Her denemede kalanları ikiye bölersen, hatalı commit'i en fazla kaç denemede bulursun?",
          "There are 7 candidate commits. If every try halves what is left, how many tries does it take at most to find the bad one?",
        ),
        options: [l("7", "7"), l("3", "3"), l("1", "1")],
        answer: 1,
        why: l(
          "Her deneme adayların yarısını eler: 7 → 3 → 1. Bu yüzden 1000 commit bile yaklaşık 10 denemede biter (2¹⁰ = 1024).",
          "Each try rules out half the candidates: 7 → 3 → 1. That is why even 1000 commits take about 10 tries (2¹⁰ = 1024).",
        ),
      },
      title: l("Fikir: ortadan bak, yarısını ele", "The idea: look in the middle, drop half"),
      body: [
        l(
          "Sözlükte kelime ararken baştan başlamazsın: ortadan açarsın, kelime önceyse ön yarıya, sonraysa arka yarıya geçersin. `git bisect` aynısını commit'lerle yapar.",
          "You do not look up a word in a dictionary from page one: you open it in the middle and go to the front or back half. `git bisect` does the same with commits.",
        ),
        l(
          "Ona iki şey söylersin: hatanın olduğu bir commit (**bad**, şu an) ve hatanın olmadığı bir commit (**good**, `v1.0`). Gerisini Git seçer.",
          "You tell it two things: a commit that has the bug (**bad**, right now) and one that does not (**good**, `v1.0`). Git picks the rest.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git bisect start" },
          { cmd: "git bisect bad", note: l("Şu anki commit hatalı.", "The current commit is bad.") },
          { cmd: "git bisect good v1.0", note: l("v1.0 çalışıyordu.", "v1.0 worked.") },
        ],
      },
    },
    {
      short: l("start", "start"),
      tag: "how",
      predict: {
        question: l(
          "`git bisect start` ile bad = HEAD, good = v1.0 dedik. Git seni nereye götürür?",
          "We ran `git bisect start` with bad = HEAD and good = v1.0. Where does Git take you?",
        ),
        options: [
          l("v1.0'dan sonraki ilk commit'e", "To the first commit after v1.0"),
          l("Adayların ortasındaki commit'e", "To the commit in the middle of the candidates"),
          l("Hiçbir yere; sen seçersin", "Nowhere: you pick"),
        ],
        answer: 1,
        why: l(
          "Git aralığın tam ortasındaki commit'i çıkarır (checkout). Sen onu test edersin, cevabına göre kalan yarıya geçer.",
          "Git checks out the commit right in the middle of the range. You test it, and your answer decides which half comes next.",
        ),
      },
      title: l("Git ortadaki commit'i açar", "Git checks out the middle commit"),
      body: [
        l(
          "Git ortadaki commit'i, \"math sadeleşti\"yi açtı. HEAD artık bir branch'te değil, doğrudan o commit'te (detached). Parlayan istasyonlar hâlâ aday olanlar.",
          "Git checked out the middle commit, \"math sadeleşti\". HEAD is no longer on a branch but straight on that commit (detached). The glowing stations are the remaining candidates.",
        ),
        l(
          "Üstteki Test sayacı \"kaldı\" diyor: bu commit'te `math.js` hatalı.",
          "The Test counter at the top says \"fails\": `math.js` is broken in this commit.",
        ),
      ],
    },
    {
      short: l("bad", "bad"),
      tag: "how",
      predict: {
        question: l(
          "Bu commit'te test kaldı, `git bisect bad` diyeceğiz. Hangi commit'ler aday olarak kalır?",
          "The test fails here, so we will say `git bisect bad`. Which commits stay candidates?",
        ),
        options: [
          l("Bu commit ve ondan yenileri", "This commit and the newer ones"),
          l("Bu commit ve ondan eskileri", "This commit and the older ones"),
          l("Hepsi", "All of them"),
        ],
        answer: 1,
        why: l(
          "Hata burada varsa ya bu commit'te ya da daha eskisinde girmiştir. Yeniler zaten hatayı devralmış, onlara bakmaya gerek yok.",
          "If the bug is here, it came in with this commit or an older one. The newer ones just inherited it, so there is no need to look at them.",
        ),
      },
      title: l("bad: hata bu commit'te de var", "bad: the bug is here too"),
      body: [
        l(
          "`git bisect bad` dedik. Yeni commit'ler elendi; Git kalan aralığın ortasındaki \"Ekran\" commit'ini açtı.",
          "We said `git bisect bad`. The newer commits are out, and Git checked out \"Ekran\", in the middle of what is left.",
        ),
        l("Test sayacına bak: bu sefer \"geçti\".", "Look at the Test counter: this time it says \"passes\"."),
      ],
      practice: { commands: [{ cmd: "git bisect bad" }] },
    },
    {
      short: l("good", "good"),
      tag: "how",
      title: l("good: burada hata yok", "good: no bug here"),
      body: [
        l(
          "\"Ekran\" commit'inde test geçti, `git bisect good` dedik. Demek hata bundan sonra girmiş. Geriye iki aday kaldı ve Git \"Renkler\"i açtı.",
          "The test passed at \"Ekran\", so we said `git bisect good`. The bug must have come in after it. Two candidates are left, and Git checked out \"Renkler\".",
        ),
        l("Test yine geçiyor.", "The test passes again."),
      ],
      practice: { commands: [{ cmd: "git bisect good" }] },
    },
    {
      short: l("Bulundu", "Found"),
      tag: "experiment",
      predict: {
        question: l(
          "\"Renkler\" de geçti. Hatayı getiren ilk commit hangisi?",
          "\"Renkler\" passes too. Which commit was the first bad one?",
        ),
        options: [l("Renkler", "Renkler"), l("math sadeleşti", "math sadeleşti"), l("Ekran düzeni", "Ekran düzeni")],
        answer: 1,
        why: l(
          "\"Renkler\" iyi, ondan bir sonraki \"math sadeleşti\" kötü: aradaki tek fark o commit. Hatayı getiren o.",
          "\"Renkler\" is good and the very next commit, \"math sadeleşti\", is bad: that commit is the only difference. It brought the bug.",
        ),
      },
      title: l("3 denemede bulundu", "Found in 3 tries"),
      body: [
        l(
          "`git bisect good` dedik ve Git sonucu yazdı: ilk hatalı commit \"math sadeleşti\". Biri `a + b`'yi \"sadeleştirirken\" `a - b` yapmış.",
          "We said `git bisect good`, and Git printed the answer: the first bad commit is \"math sadeleşti\". Someone \"simplified\" `a + b` into `a - b`.",
        ),
        l(
          "7 aday, 3 deneme. Artık o commit'in mesajını, yazarını ve değişikliğini okuyup neden olduğunu anlayabilirsin.",
          "7 candidates, 3 tries. Now you can read that commit's message, author and diff to see why it happened.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git show <commit>", note: l("Bulunan commit'in değişikliğini gösterir.", "Shows the found commit's change.") }],
      },
    },
    {
      short: l("reset", "reset"),
      tag: "how",
      title: l("Bisect'i bitir", "Finish bisect"),
      body: [
        l(
          "`git bisect reset` aramayı bitirdi ve seni başladığın yere, `main` branch'ine geri getirdi. HEAD yine branch'te.",
          "`git bisect reset` ended the search and brought you back where you started, the `main` branch. HEAD is on a branch again.",
        ),
        l(
          "Bunu unutma: bisect sırasında HEAD geçmişte bir commit'tedir ve o arada attığın commit'ler hiçbir branch'e gitmez.",
          "Do not forget this step: during bisect HEAD sits on an old commit, and commits made meanwhile land on no branch.",
        ),
      ],
      practice: { commands: [{ cmd: "git bisect reset" }] },
    },
    {
      short: l("revert", "revert"),
      tag: "experiment",
      predict: {
        question: l(
          "\"math sadeleşti\" commit'ini `git revert` ile geri alacağız. Ondan sonra gelen commit'lere (Ekran düzeni, Belgeler, Koyu tema) ne olur?",
          "We will undo \"math sadeleşti\" with `git revert`. What happens to the commits after it (Ekran düzeni, Belgeler, Koyu tema)?",
        ),
        options: [
          l("Silinirler", "They are deleted"),
          l("Yerlerinde kalırlar; sadece o commit'in değişikliği tersine çevrilir", "They stay; only that commit's change is reversed"),
          l("Onlar da geri alınır", "They are undone too"),
        ],
        answer: 1,
        why: l(
          "Revert geçmişi silmez. En üste, sadece o commit'in değişikliğini tersine çeviren yeni bir commit ekler.",
          "Revert never deletes history. It adds a new commit on top that reverses just that commit's change.",
        ),
      },
      title: l("Hatayı geri al", "Undo the bug"),
      body: [
        l(
          "`git revert` en üste yeni bir commit ekledi: `math.js` yine `a + b`. Test geçiyor, sonraki bütün işler yerinde.",
          "`git revert` added a new commit on top: `math.js` says `a + b` again. The test passes, and all the later work is still there.",
        ),
        l(
          "Revert, push edilmiş ve başkalarının da kullandığı geçmişi düzeltmenin güvenli yolu. Ayrıntısı \"reset ve revert\" dersinde.",
          "Revert is the safe way to fix history that was pushed and shared. The details are in the \"reset and revert\" lesson.",
        ),
      ],
      practice: { commands: [{ cmd: "git revert <commit>" }] },
    },
    {
      short: l("bisect run", "bisect run"),
      tag: "reality",
      title: l("Aramayı bir teste bırak", "Let a test do the searching"),
      body: [
        l(
          "Her commit'te elle test etmek yerine Git'e bir komut verebilirsin: `git bisect run npm test`. Git her adımda komutu çalıştırır; komut başarılıysa (çıkış kodu 0) good, değilse bad sayar ve sonucu kendisi bulur.",
          "Instead of testing every commit by hand, give Git a command: `git bisect run npm test`. Git runs it at every step; success (exit code 0) counts as good, anything else as bad, and it finds the answer on its own.",
        ),
        l(
          "Bazı commit'ler test edilemiyorsa (derlenmiyor gibi) `git bisect skip` o commit'i atlar. Testin 125 ile çıkması da `run` sırasında aynı anlama gelir.",
          "If a commit cannot be tested (it does not build, say), `git bisect skip` skips it. Exiting with code 125 means the same during `run`.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bisect'in işe yaraması için commit'lerin küçük ve her birinin çalışır durumda olması gerekir. Dev, karışık bir commit bulunsa bile içinde hatayı aramak yine zor olur.",
            "Bisect works best when commits are small and each one builds and runs. Finding a huge, mixed commit still leaves you searching inside it.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Burada geçmiş düz bir çizgi. Merge'lü geçmişte de bisect çalışır; Git aralığı branch'lerin içinden de seçer.",
            "History here is a straight line. Bisect works with merges too: Git picks commits from inside branches as well.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git bisect start HEAD v1.0", note: l("bad ve good'u tek satırda verir.", "Gives bad and good in one line.") },
          { cmd: "git bisect run npm test", note: l("Testi her adımda Git çalıştırır.", "Git runs the test at every step.") },
          { cmd: "git bisect skip", note: l("Test edilemeyen commit'i atlar.", "Skips a commit that cannot be tested.") },
          { cmd: "git bisect reset" },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda dört ayrı projede **4 senaryo** var: bozuk tarihler, yanlış hesaplanan bir sepet, kapanmış bir şifre kontrolü ve yarıda kalmış bir bisect. Hangi commit'in suçlu olduğunu bilmiyorsun; komutları terminale **kendin yaz**.",
          "Your turn. Below are **4 scenarios** in four different projects: broken dates, a cart that adds wrong, a password check switched off, and a bisect left half-done. You don't know which commit is to blame; **type the commands yourself** in the terminal.",
        ),
        l(
          "Her durakta kodu test et: `cat` ile dosyaya bak ya da üstteki **Test** sayacını oku, sonra `git bisect good` ya da `git bisect bad` de. Yanlış cevap yanlış commit'i suçlatır.",
          "Test the code at every stop: look at the file with `cat` or read the **Test** counter at the top, then say `git bisect good` or `git bisect bad`. A wrong answer blames the wrong commit.",
        ),
      ],
    },
  ],
  recap: [
    l(
      "`git bisect` bir hatanın hangi commit'le geldiğini, geçmişi her adımda ikiye bölerek bulur: n commit için yaklaşık log₂(n) deneme.",
      "`git bisect` finds which commit brought a bug by halving history each step: about log₂(n) tries for n commits.",
    ),
    l("Başlarken bir bad (hatalı) ve bir good (sağlam) commit verirsin; Git ortadakini açar.", "You start with one bad commit and one good one; Git checks out the middle."),
    l("Her adımda test edip `good` ya da `bad` dersin; tek bir yanlış cevap yanlış commit'i suçlatır.", "Each step you test and say `good` or `bad`; one wrong answer blames the wrong commit."),
    l("`git bisect reset` aramayı bitirip seni branch'ine geri getirir.", "`git bisect reset` ends the search and brings you back to your branch."),
    l("`git bisect run <test>` aramayı tamamen bir teste bırakır.", "`git bisect run <test>` hands the whole search to a test."),
  ],
  quiz: [
    {
      question: l("Son sağlam sürümden beri 1000 commit var. Bisect yaklaşık kaç denemede bulur?", "There are 1000 commits since the last good release. About how many tries does bisect need?"),
      options: [l("1000", "1000"), l("500", "500"), l("10", "10"), l("1", "1")],
      answer: 2,
      explain: l("Her deneme yarıyı eler: 2¹⁰ = 1024, yani 10 deneme yeter.", "Each try halves the rest: 2¹⁰ = 1024, so 10 tries are enough."),
      reviewStep: 1,
    },
    {
      question: l("Bisect bir commit açtı ve test kaldı. Ne dersin?", "Bisect checked out a commit and the test fails. What do you say?"),
      options: [l("`git bisect good`", "`git bisect good`"), l("`git bisect bad`", "`git bisect bad`"), l("`git bisect reset`", "`git bisect reset`"), l("`git commit`", "`git commit`")],
      answer: 1,
      explain: l("Hata burada varsa commit bad'dir; Git aramayı daha eski yarıya taşır.", "If the bug is here the commit is bad, and Git moves the search to the older half."),
      reviewStep: 3,
    },
    {
      question: l("Bisect sırasında HEAD nerededir?", "Where is HEAD during bisect?"),
      options: [
        l("Her zaman main'de", "Always on main"),
        l("Test edilen commit'te, detached", "On the commit being tested, detached"),
        l("good olarak verdiğin commit'te", "On the commit you gave as good"),
        l("Yeni bir branch'te", "On a new branch"),
      ],
      answer: 1,
      explain: l(
        "Git test edilecek commit'i doğrudan açar; HEAD bir branch'e değil commit'e bakar. `git bisect reset` seni geri getirir.",
        "Git checks the commit out directly, so HEAD points at a commit, not a branch. `git bisect reset` brings you back.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "Her commit'te elle test etmek yerine Git'in aramayı kendisinin yapmasını istiyorsun. Hangi komut?",
        "You want Git to do the whole search itself instead of testing by hand. Which command?",
      ),
      options: [l("`git bisect auto`", "`git bisect auto`"), l("`git bisect run npm test`", "`git bisect run npm test`"), l("`git log --test`", "`git log --test`"), l("`git bisect skip`", "`git bisect skip`")],
      answer: 1,
      explain: l("`run` her adımda komutu çalıştırır ve çıkış koduna göre good/bad der.", "`run` runs the command each step and says good or bad from its exit code."),
      reviewStep: 8,
    },
  ],
};
