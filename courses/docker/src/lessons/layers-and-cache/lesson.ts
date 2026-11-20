import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const SMART_DOCKERFILE = `FROM node:22-slim
WORKDIR /app
# 1. Only the dependency list: changes rarely
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# 2. The code: changes all the time
COPY . .
CMD ["node", "server.js"]`;

const DOCKERIGNORE = `node_modules
npm-debug.log
.git
.env
Dockerfile
.dockerignore
dist
coverage`;

export const layersAndCache: Lesson = {
  slug: "layers-and-cache",
  title: l("Layer'lar ve build cache", "Layers and the build cache"),
  summary: l(
    "Her RUN ve COPY bir layer'dır ve Docker onları cache'ler. Satır sırası yüzünden 30 saniyelik build'in nasıl 1 saniyeye düştüğünü, `.dockerignore`'un image'ı nasıl küçülttüğünü gör.",
    "Every RUN and COPY is a layer, and Docker caches them. See how line order turns a 30-second build into a 1-second one, and how `.dockerignore` shrinks the image.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Değişmeyen satırların cache'ten geldiğini görmek", "See unchanged lines come from the cache"), step: 1 },
    { text: l("Bir cache kaçağının sonraki her satırı yeniden çalıştırdığını görmek", "See that one cache miss reruns every line after it"), step: 2 },
    { text: l("package.json'u önce kopyalayarak build'i hızlandırmak", "Speed builds up by copying package.json first"), step: 3 },
    { text: l("`.dockerignore` ile image'ı küçültmek ve cache'i korumak", "Shrink the image and protect the cache with `.dockerignore`"), step: 6 },
  ],
  steps: [
    {
      short: l("Layer'lar", "Layers"),
      tag: "how",
      title: l("Bir image, üst üste layer'lar", "An image is layers stacked up"),
      body: [
        l(
          "Bu Dockerfile önce bütün klasörü kopyalıyor, sonra `npm ci` çalıştırıyor. İlk build'de her satır çalıştı; en uzunu 30 saniyelik `npm ci`.",
          "This Dockerfile copies the whole folder first, then runs `npm ci`. On the first build every line ran; the longest is the 30-second `npm ci`.",
        ),
        l(
          "Her `RUN` ve `COPY` sağdaki yığına bir [[layer]] ekledi. Layer'lar değişmez: bir layer bir kez oluşunca aynen saklanır ve başka image'larla paylaşılabilir.",
          "Every `RUN` and `COPY` added a [[layer]] to the stack on the right. Layers never change: once made, a layer is kept as is and can be shared with other images.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker build -t shop .", note: l("Çıktıda her adımın süresini ve CACHED olanları görürsün.", "The output shows each step's time and which ones were CACHED.") },
          { cmd: "docker history shop", note: l("Image'ın layer'ları, hangi satırdan geldikleri ve boyutları.", "The image's layers, which line made them, and their size.") },
        ],
      },
    },
    {
      short: l("Cache", "Cache"),
      tag: "experiment",
      predict: {
        question: l("Hiçbir şeyi değiştirmeden aynı Dockerfile'ı tekrar build edersen ne olur?", "If you build the same Dockerfile again without changing anything, what happens?"),
        options: [l("Yine 30 saniyeden uzun sürer", "It takes over 30 seconds again"), l("Her satır cache'ten gelir, neredeyse anında biter", "Every line comes from the cache and it finishes almost at once"), l("Docker hata verir: image zaten var", "Docker errors: the image already exists")],
        answer: 1,
        why: l(
          "Docker her satır için bir anahtar hesaplar: önceki layer + satırın kendisi + kopyalanan dosyaların içeriği. Anahtar aynıysa eski layer'ı yeniden kullanır.",
          "Docker computes a key for every line: the previous layer, the line itself and the content of copied files. Same key, reused layer.",
        ),
      },
      title: l("Hiçbir şey değişmediyse iş de yok", "Nothing changed, no work"),
      body: [
        l(
          "İkinci build'de her satır CACHED: toplam 0 saniye. Docker \"bu satırı bu girdilerle zaten yaptım\" dedi ve önceki layer'ı aldı.",
          "On the second build every line is CACHED: 0 seconds in total. Docker said \"I already did this line with these inputs\" and took the earlier layer.",
        ),
      ],
      practice: { commands: [{ cmd: "docker build -t shop .", note: l("İkinci kez: `CACHED` yazan satırlar.", "The second time: lines marked `CACHED`.") }] },
    },
    {
      short: l("Kötü sıra", "Bad order"),
      tag: "problem",
      predict: {
        question: l("`server.js`'te tek bir satır değişti. Bu Dockerfile'da (önce `COPY . .`, sonra `RUN npm ci`) hangi adımlar yeniden çalışır?", "One line changed in `server.js`. In this Dockerfile (`COPY . .` first, then `RUN npm ci`), which steps run again?"),
        options: [
          l("Sadece `COPY . .`", "Only `COPY . .`"),
          l("`COPY . .` ve ondan sonraki her şey, `npm ci` dahil", "`COPY . .` and everything after it, `npm ci` included"),
          l("Her şey, FROM dahil", "Everything, FROM included"),
        ],
        answer: 1,
        why: l(
          "`COPY . .`'ın girdisi (dosyaların içeriği) değişti, cache kaçtı. Bir satır cache'ten kaçınca ondan sonraki **her** satır da yeniden çalışır, çünkü hepsi bu yeni layer'ın üstüne kurulur.",
          "The input of `COPY . .` (the file contents) changed, so it missed the cache. Once one line misses, **every** line after it runs again, since they all build on the new layer.",
        ),
      },
      title: l("Bir cache kaçağı, sonraki her şeyi çalıştırır", "One cache miss reruns everything after it"),
      body: [
        l(
          "Tek satırlık bir kod değişikliği için `npm ci` baştan çalıştı: yine 30 saniye. Bağımlılıklar değişmedi ama Docker bunu bilemez; `npm ci`, değişen `COPY . .` layer'ının üstünde.",
          "For a one-line code change, `npm ci` ran from scratch: 30 seconds again. The dependencies did not change, but Docker cannot know that; `npm ci` sits on top of the changed `COPY . .` layer.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kural: **az değişeni yukarı, çok değişeni aşağı** yaz. Kod günde onlarca kez değişir, bağımlılıklar haftada bir.",
            "The rule: put **what changes rarely at the top and what changes often at the bottom**. Code changes dozens of times a day, dependencies once a week.",
          ),
        },
      ],
      practice: { commands: [] , snippets: [{ label: "Dockerfile · yavaş", code: "FROM node:22-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD [\"node\", \"server.js\"]" }] },
    },
    {
      short: l("İyi sıra", "Good order"),
      tag: "how",
      title: l("Önce package.json, sonra kod", "package.json first, then the code"),
      body: [
        l(
          "Yeni sıra: önce sadece `package.json` ve `package-lock.json`, sonra `npm ci`, en son `COPY . .`. İlk build yine uzun sürdü (cache yeni sıraya göre doldu). Sonra `server.js`'i değiştirip tekrar build ettik.",
          "The new order: first only `package.json` and `package-lock.json`, then `npm ci`, and `COPY . .` last. The first build was long again (the cache filled up for the new order). Then we changed `server.js` and built again.",
        ),
        l(
          "Bu sefer `npm ci` CACHED: girdisi olan iki dosya değişmedi. Sadece son `COPY . .` çalıştı ve build 1 saniyede bitti.",
          "This time `npm ci` is CACHED: the two files it depends on did not change. Only the last `COPY . .` ran, and the build took 1 second.",
        ),
      ],
      practice: {
        snippets: [{ label: "Dockerfile · hızlı", code: SMART_DOCKERFILE, note: l("Python'da aynı fikir: önce `requirements.txt` + `pip install`, sonra kod.", "Same idea in Python: `requirements.txt` + `pip install` first, then the code.") }],
        commands: [],
      },
    },
    {
      short: l("Yeni paket", "New package"),
      tag: "experiment",
      predict: {
        question: l("Bu sefer `package.json`'a yeni bir paket eklendi. İyi sıralı Dockerfile'da `npm ci` ne yapar?", "This time a new package went into `package.json`. In the well-ordered Dockerfile, what does `npm ci` do?"),
        options: [l("Cache'ten gelir, paket kurulmaz", "Comes from the cache: the package is not installed"), l("Yeniden çalışır ve yeni paketi kurar", "Runs again and installs the new package"), l("Build hata verir", "The build fails")],
        answer: 1,
        why: l("`npm ci`'nin girdisi olan dosyalar değişti, cache kaçtı. İstediğimiz de tam bu: bağımlılık değişince yeniden kur.", "The files `npm ci` depends on changed, so it missed the cache. That is exactly what we want: reinstall when dependencies change."),
      },
      title: l("Cache doğru şeyi yeniden çalıştırır", "The cache reruns the right thing"),
      body: [
        l(
          "`package.json` değişince `COPY package*.json` ve `npm ci` yeniden çalıştı. Cache sana zarar vermez: girdisi değişen her satırı yeniden yapar. Senin işin, satırların girdilerini dar tutmak.",
          "With `package.json` changed, `COPY package*.json` and `npm ci` ran again. The cache never works against you: it redoes any line whose inputs changed. Your job is to keep each line's inputs narrow.",
        ),
      ],
      practice: { commands: [{ cmd: "docker build --no-cache -t shop .", note: l("Cache'i tamamen yok sayar; bir şeyden şüphelendiğinde temiz build için.", "Ignores the cache completely: a clean build when you suspect something.") }] },
    },
    {
      short: l(".dockerignore yok", "No .dockerignore"),
      tag: "problem",
      title: l("Kendi node_modules'un da image'a girdi", "Your own node_modules went in too"),
      body: [
        l(
          "Bu build'de `.dockerignore` yok. `COPY . .` klasördeki **her şeyi** aldı: senin bilgisayarında kurulu yaklaşık 200 MB'lık `node_modules` ve `.git` klasörü dahil. Image 200 MB büyüdü.",
          "This build has no `.dockerignore`. `COPY . .` took **everything** in the folder, including the roughly 200 MB `node_modules` from your machine and the `.git` folder. The image grew by 200 MB.",
        ),
        l(
          "Daha kötüsü: senin `node_modules`'un başka bir işletim sistemi için derlenmiş olabilir ve `npm ci`'nin kurduğunun üstüne yazılır.",
          "Worse: your `node_modules` may be built for another operating system, and it overwrites what `npm ci` installed.",
        ),
      ],
      practice: { commands: [{ cmd: "docker image ls shop", note: l("Boyutu karşılaştır.", "Compare the size.") }] },
    },
    {
      short: l(".dockerignore", ".dockerignore"),
      tag: "experiment",
      predict: {
        question: l(
          "`.dockerignore`'a `node_modules` ve `.git` yazdık. Yeni bir commit attın (sadece `.git` değişti). Bir sonraki build ne yapar?",
          "We put `node_modules` and `.git` in `.dockerignore`. You made a new commit (only `.git` changed). What does the next build do?",
        ),
        options: [l("`COPY . .` yeniden çalışır", "`COPY . .` runs again"), l("Her şey cache'ten gelir", "Everything comes from the cache"), l("`npm ci` yeniden çalışır", "`npm ci` runs again")],
        answer: 1,
        why: l(
          "Yok sayılan dosyalar build context'e hiç girmez, cache anahtarına da girmez. `.git` değişse de Docker için hiçbir şey değişmedi.",
          "Ignored files never enter the build context, so they are not part of any cache key. `.git` changed, but for Docker nothing did.",
        ),
      },
      title: l(".dockerignore: context'e ne girmesin?", ".dockerignore: what stays out of the context?"),
      body: [
        l(
          "`.dockerignore` ile `node_modules` ve `.git` build context'e girmedi: image yine küçük. Sonra yeni bir commit attık ve build tamamen cache'ten geldi, 0 saniye.",
          "With `.dockerignore`, `node_modules` and `.git` stayed out of the build context: the image is small again. Then we made a new commit, and the build came entirely from the cache, 0 seconds.",
        ),
        l(
          "Build context, `docker build`'in sonundaki `.` klasörüdür; Docker onu build'e gönderir. Küçük context hem daha hızlı build, hem daha küçük image, hem de daha az sızıntı demek (`.env` gibi).",
          "The build context is the `.` folder at the end of `docker build`; Docker sends it to the build. A small context means faster builds, smaller images and fewer leaks (like `.env`).",
        ),
      ],
      practice: {
        intro: l("Projenin köküne, Dockerfile'ın yanına koy:", "Put it in your project root, next to the Dockerfile:"),
        snippets: [{ label: ".dockerignore", code: DOCKERIGNORE }],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Cache ile çalışırken bilinmesi gerekenler", "What to know when working with the cache"),
      body: [
        l(
          "Bir layer'a giren dosya, sonraki bir satırda silinse bile image'da kalır: `COPY .env .` ardından `RUN rm .env` dosyayı yok etmez, alttaki layer onu hâlâ taşır. Gizli dosyaları hiç kopyalama; `.dockerignore`'a yaz.",
          "A file that went into a layer stays in the image even if a later line deletes it: `COPY .env .` then `RUN rm .env` does not get rid of it, because the layer below still carries it. Never copy secrets in; list them in `.dockerignore`.",
        ),
        l(
          "Aynı mantıkla `apt-get update` ve `apt-get install`'u **tek** RUN satırında yaz. Ayrı satırlarda olurlarsa `update` cache'ten eski paket listesini getirebilir.",
          "By the same logic, put `apt-get update` and `apt-get install` in **one** RUN line. On separate lines, `update` may come from the cache with an old package list.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede süreler ve boyutlar yuvarlak sayılar, adımlar sırayla çalışıyor. BuildKit ayrıca `RUN --mount=type=cache,target=/root/.npm` ile paket indirmelerini build'ler arasında saklayabilir; CI'da `--cache-from` ile cache başka makineden de gelebilir.",
            "On this stage times and sizes are round numbers and steps run in order. BuildKit can also keep package downloads between builds with `RUN --mount=type=cache,target=/root/.npm`, and in CI the cache can come from another machine with `--cache-from`.",
          ),
        },
      ],
      practice: {
        snippets: [
          { label: "Dockerfile · apt", code: "RUN apt-get update \\\n && apt-get install -y --no-install-recommends curl \\\n && rm -rf /var/lib/apt/lists/*" },
          { label: "Dockerfile · cache mount", code: "RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev" },
        ],
        commands: [{ cmd: "docker builder prune", note: l("Build cache'i temizler (disk dolduğunda).", "Clears the build cache (when the disk fills up).") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var; her birinde proje klasörü bir Dockerfile ile ve bir kez build edilmiş halde başlar. Dockerfile'ı `nano Dockerfile` ile, `.dockerignore`'u `echo` ile **kendin düzenle**, `docker build -t shop .` ile build et; sahne hangi satırın cache'ten geldiğini gösterir.",
          "Your turn. Below are **4 scenarios** from real work; in each the project folder starts with a Dockerfile, built once. **Edit it yourself**: the Dockerfile with `nano Dockerfile`, `.dockerignore` with `echo`, and build with `docker build -t shop .`; the scene shows which lines came from the cache.",
        ),
        l(
          "Sayaçlar her build'in süresini ve image boyutunu gösterir; `cat Dockerfile` ve `cat .dockerignore` dosyaların son halini yazar. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "The counters show each build's time and the image size; `cat Dockerfile` and `cat .dockerignore` print the files as they are. Hints open one at a time; few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Her `RUN` ve `COPY` bir layer'dır; layer'lar değişmez ve cache'lenir.", "Every `RUN` and `COPY` is a layer; layers never change and are cached."),
    l("Docker bir satırı, önceki layer ve girdileri aynıysa cache'ten alır.", "Docker takes a line from the cache when the previous layer and its inputs are the same."),
    l("Bir satır cache'ten kaçınca ondan sonraki **her** satır yeniden çalışır.", "When one line misses the cache, **every** line after it runs again."),
    l("Az değişeni yukarı yaz: önce `package.json` + `npm ci`, sonra `COPY . .`.", "Put what changes rarely on top: `package.json` + `npm ci` first, then `COPY . .`."),
    l("`.dockerignore` context'i küçültür: `node_modules`, `.git` ve `.env` image'a girmez, cache gereksiz yere bozulmaz.", "`.dockerignore` shrinks the context: `node_modules`, `.git` and `.env` stay out, and the cache is not broken for nothing."),
    l("Bir layer'a giren dosya sonradan silinse de image'da kalır; gizli dosyaları hiç kopyalama.", "A file that entered a layer stays in the image even if deleted later; never copy secrets in."),
  ],
  quiz: [
    {
      question: l("Dockerfile: `COPY . .` → `RUN npm ci` → `CMD`. Sadece bir CSS dosyası değişti. Ne yeniden çalışır?", "Dockerfile: `COPY . .` → `RUN npm ci` → `CMD`. Only a CSS file changed. What runs again?"),
      options: [l("Hiçbir şey", "Nothing"), l("Sadece `COPY . .`", "Only `COPY . .`"), l("`COPY . .` ve `RUN npm ci`", "`COPY . .` and `RUN npm ci`"), l("Sadece `CMD`", "Only `CMD`")],
      answer: 2,
      explain: l("`COPY . .` kaçtı; ondan sonraki her satır da yeniden çalışır.", "`COPY . .` missed; every line after it runs again."),
      reviewStep: 2,
    },
    {
      question: l("Build'ini hızlandırmak için en etkili değişiklik hangisi?", "Which change speeds up your builds the most?"),
      options: [
        l("`package.json`'u kodla ayrı ve daha önce kopyalamak", "Copying `package.json` separately and before the code"),
        l("Her şeyi tek bir RUN satırına koymak", "Putting everything in one RUN line"),
        l("`--no-cache` kullanmak", "Using `--no-cache`"),
        l("Daha büyük bir base image seçmek", "Picking a bigger base image"),
      ],
      answer: 0,
      explain: l("Böylece kod değişince bağımlılık kurulumu cache'ten gelir.", "Then a code change reuses the dependency install from the cache."),
      reviewStep: 3,
    },
    {
      question: l("`.dockerignore` olmadan `COPY . .` ne kopyalar?", "Without `.dockerignore`, what does `COPY . .` copy?"),
      options: [l("Sadece kaynak kodu", "Only the source code"), l("Build context'teki her şeyi: node_modules, .git, .env dahil", "Everything in the build context: node_modules, .git and .env included"), l("Sadece git'te takip edilen dosyaları", "Only files tracked by git"), l("Hiçbir şeyi", "Nothing")],
      answer: 1,
      explain: l("Docker git'e bakmaz; context klasöründe ne varsa alır.", "Docker does not look at git; it takes whatever is in the context folder."),
      reviewStep: 5,
    },
    {
      question: l("`COPY secrets.json .` ve hemen ardından `RUN rm secrets.json`. Image'ı paylaşırsan dosya güvende mi?", "`COPY secrets.json .` followed by `RUN rm secrets.json`. If you share the image, is the file safe?"),
      options: [l("Evet, silindi", "Yes, it was deleted"), l("Hayır, ilk layer'da hâlâ duruyor", "No, it is still in the first layer"), l("Sadece Docker Hub'da güvende", "Only safe on Docker Hub"), l("`--squash` olmadan güvende", "Safe without `--squash`")],
      answer: 1,
      explain: l("Layer'lar değişmez; silme yeni bir layer'dır, eskisinde dosya durur.", "Layers never change; the delete is a new layer and the old one still holds the file."),
      reviewStep: 7,
    },
  ],
};
