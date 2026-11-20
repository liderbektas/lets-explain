import { createHost, simulate, type DockerAction, type Host, type Instruction } from "../../engine/docker";

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
