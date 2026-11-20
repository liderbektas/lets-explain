import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, findContainer, type Files, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter, typeInto } from "../shared/missionHelpers";
import { hasSecret } from "./SecurityPanel";

/** The API project: its key sits in `.env` (a made-up one), and the app refuses to start without it. */
export const API_FILES: Files = {
  "package.json": '{"name":"api","dependencies":{"express":"^4"}}',
  "package-lock.json": '{"lockfileVersion":3}',
  "server.js": 'if (!process.env.API_KEY) {\n  console.error("API_KEY is missing");\n  process.exit(1);\n}\nrequire("express")().listen(3000);',
  ".env": "API_KEY=sk_live_51Hx_example",
};

export const IMAGE = "acme/api:dev";

/** Runs as root (no USER line) and copies the whole folder. */
export const ROOT_DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]`;

/** A dev laptop: the project with `dockerfile` (and `.dockerignore`), built as acme/api:dev and running as `api`. */
export function running(dockerfile: string, dockerignore?: string, build = true): Host {
  const files: Files = { ...API_FILES, Dockerfile: dockerfile, ...(dockerignore !== undefined ? { ".dockerignore": dockerignore } : {}) };
  const h = hostAfter(projectSetup(files), createHost({ pulled: ["node:22-slim"] }));
  if (!build) return h;
  return hostAfter(typeInto(h, [`docker build -t ${IMAGE} .`, `docker run -d --name api --env-file .env ${IMAGE}`]).ctx.actions, h);
}

/** `api` runs, from an image built during the scenario. */
const apiUp = (ctx: DockerCtx) => {
  const c = findContainer(ctx.state, "api");
  return c?.state === "running" && eventsOf(ctx, "built").length > 0 ? c : undefined;
};
const imageOf = (ctx: DockerCtx) => {
  const c = apiUp(ctx);
  return c ? ctx.state.images[c.image] : undefined;
};

export const scenarios: DockerScenario[] = [
  {
    id: "not-root",
    title: l("Root olarak çalışıyor", "Running as root"),
    story: l(
      "Güvenlik taraması bir bulgu açtı: `api` container'ı **root** olarak çalışıyor. Uygulamada bir açık bulunursa saldırgan container'ın içinde her şeyi yapabilir. `node:22-slim` image'ında zaten `node` adında yetkisiz bir kullanıcı var.",
      "A security scan raised a finding: the `api` container runs as **root**. If someone finds a hole in the app, they can do anything inside the container. The `node:22-slim` image already has an unprivileged user called `node`.",
    ),
    goal: l("`api` container'ı root **olmayan** bir kullanıcıyla çalışsın.", "The `api` container runs as a **non-root** user."),
    start: running(ROOT_DOCKERFILE, ".env\n.git\nnode_modules"),
    hints: [
      l("Bir container'ın kullanıcısını image belirler; çalışan bir container'ın kullanıcısı sonradan değişmez. Yeni image, yeni container.", "The image decides a container's user, and a running container's user never changes afterwards. New image, new container."),
      l("Dockerfile'da `CMD`'den önce `USER node`. Build et, eski `api`'yi kaldır ve yenisini aynı ayarlarla başlat.", "Add `USER node` before `CMD` in the Dockerfile. Build, remove the old `api`, and start the new one with the same settings."),
      l(
        "`nano Dockerfile`: `CMD`'nin üstüne `USER node`; sonra `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`",
        "`nano Dockerfile`: `USER node` above `CMD`; then `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const c = apiUp(ctx);
      return Boolean(c && c.user !== "root");
    },
  },
  {
    id: "secret-out",
    title: l("Sır image'da", "A secret in the image"),
    story: l(
      "Image'ı registry'ye göndermeden önce bir arkadaşın `docker run --rm acme/api:dev cat .env` yazdı ve canlı API anahtarını ekranda gördü: `COPY . .` `.env` dosyasını da image'a koymuş. Image'ı çeken herkes anahtarı okuyabilir. Projede `.dockerignore` yok.",
      "Before the image was pushed, a teammate typed `docker run --rm acme/api:dev cat .env` and saw the live API key on screen: `COPY . .` put the `.env` file into the image too. Anyone who pulls the image can read the key. The project has no `.dockerignore`.",
    ),
    goal: l("`api` çalışsın, ama image'ının **hiçbir katmanında** `.env` olmasın; anahtar container'a dışarıdan gelsin.", "Keep `api` running, with **no layer** of its image holding `.env`; the key comes into the container from outside."),
    start: running(ROOT_DOCKERFILE),
    hints: [
      l("Bir dosyayı sonraki bir katmanda silmek onu image'dan çıkarmaz; alt katmanda durmaya devam eder. Dosya build'e hiç girmemeli.", "Deleting a file in a later layer doesn't take it out of the image; it stays in the layer below. The file must never enter the build."),
      l("`.dockerignore`'a yazılan dosya build context'e girmez. Sonra yeniden build et, eski container'ı kaldır ve anahtarı `--env-file` ya da `-e` ile ver.", "A file listed in `.dockerignore` never enters the build context. Then rebuild, remove the old container and pass the key with `--env-file` or `-e`."),
      l(
        "`echo .env > .dockerignore`, `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`",
        "`echo .env > .dockerignore`, `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const img = imageOf(ctx);
      return Boolean(img && !hasSecret(img) && apiUp(ctx)?.env.API_KEY);
    },
  },
  {
    id: "typo-base",
    title: l("Bir harf eksik", "One letter short"),
    story: l(
      "Yeni gelen bir arkadaşın Dockerfile'ı build olmuyor: `pull access denied for nod`. İlk satırda `FROM nod:22-slim` yazıyor. Böyle bir image bugün yok, ama yarın biri bu adla zararlı bir image yayınlayabilir.",
      "A new teammate's Dockerfile won't build: `pull access denied for nod`. The first line says `FROM nod:22-slim`. No such image exists today, but tomorrow someone could publish a harmful one under that name.",
    ),
    goal: l("`acme/api:dev` resmi `node:22-slim` image'ının üstüne build edilsin.", "`acme/api:dev` is built on top of the official `node:22-slim` image."),
    start: running(ROOT_DOCKERFILE.replace("FROM node:22-slim", "FROM nod:22-slim"), ".env\n.git\nnode_modules", false),
    hints: [
      l("Hata, image'ın adının registry'de bulunamadığını söylüyor. Dockerfile'ın ilk satırına bak.", "The error says the image name can't be found in the registry. Look at the Dockerfile's first line."),
      l("`FROM` satırını resmi adla düzelt (`node:22-slim`), sonra build et.", "Fix the `FROM` line to the official name (`node:22-slim`), then build."),
      l("`nano Dockerfile`: `FROM node:22-slim`; sonra `docker build -t acme/api:dev .`", "`nano Dockerfile`: `FROM node:22-slim`; then `docker build -t acme/api:dev .`"),
    ],
    par: 2,
    check: (ctx) => eventsOf(ctx, "built").some((e) => e.tag === `${IMAGE}`) && Boolean(ctx.state.lastBuild?.steps[0]?.text === "FROM node:22-slim" && ctx.state.lastBuild.tag === IMAGE),
  },
  {
    id: "no-shell",
    title: l("Kabuksuz", "No shell"),
    story: l(
      "Bir sonraki adım: saldırgan içeri girse bile elinde shell olmasın. Son image'da sadece Node çalışma zamanı kalsın; `npm` gibi araçlar da derleme aşamasında kalsın. Projede `.dockerignore` hazır.",
      "Next step: even if someone gets in, they shouldn't have a shell. The final image should hold only the Node runtime; tools like `npm` stay in the build stage. The project's `.dockerignore` is ready.",
    ),
    goal: l(
      "`api`, sırsız, root olmayan ve **içinde shell olmayan** bir image'dan çalışsın; `docker exec api sh`'ın açılmadığını gör.",
      "`api` runs from an image with no secret, no root and **no shell**; see `docker exec api sh` fail.",
    ),
    start: running(ROOT_DOCKERFILE, ".env\n.git\nnode_modules"),
    hints: [
      l("Distroless image'larda shell yok ve varsayılan kullanıcı root değil. Bağımlılıkları kuran `npm` ise bir önceki stage'de kalır.", "Distroless images have no shell, and their default user isn't root. `npm`, which installs the dependencies, stays in an earlier stage."),
      l(
        "İki stage: `FROM node:22-slim AS build` (kurulum), sonra `FROM gcr.io/distroless/nodejs22-debian12` ve `COPY --from=build /app /app`. distroless'ın ENTRYPOINT'i `node`, CMD sadece `[\"server.js\"]`.",
        "Two stages: `FROM node:22-slim AS build` (install), then `FROM gcr.io/distroless/nodejs22-debian12` and `COPY --from=build /app /app`. distroless's ENTRYPOINT is `node`, so CMD is just `[\"server.js\"]`.",
      ),
      l(
        "`nano Dockerfile`: ilk satır `FROM node:22-slim AS build`; `CMD`'yi sil, yerine `FROM gcr.io/distroless/nodejs22-debian12` / `WORKDIR /app` / `COPY --from=build /app /app` / `CMD [\"server.js\"]`; sonra `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`, `docker exec api sh`",
        "`nano Dockerfile`: first line `FROM node:22-slim AS build`; replace `CMD` with `FROM gcr.io/distroless/nodejs22-debian12` / `WORKDIR /app` / `COPY --from=build /app /app` / `CMD [\"server.js\"]`; then `docker build -t acme/api:dev .`, `docker rm -f api`, `docker run -d --name api --env-file .env acme/api:dev`, `docker exec api sh`",
      ),
    ],
    par: 5,
    check: (ctx) => {
      const c = apiUp(ctx);
      const img = imageOf(ctx);
      return Boolean(c && img && !hasSecret(img) && c.user !== "root" && eventsOf(ctx, "execOutput").some((e) => e.name === "api" && e.cmd === "sh" && e.code === 127));
    },
  },
];
