import { l } from "@lets-explain/core/i18n";
import { createHost, type DockerAction, type Host } from "../../engine/docker";
import { makeDockerScene } from "../shared/DockerScene";
import { ArchPanel } from "./ArchPanel";
import { scenarios, SERVER } from "./scenarios";

export const SLUG = "architecture";

/** A machine with Docker installed and nothing pulled yet. */
export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [],
  [],
  [{ type: "pull", ref: "nginx:1.27" }],
  [{ type: "run", image: "nginx:1.27", detach: true, name: "web" }],
  [{ type: "run", image: "redis:7", detach: true, name: "cache" }],
  [{ type: "run", image: "acme/ghost:1.0", detach: true, name: "ghost" }],
  [{ type: "pull", ref: "gcr.io/distroless/nodejs22-debian12" }],
  [{ type: "daemonRestart" }],
  [],
  [],
];

/** Step 5 runs an image that exists nowhere: the error is the point. */
export const EXPECTED_ERRORS: Record<number, number> = { 5: 1 };

/** What the terminal shows for each lesson step. */
const COMMANDS: Record<number, string> = {
  0: "docker ps",
  1: "docker version",
  2: "docker pull nginx:1.27",
  3: "docker run -d --name web nginx:1.27",
  4: "docker run -d --name cache redis:7",
  5: "docker run acme/ghost:1.0",
  6: "docker pull gcr.io/distroless/…",
  7: "sudo systemctl restart docker",
  8: "docker context ls",
};

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("docker CLI, Docker daemon ve registry: kim neyi yapıyor", "The docker CLI, the Docker daemon and the registry: who does what"),
  view: (h, info) => <ArchPanel host={h} last={info.last} command={info.sandbox ? undefined : COMMANDS[info.step]} t={info.t} />,
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: "Image", value: Object.keys(h.images).length },
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Kapanmış", "Exited")), value: all.filter((c) => c.state === "exited").length },
    ];
  },
  sandbox: { start: () => SERVER, scenarios },
});
