import { describe, expect, it } from "vitest";
import { containerFiles, createHost, findContainer, imageFor, imageSize, simulate, type DockerAction, type DockerEvent, type Files, type Instruction } from "./docker";

const run = (actions: DockerAction[], start = createHost()) => {
  const r = simulate(actions, start);
  return { h: r.states[r.states.length - 1]!, events: r.events.flat(), errors: r.events.flat().filter((e) => e.type === "error") };
};
const ok = (actions: DockerAction[], start = createHost()) => {
  const r = run(actions, start);
  expect(r.errors).toEqual([]);
  return r;
};
const of = <T extends DockerEvent["type"]>(events: DockerEvent[], type: T) => events.filter((e): e is Extract<DockerEvent, { type: T }> => e.type === type);

const app: Files = { "package.json": '{"name":"shop"}', "package-lock.json": "lock-1", "server.js": "v1", "node_modules/x/index.js": "size:200", ".git/HEAD": "ref" };
const naive: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["."], dest: "." },
  { op: "RUN", cmd: "npm ci", size: 80, seconds: 30 },
  { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
];
const smart: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
  { op: "RUN", cmd: "npm ci", size: 80, seconds: 30 },
  { op: "COPY", src: ["."], dest: "." },
  { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
];

describe("images and the build cache", () => {
  it("a rebuild with nothing changed is fully cached", () => {
    const b: DockerAction = { type: "build", tag: "shop:1", dockerfile: smart, context: app, ignore: ["node_modules", ".git"] };
    const r = ok([b, b]);
    const builds = of(r.events, "built");
    expect(builds[0]!.seconds).toBeGreaterThan(30);
    expect(builds[1]!.seconds).toBe(0);
  });

  it("copying the source before npm ci re-runs it on every code change; copying package.json first does not", () => {
    const changed = { ...app, "server.js": "v2" };
    const naiveRun = ok([
      { type: "build", tag: "a", dockerfile: naive, context: app, ignore: ["node_modules"] },
      { type: "build", tag: "a", dockerfile: naive, context: changed, ignore: ["node_modules"] },
    ]);
    const smartRun = ok([
      { type: "build", tag: "b", dockerfile: smart, context: app, ignore: ["node_modules"] },
      { type: "build", tag: "b", dockerfile: smart, context: changed, ignore: ["node_modules"] },
    ]);
    expect(of(naiveRun.events, "built")[1]!.seconds).toBeGreaterThanOrEqual(30);
    expect(of(smartRun.events, "built")[1]!.seconds).toBeLessThan(5);
  });

  it(".dockerignore keeps node_modules out of the image and stops .git changes from busting the cache", () => {
    const withAll = ok([{ type: "build", tag: "fat", dockerfile: smart, context: app }]);
    const ignored = ok([{ type: "build", tag: "slim", dockerfile: smart, context: app, ignore: ["node_modules", ".git"] }]);
    expect(imageSize(imageFor(withAll.h, "fat")!)).toBeGreaterThan(imageSize(imageFor(ignored.h, "slim")!) + 150);
    const again = ok([{ type: "build", tag: "slim", dockerfile: smart, context: { ...app, ".git/HEAD": "other" }, ignore: ["node_modules", ".git"] }], ignored.h);
    expect(of(again.events, "built")[0]!.seconds).toBe(0);
  });

  it("a multi-stage build ships only the last stage", () => {
    const multi: Instruction[] = [
      { op: "FROM", image: "node:22", as: "build" },
      { op: "WORKDIR", path: "/app" },
      { op: "COPY", src: ["."], dest: "." },
      { op: "RUN", cmd: "npm ci && npm run build", size: 300, seconds: 40, files: { "/app/dist/server.js": "bundle" } },
      { op: "FROM", image: "gcr.io/distroless/nodejs22-debian12" },
      { op: "COPY", from: "build", src: ["/app/dist"], dest: "/app" },
      { op: "CMD", args: ["/app/dist/server.js"], program: { kind: "app", listens: 3000 } },
    ];
    const r = ok([{ type: "build", tag: "shop:multi", dockerfile: multi, context: app, ignore: ["node_modules"] }]);
    const img = imageFor(r.h, "shop:multi")!;
    expect(imageSize(img)).toBeLessThan(200);
    expect(img.config.user).toBe("nonroot");
  });

  it("a secret copied in stays in the image even if a later RUN deletes it", () => {
    const leaky: Instruction[] = [
      { op: "FROM", image: "alpine:3.20" },
      { op: "COPY", src: [".env"], dest: "/app/.env" },
      { op: "RUN", cmd: "rm /app/.env", size: 0 },
    ];
    const r = ok([{ type: "build", tag: "leaky", dockerfile: leaky, context: { ".env": "API_KEY=secret" } }]);
    expect(imageFor(r.h, "leaky")!.layers.some((l) => Object.values(l.files).includes("API_KEY=secret"))).toBe(true);
  });
});

describe("containers", () => {
  it("hello-world prints and exits 0; --rm removes it", () => {
    const r = ok([{ type: "run", image: "hello-world", name: "hi" }, { type: "run", image: "hello-world", name: "bye", rm: true }]);
    expect(findContainer(r.h, "hi")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(r.h, "bye")).toBeUndefined();
  });

  it("a missing binary exits 127, a missing env var exits 1, memory over the limit is OOM-killed with 137", () => {
    const r = ok([
      { type: "build", tag: "api", dockerfile: [{ op: "FROM", image: "node:22-slim" }, { op: "CMD", args: ["node", "api.js"], program: { kind: "app", listens: 3000, needsEnv: ["DATABASE_URL"], memory: 120 } }], context: {} },
      { type: "run", image: "nginx:1.27", name: "typo", cmd: ["ngnix"] },
      { type: "run", image: "api", name: "noenv" },
      { type: "run", image: "api", name: "small", env: { DATABASE_URL: "x" }, memory: 64 },
      { type: "run", image: "api", name: "fine", env: { DATABASE_URL: "x" }, memory: 256 },
    ]);
    expect(findContainer(r.h, "typo")!.exitCode).toBe(127);
    expect(findContainer(r.h, "noenv")!.exitCode).toBe(1);
    expect(findContainer(r.h, "small")).toMatchObject({ exitCode: 137, oomKilled: true });
    expect(findContainer(r.h, "fine")!.state).toBe("running");
  });

  it("port mapping: curl reaches the right container; a used host port is refused", () => {
    const r = ok([{ type: "run", image: "nginx:1.27", name: "web", ports: ["8080:80"], detach: true }, { type: "curl", port: 8080 }, { type: "curl", port: 9090 }]);
    const curls = of(r.events, "curlResult");
    expect(curls[0]!.ok).toBe(true);
    expect(curls[1]!.ok).toBe(false);
    const clash = run([{ type: "run", image: "nginx:1.27", name: "web2", ports: ["8080:80"] }], r.h);
    expect(clash.errors[0]!.message).toContain("port is already allocated");
    const wrong = ok([{ type: "run", image: "nginx:1.27", name: "web3", ports: ["8081:8080"] }, { type: "curl", port: 8081 }], r.h);
    expect(of(wrong.events, "curlResult")[0]!.ok).toBe(false);
  });

  it("restart policies: on-failure retries a crash, unless-stopped survives a daemon restart unless stopped", () => {
    const r = ok([
      { type: "build", tag: "flaky", dockerfile: [{ op: "FROM", image: "alpine:3.20" }, { op: "CMD", args: ["sh", "run.sh"], program: { kind: "job", output: ["boom"], exitCode: 1 } }], context: {} },
      { type: "run", image: "flaky", name: "f", restart: "on-failure" },
      { type: "tick", count: 2 },
      { type: "run", image: "nginx:1.27", name: "a", restart: "unless-stopped" },
      { type: "run", image: "nginx:1.27", name: "b", restart: "unless-stopped" },
      { type: "stop", container: "b" },
      { type: "daemonRestart" },
    ]);
    expect(findContainer(r.h, "f")!.restarts).toBe(2);
    expect(findContainer(r.h, "a")!.state).toBe("running");
    expect(findContainer(r.h, "b")!.state).toBe("exited");
  });
});

describe("storage", () => {
  it("data in the container layer dies with the container; a named volume keeps it", () => {
    const r = ok([
      { type: "run", image: "nginx:1.27", name: "w1" },
      { type: "write", container: "w1", path: "/data/notes.txt", content: "hi" },
      { type: "rm", container: "w1", force: true },
      { type: "run", image: "nginx:1.27", name: "w2", volumes: ["notes:/data"] },
      { type: "write", container: "w2", path: "/data/notes.txt", content: "kept" },
      { type: "rm", container: "w2", force: true },
      { type: "run", image: "nginx:1.27", name: "w3", volumes: ["notes:/data"] },
    ]);
    expect(containerFiles(r.h, findContainer(r.h, "w3")!)["/data/notes.txt"]).toBe("kept");
  });

  it("postgres keeps its data in a named volume across a new container", () => {
    const r = ok([
      { type: "run", image: "postgres:17", name: "db", volumes: ["pgdata:/var/lib/postgresql/data"], env: { POSTGRES_PASSWORD: "x" } },
      { type: "rm", container: "db", force: true },
      { type: "run", image: "postgres:17", name: "db", volumes: ["pgdata:/var/lib/postgresql/data"], env: { POSTGRES_PASSWORD: "x" } },
    ]);
    expect(findContainer(r.h, "db")!.logs.at(-1)).toContain("existing data found");
  });

  it("a bind mount shows host edits inside the container at once", () => {
    const start = createHost({ hostFiles: { "/home/ada/site/index.html": "v1" } });
    const r = ok([
      { type: "run", image: "nginx:1.27", name: "web", ports: ["8080:80"], volumes: ["/home/ada/site:/usr/share/nginx/html"] },
      { type: "editHost", path: "/home/ada/site/index.html", content: "v2" },
      { type: "curl", port: 8080 },
    ], start);
    expect(of(r.events, "curlResult")[0]!.body).toBe("v2");
  });
});

describe("networks and compose", () => {
  it("names resolve on a user-defined network, not on the default bridge", () => {
    const r = ok([
      { type: "run", image: "redis:7", name: "cache" },
      { type: "run", image: "alpine:3.20", name: "probe", cmd: ["sh"] },
    ]);
    void r;
    const net = ok([
      { type: "networkCreate", name: "shop" },
      { type: "run", image: "redis:7", name: "cache", network: "shop" },
      { type: "run", image: "nginx:1.27", name: "web", network: "shop" },
      { type: "exec", container: "web", cmd: "ping cache" },
      { type: "run", image: "nginx:1.27", name: "outsider" },
      { type: "exec", container: "outsider", cmd: "ping cache" },
    ]);
    const outs = of(net.events, "execOutput");
    expect(outs[0]!.code).toBe(0);
    expect(outs[1]!.code).toBe(1);
  });

  it("compose: an app that does not wait for the database crashes; service_healthy fixes it", () => {
    const appImage: Instruction[] = [{ op: "FROM", image: "node:22-slim" }, { op: "CMD", args: ["node", "app.js"], program: { kind: "app", listens: 3000, connects: ["db:5432"], needsEnv: ["DB_PASSWORD"] } }];
    const file = (healthy: boolean) => ({
      services: {
        db: { image: "postgres:17", environment: { POSTGRES_PASSWORD: "${DB_PASSWORD}" }, volumes: ["pgdata:/var/lib/postgresql/data"] },
        app: {
          build: { dockerfile: appImage, context: {} },
          ports: ["3000:3000"],
          environment: { DB_PASSWORD: "${DB_PASSWORD}" },
          depends_on: healthy ? { db: { condition: "service_healthy" as const } } : ["db"],
        },
      },
      volumes: ["pgdata"],
    });
    const eager = ok([{ type: "composeUp", project: "shop", file: file(false), env: { DB_PASSWORD: "pw" } }]);
    expect(findContainer(eager.h, "shop-app-1")!.exitCode).toBe(1);
    const patient = ok([{ type: "composeUp", project: "shop", file: file(true), env: { DB_PASSWORD: "pw" } }]);
    expect(findContainer(patient.h, "shop-app-1")!.state).toBe("running");
    expect(findContainer(patient.h, "shop-db-1")!.env.POSTGRES_PASSWORD).toBe("pw");
    const down = ok([{ type: "composeDown", project: "shop" }], patient.h);
    expect(Object.keys(down.h.containers)).toHaveLength(0);
    expect(down.h.volumes.shop_pgdata).toBeDefined();
    expect(ok([{ type: "composeDown", project: "shop", volumes: true }], patient.h).h.volumes.shop_pgdata).toBeUndefined();
  });
});

describe("registry", () => {
  it("latest moves under you; a pinned tag does not", () => {
    const r = ok([
      { type: "pull", ref: "node:22-alpine" },
      { type: "tag", source: "node:22-alpine", target: "acme/base:latest" },
      { type: "tag", source: "node:22-alpine", target: "acme/base:1.0" },
      { type: "push", ref: "acme/base:latest" },
      { type: "push", ref: "acme/base:1.0" },
      { type: "upstreamRelease", ref: "acme/base:latest", from: "acme/base:1.0", note: "new major" },
      { type: "rmi", ref: "acme/base:latest" },
      { type: "pull", ref: "acme/base:latest" },
    ]);
    expect(r.h.tags["acme/base:latest"]).not.toBe(r.h.tags["acme/base:1.0"]);
    const pushes = of(r.events, "pushed");
    expect(pushes[1]!.skipped).toBe(pushes[1]!.layers);
  });

  it("prune removes stopped containers and dangling images, volumes only when asked", () => {
    const r = ok([
      { type: "run", image: "hello-world", name: "done" },
      { type: "run", image: "nginx:1.27", name: "web", volumes: ["keep:/data"] },
      { type: "rm", container: "web", force: true },
      { type: "prune" },
    ]);
    expect(findContainer(r.h, "done")).toBeUndefined();
    expect(r.h.volumes.keep).toBeDefined();
    expect(ok([{ type: "prune", volumes: true, all: true }], r.h).h.volumes.keep).toBeUndefined();
  });
});
