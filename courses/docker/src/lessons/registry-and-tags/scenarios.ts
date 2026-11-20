import { l } from "@lets-explain/core/i18n";
import { runLine } from "../../engine/cli";
import { createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter } from "../shared/missionHelpers";

export const REPO = "ghcr.io/ada/shop";
export const V1 = `${REPO}:1.0.0`;
export const V11 = `${REPO}:1.1.0`;
export const LATEST = `${REPO}:latest`;

/** The app image, built locally as shop:dev. `version` changes the code, so the image id. */
export const shopBuild = (version = "app v1"): DockerAction => ({
  type: "build",
  tag: "shop:dev",
  context: { "server.js": version },
  dockerfile: [
    { op: "FROM", image: "node:22-alpine" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: "." },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
  ],
});

/** Runs typed lines to build a start state, the same way a reader would have typed them. */
export function typed(h: Host, lines: string[]): Host {
  let state = h;
  for (const line of lines) state = hostAfter(runLine(state, line).actions, state);
  return state;
}

export const LOGIN = "echo $GITHUB_TOKEN | docker login ghcr.io -u ada --password-stdin";

/** Your laptop: shop:dev is built, not yet published, and you are not logged in to GHCR. */
export const LAPTOP: Host = hostAfter([shopBuild()], createHost());

/** Logged in, with 1.0.0 published. */
const PUBLISHED = typed(LAPTOP, [LOGIN, `docker tag shop:dev ${V1}`, `docker push ${V1}`]);

/** 1.0.0 and latest published as the same image. */
const BOTH = typed(PUBLISHED, [`docker tag shop:dev ${LATEST}`, `docker push ${LATEST}`]);

/** A server that has never pulled shop; meanwhile a teammate pushed another build to :latest. */
const SERVER: Host = hostAfter(
  [
    { type: "upstreamRelease", ref: LATEST, from: V1, note: "teammate build: new checkout" },
    { type: "rmi", ref: V1 },
    { type: "rmi", ref: LATEST },
    { type: "rmi", ref: "shop:dev" },
  ],
  BOTH,
);

/** Both tags published; then the code changed and shop:dev was rebuilt. */
const REBUILT = hostAfter([shopBuild("app v1.1: faster search")], BOTH);

const inRegistry = (h: Host, ref: string) => h.registry.tags[ref];

export const scenarios: DockerScenario[] = [
  {
    id: "first-release",
    title: l("İlk yayın", "First release"),
    story: l(
      "Uygulamanın ilk sürümü hazır, yerelde `shop:dev` adıyla build ettin. Sunucu image'ı GitHub Container Registry'den `ghcr.io/ada/shop:1.0.0` adıyla çekecek. Yazma yetkili GHCR token'ın `GITHUB_TOKEN` değişkeninde duruyor.",
      "The app's first version is ready; you built it locally as `shop:dev`. The server will pull it from GitHub Container Registry as `ghcr.io/ada/shop:1.0.0`. Your GHCR token with write access is in the `GITHUB_TOKEN` variable.",
    ),
    goal: l("Registry'de `ghcr.io/ada/shop:1.0.0` dursun ve senin `shop:dev`'inle **aynı** image olsun.", "`ghcr.io/ada/shop:1.0.0` is in the registry, and it is the **same** image as your `shop:dev`."),
    start: LAPTOP,
    hints: [
      l("Bir image hangi registry'ye gideceğini adından anlar; önce ona o adı ver. Push için de registry'ye giriş yapman gerekir.", "An image knows which registry it goes to from its name, so give it that name first. Pushing also needs a login to the registry."),
      l("`docker tag` yeni bir ad ekler. `docker login ghcr.io -u ada --password-stdin` token'ı borudan okur. Sonra `docker push`.", "`docker tag` adds a new name. `docker login ghcr.io -u ada --password-stdin` reads the token from a pipe. Then `docker push`."),
      l(`\`docker tag shop:dev ${V1}\`, \`${LOGIN}\`, \`docker push ${V1}\``, `\`docker tag shop:dev ${V1}\`, \`${LOGIN}\`, \`docker push ${V1}\``),
    ],
    par: 3,
    check: (ctx) => Boolean(inRegistry(ctx.state, V1)) && inRegistry(ctx.state, V1) === ctx.state.tags["shop:dev"],
  },
  {
    id: "latest-too",
    title: l("latest da", "Latest too"),
    story: l(
      "`1.0.0` registry'de. Ekipteki bazı script'ler hâlâ `ghcr.io/ada/shop:latest` çekiyor, o yüzden aynı sürüm `latest` adıyla da yayında olmalı. Yeniden build etmene gerek yok.",
      "`1.0.0` is in the registry. Some of the team's scripts still pull `ghcr.io/ada/shop:latest`, so the same version must be published as `latest` too. No need to rebuild.",
    ),
    goal: l("Registry'de `:latest` ile `:1.0.0` **aynı** image'ı göstersin.", "In the registry, `:latest` and `:1.0.0` point at the **same** image."),
    start: PUBLISHED,
    hints: [
      l("Bir image'ın birden çok adı olabilir; yeni bir ad eklemek image'ı kopyalamaz.", "An image can have several names; adding one doesn't copy the image."),
      l("Önce `docker tag` ile `:latest` adını ver, sonra onu da push et. Layer'lar zaten registry'de olduğu için çabuk biter.", "Give it the `:latest` name with `docker tag`, then push that too. The layers are already in the registry, so it's quick."),
      l(`\`docker tag shop:dev ${LATEST}\` sonra \`docker push ${LATEST}\``, `\`docker tag shop:dev ${LATEST}\` then \`docker push ${LATEST}\``),
    ],
    par: 2,
    check: (ctx) => Boolean(inRegistry(ctx.state, LATEST)) && inRegistry(ctx.state, LATEST) === inRegistry(ctx.state, V1),
  },
  {
    id: "pin-it",
    title: l("Sürümü sabitle", "Pin the version"),
    story: l(
      "Sunucu her açılışta `ghcr.io/ada/shop:latest` çekiyordu. Dün biri `latest`'e test build'ini gönderdi ve sunucu bugün beklenmedik bir sürümle açıldı. Bu sunucuda tam olarak onaylanmış `1.0.0` çalışmalı.",
      "The server pulled `ghcr.io/ada/shop:latest` on every start. Yesterday someone pushed a test build to `latest`, and today the server came up with an unexpected version. This server must run exactly the approved `1.0.0`.",
    ),
    goal: l("`shop` adlı container, registry'deki `1.0.0` image'ından `3000` portunda çalışsın.", "A container named `shop` runs on port `3000` from the registry's `1.0.0` image."),
    start: SERVER,
    hints: [
      l("`latest` sadece \"en son kim ne gönderdiyse\" demek. Belli bir sürüm, adında o sürümü yazarak istenir.", "`latest` only means \"whatever was pushed last\". You ask for a version by naming it."),
      l("`docker run` image yoksa registry'den çeker; image adına `:1.0.0` yaz.", "`docker run` pulls the image if it's missing; put `:1.0.0` in the image name."),
      l(`\`docker run -d --name shop -p 3000:3000 ${V1}\``, `\`docker run -d --name shop -p 3000:3000 ${V1}\``),
    ],
    par: 1,
    check: (ctx) => {
      const c = findContainer(ctx.state, "shop");
      return Boolean(c && c.state === "running" && c.image === inRegistry(ctx.state, V1) && c.ports.some((p) => p.host === 3000));
    },
  },
  {
    id: "just-a-name",
    title: l("Sadece bir ad", "Just a name"),
    story: l(
      "`docker images` listesinde aynı image üç adla duruyor: `shop:dev`, `ghcr.io/ada/shop:1.0.0` ve `ghcr.io/ada/shop:latest`. `latest` adını bu makineden kaldırmak istiyorsun, ama image ve diğer adları kalmalı.",
      "`docker images` shows the same image under three names: `shop:dev`, `ghcr.io/ada/shop:1.0.0` and `ghcr.io/ada/shop:latest`. You want the `latest` name gone from this machine, but the image and its other names must stay.",
    ),
    goal: l("Yerelde `:latest` adı kalksın; image `shop:dev` ve `:1.0.0` adlarıyla **dursun**.", "The local `:latest` name goes; the image **stays** as `shop:dev` and `:1.0.0`."),
    start: BOTH,
    hints: [
      l("Bir image'ın başka adları varsa, bir adı kaldırmak image'ı silmez: çıktıda sadece `Untagged` görürsün.", "If an image has other names, removing one doesn't delete it: the output only says `Untagged`."),
      l("`docker rmi` ada göre çalışır; image kimliğini değil, tam adı ver.", "`docker rmi` works by name; give it the full name, not the image id."),
      l(`\`docker rmi ${LATEST}\``, `\`docker rmi ${LATEST}\``),
    ],
    par: 1,
    check: (ctx) =>
      !ctx.state.tags[LATEST] &&
      Boolean(ctx.state.tags["shop:dev"]) &&
      ctx.state.tags["shop:dev"] === ctx.state.tags[V1] &&
      eventsOf(ctx, "imageRemoved").some((e) => e.ref === LATEST && e.untaggedOnly),
  },
  {
    id: "new-version",
    title: l("Yeni sürüm", "New version"),
    story: l(
      "Arama hızlandı: kodu değiştirip `shop:dev`'i yeniden build ettin. Bunu `1.1.0` olarak yayınla ve `latest` artık bu sürümü göstersin. `1.0.0` eski haliyle kalmalı: sunucular hâlâ onu kullanıyor.",
      "Search got faster: you changed the code and rebuilt `shop:dev`. Publish it as `1.1.0` and make `latest` point at it. `1.0.0` must stay as it was: servers still use it.",
    ),
    goal: l(
      "Registry'de `:1.1.0` ve `:latest` yeni `shop:dev` olsun; `:1.0.0` **eski** image'da kalsın.",
      "In the registry `:1.1.0` and `:latest` are the new `shop:dev`; `:1.0.0` stays on the **old** image.",
    ),
    start: REBUILT,
    hints: [
      l("Tag'ler isim etiketi: yeni image'a `1.1.0` ve `latest` adlarını ver; `1.0.0`'a dokunma.", "Tags are name labels: give the new image the `1.1.0` and `latest` names, and leave `1.0.0` alone."),
      l("İki `docker tag`, sonra iki `docker push`; ya da `docker push --all-tags ghcr.io/ada/shop` repo'nun bütün yerel tag'lerini bir seferde gönderir.", "Two `docker tag`s, then two `docker push`es; or `docker push --all-tags ghcr.io/ada/shop` sends every local tag of the repository at once."),
      l(
        `\`docker tag shop:dev ${V11}\`, \`docker tag shop:dev ${LATEST}\`, \`docker push --all-tags ${REPO}\``,
        `\`docker tag shop:dev ${V11}\`, \`docker tag shop:dev ${LATEST}\`, \`docker push --all-tags ${REPO}\``,
      ),
    ],
    par: 3,
    check: (ctx) => {
      const now = ctx.state.tags["shop:dev"];
      return Boolean(now) && inRegistry(ctx.state, V11) === now && inRegistry(ctx.state, LATEST) === now && inRegistry(ctx.state, V1) === inRegistry(ctx.start, V1);
    },
  },
];
