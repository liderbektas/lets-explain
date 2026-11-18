import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type Container, type DockerAction, type Host, type Program } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { missions } from "./missions";
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

/** The sandbox: images only; you decide how to run them. */
const sandboxStart = (): Host => START;

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const a = findContainer(h, "api");
  const f = findContainer(h, "flaky");
  return [
    {
      label: "api",
      buttons: [
        { label: "run --memory 64m", action: api("api", { memory: 64 }), tone: "producer", disabled: Boolean(a) },
        { label: "run --memory 512m", action: api("api", { memory: 512 }), tone: "producer", disabled: Boolean(a) },
        { label: "rm -f api", action: { type: "rm", container: "api", force: true }, tone: "danger", disabled: !a },
        { label: tr ? "istek: 300 MB" : "request: 300 MB", action: { type: "load", container: "api", memory: 300 }, tone: "go", disabled: a?.state !== "running" },
      ],
    },
    {
      label: "flaky",
      buttons: [
        { label: "run flaky", action: { type: "run", image: "acme/flaky:1.0", detach: true, name: "flaky" }, tone: "producer", disabled: Boolean(f) },
        { label: "run --restart on-failure", action: { type: "run", image: "acme/flaky:1.0", detach: true, name: "flaky", restart: "on-failure" }, tone: "producer", disabled: Boolean(f) },
        { label: "rm -f flaky", action: { type: "rm", container: "flaky", force: true }, tone: "danger", disabled: !f },
      ],
    },
    { label: tr ? "Zaman" : "Time", buttons: [{ label: tr ? "bekle (+1)" : "wait (+1)", action: { type: "tick" } }] },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bellek ve CPU sınırlarıyla container'lar, altta docker stats", "Containers with memory and CPU limits, with docker stats underneath"),
  view: (h, info) => {
    const shown = info.sandbox ? (["api", "flaky"].map((n) => findContainer(h, n)).filter(Boolean) as Container[]) : recent(h);
    return (
      <g>
        <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages containers={shown.map((c) => c.name)} />
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
  sandbox: { start: sandboxStart, rows, missions },
});
