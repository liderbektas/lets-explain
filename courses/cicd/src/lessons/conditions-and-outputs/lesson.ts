import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { condWf, scene } from "./Scene";

const FINAL = workflowYaml(condWf({ mainOnly: true, notify: "failure", softLint: false }));

export const conditionsAndOutputs: Lesson = {
  slug: "conditions-and-outputs",
  title: l("Koşullar ve çıktılar", "Conditions and outputs"),
  summary: l(
    "`if:` ile bir job'ı sadece main'de çalıştır, `failure()` ve `always()` ile kırılınca da çalışan adımlar yaz, `$GITHUB_OUTPUT` ile bir job'ın değerini sonrakine taşı ve `continue-on-error` ile bir adımın kırılmasını hoş gör.",
    "Run a job only on main with `if:`, write steps that also run on failure with `failure()` and `always()`, pass a value from one job to the next with `$GITHUB_OUTPUT`, and tolerate a failing step with `continue-on-error`.",
  ),
  minutes: 17,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Deploy'u `if:` ile sadece main'e sınırlamak", "Limit the deploy to main with `if:`"), step: 1 },
    { text: l("Varsayılan `success()` koşulunu ve `failure()` / `always()`'ı anlamak", "Understand the default `success()`, and `failure()` / `always()`"), step: 3 },
    { text: l("Job çıktısıyla bir değeri sonraki job'a taşımak", "Pass a value to the next job with a job output"), step: 4 },
    { text: l("`continue-on-error` ne zaman işe yarar, ne zaman tehlikeli?", "When `continue-on-error` helps and when it hurts"), step: 5 },
  ],
  steps: [
    {
      short: l("Her branch'ten deploy", "Deploys from any branch"),
      tag: "problem",
      title: l("Bir deneme branch'i staging'e çıktı", "A test branch went to staging"),
      body: [
        l(
          "Workflow her push'ta çalışıyor: `build`, sonra `deploy`. Birisi `feature` branch'ine yarım bir deneme push'ladı. Testler geçti ve `deploy` job'ı onu staging'e koydu. Takımın geri kalanı staging'de beklemediği bir şey görüyor.",
          "The workflow runs on every push: `build`, then `deploy`. Someone pushed a half-done experiment to the `feature` branch. Tests passed and the `deploy` job put it on staging. The rest of the team now sees something unexpected there.",
        ),
        l(
          "Her job ve her adım bir `if:` koşulu alabilir. Koşul yazmazsan GitHub `success()` kullanır: \"önceki her şey geçtiyse çalış\". Hangi branch olduğuna bakmaz.",
          "Every job and step can take an `if:` condition. If you write none, GitHub uses `success()`: \"run if everything before passed\". It does not look at the branch.",
        ),
      ],
    },
    {
      short: l("if: main", "if: main"),
      tag: "how",
      predict: {
        question: l(
          "`deploy` job'ına `if: github.ref == 'refs/heads/main'` ekledik. Yine `feature`'a push'larsak run'da `deploy` ne olur?",
          "We added `if: github.ref == 'refs/heads/main'` to the `deploy` job. If we push to `feature` again, what happens to `deploy` in the run?",
        ),
        options: [l("Kırmızı olur", "It goes red"), l("Atlanır (gri), run yine yeşil", "It is skipped (grey), the run stays green"), l("Run hiç başlamaz", "The run never starts")],
        answer: 1,
        why: l(
          "Koşul tutmayan job atlanır; atlanan job hata sayılmaz. Workflow yine çalışır, `build` yine test eder.",
          "A job whose condition is false is skipped, and a skip is not a failure. The workflow still runs and `build` still tests.",
        ),
      },
      title: l("Deploy sadece main'de", "Deploy only on main"),
      body: [
        l(
          "`feature` push'unda `build` çalıştı, `deploy` atlandı. Ardından main'e gelen push'ta koşul tuttu ve staging o commit'e geçti.",
          "On the `feature` push, `build` ran and `deploy` was skipped. On the next push to main the condition held and staging moved to that commit.",
        ),
        l(
          "Koşulda `github.event_name == 'push'` da var: main'e açılan bir PR'ın run'ı da main'e dokunur gibi görünmesin diye.",
          "The condition also checks `github.event_name == 'push'`, so a PR run targeting main does not count as main.",
        ),
      ],
    },
    {
      short: l("Sessiz kırılma", "Silent failure"),
      tag: "experiment",
      predict: {
        question: l(
          "Kırılınca sohbete mesaj atan bir `notify` job'ı ekledik (`needs: [build, deploy]`, koşulsuz). main'e kırık bir test push'landı. `notify` çalışır mı?",
          "We added a `notify` job that posts to chat on failure (`needs: [build, deploy]`, no condition). A broken test is pushed to main. Does `notify` run?",
        ),
        options: [l("Evet, haber verir", "Yes, it reports it"), l("Hayır, atlanır", "No, it is skipped"), l("Run iptal olur", "The run is cancelled")],
        answer: 1,
        why: l(
          "Koşul yazmadığımız için `success()` geçerli: ihtiyaç duyduğu `build` kırıldı, o da atlandı. Tam haber vermesi gereken anda sustu.",
          "With no condition, `success()` applies: `build`, which it needs, failed, so it was skipped. It went quiet exactly when it should have spoken.",
        ),
      },
      title: l("Haber verecek job sustu", "The job meant to tell you stayed quiet"),
      body: [
        l(
          "`build` testte kırıldı, `deploy` ve `notify` atlandı. Kimse fark etmedi. Üstelik yeşil bir run'da bu job \"CI/CD failed\" diye mesaj atardı: koşulsuz job her başarıda çalışır.",
          "`build` failed at the tests; `deploy` and `notify` were skipped. Nobody noticed. Worse, on a green run this job would post \"CI/CD failed\": a job without a condition runs on every success.",
        ),
      ],
    },
    {
      short: l("failure()", "failure()"),
      tag: "how",
      title: l("failure() ve always()", "failure() and always()"),
      body: [
        l(
          "`notify` job'ına `if: failure()` yazdık: \"ihtiyaç duyduğum job'lardan biri kırıldıysa çalış\". Bir sonraki kırık push'ta `notify` çalıştı ve sohbete mesaj attı. Yeşil run'larda ise atlanır.",
          "We gave `notify` `if: failure()`: \"run if a job I need failed\". On the next broken push `notify` ran and posted to chat. On green runs it is skipped.",
        ),
        l(
          "Bir de `always()` var: ne olursa olsun çalış. `build` içindeki özet adımı bunu kullanıyor; test kırılsa bile run sayfasına özet yazılıyor. Logları ya da test raporlarını yüklemek için de `always()` kullanılır.",
          "There is also `always()`: run no matter what. The summary step in `build` uses it, so a summary is written to the run page even when tests fail. It is also how you upload logs or test reports.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`always()` iptal edilen run'larda da çalışır. Bir run'ı iptal ettiğinde yine de çalışmasını istemediğin bir adım için `if: ${{ !cancelled() }}` daha uygun.",
            "`always()` also runs when a run is cancelled. For a step that should not run after you cancel, `if: ${{ !cancelled() }}` fits better.",
          ),
        },
      ],
    },
    {
      short: l("Çıktılar", "Outputs"),
      tag: "how",
      title: l("Bir job'dan sonrakine değer taşımak", "Passing a value to the next job"),
      body: [
        l(
          "Testi düzelttik, run yeşil. `build` job'ı bir adımda `echo \"version=sha-...\" >> $GITHUB_OUTPUT` yazdı ve bunu job'ın `outputs:` kısmında dışarı açtı. `deploy` job'ı aynı değeri `${{ needs.build.outputs.version }}` ile okudu ve özetine \"Deployed sha-... to staging\" yazdı.",
          "We fixed the test and the run is green. The `build` job wrote `echo \"version=sha-...\" >> $GITHUB_OUTPUT` in a step and exposed it under the job's `outputs:`. The `deploy` job read the same value with `${{ needs.build.outputs.version }}` and wrote \"Deployed sha-... to staging\" in its summary.",
        ),
        l(
          "Job'lar ayrı makinelerde çalışır; bir değişkeni paylaşamazlar. Küçük değerler (sürüm, image etiketi, \"değişti mi?\") çıktıyla, dosyalar ise artifact ile taşınır. `$GITHUB_STEP_SUMMARY`'ye yazdığın Markdown da run sayfasında görünür.",
          "Jobs run on separate machines and cannot share a variable. Small values (a version, an image tag, \"did it change?\") travel as outputs; files travel as artifacts. Markdown you write to `$GITHUB_STEP_SUMMARY` shows up on the run page.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci-cd.yml", code: FINAL }] },
    },
    {
      short: l("continue-on-error", "continue-on-error"),
      tag: "experiment",
      predict: {
        question: l(
          "Lint adımına `continue-on-error: true` ekledik ve lint hatası olan bir commit push'ladık. Testler geçiyor. Staging'e çıkar mı?",
          "We added `continue-on-error: true` to the lint step and pushed a commit with a lint error. Tests pass. Does it reach staging?",
        ),
        options: [l("Hayır, lint kırıldı", "No, lint failed"), l("Evet: lint kırmızı ama job devam etti", "Yes: lint is red but the job carried on"), l("Lint hiç çalışmaz", "Lint does not run")],
        answer: 1,
        why: l(
          "`continue-on-error` adımın kırılmasını job için yok sayar. Adım uyarıyla işaretlenir, job ve run yeşil kalır.",
          "`continue-on-error` ignores the step's failure as far as the job is concerned. The step is marked with a warning; the job and run stay green.",
        ),
      },
      title: l("Kırılsa da devam et", "Carry on even if it fails"),
      body: [
        l(
          "Lint kırıldı (kapısında uyarı işaretiyle), ama testler ve build çalıştı ve commit staging'e çıktı. Yeni bir lint kuralını ekibe yavaş yavaş tanıtırken ya da isteğe bağlı bir kontrol eklerken işe yarar.",
          "Lint failed (marked with a warning at its gate), but tests and build ran and the commit went to staging. Useful while rolling out a new lint rule or for an optional check.",
        ),
        l(
          "Dikkat: hata görmezden gelinen her adım, zamanla kimsenin bakmadığı bir adım olur. Testlere asla koyma.",
          "Careful: a step whose failure is ignored slowly becomes a step nobody looks at. Never put it on your tests.",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Koşul yazımı:** `if:` içinde `${{ }}` yazmak isteğe bağlı; `if: failure()` ile `if: ${{ failure() }}` aynı şey. Koşulları karmaşıklaştırmak yerine ayrı job'lara bölmek çoğu zaman daha okunur.",
          "**Writing conditions:** `${{ }}` is optional in `if:`; `if: failure()` and `if: ${{ failure() }}` are the same. Splitting into separate jobs is often clearer than a complicated condition.",
        ),
        l(
          "**Çıktılar string'dir:** `true` bir çıktı olarak `'true'` metnidir; karşılaştırırken tırnak kullan: `== 'true'`.",
          "**Outputs are strings:** a `true` output is the text `'true'`; compare it with quotes: `== 'true'`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede sohbete atılan mesaj ve özet sadece birer satır; gerçekte bildirim için Slack ya da Teams gibi bir action ve bir webhook secret'ı gerekir. Deploy da hazır `./deploy.sh` betiği gibi davranıyor, gerçek bir sunucu yok.",
            "On this stage the chat message and the summary are a single line each; in reality notifications need an action for Slack or Teams and a webhook secret. The deploy behaves like a ready-made `./deploy.sh`; there is no real server.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "gh run view --log-failed", note: l("Son run'ın sadece kırılan adımlarının logu.", "Only the failed steps' logs of the latest run.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Aşağıda gerçek işten **4 senaryo** var: yarım bir deneme staging'e çıkmış, `main` sessizce kırık, lint bir düzeltmeyi tutuyor, kırmızı run'ın özeti boş. Her birinde koşulları `.github/workflows/ci-cd.yml` içine **kendin yaz**: `nano` ile aç, `git commit -am` ve `git push`.",
          "Below are **4 scenarios** from real work: a half-done experiment reached staging, `main` is quietly broken, lint holds back a fix, a red run's summary is empty. In each, **write the conditions yourself** in `.github/workflows/ci-cd.yml`: open it with `nano`, then `git commit -am` and `git push`.",
        ),
        l(
          "Değişiklik ancak push'landığında geçerli olur. Sonucu `gh run list` ve `gh run view` ile görürsün. Bir `nano` kaydı da bir komut sayılır; az komutla bitirirsen 3 yıldız.",
          "A change only counts once it's pushed. See the result with `gh run list` and `gh run view`. A `nano` save counts as a command too; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Koşulsuz job ve adımlar `success()` kullanır: önceki her şey geçtiyse çalışır.", "Jobs and steps without a condition use `success()`: they run if everything before passed."),
    l("`if: github.ref == 'refs/heads/main'` deploy'u main ile sınırlar; tutmayan job atlanır, hata sayılmaz.", "`if: github.ref == 'refs/heads/main'` limits a deploy to main; a job whose condition is false is skipped, not failed."),
    l("`failure()` bir şey kırılınca çalışır (bildirim), `always()` her durumda (log, rapor).", "`failure()` runs when something failed (notifications), `always()` runs in every case (logs, reports)."),
    l("Job'lar değişken paylaşamaz: `$GITHUB_OUTPUT` + `outputs:` + `needs.<job>.outputs.<ad>` ile değer taşınır.", "Jobs cannot share variables: values travel via `$GITHUB_OUTPUT` + `outputs:` + `needs.<job>.outputs.<name>`."),
    l("`continue-on-error` bir adımın kırılmasını hoş görür; isteğe bağlı kontroller için, testler için değil.", "`continue-on-error` tolerates a failing step; for optional checks, not for tests."),
  ],
  quiz: [
    {
      question: l("Koşulu olmayan bir job, ihtiyaç duyduğu job kırılınca ne yapar?", "A job with no condition: what does it do when a job it needs fails?"),
      options: [l("Yine çalışır", "Runs anyway"), l("Atlanır", "Is skipped"), l("Kırmızı olur", "Turns red"), l("Run'ı yeniden başlatır", "Restarts the run")],
      answer: 1,
      explain: l("Varsayılan koşul `success()`; ihtiyaç duyulan job kırıldıysa tutmaz.", "The default condition is `success()`, which is false when a needed job failed."),
      reviewStep: 2,
    },
    {
      question: l("Sadece bir şey kırıldığında sohbete mesaj atan job hangi koşulu kullanmalı?", "Which condition should a job that posts to chat only on failure use?"),
      options: [l("`always()`", "`always()`"), l("`failure()`", "`failure()`"), l("`success()`", "`success()`"), l("Koşul gerekmez", "No condition needed")],
      answer: 1,
      explain: l("`always()` yeşil run'larda da mesaj atardı; `failure()` sadece kırılınca çalışır.", "`always()` would post on green runs too; `failure()` runs only on failure."),
      reviewStep: 3,
    },
    {
      question: l("`build` job'ının ürettiği sürüm etiketini `deploy` job'ı nasıl okur?", "How does the `deploy` job read the version tag the `build` job produced?"),
      options: [
        l("Ortam değişkeni olarak otomatik gelir", "It arrives as an env variable automatically"),
        l("`${{ needs.build.outputs.version }}` ile, build onu `$GITHUB_OUTPUT` ve `outputs:` ile açtıysa", "With `${{ needs.build.outputs.version }}`, if build exposed it via `$GITHUB_OUTPUT` and `outputs:`"),
        l("Aynı makinedeki bir dosyadan", "From a file on the same machine"),
        l("Okuyamaz", "It cannot"),
      ],
      answer: 1,
      explain: l("Job'lar ayrı makinelerde çalışır; değerler job çıktısı olarak açılıp `needs` üzerinden okunur.", "Jobs run on separate machines; values are exposed as job outputs and read through `needs`."),
      reviewStep: 4,
    },
    {
      question: l("`continue-on-error: true` olan bir adım kırılırsa ne olur?", "What happens when a step with `continue-on-error: true` fails?"),
      options: [l("Job durur", "The job stops"), l("Job devam eder, adım uyarıyla işaretlenir", "The job carries on, the step gets a warning mark"), l("Adım tekrar denenir", "The step is retried"), l("Run iptal olur", "The run is cancelled")],
      answer: 1,
      explain: l("Adımın hatası job'ın sonucunu etkilemez; ama kimse bakmazsa hata orada kalır.", "The step's failure does not affect the job's result; but if nobody looks, the problem stays."),
      reviewStep: 5,
    },
  ],
};
