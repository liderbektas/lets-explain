import { l } from "@lets-explain/core/i18n";
import { projectSetup, runLine } from "../../engine/cli";
import { createHost, findContainer, imageFor, type Files, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter } from "../shared/missionHelpers";

/** A small Express shop the way it sits in a real folder before Docker: source, lockfile, installed modules, git, secrets. */
export const SERVER_JS = `const express = require("express");
const app = express();
app.use(express.static(__dirname));
app.listen(3000, () => console.log("shop on :3000"));`;

export const APP_FILES: Files = {
  "package.json": '{"name":"shop","scripts":{"start":"node server.js"},"dependencies":{"express":"^4.21.0"}}',
  "package-lock.json": "lockfile v3",
  "server.js": SERVER_JS,
  "index.html": "Merhaba v1",
  "node_modules/express/index.js": "size:200",
  ".git/HEAD": "ref: refs/heads/main",
  ".env": "STRIPE_KEY=sk_live_51Hx_secret",
};

/** Copies everything first: every code change re-runs npm ci. */
export const DOCKERFILE_NAIVE = `FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "server.js"]`;

/** The recipe from the lesson: dependencies first, source after. */
export const DOCKERFILE_SMART = `FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`;

export const DOCKERFILE_NODE_USER = DOCKERFILE_SMART.replace("EXPOSE 3000", "USER node\nEXPOSE 3000");
export const DOCKERIGNORE = "node_modules\n.git\n.env\n";

/** Runs typed lines to build a start state, the same way a reader would have typed them. */
export function typed(h: Host, lines: string[]): Host {
  let state = h;
  for (const line of lines) state = hostAfter(runLine(state, line).actions, state);
  return state;
}

/** The project folder, no Dockerfile yet. */
export const FOLDER: Host = hostAfter(projectSetup(APP_FILES), createHost());

/** The project with the lesson's Dockerfile and .dockerignore, built and running as `shop` on :3000. */
export const SHIPPED: Host = typed(hostAfter(projectSetup({ Dockerfile: DOCKERFILE_SMART, ".dockerignore": DOCKERIGNORE }), FOLDER), [
  "docker build -t shop .",
  "docker run -d --name shop -p 3000:3000 shop",
]);

/** Files that ended up inside an image. */
const imageFiles = (h: Host, ref: string): string[] => (imageFor(h, ref)?.layers ?? []).flatMap((x) => Object.keys(x.files));

/** Successful curls to :3000 in the run, with their position and the page they got. */
const pages = (ctx: DockerCtx) =>
  ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "curlResult" && e.port === 3000 && e.ok ? [{ i, body: e.body }] : [])));

/** Builds in the run: where they happened, how long, and whether npm ci came from cache. */
const builds = (ctx: DockerCtx) =>
  ctx.events.flatMap((evs, i) =>
    evs.flatMap((e) => (e.type === "built" ? [{ i, seconds: e.seconds, npmCached: evs.some((x) => x.type === "buildStep" && x.step.text.includes("npm ci") && x.step.cached) }] : [])),
  );

export const scenarios: DockerScenario[] = [
  {
    id: "first-dockerfile",
    title: l("İlk Dockerfile", "First Dockerfile"),
    story: l(
      "Projenin henüz Dockerfile'ı yok. Node 22 ile çalışan küçük bir Express uygulaması: bağımlılıklar `npm ci --omit=dev` ile kurulur, `node server.js` ile başlar ve 3000'i dinler.",
      "The project has no Dockerfile yet. It's a small Express app on Node 22: dependencies install with `npm ci --omit=dev`, it starts with `node server.js` and listens on 3000.",
    ),
    goal: l("Kendi image'ından bir container `localhost:3000`'den sayfayı göstersin.", "A container from your own image serves the page on `localhost:3000`."),
    start: FOLDER,
    hints: [
      l("Üç adım: tarifi yaz (`Dockerfile`), ondan image üret (`docker build`), image'dan container başlat (`docker run`).", "Three steps: write the recipe (`Dockerfile`), make an image from it (`docker build`), start a container from the image (`docker run`)."),
      l(
        "`nano Dockerfile`: `FROM node:22-slim`, `WORKDIR /app`, `COPY` ile dosyalar, `RUN npm ci --omit=dev`, `CMD [\"node\", \"server.js\"]`. Sonra `docker build -t shop .` ve `-p 3000:3000` ile `docker run`.",
        "`nano Dockerfile`: `FROM node:22-slim`, `WORKDIR /app`, the files with `COPY`, `RUN npm ci --omit=dev`, `CMD [\"node\", \"server.js\"]`. Then `docker build -t shop .` and `docker run` with `-p 3000:3000`.",
      ),
      l(
        "`nano Dockerfile` (yukarıdaki satırlar), `docker build -t shop .`, `docker run -d -p 3000:3000 shop`, sonra `curl localhost:3000`",
        "`nano Dockerfile` (the lines above), `docker build -t shop .`, `docker run -d -p 3000:3000 shop`, then `curl localhost:3000`",
      ),
    ],
    par: 3,
    check: (ctx) => pages(ctx).some((p) => p.body.includes("Merhaba")),
  },
  {
    id: "secret-in-image",
    title: l("Image'da sır var", "A secret in the image"),
    story: l(
      "Code review'da biri sordu: `.env`'deki canlı Stripe anahtarı image'ın içine mi giriyor? Dockerfile `COPY . .` yapıyor ve projede `.dockerignore` yok; yerel `node_modules` ve `.git` de image'a taşınıyor.",
      "In code review someone asked: does the live Stripe key in `.env` end up inside the image? The Dockerfile does `COPY . .` and there's no `.dockerignore`, so the local `node_modules` and `.git` go in too.",
    ),
    goal: l("`shop` image'ını yeniden üret: içinde `.env`, `.git` ve yerel `node_modules` **olmasın**.", "Rebuild the `shop` image without `.env`, `.git` or the local `node_modules` **in it**."),
    start: typed(hostAfter(projectSetup({ Dockerfile: DOCKERFILE_SMART }), FOLDER), ["docker build -t shop ."]),
    hints: [
      l("`docker build` klasörü olduğu gibi gönderir; neyin gönderilmeyeceğini projedeki bir dosya söyler.", "`docker build` sends the folder as it is; a file in the project says what to leave out."),
      l("`.dockerignore`, her satırda bir ad: `node_modules`, `.git`, `.env`. Sonra yeniden build et.", "`.dockerignore`, one name per line: `node_modules`, `.git`, `.env`. Then build again."),
      l("`nano .dockerignore` (`node_modules`, `.git`, `.env`) sonra `docker build -t shop .`", "`nano .dockerignore` (`node_modules`, `.git`, `.env`) then `docker build -t shop .`"),
    ],
    par: 2,
    check: (ctx) => {
      const files = imageFiles(ctx.state, "shop");
      return files.length > 0 && eventsOf(ctx, "built").length > 0 && !files.some((f) => f.endsWith("/.env") || f.includes("/.git/") || f.includes("node_modules/express"));
    },
  },
  {
    id: "slow-builds",
    title: l("Yavaş build", "Slow builds"),
    story: l(
      "Her küçük HTML değişikliğinden sonra build 30 saniye sürüyor: Dockerfile önce `COPY . .` yapıyor, sonra `npm ci`. Kod değişince `npm ci`'nin cache'i de kırılıyor.",
      "After every small HTML change the build takes 30 seconds: the Dockerfile does `COPY . .` first, then `npm ci`. When the code changes, `npm ci` loses its cache too.",
    ),
    goal: l(
      "Dockerfile'ı düzelt; sonra `index.html`'i değiştirip yeniden build et: `npm ci` **cache'ten** gelsin, build 5 saniyenin altında bitsin.",
      "Fix the Dockerfile; then change `index.html` and rebuild: `npm ci` comes **from cache** and the build takes under 5 seconds.",
    ),
    start: typed(hostAfter(projectSetup({ Dockerfile: DOCKERFILE_NAIVE, ".dockerignore": DOCKERIGNORE }), FOLDER), ["docker build -t shop ."]),
    hints: [
      l("Bir katmanın cache'i, ondan önceki her şey aynıysa kullanılır. `npm ci` sadece `package*.json`'a bağlı.", "A layer's cache is used when everything before it is the same. `npm ci` only depends on `package*.json`."),
      l("Önce `COPY package.json package-lock.json ./`, sonra `RUN npm ci --omit=dev`, en son `COPY . .`. Yeni sıra bir kez build edilmeli; sonra kodu değiştirip tekrar build et.", "First `COPY package.json package-lock.json ./`, then `RUN npm ci --omit=dev`, `COPY . .` last. The new order needs one build; then change the code and build again."),
      l(
        "`nano Dockerfile` (sırayı değiştir), `docker build -t shop .`, `echo \"Merhaba v2\" > index.html`, `docker build -t shop .`",
        "`nano Dockerfile` (change the order), `docker build -t shop .`, `echo \"Merhaba v2\" > index.html`, `docker build -t shop .`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const edit = ctx.actions.map((a) => (a.type === "editHost" && a.path.endsWith("/index.html") ? 1 : 0)).lastIndexOf(1);
      return edit >= 0 && builds(ctx).some((b) => b.i > edit && b.seconds < 5 && b.npmCached);
    },
  },
  {
    id: "ship-v2",
    title: l("v2 yayında değil", "v2 isn't live"),
    story: l(
      "`index.html`'i güncelledin, artık `Merhaba v2` yazıyor. Ama `localhost:3000` hâlâ v1 gösteriyor. `shop` adlı container çalışıyor.",
      "You updated `index.html`; it says `Merhaba v2` now. But `localhost:3000` still shows v1. A container named `shop` is running.",
    ),
    goal: l("`localhost:3000` **v2**'yi göstersin.", "`localhost:3000` shows **v2**."),
    start: hostAfter(projectSetup({ "index.html": "Merhaba v2" }), SHIPPED),
    hints: [
      l("Çalışan container kodu image'ın içinden okuyor; image ise eski koddan yapıldı.", "The running container reads the code from inside its image, and the image was made from the old code."),
      l("Yeni kod için yeni image (`docker build`), yeni image için yeni container (`docker rm -f` + `docker run`).", "New code needs a new image (`docker build`); a new image needs a new container (`docker rm -f` + `docker run`)."),
      l(
        "`docker build -t shop .`, `docker rm -f shop`, `docker run -d --name shop -p 3000:3000 shop`, sonra `curl localhost:3000`",
        "`docker build -t shop .`, `docker rm -f shop`, `docker run -d --name shop -p 3000:3000 shop`, then `curl localhost:3000`",
      ),
    ],
    par: 3,
    check: (ctx) => pages(ctx).some((p) => p.body.includes("v2")),
  },
  {
    id: "not-root",
    title: l("Root olmasın", "Not as root"),
    story: l(
      "Güvenlik taraması uyarıyor: `shop` container'ı root olarak çalışıyor. `node:22-slim` image'ında `node` adlı sıradan bir kullanıcı hazır. Bu image'tan çalışan her container root olmamalı.",
      "The security scan warns: the `shop` container runs as root. `node:22-slim` already has an ordinary user called `node`. Every container from this image should run without root.",
    ),
    goal: l("`shop` image'ı `node` kullanıcısıyla çalışacak şekilde yeniden üretilsin ve `shop` container'ı ondan 3000'de çalışsın.", "The `shop` image is rebuilt to run as `node`, and the `shop` container runs from it on 3000."),
    start: SHIPPED,
    hints: [
      l("Container'ın hangi kullanıcıyla çalışacağını image söyler: Dockerfile'da bir satır.", "Which user a container runs as is set by the image: one line in the Dockerfile."),
      l("`CMD`'den önce `USER node` ekle; sonra yeni image, yeni container.", "Add `USER node` before `CMD`; then a new image and a new container."),
      l(
        "`nano Dockerfile` (`USER node`), `docker build -t shop .`, `docker rm -f shop`, `docker run -d --name shop -p 3000:3000 shop`",
        "`nano Dockerfile` (`USER node`), `docker build -t shop .`, `docker rm -f shop`, `docker run -d --name shop -p 3000:3000 shop`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const c = findContainer(ctx.state, "shop");
      const img = imageFor(ctx.state, "shop");
      return Boolean(c && c.state === "running" && c.user === "node" && img?.config.user === "node" && c.image === img.id && c.ports.some((p) => p.host === 3000));
    },
  },
];
