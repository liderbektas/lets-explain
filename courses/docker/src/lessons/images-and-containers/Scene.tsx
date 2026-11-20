import { l } from "@lets-explain/core/i18n";
import { createHost, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { scenarios, WITH_NGINX } from "./scenarios";

export const SLUG = "images-and-containers";
export const PAGE = "/usr/share/nginx/html/index.html";

/** A tiny site: nginx plus one page. */
export const SITE_DOCKERFILE: Instruction[] = [
  { op: "FROM", image: "nginx:1.27" },
  { op: "COPY", src: ["index.html"], dest: "/usr/share/nginx/html/" },
];

/** A machine with Docker installed and no images yet. */
export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [{ type: "pull", ref: "nginx:1.27" }],
  [{ type: "pull", ref: "alpine:3.20" }],
  [{ type: "run", image: "nginx:1.27", detach: true, name: "web1", ports: ["8080:80"] }],
  [
    { type: "run", image: "nginx:1.27", detach: true, name: "web2", ports: ["8081:80"] },
    { type: "write", container: "web1", path: PAGE, content: "web1 değişti" },
    { type: "curl", port: 8080 },
    { type: "curl", port: 8081 },
  ],
  [],
  [{ type: "rmi", ref: "nginx:1.27" }],
  [{ type: "tag", source: "nginx:1.27", target: "mysite:base" }, { type: "rmi", ref: "mysite:base" }],
  [
    { type: "build", tag: "mysite:1.0", dockerfile: SITE_DOCKERFILE, context: { "index.html": "Benim sitem" } },
    { type: "run", image: "mysite:1.0", detach: true, name: "site", ports: ["8082:80"] },
    { type: "curl", port: 8082 },
  ],
  [],
  [],
];

/** Step 5 tries to remove an image a container still uses: the refusal is the point. */
export const EXPECTED_ERRORS: Record<number, number> = { 5: 1 };

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Image'lar rafta, container'lar onlardan başlatılmış kopyalar", "Images on the shelf, containers as running copies of them"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} />,
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: "Image", value: Object.keys(h.images).length },
      { label: t(l("Etiket", "Tags")), value: Object.keys(h.tags).length },
      { label: "Container", value: all.length },
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
    ];
  },
  sandbox: { start: () => WITH_NGINX, scenarios },
});
