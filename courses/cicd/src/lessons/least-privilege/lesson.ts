import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { freshLp, GOOD_SHA, lpYaml } from "./model";
import { scene } from "./Scene";

const SAFE = lpYaml(freshLp({ perms: "per-job", pinned: true }), true);

const DEPENDABOT = `# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly`;

export const leastPrivilege: Lesson = {
  slug: "least-privilege",
  title: l("En az yetki", "Least privilege"),
  summary: l(
    "Her run bir `GITHUB_TOKEN` alır ve kullandığın her üçüncü parti action o token'ı görür. `permissions:` ile token'a sadece gereken yetkiyi ver ve action'ları taşınabilen etiketler yerine commit SHA'sına sabitle.",
    "Every run gets a `GITHUB_TOKEN`, and every third-party action you use can see it. Give the token only the rights it needs with `permissions:`, and pin actions to a commit SHA instead of tags that can move.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir etiketin (`@v1`) neden güvenilir bir sürüm olmadığını görmek", "See why a tag (`@v1`) is not a fixed version"), step: 1 },
    { text: l("Action'ları commit SHA'sına sabitlemek", "Pin actions to a commit SHA"), step: 2 },
    { text: l("`GITHUB_TOKEN` yetkilerini `permissions:` ile ayarlamak", "Set `GITHUB_TOKEN` rights with `permissions:`"), step: 3 },
    { text: l("Yetkiyi job başına vermek", "Grant rights per job"), step: 4 },
  ],
  steps: [
    {
      short: l("Token ve action", "Token and action"),
      tag: "how",
      title: l("Her run'ın bir anahtarı var", "Every run carries a key"),
      body: [
        l(
          "GitHub her run için bir [[githubToken|GITHUB_TOKEN]] üretir; run bitince geçersiz olur. Workflow onunla repoya push'layabilir, registry'ye image gönderebilir, PR'a yorum yazabilir: ne kadar yetki verdiysen o kadar.",
          "GitHub creates a [[githubToken|GITHUB_TOKEN]] for every run and revokes it when the run ends. With it the workflow can push to the repo, push images to the registry, comment on PRs: as much as you allowed.",
        ),
        l(
          "Workflow'umuz `permissions: write-all` ile her şeye yazabiliyor. `lint` job'ı başkasının yazdığı `acme/lint-action@v1`'i kullanıyor; `publish` job'ı image'ı GHCR'a gönderiyor. Push'ladık: her şey yolunda.",
          "Our workflow can write everything with `permissions: write-all`. The `lint` job uses someone else's `acme/lint-action@v1`; the `publish` job pushes the image to GHCR. We pushed: all good.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bir action, çalıştığı job'ın token'ına ve secret'larına erişebilir. Bir action'ı `uses:` ile çağırmak, o kodu kendi repona yazma yetkisiyle çalıştırmak demek.",
            "An action can reach the token and secrets of the job it runs in. Calling an action with `uses:` means running that code with your repo's rights.",
          ),
        },
      ],
    },
    {
      short: l("Taşınan etiket", "Moved tag"),
      tag: "experiment",
      predict: {
        question: l(
          "Saldırgan `acme/lint-action` reposuna girdi ve `v1` etiketini kendi kötü commit'ine taşıdı. Bizim workflow dosyamız hiç değişmedi. Bir sonraki push'ta ne olur?",
          "An attacker got into the `acme/lint-action` repo and moved the `v1` tag to their own bad commit. Our workflow file did not change at all. What happens on the next push?",
        ),
        options: [
          l("Hiçbir şey, dosyamız aynı", "Nothing, our file is the same"),
          l("Kötü kod çalışır ve token'ımızla repoya ve registry'ye yazar", "The bad code runs and writes to our repo and registry with our token"),
          l("GitHub değişikliği engeller", "GitHub blocks the change"),
        ],
        answer: 1,
        why: l(
          "Git etiketleri birer işarettir, istenince başka commit'e taşınabilir. `@v1` her run'da \"v1 şu an neyi gösteriyorsa\" demek.",
          "Git tags are just pointers and can be moved to another commit. `@v1` means \"whatever v1 points at right now\" on every run.",
        ),
      },
      title: l("Dosya aynı, çalışan kod farklı", "Same file, different code"),
      body: [
        l(
          "Run #2'de `lint` adımı saldırganın kodunu çalıştırdı. Token her şeye yazabildiği için main'e kötü bir commit push'ladı ve registry'ye kötü bir image gönderdi. Bizim tarafta tek satır değişmedi.",
          "In run #2 the `lint` step ran the attacker's code. Because the token could write everything, it pushed a bad commit to main and a bad image to the registry. Not a single line changed on our side.",
        ),
        l(
          "Bu bir kurgu değil: popüler action'ların etiketlerinin kötü koda taşındığı gerçek saldırılar oldu ve binlerce reponun secret'ları loglara döküldü.",
          "This is not made up: there have been real attacks where popular actions' tags were moved to bad code, and thousands of repos' secrets ended up in logs.",
        ),
      ],
    },
    {
      short: l("SHA'ya sabitle", "Pin to a SHA"),
      tag: "how",
      title: l("Taşınamayan bir referans: commit SHA'sı", "A reference that cannot move: the commit SHA"),
      body: [
        l(
          "Kötü commit'i geri aldık ve token'ları yeniledik. Sonra action'ı etiket yerine bilinen iyi commit'in tam SHA'sına sabitledik: `acme/lint-action@a1b2c3d4…`. Yanına hangi sürüm olduğunu yorum olarak yazdık.",
          "We reverted the bad commit and rotated tokens. Then we pinned the action to the full SHA of the known-good commit instead of the tag: `acme/lint-action@a1b2c3d4…`, with the version written next to it as a comment.",
        ),
        l(
          "Etiket hâlâ kötü kodu gösteriyor, ama run #3 bilinen kodu çalıştırdı. Bir SHA tek bir içeriğin parmak izi: başka bir commit'e taşınamaz.",
          "The tag still points at the bad code, but run #3 ran the known code. A SHA is the fingerprint of one exact content: it cannot be moved to another commit.",
        ),
      ],
      practice: {
        commands: [{ cmd: "git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2", note: l("Bir etiketin şu an gösterdiği SHA. Sabitlemeden önce sürüm notlarıyla karşılaştır.", "The SHA a tag points at right now. Compare with the release notes before pinning.") }],
        snippets: [{ label: "step", code: `- uses: acme/lint-action@${GOOD_SHA} # v1.4.2` }],
      },
    },
    {
      short: l("Hepsi salt okunur", "All read-only"),
      tag: "experiment",
      predict: {
        question: l("Daha da güvenli olsun diye bütün workflow'u `permissions: read-all` yaptık. Bir sonraki run'da ne olur?", "To be even safer we set the whole workflow to `permissions: read-all`. What happens on the next run?"),
        options: [l("Her şey çalışır", "Everything works"), l("`publish` image'ı gönderemez: `packages: write` yok", "`publish` cannot push the image: no `packages: write`"), l("Workflow başlamaz", "The workflow does not start")],
        answer: 1,
        why: l("Image göndermek bir yazma işlemi. Token'ın gerçekten yazması gereken job'lar da var.", "Pushing an image is a write. Some jobs really do need to write."),
      },
      title: l("Fazla sıkı da olmaz", "Too tight does not work either"),
      body: [
        l(
          "`lint` geçti ama `publish` 403 aldı: token'ın `packages` yetkisi sadece okuma. En az yetki \"hiç yetki\" demek değil, \"her job'a ihtiyacı kadarı\" demek.",
          "`lint` passed but `publish` got a 403: the token can only read `packages`. Least privilege does not mean \"no rights\"; it means \"each job gets what it needs\".",
        ),
      ],
    },
    {
      short: l("Job başına", "Per job"),
      tag: "how",
      title: l("Varsayılan okuma, yazma sadece gereken job'da", "Read by default, write only where needed"),
      body: [
        l(
          "Workflow'un en üstüne `permissions: contents: read` yazdık, `publish` job'ına da kendi `permissions:` bloğunu verdik: `packages: write`. Run #5 yeşil: image gönderildi.",
          "We put `permissions: contents: read` at the top of the workflow and gave the `publish` job its own `permissions:` block with `packages: write`. Run #5 is green: the image went out.",
        ),
        l(
          "Sonra bir şeyi denedik: SHA sabitlemesini kaldırıp etiket kullandık, yani kötü kod yine çalıştı. Ama `lint` job'ının token'ı sadece okuyabildiği için main'e ve registry'ye yazma denemeleri 403 ile döndü. İki kilitten biri açılsa bile diğeri tuttu.",
          "Then we tried something: we removed the pin and went back to the tag, so the bad code ran again. But the `lint` job's token could only read, so its attempts to write to main and the registry got a 403. Even with one lock open, the other held.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: ".github/workflows/ci.yml", code: SAFE }] },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Gerçek projede", "In a real project"),
      body: [
        l(
          "**Varsayılanı düşür:** repo ya da organizasyon ayarlarında (Settings → Actions → General → Workflow permissions) token'ın varsayılanını \"Read repository contents\" yap. Eski repolarda varsayılan hâlâ yazma olabilir.",
          "**Lower the default:** in repo or org settings (Settings → Actions → General → Workflow permissions) set the token's default to \"Read repository contents\". Older repos may still default to write.",
        ),
        l(
          "**Sabitlenmiş SHA'ları güncel tut:** Dependabot `github-actions` ekosistemini takip eder ve yeni sürüm çıkınca SHA'yı güncelleyen bir PR açar. Yanındaki `# v1.4.2` yorumu da güncellenir. GitHub'ın kendi `actions/*` action'ları için etiket kullanmak daha az riskli, ama kural koymak istersen hepsini sabitle.",
          "**Keep pinned SHAs fresh:** Dependabot watches the `github-actions` ecosystem and opens a PR updating the SHA when a new version ships, `# v1.4.2` comment included. Tags are less risky for GitHub's own `actions/*`, but if you want one rule, pin them all.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahne bir saldırıyı iki denemeye indiriyor: main'e push ve registry'ye push. Gerçek kötü kod secret'ları dışarı göndermeyi, cache'i zehirlemeyi ya da başka yolları da dener; token yetkisini düşürmek bunların bir kısmını durdurur, secret'ları korumak için ayrıca onları sadece gereken adıma vermek gerekir.",
            "This scene boils an attack down to two attempts: a push to main and a push to the registry. Real bad code also tries to send secrets out, poison the cache and more; lowering token rights stops some of that, and protecting secrets also means giving them only to the step that needs them.",
          ),
        },
      ],
      practice: { commands: [], snippets: [{ label: ".github/dependabot.yml", code: DEPENDABOT }] },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Henüz kimse fark etmedi ama `acme/lint-action`'ın `v1` etiketi zaten kötü koda taşındı. Workflow `write-all` ile ve `@v1` etiketiyle duruyor. İzinleri değiştirebilir, action'ı SHA'ya sabitleyebilir ve push'layabilirsin.",
          "Nobody has noticed yet, but `acme/lint-action`'s `v1` tag has already been moved to bad code. The workflow has `write-all` and uses the `@v1` tag. You can change the permissions, pin the action to a SHA, and push.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Her run bir `GITHUB_TOKEN` alır; job'daki her action onu görebilir.", "Every run gets a `GITHUB_TOKEN`; every action in the job can see it."),
    l("`@v1` gibi etiketler taşınabilir; commit SHA'sı taşınamaz. Üçüncü parti action'ları SHA'ya sabitle, sürümü yorum olarak yaz.", "Tags like `@v1` can move; a commit SHA cannot. Pin third-party actions to a SHA and write the version as a comment."),
    l("Workflow'un tepesinde `permissions: contents: read`, yazması gereken job'da kendi `permissions:` bloğu.", "`permissions: contents: read` at the top of the workflow, and its own `permissions:` block on the job that must write."),
    l("Her şeyi salt okunur yapmak, yazması gereken job'ları kırar.", "Making everything read-only breaks the jobs that must write."),
    l("İki kilit birlikte: sabitleme kötü kodu durdurur, az yetki kötü kod çalışsa bile zararı sınırlar.", "Two locks together: pinning stops bad code, least privilege limits the damage if bad code runs anyway."),
  ],
  quiz: [
    {
      question: l("`uses: acme/lint-action@v1` her run'da hangi kodu çalıştırır?", "Which code does `uses: acme/lint-action@v1` run on each run?"),
      options: [
        l("İlk eklediğin gündeki kodu", "The code from the day you added it"),
        l("`v1` etiketinin o an gösterdiği commit'i", "Whatever commit the `v1` tag points at right then"),
        l("Her zaman en son commit'i", "Always the latest commit"),
        l("GitHub'ın onayladığı bir kopyayı", "A copy GitHub has approved"),
      ],
      answer: 1,
      explain: l("Etiketler taşınabilir; değişmeyen tek referans tam commit SHA'sı.", "Tags can move; the only fixed reference is the full commit SHA."),
      reviewStep: 1,
    },
    {
      question: l("Bir action'ı nasıl sabitlersin?", "How do you pin an action?"),
      options: [
        l("`@latest` yazarak", "Writing `@latest`"),
        l("Tam commit SHA'sını yazarak, sürümü yorum olarak ekleyerek", "Writing the full commit SHA, with the version as a comment"),
        l("`@main` yazarak", "Writing `@main`"),
        l("Repo ayarlarından", "In repo settings"),
      ],
      answer: 1,
      explain: l("`@<40 karakterlik SHA> # v1.4.2`: içerik değişmez, okuyan da hangi sürüm olduğunu görür.", "`@<40-char SHA> # v1.4.2`: the content cannot change and readers still see the version."),
      reviewStep: 2,
    },
    {
      question: l("Bütün workflow'u `permissions: read-all` yaptın ve image push'u 403 aldı. Doğru düzeltme?", "You set the whole workflow to `permissions: read-all` and the image push got a 403. The right fix?"),
      options: [
        l("`write-all`'a dönmek", "Go back to `write-all`"),
        l("Sadece publish job'ına `packages: write` vermek", "Give only the publish job `packages: write`"),
        l("Kişisel bir token kullanmak", "Use a personal token"),
        l("Push'u kaldırmak", "Drop the push"),
      ],
      answer: 1,
      explain: l("Yazma yetkisi sadece yazması gereken job'a, sadece gereken kapsamda.", "Write access only for the job that must write, only for the scope it needs."),
      reviewStep: 4,
    },
    {
      question: l("Action SHA'ya sabitli değil ve kötü koda taşınmış. Job'ın token'ı salt okunursa ne olur?", "The action is not pinned and was moved to bad code. What happens if the job's token is read-only?"),
      options: [
        l("Kötü kod repoya yazar", "The bad code writes to the repo"),
        l("Kötü kod çalışır ama yazma denemeleri 403 alır", "The bad code runs but its write attempts get a 403"),
        l("Kötü kod hiç çalışmaz", "The bad code never runs"),
        l("Run iptal olur", "The run is cancelled"),
      ],
      answer: 1,
      explain: l("Az yetki kötü kodu durdurmaz ama elindeki anahtarı zayıflatır.", "Least privilege does not stop bad code, but it weakens the key it holds."),
      reviewStep: 4,
    },
  ],
};
