import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type ComposeFile, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { DockStage } from "../../iso/DockStage";
import { makeDockerScene } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { PATIENT, scenarios } from "./scenarios";

export const SLUG = "compose-stack";
export const PROJECT = "shop";

/** The app connects to Postgres and Redis as soon as it starts, and needs DATABASE_URL. */
const appDockerfile: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["package.json"], dest: "./" },
  { op: "RUN", cmd: "npm ci", size: 60, seconds: 20 },
  { op: "COPY", src: ["."], dest: "." },
  {
    op: "CMD",
    args: ["node", "server.js"],
    program: { kind: "app", listens: 3000, needsEnv: ["DATABASE_URL"], connects: ["db:5432", "cache:6379"] },
  },
];
const appBuild = { dockerfile: appDockerfile, context: { "package.json": "{}", "server.js": "app" } };

const db = {
  image: "postgres:17",
  environment: { POSTGRES_PASSWORD: "${DB_PASSWORD}" },
  volumes: ["pgdata:/var/lib/postgresql/data"],
  healthcheck: true,
};
const cache = { image: "redis:7", healthcheck: true };
const appEnv = { DATABASE_URL: "postgres://postgres:${DB_PASSWORD}@db:5432/postgres", REDIS_URL: "redis://cache:6379" };

/** Short depends_on: start order only. */
export const fileEager: ComposeFile = {
  services: { db, cache, app: { build: appBuild, ports: ["3000:3000"], environment: appEnv, depends_on: ["db", "cache"] } },
  volumes: ["pgdata"],
};

/** depends_on with condition: service_healthy: Compose waits for both healthchecks. */
export const filePatient: ComposeFile = {
  services: {
    db,
    cache,
    app: {
      build: appBuild,
      ports: ["3000:3000"],
      environment: appEnv,
      depends_on: { db: { condition: "service_healthy" }, cache: { condition: "service_healthy" } },
    },
  },
  volumes: ["pgdata"],
};

/** Short depends_on, but the app restarts itself on failure. */
export const fileRetry: ComposeFile = {
  services: { db, cache, app: { build: appBuild, ports: ["3000:3000"], environment: appEnv, depends_on: ["db", "cache"], restart: "on-failure" } },
  volumes: ["pgdata"],
};

export const ENV = { DB_PASSWORD: "s3cret" };
export const ORDERS = "/var/lib/postgresql/data/orders.dat";

export const up = (file: ComposeFile): DockerAction => ({ type: "composeUp", project: PROJECT, file, env: ENV });
export const down = (volumes = false): DockerAction => ({ type: "composeDown", project: PROJECT, volumes });
export const tick = (count = 1): DockerAction => ({ type: "tick", count });
export const writeOrder: DockerAction = { type: "write", container: "shop-db-1", path: ORDERS, content: "3 sipariş" };

export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [],
  [up(fileEager)],
  [tick(2), up(fileEager)],
  [down(), up(filePatient)],
  [writeOrder, down(), up(filePatient)],
  [down(true), up(filePatient)],
  [down(), up(fileRetry), tick(), tick()],
  [{ type: "curl", port: 3000 }],
  [],
];

/** Steps where a Docker error is the point of the step (none here: crashes show as exit codes). */
export const EXPECTED_ERRORS: Record<number, number> = {};

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir uygulama, Postgres ve Redis: healthcheck ile sıralı açılış", "An app, Postgres and Redis: an orderly start with healthchecks"),
  view: (h, info) => <DockStage host={h} labels={labels(info.t)} t={info.t} highlight={info.fresh} last={info.last} hideImages />,
  metrics: (h, t) => {
    const mine = Object.values(h.containers).filter((c) => c.project === PROJECT);
    const app = findContainer(h, "shop-app-1");
    return [
      { label: t(l("Çalışan", "Running")), value: mine.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Sağlıklı", "Healthy")), value: mine.filter((c) => c.health === "healthy").length, tone: "ok" },
      { label: t(l("app durumu", "app")), value: app ? (app.state === "running" ? "running" : `exit ${app.exitCode}`) : "—", tone: app && app.state !== "running" ? "danger" : "plain" },
      { label: t(l("app yeniden başlama", "app restarts")), value: app?.restarts ?? 0, tone: app && app.restarts > 0 ? "warn" : "plain" },
    ];
  },
  // Free play starts from the project with healthchecks; each scenario brings its own state.
  sandbox: { start: () => PATIENT, scenarios },
});
