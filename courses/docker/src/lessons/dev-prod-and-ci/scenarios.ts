import { l } from "@lets-explain/core/i18n";
import { projectSetup, runLine } from "../../engine/cli";
import { createHost, findContainer, imageFor, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";
import { APP_FILES, DOCKERIGNORE } from "../dockerize-your-app/scenarios";

export const REPO = "ghcr.io/ada/shop";

/** One Dockerfile, two targets: `dev` for working on the code, `prod` for shipping it. */
export const DOCKERFILE = `FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./

FROM base AS prod
RUN npm ci --omit=dev
COPY . .
USER node
CMD ["node", "server.js"]

FROM base AS dev
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]`;

/** Shared by every environment: the image name, its tag from TAG. */
export const COMPOSE = `name: shop

services:
  app:
    image: ghcr.io/ada/shop:\${TAG:-dev}
`;

/** Development, read automatically by `docker compose`: build the dev stage and mount the code. */
export const COMPOSE_OVERRIDE = `services:
  app:
    build:
      context: .
      target: dev
    ports:
      - "3000:3000"
    volumes:
      - ./:/app
`;

/** Production, only with -f: the published image, on 8080, restarted if it stops. */
export const COMPOSE_PROD = `services:
  app:
    ports:
      - "8080:3000"
    restart: always
`;

const FILES = {
  ...APP_FILES,
  "package.json": '{"name":"shop","scripts":{"start":"node server.js","dev":"node server.js"},"dependencies":{"express":"^4.21.0"}}',
  Dockerfile: DOCKERFILE,
  ".dockerignore": DOCKERIGNORE,
  "compose.yaml": COMPOSE,
  "compose.override.yaml": COMPOSE_OVERRIDE,
  "compose.prod.yaml": COMPOSE_PROD,
};

/** Runs typed lines to build a start state, the same way a reader would have typed them. */
export function typed(h: Host, lines: string[]): Host {
  let state = h;
  for (const line of lines) state = hostAfter(runLine(state, line).actions, state);
  return state;
}

/** Your laptop with the project checked out, nothing running. */
export const LAPTOP: Host = hostAfter(projectSetup(FILES), createHost());

/** Dev is up on :3000 with the code mounted. */
const DEV_UP = typed(LAPTOP, ["docker compose up -d"]);

/** Dev up, and a prod build of the same code running as `prod` on :8080. */
const BOTH = typed(DEV_UP, ["docker build --target prod -t shop:1.0 .", "docker run -d --name prod -p 8080:3000 shop:1.0"]);

/** Logged in to GHCR; CI is down today. */
const LOGGED_IN = typed(LAPTOP, ["echo $GITHUB_TOKEN | docker login ghcr.io -u ada --password-stdin"]);

/** A server: only the deploy files, logged in, and CI has already pushed sha-8b1d24e. */
const SERVER: Host = (() => {
  const ci = typed(LOGGED_IN, [`docker build --target prod -t ${REPO}:sha-8b1d24e .`, `docker push ${REPO}:sha-8b1d24e`]);
  // The server never built anything: forget the local images, keep the registry.
  const fresh = createHost();
  return hostAfter(projectSetup({ "compose.yaml": COMPOSE, "compose.prod.yaml": COMPOSE_PROD }), { ...fresh, registry: ci.registry });
})();

/** Successful curls in the run, with where they happened and the page. */
const pages = (ctx: DockerCtx) => ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "curlResult" && e.ok ? [{ i, port: e.port, body: e.body }] : [])));
const lastEditOf = (ctx: DockerCtx, file: string) => ctx.actions.map((a) => (a.type === "editHost" && a.path.endsWith(`/${file}`) ? 1 : 0)).lastIndexOf(1);

/** The image a container runs was made from the prod stage: it runs as node. */
const isProd = (h: Host, ref: string) => imageFor(h, ref)?.config.user === "node";

export const scenarios: DockerScenario[] = [
  {
    id: "first-dev",
    title: l("Geliştirme ortamı", "Dev environment"),
    story: l(
      "Yeni bilgisayarında projeyi açtın. `compose.yaml` ve otomatik okunan `compose.override.yaml` geliştirme ortamını tarif ediyor: Dockerfile'ın `dev` aşaması, 3000 portu ve kod klasörünün container'a bağlanması.",
      "You opened the project on your new computer. `compose.yaml` and the automatically read `compose.override.yaml` describe the dev setup: the Dockerfile's `dev` stage, port 3000, and the code folder mounted into the container.",
    ),
    goal: l(
      "Dev ortamını başlat; sonra `index.html`'i `Merhaba v2` yap ve `localhost:3000` onu **hiç build yapmadan** göstersin.",
      "Start dev; then change `index.html` to `Merhaba v2` and have `localhost:3000` show it **without another build**.",
    ),
    start: LAPTOP,
    hints: [
      l("`docker compose` hem `compose.yaml`'ı hem `compose.override.yaml`'ı okur. Dev container'ı kodu klasöründen okuyor.", "`docker compose` reads both `compose.yaml` and `compose.override.yaml`. The dev container reads the code from your folder."),
      l("Bir kez `docker compose up -d`; sonra dosyayı değiştir ve sadece `curl` ile bak.", "One `docker compose up -d`; then change the file and just look with `curl`."),
      l("`docker compose up -d`, `echo \"Merhaba v2\" > index.html`, sonra `curl localhost:3000`", "`docker compose up -d`, `echo \"Merhaba v2\" > index.html`, then `curl localhost:3000`"),
    ],
    par: 2,
    check: (ctx) => {
      const edit = lastEditOf(ctx, "index.html");
      const lastBuild = ctx.actions.map((a) => (a.type === "build" || a.type === "composeUp" ? 1 : 0)).lastIndexOf(1);
      return edit >= 0 && lastBuild < edit && pages(ctx).some((p) => p.i > edit && p.port === 3000 && p.body.includes("v2"));
    },
  },
  {
    id: "prod-image",
    title: l("Prod image'ı", "The prod image"),
    story: l(
      "Sunucuya gidecek image'ı hazırlıyorsun. Dockerfile'da iki aşama var: `dev` (bütün araçlar, root) ve `prod` (sadece gerekenler, `node` kullanıcısı). Düz bir `docker build` sondaki aşamayı, yani `dev`'i üretir.",
      "You're preparing the image for the server. The Dockerfile has two stages: `dev` (every tool, root) and `prod` (only what's needed, as `node`). A plain `docker build` makes the last stage, `dev`.",
    ),
    goal: l("`prod` aşamasından `shop:1.0` image'ını üret ve `prod` adlı container onu 8080'de çalıştırsın.", "Build `shop:1.0` from the `prod` stage, and a container named `prod` runs it on 8080."),
    start: DEV_UP,
    hints: [
      l("Çok aşamalı bir Dockerfile'da hangi aşamanın image olacağını build sırasında seçersin.", "With a multi-stage Dockerfile you choose at build time which stage becomes the image."),
      l("`docker build --target prod -t shop:1.0 .`; sonra `-p 8080:3000` ile `docker run`.", "`docker build --target prod -t shop:1.0 .`; then `docker run` with `-p 8080:3000`."),
      l("`docker build --target prod -t shop:1.0 .` sonra `docker run -d --name prod -p 8080:3000 shop:1.0`", "`docker build --target prod -t shop:1.0 .` then `docker run -d --name prod -p 8080:3000 shop:1.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "prod");
      return Boolean(c && c.state === "running" && isProd(ctx.state, "shop:1.0") && c.image === imageFor(ctx.state, "shop:1.0")!.id && c.ports.some((p) => p.host === 8080));
    },
  },
  {
    id: "two-worlds",
    title: l("İki dünya", "Two worlds"),
    story: l(
      "Dev (3000) ve prod (8080) aynı makinede çalışıyor, ikisi de v1 gösteriyor. Yeni bir başlık denemek istiyorsun, ama prod müşteriye açık: ona dokunulmamalı.",
      "Dev (3000) and prod (8080) run on the same machine, both showing v1. You want to try a new heading, but prod is open to customers: it must not change.",
    ),
    goal: l(
      "Son değişiklikten sonra dev `v2`, prod hâlâ `v1` göstersin; ikisini de `curl` ile kanıtla.",
      "After your last change dev shows `v2` and prod still `v1`; prove both with `curl`.",
    ),
    start: BOTH,
    hints: [
      l("Dev kodu klasörden okur, prod ise image'ın içinden: dosyayı değiştirmek sadece birini etkiler.", "Dev reads the code from the folder, prod from inside its image: changing the file only affects one of them."),
      l("Dosyayı değiştir, sonra iki portu da `curl` ile dene. Build yapma.", "Change the file, then try both ports with `curl`. Don't build."),
      l("`echo \"Merhaba v2\" > index.html`, `curl localhost:3000`, `curl localhost:8080`", "`echo \"Merhaba v2\" > index.html`, `curl localhost:3000`, `curl localhost:8080`"),
    ],
    par: 1,
    check: (ctx) => {
      const edit = lastEditOf(ctx, "index.html");
      if (edit < 0) return false;
      const after = pages(ctx).filter((p) => p.i > edit);
      return after.some((p) => p.port === 3000 && p.body.includes("v2")) && after.some((p) => p.port === 8080 && p.body.includes("v1"));
    },
  },
  {
    id: "ci-is-down",
    title: l("CI çalışmadı", "CI is down"),
    story: l(
      "CI normalde her commit'i prod aşamasından build edip `ghcr.io/ada/shop:sha-<commit>` olarak yayınlıyor. Bugün runner'lar çalışmıyor ve `3f2a1c9` commit'ini elle yayınlaman gerekiyor. GHCR'ye zaten giriş yaptın.",
      "Normally CI builds every commit from the prod stage and publishes it as `ghcr.io/ada/shop:sha-<commit>`. Today the runners are down, and you need to publish commit `3f2a1c9` by hand. You're already logged in to GHCR.",
    ),
    goal: l("Registry'de `ghcr.io/ada/shop:sha-3f2a1c9` dursun ve **prod** aşamasından yapılmış olsun.", "`ghcr.io/ada/shop:sha-3f2a1c9` is in the registry and was built from the **prod** stage."),
    start: LOGGED_IN,
    hints: [
      l("CI'ın yaptığı iki iş var: doğru aşamadan, doğru adla build; sonra push.", "CI does two things: build from the right stage under the right name; then push."),
      l("`--target prod` ve `-t ghcr.io/ada/shop:sha-3f2a1c9` ile `docker build`, sonra `docker push`.", "`docker build` with `--target prod` and `-t ghcr.io/ada/shop:sha-3f2a1c9`, then `docker push`."),
      l(
        `\`docker build --target prod -t ${REPO}:sha-3f2a1c9 .\` sonra \`docker push ${REPO}:sha-3f2a1c9\``,
        `\`docker build --target prod -t ${REPO}:sha-3f2a1c9 .\` then \`docker push ${REPO}:sha-3f2a1c9\``,
      ),
    ],
    par: 2,
    check: (ctx) => {
      const id = ctx.state.registry.tags[`${REPO}:sha-3f2a1c9`];
      return Boolean(id && ctx.state.registry.images[id]?.config.user === "node");
    },
  },
  {
    id: "deploy",
    title: l("Sunucuya çıkar", "Deploy it"),
    story: l(
      "Sunucudasın. Burada build yapılmıyor: sadece `compose.yaml` ve `compose.prod.yaml` var. CI `sha-8b1d24e`'yi yayınladı; prod dosyası 8080 portunu ve `restart: always`'i ekliyor, image'ın tag'i `TAG` değişkeninden geliyor.",
      "You're on the server. Nothing is built here: there's just `compose.yaml` and `compose.prod.yaml`. CI published `sha-8b1d24e`; the prod file adds port 8080 and `restart: always`, and the image tag comes from the `TAG` variable.",
    ),
    goal: l(
      "Uygulama `ghcr.io/ada/shop:sha-8b1d24e` image'ından, prod ayarlarıyla (8080, `restart: always`) çalışsın.",
      "The app runs from `ghcr.io/ada/shop:sha-8b1d24e` with the prod settings (8080, `restart: always`).",
    ),
    start: SERVER,
    hints: [
      l("Birden fazla compose dosyasını `-f` ile sırayla verirsin; sonraki öncekinin üstüne yazılır. Tag, `${TAG}` değişkeninden gelir.", "You pass several compose files in order with `-f`; each one is laid over the previous. The tag comes from the `${TAG}` variable."),
      l("Komutun başına `TAG=sha-8b1d24e` yazarsan değişken sadece o komut için geçerli olur.", "Putting `TAG=sha-8b1d24e` before the command sets the variable for just that command."),
      l("`TAG=sha-8b1d24e docker compose -f compose.yaml -f compose.prod.yaml up -d`", "`TAG=sha-8b1d24e docker compose -f compose.yaml -f compose.prod.yaml up -d`"),
    ],
    par: 1,
    check: (ctx) => {
      const c = findContainer(ctx.state, "shop-app-1");
      return Boolean(c && c.state === "running" && c.ref === `${REPO}:sha-8b1d24e` && c.restart === "always" && c.ports.some((p) => p.host === 8080));
    },
  },
];
