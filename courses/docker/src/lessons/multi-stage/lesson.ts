import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const NODE_MULTI = `# --- 1. build: full tools, never shipped ---
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- 2. runtime: only what runs ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]`;

const DISTROLESS_MULTI = `FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
CMD ["dist/server.js"]`;

const PY_MULTI = `FROM python:3.12 AS build
WORKDIR /app
COPY requirements.txt ./
RUN pip wheel --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels
COPY . .
CMD ["python", "app.py"]`;

export const multiStage: Lesson = {
  slug: "multi-stage",
  title: l("Multi-stage ve küçük image'lar", "Multi-stage and small images"),
  summary: l(
    "Derlemek için gereken araçları çalışan image'a taşıma. Multi-stage build ile 1,4 GB'lık image'ın nasıl 130 MB'a indiğini, alpine, slim ve distroless'ın farkını gör.",
    "Do not ship the tools you need to build. See how a multi-stage build takes a 1.4 GB image down to 130 MB, and how alpine, slim and distroless differ.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Tek stage'li image'da neyin gereksiz taşındığını görmek", "See what a single-stage image carries for nothing"), step: 1 },
    { text: l("`COPY --from` ile sadece çıktıyı son image'a almak", "Take only the output into the final image with `COPY --from`"), step: 2 },
    { text: l("slim, alpine ve distroless taban image'larını karşılaştırmak", "Compare slim, alpine and distroless bases"), step: 4 },
    { text: l("`--target` ile tek bir stage'i build etmek", "Build a single stage with `--target`"), step: 5 },
  ],
  steps: [
    {
      short: l("Tek stage", "One stage"),
      tag: "problem",
      title: l("Her şey tek image'da: 1,4 GB", "Everything in one image: 1.4 GB"),
      body: [
        l(
          "Bu TypeScript servisi çalışmadan önce derlenmeli: `npm ci` geliştirme araçlarını da kurar, `npm run build` kodu tek bir `dist/server.js`'e paketler.",
          "This TypeScript service has to be compiled before it runs: `npm ci` installs the dev tools too, and `npm run build` bundles the code into one `dist/server.js`.",
        ),
        l(
          "Hepsini tek bir `FROM node:22` üstünde yaptık. Sonuç yaklaşık 1.400 MB: tam bir Debian, derleyiciler, 300 MB'lık `node_modules`, kaynak kod. Çalışırken bunların neredeyse hiçbiri gerekmiyor.",
          "We did it all on one `FROM node:22`. The result is about 1,400 MB: a full Debian, compilers, a 300 MB `node_modules`, the source. Almost none of it is needed at run time.",
        ),
      ],
      practice: { commands: [{ cmd: "docker image ls", note: l("SIZE sütununa bak: base image'ın payı çoğu zaman en büyüğü.", "Look at the SIZE column: the base image is often the biggest share.") }] },
    },
    {
      short: l("İçinde ne var?", "What is inside?"),
      tag: "problem",
      predict: {
        question: l("Bu container sadece `dist/server.js`'i çalıştırıyor. `ls /app` ne gösterir?", "This container only runs `dist/server.js`. What does `ls /app` show?"),
        options: [l("Sadece `dist`", "Only `dist`"), l("`dist`, `src`, `node_modules`, `package.json`…", "`dist`, `src`, `node_modules`, `package.json`…"), l("Boş bir klasör", "An empty folder")],
        answer: 1,
        why: l(
          "Tek stage'de build için kopyalanan ve kurulan her şey image'da kalır: kaynak kod, geliştirme paketleri, derleme çıktısı. Image büyür ve saldırı yüzeyi genişler.",
          "In one stage, everything copied and installed for the build stays in the image: source, dev packages, build output. The image grows and so does the attack surface.",
        ),
      },
      title: l("Build araçları üretime gidiyor", "Build tools go to production"),
      body: [
        l(
          "`docker exec big ls /app`: `dist`'in yanında `src`, `node_modules` ve `package.json` da var. Bunların hepsi her sunucuya indirilecek, her güvenlik taramasında çıkacak.",
          "`docker exec big ls /app`: next to `dist` there are `src`, `node_modules` and `package.json`. All of it gets downloaded to every server and shows up in every security scan.",
        ),
      ],
      practice: { commands: [{ cmd: "docker run --rm shop:single ls /app" }] },
    },
    {
      short: l("Multi-stage", "Multi-stage"),
      tag: "idea",
      predict: {
        question: l(
          "İkinci bir stage ekleyeceğiz: `FROM node:22-slim`, sonra sadece `COPY --from=build /app/dist`. Son image yaklaşık kaç MB olur?",
          "We will add a second stage: `FROM node:22-slim`, then only `COPY --from=build /app/dist`. Roughly how big is the final image?",
        ),
        options: [l("~1.400 MB", "~1,400 MB"), l("~540 MB", "~540 MB"), l("~240 MB", "~240 MB")],
        answer: 2,
        why: l(
          "Son image sadece son stage'den oluşur: `node:22-slim` (yaklaşık 240 MB) ve 2 MB'lık `dist`. İlk stage'deki araçlar build bitince atılır.",
          "The final image is only the last stage: `node:22-slim` (about 240 MB) and the 2 MB `dist`. The first stage's tools are thrown away after the build.",
        ),
      },
      title: l("İki stage: biri derler, biri çalışır", "Two stages: one builds, one runs"),
      body: [
        l(
          "Aynı Dockerfile'da iki `FROM` var. İlki `AS build` adını taşıyor ve derlemeyi yapıyor. İkincisi temiz bir `node:22-slim` ile başlıyor ve `COPY --from=build` ile **sadece** `dist/`'i alıyor.",
          "One Dockerfile now has two `FROM`s. The first is named `AS build` and does the compiling. The second starts clean from `node:22-slim` and takes **only** `dist/` with `COPY --from=build`.",
        ),
        l(
          "Son image yaklaşık 242 MB. İlk stage'in satırları cache'ten geldi; derleme bir kez yapıldı, sadece son stage yeniden kuruldu.",
          "The final image is about 242 MB. The first stage's lines came from the cache: compiling happened once, only the last stage was assembled again.",
        ),
      ],
      practice: {
        snippets: [{ label: "Dockerfile · multi-stage", code: NODE_MULTI, note: l("Çalışırken paket gerekiyorsa son stage'de sadece prod bağımlılıklarını kur (`--omit=dev`).", "If the app needs packages at run time, install only production dependencies in the last stage (`--omit=dev`).") }],
        commands: [{ cmd: "docker build -t shop:slim ." }],
      },
    },
    {
      short: l("alpine", "alpine"),
      tag: "how",
      title: l("alpine: daha da küçük taban", "alpine: an even smaller base"),
      body: [
        l(
          "Son stage'in tabanını `node:22-alpine` yaptık: yaklaşık 162 MB. Alpine Linux çok küçük bir dağıtım; glibc yerine **musl** kullanır.",
          "We switched the last stage's base to `node:22-alpine`: about 162 MB. Alpine Linux is a very small distribution that uses **musl** instead of glibc.",
        ),
        l(
          "Çoğu Node ve Python uygulaması alpine'da sorunsuz çalışır. Ama yerel modül derleyen paketler (bazı resim işleme, veritabanı sürücüleri) musl yüzünden sorun çıkarabilir; o zaman `slim` daha güvenli seçim.",
          "Most Node and Python apps run fine on alpine. Packages that compile native modules (some image processing or database drivers) can break on musl; then `slim` is the safer pick.",
        ),
      ],
      practice: { commands: [{ cmd: "docker build -t shop:alpine .", note: l("Son stage'de `FROM node:22-alpine`.", "With `FROM node:22-alpine` in the last stage.") }] },
    },
    {
      short: l("distroless", "distroless"),
      tag: "experiment",
      predict: {
        question: l(
          "Son stage `gcr.io/distroless/nodejs22-debian12` oldu. Uygulama çalışıyor. `docker exec -it tiny sh` ile içine girmeye çalışırsan ne olur?",
          "The last stage is now `gcr.io/distroless/nodejs22-debian12`. The app is running. What happens if you try `docker exec -it tiny sh`?",
        ),
        options: [l("Normal bir shell açılır", "A normal shell opens"), l("Hata: `sh` bulunamadı", "Error: `sh` not found"), l("Container çöker", "The container crashes")],
        answer: 1,
        why: l(
          "distroless image'larda sadece uygulamanın çalışması için gerekenler var: shell yok, paket yöneticisi yok. `sh` olmadığı için exec 127 ile döner.",
          "distroless images hold only what the app needs to run: no shell, no package manager. With no `sh`, exec returns 127.",
        ),
      },
      title: l("distroless: shell bile yok", "distroless: not even a shell"),
      body: [
        l(
          "Image yaklaşık 132 MB ve uygulama çalışıyor; `node` image'ın entrypoint'i olduğu için CMD sadece betiği söylüyor. Ama `sh` ile girmeye çalışınca hata aldık: bu image'da shell yok.",
          "The image is about 132 MB and the app runs; `node` is the image's entrypoint, so CMD only names the script. But trying to get in with `sh` failed: there is no shell.",
        ),
        l(
          "Bu bir güvenlik kazancı: saldırgan içeri girse bile kullanacağı araç yok. Bedeli de hata ayıklamanın zorlaşması; çoğu ekip geliştirmede `slim`, üretimde distroless kullanır.",
          "That is a security win: even an attacker who gets in finds no tools. The price is harder debugging; many teams use `slim` in development and distroless in production.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Debug için distroless'ın `:debug` tag'li sürümü busybox shell içerir. Bir container'ı shell'siz incelemek için `docker debug` (Docker Desktop) gibi araçlar da var.",
            "For debugging, distroless has `:debug` tagged variants that include a busybox shell. Tools like `docker debug` (Docker Desktop) also inspect a container without a shell.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Dockerfile · distroless", code: DISTROLESS_MULTI }],
        commands: [{ cmd: "docker exec -it tiny sh", note: l("distroless'ta: executable file not found.", "On distroless: executable file not found.") }],
      },
    },
    {
      short: l("--target", "--target"),
      tag: "how",
      title: l("--target: sadece bir stage'i build et", "--target: build just one stage"),
      body: [
        l(
          "`docker build --target build` Dockerfile'ı `build` stage'inin sonunda durdurdu. Ortaya çıkan image derleme araçlarının hepsini taşıyor: yaklaşık 1.400 MB.",
          "`docker build --target build` stopped the Dockerfile at the end of the `build` stage. The resulting image carries all the build tools: about 1,400 MB.",
        ),
        l(
          "Bu, testleri çalıştırmak için kullanışlı: aynı Dockerfile'dan CI'da testleri `--target build` image'ında, üretimi son stage'de çalıştırırsın. Tek dosya, iki amaç.",
          "This is handy for tests: from one Dockerfile, CI runs the tests in the `--target build` image and production uses the last stage. One file, two jobs.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker build --target build -t shop:test .", note: l("Sadece ilk stage.", "Only the first stage.") },
          { cmd: "docker run --rm shop:test npm test", note: l("Testleri geliştirme araçlarıyla dolu image'da çalıştır.", "Run the tests in the image with all the dev tools.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Hangi taban, ne zaman?", "Which base, when?"),
      body: [
        l(
          "Kabaca: **tam image** (`node:22`, `python:3.12`) build stage'i için; **slim** çoğu uygulamanın son stage'i için güvenli varsayılan; **alpine** daha küçük ama musl'a dikkat; **distroless** üretimde en küçük ve en güvenli, ama içine giremezsin.",
          "Roughly: a **full image** (`node:22`, `python:3.12`) for the build stage; **slim** as the safe default for most apps' last stage; **alpine** smaller but mind musl; **distroless** smallest and safest in production, but you cannot get in.",
        ),
        l(
          "Go ya da Rust gibi tek bir statik binary üreten dillerde son stage `FROM scratch` bile olabilir: boş bir image, içinde sadece programın.",
          "In languages that produce one static binary, like Go or Rust, the last stage can even be `FROM scratch`: an empty image holding only your program.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Buradaki boyutlar yaklaşık ve sıkıştırılmamış (`docker image ls`'in gösterdiği gibi). Registry'ye giden ve indirilen boyut sıkıştırılmış olduğu için daha küçüktür. Base image'ların gerçek boyutları sürümden sürüme değişir.",
            "Sizes here are rough and uncompressed (as `docker image ls` shows them). What is pushed and pulled is compressed, so it is smaller. Real base image sizes change from release to release.",
          ),
        },
      ],
      practice: {
        snippets: [
          { label: "Dockerfile · Python multi-stage", code: PY_MULTI },
          { label: "Dockerfile · Go + scratch", code: "FROM golang:1.23 AS build\nWORKDIR /src\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /app\n\nFROM scratch\nCOPY --from=build /app /app\nENTRYPOINT [\"/app\"]" },
        ],
        commands: [{ cmd: "docker history shop:slim", note: l("Son image'da ilk stage'in hiçbir satırı yok.", "The final image has none of the first stage's lines.") }],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen küçült", "Now you shrink it"),
      body: [
        l(
          "Sıra sende. Proje bir TypeScript servisi; Dockerfile şu an tek stage ve `node:22` üstünde. Aşağıda gerçek işten **4 senaryo** var: Dockerfile'ı `nano Dockerfile` ile **kendin düzenle**, `docker build -t shop .` ile build et; sahne her stage'in layer'larını ve image'ın boyutunu gösterir.",
          "Your turn. The project is a TypeScript service; the Dockerfile is single-stage on `node:22`. Below are **4 scenarios** from real work: **edit the Dockerfile yourself** with `nano Dockerfile` and build it with `docker build -t shop .`; the scene shows each stage's layers and the image's size.",
        ),
        l(
          "`docker images` boyutları listeler. distroless'ın ENTRYPOINT'i zaten `node`; CMD'ye sadece betiğin yolu yazılır. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker images` lists the sizes. distroless's ENTRYPOINT already is `node`; CMD only gets the script's path. Hints open one at a time; few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Tek stage'li image derleme araçlarını, kaynak kodu ve geliştirme paketlerini de üretime taşır.", "A single-stage image ships build tools, source code and dev packages to production."),
    l("Multi-stage: bir `FROM ... AS build` stage'i derler, son stage `COPY --from=build` ile sadece çıktıyı alır.", "Multi-stage: a `FROM ... AS build` stage compiles, and the last stage takes only the output with `COPY --from=build`."),
    l("Son image sadece son stage'den oluşur; önceki stage'ler atılır ama cache'te kalır.", "The final image is only the last stage; earlier stages are dropped but stay in the cache."),
    l("slim güvenli varsayılan, alpine daha küçük ama musl kullanır, distroless en küçüğü ve shell içermez.", "slim is the safe default, alpine is smaller but uses musl, distroless is the smallest and has no shell."),
    l("`--target` tek bir stage'i build eder: testleri araçlı stage'de çalıştırmak için.", "`--target` builds one stage: handy for running tests in the stage with the tools."),
  ],
  quiz: [
    {
      question: l("Multi-stage bir Dockerfile'da son image hangi stage'lerden oluşur?", "In a multi-stage Dockerfile, which stages make up the final image?"),
      options: [l("Hepsinden", "All of them"), l("Sadece son stage'den (ve oraya COPY --from ile alınanlardan)", "Only the last stage (and what it takes with COPY --from)"), l("Sadece ilk stage'den", "Only the first stage"), l("En büyük stage'den", "The biggest stage")],
      answer: 1,
      explain: l("Önceki stage'ler sadece build sırasında yaşar; son image son stage'dir.", "Earlier stages only live during the build; the final image is the last stage."),
      reviewStep: 2,
    },
    {
      question: l("Uygulaman yerel bir C eklentisi derleyen bir paket kullanıyor ve alpine'da çöküyor. En olası sebep?", "Your app uses a package that compiles a native C add-on, and it crashes on alpine. The likely cause?"),
      options: [l("Alpine Node'u desteklemiyor", "Alpine does not support Node"), l("Alpine glibc yerine musl kullanıyor", "Alpine uses musl instead of glibc"), l("Image çok küçük", "The image is too small"), l("EXPOSE eksik", "EXPOSE is missing")],
      answer: 1,
      explain: l("glibc için derlenmiş yerel kod musl'da çalışmayabilir. `slim` tabanı genelde çözer.", "Native code built for glibc may not run on musl. A `slim` base usually fixes it."),
      reviewStep: 3,
    },
    {
      question: l("distroless bir container'da `docker exec -it app sh` neden çalışmaz?", "Why does `docker exec -it app sh` fail in a distroless container?"),
      options: [l("exec distroless'ta kapalı", "exec is disabled on distroless"), l("Image'da shell yok", "The image has no shell"), l("Container root değil", "The container is not root"), l("Önce `docker attach` gerekir", "You need `docker attach` first")],
      answer: 1,
      explain: l("distroless image'lar shell ve paket yöneticisi içermez; sadece uygulamanın çalışma zamanı vardır.", "distroless images have no shell or package manager; only the app's runtime."),
      reviewStep: 4,
    },
    {
      question: l("CI'da testleri derleme araçlarının olduğu stage'de çalıştırmak istiyorsun. Hangi komut?", "In CI you want to run tests in the stage that has the build tools. Which command?"),
      options: [l("`docker build --target build -t app:test .`", "`docker build --target build -t app:test .`"), l("`docker build --stage 1 .`", "`docker build --stage 1 .`"), l("`docker run --build app`", "`docker run --build app`"), l("`docker build --no-cache .`", "`docker build --no-cache .`")],
      answer: 0,
      explain: l("`--target` build'i adı verilen stage'in sonunda durdurur.", "`--target` stops the build at the end of the named stage."),
      reviewStep: 5,
    },
  ],
};
