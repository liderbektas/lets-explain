import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const NODE_DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]`;

const PY_DOCKERFILE = `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]`;

export const dockerfileBasics: Lesson = {
  slug: "dockerfile-basics",
  title: l("Dockerfile temelleri", "Dockerfile basics"),
  summary: l(
    "Bir Dockerfile'ı satır satır kur: `FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `EXPOSE`, `CMD`, `ARG` ve `ADD`. Hangi satırın layer eklediğini, hangisinin sadece ayar olduğunu gör.",
    "Build a Dockerfile line by line: `FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `EXPOSE`, `CMD`, `ARG` and `ADD`. See which lines add a layer and which are only settings.",
  ),
  minutes: 15,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Her Dockerfile'ın bir FROM ile başladığını bilmek", "Know that every Dockerfile starts with FROM"), step: 0 },
    { text: l("COPY ve RUN'ın image'a layer eklediğini görmek", "See COPY and RUN add layers to the image"), step: 2 },
    { text: l("ENV, EXPOSE ve CMD'nin sadece ayar olduğunu görmek", "See that ENV, EXPOSE and CMD are only settings"), step: 4 },
    { text: l("ARG ile build sırasında değer vermek", "Pass values at build time with ARG"), step: 5 },
  ],
  steps: [
    {
      short: l("FROM", "FROM"),
      tag: "how",
      title: l("FROM: neyin üstüne kuruyorsun?", "FROM: what are you building on?"),
      body: [
        l(
          "Bir [[dockerfile]], image'ın tarifidir: yukarıdan aşağı okunur, her satır bir adım. İlk satır her zaman `FROM`: \"şu hazır image'ın üstüne kur\".",
          "A [[dockerfile]] is an image's recipe: read top to bottom, one step per line. The first line is always `FROM`: \"build on top of this ready-made image\".",
        ),
        l(
          "`FROM node:22-slim` içinde Node.js kurulu, küçük bir Linux getiriyor. Sağda image'ın ilk ve tek [[layer]]'ı duruyor: yaklaşık 240 MB, hepsi base image'dan.",
          "`FROM node:22-slim` brings a small Linux with Node.js installed. On the right is the image's first and only [[layer]]: about 240 MB, all from the base image.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Tag'i hep yaz: `node:22-slim`, `node` değil. Tag'siz FROM `latest` demektir ve bir gün sessizce başka bir sürüme döner.",
            "Always write the tag: `node:22-slim`, not `node`. A FROM without a tag means `latest`, which will one day quietly become another version.",
          ),
        },
      ],
      practice: {
        intro: l("Projenin kök klasöründe `Dockerfile` adında bir dosya oluştur:", "Create a file called `Dockerfile` in your project's root folder:"),
        commands: [{ cmd: "docker build -t my-app .", note: l("`-t` image'a ad verir; sondaki `.` build context: Dockerfile'ın gördüğü klasör.", "`-t` names the image; the `.` at the end is the build context, the folder the Dockerfile can see.") }],
        snippets: [{ label: "Dockerfile", code: "FROM node:22-slim" }],
      },
    },
    {
      short: l("WORKDIR, COPY", "WORKDIR, COPY"),
      tag: "how",
      title: l("WORKDIR ve COPY: dosyaları içeri al", "WORKDIR and COPY: bring files in"),
      body: [
        l(
          "`WORKDIR /app` image'ın içindeki çalışma klasörünü seçer; yoksa oluşturur. Sonraki komutlar oraya göre çalışır.",
          "`WORKDIR /app` picks the working folder inside the image and creates it if needed. Later lines work relative to it.",
        ),
        l(
          "`COPY package.json package-lock.json ./` bu iki dosyayı senin klasöründen image'daki `/app`'e kopyaladı. COPY bir layer ekler: sağda ikinci kat belirdi.",
          "`COPY package.json package-lock.json ./` copied those two files from your folder into `/app` in the image. COPY adds a layer: a second slab appeared on the right.",
        ),
      ],
      practice: {
        snippets: [{ label: "Dockerfile", code: "FROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./" }],
        commands: [],
      },
    },
    {
      short: l("RUN", "RUN"),
      tag: "how",
      predict: {
        question: l("`RUN npm ci` ekleyip yeniden build edeceğiz. Image'a ne olur?", "We will add `RUN npm ci` and build again. What happens to the image?"),
        options: [
          l("Değişmez, RUN sadece build sırasında çalışır", "Nothing: RUN only runs during the build"),
          l("Yeni bir layer eklenir: kurulan paketler image'ın içinde kalır", "A new layer is added: the installed packages stay in the image"),
          l("Container her başladığında npm ci çalışır", "npm ci runs every time a container starts"),
        ],
        answer: 1,
        why: l(
          "RUN, build sırasında bir komut çalıştırır ve yaptığı değişiklikleri yeni bir layer olarak kaydeder. Paketler image'ın parçası olur; container başlarken yeniden kurulmaz.",
          "RUN runs a command during the build and saves its changes as a new layer. The packages become part of the image and are not installed again when a container starts.",
        ),
      },
      title: l("RUN: build sırasında komut çalıştır", "RUN: run a command during the build"),
      body: [
        l(
          "`RUN npm ci` bağımlılıkları kurdu. Satırın yanında \"çalıştı 20s\" yazıyor ve yeni bir layer eklendi: image yaklaşık 60 MB büyüdü.",
          "`RUN npm ci` installed the dependencies. The line says \"ran 20s\", and a new layer was added: the image grew by about 60 MB.",
        ),
        l(
          "RUN sadece **build** sırasında çalışır. Kurulan paketler image'ın içinde kalır, yani her container onları hazır bulur.",
          "RUN only runs during the **build**. The installed packages stay inside the image, so every container finds them ready.",
        ),
      ],
      practice: {
        snippets: [
          {
            label: "Dockerfile",
            code: "RUN npm ci --omit=dev",
            note: l("`npm ci`, `package-lock.json`'a birebir uyar ve tekrar edilebilir kurulum yapar. Prod image'a geliştirme paketlerini koyma.", "`npm ci` follows `package-lock.json` exactly, so installs are repeatable. Keep dev dependencies out of a production image."),
          },
        ],
        commands: [],
      },
    },
    {
      short: l("COPY . .", "COPY . ."),
      tag: "how",
      title: l("Uygulamanın kendisini kopyala", "Copy the app itself"),
      body: [
        l(
          "`COPY . .` klasördeki her şeyi image'daki çalışma klasörüne (`/app`) kopyaladı. `server.js` artık `/app/server.js` olarak image'ın içinde.",
          "`COPY . .` copied everything in the folder into the working directory in the image (`/app`). `server.js` now lives at `/app/server.js`.",
        ),
        l(
          "Bütün klasörü neden en sonda kopyaladık, `package.json`'ı neden ayrı aldık? Cevap build cache'te; bir sonraki derste tam bunu göreceğiz.",
          "Why copy the whole folder last, and `package.json` on its own first? The answer is the build cache; that is the next lesson.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker build -t my-app .", note: l("Her değişiklikten sonra yeniden build edersin.", "Rebuild after every change.") }],
      },
    },
    {
      short: l("ENV, EXPOSE, CMD", "ENV, EXPOSE, CMD"),
      tag: "experiment",
      predict: {
        question: l(
          "Üç satır ekleyeceğiz: `ENV NODE_ENV=production`, `EXPOSE 3000`, `CMD [\"node\",\"server.js\"]`. Image kaç yeni layer kazanır?",
          "We will add three lines: `ENV NODE_ENV=production`, `EXPOSE 3000`, `CMD [\"node\",\"server.js\"]`. How many new layers does the image get?",
        ),
        options: [l("3", "3"), l("1", "1"), l("0: bunlar sadece ayar", "0: these are only settings")],
        answer: 2,
        why: l(
          "ENV, EXPOSE, CMD, WORKDIR ve USER dosya sistemini değiştirmez; image'ın ayarlarına (config) yazılır. Layer sayısı ve boyut aynı kalır.",
          "ENV, EXPOSE, CMD, WORKDIR and USER do not change the filesystem; they go into the image's settings (config). Layer count and size stay the same.",
        ),
      },
      title: l("Ayar satırları layer eklemez", "Settings lines add no layer"),
      body: [
        l(
          "Image'ın boyutu ve layer sayısı değişmedi. Üç satır sadece image'ın ayarlarına yazıldı:",
          "The image's size and layer count did not change. The three lines only went into its settings:",
        ),
        l(
          "`ENV` container'ın içinde bir ortam değişkeni tanımlar. `EXPOSE 3000` \"bu uygulama 3000'i dinler\" diye **belgeler**, portu dışarı açmaz; o iş `docker run -p`'nin. `CMD` container başlayınca çalışacak komuttur.",
          "`ENV` sets an environment variable inside the container. `EXPOSE 3000` **documents** \"this app listens on 3000\" but does not open the port; that is `docker run -p`'s job. `CMD` is the command that runs when the container starts.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "CMD'yi JSON biçiminde yaz: `CMD [\"node\", \"server.js\"]`. Düz yazım (`CMD node server.js`) komutu bir shell üzerinden çalıştırır ve durdurma sinyalleri uygulamana ulaşmayabilir.",
            "Write CMD in JSON form: `CMD [\"node\", \"server.js\"]`. The plain form (`CMD node server.js`) runs through a shell, and stop signals may never reach your app.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Dockerfile", code: 'ENV NODE_ENV=production\nEXPOSE 3000\nCMD ["node", "server.js"]' }],
        commands: [{ cmd: "docker history my-app", note: l("Her satırı ve boyutunu gösterir: ayar satırları 0B.", "Shows every line and its size: settings lines are 0B.") }],
      },
    },
    {
      short: l("ARG", "ARG"),
      tag: "experiment",
      predict: {
        question: l(
          "`ARG APP_VERSION=1` ikinci satırda. Aynı Dockerfile'ı `--build-arg APP_VERSION=2` ile tekrar build edersek ne olur?",
          "`ARG APP_VERSION=1` is on line two. If we build the same Dockerfile again with `--build-arg APP_VERSION=2`, what happens?",
        ),
        options: [
          l("Hepsi cache'ten gelir, sadece bir değişken değişti", "Everything comes from cache: only a variable changed"),
          l("ARG satırından sonraki adımlar yeniden çalışır", "The steps after the ARG line run again"),
          l("Sadece FROM yeniden indirilir", "Only FROM is pulled again"),
        ],
        answer: 1,
        why: l(
          "ARG'nin değeri build'in bir parçası. Değer değişince ARG'den sonraki RUN'lar farklı bir ortamda çalışır, Docker bu yüzden onları cache'ten alamaz.",
          "An ARG's value is part of the build. When it changes, the RUN lines after it run in a different environment, so Docker cannot take them from the cache.",
        ),
      },
      title: l("ARG: build sırasında değer ver", "ARG: a value for build time"),
      body: [
        l(
          "İlk build varsayılan değerle (1) yapıldı. İkincide `--build-arg APP_VERSION=2` verdik: FROM cache'ten geldi, ARG satırından sonraki her şey yeniden çalıştı.",
          "The first build used the default (1). The second passed `--build-arg APP_VERSION=2`: FROM came from the cache, and everything after the ARG line ran again.",
        ),
        l(
          "ARG sadece **build** sırasında vardır; çalışan container onu görmez. Container'a da lazımsa `ENV APP_VERSION=$APP_VERSION` ile ENV'e aktar.",
          "ARG exists only during the **build**; a running container never sees it. If the container needs it too, pass it on with `ENV APP_VERSION=$APP_VERSION`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Şifreyi ARG ile verme: değer `docker history` ile görülebilir. Build sırasında gizli bilgi gerekiyorsa `RUN --mount=type=secret` kullan.",
            "Do not pass passwords as ARG: the value can be seen with `docker history`. For secrets during a build, use `RUN --mount=type=secret`.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "FROM'dan **önce** yazılan bir ARG sadece FROM satırında kullanılabilir (`FROM node:${NODE_VERSION}`). Sonraki satırlarda da lazımsa FROM'dan sonra `ARG NODE_VERSION` diye tekrar yazman gerekir.",
            "An ARG written **before** FROM can only be used in the FROM line (`FROM node:${NODE_VERSION}`). To use it later too, declare `ARG NODE_VERSION` again after FROM.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Dockerfile", code: "ARG NODE_VERSION=22\nFROM node:${NODE_VERSION}-slim\nARG APP_VERSION=dev\nENV APP_VERSION=$APP_VERSION" }],
        commands: [{ cmd: "docker build --build-arg APP_VERSION=1.4.0 -t my-app:1.4.0 ." }],
      },
    },
    {
      short: l("ADD mi COPY mi?", "ADD or COPY?"),
      tag: "how",
      title: l("ADD: COPY'nin fazla bilen kardeşi", "ADD: COPY's know-it-all sibling"),
      body: [
        l(
          "`ADD` de dosya kopyalar, ama iki şeyi fazladan yapar: bir URL'den dosya indirebilir ve yerel bir `.tar` arşivini (sıkıştırılmış olanlar dahil) hedefe **açar**.",
          "`ADD` copies files too, but it does two more things: it can download from a URL, and it **unpacks** a local `.tar` archive (compressed ones too) into the target.",
        ),
        l(
          "Bu fazlalık sürpriz demek: bir arşivi olduğu gibi kopyalamak isterken açılmış bulursun. Kural basit: normalde **COPY** kullan, ADD'i sadece bir tar'ı açmak için seç.",
          "That extra means surprises: you wanted the archive copied as is and found it unpacked. The rule is simple: use **COPY** by default, and pick ADD only to unpack a tar.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede ADD, COPY gibi davranıyor; arşiv açma ve URL indirme modellenmedi. URL'den bir şey lazımsa çoğu zaman `RUN curl ...` daha açıktır: ne indirdiğin ve doğrulaması Dockerfile'da görünür.",
            "On this stage ADD behaves like COPY; unpacking and URL downloads are not modelled. If you need something from a URL, `RUN curl ...` is usually clearer: what you fetch and how you check it is visible in the Dockerfile.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "Dockerfile", code: "COPY config/ /app/config/\nADD vendor.tar.gz /opt/vendor/" }],
        commands: [],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Kendi projen için tam bir Dockerfile", "A full Dockerfile for your own project"),
      body: [
        l(
          "Aynı Dockerfile'ı bir kez daha build ettik: her satır CACHED, süre 0. Hiçbir şey değişmediyse Docker tekrar iş yapmaz.",
          "We built the same Dockerfile once more: every line CACHED, 0 seconds. If nothing changed, Docker does no work again.",
        ),
        l(
          "Aşağıda bir Node ve bir Python projesi için başlangıç Dockerfile'ları var. Build et, sonra `docker run -p 3000:3000 my-app` ile çalıştır.",
          "Below are starter Dockerfiles for a Node and a Python project. Build one, then run it with `docker run -p 3000:3000 my-app`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Docker artık build için BuildKit kullanıyor: bağımsız adımları paralel çalıştırır ve çıktıyı `#5 [3/6] RUN npm ci` gibi numaralı satırlarla gösterir. Burada adımlar sırayla ve saniyeler yuvarlak sayılarla gösteriliyor.",
            "Docker now builds with BuildKit: it runs independent steps in parallel and prints numbered lines like `#5 [3/6] RUN npm ci`. Here steps run in order and seconds are round numbers.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker build -t my-app ." },
          { cmd: "docker run -d -p 3000:3000 --name my-app my-app" },
          { cmd: "docker image ls my-app", note: l("Image'ın boyutunu görürsün.", "Shows the image's size.") },
        ],
        snippets: [
          { label: "Dockerfile · Node", code: NODE_DOCKERFILE },
          { label: "Dockerfile · Python", code: PY_DOCKERFILE },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you write one"),
      body: [
        l(
          "Sıra sende. Proje klasöründe `package.json`, `package-lock.json` ve `server.js` var. Aşağıda gerçek işten **5 senaryo** var: Dockerfile'ı `nano Dockerfile` ile **kendin yaz**, `docker build -t my-app .` ile build et; sahne her satırın ne yaptığını gösterir.",
          "Your turn. The project folder holds `package.json`, `package-lock.json` and `server.js`. Below are **5 scenarios** from real work: **write the Dockerfile yourself** with `nano Dockerfile` and build it with `docker build -t my-app .`; the scene shows what each line does.",
        ),
        l(
          "`cat Dockerfile` dosyanın son halini, `docker images` image'ların boyutunu gösterir. Editörü kaydetmek bir komut sayılır; ipuçları adım adım açılır, az komutla bitirirsen 3 yıldız alırsın.",
          "`cat Dockerfile` shows the file as it is, `docker images` shows image sizes. Saving the editor counts as one command; hints open one at a time, and few commands earn 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Dockerfile yukarıdan aşağı okunur ve her zaman `FROM` ile başlar; base image'ın tag'ini hep yaz.", "A Dockerfile is read top to bottom and always starts with `FROM`; always write the base image's tag."),
    l("`COPY` ve `RUN` image'a layer ekler; `ENV`, `WORKDIR`, `EXPOSE`, `CMD` sadece ayardır.", "`COPY` and `RUN` add layers; `ENV`, `WORKDIR`, `EXPOSE` and `CMD` are only settings."),
    l("`RUN` build sırasında çalışır; sonucu image'da kalır, container başlarken tekrar çalışmaz.", "`RUN` runs at build time; its result stays in the image and does not run again when a container starts."),
    l("`EXPOSE` portu belgeler; dışarı açmak `docker run -p`'nin işidir.", "`EXPOSE` documents a port; opening it is `docker run -p`'s job."),
    l("`ARG` sadece build sırasında vardır ve değeri değişince sonraki adımlar yeniden çalışır; şifre için kullanma.", "`ARG` exists only during the build, and changing it reruns the steps after it; never use it for passwords."),
    l("Normalde `COPY` kullan; `ADD` URL indirir ve tar açar, sürpriz yapar.", "Use `COPY` by default; `ADD` downloads URLs and unpacks tars, which surprises people."),
  ],
  quiz: [
    {
      question: l("Hangi satır image'a yeni bir layer ekler?", "Which line adds a new layer to the image?"),
      options: [l("`ENV PORT=3000`", "`ENV PORT=3000`"), l("`EXPOSE 3000`", "`EXPOSE 3000`"), l("`RUN apt-get install -y curl`", "`RUN apt-get install -y curl`"), l("`CMD [\"node\",\"app.js\"]`", "`CMD [\"node\",\"app.js\"]`")],
      answer: 2,
      explain: l("RUN dosya sistemini değiştirir ve bir layer olarak kaydedilir. Diğerleri image'ın ayarlarıdır.", "RUN changes the filesystem and is saved as a layer. The others are image settings."),
      reviewStep: 4,
    },
    {
      question: l("Dockerfile'da `EXPOSE 8080` var ama `docker run my-app` ile başlattın. Tarayıcıdan localhost:8080 açılır mı?", "The Dockerfile has `EXPOSE 8080`, but you ran `docker run my-app`. Does localhost:8080 open in a browser?"),
      options: [l("Evet, EXPOSE portu açar", "Yes, EXPOSE opens it"), l("Hayır, `-p 8080:8080` gerekir", "No, you need `-p 8080:8080`"), l("Sadece Linux'ta", "Only on Linux"), l("Sadece `-d` ile", "Only with `-d`")],
      answer: 1,
      explain: l("EXPOSE sadece belgeler. Portu host'a açan `docker run -p`'dir.", "EXPOSE only documents. `docker run -p` is what opens the port on the host."),
      reviewStep: 4,
    },
    {
      question: l("`RUN npm ci` satırı image build edilirken mi, container her başladığında mı çalışır?", "Does `RUN npm ci` run while the image is built, or every time a container starts?"),
      options: [l("Build sırasında, bir kez", "During the build, once"), l("Her container başlangıcında", "On every container start"), l("İkisinde de", "Both"), l("Sadece `docker run --build` ile", "Only with `docker run --build`")],
      answer: 0,
      explain: l("RUN build zamanında çalışır; container başlarken çalışan CMD'dir.", "RUN runs at build time; what runs when a container starts is CMD."),
      reviewStep: 2,
    },
    {
      question: l("Bir API anahtarını build sırasında `ARG API_KEY` ile verdin. Sorun ne?", "You passed an API key at build time with `ARG API_KEY`. What is the problem?"),
      options: [
        l("ARG değeri image geçmişinde görülebilir", "The ARG value can be seen in the image history"),
        l("ARG 255 karakterden uzun olamaz", "ARG cannot be longer than 255 characters"),
        l("ARG sadece Linux'ta çalışır", "ARG only works on Linux"),
        l("Sorun yok", "No problem"),
      ],
      answer: 0,
      explain: l("Build argümanları `docker history`'de görünebilir. Gizli bilgi için BuildKit secret mount kullan.", "Build arguments can show up in `docker history`. Use a BuildKit secret mount for secrets."),
      reviewStep: 5,
    },
  ],
};
