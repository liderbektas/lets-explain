import { l, type L } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "../../engine/docker";
import { HostStage, type HostLabels } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { missions } from "./missions";

export const SLUG = "run-flags";

/** An API image that refuses to start without DATABASE_URL, built into the host beforehand. */
export const API_BUILD: DockerAction = {
  type: "build",
  tag: "acme/api:1.0",
  context: { "server.js": "app" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: "." },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000, needsEnv: ["DATABASE_URL"] } },
  ],
};

/** The lesson's machine: Docker is installed and the API image is already here; nothing runs yet. */
export const START: Host = simulate([API_BUILD], createHost()).states[1]!;

const web = (extra: Partial<Extract<DockerAction, { type: "run" }>> = {}): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "web", ...extra });

export const steps: DockerAction[][] = [
  [{ type: "run", image: "hello-world", name: "hello" }],
  [web()],
  [{ type: "curl", port: 80 }],
  [web({ name: "web2", ports: ["8080:80"] }), { type: "curl", port: 8080 }],
  [web({ ports: ["8081:80"] })],
  [{ type: "run", image: "acme/api:1.0", detach: true, name: "api" }, { type: "rm", container: "api" }, { type: "run", image: "acme/api:1.0", detach: true, name: "api", env: { DATABASE_URL: "postgres://db/shop" } }],
  [{ type: "run", image: "hello-world", rm: true, name: "once" }],
  [{ type: "run", image: "nginx:1.27", detach: true, name: "files", volumes: ["site:/usr/share/nginx/html"] }, { type: "write", container: "files", path: "/usr/share/nginx/html/index.html", content: "Merhaba!" }],
  [],
  [],
];

/** Steps where a Docker error is the point of the step. */
export const EXPECTED_ERRORS: Record<number, number> = { 4: 1 };

export const labels = (t: (x: L) => string): HostLabels => ({
  images: t(l("Image'lar", "Images")),
  volumes: t(l("Volume'lar", "Volumes")),
  networks: t(l("Network'ler", "Networks")),
  running: t(l("çalışıyor", "running")),
  exited: t(l("kapandı", "exited")),
  created: t(l("oluşturuldu", "created")),
  noContainers: t(l("Henüz container yok", "No containers yet")),
  noImages: t(l("Henüz image yok", "No images yet")),
});

/** The sandbox: nginx and the API image are here, nothing runs. */
const sandboxStart = (): Host => simulate([API_BUILD, { type: "pull", ref: "nginx:1.27" }], createHost()).states[2]!;

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const w = findContainer(h, "web");
  const api = findContainer(h, "api");
  return [
    {
      label: "nginx",
      buttons: [
        { label: "run -d --name web", action: web(), tone: "producer" },
        { label: "run -d --name web -p 8080:80", action: web({ ports: ["8080:80"] }), tone: "producer" },
        { label: "rm -f web", action: { type: "rm", container: "web", force: true }, tone: "danger", disabled: !w },
      ],
    },
    {
      label: "api",
      buttons: [
        { label: "run -d --name api", action: { type: "run", image: "acme/api:1.0", detach: true, name: "api" }, tone: "producer" },
        { label: "run -d --name api -e DATABASE_URL=…", action: { type: "run", image: "acme/api:1.0", detach: true, name: "api", env: { DATABASE_URL: "postgres://db/shop" } }, tone: "producer" },
        { label: "rm -f api", action: { type: "rm", container: "api", force: true }, tone: "danger", disabled: !api },
      ],
    },
    { label: tr ? "Dene" : "Try", buttons: [{ label: "curl localhost:8080", action: { type: "curl", port: 8080 }, tone: "go" }] },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir makinede Docker: image'lar, container'lar, portlar ve volume'lar", "Docker on one machine: images, containers, ports and volumes"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} />,
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Kapanmış", "Exited")), value: all.filter((c) => c.state === "exited").length, tone: all.some((c) => c.state === "exited" && c.exitCode !== 0) ? "danger" : "plain" },
      { label: t(l("Yayınlanan port", "Published ports")), value: all.flatMap((c) => c.ports).length },
      { label: "Image", value: Object.keys(h.images).length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
