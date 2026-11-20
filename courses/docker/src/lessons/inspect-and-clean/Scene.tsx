import { l } from "@lets-explain/core/i18n";
import { findContainer, type DockerAction, type Host } from "../../engine/docker";
import { makeDockerScene } from "../shared/DockerScene";
import { dangling, images, inspect, outputOf, ps, stats } from "./cli";
import { scenarios } from "./scenarios";
import { START } from "./model";
import { Summary, Terminal } from "./Terminal";

export const SLUG = "inspect-and-clean";

export { SETUP, START } from "./model";

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

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir terminal ve makinenin özeti: container'lar ve image'lar", "A terminal and a summary of the machine: containers and images"),
  view: (h, info) => {
    // In the try-it step the reader types in the real terminal below; this one keeps watching `docker ps -a`.
    const command = info.sandbox ? "watch docker ps -a" : (COMMANDS[info.step] ?? "");
    const lines = info.sandbox ? ps(h, true) : linesFor(h, info.step, info.last);
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
  sandbox: { start: () => START, scenarios },
});
