import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { workflowYaml } from "../../engine/yaml";
import { scenarios } from "./scenarios";
import { relWf, scene } from "./Scene";

export const secrets: Lesson = {
  slug: "secrets",
  title: l("Secret'lar", "Secrets"),
  summary: l(
    "Token'lar ve şifreler YAML'a değil, repo ayarlarındaki secret'lara girer ve workflow'a `${{ secrets.AD }}` ile gelir. Loglarda `***` olarak maskelenir, fork'tan gelen PR'lara hiç verilmez.",
    "Tokens and passwords go into repo secrets, not the YAML, and reach the workflow as `${{ secrets.NAME }}`. Logs mask them as `***`, and PRs from forks never get them.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir token'ın neden YAML'a yazılmayacağını görmek", "See why a token never goes in the YAML"), step: 0 },
    { text: l("Secret eklemek ve `${{ secrets.AD }}` ile kullanmak", "Add a secret and use it with `${{ secrets.NAME }}`"), step: 2 },
    { text: l("Fork PR'larında secret olmadığını ve nedenini bilmek", "Know that fork PRs get no secrets, and why"), step: 3 },
    { text: l("Secret isteyen adımı sadece güvenilen olaylarda çalıştırmak", "Run the step that needs a secret only on trusted events"), step: 4 },
  ],
  steps: [
    {
      short: l("Dosyadaki token", "Token in the file"),
      tag: "problem",
      title: l("Token'ı dosyaya yazmak", "Writing the token in the file"),
      body: [
        l(
          "Paketi npm'e yayınlamak için bir token gerekiyor. En kolay yol onu workflow dosyasına yapıştırmak gibi görünür. Ama bu dosya reponun bir parçası: repoyu okuyabilen herkes, fork'layan herkes ve git geçmişini açan herkes token'ı görür.",
          "Publishing the package to npm needs a token. The easiest way looks like pasting it into the workflow file. But that file is part of the repo: anyone who can read it, fork it or open its git history sees the token.",
        ),
        l(
          "Satırı sonradan silmek de yetmez: token geçmişte duruyor. Sızan bir token'ı tek çare **iptal edip yenisini üretmek**.",
          "Deleting the line later is not enough: the token is still in the history. The only cure for a leaked token is to **revoke it and create a new one**.",
        ),
      ],
    },
    {
      short: l("Eksik secret", "Missing secret"),
      tag: "how",
      predict: {
        question: l(
          "Dosyaya `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` yazdık ama repo ayarlarına `NPM_TOKEN` diye bir secret eklemeyi unuttuk. Ne olur?",
          "We wrote `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` in the file but forgot to add a secret called `NPM_TOKEN` in the repo settings. What happens?",
        ),
        options: [
          l("Workflow hiç başlamaz", "The workflow does not start"),
          l("İfade boş metin olur ve `npm publish` kimlik doğrulayamadan kırılır", "The expression becomes an empty string and `npm publish` fails without auth"),
          l("GitHub bir token uydurur", "GitHub makes up a token"),
        ],
        answer: 1,
        why: l(
          "Tanımsız bir secret hata vermez, boş metin olur. Kırılma, onu kullanan adımda olur: burada `ENEEDAUTH`.",
          "An undefined secret raises no error; it becomes an empty string. The failure happens in the step that uses it: here, `ENEEDAUTH`.",
        ),
      },
      title: l("Secret yoksa boş metin", "No secret means an empty string"),
      body: [
        l(
          "[[secret|Secret]]'lar reponun **Settings → Secrets and variables → Actions** sayfasında şifreli saklanır; dosyada sadece adları geçer. Run'da `test` geçti, `publish` job'ındaki `npm publish` ise `ENEEDAUTH` ile kırıldı.",
          "[[secret|Secrets]] are stored encrypted on the repo's **Settings → Secrets and variables → Actions** page; the file only mentions their names. In the run `test` passed, while `npm publish` in the `publish` job failed with `ENEEDAUTH`.",
        ),
      ],
    },
    {
      short: l("Secret ekle", "Add the secret"),
      tag: "how",
      predict: {
        question: l(
          "Secret'ı ekledik. Workflow'da token'ı `echo \"token: $NPM_TOKEN\"` ile loga yazdıran bir adım da var. Logda ne görünür?",
          "We added the secret. The workflow also has a step that prints the token with `echo \"token: $NPM_TOKEN\"`. What shows in the log?",
        ),
        options: [l("Token'ın kendisi", "The token itself"), l("`token: ***`", "`token: ***`"), l("Adım kırılır", "The step fails")],
        answer: 1,
        why: l(
          "GitHub, secret'ların değerini loglarda görürse `***` ile değiştirir. Yine de bunu bir güvence değil, son savunma hattı say.",
          "When GitHub sees a secret's value in a log it replaces it with `***`. Still, treat that as a last line of defence, not a guarantee.",
        ),
      },
      title: l("Yayınlandı, token gizli", "Published, token hidden"),
      body: [
        l(
          "`NPM_TOKEN`'ı repo ayarlarına ekledik ve tekrar push'ladık. `publish` job'ı geçti ve paket yayınlandı. Sağ alttaki logda token yerine `***` yazıyor.",
          "We added `NPM_TOKEN` in the repo settings and pushed again. The `publish` job passed and the package went out. The log at the bottom right shows `***` instead of the token.",
        ),
        l(
          "Secret'ı ortam değişkeni olarak sadece ona ihtiyacı olan adıma ver (`env:` adımın altında), bütün job'a değil.",
          "Give the secret as an environment variable only to the step that needs it (`env:` under that step), not to the whole job.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "gh secret set NPM_TOKEN", note: l("Değeri terminal sorar; komut geçmişine yazılmaz.", "The terminal prompts for the value; it does not land in your shell history.") },
          { cmd: "gh secret list", note: l("Secret'ların adları ve tarihleri; değerleri asla gösterilmez.", "Secret names and dates; values are never shown.") },
        ],
        snippets: [{ label: ".github/workflows/release.yml", code: workflowYaml(relWf(false)) }],
      },
    },
    {
      short: l("Fork PR", "Fork PR"),
      tag: "experiment",
      predict: {
        question: l(
          "Repoyu fork'layan biri PR açtı. Aynı workflow PR'da çalışıyor. `publish` job'ı `NPM_TOKEN`'ı alır mı?",
          "Someone who forked the repo opened a PR. The same workflow runs on the PR. Does the `publish` job get `NPM_TOKEN`?",
        ),
        options: [l("Evet, aynı repo", "Yes, same repo"), l("Hayır: fork PR'larına secret verilmez", "No: fork PRs get no secrets"), l("Sadece maskeli hali", "Only the masked value")],
        answer: 1,
        why: l(
          "Fork'taki kodu herkes yazabilir. Secret verilseydi, PR'a `curl` ile token'ı dışarı gönderen bir satır eklemek yeterdi.",
          "Anyone can write the code in a fork. If it got secrets, one line in the PR sending the token out with `curl` would be enough.",
        ),
      },
      title: l("Fork'a secret yok", "No secrets for forks"),
      body: [
        l(
          "Fork'tan gelen PR'ın run'ında `test` geçti, `publish` ise token boş olduğu için kırıldı ve PR kırmızı göründü. Katkı yapan kişi kodunda bir sorun olmadığı halde kırmızı bir PR görüyor.",
          "In the fork's PR run `test` passed, while `publish` failed because the token was empty, and the PR shows red. The contributor sees a red PR though nothing is wrong with their code.",
        ),
      ],
    },
    {
      short: l("Sadece push'ta", "Only on push"),
      tag: "how",
      title: l("Secret isteyen job sadece güvenilen olayda", "The job that needs a secret runs only on trusted events"),
      body: [
        l(
          "`publish` job'ına `if: github.event_name == 'push'` ekledik. Fork PR'ına yeni bir push geldi: `test` çalıştı, `publish` atlandı ve PR yeşile döndü. main'e push'larda yayınlama aynen devam ediyor.",
          "We added `if: github.event_name == 'push'` to the `publish` job. A new push came to the fork's PR: `test` ran, `publish` was skipped, and the PR turned green. Pushes to main still publish as before.",
        ),
        l(
          "Kural basit: PR'larda test et, secret gerektiren işleri (yayınlama, deploy) sadece main'e push'ta ya da elle tetiklemede yap.",
          "The rule is simple: test on PRs, and do the work that needs secrets (publishing, deploying) only on pushes to main or manual runs.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/release.yml", code: workflowYaml(relWf(true)) }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Maskeleme kusursuz değil:** secret'ı base64'e çevirir ya da harflerini bölersen değişmiş hali maskelenmez. Secret'ı asla loga yazdırma. Docker image'ına da gömme (`ARG`, `ENV`, kopyalanan `.env`): image'ı çeken herkes okur.",
          "**Masking is not perfect:** base64-encode a secret or split its letters and the changed value is not masked. Never print secrets. Do not bake them into a Docker image either (`ARG`, `ENV`, a copied `.env`): anyone who pulls the image can read them.",
        ),
        l(
          "**Daha iyisi:** prod'a erişen secret'ları environment secret'ı yap (onaydan sonra verilir), ve bulut sağlayıcılar için uzun ömürlü anahtar yerine OIDC kullan: her run kısa ömürlü bir kimlik alır.",
          "**Better still:** make secrets that reach prod environment secrets (handed out only after approval), and use OIDC instead of long-lived keys for cloud providers: each run gets a short-lived identity.",
        ),
        l(
          "**`pull_request_target`** fork PR'larına secret veren bir tetikleyicidir; içinde PR'ın kodunu checkout edip çalıştırmak klasik bir güvenlik açığıdır. Ne yaptığından emin değilsen kullanma.",
          "**`pull_request_target`** is a trigger that does give fork PRs secrets; checking out and running the PR's code inside it is a classic security hole. Do not use it unless you are sure.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede yayınlama sadece token'ın olup olmadığına bakıyor; gerçek bir npm hesabı, sürüm numarası kontrolü ya da 2FA yok. Maskeleme de sadece token'ın tam değerini arıyor, tıpkı GitHub gibi.",
            "On this stage publishing only checks whether the token exists; there is no real npm account, version check or 2FA. Masking only looks for the token's exact value, just as GitHub does.",
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
          "Aşağıda gerçek işten **4 senaryo** var: ilk sürüm token'sız düşmüş, token dosyaya yazılıp sızmış, fork'tan gelen PR kırmızı, ekibin secret'ı başka bir adla duruyor. Komutları terminale **kendin yaz**: `gh secret set`, `gh secret list`, `nano`, `git commit -am`, `git push`, `gh run rerun`.",
          "Below are **4 scenarios** from real work: the first release failed without a token, a token was written into the file and leaked, a fork's PR is red, the team's secret has another name. **Type the commands yourself**: `gh secret set`, `gh secret list`, `nano`, `git commit -am`, `git push`, `gh run rerun`.",
        ),
        l(
          "`gh secret set NAME` değeri sorar; burada küçük bir editör o sorunun yerini tutar. Token'ı hiçbir dosyaya yazma: dosyaya giren her şey git geçmişinde kalır. Az komutla bitirirsen 3 yıldız.",
          "`gh secret set NAME` asks for the value; here a small editor stands in for that prompt. Never write a token into a file: anything in a file stays in the git history. Finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Token ve şifreler YAML'a değil, repo secret'larına girer; dosyada sadece `${{ secrets.AD }}` geçer.", "Tokens and passwords go into repo secrets, not the YAML; the file only says `${{ secrets.NAME }}`."),
    l("Tanımsız bir secret boş metin olur; hata, onu kullanan adımda çıkar.", "An undefined secret is an empty string; the error shows up in the step that uses it."),
    l("Loglarda secret değerleri `***` ile maskelenir, ama değiştirilmiş halleri maskelenmez.", "Logs mask secret values as `***`, but not transformed versions of them."),
    l("Fork PR'larına secret verilmez; secret isteyen job'ları sadece push ya da elle tetiklemede çalıştır.", "Fork PRs get no secrets; run jobs that need them only on push or manual runs."),
    l("Sızan bir secret'ı silmek yetmez: iptal et ve yenisini üret.", "Deleting a leaked secret is not enough: revoke it and create a new one."),
  ],
  quiz: [
    {
      question: l("Bir workflow'a npm token'ını vermenin doğru yolu hangisi?", "What is the right way to give a workflow an npm token?"),
      options: [
        l("YAML'a doğrudan yazmak", "Writing it straight into the YAML"),
        l("Repo secret'ı olarak eklemek ve `${{ secrets.NPM_TOKEN }}` ile okumak", "Adding it as a repo secret and reading it with `${{ secrets.NPM_TOKEN }}`"),
        l("Docker image'ına gömmek", "Baking it into a Docker image"),
        l("Commit mesajına yazmak", "Putting it in a commit message"),
      ],
      answer: 1,
      explain: l("Secret'lar şifreli saklanır ve sadece run sırasında verilir.", "Secrets are stored encrypted and handed out only during a run."),
      reviewStep: 2,
    },
    {
      question: l("Tanımlanmamış bir secret'ı `${{ secrets.YOK }}` ile okursan ne olur?", "What happens if you read an undefined secret with `${{ secrets.MISSING }}`?"),
      options: [l("Workflow başlamaz", "The workflow does not start"), l("Boş metin döner", "It returns an empty string"), l("Run iptal olur", "The run is cancelled"), l("GitHub sorar", "GitHub asks for it")],
      answer: 1,
      explain: l("Hata, boş değeri kullanan adımda ortaya çıkar.", "The error appears in the step that uses the empty value."),
      reviewStep: 1,
    },
    {
      question: l("Fork'tan gelen bir PR'ın run'ı neden secret alamaz?", "Why does a run for a PR from a fork get no secrets?"),
      options: [
        l("GitHub'da bir hata var", "It is a GitHub bug"),
        l("Fork'taki kodu herkes yazabilir; secret alsaydı onu dışarı sızdırabilirdi", "Anyone can write a fork's code; with secrets it could send them out"),
        l("Fork'lar ücretsiz runner kullanamaz", "Forks cannot use free runners"),
        l("Secret'lar sadece main'de vardır", "Secrets exist only on main"),
      ],
      answer: 1,
      explain: l("Güvenilmeyen koda secret verilmez; bu yüzden secret isteyen işleri push'a bırakırız.", "Untrusted code gets no secrets; that is why work needing them is left to push events."),
      reviewStep: 3,
    },
    {
      question: l("Bir token yanlışlıkla repoya commit'lendi. İlk ne yapmalısın?", "A token was committed to the repo by mistake. What should you do first?"),
      options: [l("Satırı silip push'lamak", "Delete the line and push"), l("Token'ı iptal edip yenisini üretmek", "Revoke the token and create a new one"), l("Repoyu private yapmak", "Make the repo private"), l("Hiçbir şey, maskelenir", "Nothing, it gets masked")],
      answer: 1,
      explain: l("Token git geçmişinde kalır; tek güvenli yol onu geçersiz kılmak.", "The token stays in git history; the only safe move is to make it useless."),
      reviewStep: 0,
    },
  ],
};
