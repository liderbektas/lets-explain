import { l } from "@lets-explain/core/i18n";
import { createHost, type ComposeFile, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { CHECKOUT, scenarios } from "./scenarios";

export const SLUG = "compose-basics";
export const PROJECT = "shop";

/** The API's Dockerfile: it will not start without DATABASE_URL. */
const apiDockerfile: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["server.js"], dest: "." },
  { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000, needsEnv: ["DATABASE_URL"] } },
];
const apiBuild = { dockerfile: apiDockerfile, context: { "server.js": "app" } };

/** compose.yaml, version 1: one service. */
export const fileWeb: ComposeFile = {
  services: { web: { image: "nginx:1.27", ports: ["8080:80"] } },
};

/** Version 2: the API joins, built from a Dockerfile, its setting read from .env. */
export const fileApi: ComposeFile = {
  services: {
    web: { image: "nginx:1.27", ports: ["8080:80"] },
    api: { build: apiBuild, environment: { DATABASE_URL: "${DATABASE_URL}" } },
  },
};

/** Version 3: a database with a named volume; the API starts after it. */
export const fileFull: ComposeFile = {
  services: {
    web: { image: "nginx:1.27", ports: ["8080:80"], depends_on: ["api"] },
    api: { build: apiBuild, environment: { DATABASE_URL: "${DATABASE_URL}" }, depends_on: ["db"] },
    db: { image: "postgres:17", environment: { POSTGRES_PASSWORD: "${DB_PASSWORD}" }, volumes: ["pgdata:/var/lib/postgresql/data"] },
  },
  volumes: ["pgdata"],
};

/** The project's .env file. */
export const ENV = { DATABASE_URL: "postgres://app:s3cret@db:5432/shop", DB_PASSWORD: "s3cret" };

export const up = (file: ComposeFile, env: Record<string, string> | undefined = ENV): DockerAction => ({ type: "composeUp", project: PROJECT, file, env });
export const down = (volumes = false): DockerAction => ({ type: "composeDown", project: PROJECT, volumes });

export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [],
  [up(fileWeb), { type: "curl", port: 8080 }],
  [up(fileApi, {})],
  [up(fileApi)],
  [up(fileFull)],
  [{ type: "exec", container: "shop-web-1", cmd: "ping db" }],
  [down()],
  [up(fileFull)],
  [],
  [],
];

/** Steps where a Docker error is the point of the step (none here: failures show as exit codes). */
export const EXPECTED_ERRORS: Record<number, number> = {};

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir compose projesi: servisler, proje ağı ve volume", "A Compose project: services, its network and a volume"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages />,
  metrics: (h, t) => {
    const mine = Object.values(h.containers).filter((c) => c.project === PROJECT);
    return [
      { label: t(l("Çalışan servis", "Running services")), value: mine.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Kapanmış", "Exited")), value: mine.filter((c) => c.state === "exited").length, tone: mine.some((c) => c.state === "exited" && c.exitCode !== 0) ? "danger" : "plain" },
      { label: t(l("Proje ağı", "Project network")), value: Object.values(h.networks).filter((n) => n.project === PROJECT).length },
      { label: "Volume", value: Object.values(h.volumes).filter((v) => v.project === PROJECT).length },
    ];
  },
  // Free play starts from the checked-out project; each scenario brings its own state.
  sandbox: { start: () => CHECKOUT, scenarios },
});
