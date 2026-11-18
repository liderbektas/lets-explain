import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { dangling, images, inspect, outputOf, ps, stats } from "./cli";
import { missions } from "./missions";
import { Summary, Terminal } from "./Terminal";

export const SLUG = "inspect-and-clean";

const report: Instruction[] = [
  { op: "FROM", image: "alpine:3.20" },
  { op: "COPY", src: ["report.sh"], dest: "/report.sh" },
  { op: "CMD", args: ["sh", "/report.sh"], program: { kind: "job", output: ["report: starting", "Error: disk full, cannot write /tmp/report.csv"], exitCode: 1 } },
];
const site = (v: string): DockerAction => ({
  type: "build",
  tag: "acme/site:dev",
  context: { "index.html": v },
  dockerfile: [{ op: "FROM", image: "nginx:1.27" }, { op: "COPY", src: ["index.html"], dest: "/usr/share/nginx/html/" }],
});

/**
 * A machine after a few days of work: a web server running, two containers that stopped,
 * an image nobody uses, and a dangling one left by a rebuild.
 */
export const SETUP: DockerAction[] = [
  { type: "pull", ref: "nginx:1.27" },
  { type: "pull", ref: "hello-world" },
  { type: "build", tag: "acme/report:1", dockerfile: report, context: { "report.sh": "echo report" } },
  { type: "build", tag: "acme/old:0.1", dockerfile: [{ op: "FROM", image: "alpine:3.20" }, { op: "RUN", cmd: "echo old", size: 2 }], context: {} },
  site("v1"),
  site("v2"),
  { type: "run", image: "nginx:1.27", name: "web", detach: true, ports: ["8080:80"], env: { NGINX_HOST: "localhost" } },
  { type: "run", image: "hello-world", name: "hello" },
  { type: "run", image: "acme/report:1", name: "broken" },
];
export const START: Host = (() => {
  const r = simulate(SETUP, createHost());
  return r.states[r.states.length - 1]!;
})();

export const stopWeb: DockerAction = { type: "stop", container: "web" };
export const startWeb: DockerAction = { type: "start", container: "web" };
export const rmHello: DockerAction = { type: "rm", container: "hello" };
export const rmBroken: DockerAction = { type: "rm", container: "broken" };
export const rmWeb: DockerAction = { type: "rm", container: "web", force: true };
export const rmiNginx: DockerAction = { type: "rmi", ref: "nginx:1.27" };
export const rmiOld: DockerAction = { type: "rmi", ref: "acme/old:0.1" };
export const prune: DockerAction = { type: "prune" };
export const pruneAll: DockerAction = { type: "prune", all: true };
export const whoami: DockerAction = { type: "exec", container: "web", cmd: "whoami" };

export const steps: DockerAction[][] = [
  [],
  [],
  [],
  [],
  [whoami, { type: "exec", container: "web", cmd: "env" }],
  [],
  [rmiNginx],
  [stopWeb, startWeb, rmHello],
  [prune],
  [],
  [],
];

/** Steps where a Docker error is the point of the step. */
export const EXPECTED_ERRORS: Record<number, number> = { 6: 1 };

/** The command each lesson step shows in the terminal. */
const COMMANDS = [
  "docker ps",
  "docker ps -a",
  "docker images",
  "docker logs broken",
  "docker exec -it web sh",
  "docker inspect web  ·  docker stats --no-stream",
  "docker rmi nginx:1.27",
  "docker stop web && docker start web && docker rm hello",
  "docker system prune",
  "docker system df",
];

function linesFor(h: Host, step: number, last: import("../../engine/docker").DockerEvent[]): string[] {
  const web = findContainer(h, "web");
  switch (step) {
    case 0:
      return ps(h, false);
    case 1:
      return ps(h, true);
    case 2:
      return images(h);
    case 3:
      return findContainer(h, "broken")?.logs ?? [];
    case 4:
      return outputOf(last).length ? ["/ # whoami", ...outputOf(last)] : ["/ #"];
    case 5:
      return [...(web ? inspect(web) : []), "", ...stats(h)];
    case 6:
      return outputOf(last);
    case 7:
      return outputOf(last);
    case 8:
      return outputOf(last);
    case 9: {
      const imgs = Object.values(h.images);
      const cs = Object.values(h.containers);
      return [
        "TYPE            TOTAL   ACTIVE",
        `Images          ${String(imgs.length).padEnd(8)}${new Set(cs.map((c) => c.image)).size}`,
        `Containers      ${String(cs.length).padEnd(8)}${cs.filter((c) => c.state === "running").length}`,
        `Local Volumes   ${String(Object.keys(h.volumes).length).padEnd(8)}0`,
        `Build Cache     ${Object.keys(h.cache).length}`,
      ];
    }
    default:
      return [];
  }
}

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const web = findContainer(h, "web");
  const has = (n: string) => Boolean(findContainer(h, n));
  const hasTag = (t: string) => Boolean(h.tags[t]);
  return [
    {
      label: "web",
      buttons: [
        web?.state === "running" ? { label: "docker stop web", action: stopWeb } : { label: "docker start web", action: startWeb, tone: "go", disabled: !web },
        { label: "docker rm -f web", action: rmWeb, tone: "danger", disabled: !web },
        { label: "docker exec web whoami", action: whoami, disabled: web?.state !== "running" },
      ],
    },
    {
      label: tr ? "Kapanmışlar" : "Exited",
      buttons: [
        { label: "docker rm hello", action: rmHello, disabled: !has("hello") },
        { label: "docker rm broken", action: rmBroken, disabled: !has("broken") },
      ],
    },
    {
      label: "Image",
      buttons: [
        { label: "docker rmi nginx:1.27", action: rmiNginx, tone: "danger", disabled: !hasTag("nginx:1.27") },
        { label: "docker rmi acme/old:0.1", action: rmiOld, disabled: !hasTag("acme/old:0.1") },
      ],
    },
    {
      label: tr ? "Temizlik" : "Clean up",
      buttons: [
        { label: "docker system prune", action: prune, tone: "go" },
        { label: "docker system prune -a", action: pruneAll, tone: "danger" },
      ],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir terminal ve makinenin özeti: container'lar ve image'lar", "A terminal and a summary of the machine: containers and images"),
  view: (h, info) => {
    // In the try-it step the terminal keeps `docker ps -a` on screen, with the last command's output under it.
    const command = info.sandbox ? "docker ps -a" : (COMMANDS[info.step] ?? "");
    const out = outputOf(info.last);
    const lines = info.sandbox ? [...ps(h, true), ...(out.length ? ["", info.t(l("— son komutun çıktısı —", "— output of the last command —")), ...out] : [])] : linesFor(h, info.step, info.last);
    return (
      <g>
        <Terminal command={command} lines={lines} title={info.t(l("Terminal", "Terminal"))} />
        <Summary host={h} titles={{ containers: info.t(l("Container'lar", "Containers")), images: "Image", none: info.t(l("Hiç container yok", "No containers")) }} />
      </g>
    );
  },
  metrics: (h, t) => {
    const cs = Object.values(h.containers);
    return [
      { label: "docker ps", value: cs.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Kapanmış", "Exited")), value: cs.filter((c) => c.state === "exited").length, tone: cs.some((c) => c.state === "exited") ? "warn" : "plain" },
      { label: "Image", value: Object.keys(h.images).length },
      { label: t(l("Sahipsiz image", "Dangling")), value: dangling(h).length },
    ];
  },
  sandbox: { start: () => START, rows, missions },
});
