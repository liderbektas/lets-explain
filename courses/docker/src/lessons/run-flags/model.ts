import type { DockerAction } from "../../engine/docker";

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
