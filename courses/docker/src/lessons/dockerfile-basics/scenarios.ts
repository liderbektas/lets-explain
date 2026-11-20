import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, imageFor, type Files, type Host, type Image } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

/** The project folder: a small Express app, its dependency list and lock file. */
export const APP_FILES: Files = {
  "package.json": '{"name":"shop","scripts":{"start":"node server.js"},"dependencies":{"express":"^4"}}',
  "package-lock.json": '{"lockfileVersion":3}',
  "server.js": 'const app = require("express")();\napp.get("/", (req, res) => res.send("shop"));\napp.listen(3000);',
};

/** A laptop with node:22-slim pulled and the project folder, plus whatever Dockerfile is given. */
export function laptop(dockerfile?: string): Host {
  return hostAfter(projectSetup(dockerfile === undefined ? APP_FILES : { ...APP_FILES, Dockerfile: dockerfile }), createHost({ pulled: ["node:22-slim", "alpine:3.20"] }));
}

/** The complete Dockerfile this lesson builds up to. */
export const FULL = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`;

const allFiles = (img: Image) => Object.assign({}, ...img.layers.map((x) => x.files)) as Files;
/** The image runs the Express server: its program was read from server.js and listens on 3000. */
const runsServer = (img: Image | undefined) => Boolean(img && img.config.program.kind === "app" && img.config.program.listens === 3000);

export const scenarios: DockerScenario[] = [
  {
    id: "first-image",
    title: l("İlk image", "First image"),
    story: l(
      "Ekip mağaza uygulamasını container'da çalıştırmak istiyor. Proje klasöründe `server.js` ve `package.json` var ama henüz **Dockerfile yok**. `node:22-slim` image'ı makinede hazır.",
      "The team wants to run the shop app in a container. The project folder has `server.js` and `package.json`, but **no Dockerfile** yet. The `node:22-slim` image is on the machine.",
    ),
    goal: l("`my-app` adında, başlayınca `node server.js` çalıştıran bir image build et.", "Build an image called `my-app` that runs `node server.js` when it starts."),
    start: laptop(),
    hints: [
      l("Dockerfile'ı `nano Dockerfile` ile yaz. Her Dockerfile bir `FROM` ile başlar; container açılınca ne çalışacağını `CMD` söyler. Kodu da image'a kopyalaman gerekir.", "Write the Dockerfile with `nano Dockerfile`. Every Dockerfile starts with `FROM`; `CMD` says what runs when the container starts. The code has to be copied into the image too."),
      l("`FROM node:22-slim`, `WORKDIR /app`, `COPY . .`, `CMD [\"node\", \"server.js\"]`. Sonra `docker build -t my-app .`", "`FROM node:22-slim`, `WORKDIR /app`, `COPY . .`, `CMD [\"node\", \"server.js\"]`. Then `docker build -t my-app .`"),
      l(
        "`nano Dockerfile` ile şunu yaz:\n`FROM node:22-slim` / `WORKDIR /app` / `COPY . .` / `CMD [\"node\", \"server.js\"]`\nkaydet, sonra `docker build -t my-app .`",
        "Write this with `nano Dockerfile`:\n`FROM node:22-slim` / `WORKDIR /app` / `COPY . .` / `CMD [\"node\", \"server.js\"]`\nsave, then `docker build -t my-app .`",
      ),
    ],
    par: 2,
    check: (ctx) => runsServer(imageFor(ctx.state, "my-app")),
  },
  {
    id: "with-deps",
    title: l("Bağımlılıklar nerede?", "Where are the dependencies?"),
    story: l(
      "Arkadaşının Dockerfile'ı kodu kopyalıyor ama bağımlılıkları hiç kurmuyor: image'da `node_modules` yok, `express` bulunamayacak. Kurulum `npm ci` ile yapılmalı ve `npm ci`, `package.json` image'a girdikten **sonra** çalışmalı.",
      "Your friend's Dockerfile copies the code but never installs the dependencies: there's no `node_modules` in the image, so `express` won't be found. Install them with `npm ci`, and `npm ci` must run **after** `package.json` is in the image.",
    ),
    goal: l("`my-app` image'ında `npm ci` ile kurulmuş bağımlılıklar ve `server.js` olsun; uygulama yine `node server.js` ile başlasın.", "The `my-app` image holds dependencies installed by `npm ci` and `server.js`, and still starts with `node server.js`."),
    start: laptop('FROM node:22-slim\nWORKDIR /app\nCOPY server.js .\nCMD ["node", "server.js"]'),
    hints: [
      l("Bir `RUN` satırı, o ana kadar image'a kopyalanmış dosyaları görür. `npm ci`'nin `package.json` ve `package-lock.json`'a ihtiyacı var.", "A `RUN` line sees only the files copied into the image so far. `npm ci` needs `package.json` and `package-lock.json`."),
      l("Önce `COPY package*.json ./`, sonra `RUN npm ci`. Ardından Dockerfile'ı yeniden build et.", "First `COPY package*.json ./`, then `RUN npm ci`. Then build the Dockerfile again."),
      l(
        "`nano Dockerfile`: `WORKDIR /app`'ten sonra `COPY package*.json ./` ve `RUN npm ci` ekle, kaydet; sonra `docker build -t my-app .`",
        "`nano Dockerfile`: after `WORKDIR /app` add `COPY package*.json ./` and `RUN npm ci`, save; then `docker build -t my-app .`",
      ),
    ],
    par: 2,
    check: (ctx) => {
      const img = imageFor(ctx.state, "my-app");
      if (!img || !runsServer(img)) return false;
      const npm = img.layers.findIndex((x) => /^RUN npm (ci|install)/.test(x.instruction));
      const pkg = img.layers.findIndex((x) => Object.keys(x.files).some((p) => p.endsWith("/package.json")));
      return npm > 0 && pkg >= 0 && pkg < npm && Object.keys(allFiles(img)).some((p) => p.endsWith("/server.js"));
    },
  },
  {
    id: "right-folder",
    title: l("Kök klasör dağınık", "A messy root"),
    story: l(
      "Image çalışıyor, ama `docker run --rm my-app ls /` yazınca kodun `/bin`, `/etc` gibi sistem klasörlerinin yanına, kökün içine saçıldığı görülüyor. Ekipte herkes kodu `/app`'te arıyor.",
      "The image works, but `docker run --rm my-app ls /` shows the code dumped in the root, next to system folders like `/bin` and `/etc`. Everyone on the team looks for the code in `/app`.",
    ),
    goal: l("`my-app` image'ında kod `/app/server.js` olarak dursun ve uygulama yine başlasın.", "In the `my-app` image the code sits at `/app/server.js`, and the app still starts."),
    start: laptop('FROM node:22-slim\nCOPY . .\nCMD ["node", "server.js"]'),
    hints: [
      l("`COPY . .` dosyaları o anki çalışma klasörüne koyar; hiç ayarlanmadıysa bu `/`'dır.", "`COPY . .` puts files in the current working directory; if none was set, that's `/`."),
      l("`WORKDIR /app` sonraki bütün satırların klasörünü belirler; `COPY`'den **önce** gelmeli.", "`WORKDIR /app` sets the folder for every line after it; it must come **before** `COPY`."),
      l("`nano Dockerfile`: `FROM`'dan hemen sonra `WORKDIR /app` ekle, kaydet; sonra `docker build -t my-app .`", "`nano Dockerfile`: add `WORKDIR /app` right after `FROM`, save; then `docker build -t my-app .`"),
    ],
    par: 2,
    check: (ctx) => {
      const img = imageFor(ctx.state, "my-app");
      return Boolean(img && runsServer(img) && allFiles(img)["/app/server.js"] !== undefined && allFiles(img)["/server.js"] === undefined);
    },
  },
  {
    id: "ready-for-prod",
    title: l("Ops'un istekleri", "What ops asked for"),
    story: l(
      "Operasyon ekibi image'ın iki şeyi kendisi söylemesini istiyor: hangi portu dinlediğini (`3000`) ve varsayılan olarak production modunda çalıştığını (`NODE_ENV=production`).",
      "The ops team wants the image to say two things itself: which port it listens on (`3000`), and that it runs in production mode by default (`NODE_ENV=production`).",
    ),
    goal: l("`my-app` image'ı `3000`'i bildirsin ve `NODE_ENV=production` ile gelsin.", "The `my-app` image declares port `3000` and comes with `NODE_ENV=production`."),
    start: laptop('FROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nCMD ["node", "server.js"]'),
    hints: [
      l("İkisi de image'ın ayarlarıdır, yeni layer eklemezler: biri bir ortam değişkeni, öbürü bir port bildirimi.", "Both are image settings and add no layer: one is an environment variable, the other declares a port."),
      l("`ENV NODE_ENV=production` ve `EXPOSE 3000`, `CMD`'den önce.", "`ENV NODE_ENV=production` and `EXPOSE 3000`, before `CMD`."),
      l("`nano Dockerfile`: `ENV NODE_ENV=production` ve `EXPOSE 3000` ekle, kaydet; sonra `docker build -t my-app .`", "`nano Dockerfile`: add `ENV NODE_ENV=production` and `EXPOSE 3000`, save; then `docker build -t my-app .`"),
    ],
    par: 2,
    check: (ctx) => {
      const img = imageFor(ctx.state, "my-app");
      return Boolean(img && runsServer(img) && img.config.env.NODE_ENV === "production" && img.config.exposed.includes(3000));
    },
  },
  {
    id: "ship-it",
    title: l("Build et ve aç", "Build it and open it"),
    story: l(
      "Dockerfile hazır ve gözden geçirildi. Ürün yöneticisi uygulamayı tarayıcısında `localhost:3000`'de görmek istiyor; terminalin de serbest kalmalı.",
      "The Dockerfile is ready and reviewed. The product manager wants to see the app in the browser at `localhost:3000`, and your terminal should stay free.",
    ),
    goal: l("`my-app` image'ından bir container arka planda çalışsın ve `localhost:3000`'den cevap versin.", "A container from the `my-app` image runs in the background and answers on `localhost:3000`."),
    start: laptop(FULL),
    hints: [
      l("Önce Dockerfile'dan image yapılır, sonra image'dan container başlatılır.", "First the Dockerfile becomes an image, then the image starts a container."),
      l("`docker build -t my-app .`, sonra `docker run` ile `-d` ve `-p 3000:3000`.", "`docker build -t my-app .`, then `docker run` with `-d` and `-p 3000:3000`."),
      l("`docker build -t my-app .` sonra `docker run -d -p 3000:3000 my-app`", "`docker build -t my-app .` then `docker run -d -p 3000:3000 my-app`"),
    ],
    par: 2,
    check: (ctx) => {
      const id = imageFor(ctx.state, "my-app")?.id;
      return Object.values(ctx.state.containers).some((c) => c.image === id && c.state === "running" && c.ports.some((p) => p.host === 3000 && p.container === 3000));
    },
  },
];

