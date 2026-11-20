import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, imageFor, imageSize, type Files, type Host, type Image } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter, typeInto } from "../shared/missionHelpers";

/** A TypeScript service: dev tools are needed to build it, only dist/ is needed to run it. */
export const TS_PROJECT: Files = {
  "package.json": '{"name":"shop","scripts":{"build":"esbuild src/server.ts --bundle --platform=node --outfile=dist/server.js"},"devDependencies":{"esbuild":"^0.24","typescript":"^5"}}',
  "package-lock.json": '{"lockfileVersion":3}',
  "src/server.ts": 'import express from "express";\nconst app = express();\napp.listen(3000);',
  ".dockerignore": "node_modules\ndist",
};

/** Everything in one stage: the build tools ship with the app. */
export const SINGLE = `FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["node", "dist/server.js"]`;

/** Build in the full image, ship only dist/ on a smaller base. */
export const multiOn = (base: string) => `FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${base}
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD [${base.includes("distroless") ? "" : '"node", '}"dist/server.js"]`;

/** The machine with node:22 pulled and the project folder holding `dockerfile`; built as `shop` when asked. */
export function project(dockerfile: string, built = false): Host {
  const h = hostAfter(projectSetup({ ...TS_PROJECT, Dockerfile: dockerfile }), createHost({ pulled: ["node:22"] }));
  return built ? hostAfter(typeInto(h, ["docker build -t shop ."]).ctx.actions, h) : h;
}

const filesOf = (img: Image) => Object.keys(Object.assign({}, ...img.layers.map((x) => x.files)) as Files);
/** The image starts the server: its program, read from the built dist/server.js, listens on 3000. */
const runs = (img: Image | undefined) => Boolean(img && img.config.program.kind === "app" && img.config.program.listens === 3000);
/** `shop` was rebuilt in the scenario, is under `mb` MB and still starts the server. */
const shopUnder = (ctx: DockerCtx, mb: number) => {
  const img = imageFor(ctx.state, "shop");
  return Boolean(eventsOf(ctx, "built").some((e) => e.tag === "shop:latest") && img && imageSize(img) < mb && runs(img));
};

export const scenarios: DockerScenario[] = [
  {
    id: "under-200",
    title: l("1 GB'lık image", "A 1 GB image"),
    story: l(
      "`shop` image'ı 1 GB'ı geçiyor: içinde TypeScript derleyicisi, `esbuild`, bütün geliştirme bağımlılıkları ve tam `node:22` var. Oysa çalışmak için sadece derlenmiş `dist/server.js` gerekiyor. Sunucular her deploy'da bu image'ı indiriyor.",
      "The `shop` image is over 1 GB: it holds the TypeScript compiler, `esbuild`, every dev dependency and the full `node:22`. Yet to run it only needs the compiled `dist/server.js`. The servers pull this image on every deploy.",
    ),
    goal: l("`shop` image'ı **200 MB'ın altına** insin ve sunucu yine başlasın.", "Get `shop` **under 200 MB**, with the server still starting."),
    start: project(SINGLE, true),
    hints: [
      l("Derleme bir image'da, çalıştırma başka bir image'da olabilir: bir Dockerfile'da iki `FROM`. İkincisi öncekinden sadece gerekeni alır.", "Building can happen in one image and running in another: two `FROM`s in one Dockerfile. The second takes only what it needs from the first."),
      l("İlk stage'e `AS build` adını ver; ikinci stage `node:22-alpine` olsun ve `COPY --from=build /app/dist ./dist` ile sadece derlenmiş kodu alsın.", "Name the first stage `AS build`; make the second stage `node:22-alpine` and take only the compiled code with `COPY --from=build /app/dist ./dist`."),
      l(
        "`nano Dockerfile`: mevcut satırların altına `FROM node:22-alpine` / `WORKDIR /app` / `COPY --from=build /app/dist ./dist` / `CMD [\"node\", \"dist/server.js\"]` ekle ve ilk satırı `FROM node:22 AS build` yap (üstteki CMD'yi silebilirsin); sonra `docker build -t shop .`",
        "`nano Dockerfile`: below the current lines add `FROM node:22-alpine` / `WORKDIR /app` / `COPY --from=build /app/dist ./dist` / `CMD [\"node\", \"dist/server.js\"]`, and make the first line `FROM node:22 AS build` (you can drop the upper CMD); then `docker build -t shop .`",
      ),
    ],
    par: 2,
    check: (ctx) => shopUnder(ctx, 200),
  },
  {
    id: "under-150",
    title: l("Daha da küçük", "Even smaller"),
    story: l(
      "Dockerfile artık multi-stage ve `shop` `node:22-alpine` üstünde çalışıyor. Platform ekibi her servis için 150 MB sınırı koydu. Son image'da shell'e, paket yöneticisine, hatta `npm`'e bile gerek yok; sadece Node lazım.",
      "The Dockerfile is multi-stage now and `shop` runs on `node:22-alpine`. The platform team set a 150 MB limit for every service. The final image needs no shell, no package manager, not even `npm`; only Node.",
    ),
    goal: l("`shop` image'ı **150 MB'ın altına** insin ve sunucu yine başlasın.", "Get `shop` **under 150 MB**, with the server still starting."),
    start: project(multiOn("node:22-alpine"), true),
    hints: [
      l("İçinde sadece çalışma zamanının (runtime) olduğu, shell bile olmayan taban image'lar var: \"distroless\".", "There are base images holding only the runtime, without even a shell: \"distroless\"."),
      l("Son stage'i `gcr.io/distroless/nodejs22-debian12` yap. Bu image'ın ENTRYPOINT'i zaten `node`; CMD sadece betiğin yolunu verir.", "Make the last stage `gcr.io/distroless/nodejs22-debian12`. Its ENTRYPOINT already is `node`; CMD only gives the script's path."),
      l(
        "`nano Dockerfile`: ikinci `FROM`'u `FROM gcr.io/distroless/nodejs22-debian12`, son satırı `CMD [\"dist/server.js\"]` yap; sonra `docker build -t shop .`",
        "`nano Dockerfile`: make the second `FROM` `FROM gcr.io/distroless/nodejs22-debian12` and the last line `CMD [\"dist/server.js\"]`; then `docker build -t shop .`",
      ),
    ],
    par: 2,
    check: (ctx) => shopUnder(ctx, 150),
  },
  {
    id: "test-stage",
    title: l("Testler için stage", "A stage for the tests"),
    story: l(
      "CI, testleri bir container'da `npm test` ile çalıştırmak istiyor. Ama `shop` image'ında ne kaynak kod ne de geliştirme bağımlılıkları var: hepsi `build` stage'inde kaldı. Ayrı bir Dockerfile yazmak istemiyorsun.",
      "CI wants to run the tests in a container with `npm test`. But the `shop` image holds neither the source code nor the dev dependencies: they all stayed in the `build` stage. You don't want to write a separate Dockerfile.",
    ),
    goal: l("Aynı Dockerfile'ın `build` stage'inden `shop:build` adında bir image yap: içinde kaynak kod ve `node_modules` olsun.", "Make an image called `shop:build` from the same Dockerfile's `build` stage, holding the source code and `node_modules`."),
    start: project(multiOn("node:22-alpine"), true),
    hints: [
      l("`docker build` normalde son stage'i image yapar; hangi stage'de duracağını sen seçebilirsin.", "`docker build` normally makes the last stage the image; you can choose which stage to stop at."),
      l("`--target build` build'i o stage'de bitirir; `-t shop:build` ile adlandır.", "`--target build` ends the build at that stage; name it with `-t shop:build`."),
      l("`docker build --target build -t shop:build .`", "`docker build --target build -t shop:build .`"),
    ],
    par: 1,
    check: (ctx) => {
      const img = imageFor(ctx.state, "shop:build");
      if (!img) return false;
      const files = filesOf(img);
      return files.some((p) => p.includes("/node_modules/")) && files.includes("/app/src/server.ts");
    },
  },
  {
    id: "no-shell",
    title: l("İçeri girilebilir mi?", "Can anyone get in?"),
    story: l(
      "Güvenlik ekibi soruyor: biri `shop` container'ına sızarsa bir shell açabilir mi? Dockerfile hazır ve son stage distroless, ama henüz kimse build edip denemedi.",
      "The security team asks: if someone breaks into the `shop` container, can they open a shell? The Dockerfile is ready and its last stage is distroless, but nobody has built and tried it yet.",
    ),
    goal: l("`shop`'u build et, `app` adıyla arka planda çalıştır ve içinde `sh` açmayı dene: açılmasın.", "Build `shop`, run it in the background as `app`, and try to open `sh` inside it: it must not open."),
    start: project(multiOn("gcr.io/distroless/nodejs22-debian12")),
    hints: [
      l("Önce image, sonra çalışan bir container, sonra o container'da bir komut.", "First the image, then a running container, then a command in that container."),
      l("`docker build`, `docker run -d --name app`, sonra `docker exec app sh`.", "`docker build`, `docker run -d --name app`, then `docker exec app sh`."),
      l("`docker build -t shop .` sonra `docker run -d --name app shop` sonra `docker exec app sh`", "`docker build -t shop .` then `docker run -d --name app shop` then `docker exec app sh`"),
    ],
    par: 3,
    check: (ctx) => {
      const app = Object.values(ctx.state.containers).find((c) => c.name === "app");
      return Boolean(app?.state === "running" && eventsOf(ctx, "execOutput").some((e) => e.name === "app" && e.cmd === "sh" && e.code === 127));
    },
  },
];
