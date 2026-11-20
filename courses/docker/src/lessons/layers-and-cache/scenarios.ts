import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, imageFor, type DockerEvent, type Files, type Host, type Image } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter, typeInto } from "../shared/missionHelpers";

/** Your project: the code, the lock file, the node_modules your own `npm install` made, and .git. */
export const FOLDER: Files = {
  "package.json": '{"name":"shop","dependencies":{"express":"^4"}}',
  "package-lock.json": '{"lockfileVersion":3}',
  "server.js": 'const app = require("express")();\napp.listen(3000);',
  "node_modules/express/index.js": "size:200",
  ".git/HEAD": "ref: refs/heads/main",
  ".git/objects/pack/history.pack": "size:30",
};

/** Copies everything, then installs: any code change re-runs npm ci. */
export const NAIVE = `FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "server.js"]`;

/** The dependency list first, install, then the code. */
export const SMART = `FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "server.js"]`;

/** The project with a Dockerfile (and .dockerignore), built once as `shop` so the cache is warm. */
export function builtWith(dockerfile: string, dockerignore?: string): Host {
  const files: Files = { ...FOLDER, Dockerfile: dockerfile, ...(dockerignore !== undefined ? { ".dockerignore": dockerignore } : {}) };
  const h = hostAfter(projectSetup(files), createHost({ pulled: ["node:22-slim"] }));
  return hostAfter(typeInto(h, ["docker build -t shop ."]).ctx.actions, h);
}

/** Every build in the run: where it happened, its steps, and what was edited since the build before. */
function builds(ctx: DockerCtx) {
  const out: { at: number; steps: Extract<DockerEvent, { type: "buildStep" }>["step"][]; seconds: number; editedSince: string[] }[] = [];
  let edited: string[] = [];
  ctx.actions.forEach((a, i) => {
    if (a.type === "editHost") edited.push(a.path);
    if (a.type !== "build") return;
    const evs = ctx.events[i] ?? [];
    const built = evs.find((e) => e.type === "built");
    if (!built) return;
    out.push({ at: i, steps: evs.flatMap((e) => (e.type === "buildStep" ? [e.step] : [])), seconds: built.seconds, editedSince: edited });
    edited = [];
  });
  return out;
}

const shop = (ctx: DockerCtx): Image | undefined => imageFor(ctx.state, "shop");
const filesOf = (img: Image) => Object.keys(Object.assign({}, ...img.layers.map((x) => x.files)) as Files);
/** The image holds the node_modules copied from the laptop (not the one `npm ci` made). */
const hasLaptopModules = (img: Image) => filesOf(img).some((p) => p.includes("/node_modules/express/"));
const hasGit = (img: Image) => filesOf(img).some((p) => p.includes("/.git/"));
/** At least one build ran in the scenario (not just the one that made the start state). */
const rebuilt = (ctx: DockerCtx) => builds(ctx).length > 0;

export const scenarios: DockerScenario[] = [
  {
    id: "fast-rebuild",
    title: l("Her seferinde 20 saniye", "20 seconds every time"),
    story: l(
      "`server.js`'te tek bir satırı değiştirip build ettiğinde `RUN npm ci` her seferinde baştan çalışıyor ve 20 saniye bekliyorsun. Bağımlılıklar değişmedi ki.",
      "Every time you change a single line in `server.js` and build, `RUN npm ci` runs from scratch and you wait 20 seconds. The dependencies didn't even change.",
    ),
    goal: l("`server.js`'i değiştir; ondan **hemen sonraki** build'de `npm ci` cache'ten gelsin.", "Change `server.js`; in the build **right after**, `npm ci` comes from the cache."),
    start: builtWith(NAIVE, "node_modules\n.git"),
    hints: [
      l("Bir satır cache'ten kaçınca altındaki her satır yeniden çalışır. `COPY . .` her kod değişikliğinde kaçıyor, `npm ci` de onun altında.", "When one line misses the cache, every line below it runs again. `COPY . .` misses on every code change, and `npm ci` is below it."),
      l("Önce sadece `package*.json`'ı kopyala ve `npm ci` çalıştır; kodu en son kopyala. Yeni sırayla bir kez build et ki cache dolsun, sonra kodu değiştir.", "Copy only `package*.json` first and run `npm ci`; copy the code last. Build once in the new order to fill the cache, then change the code."),
      l(
        "`nano Dockerfile`: `COPY . .` yerine `COPY package*.json ./`, `RUN npm ci`, `COPY . .` sırası; `docker build -t shop .`; `echo 'app.listen(3000); // v2' > server.js`; `docker build -t shop .`",
        "`nano Dockerfile`: replace `COPY . .` with the order `COPY package*.json ./`, `RUN npm ci`, `COPY . .`; `docker build -t shop .`; `echo 'app.listen(3000); // v2' > server.js`; `docker build -t shop .`",
      ),
    ],
    par: 4,
    check: (ctx) =>
      builds(ctx).some(
        (b) => b.editedSince.some((p) => p.endsWith("/server.js")) && b.steps.some((s) => /^RUN npm (ci|install)/.test(s.text) && s.cached),
      ),
  },
  {
    id: "slim-context",
    title: l("500 MB'lık image", "A 500 MB image"),
    story: l(
      "`shop` image'ı beklenenden çok büyük. Sebebi: `COPY . .` senin bilgisayarındaki `node_modules` klasörünü de image'a taşıyor, oysa image kendi bağımlılıklarını `npm ci` ile zaten kuruyor.",
      "The `shop` image is far bigger than it should be. The reason: `COPY . .` also carries the `node_modules` folder from your own machine into the image, even though the image installs its own with `npm ci`.",
    ),
    goal: l("`shop` image'ı **400 MB'ın altına** insin ve içinde bilgisayarındaki `node_modules` olmasın.", "Get the `shop` image **under 400 MB**, without your machine's `node_modules` inside."),
    start: builtWith(SMART),
    hints: [
      l("Build'e hangi dosyaların gönderileceğini (build context) bir dosya belirler; orada adı geçen hiçbir şey `COPY`'ye girmez.", "A file decides which files are sent to the build (the build context); nothing listed there reaches `COPY`."),
      l("`.dockerignore` dosyasına `node_modules` yaz, sonra yeniden build et.", "Write `node_modules` into `.dockerignore`, then build again."),
      l("`echo node_modules > .dockerignore` sonra `docker build -t shop .`", "`echo node_modules > .dockerignore` then `docker build -t shop .`"),
    ],
    par: 2,
    check: (ctx) => {
      const img = shop(ctx);
      return Boolean(rebuilt(ctx) && img && ctx.state.lastBuild && ctx.state.lastBuild.size < 400 && !hasLaptopModules(img));
    },
  },
  {
    id: "no-history",
    title: l("Image'da git geçmişi", "Git history in the image"),
    story: l(
      "Güvenlik ekibi `shop` image'ının içinde `/app/.git` klasörünü buldu: projenin bütün geçmişi, eski commit'lerdeki her şeyle birlikte image'la dağıtılıyor. `.dockerignore`'da şu an sadece `node_modules` var.",
      "The security team found an `/app/.git` folder inside the `shop` image: the project's whole history, with everything from old commits, ships with the image. `.dockerignore` currently lists only `node_modules`.",
    ),
    goal: l("Yeniden build edilen `shop` image'ında ne `.git` ne de bilgisayarındaki `node_modules` olsun.", "The rebuilt `shop` image holds neither `.git` nor your machine's `node_modules`."),
    start: builtWith(SMART, "node_modules"),
    hints: [
      l("`.git` de build context'in parçası; `.dockerignore` onu da dışarıda bırakabilir.", "`.git` is part of the build context too; `.dockerignore` can leave it out as well."),
      l("`.dockerignore`'a bir satır **ekle** (`>>`); `>` dosyanın tamamını değiştirir ve `node_modules` satırı gider.", "**Add** a line to `.dockerignore` (`>>`); `>` replaces the whole file and the `node_modules` line goes."),
      l("`echo .git >> .dockerignore` sonra `docker build -t shop .`", "`echo .git >> .dockerignore` then `docker build -t shop .`"),
    ],
    par: 2,
    check: (ctx) => {
      const img = shop(ctx);
      return Boolean(rebuilt(ctx) && img && !hasGit(img) && !hasLaptopModules(img));
    },
  },
  {
    id: "fresh-packages",
    title: l("Eski paketler", "Stale packages"),
    story: l(
      "Dockerfile `RUN apt-get update && apt-get install -y curl` ile curl kuruyor. Dün curl için bir güvenlik düzeltmesi çıktı, ama her build bu satırı `CACHED` diye geçiyor: image'da geçen ayın paketleri duruyor. Dockerfile değişmeyecek.",
      "The Dockerfile installs curl with `RUN apt-get update && apt-get install -y curl`. A security fix for curl came out yesterday, but every build shows that line as `CACHED`: the image keeps last month's packages. The Dockerfile stays as it is.",
    ),
    goal: l("`shop`'u, hiçbir `RUN` ya da `COPY` satırı cache'ten gelmeden yeniden build et.", "Rebuild `shop` with no `RUN` or `COPY` line coming from the cache."),
    start: builtWith(SMART.replace("WORKDIR /app", "RUN apt-get update && apt-get install -y curl\nWORKDIR /app"), "node_modules\n.git"),
    hints: [
      l("Dosyalar aynı kaldıkça Docker satırı yeniden çalıştırmak için bir sebep görmez; ona cache'i kullanmamasını söylemen gerekir.", "As long as the files stay the same, Docker sees no reason to run a line again; you have to tell it not to use the cache."),
      l("`docker build`'in cache'i tamamen atlayan bir seçeneği var: `--no-cache`.", "`docker build` has an option that skips the cache entirely: `--no-cache`."),
      l("`docker build --no-cache -t shop .`", "`docker build --no-cache -t shop .`"),
    ],
    par: 1,
    check: (ctx) => builds(ctx).some((b) => b.steps.filter((s) => /^(RUN|COPY)/.test(s.text)).every((s) => !s.cached) && b.steps.some((s) => s.text.startsWith("RUN apt-get"))),
  },
];
