import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const undoLocal: Lesson = {
  slug: "undo-local",
  title: l("Değişiklikleri geri al", "Undo local changes"),
  summary: l(
    "Hatayı nerede yaptığına göre doğru komutu seç: klasörde `git restore`, staging'de `git restore --staged`, son commit'te `git commit --amend`.",
    "Pick the right command by where the mistake is: in the folder `git restore`, in staging `git restore --staged`, in the last commit `git commit --amend`.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Hatanın hangi alanda olduğunu bulmak", "Find which area the mistake is in"), step: 0 },
    { text: l("Klasördeki bir değişikliği atmak", "Throw away a change in the folder"), step: 2 },
    { text: l("Staging'e yanlışlıkla konan bir dosyayı geri çıkarmak", "Take a file you staged by mistake back out"), step: 4 },
    { text: l("Son commit'in mesajını ve içeriğini düzeltmek", "Fix the last commit's message and content"), step: 7 },
  ],
  steps: [
    {
      short: l("Hata nerede?", "Where is it?"),
      tag: "idea",
      title: l("Önce sor: hata nerede?", "First ask: where is the mistake?"),
      body: [
        l(
          "Git'te \"geri al\" diye tek bir komut yok. Doğru komut, hatanın **hangi alanda** olduğuna bağlı. Panik yapmadan önce kendine bunu sor.",
          "Git has no single \"undo\" command. The right one depends on **which area** the mistake is in. Before panicking, ask yourself that.",
        ),
        l(
          "**Klasörde**, henüz add etmedin → `git restore dosya`.",
          "**In the folder**, not added yet → `git restore file`.",
        ),
        l(
          "**Staging'de**, add ettin ama commit atmadın → `git restore --staged dosya`.",
          "**In staging**, added but not committed → `git restore --staged file`.",
        ),
        l(
          "**Son commit'te**, henüz push etmedin → `git commit --amend`. Daha eski commit'ler için sonraki derste `reset` ve `revert` var.",
          "**In the last commit**, not pushed yet → `git commit --amend`. For older commits, the next lesson covers `reset` and `revert`.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Ne yapacağını bilmiyorsan önce `git status` çalıştır. Git hangi alanda ne olduğunu yazar, hatta çoğu zaman geri almak için hangi komutu kullanacağını da söyler.",
            "When unsure, run `git status` first. Git tells you what is in which area, and often prints the very command to undo it.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "git status", note: l("Hatanın hangi alanda olduğunu gösterir. Geri almanın ilk adımı.", "Shows which area the mistake is in. The first step of any undo.") }],
      },
    },
    {
      short: l("Klasörde hata", "Folder mistake"),
      tag: "problem",
      title: l("Klasörde yanlış bir değişiklik", "A wrong change in the folder"),
      body: [
        l(
          "`app.js`'e yanlış bir satır ekledik. Değişiklik sadece klasörde: staging ve repo hâlâ eski hali tutuyor.",
          "We added a wrong line to `app.js`. The change is only in the folder: staging and the repo still hold the old version.",
        ),
        l(
          "Bu en kolay geri alınan hata, çünkü kaydedilmiş hiçbir şeye dokunmadı.",
          "This is the easiest mistake to undo, because it has not touched anything saved.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git diff app.js", note: l("Atmadan önce neyi atacağına bak.", "Look at what you are about to throw away.") }],
      },
    },
    {
      short: l("git restore", "git restore"),
      tag: "how",
      predict: {
        question: l("`git restore app.js` çalıştıracağız. app.js hangi haline döner?", "We will run `git restore app.js`. Which version does app.js go back to?"),
        options: [
          l("Staging'deki haline, yani son commit'teki v1'e", "The staged version, which is v1 from the last commit"),
          l("Boş bir dosyaya", "An empty file"),
          l("Yanlış satır kalır, sadece Git unutur", "The wrong line stays; Git just forgets it"),
        ],
        answer: 0,
        why: l(
          "`git restore` klasördeki dosyanın üstüne staging'deki halini yazar. Staging son commit'le aynı olduğu için app.js v1'e döner.",
          "`git restore` overwrites the folder's file with the staged version. Staging matches the last commit, so app.js goes back to v1.",
        ),
      },
      title: l("git restore: klasördeki değişikliği at", "git restore: throw away the folder's change"),
      body: [
        l(
          "`git restore app.js` dosyayı staging'deki haliyle değiştirdi. Yanlış satır gitti ve klasör yine temiz.",
          "`git restore app.js` replaced the file with the staged version. The wrong line is gone and the folder is clean again.",
        ),
        l(
          "Atılan değişiklik hiçbir zaman kaydedilmemişti; Git onu hiç görmedi. Bu yüzden bu komutun **geri dönüşü yok**.",
          "The thrown-away change was never saved; Git never saw it. That is why this command **cannot be undone**.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Emin değilsen atmak yerine kenara kaldır: `git stash` değişikliği saklar ve klasörü temizler. Sonra `git stash pop` ile geri getirebilirsin.",
            "When unsure, put it aside instead: `git stash` saves the change and cleans the folder, and `git stash pop` brings it back.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git restore app.js", note: l("Klasördeki değişikliği atar. Geri alınamaz.", "Throws away the folder's change. Cannot be undone.") },
          { cmd: "git restore .", note: l("Klasördeki bütün değişiklikleri atar. Dikkatli kullan.", "Throws away every change in the folder. Use with care.") },
        ],
      },
    },
    {
      short: l("Staging'de hata", "Staged mistake"),
      tag: "problem",
      title: l("Yanlış dosyayı staging'e koydun", "You staged the wrong file"),
      body: [
        l(
          "README.md'ye yarım bir değişiklik yaptık ve alışkanlıkla `git add` çalıştırdık. Şimdi bu yarım iş bir sonraki commit'e girecek.",
          "We made a half-finished change to README.md and ran `git add` out of habit. Now that unfinished work would go into the next commit.",
        ),
        l(
          "Henüz commit atmadık, yani hiçbir şey kalıcı olarak kaydedilmedi. Sadece staging'i düzeltmemiz yeterli.",
          "No commit yet, so nothing is permanently saved. We only need to fix staging.",
        ),
      ],
    },
    {
      short: l("--staged", "--staged"),
      tag: "how",
      predict: {
        question: l(
          "`git restore --staged README.md` çalıştıracağız. Klasördeki README.md'ye ne olur?",
          "We will run `git restore --staged README.md`. What happens to README.md in the folder?",
        ),
        options: [
          l("Değişiklik silinir", "The change is deleted"),
          l("Değişiklik klasörde kalır, sadece staging'den çıkar", "The change stays in the folder; it only leaves staging"),
          l("README.md commit olur", "README.md gets committed"),
        ],
        answer: 1,
        why: l(
          "`--staged` sadece staging'i son commit'e döndürür. Klasöre dokunmaz, yani işin kaybolmaz; dosya \"değişti\" olarak beklemeye devam eder.",
          "`--staged` only resets staging to the last commit. It does not touch the folder, so your work is safe and the file keeps waiting as \"changed\".",
        ),
      },
      title: l("git restore --staged: kadrajdan çıkar", "git restore --staged: take it out of the frame"),
      body: [
        l(
          "README.md staging'den çıktı ama değişiklik klasörde duruyor. Bu komut güvenli: hiçbir işi silmez.",
          "README.md left staging, but the change is still in the folder. This command is safe: it deletes no work.",
        ),
        l(
          "Değişikliği tamamen istemiyorsan ikinci adım olarak `git restore README.md` çalıştırırsın. Yani staging'deki bir hatayı silmek **iki adımdır**.",
          "If you do not want the change at all, run `git restore README.md` as a second step. Deleting a staged mistake takes **two steps**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Eski kaynaklarda aynı iş için `git reset HEAD dosya` yazar. Git 2.23'ten beri `git restore --staged` aynı şeyi daha anlaşılır bir adla yapar.",
            "Older guides use `git reset HEAD file` for this. Since Git 2.23, `git restore --staged` does the same with a clearer name.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "git restore --staged README.md", note: l("Staging'den çıkarır; klasördeki değişiklik kalır.", "Unstages; the folder's change stays.") },
          { cmd: "git restore README.md", note: l("İkinci adım: değişikliği tamamen at.", "Second step: throw the change away completely.") },
        ],
      },
    },
    {
      short: l("Commit'te hata", "Commit mistake"),
      tag: "problem",
      title: l("Commit mesajında yazım hatası", "A typo in the commit message"),
      body: [
        l(
          "README.md'yi temizledik, app.js'i güncelledik ve commit attık. Ama mesaja \"gncellendi\" yazdık. Bu commit artık geçmişin bir parçası.",
          "We cleaned up README.md, updated app.js and committed. But the message says \"gncellendi\". That commit is now part of the history.",
        ),
        l(
          "Sahne artık commit grafiğini gösteriyor: her küp bir commit, en sağdaki yazım hatalı olan.",
          "The scene now shows the commit graph: each cube is a commit, and the rightmost one has the typo.",
        ),
      ],
    },
    {
      short: l("--amend", "--amend"),
      tag: "how",
      predict: {
        question: l(
          "`git commit --amend -m \"app.js güncellendi\"` çalıştıracağız. Hatalı commit'e ne olur?",
          "We will run `git commit --amend -m \"app.js güncellendi\"`. What happens to the commit with the typo?",
        ),
        options: [
          l("Aynı commit kalır, sadece mesajı değişir", "The same commit stays; only its message changes"),
          l("Yerine kimliği farklı yeni bir commit gelir; eski commit hiçbir branch'te kalmaz", "A new commit with a different id replaces it; the old one is left on no branch"),
          l("Üstüne ikinci bir commit eklenir", "A second commit is added on top"),
        ],
        answer: 1,
        why: l(
          "Commit'ler değiştirilemez; kimlikleri içeriklerinden hesaplanır. Amend aynı ebeveynle yeni bir commit yapar ve branch'i ona taşır. Eski commit soluk görünüyor: artık hiçbir branch onu göstermiyor.",
          "Commits cannot change: their ids come from their content. Amend makes a new commit with the same parent and moves the branch there. The old one is faded: no branch points at it any more.",
        ),
      },
      title: l("git commit --amend: son commit'i düzelt", "git commit --amend: fix the last commit"),
      body: [
        l(
          "Amend son commit'i **yerine koyar**: aynı ebeveyn, düzeltilmiş mesaj, yeni bir kimlik. main artık yeni commit'i gösteriyor.",
          "Amend **replaces** the last commit: same parent, fixed message, new id. main now points at the new commit.",
        ),
        l(
          "Eski commit soluk bir küp olarak duruyor. Silinmedi, sadece hiçbir branch onu göstermiyor. Böyle commit'leri reflog dersinde geri getireceğiz.",
          "The old commit is still there as a faded cube. It is not deleted; no branch points at it any more. The reflog lesson shows how to bring such commits back.",
        ),
      ],
      practice: {
        commands: [{ cmd: 'git commit --amend -m "app.js güncellendi"', note: l("Son commit'in mesajını değiştirir.", "Changes the last commit's message.") }],
      },
    },
    {
      short: l("Unutulan dosya", "Forgotten file"),
      tag: "how",
      predict: {
        question: l(
          "`notes.txt`'yi o commit'e koymayı unutmuşuz. add edip `git commit --amend --no-edit` çalıştıracağız. main'de kaç commit olur?",
          "We forgot to put `notes.txt` in that commit. We will add it and run `git commit --amend --no-edit`. How many commits are on main afterwards?",
        ),
        options: [l("Bir fazla: notes.txt için yeni commit", "One more: a new commit for notes.txt"), l("Aynı sayıda: son commit notes.txt'yle değişir", "The same: the last commit is replaced with one that has notes.txt"), l("Bir eksik", "One fewer")],
        answer: 1,
        why: l(
          "Amend, staging'de ne varsa onu da son commit'e katar ve yine son commit'i değiştirir. `--no-edit` mesajı olduğu gibi bırakır. Commit sayısı aynı kalır.",
          "Amend folds whatever is staged into the last commit and still replaces it. `--no-edit` keeps the message as it is. The count stays the same.",
        ),
      },
      title: l("Unuttuğun dosyayı son commit'e ekle", "Add a forgotten file to the last commit"),
      body: [
        l(
          "`notes.txt`'yi add edip `--amend --no-edit` çalıştırdık. Son commit yine değişti: artık notes.txt de içinde ve mesajı aynı.",
          "We added `notes.txt` and ran `--amend --no-edit`. The last commit was replaced again: it now has notes.txt too, with the same message.",
        ),
        l(
          "Bu, \"bir şeyi unuttum\" commit'leriyle geçmişi kirletmemenin en temiz yolu.",
          "This is the cleanest way to avoid cluttering history with \"forgot something\" commits.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git add notes.txt" },
          { cmd: "git commit --amend --no-edit", note: l("Staging'dekini son commit'e katar, mesajı değiştirmez.", "Folds what is staged into the last commit, keeping its message.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Amend'in tek kuralı: push etmediysen", "Amend's one rule: only if you have not pushed"),
      body: [
        l(
          "Amend eski commit'i yenisiyle değiştirir, yani geçmişi yeniden yazar. Commit'i henüz kimseyle paylaşmadıysan bu tamamen güvenli.",
          "Amend replaces the old commit with a new one, which rewrites history. If you have not shared the commit yet, that is completely safe.",
        ),
        l(
          "Ama commit'i **push ettiysen**, takım arkadaşların eski commit'i almış olabilir. Amend edip tekrar göndermek onların geçmişiyle çakışır. Paylaşılmış bir commit'i düzeltmek için sonraki dersteki `git revert`'i kullan.",
          "But if you have **pushed** it, teammates may already have the old commit. Amending and pushing again clashes with their history. To fix a shared commit, use `git revert` from the next lesson.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`git commit --amend` sadece **son** commit'i düzeltir. Daha eski bir commit'in mesajını değiştirmek için interactive rebase (`git rebase -i`) gerekir; \"Geçmişi temizlemek\" dersinde göreceğiz.",
            "`git commit --amend` only fixes the **last** commit. Changing an older commit's message takes an interactive rebase (`git rebase -i`), covered in \"Cleaning up history\".",
          ),
        },
      ],
      practice: {
        intro: l("Hangi komut? Kısa özet:", "Which command? A short summary:"),
        commands: [
          { cmd: "git restore <dosya>", note: l("Klasördeki değişikliği at (geri alınamaz).", "Throw away a folder change (cannot be undone).") },
          { cmd: "git restore --staged <dosya>", note: l("Staging'den çıkar, işini koru.", "Unstage, keep your work.") },
          { cmd: "git commit --amend", note: l("Son commit'i düzelt (push etmediysen).", "Fix the last commit (if not pushed).") },
          { cmd: "git revert <commit>", note: l("Paylaşılmış bir commit'i geri alan yeni commit.", "A new commit that undoes a shared one.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: her birinde bir hata yapılmış ve onu geri alman gerekiyor. Komutları terminale **kendin yaz**; sahne her komutta neyin nereye gittiğini gösterir.",
          "Your turn. Below are **4 scenarios** from real work: in each one a mistake has been made and you need to undo it. **Type the commands yourself** in the terminal; the scene shows what moves where with each one.",
        ),
        l(
          "İlk iş hatanın hangi alanda olduğunu bulmak: `git status` yaz. Son commit'e bakmak için `git log --oneline`. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "First find which area the mistake is in: type `git status`. To look at the last commit, `git log --oneline`. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Önce hatanın hangi alanda olduğunu bul: `git status` bunu söyler.", "First find which area the mistake is in: `git status` tells you."),
    l("Klasördeki değişikliği `git restore dosya` atar ve bu geri alınamaz.", "`git restore file` throws away a folder change, and it cannot be undone."),
    l("`git restore --staged dosya` staging'den çıkarır, işin klasörde kalır.", "`git restore --staged file` unstages; your work stays in the folder."),
    l("`git commit --amend` son commit'in yerine yenisini koyar: mesajı düzeltir ya da unutulan dosyayı ekler.", "`git commit --amend` replaces the last commit: fix its message or add a forgotten file."),
    l("Amend geçmişi yeniden yazar: sadece henüz push etmediğin commit'lerde kullan.", "Amend rewrites history: use it only on commits you have not pushed."),
  ],
  quiz: [
    {
      question: l("Bir dosyayı yanlışlıkla `git add` ettin ama değişikliği kaybetmek istemiyorsun. Ne yaparsın?", "You staged a file by mistake but want to keep the change. What do you run?"),
      options: [l("`git restore dosya`", "`git restore file`"), l("`git restore --staged dosya`", "`git restore --staged file`"), l("`git commit --amend`", "`git commit --amend`"), l("`git reset --hard`", "`git reset --hard`")],
      answer: 1,
      explain: l("`--staged` sadece staging'i geri alır; klasördeki değişiklik durur.", "`--staged` only undoes staging; the folder's change stays."),
      reviewStep: 4,
    },
    {
      question: l("`git commit --amend` sonrası son commit'in kimliği ne olur?", "After `git commit --amend`, what happens to the last commit's id?"),
      options: [l("Aynı kalır", "It stays the same"), l("Değişir: yerine yeni bir commit gelir", "It changes: a new commit replaces it"), l("Kimliği silinir", "It loses its id"), l("Bir önceki commit'in kimliğini alır", "It takes the previous commit's id")],
      answer: 1,
      explain: l("Commit'in kimliği içeriğinden hesaplanır; mesaj ya da dosya değişince kimlik de değişir.", "A commit's id comes from its content; change the message or files and the id changes."),
      reviewStep: 6,
    },
    {
      question: l("Klasördeki ve henüz add etmediğin bir değişikliği `git restore` ile attın. Geri getirebilir misin?", "You threw away an unstaged folder change with `git restore`. Can you get it back?"),
      options: [l("Evet, `git reflog` ile", "Yes, with `git reflog`"), l("Evet, `git restore --staged` ile", "Yes, with `git restore --staged`"), l("Hayır: hiç kaydedilmemişti", "No: it was never saved"), l("Evet, `git commit --amend` ile", "Yes, with `git commit --amend`")],
      answer: 2,
      explain: l("Değişiklik ne staging'e ne de bir commit'e girmişti, Git onu hiç görmedi.", "The change never reached staging or a commit; Git never saw it."),
      reviewStep: 2,
    },
    {
      question: l("Bir commit'i push ettikten sonra mesajında hata buldun. En güvenli yol hangisi?", "You find a mistake in a commit after pushing it. What is the safest fix?"),
      options: [
        l("`git commit --amend` ve tekrar push", "`git commit --amend` and push again"),
        l("Hatayı düzelten yeni bir commit ya da `git revert`", "A new commit that fixes it, or `git revert`"),
        l("`git restore`", "`git restore`"),
        l("Repo'yu silip yeniden clone'lamak", "Delete the repo and clone again"),
      ],
      answer: 1,
      explain: l(
        "Paylaşılmış geçmişi yeniden yazmak takım arkadaşlarının geçmişiyle çakışır. Üstüne yeni bir commit eklemek herkes için güvenli.",
        "Rewriting shared history clashes with your teammates' copies. Adding a new commit on top is safe for everyone.",
      ),
      reviewStep: 8,
    },
  ],
};
