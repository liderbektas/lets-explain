import { l } from "@lets-explain/core/i18n";
import { createHost, simulate, type Container, type DockerAction, type Host, type Program } from "../../engine/docker";
import { DockStage } from "../../iso/DockStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { scenarios, IMAGES } from "./scenarios";
import { StatsPanel } from "./StatsPanel";

export const SLUG = "resources-and-restart";

const image = (tag: string, program: Program): DockerAction => ({
  type: "build",
  tag,
  context: { "main.js": tag },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "COPY", src: ["main.js"], dest: "/app/" },
    { op: "CMD", args: ["node", "/app/main.js"], program },
  ],
});

/** An API that uses about 120 MB, a worker that keeps failing, and a backup job that succeeds. */
export const BUILDS: DockerAction[] = [
  image("acme/api:2.0", { kind: "app", listens: 3000, memory: 120 }),
  image("acme/flaky:1.0", { kind: "job", output: ["connecting to queue…", "Error: queue not reachable"], exitCode: 1 }),
  image("acme/backup:1.0", { kind: "job", output: ["backup done"], exitCode: 0 }),
  { type: "pull", ref: "nginx:1.27" },
];

export const START: Host = simulate(BUILDS, createHost()).states[BUILDS.length]!;

const api = (name: string, extra: Partial<Extract<DockerAction, { type: "run" }>> = {}): DockerAction => ({ type: "run", image: "acme/api:2.0", detach: true, name, ...extra });

export const steps: DockerAction[][] = [
  [api("api")],
  [api("api-lim", { memory: 256 })],
  [api("api-small", { memory: 64 })],
  [{ type: "load", container: "api-lim", memory: 300 }],
  [api("api-cpu", { cpus: 0.5, memory: 256 })],
  [{ type: "run", image: "acme/flaky:1.0", detach: true, name: "flaky" }, { type: "tick", count: 2 }],
  [
    { type: "run", image: "acme/flaky:1.0", detach: true, name: "flaky2", restart: "on-failure" },
    { type: "run", image: "acme/backup:1.0", detach: true, name: "backup", restart: "on-failure" },
    { type: "tick", count: 3 },
  ],
  [
    { type: "run", image: "nginx:1.27", detach: true, name: "web-a", restart: "always" },
    { type: "run", image: "nginx:1.27", detach: true, name: "web-b", restart: "unless-stopped" },
    { type: "stop", container: "web-a" },
    { type: "stop", container: "web-b" },
    { type: "daemonRestart" },
  ],
  [],
  [],
];

const recent = (h: Host, n = 3): Container[] => Object.values(h.containers).slice(-n);

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bellek ve CPU sınırlarıyla container'lar, altta docker stats", "Containers with memory and CPU limits, with docker stats underneath"),
  view: (h, info) => {
    // The newest few containers, in the lesson and in the scenarios alike.
    const shown = recent(h);
    return (
      <g>
        <DockStage host={h} labels={labels(info.t)} t={info.t} highlight={info.fresh} last={info.last} hideImages containers={shown.map((c) => c.name)} panel />
        <StatsPanel host={h} containers={shown} noLimit={info.t(l("sınırsız", "no limit"))} />
      </g>
    );
  },
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    const oom = all.filter((c) => c.oomKilled).length;
    return [
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: "OOM", value: oom, tone: oom ? "danger" : "plain" },
      { label: t(l("Yeniden başlatma", "Restarts")), value: all.reduce((n, c) => n + c.restarts, 0), tone: all.some((c) => c.restarts) ? "warn" : "plain" },
    ];
  },
  sandbox: { start: () => IMAGES, scenarios },
});
