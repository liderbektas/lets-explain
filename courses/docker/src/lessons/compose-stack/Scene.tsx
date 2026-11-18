import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type ComposeFile, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { missions } from "./missions";

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

const sandboxStart = (): Host => createHost();

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const mine = Object.values(h.containers).filter((c) => c.project === PROJECT);
  const dbUp = findContainer(h, "shop-db-1")?.state === "running";
  const hasVolume = Object.values(h.volumes).some((v) => v.project === PROJECT);
  return [
    {
      label: "compose up",
      buttons: [
        { label: tr ? "up -d (kısa depends_on)" : "up -d (short depends_on)", action: up(fileEager), tone: "producer" },
        { label: "up -d (service_healthy)", action: up(filePatient), tone: "producer" },
      ],
    },
    {
      label: "compose down",
      buttons: [
        { label: "down", action: down(), tone: "danger", disabled: mine.length === 0 },
        { label: "down -v", action: down(true), tone: "danger", disabled: mine.length === 0 && !hasVolume },
      ],
    },
    {
      label: tr ? "Dene" : "Try",
      buttons: [
        { label: tr ? "zaman geçsin" : "let time pass", action: tick(), tone: "plain" },
        { label: "curl localhost:3000", action: { type: "curl", port: 3000 }, tone: "go" },
        { label: tr ? "db'ye sipariş yaz" : "write an order to db", action: writeOrder, tone: "go", disabled: !dbUp },
      ],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir uygulama, Postgres ve Redis: healthcheck ile sıralı açılış", "An app, Postgres and Redis: an orderly start with healthchecks"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages />,
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
  sandbox: { start: sandboxStart, rows, missions },
});
