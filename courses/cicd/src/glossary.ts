import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what GitHub shows and what docs use. */
export const glossary: Record<string, GlossaryEntry> = {
  ci: {
    term: "CI (Continuous Integration)",
    def: l("Herkesin değişikliğini sık sık ana branch'e katması ve her katılımda kodun otomatik olarak kontrol edilmesi (lint, test, build).", "Everyone merges their changes into the main branch often, and every merge is checked automatically (lint, test, build)."),
  },
  cd: {
    term: "CD (Continuous Delivery / Deployment)",
    def: l("Delivery: her yeşil commit yayına hazırdır, prod'a çıkışı bir insan onaylar. Deployment: onay da yoktur, yeşil olan otomatik prod'a gider.", "Delivery: every green commit is ready to ship and a person approves going to prod. Deployment: no approval either; green goes to prod by itself."),
  },
  pipeline: {
    term: "Pipeline",
    def: l("Bir değişikliğin commit'ten yayına kadar geçtiği otomatik adımların tamamı.", "All the automated steps a change goes through from commit to release."),
  },
  workflow: {
    term: "Workflow",
    def: l("GitHub Actions'ta `.github/workflows/` altındaki bir YAML dosyası: ne zaman çalışacağını (`on`) ve hangi job'lardan oluştuğunu (`jobs`) söyler.", "In GitHub Actions, a YAML file under `.github/workflows/`: it says when it runs (`on`) and which jobs it has (`jobs`)."),
  },
  run: {
    term: "Run",
    def: l("Bir workflow'un bir kez çalışması. Her push ya da PR yeni bir run başlatır; numarası (#12) ve logları vardır.", "One execution of a workflow. Each push or PR starts a new run, with a number (#12) and its logs."),
  },
  job: {
    term: "Job",
    def: l("Bir runner'da baştan sona çalışan adımlar grubu. Job'lar varsayılan olarak paralel çalışır; `needs` ile sıraya konur.", "A group of steps that runs start to finish on one runner. Jobs run in parallel by default; `needs` puts them in order."),
  },
  step: {
    term: "Step",
    def: l("Bir job'ın içindeki tek adım: ya bir komut (`run:`) ya da hazır bir action (`uses:`).", "A single step inside a job: either a command (`run:`) or a ready-made action (`uses:`)."),
  },
  action: {
    term: "Action",
    def: l("Başkalarının yazdığı, `uses:` ile çağrılan hazır adım, örneğin `actions/checkout@v4`.", "A ready-made step written by someone else, called with `uses:`, such as `actions/checkout@v4`."),
  },
  runner: {
    term: "Runner",
    def: l("Job'ı çalıştıran makine. GitHub'ın hosted runner'ları her job için sıfırdan açılır ve job bitince silinir.", "The machine that runs a job. GitHub's hosted runners start fresh for every job and are thrown away after it."),
  },
  trigger: {
    term: "Trigger",
    def: l("Bir workflow'u başlatan olay: `push`, `pull_request`, `schedule`, `workflow_dispatch` gibi.", "The event that starts a workflow: `push`, `pull_request`, `schedule`, `workflow_dispatch` and so on."),
  },
  exitCode: {
    term: "Exit code",
    def: l("Bir komutun bitince döndürdüğü sayı. 0 başarı demektir; 0 dışındaki her şey adımı kırmızı yapar.", "The number a command returns when it ends. 0 means success; anything else turns the step red."),
  },
  requiredCheck: {
    term: "Required check",
    def: l("Branch protection'da işaretlenen ve geçmeden PR'ın merge edilemeyeceği check.", "A check marked in branch protection: a PR cannot merge until it passes."),
  },
  branchProtection: {
    term: "Branch protection",
    def: l("Bir branch'e (genelde main) kurallar koyan ayar: zorunlu check'ler, review şartı, doğrudan push yasağı.", "Rules on a branch (usually main): required checks, required reviews, no direct pushes."),
  },
  flaky: {
    term: "Flaky test",
    def: l("Kod değişmeden bazen geçen, bazen kırılan test. Genelde zamanlamaya ya da sıraya bağlıdır.", "A test that sometimes passes and sometimes fails with no code change. Usually it depends on timing or order."),
  },
  matrix: {
    term: "Matrix",
    def: l("Aynı job'ı farklı değerlerle (Node sürümleri, işletim sistemleri) birkaç kopya halinde çalıştırmak.", "Running the same job several times with different values (Node versions, operating systems)."),
  },
  cache: {
    term: "Cache",
    def: l("`actions/cache`: bir klasörü (ör. `~/.npm`) bir anahtarla saklar, sonraki run'larda geri yükler. Anahtar genelde lockfile'ın hash'idir.", "`actions/cache`: stores a folder (e.g. `~/.npm`) under a key and restores it in later runs. The key is usually the lockfile's hash."),
  },
  artifact: {
    term: "Artifact",
    def: l("Bir run'ın ürettiği ve saklanan dosyalar (ör. `dist/`). Aynı run'daki başka bir job indirebilir ya da sen arayüzden indirebilirsin.", "Files a run produces and keeps (e.g. `dist/`). Another job in the same run can download them, and so can you from the UI."),
  },
  pathFilter: {
    term: "Path filter",
    def: l("`paths` / `paths-ignore`: workflow'u sadece belirli dosyalar değişince çalıştırır.", "`paths` / `paths-ignore`: run the workflow only when certain files change."),
  },
  compositeAction: {
    term: "Composite action",
    def: l("Birkaç step'i tek bir `action.yml` dosyasında toplayıp `uses:` ile tek adım gibi çağırmak.", "Bundling several steps into one `action.yml` and calling them with `uses:` as a single step."),
  },
  reusableWorkflow: {
    term: "Reusable workflow",
    def: l("`on: workflow_call` olan ve başka workflow'ların job olarak çağırdığı workflow. `inputs` ve `secrets` alır.", "A workflow with `on: workflow_call` that other workflows call as a job. It takes `inputs` and `secrets`."),
  },
  concurrency: {
    term: "Concurrency",
    def: l("Aynı gruptaki run'lardan sadece birinin çalışmasını sağlar; `cancel-in-progress: true` eskiyi iptal eder.", "Lets only one run in a group go at a time; `cancel-in-progress: true` cancels the older one."),
  },
  secret: {
    term: "Secret",
    def: l("Şifreli saklanan ayar (token, şifre). Workflow'a `${{ secrets.AD }}` ile gelir, loglarda `***` olarak maskelenir.", "An encrypted setting (token, password). It reaches the workflow as `${{ secrets.NAME }}` and is masked as `***` in logs."),
  },
  githubToken: {
    term: "GITHUB_TOKEN",
    def: l("Her run için GitHub'ın otomatik ürettiği, run bitince geçersiz olan token. Yetkileri `permissions:` ile ayarlanır.", "A token GitHub creates for every run and revokes when it ends. Its rights are set with `permissions:`."),
  },
  environment: {
    term: "Environment",
    def: l("GitHub'da bir deploy hedefi (staging, production). Kendi secret'ları, onaylayıcıları ve deploy geçmişi olur.", "A deploy target in GitHub (staging, production), with its own secrets, reviewers and deploy history."),
  },
  rollback: {
    term: "Rollback",
    def: l("Bir önceki, çalıştığı bilinen sürümü yeniden deploy etmek.", "Deploying the previous known-good version again."),
  },
  smokeTest: {
    term: "Smoke test",
    def: l("Deploy'dan hemen sonra yapılan kısa kontrol: uygulama ayakta mı, ana sayfa ve health endpoint'i cevap veriyor mu?", "A quick check right after a deploy: is the app up, do the home page and the health endpoint answer?"),
  },
  semver: {
    term: "SemVer",
    def: l("`MAJOR.MINOR.PATCH` sürüm numarası: geriye uyumsuz değişiklik major'ı, yeni özellik minor'ı, düzeltme patch'i artırır.", "`MAJOR.MINOR.PATCH` versions: a breaking change bumps major, a feature bumps minor, a fix bumps patch."),
  },
  canary: {
    term: "Canary",
    def: l("Yeni sürümü önce trafiğin küçük bir kısmına açıp, sorun yoksa yavaş yavaş artırmak.", "Sending a small share of traffic to the new version first, and raising it slowly if nothing goes wrong."),
  },
  blueGreen: {
    term: "Blue-green",
    def: l("İki tam ortam: biri canlı (blue), yeni sürüm diğerine (green) kurulur, trafik tek hamlede çevrilir.", "Two full environments: one is live (blue), the new version goes on the other (green), and traffic switches in one move."),
  },
  rolling: {
    term: "Rolling deploy",
    def: l("Sunucuları birer birer yeni sürüme geçirmek; her an bir kısmı eski, bir kısmı yeni sürümü çalıştırır.", "Moving servers to the new version one at a time; at any moment some run old and some run new."),
  },
};
