import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { CI, scene } from "./Scene";

const FILE = workflowYaml(CI);

export const prChecks: Lesson = {
  slug: "pr-checks",
  title: l("PR check'leri ve branch protection", "PR checks and branch protection"),
  summary: l(
    "CI bir pull request'te çalışınca sonucu PR'a check olarak düşer. Ama check kırmızı diye merge durmaz: main'i branch protection ile korur ve check'i zorunlu yaparsan kırık kod main'e giremez.",
    "When CI runs on a pull request, its result shows on the PR as a check. But a red check does not stop a merge by itself: protect main with branch protection and make the check required, and broken code cannot get in.",
  ),
  minutes: 15,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir PR'daki check'lerin nereden geldiğini bilmek", "Know where a PR's checks come from"), step: 0 },
    { text: l("Korumasız bir main'e kırık kodun nasıl girdiğini görmek", "See how broken code gets into an unprotected main"), step: 1 },
    { text: l("Branch protection ile bir check'i zorunlu yapmak", "Make a check required with branch protection"), step: 2 },
    { text: l("Zorunlu check adının job adıyla eşleşmesi gerektiğini bilmek", "Know a required check's name must match the job"), step: 5 },
  ],
  steps: [
    {
      short: l("Kırmızı PR", "A red PR"),
      tag: "problem",
      title: l("PR'da bir check kırmızı", "A check on the PR is red"),
      body: [
        l(
          "Bir arkadaşın `feature` branch'inde sepete KDV ekledi ve bir pull request açtı. Workflow'da `on: pull_request` olduğu için CI bu PR için de çalıştı ve sonucu PR'ın altına bir check olarak düştü: `CI / ci`.",
          "A teammate added VAT to the cart on the `feature` branch and opened a pull request. The workflow has `on: pull_request`, so CI ran for this PR too, and its result landed under the PR as a check: `CI / ci`.",
        ),
        l(
          "Check'in adı `workflow adı / job adı` şeklinde. Bu sefer kırmızı: bir test kırık.",
          "A check's name is `workflow name / job name`. This one is red: a test fails.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "gh pr create --fill", note: l("Mevcut branch'ten PR aç.", "Open a PR from the current branch.") },
          { cmd: "gh pr checks", note: l("PR'daki check'leri ve durumlarını listeler.", "Lists the PR's checks and their state.") },
        ],
        snippets: [{ label: ".github/workflows/ci.yml", code: FILE, note: l("`pull_request:` satırı CI'ı her PR'da ve PR'a gelen her push'ta çalıştırır.", "The `pull_request:` line runs CI on every PR and on every push to it.") }],
      },
    },
    {
      short: l("Merge et", "Merge it"),
      tag: "experiment",
      predict: {
        question: l("main'de hiçbir koruma yok. Kırmızı check'e rağmen \"Merge\"e basarsak ne olur?", "main has no protection. What happens if we press \"Merge\" despite the red check?"),
        options: [l("GitHub izin vermez", "GitHub refuses"), l("Merge olur ve main'deki CI kırmızı olur", "It merges and CI on main goes red"), l("Merge olur, main'de CI çalışmaz", "It merges and CI does not run on main")],
        answer: 1,
        why: l(
          "Kırmızı check sadece bir bilgi. Kural koymadıysan GitHub merge'i durdurmaz. Merge bir push gibi main'e gelir, main'deki CI da aynı test yüzünden kırılır.",
          "A red check is only information. Without a rule, GitHub does not stop the merge. The merge lands on main like a push, and CI on main fails on the same test.",
        ),
      },
      title: l("Kırık kod main'e girdi", "Broken code got into main"),
      body: [
        l(
          "PR #1 merge edildi ve main'deki run kırmızı. Bundan sonra main'den branch açan herkes kırık bir testle başlıyor; kendi değişikliği yüzünden mi, yoksa önceden mi kırıktı, ayırt etmek zorlaşıyor.",
          "PR #1 got merged and the run on main is red. From now on, everyone who branches off main starts with a broken test, and it gets hard to tell whether their change broke it or it was broken before.",
        ),
      ],
    },
    {
      short: l("Koruma", "Protection"),
      tag: "how",
      title: l("main'i koru: check zorunlu olsun", "Protect main: make the check required"),
      body: [
        l(
          "Önce main'deki testi düzelttik, main tekrar yeşil. Sonra main için [[branchProtection|branch protection]] kuralı ekledik ve `CI / ci` check'ini [[requiredCheck|zorunlu]] yaptık.",
          "First we fixed the test on main, so main is green again. Then we added a [[branchProtection|branch protection]] rule for main and made the `CI / ci` check [[requiredCheck|required]].",
        ),
        l(
          "Artık bir PR'ın merge edilebilmesi için bu check'in PR'ın son commit'inde yeşil olması gerekiyor. Bu ayar repo ayarlarında, workflow dosyasında değil.",
          "Now a PR can only merge when this check is green on the PR's latest commit. The rule lives in the repo settings, not in the workflow file.",
        ),
      ],
      practice: {
        intro: l(
          "GitHub'da: Settings → Rules → Rulesets → New branch ruleset. Hedef: `main`. \"Require status checks to pass\" kutusunu işaretle ve `ci` job'ını ekle. Eski arayüzde aynı ayar Settings → Branches → Branch protection rules altında.",
          "On GitHub: Settings → Rules → Rulesets → New branch ruleset. Target: `main`. Tick \"Require status checks to pass\" and add the `ci` job. In the older UI the same setting is under Settings → Branches → Branch protection rules.",
        ),
        commands: [{ cmd: "gh api repos/{owner}/{repo}/rulesets", note: l("Repodaki kuralları JSON olarak gösterir.", "Shows the repo's rulesets as JSON.") }],
      },
    },
    {
      short: l("Engellendi", "Blocked"),
      tag: "experiment",
      predict: {
        question: l("Yeni bir PR (#2) açıldı ve lint hatası yüzünden kırmızı. main artık korumalı. \"Merge\"e basınca ne olur?", "A new PR (#2) is open and red because of a lint error. main is protected now. What happens when we press \"Merge\"?"),
        options: [l("Merge olur", "It merges"), l("GitHub merge'i engeller", "GitHub blocks the merge"), l("PR kapanır", "The PR closes")],
        answer: 1,
        why: l("Zorunlu check kırmızı olduğu sürece merge düğmesi kilitli kalır.", "As long as a required check is red, the merge button stays locked."),
      },
      title: l("Kırmızı PR artık giremiyor", "A red PR cannot get in anymore"),
      body: [
        l(
          "Merge denemesi reddedildi: \"Merging is blocked\". main yeşil kaldı. Koruma kimseye güvenmemek için değil, herkesin aynı kuralla çalışması için: acelesi olan da, dikkatli olan da aynı kapıdan geçer.",
          "The merge attempt was refused: \"Merging is blocked\". main stayed green. Protection is not about distrust; it makes everyone follow the same rule, in a hurry or not.",
        ),
      ],
    },
    {
      short: l("Düzelt, merge et", "Fix, merge"),
      tag: "how",
      title: l("Aynı branch'e düzeltme push'la", "Push the fix to the same branch"),
      body: [
        l(
          "PR'ı kapatıp yenisini açmana gerek yok. Düzeltmeyi aynı `coupons` branch'ine push'ladık: PR'a yeni commit gelince CI kendiliğinden yeniden çalıştı ve check yeşile döndü.",
          "No need to close the PR and open a new one. We pushed the fix to the same `coupons` branch: a new commit on the PR made CI run again by itself, and the check turned green.",
        ),
        l("Merge düğmesi açıldı, PR #2 merge edildi ve main'deki run da yeşil.", "The merge button unlocked, PR #2 merged, and the run on main is green too."),
      ],
      practice: {
        commands: [
          { cmd: "git commit -am \"fix: unused variable\" && git push", note: l("PR'daki check'ler yeniden çalışır.", "The PR's checks run again.") },
          { cmd: "gh pr merge --squash --auto", note: l("Check'ler yeşil olunca kendiliğinden merge et (repoda auto-merge açıksa).", "Merge by itself once the checks are green (if auto-merge is on for the repo).") },
        ],
      },
    },
    {
      short: l("Hayalet check", "Ghost check"),
      tag: "experiment",
      predict: {
        question: l(
          "Birisi workflow'daki job'ın adını `ci`'den `test`'e değiştirdi. Koruma hâlâ `CI / ci`'ı istiyor. Yeni PR #3'ün CI'ı yeşil. Merge edilebilir mi?",
          "Someone renamed the workflow's job from `ci` to `test`. Protection still asks for `CI / ci`. The new PR #3's CI is green. Can it merge?",
        ),
        options: [l("Evet, CI yeşil", "Yes, CI is green"), l("Hayır: `CI / ci` hiç gelmeyecek", "No: `CI / ci` will never arrive"), l("GitHub adı kendisi düzeltir", "GitHub fixes the name itself")],
        answer: 1,
        why: l(
          "Koruma check'i adıyla arar. Artık `CI / test` adında bir check geliyor; `CI / ci` adında check hiç gelmediği için \"bekleniyor\" durumunda takılı kalır.",
          "Protection looks for the check by name. A check called `CI / test` arrives now; nothing called `CI / ci` ever does, so it stays stuck as \"expected\".",
        ),
      },
      title: l("Zorunlu check'in adı job'ın adıdır", "A required check's name is the job's name"),
      body: [
        l(
          "PR #3'te `CI / test` yeşil ama `CI / ci` \"bekleniyor: hiç çalışmadı\". Merge engelli ve sonsuza kadar öyle kalır. Bu yüzden job'ın adını değiştirirken koruma ayarını da güncelle.",
          "On PR #3 `CI / test` is green but `CI / ci` says \"expected: never reported\". The merge is blocked and stays that way forever. So when you rename a job, update the protection rule too.",
        ),
        l(
          "Aynı tuzağa path filtreleriyle de düşülür: workflow hiç başlamazsa zorunlu check de hiç gelmez. Bunu \"Sadece değişen kod için çalıştır\" dersinde çözeceğiz.",
          "Path filters set the same trap: if the workflow never starts, the required check never arrives. We will solve that in \"Run only for what changed\".",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede koruma", "Protection in a real project"),
      body: [
        l(
          "Koruma kuralına genelde başka şeyler de eklenir: en az bir onaylı review, \"branch güncel olmalı\" (PR, main'in son haliyle de test edilmiş olsun) ve main'e doğrudan push yasağı.",
          "A protection rule usually holds more: at least one approving review, \"branch must be up to date\" (the PR is tested against main's latest state too) and no direct pushes to main.",
        ),
        l(
          "GitHub atlanan (`skipped`) bir job'ı geçmiş sayar; zorunlu check bu yüzden yeşil görünür. Hiç başlamamış bir check ise bekleniyor olarak kalır.",
          "GitHub counts a skipped job as passing, so such a required check looks green. A check that never started at all stays expected.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede main'e doğrudan push'layabildik (main'i düzeltirken), çünkü model sadece zorunlu check'leri uyguluyor. Gerçekte koruma açıkken doğrudan push da engellenir ve düzeltme de bir PR'dan gelir. Review şartı ve \"güncel branch\" kuralı da sahnede yok.",
            "On stage we could push straight to main (while fixing it), because the model only enforces required checks. In reality protection also blocks direct pushes, so the fix comes through a PR too. Required reviews and the \"up to date\" rule are not on stage either.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Aşağıda gerçek işten **4 senaryo** var: Bora'nın PR'ı kırmızı, `main` korumasız ya da zorunlu check hiç gelmiyor. Komutları terminale **kendin yaz**: `gh pr checks`, `gh run view --log-failed`, `git switch`, `nano`, `git push`, `gh pr merge`.",
          "Below are **4 scenarios** from real work: Bora's PR is red, `main` is unprotected, or the required check never arrives. **Type the commands yourself**: `gh pr checks`, `gh run view --log-failed`, `git switch`, `nano`, `git push`, `gh pr merge`.",
        ),
        l(
          "Korumayı ayar ekranı yerine GitHub'ın API'siyle kuracaksın: `gh api -X PUT repos/{owner}/{repo}/branches/main/protection`. Gövdeyi `nano protection.json` ile yazıp `--input` ile verebilirsin. Bir `nano` kaydı da bir komut sayılır; az komutla bitirirsen 3 yıldız.",
          "You'll set protection with GitHub's API instead of the settings page: `gh api -X PUT repos/{owner}/{repo}/branches/main/protection`. Write the body with `nano protection.json` and pass it with `--input`. A `nano` save counts as a command too; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`on: pull_request` ile CI her PR'da çalışır; sonucu PR'da `workflow / job` adlı bir check olur.", "With `on: pull_request` CI runs on every PR; its result is a check named `workflow / job`."),
    l("Kırmızı check tek başına merge'i durdurmaz.", "A red check alone does not stop a merge."),
    l("Branch protection ile check'i zorunlu yap: kırmızıyken merge engellenir.", "Make the check required with branch protection: while it is red, merging is blocked."),
    l("Düzeltmeyi aynı branch'e push'la; PR'ın check'leri kendiliğinden yeniden çalışır.", "Push the fix to the same branch; the PR's checks run again by themselves."),
    l("Zorunlu check adı job adıyla eşleşmeli; hiç gelmeyen check merge'i sonsuza kadar bekletir.", "A required check's name must match the job; a check that never arrives blocks the merge forever."),
  ],
  quiz: [
    {
      question: l("main korumasızken kırmızı check'li bir PR'ı merge etmeye çalışırsan ne olur?", "With main unprotected, what happens if you merge a PR whose check is red?"),
      options: [l("Merge olur", "It merges"), l("Engellenir", "It is blocked"), l("Önce CI tekrar çalışır", "CI runs again first"), l("PR silinir", "The PR is deleted")],
      answer: 0,
      explain: l("Kural koymadıysan check sadece bilgi verir.", "Without a rule, a check is only information."),
      reviewStep: 1,
    },
    {
      question: l("Bir check'i zorunlu yapan ayar nerede?", "Where is the setting that makes a check required?"),
      options: [l("Workflow dosyasında `required: true`", "In the workflow file, `required: true`"), l("Repo ayarlarında, branch protection / ruleset kuralında", "In the repo settings, in a branch protection rule / ruleset"), l("`package.json`'da", "In `package.json`"), l("PR açıklamasında", "In the PR description")],
      answer: 1,
      explain: l("Workflow check'i üretir; zorunlu olup olmadığına repo ayarı karar verir.", "The workflow produces the check; the repo settings decide whether it is required."),
      reviewStep: 2,
    },
    {
      question: l("PR'daki check kırmızı. Düzeltmeyi nasıl getirirsin?", "A PR's check is red. How do you bring the fix?"),
      options: [l("PR'ı kapatıp yeni PR açarak", "Close the PR and open a new one"), l("Aynı branch'e yeni bir commit push'layarak", "Push a new commit to the same branch"), l("Check'i elle yeşile çevirerek", "Turn the check green by hand"), l("Korumayı kaldırarak", "Remove the protection")],
      answer: 1,
      explain: l("PR'a gelen her yeni commit check'leri yeniden çalıştırır.", "Every new commit on the PR runs the checks again."),
      reviewStep: 4,
    },
    {
      question: l("Job'ın adını `ci`'den `test`'e değiştirdin, koruma hâlâ `CI / ci` istiyor. PR'lara ne olur?", "You renamed the job from `ci` to `test`; protection still asks for `CI / ci`. What happens to PRs?"),
      options: [l("Hiçbir şey değişmez", "Nothing changes"), l("`CI / ci` \"bekleniyor\" kalır ve merge engellenir", "`CI / ci` stays \"expected\" and merging is blocked"), l("Koruma kendiliğinden güncellenir", "Protection updates itself"), l("Bütün check'ler atlanır", "All checks are skipped")],
      answer: 1,
      explain: l("Koruma check'i adıyla bekler; o adla bir check hiç gelmez.", "Protection waits for the check by name, and nothing with that name ever comes."),
      reviewStep: 5,
    },
  ],
};
