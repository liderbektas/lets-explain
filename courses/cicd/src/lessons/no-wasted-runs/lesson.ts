import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { missions } from "./missions";
import { e2eWf, matrixWf, scene } from "./Scene";

export const noWastedRuns: Lesson = {
  slug: "no-wasted-runs",
  title: l("Boşuna çalışmayı engelle", "Stop wasted runs"),
  summary: l(
    "Arka arkaya gelen push'larda sadece sonuncusunu çalıştır (`concurrency`), takılan bir job'ı 6 saat bekleme (`timeout-minutes`), matrix'te bir bacak kırılınca diğerlerinin sonucunu da gör (`fail-fast: false`) ve commit mesajına `[skip ci]` yaz.",
    "Run only the last of several quick pushes (`concurrency`), do not wait 6 hours for a stuck job (`timeout-minutes`), still see the other legs when one matrix leg fails (`fail-fast: false`), and write `[skip ci]` in a commit message.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`concurrency` ile eski run'ları iptal etmek", "Cancel older runs with `concurrency`"), step: 1 },
    { text: l("`timeout-minutes` ile takılan job'ları durdurmak", "Stop stuck jobs with `timeout-minutes`"), step: 3 },
    { text: l("`fail-fast` ne yapar, ne zaman kapatılır?", "What `fail-fast` does and when to turn it off"), step: 4 },
    { text: l("`[skip ci]` ile bir push'ta CI'ı atlamak", "Skip CI for one push with `[skip ci]`"), step: 5 },
  ],
  steps: [
    {
      short: l("Beş push", "Five pushes"),
      tag: "problem",
      title: l("Beş push, beş tam run", "Five pushes, five full runs"),
      body: [
        l(
          "Birisi küçük düzeltmeleri yarım dakika arayla beş kez push'ladı. Her push kendi run'ını başlattı ve beşi de sonuna kadar çalıştı: toplam 15 dakika. Oysa ilk dördünün sonucuna kimse bakmayacak; önemli olan sonuncusu.",
          "Someone pushed small fixes five times, half a minute apart. Each push started its own run and all five ran to the end: 15 minutes in total. Nobody will look at the first four; only the last one matters.",
        ),
        l(
          "Sağdaki zaman çizelgesinde her satır bir run. Hepsi üst üste biniyor: aynı anda beş makine aynı işi farklı commit'lerle yapıyor.",
          "In the timeline on the right each row is a run. They overlap: five machines doing the same job at once on different commits.",
        ),
      ],
    },
    {
      short: l("concurrency", "concurrency"),
      tag: "how",
      predict: {
        question: l(
          "Workflow'a `concurrency` ekledik: `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`. Aynı beş push'tan kaç run sonuna kadar çalışır?",
          "We added `concurrency` to the workflow: `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`. How many of the same five pushes run to the end?",
        ),
        options: [l("Beşi de", "All five"), l("Sadece sonuncusu", "Only the last one"), l("Sadece ilki", "Only the first one")],
        answer: 1,
        why: l(
          "Aynı gruptan yeni bir run başlayınca, hâlâ çalışan eskisi iptal edilir. Her push bir öncekini durdurur; geriye sonuncusu kalır.",
          "When a new run in the same group starts, the older one still going is cancelled. Each push stops the one before; the last one is left.",
        ),
      },
      title: l("Yenisi gelince eskisi iptal", "A new one cancels the old one"),
      body: [
        l(
          "İlk dört run 30 saniye sonra iptal edildi (çizgili çubuklar), sadece beşincisi bitti. Toplam 7 dakika: her iptal edilen run yine de başladığı dakikayı öder.",
          "The first four runs were cancelled after 30 seconds (hatched bars); only the fifth finished. 7 minutes in total: a cancelled run still pays for the minute it started.",
        ),
        l(
          "Grup adında `github.ref` olduğu için her branch kendi grubunda: bir feature branch'e push'lamak main'in run'ını iptal etmez.",
          "Because `github.ref` is in the group name, each branch has its own group: pushing to a feature branch does not cancel main's run.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Deploy workflow'larında `cancel-in-progress: true` kullanma: yarıda kesilen bir deploy sunucuyu yarım bırakabilir. Orada sadece `group` yaz; yeni run eskisinin bitmesini bekler.",
            "Do not use `cancel-in-progress: true` on deploy workflows: a deploy cut in half can leave a server half-updated. There, write only `group`; the new run waits for the old one to finish.",
          ),
        },
      ],
    },
    {
      short: l("Takılan job", "Stuck job"),
      tag: "experiment",
      predict: {
        question: l(
          "Bir `e2e` job'ı, hiç ayağa kalkmayan bir sunucuyu beklerken takıldı. GitHub onu ne zaman durdurur?",
          "An `e2e` job got stuck waiting for a server that never comes up. When does GitHub stop it?",
        ),
        options: [l("1 dakika sonra", "After 1 minute"), l("10 dakika sonra", "After 10 minutes"), l("6 saat sonra", "After 6 hours")],
        answer: 2,
        why: l(
          "Bir job'ın varsayılan süre sınırı 360 dakika. O zamana kadar runner'ı ve dakikaları tutar.",
          "A job's default time limit is 360 minutes. Until then it holds the runner and the minutes.",
        ),
      },
      title: l("Altı saat boyunca hiçbir şey", "Six hours of nothing"),
      body: [
        l(
          "`e2e` job'ı 6 saat bekledi ve sonunda zaman aşımıyla kırıldı. Run 363 dakika faturalandı; bunun 360'ı hiçbir şey yapmadan geçti. Bu arada PR'da kimse sonucu göremedi.",
          "The `e2e` job waited 6 hours and finally failed on the time limit. The run billed 363 minutes, 360 of them doing nothing. Meanwhile nobody saw a result on the PR.",
        ),
      ],
    },
    {
      short: l("timeout-minutes", "timeout-minutes"),
      tag: "how",
      title: l("Her job'a makul bir süre sınırı", "A sensible time limit on every job"),
      body: [
        l(
          "`e2e` job'ına `timeout-minutes: 15` ekledik. Aynı takılma bu sefer 15. dakikada kesildi: run 18 dakika faturalandı ve kırmızı sonuç hemen göründü.",
          "We added `timeout-minutes: 15` to the `e2e` job. The same hang was cut at minute 15 this time: the run billed 18 minutes and the red result showed up at once.",
        ),
        l(
          "Bir job'ın normalde ne kadar sürdüğüne bak ve sınırı onun iki-üç katına koy. Takılırsa erken öğrenirsin, normalde hiç fark etmezsin.",
          "Look at how long a job usually takes and set the limit to two or three times that. If it hangs you find out early; otherwise you never notice.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(e2eWf({ concurrency: true, timeout: true })) }] },
    },
    {
      short: l("fail-fast", "fail-fast"),
      tag: "experiment",
      predict: {
        question: l(
          "Testler Node 20 ve 22'de matrix ile çalışıyor. Kod Node 20'de olmayan bir API kullanıyor. Node 20 bacağı kırılınca Node 22 bacağına ne olur?",
          "Tests run on Node 20 and 22 in a matrix. The code uses an API Node 20 lacks. When the Node 20 leg fails, what happens to the Node 22 leg?",
        ),
        options: [l("Sonuna kadar çalışır", "It runs to the end"), l("İptal edilir; Node 22'de çalışıp çalışmadığını öğrenemeyiz", "It is cancelled; we never learn whether Node 22 works"), l("O da kırılır", "It fails too")],
        answer: 1,
        why: l(
          "Matrix'in varsayılanı `fail-fast: true`: bir bacak kırılınca hâlâ çalışanlar durdurulur. Dakika kazandırır ama bilgi kaybettirir.",
          "A matrix defaults to `fail-fast: true`: when one leg fails, the ones still going are stopped. It saves minutes but loses information.",
        ),
      },
      title: l("Hızlı kırıl ya da hepsini gör", "Fail fast, or see everything"),
      body: [
        l(
          "İlk run'da `test (20)` kırıldı ve `test (22)` iptal edildi. Sorunun sadece Node 20'de mi, her yerde mi olduğunu bilmiyoruz. `fail-fast: false` ekleyip tekrar push'ladık: Node 20 yine kırmızı, Node 22 yeşil. Artık sorunun nerede olduğu belli.",
          "In the first run `test (20)` failed and `test (22)` was cancelled. We cannot tell whether the problem is Node 20 only or everywhere. We added `fail-fast: false` and pushed again: Node 20 red, Node 22 green. Now we know where the problem is.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: workflowYaml(matrixWf(false)) }] },
    },
    {
      short: l("[skip ci]", "[skip ci]"),
      tag: "how",
      title: l("[skip ci]: bu sefer çalışma", "[skip ci]: not this time"),
      body: [
        l(
          "README'de bir yazım hatası düzelttik ve commit mesajının sonuna `[skip ci]` yazdık. Workflow hiç başlamadı. GitHub `[ci skip]`, `[no ci]`, `[skip actions]` yazımlarını da tanır.",
          "We fixed a typo in the README and ended the commit message with `[skip ci]`. The workflow never started. GitHub also accepts `[ci skip]`, `[no ci]` and `[skip actions]`.",
        ),
        l(
          "Bu tek seferlik bir karar ve insanın elinde. Her zaman atlanması gereken dosyalar için \"Sadece değişen kod için çalıştır\" dersindeki `paths-ignore` daha güvenli: unutulmaz.",
          "It is a one-off choice and up to a person. For files that should always be skipped, `paths-ignore` from \"Run only for what changed\" is safer: nobody can forget it.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`[skip ci]` ile açılan bir PR'da zorunlu check'ler hiç çalışmaz ve PR kilitli kalır. Kodu değiştiren commit'lerde kullanma.",
            "On a PR, `[skip ci]` keeps required checks from ever running and the PR stays locked. Do not use it on commits that change code.",
          ),
        },
      ],
      practice: { commands: [{ cmd: 'git commit -m "docs: fix a typo [skip ci]"' }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Dakikalar:** public repolarda GitHub'ın hosted runner'ları ücretsiz; private repolarda her ay belli bir dakika hakkın olur, sonrası ücretlidir. Linux dışındaki runner'lar dakikayı daha hızlı harcar.",
          "**Minutes:** on public repos GitHub's hosted runners are free; private repos get a monthly allowance and pay after that. Non-Linux runners use minutes faster.",
        ),
        l(
          "**Sadece PR'larda iptal:** bazı ekipler main'deki her commit'in run'ını tamamlamak ister. O zaman grubu `github.head_ref || github.run_id` gibi yazıp sadece PR'larda iptal ettirirler.",
          "**Cancel only on PRs:** some teams want every commit on main to finish its run. They then write the group as `github.head_ref || github.run_id` so cancelling only happens on PRs.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede push'lar tam 30 saniye arayla geliyor, iptal anında oluyor ve her job dakikası yukarı yuvarlanarak faturalanıyor. Gerçekte iptal birkaç saniye sürer ve faturalama kuralları plana göre değişir.",
            "On this stage pushes come exactly 30 seconds apart, cancelling is instant and every job's minutes are rounded up. In reality cancelling takes a few seconds and billing rules depend on your plan.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "gh run cancel <run-id>", note: l("Bir run'ı elle iptal et.", "Cancel a run by hand.") }, { cmd: "gh run list --status in_progress", note: l("Şu an çalışanlar.", "What is running now.") }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "CI'da normal bir `ci` job'ı ve takılan bir `e2e` job'ı var; concurrency ve süre sınırı yok. Ayarları açıp kapatabilir, kod ya da README push'layabilirsin. Üstteki sayaçlar biten, iptal edilen run'ları ve dakikaları gösteriyor.",
          "CI has a normal `ci` job and an `e2e` job that hangs; no concurrency, no time limit. You can switch the settings and push code or the README. The counters on top show finished and cancelled runs and the minutes.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("`concurrency` + `cancel-in-progress: true`: aynı branch'te yeni run gelince eskisi iptal olur.", "`concurrency` + `cancel-in-progress: true`: a new run on the same branch cancels the old one."),
    l("Deploy workflow'larında iptal etme, sadece sıraya koy (`group` tek başına).", "On deploy workflows, do not cancel; just queue (`group` alone)."),
    l("Varsayılan job süre sınırı 6 saat; her job'a `timeout-minutes` koy.", "The default job limit is 6 hours; give every job a `timeout-minutes`."),
    l("Matrix'te `fail-fast: true` varsayılandır; bütün bacakların sonucunu görmek için `false` yap.", "`fail-fast: true` is the matrix default; set it to `false` to see every leg's result."),
    l("`[skip ci]` tek bir push'u atlar; kalıcı kurallar için `paths-ignore` kullan.", "`[skip ci]` skips one push; use `paths-ignore` for lasting rules."),
  ],
  quiz: [
    {
      question: l("`cancel-in-progress: true` olan bir workflow'da aynı branch'e iki push hızlıca gelirse ne olur?", "With `cancel-in-progress: true`, two pushes land on the same branch quickly. What happens?"),
      options: [l("İkisi de çalışır", "Both run"), l("İlki iptal edilir, ikincisi çalışır", "The first is cancelled, the second runs"), l("İkincisi bekler", "The second waits"), l("İkincisi reddedilir", "The second is rejected")],
      answer: 1,
      explain: l("Aynı gruptaki yeni run, hâlâ çalışan eskisini iptal eder.", "The new run in the same group cancels the older one still going."),
      reviewStep: 1,
    },
    {
      question: l("`timeout-minutes` yazılmamış bir job takılırsa ne kadar çalışır?", "A job without `timeout-minutes` hangs. How long does it run?"),
      options: [l("1 dakika", "1 minute"), l("15 dakika", "15 minutes"), l("360 dakika", "360 minutes"), l("Sonsuza kadar", "Forever")],
      answer: 2,
      explain: l("Varsayılan sınır 360 dakika (6 saat).", "The default limit is 360 minutes (6 hours)."),
      reviewStep: 2,
    },
    {
      question: l("Matrix'te Node 20 bacağı kırıldı ve Node 22 bacağı iptal edildi. Neden?", "In a matrix the Node 20 leg failed and the Node 22 leg was cancelled. Why?"),
      options: [l("Node 22 de kırıktı", "Node 22 was broken too"), l("`fail-fast` varsayılan olarak açık", "`fail-fast` is on by default"), l("Concurrency yüzünden", "Because of concurrency"), l("Süre sınırı yüzünden", "Because of the time limit")],
      answer: 1,
      explain: l("`fail-fast: true` ilk kırılan bacakta diğerlerini durdurur.", "`fail-fast: true` stops the other legs at the first failure."),
      reviewStep: 4,
    },
    {
      question: l("Deploy workflow'unda `cancel-in-progress: true` neden risklidir?", "Why is `cancel-in-progress: true` risky on a deploy workflow?"),
      options: [
        l("Daha çok dakika harcar", "It uses more minutes"),
        l("Yarıda kesilen bir deploy sunucuyu yarım bırakabilir", "A deploy cut in half can leave a server half-updated"),
        l("Secret'ları siler", "It deletes secrets"),
        l("Riskli değil", "It is not risky"),
      ],
      answer: 1,
      explain: l("Deploy'larda yeni run'ı sıraya koy, eskisini kesme.", "For deploys, queue the new run; do not cut the old one."),
      reviewStep: 1,
    },
  ],
};
