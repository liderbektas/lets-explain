import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const DOCKERFILE = `FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./

FROM base AS prod
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "server.js"]

FROM base AS dev
RUN npm install
CMD ["npm", "run", "dev"]`;

const COMPOSE = `# compose.yaml: what dev and prod share
services:
  app:
    build:
      context: .
    environment:
      NODE_ENV: \${NODE_ENV:-development}`;

const OVERRIDE = `# compose.override.yaml: read automatically by "docker compose up"
services:
  app:
    build:
      target: dev
    ports:
      - "3000:3000"
    volumes:
      - ./:/app
      - /app/node_modules`;

const PROD = `# compose.prod.yaml: used only when you name it
services:
  app:
    image: ghcr.io/ada/shop:\${TAG}
    build:
      target: prod
    environment:
      NODE_ENV: production
    ports:
      - "8080:3000"
    restart: unless-stopped`;

const WORKFLOW = `# .github/workflows/build-image.yml
name: build-image
on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: prod
          push: true
          tags: |
            ghcr.io/\${{ github.repository }}:sha-\${{ github.sha }}
            ghcr.io/\${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max`;

export const devProdAndCi: Lesson = {
  slug: "dev-prod-and-ci",
  title: l("Dev, prod ve CI/CD", "Dev, prod and CI/CD"),
  summary: l(
    "Geliştirirken kodu bind mount ile anında gör, yayına hazır bir image ile çık, ve her commit'te image'ı GitHub Actions'ta otomatik build edip registry'ye gönder.",
    "See code changes at once with a bind mount while developing, ship a ready-built image, and have GitHub Actions build and push an image on every commit.",
  ),
  minutes: 18,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Dev'de bind mount ile build yapmadan değişikliği görmek", "See changes in dev through a bind mount, with no build"), step: 2 },
    { text: l("Aynı Dockerfile'dan `--target` ile dev ve prod image'ı çıkarmak", "Get dev and prod images from one Dockerfile with `--target`"), step: 3 },
    { text: l("Compose'u dev ve prod için ayrı dosyalarla ayarlamak", "Set Compose up for dev and prod with separate files"), step: 5 },
    { text: l("GitHub Actions ile her commit'te image build edip GHCR'a göndermek", "Build and push an image to GHCR on every commit with GitHub Actions"), step: 7 },
  ],
  steps: [
    {
      short: l("İki ihtiyaç", "Two needs"),
      tag: "problem",
      title: l("Geliştirirken başka, yayında başka", "One thing while developing, another in production"),
      body: [
        l(
          "Geliştirirken her değişiklikte image build edip container'ı yeniden başlatmak yavaş ve sıkıcı. Kodu kaydedince anında görmek istersin.",
          "While developing, building an image and restarting the container on every change is slow and dull. You want to see the code the moment you save it.",
        ),
        l(
          "Yayında ise tam tersi: herkesin aynı, değişmeyen, küçük bir image çalıştırmasını istersin. İçinde geliştirme araçları olmasın, kod da dışarıdan değiştirilemesin.",
          "In production it is the opposite: everyone should run the same small image that never changes. No dev tools inside, and no way to change the code from outside.",
        ),
        l(
          "Bu derste ikisini aynı projeden çıkaracağız, sonra image'ı her commit'te otomatik üreteceğiz.",
          "In this lesson we get both from the same project, then have the image built automatically on every commit.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose version", note: l("Compose v2 (`docker compose`, tiresiz) kurulu mu?", "Is Compose v2 (`docker compose`, no dash) installed?") }],
      },
    },
    {
      short: l("Dev ortamı", "Dev setup"),
      tag: "how",
      title: l("Dev: kodu container'a bind mount ile aç", "Dev: open your code in the container with a bind mount"),
      body: [
        l(
          "Dockerfile'ı aşamalara böldük: ortak bir `base`, yayın için `prod`, geliştirme için `dev`. `docker build --target dev` sadece dev aşamasına kadar olanları kurdu.",
          "We split the Dockerfile into stages: a shared `base`, `prod` for shipping, `dev` for developing. `docker build --target dev` built only up to the dev stage.",
        ),
        l(
          "Sonra Compose ile başlattık ve proje klasörünü `./:/app` ile container'ın içine bağladık: bir [[bindMount]]. Container artık kodu image'dan değil, doğrudan senin klasöründen okuyor.",
          "Then we started it with Compose and attached the project folder with `./:/app`: a [[bindMount]]. The container now reads the code straight from your folder, not from the image.",
        ),
      ],
      practice: {
        snippets: [{ label: "Dockerfile", code: DOCKERFILE, note: l("Aşamalar `FROM ... AS ad` ile. Hangisine kadar build edileceğini `--target` seçer.", "Stages are named with `FROM ... AS name`. `--target` picks where the build stops.") }],
        commands: [
          { cmd: "docker build --target dev -t shop:dev ." },
          { cmd: "docker compose up -d", note: l("`compose.override.yaml` varsa otomatik okunur (bir sonraki adımlarda).", "`compose.override.yaml` is read automatically if present (coming up).") },
        ],
      },
    },
    {
      short: l("Hot reload", "Hot reload"),
      tag: "experiment",
      predict: {
        question: l("`index.html`'i değiştirdin. Dev container'da (`localhost:3000`) yeni hali görmek için ne gerekir?", "You changed `index.html`. What does the dev container (`localhost:3000`) need before it shows the new version?"),
        options: [l("Yeniden `docker build`", "A new `docker build`"), l("`docker restart`", "A `docker restart`"), l("Hiçbir şey: dosya zaten container'da", "Nothing: the file is already in the container")],
        answer: 2,
        why: l(
          "Bind mount, container'ın `/app`'i ile senin klasörünü aynı yapar. Dosyayı kaydettiğin an container da yeni halini görür.",
          "A bind mount makes the container's `/app` the same as your folder. The moment you save, the container sees the new file.",
        ),
      },
      title: l("Kaydet, yenile, gör", "Save, reload, see"),
      body: [
        l(
          "`index.html`'i v2 yaptık ve hiçbir Docker komutu çalıştırmadan `curl localhost:3000` yeni hali getirdi. Gerçek projelerde `nodemon`, `vite` ya da `flask --reload` gibi araçlar sunucuyu da otomatik yeniden başlatır.",
          "We made `index.html` v2 and, without any Docker command, `curl localhost:3000` returned it. In real projects tools like `nodemon`, `vite` or `flask --reload` also restart the server for you.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Klasörü `/app`'e bağlamak image'daki `node_modules`'ı da örter. Bu yüzden Compose'a ikinci bir satır eklenir: `- /app/node_modules`. Container'ın kendi kurduğu bağımlılıklar anonim bir volume'da kalır.",
            "Mounting the folder on `/app` also hides the image's `node_modules`. That is why a second line goes into Compose: `- /app/node_modules`. The container's own installed dependencies stay in an anonymous volume.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "curl localhost:3000", note: l("Kaydettikten hemen sonra dene.", "Try it right after saving.") }],
        snippets: [{ label: "compose.override.yaml", code: OVERRIDE }],
      },
    },
    {
      short: l("Prod image", "Prod image"),
      tag: "how",
      predict: {
        question: l("Şimdi `--target prod` ile build edeceğiz. Prod image dev image'dan büyük mü küçük mü olur?", "Now we build with `--target prod`. Will the prod image be bigger or smaller than the dev one?"),
        options: [l("Daha büyük: kodu da içinde taşıyor", "Bigger: it carries the code too"), l("Daha küçük: geliştirme bağımlılıkları yok", "Smaller: no dev dependencies"), l("Aynı", "The same")],
        answer: 1,
        why: l(
          "`npm ci --omit=dev` test araçları, derleyiciler gibi geliştirme paketlerini kurmaz. Kodu taşısa bile prod image daha hafiftir.",
          "`npm ci --omit=dev` skips dev packages such as test tools and compilers. Even with the code inside, the prod image is lighter.",
        ),
      },
      title: l("Prod: kod image'ın içinde", "Prod: the code lives inside the image"),
      body: [
        l(
          "`docker build --target prod -t shop:1.0 .` kodu image'ın içine kopyaladı, geliştirme paketlerini almadı ve `USER node`'a geçti. `-p 8080:3000` ile başlattık; `localhost:8080` v2 gösteriyor.",
          "`docker build --target prod -t shop:1.0 .` copied the code into the image, skipped the dev packages and switched to `USER node`. We started it with `-p 8080:3000`; `localhost:8080` shows v2.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker build --target prod -t shop:1.0 ." },
          { cmd: "docker run -d --name prod -p 8080:3000 shop:1.0" },
          { cmd: "docker images shop", note: l("dev ve prod image boyutlarını karşılaştır.", "Compare the dev and prod image sizes.") },
        ],
      },
    },
    {
      short: l("Donmuş image", "Frozen image"),
      tag: "experiment",
      predict: {
        question: l("Kodu v3 yaptık. `localhost:3000` (dev) ve `localhost:8080` (prod) ne gösterir?", "We changed the code to v3. What do `localhost:3000` (dev) and `localhost:8080` (prod) show?"),
        options: [l("İkisi de v3", "Both v3"), l("Dev v3, prod hâlâ v2", "Dev v3, prod still v2"), l("İkisi de v2", "Both v2")],
        answer: 1,
        why: l(
          "Dev kodu klasörden okur, prod ise build anındaki kopyayı taşır. Prod'u değiştirmenin tek yolu yeni bir image ve yeni bir container.",
          "Dev reads the code from your folder; prod carries the copy from build time. The only way to change prod is a new image and a new container.",
        ),
      },
      title: l("Prod değişmez, bu bir özellik", "Prod does not change, and that is a feature"),
      body: [
        l(
          "Dev v3'ü gösterdi, prod hâlâ v2. Prod'da ne çalıştığını tam olarak bilirsin: `shop:1.0` neyse o. Bir sunucuda dosyayı elle düzeltip unutmak gibi sürprizler olmaz.",
          "Dev showed v3; prod still shows v2. You know exactly what runs in prod: whatever `shop:1.0` is. No surprises like a file someone edited by hand on a server and forgot.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "curl localhost:3000", note: l("dev: v3", "dev: v3") },
          { cmd: "curl localhost:8080", note: l("prod: v2", "prod: v2") },
        ],
      },
    },
    {
      short: l("Compose dosyaları", "Compose files"),
      tag: "how",
      title: l("Ortak dosya + dev eki + prod eki", "A shared file, a dev layer, a prod layer"),
      body: [
        l(
          "Compose dosyaları üst üste konabilir. `compose.yaml` ortak kısmı tutar. `docker compose up` yanındaki `compose.override.yaml`'ı **otomatik** okur: dev ayarları (bind mount, `target: dev`, port 3000) oraya gider.",
          "Compose files stack. `compose.yaml` holds what is shared. `docker compose up` reads the `compose.override.yaml` next to it **automatically**, so dev settings (bind mount, `target: dev`, port 3000) go there.",
        ),
        l(
          "Prod için override'ı değil, adını verdiğin dosyayı kullanırsın: `docker compose -f compose.yaml -f compose.prod.yaml up -d`. Sonraki dosya öncekinin üstüne yazar.",
          "For prod you skip the override and name the file yourself: `docker compose -f compose.yaml -f compose.prod.yaml up -d`. Each later file layers over the earlier one.",
        ),
      ],
      practice: {
        snippets: [
          { label: "compose.yaml", code: COMPOSE },
          { label: "compose.prod.yaml", code: PROD, note: l("`${TAG}` ortam değişkeninden ya da `.env` dosyasından gelir.", "`${TAG}` comes from an environment variable or the `.env` file.") },
        ],
        commands: [
          { cmd: "docker compose up -d", note: l("dev: compose.yaml + compose.override.yaml", "dev: compose.yaml + compose.override.yaml") },
          { cmd: "docker compose -f compose.yaml -f compose.prod.yaml config", note: l("Birleşmiş son hali gösterir; çalıştırmadan önce kontrol et.", "Prints the merged result; check it before running.") },
          { cmd: "TAG=sha-3f2a1c9 docker compose -f compose.yaml -f compose.prod.yaml up -d" },
        ],
      },
    },
    {
      short: l("CI", "CI"),
      tag: "how",
      predict: {
        question: l("CI her commit'te bir image üretecek. Image'ı neyle etiketlemek en iyisi?", "CI will build an image on every commit. What is the best tag for it?"),
        options: [l("Sadece `latest`", "Only `latest`"), l("Commit'in SHA'sıyla (`sha-3f2a1c9`)", "The commit's SHA (`sha-3f2a1c9`)"), l("Build'in tarihiyle", "The build date")],
        answer: 1,
        why: l(
          "SHA, image'ı tam olarak bir commit'e bağlar ve bir daha değişmez. `latest` her push'ta başka bir image'ı gösterir; hangi kodun çalıştığını söylemez.",
          "A SHA ties the image to exactly one commit and never moves. `latest` points at a different image after every push and tells you nothing about which code runs.",
        ),
      },
      title: l("CI: her commit'e bir image", "CI: one image per commit"),
      body: [
        l(
          "`main`'e bir commit gelince GitHub Actions bir makine açtı: kodu çekti, Buildx'i kurdu, GHCR'a giriş yaptı ve `--target prod` ile build edip `ghcr.io/ada/shop:sha-3f2a1c9` olarak gönderdi.",
          "When a commit landed on `main`, GitHub Actions started a machine: checked out the code, set up Buildx, logged in to GHCR, then built with `--target prod` and pushed `ghcr.io/ada/shop:sha-3f2a1c9`.",
        ),
        l(
          "Artık kimse kendi bilgisayarında prod image'ı build etmiyor. Image her zaman aynı yoldan, aynı adımlarla çıkıyor.",
          "Nobody builds the prod image on their own laptop any more. It always comes out the same way, through the same steps.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "git push origin main", note: l("Workflow'u tetikler.", "Triggers the workflow.") },
          { cmd: "docker pull ghcr.io/ada/shop:sha-3f2a1c9", note: l("CI'ın ürettiği image'ı her yerde aynen çekersin.", "Pull exactly the image CI built, anywhere.") },
        ],
      },
    },
    {
      short: l("Workflow", "Workflow"),
      tag: "how",
      title: l("Workflow dosyası", "The workflow file"),
      body: [
        l(
          "İkinci bir commit geldi (v4) ve aynı workflow `sha-8b1d24e` etiketli yeni bir image gönderdi. Registry'de artık iki etiket var; geri dönmek gerekirse eskisini çalıştırmak yeter.",
          "A second commit arrived (v4) and the same workflow pushed a new image tagged `sha-8b1d24e`. The registry now holds two tags; to roll back, just run the older one.",
        ),
        l(
          "Aşağıdaki dosyayı projende `.github/workflows/` altına koyman yeterli. `GITHUB_TOKEN` her çalışmada otomatik gelir; `packages: write` izni GHCR'a göndermeye izin verir.",
          "Put the file below under `.github/workflows/` in your project. `GITHUB_TOKEN` comes with every run automatically; the `packages: write` permission lets it push to GHCR.",
        ),
      ],
      practice: {
        snippets: [{ label: ".github/workflows/build-image.yml", code: WORKFLOW, note: l("GHCR image adları küçük harf olmalı; repo adında büyük harf varsa adı elle yaz.", "GHCR image names must be lowercase; if your repo name has capitals, write the name by hand.") }],
        commands: [{ cmd: "gh run watch", note: l("GitHub CLI ile çalışan workflow'u izle.", "Watch the running workflow with the GitHub CLI.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("CI'da işe yarayan alışkanlıklar", "Habits that pay off in CI"),
      body: [
        l(
          "**Cache:** `cache-from: type=gha` ve `cache-to: type=gha,mode=max`, katmanları GitHub'ın cache'inde tutar; bir sonraki build cache'ten başlar. **Sırlar:** şifreler image'a değil, GitHub Secrets'a; container'a çalışırken ortam değişkeni olarak verilir.",
          "**Cache:** `cache-from: type=gha` and `cache-to: type=gha,mode=max` keep layers in GitHub's cache, so the next build starts warm. **Secrets:** passwords go into GitHub Secrets, not into the image, and reach the container as environment variables at run time.",
        ),
        l(
          "**Deploy:** sunucu her zaman belirli bir SHA'yı çalıştırsın. `latest` sadece \"en son\"a bakmak için bir kolaylık olsun. Etiketleri elle yazmak yerine `docker/metadata-action` ile de üretebilirsin.",
          "**Deploy:** servers always run a specific SHA; keep `latest` only as a convenience to look at \"the newest\". Instead of writing tags by hand you can also generate them with `docker/metadata-action`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede CI aynı makinede çalışıyor gibi çizildi ve build'ler yuvarlak sürelerde bitiyor. Gerçekte workflow GitHub'ın sanal makinesinde çalışır. Action'ların sürüm numaraları (`@v4`, `@v3`, `@v6`) zamanla artar; projene eklerken her action'ın sayfasından güncelini kontrol et.",
            "On this stage CI is drawn as if on the same machine, and builds finish in round times. In reality the workflow runs on a GitHub virtual machine. The actions' version numbers (`@v4`, `@v3`, `@v6`) go up over time; check each action's page for the current one when you add it.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker buildx imagetools inspect ghcr.io/ada/shop:sha-8b1d24e", note: l("Registry'deki image'ın digest'i ve platformları.", "The registry image's digest and platforms.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Projede `dev` ve `prod` aşamalı bir Dockerfile, bir `compose.yaml`, otomatik okunan `compose.override.yaml` (dev) ve `compose.prod.yaml` var; GHCR token'ın `GITHUB_TOKEN`'da. Aşağıda gerçek işten **5 senaryo** var: komutları terminale **kendin yaz**; sahne her komutta ne olduğunu gösterir.",
          "Your turn. The project has a Dockerfile with `dev` and `prod` stages, a `compose.yaml`, an automatically read `compose.override.yaml` (dev) and a `compose.prod.yaml`; your GHCR token is in `GITHUB_TOKEN`. Below are **5 scenarios** from real work: **type the commands yourself**; the scene shows what each one does.",
        ),
        l(
          "Takılırsan `cat` ile dosyalara bak; `docker compose config` birleşmiş son hali gösterir, `curl localhost:3000` dev'i, `curl localhost:8080` prod'u dener. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, look at the files with `cat`; `docker compose config` shows the merged result, `curl localhost:3000` tries dev and `curl localhost:8080` prod. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Dev'de kodu bind mount ile container'a aç: kaydettiğin an container da görür, build gerekmez.", "In dev, mount your code into the container: it sees every save, no build needed."),
    l("Prod'da kod image'ın içindedir ve değişmez; yeni kod yeni bir image ve container demek.", "In prod the code is inside the image and never changes; new code means a new image and container."),
    l("Tek Dockerfile'da aşamalar (`AS dev`, `AS prod`) aç, `--target` ile hangisinin build edileceğini seç.", "Put stages in one Dockerfile (`AS dev`, `AS prod`) and choose with `--target`."),
    l("`compose.override.yaml` otomatik okunur (dev); prod için `-f compose.yaml -f compose.prod.yaml` kullan.", "`compose.override.yaml` is read automatically (dev); for prod use `-f compose.yaml -f compose.prod.yaml`."),
    l("CI'da image'ı commit SHA'sıyla etiketle ve registry'ye gönder; sunucular belirli bir SHA'yı çalıştırsın.", "In CI, tag the image with the commit SHA and push it; servers run a specific SHA."),
    l("Sırlar image'a değil CI'ın secret'larına girer; CI cache'i build'leri hızlandırır.", "Secrets go into CI secrets, not the image; the CI cache keeps builds fast."),
  ],
  quiz: [
    {
      question: l("Dev'de kod değişikliklerini build yapmadan görmenin yolu hangisi?", "How do you see code changes in dev without building?"),
      options: [l("`docker restart`", "`docker restart`"), l("Proje klasörünü bind mount ile container'a bağlamak", "Bind-mounting the project folder into the container"), l("`latest` etiketini kullanmak", "Using the `latest` tag"), l("`EXPOSE` eklemek", "Adding `EXPOSE`")],
      answer: 1,
      explain: l("Bind mount container'ın klasörünü senin klasörünle aynı yapar; her kayıt anında görünür.", "A bind mount makes the container's folder your folder; every save shows up at once."),
      reviewStep: 2,
    },
    {
      question: l("`docker compose up` çalıştırınca hangi dosyalar okunur?", "Which files does `docker compose up` read?"),
      options: [
        l("Sadece `compose.yaml`", "Only `compose.yaml`"),
        l("`compose.yaml` ve varsa `compose.override.yaml`", "`compose.yaml` and, if present, `compose.override.yaml`"),
        l("Klasördeki bütün `.yaml` dosyaları", "Every `.yaml` in the folder"),
        l("Sadece `compose.prod.yaml`", "Only `compose.prod.yaml`"),
      ],
      answer: 1,
      explain: l("Override dosyası kendiliğinden eklenir. Başka bir dosyayı kullanmak için `-f` ile adını verirsin.", "The override file is added by itself. To use another file you name it with `-f`."),
      reviewStep: 5,
    },
    {
      question: l("Prod sunucusu hangi etiketi çalıştırmalı?", "Which tag should a production server run?"),
      options: [l("`latest`", "`latest`"), l("Belirli bir commit SHA'sı, örn. `sha-8b1d24e`", "A specific commit SHA, e.g. `sha-8b1d24e`"), l("`dev`", "`dev`"), l("Her açılışta en yenisi", "Whatever is newest at each start")],
      answer: 1,
      explain: l("SHA etiketi değişmez ve hangi kodun çalıştığını söyler; geri dönmek de bir önceki SHA'yı çalıştırmak kadar kolaydır.", "A SHA tag never moves and says which code runs; rolling back is just running the previous SHA."),
      reviewStep: 6,
    },
    {
      question: l("GitHub Actions'ta GHCR'a image göndermek için workflow'a ne gerekir?", "What does a GitHub Actions workflow need to push an image to GHCR?"),
      options: [
        l("Image'ın içine bir token gömmek", "A token baked into the image"),
        l("`packages: write` izni ve `GITHUB_TOKEN` ile `docker/login-action`", "The `packages: write` permission and `docker/login-action` with `GITHUB_TOKEN`"),
        l("Sadece `docker build`", "Only `docker build`"),
        l("Kişisel şifreni YAML'a yazmak", "Your personal password written in the YAML"),
      ],
      answer: 1,
      explain: l("Workflow'un kendi token'ı, doğru izinle GHCR'a giriş için yeterli; şifre ne YAML'a ne image'a girer.", "The workflow's own token, with the right permission, is enough to log in to GHCR; no password goes into the YAML or the image."),
      reviewStep: 7,
    },
  ],
};
