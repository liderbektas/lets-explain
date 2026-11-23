import { l, type L } from "@lets-explain/core/i18n";
import { apply, imageFor, imageSize, type ComposeFile, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { BuildStage, type BuildLabels } from "../../iso/BuildStage";
import { DockStage } from "../../iso/DockStage";
import { contextOf, freshHost, IGNORE, PROJECT, versionOf } from "../dockerize-your-app/project";
import { labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { CiPanel } from "./CiPanel";
import { LAPTOP, scenarios } from "./scenarios";

export const SLUG = "dev-prod-and-ci";
export const REPO = "ghcr.io/ada/shop";
export const COMMITS = ["3f2a1c9", "8b1d24e"];

const app = { kind: "app", listens: 3000 } as const;

/** One Dockerfile, two targets: `dev` for working, `prod` for shipping. */
export const MULTI: Instruction[] = [
  { op: "FROM", image: "node:22-slim", as: "base" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
  { op: "FROM", image: "base", as: "prod" },
  { op: "RUN", cmd: "npm ci --omit=dev", size: 60, seconds: 20 },
  { op: "COPY", src: ["."], dest: "." },
  { op: "USER", name: "node" },
  { op: "CMD", args: ["node", "server.js"], program: app },
  { op: "FROM", image: "base", as: "dev" },
  { op: "RUN", cmd: "npm install", size: 120, seconds: 25 },
  { op: "CMD", args: ["npm", "run", "dev"], program: app },
];

export const buildTarget = (h: Host, target: "dev" | "prod", tag: string): DockerAction => ({ type: "build", tag, dockerfile: MULTI, context: contextOf(h), ignore: IGNORE, target });

/** Development: the dev image with the project folder bind-mounted over /app. */
export const DEV_COMPOSE: ComposeFile = { services: { app: { image: "shop:dev", ports: ["3000:3000"], volumes: ["./:/app"] } } };
export const devUp: DockerAction = { type: "composeUp", project: "shop", file: DEV_COMPOSE };

export const edit = (n: number): DockerAction => ({ type: "editHost", path: `${PROJECT}/index.html`, content: `Merhaba v${n}` });
export const runProd = (image: string): DockerAction => ({ type: "run", image, detach: true, name: "prod", ports: ["8080:3000"] });
const curl = (port: number): DockerAction => ({ type: "curl", port });

type Spec = DockerAction | ((h: Host) => DockerAction);

const specs: Spec[][] = [
  [],
  [(h) => buildTarget(h, "dev", "shop:dev"), devUp],
  [edit(2), curl(3000)],
  [(h) => buildTarget(h, "prod", "shop:1.0"), runProd("shop:1.0"), curl(8080)],
  [edit(3), curl(3000), curl(8080)],
  [],
  [(h) => buildTarget(h, "prod", `${REPO}:sha-${COMMITS[0]}`), { type: "push", ref: `${REPO}:sha-${COMMITS[0]}` }],
  [edit(4), (h) => buildTarget(h, "prod", `${REPO}:sha-${COMMITS[1]}`), { type: "push", ref: `${REPO}:sha-${COMMITS[1]}` }],
  [],
  [],
];

function resolve(start: Host, list: Spec[][]): DockerAction[][] {
  let h = start;
  return list.map((step) =>
    step.map((spec) => {
      const a = typeof spec === "function" ? spec(h) : spec;
      h = apply(h, a).state;
      return a;
    }),
  );
}

export const START: Host = freshHost();
export const steps: DockerAction[][] = resolve(START, specs);

const buildLabels = (t: (x: L) => string): BuildLabels => ({
  dockerfile: "Dockerfile",
  layers: t(l("Image'ın katmanları", "The image's layers")),
  cached: "CACHED",
  ran: t(l("çalıştı", "ran")),
  noLayer: t(l("katman yok", "no layer")),
  total: t(l("süre", "time")),
  waiting: t(l("Henüz build yok", "Nothing built yet")),
});

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Aynı proje iki şekilde: geliştirirken bind mount ile, yayında hazır image ile; ve CI'da image üretmek", "One project two ways: a bind mount while developing, a built image in production, and building images in CI"),
  view: (h, info) => {
    const t = info.t;
    if (info.last.some((e) => e.type === "buildStep") && h.lastBuild && !(!info.sandbox && info.step >= 6)) {
      const b = h.lastBuild;
      return <BuildStage steps={b.steps} seconds={b.seconds} size={b.size} tag={b.tag} labels={buildLabels(t)} t={t} context={b.context} play />;
    }
    if (!info.sandbox && (info.step === 6 || info.step === 7)) {
      return (
        <CiPanel
          host={h}
          repo={REPO}
          commit={COMMITS[info.step - 6]!}
          labels={{
            workflow: t(l("GitHub Actions · build-image", "GitHub Actions · build-image")),
            registry: t(l("Registry (GHCR)", "Registry (GHCR)")),
            empty: t(l("Henüz image yok", "No images yet")),
            steps: ["actions/checkout", "docker/setup-buildx-action", "docker/login-action", "docker/build-push-action"],
          }}
        />
      );
    }
    return <DockStage host={h} labels={labels(t)} t={t} highlight={info.fresh} last={info.last} />;
  },
  metrics: (h, t) => {
    const dev = imageFor(h, "shop:dev");
    const prod = imageFor(h, "shop:1.0") ?? imageFor(h, "shop:prod");
    return [
      { label: t(l("Koddaki sürüm", "Code version")), value: `v${versionOf(h)}` },
      { label: t(l("dev image", "dev image")), value: dev ? `${imageSize(dev)} MB` : "—" },
      { label: t(l("prod image", "prod image")), value: prod ? `${imageSize(prod)} MB` : "—" },
      { label: t(l("Registry'deki tag", "Tags pushed")), value: Object.keys(h.registry.tags).filter((x) => x.startsWith(`${REPO}:`)).length },
    ];
  },
  // Free play starts from the checked-out project; each scenario brings its own state.
  sandbox: { start: () => LAPTOP, scenarios },
});
