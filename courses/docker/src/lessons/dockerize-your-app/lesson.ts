import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const NODE_DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]`;

const DOCKERIGNORE = `node_modules
.git
.env
npm-debug.log
Dockerfile
.dockerignore`;

const PYTHON_DOCKERFILE = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]`;

const PHP_DOCKERFILE = `FROM php:8.3-apache
COPY . /var/www/html/
EXPOSE 80`;

const DOTNET_DOCKERFILE = `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Shop.dll"]`;

export const dockerizeYourApp: Lesson = {
  slug: "dockerize-your-app",
  title: l("Kendi projeni dockerize et", "Dockerize your own app"),
  summary: l(
    "Bir projeyi adım adım image'a çevirmenin tarifi: base image, .dockerignore, önce bağımlılıklar, sonra kod, root olmayan kullanıcı, port ve test. Node, Python, PHP ve .NET örnekleriyle.",
    "The recipe for turning a project into an image, step by step: base image, .dockerignore, dependencies first, then code, a non-root user, a port and a test. With Node, Python, PHP and .NET examples.",
  ),
  minutes: 18,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Projen için uygun bir base image seçmek", "Pick a fitting base image for your project"), step: 1 },
    { text: l("`.dockerignore` ile gereksiz ve gizli dosyaları dışarıda tutmak", "Keep unneeded and secret files out with `.dockerignore`"), step: 3 },
    { text: l("Bağımlılıkları koddan önce kopyalayıp build'i hızlandırmak", "Copy dependencies before code to keep builds fast"), step: 4 },
    { text: l("Uygulamayı root olmayan kullanıcıyla çalıştırıp `-p` ile test etmek", "Run as a non-root user and test it with `-p`"), step: 7 },
  ],
  steps: [
    {
      short: l("Proje", "The project"),
      tag: "how",
      title: l("Elinde bir proje var", "You have a project"),
      body: [
        l(
          "Sahnede küçük bir Node web dükkânının klasörü var: `package.json`, kilit dosyası, `server.js` ve bir `index.html`. Bir de her projede olan üç şey: `node_modules` (200 MB), `.git` ve şifrelerin durduğu `.env`.",
          "On stage is the folder of a small Node web shop: `package.json`, the lockfile, `server.js` and an `index.html`. Plus the three things every project has: `node_modules` (200 MB), `.git` and `.env`, where the passwords live.",
        ),
        l(
          "Amacımız bu klasörü bir [[image]]'a çevirmek: hangi bilgisayarda olursa olsun `docker run` ile aynı şekilde çalışsın. Bu derste her adımı kendi projende de yapacaksın; tarifin tamamı en sondaki kutuda.",
          "The goal is to turn this folder into an [[image]] that runs the same with `docker run` on any machine. You will do every step in your own project too; the full recipe is in the last box.",
        ),
      ],
      practice: {
        intro: l("Kendi projende, kök klasörde:", "In your own project, at the root:"),
        commands: [
          { cmd: "ls -la", note: l("Klasörde neler var? Özellikle `node_modules`, `.env`, `.git` gibi büyük ya da gizli şeylere bak.", "What is in the folder? Look for big or secret things such as `node_modules`, `.env`, `.git`.") },
          { cmd: "docker --version", note: l("Docker kurulu mu?", "Is Docker installed?") },
        ],
      },
    },
    {
      short: l("Base image", "Base image"),
      tag: "how",
      predict: {
        question: l("`node:22` ve `node:22-slim` image'larını indireceğiz. Hangisi daha küçük?", "We will pull `node:22` and `node:22-slim`. Which one is smaller?"),
        options: [l("`node:22`", "`node:22`"), l("`node:22-slim`, birkaç kat küçük", "`node:22-slim`, several times smaller"), l("İkisi aynı boyutta", "They are the same size")],
        answer: 1,
        why: l(
          "`node:22` derleyiciler ve araçlarla dolu tam bir Debian taşır (~1 GB). `-slim` sadece Node'u çalıştırmak için gerekeni taşır (~240 MB).",
          "`node:22` carries a full Debian with compilers and tools (~1 GB). `-slim` carries only what running Node needs (~240 MB).",
        ),
      },
      title: l("1. adım: base image seç", "Step 1: pick a base image"),
      body: [
        l(
          "Her Dockerfile bir `FROM` ile başlar: üstüne inşa edeceğin hazır image. Solda iki seçenek duruyor: `node:22` yaklaşık 1100 MB, `node:22-slim` yaklaşık 240 MB.",
          "Every Dockerfile starts with `FROM`: the ready-made image you build on. Two options sit on the left: `node:22` about 1100 MB, `node:22-slim` about 240 MB.",
        ),
        l(
          "Kural: dilinin **resmi** image'ını al, sürümünü yaz (`22`, `latest` değil) ve önce `-slim`'i dene. `-alpine` daha da küçüktür ama musl kullanır; bazı yerel bağımlılıklar orada derlenmez.",
          "Rule of thumb: use your language's **official** image, pin the version (`22`, not `latest`) and try `-slim` first. `-alpine` is smaller still but uses musl, and some native dependencies will not build there.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull node:22-slim" },
          { cmd: "docker images node", note: l("İndirdiğin sürümlerin boyutlarını yan yana gösterir.", "Shows the sizes of the versions you pulled side by side.") },
        ],
      },
    },
    {
      short: l("İgnore yok", "No ignore"),
      tag: "problem",
      predict: {
        question: l("`.dockerignore` yok ve Dockerfile `COPY . .` diyor. `node_modules` ve `.env` image'a girer mi?", "There is no `.dockerignore` and the Dockerfile says `COPY . .`. Do `node_modules` and `.env` end up in the image?"),
        options: [l("Hayır, Docker onları atlar", "No, Docker skips them"), l("Evet, ikisi de image'a girer", "Yes, both go into the image"), l("Sadece `node_modules` girer", "Only `node_modules` goes in")],
        answer: 1,
        why: l(
          "Docker klasördeki her şeyi build'e gönderir; `COPY . .` de hepsini kopyalar. Ne dışarıda kalacağını sen söylemezsen hiçbir şey dışarıda kalmaz.",
          "Docker sends everything in the folder to the build, and `COPY . .` copies all of it. Unless you say what to leave out, nothing is left out.",
        ),
      },
      title: l("Her şey image'a girdi, şifreler de", "Everything went in, passwords too"),
      body: [
        l(
          "Build bitti ama image şişti: yerel `node_modules` (200 MB) da kopyalandı. Daha kötüsü `.env` de içeride: bu image'ı registry'ye gönderen herkes `STRIPE_KEY`'i de göndermiş olur.",
          "The build finished but the image is bloated: the local `node_modules` (200 MB) was copied too. Worse, `.env` is inside: anyone who pushes this image to a registry pushes the `STRIPE_KEY` with it.",
        ),
        l(
          "Ayrıca bilgisayarındaki `node_modules` başka bir işletim sistemi için derlenmiş olabilir. Bağımlılıklar image'ın içinde kurulmalı.",
          "Your machine's `node_modules` may also be built for another operating system. Dependencies should be installed inside the image.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bir sır image'a bir kez girdiyse sonraki bir `RUN rm .env` onu silmez: eski katmanda durmaya devam eder. Sızdıysa anahtarı **yenile** (rotate).",
            "Once a secret is in an image, a later `RUN rm .env` does not remove it: it stays in the earlier layer. If it leaked, **rotate** the key.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker history shop:fat", note: l("Her katmanın boyutu: büyük `COPY . .` satırı hemen göze çarpar.", "Each layer's size: the big `COPY . .` line stands out.") }],
      },
    },
    {
      short: l(".dockerignore", ".dockerignore"),
      tag: "how",
      title: l("2. adım: .dockerignore ve tarif", "Step 2: .dockerignore and the recipe"),
      body: [
        l(
          "Proje köküne bir `.dockerignore` koyduk: `node_modules`, `.git`, `.env`. Sahnede bunlar \"dışarıda\" işaretli; build'e hiç gönderilmiyorlar.",
          "We put a `.dockerignore` at the project root: `node_modules`, `.git`, `.env`. On stage they are marked \"left out\"; they are never sent to the build.",
        ),
        l(
          "Sonra tarifin kendisi: önce sadece `package.json` ve kilit dosyası, sonra `npm ci`, en son kaynak kod. Build bitince image yaklaşık 300 MB ve içinde sır yok.",
          "Then the recipe itself: first only `package.json` and the lockfile, then `npm ci`, the source code last. The image comes out around 300 MB with no secrets in it.",
        ),
      ],
      practice: {
        snippets: [
          { label: ".dockerignore", code: DOCKERIGNORE },
          { label: "Dockerfile · Node", code: NODE_DOCKERFILE, note: l("`npm ci` kilit dosyasındaki tam sürümleri kurar; `--omit=dev` geliştirme bağımlılıklarını almaz.", "`npm ci` installs the exact versions from the lockfile; `--omit=dev` skips dev dependencies.") },
        ],
        commands: [{ cmd: "docker build -t shop .", note: l("Sondaki `.` build context'i: bu klasör.", "The trailing `.` is the build context: this folder.") }],
      },
    },
    {
      short: l("Cache", "Cache"),
      tag: "experiment",
      predict: {
        question: l("Sadece `index.html`'i değiştirip yeniden build edeceğiz. `npm ci` tekrar çalışır mı?", "We will change only `index.html` and build again. Does `npm ci` run again?"),
        options: [l("Evet, her build'de çalışır", "Yes, it runs on every build"), l("Hayır, cache'ten gelir", "No, it comes from the cache"), l("Build hata verir", "The build fails")],
        answer: 1,
        why: l(
          "`npm ci`'dan önceki satırlar sadece `package.json` ve kilit dosyasına bakar; onlar değişmedi. Değişen dosya ancak son `COPY . .` satırında devreye girer.",
          "The lines before `npm ci` only look at `package.json` and the lockfile, which did not change. The changed file only matters at the final `COPY . .`.",
        ),
      },
      title: l("3. adım: önce bağımlılıklar, sonra kod", "Step 3: dependencies first, code after"),
      body: [
        l(
          "Yeniden build birkaç saniyede bitti: `npm ci` satırı \"CACHED\" yazıyor, sadece son `COPY . .` çalıştı. Günde onlarca kez build ediyorsan bu, dakikalar demek.",
          "The rebuild finished in seconds: the `npm ci` line says \"CACHED\" and only the final `COPY . .` ran. If you build dozens of times a day, that is minutes saved.",
        ),
        l(
          "Aynı fikir her dilde geçerli: Python'da `requirements.txt`, PHP'de `composer.json`, .NET'te `*.csproj` önce kopyalanır.",
          "The same idea works in every language: copy `requirements.txt` in Python, `composer.json` in PHP, `*.csproj` in .NET first.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker build -t shop .", note: l("Çıktıda `CACHED` yazan satırlar cache'ten geldi.", "Lines marked `CACHED` in the output came from the cache.") }],
      },
    },
    {
      short: l("USER", "USER"),
      tag: "how",
      predict: {
        question: l("Dockerfile'da `USER node` var. Container'ın içinde `whoami` ne der?", "The Dockerfile has `USER node`. What does `whoami` say inside the container?"),
        options: [l("`root`", "`root`"), l("`node`", "`node`"), l("Senin bilgisayarındaki kullanıcı adın", "Your username on your machine")],
        answer: 1,
        why: l(
          "`USER` satırından sonraki her şey o kullanıcıyla çalışır, container'ın ana süreci de. Resmi Node image'larında hazır bir `node` kullanıcısı vardır.",
          "Everything after the `USER` line runs as that user, including the container's main process. The official Node images ship a ready-made `node` user.",
        ),
      },
      title: l("4. adım: root olarak çalıştırma", "Step 4: do not run as root"),
      body: [
        l(
          "`docker run -d --name shop shop` ile başlattık ve içeride `whoami` dedik: `node`. Uygulama root yetkisiyle değil, sıradan bir kullanıcıyla çalışıyor.",
          "We started it with `docker run -d --name shop shop` and ran `whoami` inside: `node`. The app runs as an ordinary user, not as root.",
        ),
        l(
          "Uygulamada bir açık çıksa bile saldırgan container'ın içinde root olmaz. Bu, güvenlik dersindeki en ucuz ve en etkili adım.",
          "Even if the app has a hole, an attacker does not get root inside the container. It is the cheapest and most effective step from the security lesson.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name shop shop" },
          { cmd: "docker exec shop whoami", note: l("`node` görmelisin.", "You should see `node`.") },
        ],
      },
    },
    {
      short: l("EXPOSE ≠ -p", "EXPOSE ≠ -p"),
      tag: "problem",
      predict: {
        question: l("Dockerfile'da `EXPOSE 3000` var ama container'ı `-p` olmadan başlattık. `curl localhost:3000` çalışır mı?", "The Dockerfile has `EXPOSE 3000`, but we started the container without `-p`. Does `curl localhost:3000` work?"),
        options: [l("Evet, EXPOSE portu açar", "Yes, EXPOSE opens the port"), l("Hayır, bağlantı reddedilir", "No, the connection is refused"), l("Sadece tarayıcıdan çalışır", "Only from a browser")],
        answer: 1,
        why: l(
          "`EXPOSE` sadece bir not: \"bu uygulama 3000'i dinler\". Portu host'a açan `docker run -p`'dir.",
          "`EXPOSE` is only a note: \"this app listens on 3000\". What opens the port on the host is `docker run -p`.",
        ),
      },
      title: l("EXPOSE belge, -p kapı", "EXPOSE documents, -p opens"),
      body: [
        l(
          "curl reddedildi. `EXPOSE` image'a \"hangi portu dinlediğini\" yazar ve araçlar (Compose, `docker run -P`) bunu okur; ama tek başına hiçbir kapı açmaz.",
          "curl was refused. `EXPOSE` records \"which port I listen on\" in the image, and tools (Compose, `docker run -P`) read it, but on its own it opens nothing.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "curl localhost:3000", note: l("`-p` olmadan: Connection refused.", "Without `-p`: Connection refused.") },
          { cmd: "docker inspect --format '{{.Config.ExposedPorts}}' shop", note: l("EXPOSE'un image'a yazdığı not.", "The note EXPOSE writes into the image.") },
        ],
      },
    },
    {
      short: l("Çalıştır", "Run it"),
      tag: "how",
      title: l("5. adım: çalıştır ve test et", "Step 5: run it and test it"),
      body: [
        l(
          "Container'ı sildik ve `-p 3000:3000` ile yeniden başlattık. `curl localhost:3000` artık `Merhaba v2` getiriyor: kod, image ve port uç uca çalışıyor.",
          "We removed the container and started it again with `-p 3000:3000`. `curl localhost:3000` now returns `Merhaba v2`: code, image and port work end to end.",
        ),
        l(
          "Kod her değiştiğinde döngü aynı: `docker build`, eskiyi `rm -f`, yeniyi `run`, `curl` ile dene. Bunu her seferinde elle yapmak yorucu; Compose bölümü ve dev/prod dersi bunu kolaylaştırır.",
          "Every code change runs the same loop: `docker build`, `rm -f` the old one, `run` the new one, try it with `curl`. Doing it by hand gets tiring; the Compose chapter and the dev/prod lesson make it easier.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f shop" },
          { cmd: "docker run -d --name shop -p 3000:3000 shop" },
          { cmd: "curl localhost:3000" },
          { cmd: "docker logs -f shop", note: l("Uygulamanın çıktısını canlı izle.", "Follow the app's output live.") },
        ],
      },
    },
    {
      short: l("Diğer diller", "Other languages"),
      tag: "reality",
      title: l("Python, PHP, .NET ve docker init", "Python, PHP, .NET and docker init"),
      body: [
        l(
          "Tarif her dilde aynı: resmi base image, `.dockerignore`, önce bağımlılık dosyası, kurulum, sonra kod, root olmayan kullanıcı, `EXPOSE`, `CMD`. Aşağıdaki kutuda Python, PHP ve .NET için hazır Dockerfile'lar var.",
          "The recipe is the same in every language: official base image, `.dockerignore`, the dependency file first, install, then code, a non-root user, `EXPOSE`, `CMD`. The box below has ready Dockerfiles for Python, PHP and .NET.",
        ),
        l(
          "Başlamak için kestirme: projenin kökünde `docker init` çalıştır. Dilini sorar ve senin için bir `Dockerfile`, `compose.yaml` ve `.dockerignore` üretir. Sonra yine bu dersteki kurallarla kontrol et.",
          "A shortcut to start: run `docker init` at your project's root. It asks for your language and writes a `Dockerfile`, a `compose.yaml` and a `.dockerignore` for you. Then check them against the rules in this lesson.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Container içindeki uygulama `127.0.0.1`'i değil `0.0.0.0`'ı dinlemeli. Sadece localhost'u dinleyen bir sunucuya `-p` ile bile dışarıdan ulaşılamaz; bu en sık yapılan dockerize hatasıdır.",
            "The app inside must listen on `0.0.0.0`, not `127.0.0.1`. A server that listens on localhost only cannot be reached even with `-p`; this is the most common dockerizing mistake.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Bu sahnede build süreleri ve boyutlar yuvarlak sayılar. Gerçek `npm ci` süresi bağımlılıklarına ve ağına göre değişir; ilk build'i bir kez ölç, sonra cache farkını gör.",
            "Build times and sizes on this stage are round numbers. A real `npm ci` takes as long as your dependencies and network need; time your first build once, then watch the cache difference.",
          ),
        },
      ],
      practice: {
        commands: [{ cmd: "docker init", note: l("Docker Desktop ve güncel Docker CLI'da var; dilini seçip soruları cevapla.", "Available in Docker Desktop and recent Docker CLIs; pick your language and answer the questions.") }],
        snippets: [
          { label: "Dockerfile · Python", code: PYTHON_DOCKERFILE, note: l("`gunicorn` ve `app:app` kendi projene göre değişir (Flask/Django). `--bind 0.0.0.0` önemli.", "`gunicorn` and `app:app` depend on your project (Flask/Django). `--bind 0.0.0.0` matters.") },
          { label: "Dockerfile · PHP", code: PHP_DOCKERFILE, note: l("Apache'li resmi image; Composer kullanıyorsan `composer install` adımını ekle.", "The official image with Apache; add a `composer install` step if you use Composer.") },
          { label: "Dockerfile · .NET", code: DOTNET_DOCKERFILE, note: l("SDK ile derle, sadece runtime ile çalıştır. .NET 8 image'ları varsayılan olarak 8080'i dinler ve hazır bir `app` kullanıcısı taşır.", "Build with the SDK, run with the runtime only. .NET 8 images listen on 8080 by default and ship an `app` user.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Klasörde küçük bir Express uygulaması var: `server.js`, `index.html`, `package.json`, yerel `node_modules`, `.git` ve sır içeren bir `.env`. Aşağıda gerçek işten **5 senaryo** var: Dockerfile'ı `nano` ile **kendin yaz**, `docker build` ve `docker run` ile dene; sahne build'i ve container'ları gösterir.",
          "Your turn. The folder holds a small Express app: `server.js`, `index.html`, `package.json`, a local `node_modules`, `.git` and a `.env` with a secret. Below are **5 scenarios** from real work: **write the Dockerfile yourself** with `nano` and try it with `docker build` and `docker run`; the scene shows the build and the containers.",
        ),
        l(
          "Takılırsan `ls`, `cat Dockerfile` ve `docker images` yaz; `curl localhost:3000` sayfayı gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `ls`, `cat Dockerfile` and `docker images`; `curl localhost:3000` shows the page. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Dilinin resmi image'ını sürümüyle seç ve önce `-slim`'i dene.", "Pick your language's official image with a version, and try `-slim` first."),
    l("`.dockerignore` ile `node_modules`, `.git` ve `.env` gibi şeyleri build'in dışında tut; sırlar image'a girerse orada kalır.", "Keep `node_modules`, `.git`, `.env` and the like out of the build with `.dockerignore`; a secret that gets into an image stays there."),
    l("Önce bağımlılık dosyalarını kopyala ve kur, sonra kodu kopyala: kod değişince kurulum cache'ten gelir.", "Copy and install the dependency files first, then the code: code changes reuse the installed layer."),
    l("`USER` ile root olmayan bir kullanıcıya geç.", "Switch to a non-root user with `USER`."),
    l("`EXPOSE` sadece bir nottur; portu `docker run -p` açar. Uygulama `0.0.0.0`'ı dinlemeli.", "`EXPOSE` is only a note; `docker run -p` opens the port. The app must listen on `0.0.0.0`."),
    l("Yeni kod = yeni image + yeni container. `docker init` iyi bir başlangıç taslağı verir.", "New code means a new image and a new container. `docker init` gives a good first draft."),
  ],
  quiz: [
    {
      question: l("Bir Node projesinde hangi sıra build'i en hızlı tutar?", "Which order keeps a Node project's builds fastest?"),
      options: [
        l("`COPY . .` → `RUN npm ci`", "`COPY . .` → `RUN npm ci`"),
        l("`COPY package*.json ./` → `RUN npm ci` → `COPY . .`", "`COPY package*.json ./` → `RUN npm ci` → `COPY . .`"),
        l("`RUN npm ci` → `COPY . .`", "`RUN npm ci` → `COPY . .`"),
        l("Sıranın önemi yok", "The order does not matter"),
      ],
      answer: 1,
      explain: l("Kod değişince sadece son `COPY . .` yeniden çalışır; `npm ci` cache'ten gelir. İlk seçenekte her değişiklik kurulumu baştan çalıştırır.", "When code changes only the last `COPY . .` reruns; `npm ci` comes from cache. In the first option every change reinstalls."),
      reviewStep: 4,
    },
    {
      question: l("`.env` dosyası yanlışlıkla image'a girdi ve image registry'ye gönderildi. Ne yaparsın?", "A `.env` file got into an image by mistake and the image was pushed. What do you do?"),
      options: [
        l("Dockerfile'a `RUN rm .env` eklerim", "Add `RUN rm .env` to the Dockerfile"),
        l("İçindeki anahtarları yenilerim ve `.env`'i `.dockerignore`'a eklerim", "Rotate the keys inside and add `.env` to `.dockerignore`"),
        l("Image'ı yeniden etiketlerim", "Retag the image"),
        l("Hiçbir şey, image özel", "Nothing, the image is private"),
      ],
      answer: 1,
      explain: l("Sızan sır eski katmanda durur ve indiren herkes okuyabilir. Anahtarı yenile ve bir daha girmesin diye `.dockerignore`'a ekle.", "The leaked secret stays in the old layer and anyone who pulls it can read it. Rotate the key and add it to `.dockerignore` so it never goes in again."),
      reviewStep: 2,
    },
    {
      question: l("Container çalışıyor, `-p 8000:8000` verdin ama `curl localhost:8000` cevap vermiyor. En olası sebep?", "The container runs, you gave `-p 8000:8000`, but `curl localhost:8000` gets no answer. The most likely cause?"),
      options: [
        l("Uygulama `127.0.0.1`'i dinliyor, `0.0.0.0`'ı değil", "The app listens on `127.0.0.1`, not `0.0.0.0`"),
        l("Dockerfile'da `EXPOSE` eksik", "`EXPOSE` is missing from the Dockerfile"),
        l("Image çok büyük", "The image is too big"),
        l("`USER` satırı var", "There is a `USER` line"),
      ],
      answer: 0,
      explain: l("Container'ın içindeki localhost sadece container'ın kendisidir. Sunucu `0.0.0.0`'ı dinlemezse dışarıdan gelen bağlantıyı almaz. `EXPOSE` sadece bir nottur.", "Localhost inside a container is just the container itself. Unless the server listens on `0.0.0.0` it never gets outside connections. `EXPOSE` is only a note."),
      reviewStep: 8,
    },
    {
      question: l("Kodu değiştirdin ve `docker build` çalıştırdın. Çalışan container yeni kodu gösterir mi?", "You changed the code and ran `docker build`. Does the running container show the new code?"),
      options: [
        l("Evet, hemen", "Yes, at once"),
        l("Hayır: eski image'dan çalışıyor, yeni bir container başlatman gerekir", "No: it runs the old image; you need to start a new container"),
        l("Sadece `docker restart` ile", "Only after `docker restart`"),
        l("Build container'ı kendisi günceller", "The build updates the container itself"),
      ],
      answer: 1,
      explain: l("Container başlarken image'ı sabitler. Yeni image'ı kullanmak için eski container'ı silip yenisini başlatırsın; `restart` aynı eski image'ı yeniden başlatır.", "A container fixes its image when it starts. To use the new image, remove the old container and start a new one; `restart` restarts the same old image."),
      reviewStep: 7,
    },
  ],
};
