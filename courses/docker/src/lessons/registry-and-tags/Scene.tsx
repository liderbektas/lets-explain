import { l, type L } from "@lets-explain/core/i18n";
import { createHost, simulate, type DockerAction, type Host } from "../../engine/docker";
import { makeDockerScene } from "../shared/DockerScene";
import { LAPTOP, scenarios } from "./scenarios";
import { RegistryStage, type RegistryLabels } from "./RegistryStage";

export const SLUG = "registry-and-tags";
export const REPO = "ghcr.io/ada/shop";
export const V1 = `${REPO}:1.0.0`;
export const LATEST = `${REPO}:latest`;

/** The app image, built locally as shop:dev before the lesson starts. */
export const SHOP_BUILD: DockerAction = {
  type: "build",
  tag: "shop:dev",
  context: { "server.js": "app v1" },
  dockerfile: [
    { op: "FROM", image: "node:22-alpine" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: "." },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
  ],
};

export const START: Host = simulate([SHOP_BUILD], createHost()).states[1]!;

export const tag = (target: string): DockerAction => ({ type: "tag", source: "shop:dev", target });
export const push = (ref: string): DockerAction => ({ type: "push", ref });
export const pull = (ref: string): DockerAction => ({ type: "pull", ref });
export const rmi = (ref: string): DockerAction => ({ type: "rmi", ref });
/** Someone else publishes a new image under :latest. */
export const release = (from: string, note: string): DockerAction => ({ type: "upstreamRelease", ref: LATEST, from, note });

export const steps: DockerAction[][] = [
  [pull("nginx:1.27")],
  [tag(V1)],
  [push(V1)],
  [tag(LATEST), push(LATEST)],
  [release(V1, "v2: yeni ödeme akışı"), pull(LATEST)],
  [pull(V1)],
  [rmi(V1)],
  [],
  [],
  [],
];

/** Steps where a Docker error is the point of the step (none here). */
export const EXPECTED_ERRORS: Record<number, number> = {};

export const registryLabels = (t: (x: L) => string): RegistryLabels => ({
  local: t(l("Bu makine (docker images)", "This machine (docker images)")),
  registry: t(l("Registry (ghcr.io, Docker Hub)", "Registry (ghcr.io, Docker Hub)")),
  empty: t(l("Henüz image yok", "No images yet")),
  sameImage: t(l("Aynı renkli kimlik = aynı image. Bir tag sadece bir isim etiketidir.", "Same coloured id = same image. A tag is only a name label.")),
});

const showLocal = (ref: string) => !ref.startsWith("node:");
const showRemote = (ref: string) => ref.startsWith("ghcr.io/") || ref === "nginx:1.27";

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bu makinedeki tag'ler ve registry'deki tag'ler", "Tags on this machine and tags in the registry"),
  view: (h, info) => <RegistryStage host={h} last={info.last} labels={registryLabels(info.t)} showLocal={showLocal} showRemote={showRemote} />,
  metrics: (h, t) => {
    const same = h.tags[LATEST] && h.tags[V1] ? (h.tags[LATEST] === h.tags[V1] ? t(l("aynı", "same")) : t(l("farklı!", "different!"))) : "—";
    return [
      { label: t(l("Yerel tag", "Local tags")), value: Object.keys(h.tags).filter(showLocal).length },
      { label: t(l("Registry'de", "In registry")), value: Object.keys(h.registry.tags).filter((r) => r.startsWith("ghcr.io/")).length },
      { label: t(l(":latest ve :1.0.0", ":latest vs :1.0.0")), value: same, tone: same === "—" ? "plain" : h.tags[LATEST] === h.tags[V1] ? "ok" : "danger" },
    ];
  },
  // Free play starts from the laptop with shop:dev built; each scenario brings its own state.
  sandbox: { start: () => LAPTOP, scenarios },
});
