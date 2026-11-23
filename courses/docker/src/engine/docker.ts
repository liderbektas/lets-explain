/**
 * A small, deterministic Docker for teaching: images built from layers with a build cache,
 * containers whose programs run, exit and crash with real exit codes, volumes, bind mounts,
 * port mappings, networks with name-based DNS, Compose projects, and a registry whose tags
 * can move. The same actions always give the same result.
 *
 * Simplifications (lessons that rely on one say so in a "Gerçekte" note):
 * - Time moves in ticks. Healthchecks and restarts happen on ticks.
 * - What a container does is described by a small "program" instead of real processes.
 * - Ids are short hashes of the content, not real sha256 digests; sizes are rounded MB.
 * - One host, one daemon. Swarm, BuildKit's parallel stages and secret mounts are not modelled.
 */

export type Files = Record<string, string>;

/** What the main process of a container does when it starts. */
export type Program =
  | { kind: "server"; listens: number; memory?: number; name?: string }
  | { kind: "job"; output: string[]; exitCode?: number; memory?: number }
  | { kind: "db"; listens: number; dataDir: string; memory?: number; startTicks?: number }
  | {
      kind: "app";
      listens: number;
      needsEnv?: string[];
      /** Hostnames it connects to at start, as "name:port". */
      connects?: string[];
      memory?: number;
      /** A path it writes to at start; fails when the user may not write there. */
      writes?: string;
    };

export interface ImageConfig {
  cmd: string[];
  entrypoint: string[];
  env: Record<string, string>;
  workdir: string;
  exposed: number[];
  user: string;
  program: Program;
  /** Programs the image has, so a wrong CMD fails with exit 127 like a missing binary. */
  binaries: string[];
  healthcheck: boolean;
  /** Directories and who owns them; anything else is owned by root. */
  owners: Record<string, string>;
}

export interface Layer {
  id: string;
  instruction: string;
  size: number;
  files: Files;
}

export interface Image {
  id: string;
  layers: Layer[];
  config: ImageConfig;
}

export type RestartPolicy = "no" | "always" | "unless-stopped" | "on-failure";

export interface Mount {
  type: "volume" | "bind";
  source: string;
  target: string;
}

export type ContainerState = "created" | "running" | "exited";

export interface Container {
  id: string;
  name: string;
  image: string;
  /** The tag it was started from, for display. */
  ref: string;
  state: ContainerState;
  exitCode: number | null;
  oomKilled: boolean;
  ports: { host: number; container: number }[];
  env: Record<string, string>;
  mounts: Mount[];
  networks: string[];
  restart: RestartPolicy;
  memoryLimit?: number;
  cpus?: number;
  /** Files written inside the container (its writable layer); gone with the container. */
  files: Files;
  logs: string[];
  removeOnExit: boolean;
  restarts: number;
  healthcheck: boolean;
  health: "starting" | "healthy" | "unhealthy" | null;
  healthyAt: number | null;
  manuallyStopped: boolean;
  pendingRestart: boolean;
  user: string;
  cmd: string[];
  project?: string;
  service?: string;
  /** Compose: a digest of the service's settings, so `up` recreates a container whose settings changed. */
  composeHash?: string;
}

export interface Volume {
  name: string;
  files: Files;
  anonymous: boolean;
  project?: string;
}

export interface Network {
  name: string;
  driver: "bridge" | "host" | "none";
  builtin: boolean;
  project?: string;
}

export interface Registry {
  tags: Record<string, string>;
  images: Record<string, Image>;
}

export interface Host {
  time: number;
  nextId: number;
  images: Record<string, Image>;
  /** "repo:tag" → image id, on this machine. */
  tags: Record<string, string>;
  containers: Record<string, Container>;
  volumes: Record<string, Volume>;
  networks: Record<string, Network>;
  /** Files on the host, for bind mounts, e.g. "/home/ada/site/index.html". */
  hostFiles: Files;
  /** The build cache: cache key → layer it produced. */
  cache: Record<string, Layer>;
  registry: Registry;
  /** The most recent build, step by step, for drawing. */
  lastBuild: { tag: string; steps: BuildStep[]; seconds: number; size: number; cached: number; context: BuildContext } | null;
}

/** What `docker build` sent to the builder: the folder minus what .dockerignore left out. */
export interface BuildContext {
  files: number;
  /** In MB, unrounded: a folder of a few small files is well under 1 MB. */
  size: number;
  /** The top-level names .dockerignore kept out, e.g. "node_modules". */
  ignored: string[];
}

/* ------------------------------------------------------------- hashing */

function fnv(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A short, stable id for some content: same content, same id. */
export function shortHash(text: string): string {
  return (fnv(text).toString(16).padStart(8, "0") + fnv(text, 0x9747b28c).toString(16).padStart(8, "0")).slice(0, 12);
}

const filesKey = (f: Files) =>
  Object.keys(f)
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join("\n");

/* -------------------------------------------------------- base images */

interface BaseSpec {
  ref: string;
  size: number;
  binaries: string[];
  user?: string;
  program: Program;
  cmd: string[];
  /** The image's own ENTRYPOINT, e.g. distroless runs node itself. */
  entrypoint?: string[];
  exposed?: number[];
  dataDir?: string;
  healthcheck?: boolean;
  env?: Record<string, string>;
  workdir?: string;
  owners?: Record<string, string>;
}

const SHELL = ["sh", "ls", "cat", "echo", "env", "whoami", "ping", "curl"];

/** Official images the registry starts with. Sizes are rough, uncompressed, in MB. */
export const BASE_IMAGES: BaseSpec[] = [
  { ref: "alpine:3.20", size: 8, binaries: SHELL, cmd: ["sh"], program: { kind: "job", output: [] } },
  { ref: "ubuntu:24.04", size: 78, binaries: [...SHELL, "bash", "apt-get"], cmd: ["bash"], program: { kind: "job", output: [] } },
  { ref: "nginx:1.27", size: 192, binaries: [...SHELL, "nginx"], cmd: ["nginx", "-g", "daemon off;"], exposed: [80], program: { kind: "server", listens: 80, memory: 10, name: "nginx" } },
  { ref: "node:22", size: 1100, binaries: [...SHELL, "node", "npm", "bash"], cmd: ["node"], program: { kind: "job", output: [] }, owners: { "/home/node": "node" } },
  { ref: "node:22-slim", size: 240, binaries: [...SHELL, "node", "npm"], cmd: ["node"], program: { kind: "job", output: [] }, owners: { "/home/node": "node" } },
  { ref: "node:22-alpine", size: 160, binaries: [...SHELL, "node", "npm"], cmd: ["node"], program: { kind: "job", output: [] }, owners: { "/home/node": "node" } },
  { ref: "gcr.io/distroless/nodejs22-debian12", size: 130, binaries: ["node"], cmd: [], entrypoint: ["/nodejs/bin/node"], program: { kind: "job", output: [] }, user: "nonroot" },
  { ref: "python:3.12", size: 1000, binaries: [...SHELL, "python", "pip", "bash"], cmd: ["python3"], program: { kind: "job", output: [] } },
  { ref: "python:3.12-slim", size: 150, binaries: [...SHELL, "python", "pip"], cmd: ["python3"], program: { kind: "job", output: [] } },
  { ref: "postgres:17", size: 430, binaries: [...SHELL, "postgres", "psql"], cmd: ["postgres"], exposed: [5432], healthcheck: true, program: { kind: "db", listens: 5432, dataDir: "/var/lib/postgresql/data", memory: 60, startTicks: 2 }, env: { POSTGRES_PASSWORD: "" } },
  { ref: "redis:7", size: 120, binaries: [...SHELL, "redis-server", "redis-cli"], cmd: ["redis-server"], exposed: [6379], healthcheck: true, program: { kind: "db", listens: 6379, dataDir: "/data", memory: 15, startTicks: 1 } },
  { ref: "hello-world:latest", size: 1, binaries: ["hello"], cmd: ["/hello"], program: { kind: "job", output: ["Hello from Docker!", "This message shows that your installation appears to be working correctly."] } },
];

function baseImage(spec: BaseSpec): Image {
  const layer: Layer = { id: shortHash(`base:${spec.ref}`), instruction: `FROM ${spec.ref}`, size: spec.size, files: {} };
  return {
    id: shortHash(`image:${spec.ref}`),
    layers: [layer],
    config: {
      cmd: spec.cmd,
      entrypoint: spec.entrypoint ?? [],
      env: { ...spec.env },
      workdir: spec.workdir ?? "/",
      exposed: spec.exposed ?? [],
      user: spec.user ?? "root",
      program: spec.program,
      binaries: spec.binaries,
      healthcheck: spec.healthcheck ?? false,
      owners: { ...spec.owners },
    },
  };
}

export function createHost(opts: { pulled?: string[]; hostFiles?: Files } = {}): Host {
  const registry: Registry = { tags: {}, images: {} };
  for (const spec of BASE_IMAGES) {
    const img = baseImage(spec);
    registry.images[img.id] = img;
    registry.tags[normalize(spec.ref)] = img.id;
  }
  const h: Host = {
    time: 0,
    nextId: 1,
    images: {},
    tags: {},
    containers: {},
    volumes: {},
    networks: {
      bridge: { name: "bridge", driver: "bridge", builtin: true },
      host: { name: "host", driver: "host", builtin: true },
      none: { name: "none", driver: "none", builtin: true },
    },
    hostFiles: { ...opts.hostFiles },
    cache: {},
    registry,
    lastBuild: null,
  };
  for (const ref of opts.pulled ?? []) {
    const id = registry.tags[normalize(ref)];
    if (id) {
      h.images[id] = registry.images[id]!;
      h.tags[normalize(ref)] = id;
    }
  }
  return h;
}

/** "nginx" means "nginx:latest", like the Docker CLI. */
export function normalize(ref: string): string {
  const last = ref.split("/").pop()!;
  return last.includes(":") ? ref : `${ref}:latest`;
}

export const imageSize = (img: Image) => img.layers.reduce((n, l) => n + l.size, 0);

/* -------------------------------------------------------- Dockerfiles */

export type Instruction =
  | { op: "FROM"; image: string; as?: string }
  | { op: "RUN"; cmd: string; size?: number; seconds?: number; files?: Files }
  | { op: "COPY"; src: string[]; dest: string; from?: string; chown?: string }
  | { op: "ADD"; src: string[]; dest: string }
  | { op: "WORKDIR"; path: string }
  | { op: "ENV"; key: string; value: string }
  | { op: "ARG"; key: string; value?: string }
  | { op: "EXPOSE"; port: number }
  | { op: "USER"; name: string }
  | { op: "CMD"; args: string[]; program?: Program }
  | { op: "ENTRYPOINT"; args: string[]; program?: Program }
  | { op: "HEALTHCHECK"; cmd: string };

export function instructionText(i: Instruction): string {
  switch (i.op) {
    case "FROM":
      return `FROM ${i.image}${i.as ? ` AS ${i.as}` : ""}`;
    case "RUN":
      return `RUN ${i.cmd}`;
    case "COPY":
      return `COPY ${i.from ? `--from=${i.from} ` : ""}${i.chown ? `--chown=${i.chown} ` : ""}${i.src.join(" ")} ${i.dest}`;
    case "ADD":
      return `ADD ${i.src.join(" ")} ${i.dest}`;
    case "WORKDIR":
      return `WORKDIR ${i.path}`;
    case "ENV":
      return `ENV ${i.key}=${i.value}`;
    case "ARG":
      return `ARG ${i.key}${i.value !== undefined ? `=${i.value}` : ""}`;
    case "EXPOSE":
      return `EXPOSE ${i.port}`;
    case "USER":
      return `USER ${i.name}`;
    case "CMD":
      return `CMD ${JSON.stringify(i.args)}`;
    case "ENTRYPOINT":
      return `ENTRYPOINT ${JSON.stringify(i.args)}`;
    case "HEALTHCHECK":
      return `HEALTHCHECK CMD ${i.cmd}`;
  }
}

/** Does a .dockerignore pattern leave this path out? Supports names, "dir/", "*.ext" and "**\/x". */
export function ignoredBy(patterns: string[], path: string): boolean {
  const name = path.split("/").pop()!;
  return patterns.some((raw) => {
    const p = raw.replace(/^\*\*\//, "").replace(/\/$/, "");
    if (p.startsWith("*.")) return name.endsWith(p.slice(1));
    return path === p || path.startsWith(`${p}/`) || path.split("/").includes(p);
  });
}

/** Does a COPY source (a path, a directory, or a pattern like `package*.json`) take this file? */
export function copySourceMatches(src: string, path: string): boolean {
  if (src === "." || src === "./") return true;
  if (/[*?]/.test(src)) {
    const re = new RegExp(`^${src.replace(/^\.\//, "").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`);
    return re.test(path);
  }
  const s = src.replace(/^\.\//, "");
  return path === s || path.startsWith(`${s.replace(/\/$/, "")}/`);
}

function pick(context: Files, src: string[], ignore: string[]): Files {
  const out: Files = {};
  for (const [path, content] of Object.entries(context)) {
    if (ignoredBy(ignore, path)) continue;
    if (src.some((s) => copySourceMatches(s, path))) out[path] = content;
  }
  return out;
}

function contextOf(context: Files, ignore: string[]): BuildContext {
  const paths = Object.keys(context);
  const sent = paths.filter((p) => !ignoredBy(ignore, p));
  const size = sent.reduce((n, p) => n + (context[p]!.startsWith("size:") ? Number(context[p]!.slice(5)) : context[p]!.length / 100000), 0);
  const ignored = [...new Set(paths.filter((p) => ignoredBy(ignore, p)).map((p) => p.split("/")[0]!))];
  return { files: sent.length, size, ignored };
}

const sizeOf = (f: Files) => Math.max(0, Math.round(Object.values(f).reduce((n, c) => n + (c.startsWith("size:") ? Number(c.slice(5)) : c.length / 100000), 0)));

export interface BuildStep {
  index: number;
  text: string;
  cached: boolean;
  seconds: number;
  size: number;
  stage: number;
}

/* ----------------------------------------------------------- actions */

export interface RunOptions {
  image: string;
  name?: string;
  detach?: boolean;
  rm?: boolean;
  /** "8080:80", or just "80" for a random host port (we pick 32768 upward). */
  ports?: string[];
  env?: Record<string, string>;
  /** "name:/path" (named volume), "/abs/or/./rel:/path" (bind mount) or "/path" (anonymous). */
  volumes?: string[];
  network?: string;
  restart?: RestartPolicy;
  memory?: number;
  cpus?: number;
  user?: string;
  /** Overrides CMD; when it names a binary the image lacks, the container exits 127. */
  cmd?: string[];
  /** Turns a healthcheck on (Compose `healthcheck:`), on top of the image's own. */
  healthcheck?: boolean;
  entrypoint?: string[];
}

export interface ComposeService {
  image?: string;
  build?: { dockerfile: Instruction[]; context: Files; ignore?: string[]; target?: string };
  /** Started only when one of these profiles is asked for (`--profile`). */
  profiles?: string[];
  ports?: string[];
  environment?: Record<string, string>;
  depends_on?: string[] | Record<string, { condition: "service_started" | "service_healthy" }>;
  volumes?: string[];
  networks?: string[];
  healthcheck?: boolean;
  restart?: RestartPolicy;
  command?: string[];
  mem_limit?: number;
}

export interface ComposeFile {
  /** The top-level `name:`: the project name, instead of the folder's. */
  name?: string;
  services: Record<string, ComposeService>;
  volumes?: string[];
  networks?: string[];
}

export type DockerAction =
  | { type: "pull"; ref: string }
  | { type: "push"; ref: string }
  | { type: "tag"; source: string; target: string }
  | { type: "rmi"; ref: string; force?: boolean }
  /** `noCache`: `docker build --no-cache`, every step runs again (the new layers still fill the cache). */
  | { type: "build"; tag: string; dockerfile: Instruction[]; context: Files; ignore?: string[]; args?: Record<string, string>; target?: string; noCache?: boolean }
  | ({ type: "run" } & RunOptions)
  | ({ type: "create" } & RunOptions)
  | { type: "start"; container: string }
  | { type: "stop"; container: string }
  | { type: "kill"; container: string }
  | { type: "restart"; container: string }
  | { type: "rm"; container: string; force?: boolean; volumes?: boolean }
  | { type: "exec"; container: string; cmd: string }
  | { type: "write"; container: string; path: string; content: string }
  | { type: "editHost"; path: string; content: string }
  /** `rm file` on the host. */
  | { type: "removeHost"; path: string }
  | { type: "curl"; port: number }
  | { type: "volumeCreate"; name: string }
  | { type: "volumeRm"; name: string }
  | { type: "networkCreate"; name: string }
  | { type: "networkConnect"; network: string; container: string }
  /** `only: "images"` is `docker image prune`: images only, containers and the rest stay. */
  | { type: "prune"; volumes?: boolean; all?: boolean; only?: "images" }
  | { type: "load"; container: string; memory: number }
  | { type: "tick"; count?: number }
  | { type: "daemonRestart" }
  | { type: "upstreamRelease"; ref: string; from: string; note: string }
  | { type: "composeUp"; project: string; file: ComposeFile; env?: Record<string, string>; build?: boolean; profiles?: string[]; wait?: boolean; force?: boolean }
  | { type: "composeDown"; project: string; volumes?: boolean };

export type DockerEvent =
  | { type: "pulled"; ref: string; id: string; layers: number; reused: number }
  | { type: "pushed"; ref: string; id: string; layers: number; skipped: number }
  | { type: "tagged"; source: string; target: string }
  | { type: "imageRemoved"; ref: string; id: string; untaggedOnly: boolean }
  | { type: "buildStep"; step: BuildStep }
  | { type: "built"; tag: string; id: string; size: number; seconds: number; cached: number; total: number }
  | { type: "created"; id: string; name: string; ref: string }
  | { type: "started"; name: string; program: Program["kind"] }
  | { type: "log"; name: string; line: string }
  | { type: "exited"; name: string; code: number; reason: "done" | "error" | "stopped" | "killed" | "oom" | "not-found" | "permission" }
  | { type: "removed"; name: string; volumes: string[] }
  | { type: "healthy"; name: string }
  | { type: "restarting"; name: string; count: number }
  | { type: "execOutput"; name: string; cmd: string; output: string[]; code: number }
  | { type: "wrote"; name: string; path: string; where: "layer" | "volume" | "bind"; source?: string }
  | { type: "hostEdited"; path: string; removed?: boolean }
  | { type: "curlResult"; port: number; ok: boolean; body: string }
  | { type: "volumeCreated"; name: string }
  | { type: "volumeRemoved"; name: string }
  | { type: "networkCreated"; name: string }
  | { type: "connected"; network: string; name: string }
  | { type: "pruned"; containers: string[]; images: string[]; volumes: string[]; networks: string[] }
  | { type: "daemonRestarted"; started: string[] }
  | { type: "upstreamReleased"; ref: string; id: string; note: string }
  | { type: "composeUp"; project: string; services: string[] }
  | { type: "composeWaiting"; service: string; for: string }
  | { type: "composeDown"; project: string; removed: string[]; volumes: string[] }
  | { type: "error"; message: string };

export interface StepResult {
  state: Host;
  events: DockerEvent[];
}

/* ------------------------------------------------------------- reads */

export const findContainer = (h: Host, ref: string): Container | undefined =>
  h.containers[ref] ?? Object.values(h.containers).find((c) => c.name === ref || c.id.startsWith(ref));

export const imageFor = (h: Host, ref: string): Image | undefined => {
  const id = h.tags[normalize(ref)] ?? (h.images[ref] ? ref : Object.keys(h.images).find((i) => i.startsWith(ref)));
  return id ? h.images[id] : undefined;
};

/** Files a container sees: image layers, then its own writes, then mounts on top. */
export function containerFiles(h: Host, c: Container): Files {
  const img = h.images[c.image];
  const out: Files = {};
  for (const l of img?.layers ?? []) Object.assign(out, l.files);
  Object.assign(out, c.files);
  for (const m of c.mounts) {
    for (const p of Object.keys(out)) if (p.startsWith(`${m.target}/`)) delete out[p];
    const src = m.type === "volume" ? (h.volumes[m.source]?.files ?? {}) : prefixed(h.hostFiles, m.source);
    for (const [rel, content] of Object.entries(src)) out[`${m.target}/${rel}`] = content;
  }
  return out;
}

function prefixed(files: Files, dir: string): Files {
  const out: Files = {};
  const base = dir.replace(/\/$/, "");
  for (const [p, v] of Object.entries(files)) if (p.startsWith(`${base}/`)) out[p.slice(base.length + 1)] = v;
  return out;
}

/** Can container `from` reach `name` by name? Only on a shared user-defined network. */
export function resolves(h: Host, from: Container, name: string): Container | undefined {
  const target = Object.values(h.containers).find((c) => c.name === name || (c.service === name && c.project === from.project && c.project !== undefined));
  if (!target || target.state !== "running") return undefined;
  const shared = from.networks.filter((n) => target.networks.includes(n) && h.networks[n] && !h.networks[n]!.builtin);
  return shared.length ? target : undefined;
}

export const usedPorts = (h: Host) =>
  Object.values(h.containers)
    .filter((c) => c.state === "running")
    .flatMap((c) => c.ports.map((p) => p.host));

export function memoryUse(h: Host, c: Container): number {
  if (c.state !== "running") return 0;
  return h.images[c.image]?.config.program.memory ?? 5;
}

/* ------------------------------------------------------------- apply */

export function apply(prev: Host, action: DockerAction): StepResult {
  const h = structuredClone(prev);
  const events: DockerEvent[] = [];
  const fail = (message: string): StepResult => ({ state: prev, events: [{ type: "error", message }] });

  switch (action.type) {
    case "pull": {
      const ref = normalize(action.ref);
      const id = h.registry.tags[ref];
      if (!id) return fail(`Error response from daemon: manifest for ${ref} not found: manifest unknown`);
      const img = h.registry.images[id]!;
      const have = new Set(Object.values(h.images).flatMap((i) => i.layers.map((l) => l.id)));
      const reused = img.layers.filter((l) => have.has(l.id)).length;
      h.images[id] = img;
      h.tags[ref] = id;
      events.push({ type: "pulled", ref, id, layers: img.layers.length, reused });
      break;
    }

    case "push": {
      const ref = normalize(action.ref);
      const id = h.tags[ref];
      if (!id) return fail(`An image does not exist locally with the tag: ${ref}`);
      const img = h.images[id]!;
      const there = new Set(Object.values(h.registry.images).flatMap((i) => i.layers.map((l) => l.id)));
      const skipped = img.layers.filter((l) => there.has(l.id)).length;
      h.registry.images[id] = img;
      h.registry.tags[ref] = id;
      events.push({ type: "pushed", ref, id, layers: img.layers.length, skipped });
      break;
    }

    case "tag": {
      const img = imageFor(h, action.source);
      if (!img) return fail(`No such image: ${action.source}`);
      h.tags[normalize(action.target)] = img.id;
      events.push({ type: "tagged", source: normalize(action.source), target: normalize(action.target) });
      break;
    }

    case "rmi": {
      const ref = normalize(action.ref);
      const img = imageFor(h, action.ref);
      if (!img) return fail(`No such image: ${action.ref}`);
      const tagsOf = Object.keys(h.tags).filter((t) => h.tags[t] === img.id);
      if (tagsOf.length > 1 && h.tags[ref]) {
        delete h.tags[ref];
        events.push({ type: "imageRemoved", ref, id: img.id, untaggedOnly: true });
        break;
      }
      const users = Object.values(h.containers).filter((c) => c.image === img.id);
      if (users.length && !action.force) return fail(`conflict: unable to remove repository reference "${ref}" (must force) - container ${users[0]!.id.slice(0, 12)} is using its referenced image`);
      for (const t of tagsOf) delete h.tags[t];
      if (!users.length) delete h.images[img.id];
      events.push({ type: "imageRemoved", ref, id: img.id, untaggedOnly: false });
      break;
    }

    case "build": {
      const r = build(h, action, events);
      if (typeof r === "string") return fail(r);
      break;
    }

    case "run":
    case "create": {
      const c = create(h, action, events);
      if (typeof c === "string") return fail(c);
      if (action.type === "run") startContainer(h, c, events);
      break;
    }

    case "start": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state === "running") break;
      const clash = c.ports.find((p) => usedPorts(h).includes(p.host));
      if (clash) return fail(`Bind for 0.0.0.0:${clash.host} failed: port is already allocated`);
      c.manuallyStopped = false;
      startContainer(h, c, events);
      break;
    }

    case "stop":
    case "kill": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state !== "running") return fail(`Container ${c.name} is not running`);
      c.manuallyStopped = true;
      exit(h, c, action.type === "stop" ? 0 : 137, action.type === "stop" ? "stopped" : "killed", events);
      break;
    }

    case "restart": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state === "running") exit(h, c, 0, "stopped", events, false);
      c.manuallyStopped = false;
      if (h.containers[c.id]) startContainer(h, c, events);
      break;
    }

    case "rm": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state === "running" && !action.force) return fail(`Error response from daemon: cannot remove container "${c.name}": container is running: stop the container before removing or force remove`);
      removeContainer(h, c, action.volumes ?? false, events);
      break;
    }

    case "exec": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state !== "running") return fail(`Error response from daemon: container ${c.name} is not running`);
      events.push(execIn(h, c, action.cmd, events));
      break;
    }

    case "write": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (c.state !== "running") return fail(`Error response from daemon: container ${c.name} is not running`);
      events.push(writeIn(h, c, action.path, action.content));
      break;
    }

    case "editHost": {
      h.hostFiles[action.path] = action.content;
      events.push({ type: "hostEdited", path: action.path });
      break;
    }

    case "removeHost": {
      if (h.hostFiles[action.path] === undefined) return fail(`rm: cannot remove '${action.path.split("/").pop()}': No such file or directory`);
      delete h.hostFiles[action.path];
      events.push({ type: "hostEdited", path: action.path, removed: true });
      break;
    }

    case "curl": {
      // On the host network a container listens on the host's own ports, no -p needed.
      const onHost = Object.values(h.containers).find((x) => {
        const prog = h.images[x.image]?.config.program;
        return x.state === "running" && x.networks.includes("host") && prog !== undefined && "listens" in prog && prog.listens === action.port;
      });
      if (onHost) {
        events.push({ type: "curlResult", port: action.port, ok: true, body: `${onHost.name} says hello (host network)` });
        break;
      }
      const c = Object.values(h.containers).find((x) => x.state === "running" && x.ports.some((p) => p.host === action.port));
      if (!c) {
        events.push({ type: "curlResult", port: action.port, ok: false, body: `curl: (7) Failed to connect to localhost port ${action.port}: Connection refused` });
        break;
      }
      const mapping = c.ports.find((p) => p.host === action.port)!;
      const prog = h.images[c.image]!.config.program;
      const listens = "listens" in prog ? prog.listens : -1;
      const ok = listens === mapping.container;
      const files = containerFiles(h, c);
      const page = files["/usr/share/nginx/html/index.html"] ?? files[`${h.images[c.image]!.config.workdir}/index.html`];
      events.push({
        type: "curlResult",
        port: action.port,
        ok,
        body: ok ? (page ?? `${c.name} says hello`) : "curl: (56) Recv failure: Connection reset by peer",
      });
      break;
    }

    case "volumeCreate": {
      if (!h.volumes[action.name]) h.volumes[action.name] = { name: action.name, files: {}, anonymous: false };
      events.push({ type: "volumeCreated", name: action.name });
      break;
    }

    case "volumeRm": {
      const v = h.volumes[action.name];
      if (!v) return fail(`Error: No such volume: ${action.name}`);
      const user = Object.values(h.containers).find((c) => c.mounts.some((m) => m.type === "volume" && m.source === v.name));
      if (user) return fail(`Error response from daemon: remove ${v.name}: volume is in use - [${user.id.slice(0, 12)}]`);
      delete h.volumes[action.name];
      events.push({ type: "volumeRemoved", name: action.name });
      break;
    }

    case "networkCreate": {
      if (h.networks[action.name]) return fail(`Error response from daemon: network with name ${action.name} already exists`);
      h.networks[action.name] = { name: action.name, driver: "bridge", builtin: false };
      events.push({ type: "networkCreated", name: action.name });
      break;
    }

    case "networkConnect": {
      const c = findContainer(h, action.container);
      if (!c) return fail(`Error: No such container: ${action.container}`);
      if (!h.networks[action.network]) return fail(`Error: No such network: ${action.network}`);
      if (!c.networks.includes(action.network)) c.networks.push(action.network);
      events.push({ type: "connected", network: action.network, name: c.name });
      break;
    }

    case "prune": {
      const containers = action.only === "images" ? [] : Object.values(h.containers).filter((c) => c.state !== "running");
      for (const c of containers) removeContainer(h, c, false, []);
      const used = new Set(Object.values(h.containers).map((c) => c.image));
      const tagged = new Set(Object.values(h.tags));
      const images = Object.keys(h.images).filter((id) => !used.has(id) && (action.all || !tagged.has(id)));
      for (const id of images) {
        delete h.images[id];
        for (const [t, v] of Object.entries(h.tags)) if (v === id) delete h.tags[t];
      }
      const mounted = new Set(Object.values(h.containers).flatMap((c) => c.mounts.filter((m) => m.type === "volume").map((m) => m.source)));
      const volumes = action.volumes ? Object.values(h.volumes).filter((v) => !mounted.has(v.name) && (v.anonymous || action.all)).map((v) => v.name) : [];
      for (const v of volumes) delete h.volumes[v];
      const inUse = new Set(Object.values(h.containers).flatMap((c) => c.networks));
      const networks = action.only === "images" ? [] : Object.values(h.networks).filter((n) => !n.builtin && !inUse.has(n.name)).map((n) => n.name);
      for (const n of networks) delete h.networks[n];
      events.push({ type: "pruned", containers: containers.map((c) => c.name), images, volumes, networks });
      break;
    }

    case "load": {
      const c = findContainer(h, action.container);
      if (!c || c.state !== "running") return fail(`Container ${action.container} is not running`);
      if (c.memoryLimit !== undefined && action.memory > c.memoryLimit) {
        c.oomKilled = true;
        exit(h, c, 137, "oom", events);
      } else {
        events.push({ type: "log", name: c.name, line: `handled a request using ${action.memory}MB` });
      }
      break;
    }

    case "tick": {
      const n = Math.max(1, action.count ?? 1);
      for (let i = 0; i < n; i++) {
        h.time += 1;
        for (const c of Object.values(h.containers)) {
          if (c.state === "running" && c.health === "starting" && c.healthyAt !== null && h.time >= c.healthyAt) {
            c.health = "healthy";
            events.push({ type: "healthy", name: c.name });
          }
        }
        for (const c of Object.values(h.containers)) {
          if (c.state === "exited" && c.pendingRestart) {
            c.pendingRestart = false;
            c.restarts += 1;
            events.push({ type: "restarting", name: c.name, count: c.restarts });
            startContainer(h, c, events);
          }
        }
      }
      break;
    }

    case "daemonRestart": {
      const started: string[] = [];
      const wasRunning = new Set(Object.values(h.containers).filter((c) => c.state === "running").map((c) => c.id));
      for (const c of Object.values(h.containers)) if (c.state === "running") exit(h, c, 0, "stopped", [], false);
      for (const c of Object.values(h.containers)) {
        c.pendingRestart = false;
        const again = c.restart === "always" || (c.restart === "unless-stopped" && !c.manuallyStopped) || (c.restart === "on-failure" && wasRunning.has(c.id));
        if (again && h.containers[c.id]) {
          startContainer(h, c, events);
          started.push(c.name);
        }
      }
      events.push({ type: "daemonRestarted", started });
      break;
    }

    case "upstreamRelease": {
      const base = h.registry.images[h.registry.tags[normalize(action.from)] ?? ""];
      if (!base) return fail(`No such image: ${action.from}`);
      const layer: Layer = { id: shortHash(`release:${action.ref}:${action.note}`), instruction: action.note, size: 2, files: {} };
      const img: Image = { id: shortHash(`img:${action.ref}:${action.note}`), layers: [...base.layers, layer], config: { ...base.config } };
      h.registry.images[img.id] = img;
      h.registry.tags[normalize(action.ref)] = img.id;
      events.push({ type: "upstreamReleased", ref: normalize(action.ref), id: img.id, note: action.note });
      break;
    }

    case "composeUp": {
      const r = composeUp(h, action, events);
      if (typeof r === "string") return fail(r);
      break;
    }

    case "composeDown": {
      const mine = Object.values(h.containers).filter((c) => c.project === action.project);
      for (const c of mine) {
        if (c.state === "running") exit(h, c, 0, "stopped", [], false);
        removeContainer(h, c, false, []);
      }
      for (const n of Object.values(h.networks)) if (n.project === action.project) delete h.networks[n.name];
      const vols = action.volumes ? Object.values(h.volumes).filter((v) => v.project === action.project).map((v) => v.name) : [];
      for (const v of vols) delete h.volumes[v];
      events.push({ type: "composeDown", project: action.project, removed: mine.map((c) => c.name), volumes: vols });
      break;
    }
  }

  return { state: h, events };
}

export function simulate(actions: DockerAction[], start: Host = createHost()): { states: Host[]; events: DockerEvent[][] } {
  const states = [start];
  const events: DockerEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = apply(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

/* ---------------------------------------------------------- internals */

function ensureImage(h: Host, ref: string, events: DockerEvent[]): Image | string {
  const local = imageFor(h, ref);
  if (local) return local;
  const n = normalize(ref);
  const id = h.registry.tags[n];
  if (!id) return `Unable to find image '${n}' locally\ndocker: Error response from daemon: pull access denied for ${n.split(":")[0]}, repository does not exist or may require 'docker login'`;
  const img = h.registry.images[id]!;
  h.images[id] = img;
  h.tags[n] = id;
  events.push({ type: "pulled", ref: n, id, layers: img.layers.length, reused: 0 });
  return img;
}

function build(h: Host, a: Extract<DockerAction, { type: "build" }>, events: DockerEvent[]): Image | string {
  const ignore = a.ignore ?? [];
  const stages: { name?: string; layers: Layer[]; config: ImageConfig; files: Files }[] = [];
  // Build args only count from the ARG line that declares them onward.
  const args: Record<string, string> = {};
  let totalSeconds = 0;
  let cachedCount = 0;
  let index = 0;
  const steps: BuildStep[] = [];
  // The final stage is the target, or the last one.
  const lastFrom = a.target ? a.dockerfile.findIndex((i) => i.op === "FROM" && i.as === a.target) : -1;
  const plan = lastFrom >= 0 ? a.dockerfile.slice(0, a.dockerfile.findIndex((i, k) => k > lastFrom && i.op === "FROM") === -1 ? undefined : a.dockerfile.findIndex((i, k) => k > lastFrom && i.op === "FROM")) : a.dockerfile;

  for (const ins of plan) {
    index += 1;
    if (ins.op === "FROM") {
      const fromStage = stages.find((s) => s.name === ins.image);
      if (fromStage) {
        stages.push({ name: ins.as, layers: [...fromStage.layers], config: { ...fromStage.config }, files: { ...fromStage.files } });
      } else {
        const base = ensureImage(h, ins.image, events);
        // BuildKit's wording when a base image can't be pulled.
        if (typeof base === "string") {
          const ref = normalize(ins.image);
          const full = ref.split("/")[0]!.includes(".") ? ref : ref.includes("/") ? `docker.io/${ref}` : `docker.io/library/${ref}`;
          return `failed to solve: ${ins.image}: failed to resolve source metadata for ${full}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed`;
        }
        const files: Files = {};
        for (const l of base.layers) Object.assign(files, l.files);
        stages.push({ name: ins.as, layers: [...base.layers], config: structuredClone(base.config), files });
      }
      // The base image's own size, so the drawn stack starts from it.
      const baseSize = fromStage ? 0 : stages[stages.length - 1]!.layers.reduce((n, l) => n + l.size, 0);
      const step: BuildStep = { index, text: instructionText(ins), cached: true, seconds: 0, size: baseSize, stage: stages.length - 1 };
      steps.push(step);
      events.push({ type: "buildStep", step });
      continue;
    }
    const st = stages[stages.length - 1];
    if (!st) return "failed to solve: no build stage in current context";
    const parent = st.layers[st.layers.length - 1]?.id ?? "scratch";
    const cfgKey = JSON.stringify({ ...st.config, program: st.config.program.kind });

    let files: Files = {};
    let seconds = 0;
    let size = 0;
    if (ins.op === "COPY" || ins.op === "ADD") {
      if (ins.op === "COPY" && ins.from) {
        const src = stages.find((s) => s.name === ins.from);
        if (!src) return `failed to solve: stage "${ins.from}" not found`;
        // Like Docker: a directory source's contents land in dest; a file keeps its name.
        for (const [p, v] of Object.entries(src.files)) {
          for (const s of ins.src) {
            const dir = s.replace(/\/$/, "");
            const dest = ins.dest.replace(/\/$/, "");
            if (p.startsWith(`${dir}/`)) files[`${dest}${p.slice(dir.length)}`] = v;
            else if (p === s) files[`${dest}/${p.split("/").pop()}`] = v;
          }
        }
      } else {
        const picked = pick(a.context, ins.src, ignore);
        if (Object.keys(picked).length === 0) return `failed to solve: failed to compute cache key: "${ins.src.join(" ")}" not found`;
        const dest = ins.dest === "." || ins.dest === "./" ? st.config.workdir : ins.dest.replace(/\/$/, "");
        for (const [p, v] of Object.entries(picked)) files[`${dest === "/" ? "" : dest}/${p}`] = v;
      }
      size = sizeOf(files);
      seconds = 1;
    } else if (ins.op === "RUN") {
      files = { ...ins.files };
      size = ins.size ?? 1;
      seconds = ins.seconds ?? 2;
    }
    const contentKey = ins.op === "COPY" || ins.op === "ADD" ? filesKey(files) : ins.op === "ARG" ? (a.args?.[ins.key] ?? ins.value ?? "") : "";
    // An ARG's value takes part in the key of every later RUN.
    const argKey = ins.op === "RUN" ? JSON.stringify(args) : "";
    const key = shortHash(`${parent}|${cfgKey}|${instructionText(ins)}|${contentKey}|${argKey}`);
    const hit = a.noCache ? undefined : h.cache[key];

    switch (ins.op) {
      case "WORKDIR":
        st.config.workdir = ins.path;
        break;
      case "ENV":
        st.config.env[ins.key] = ins.value;
        break;
      case "ARG":
        args[ins.key] = a.args?.[ins.key] ?? ins.value ?? "";
        break;
      case "EXPOSE":
        if (!st.config.exposed.includes(ins.port)) st.config.exposed.push(ins.port);
        break;
      case "USER":
        st.config.user = ins.name;
        break;
      case "CMD":
        st.config.cmd = ins.args;
        if (ins.program) st.config.program = ins.program;
        // An image whose ENTRYPOINT already is node (distroless) runs `node node server.js` for
        // CMD ["node", "server.js"]: node then looks for a script called "node" and stops.
        if (st.config.entrypoint[0]?.split("/").pop() === "node" && ins.args[0] === "node") {
          st.config.program = { kind: "job", output: [`Error: Cannot find module '${st.config.workdir.replace(/\/$/, "")}/node'`], exitCode: 1 };
        }
        break;
      case "ENTRYPOINT":
        st.config.entrypoint = ins.args;
        if (ins.program) st.config.program = ins.program;
        break;
      case "HEALTHCHECK":
        st.config.healthcheck = true;
        break;
      default:
        break;
    }

    const makesLayer = ins.op === "RUN" || ins.op === "COPY" || ins.op === "ADD";
    if (makesLayer) {
      const layer: Layer = hit ?? { id: key, instruction: instructionText(ins), size, files };
      h.cache[key] = layer;
      st.layers.push(layer);
      Object.assign(st.files, layer.files);
      if (ins.op === "COPY" && ins.chown) {
        for (const p of Object.keys(layer.files)) st.config.owners[p.split("/").slice(0, -1).join("/") || "/"] = ins.chown.split(":")[0]!;
      }
    } else {
      h.cache[key] = h.cache[key] ?? { id: key, instruction: instructionText(ins), size: 0, files: {} };
    }
    const cached = Boolean(hit);
    if (cached) cachedCount += 1;
    const spent = cached ? 0 : seconds;
    totalSeconds += spent;
    const step: BuildStep = { index, text: instructionText(ins), cached, seconds: spent, size: makesLayer ? size : 0, stage: stages.length - 1 };
    steps.push(step);
    events.push({ type: "buildStep", step });
  }

  const final = stages[stages.length - 1];
  if (!final) return "failed to solve: the Dockerfile has no FROM";
  const id = shortHash(`image|${final.layers.map((l) => l.id).join(",")}|${JSON.stringify(final.config)}`);
  const img: Image = { id, layers: final.layers, config: final.config };
  h.images[id] = img;
  h.tags[normalize(a.tag)] = id;
  h.lastBuild = { tag: normalize(a.tag), steps, seconds: totalSeconds, size: imageSize(img), cached: cachedCount, context: contextOf(a.context, ignore) };
  events.push({ type: "built", tag: normalize(a.tag), id, size: imageSize(img), seconds: totalSeconds, cached: cachedCount, total: index });
  return img;
}

function parseVolume(spec: string): Mount | { anonymous: string } {
  const [src, target] = spec.split(":") as [string, string | undefined];
  if (target === undefined) return { anonymous: src };
  if (src.startsWith("/") || src.startsWith("./") || src.startsWith("~")) return { type: "bind", source: src.replace(/^\.\//, "/home/ada/project/"), target };
  return { type: "volume", source: src, target };
}

function create(h: Host, o: RunOptions & { project?: string; service?: string; networks?: string[] }, events: DockerEvent[]): Container | string {
  const img = ensureImage(h, o.image, events);
  if (typeof img === "string") return img;
  // Random names like Docker's own: adjective_scientist, never one already taken.
  const ADJ = ["eager", "brave", "calm", "quirky", "jolly", "keen", "witty", "zen"];
  const SCI = ["turing", "hopper", "lovelace", "noether", "curie", "shannon", "ritchie"];
  let pickName = "";
  for (let k = h.nextId; !pickName || Object.values(h.containers).some((c) => c.name === pickName); k++) pickName = `${ADJ[k % ADJ.length]}_${SCI[Math.floor(k / ADJ.length) % SCI.length]}${k >= ADJ.length * SCI.length ? k : ""}`;
  const name = o.name ?? pickName;
  if (Object.values(h.containers).some((c) => c.name === name)) {
    return `docker: Error response from daemon: Conflict. The container name "/${name}" is already in use by container "${Object.values(h.containers).find((c) => c.name === name)!.id}". You have to remove (or rename) that container to be able to reuse that name.`;
  }
  const ports: { host: number; container: number }[] = [];
  let next = 32768;
  for (const p of o.ports ?? []) {
    const [a, b] = p.split(":");
    if (b === undefined) {
      while (usedPorts(h).includes(next) || ports.some((x) => x.host === next)) next += 1;
      ports.push({ host: next, container: Number(a) });
    } else ports.push({ host: Number(a), container: Number(b) });
  }
  const mounts: Mount[] = [];
  for (const v of o.volumes ?? []) {
    const m = parseVolume(v);
    if ("anonymous" in m) {
      const vname = shortHash(`anon:${h.nextId}:${m.anonymous}`);
      h.volumes[vname] = { name: vname, files: {}, anonymous: true };
      mounts.push({ type: "volume", source: vname, target: m.anonymous });
    } else {
      if (m.type === "volume" && !h.volumes[m.source]) {
        h.volumes[m.source] = { name: m.source, files: {}, anonymous: false, project: o.project };
        events.push({ type: "volumeCreated", name: m.source });
      }
      mounts.push(m);
    }
  }
  // A database image declares its data directory as a volume: without -v you get an anonymous one.
  const prog = img.config.program;
  if (prog.kind === "db" && !mounts.some((m) => m.target === prog.dataDir)) {
    const vname = shortHash(`anon:${h.nextId}:${prog.dataDir}`);
    h.volumes[vname] = { name: vname, files: {}, anonymous: true };
    mounts.push({ type: "volume", source: vname, target: prog.dataDir });
  }
  const network = o.network ?? "bridge";
  if (!h.networks[network]) return `docker: Error response from daemon: network ${network} not found.`;
  const id = shortHash(`container:${h.nextId}:${name}`);
  h.nextId += 1;
  const c: Container = {
    id,
    name,
    image: img.id,
    ref: normalize(o.image),
    state: "created",
    exitCode: null,
    oomKilled: false,
    ports: network === "host" ? [] : ports,
    env: { ...img.config.env, ...o.env },
    mounts,
    networks: o.networks ?? [network],
    restart: o.restart ?? "no",
    memoryLimit: o.memory,
    cpus: o.cpus,
    files: {},
    logs: [],
    removeOnExit: o.rm ?? false,
    restarts: 0,
    healthcheck: img.config.healthcheck || (o.healthcheck ?? false),
    health: null,
    healthyAt: null,
    manuallyStopped: false,
    pendingRestart: false,
    user: o.user ?? img.config.user,
    // Like `docker run`: arguments replace CMD only; --entrypoint replaces ENTRYPOINT and drops CMD.
    cmd: [...(o.entrypoint ?? img.config.entrypoint), ...(o.cmd ?? (o.entrypoint ? [] : img.config.cmd))],
    project: o.project,
    service: o.service,
  };
  h.containers[id] = c;
  events.push({ type: "created", id, name, ref: c.ref });
  return c;
}

function log(c: Container, line: string, events: DockerEvent[]) {
  c.logs.push(line);
  events.push({ type: "log", name: c.name, line });
}

function startContainer(h: Host, c: Container, events: DockerEvent[]) {
  const img = h.images[c.image]!;
  const prog = img.config.program;
  const clash = c.ports.find((p) => Object.values(h.containers).some((o) => o.id !== c.id && o.state === "running" && o.ports.some((x) => x.host === p.host)));
  if (clash) {
    events.push({ type: "error", message: `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${c.name}: Bind for 0.0.0.0:${clash.host} failed: port is already allocated.` });
    return;
  }
  c.state = "running";
  c.exitCode = null;
  c.oomKilled = false;
  c.health = c.healthcheck ? "starting" : null;
  c.healthyAt = c.healthcheck ? h.time + 1 : null;
  events.push({ type: "started", name: c.name, program: prog.kind });

  // The first word of the command must be a program the image has, or a file in it.
  const first = c.cmd[0] ?? "";
  const bin = first.split("/").pop()!;
  const found = !first || (first.includes("/") ? containerFiles(h, c)[first.replace(/^\.\//, `${img.config.workdir}/`)] !== undefined || img.config.binaries.includes(bin) : img.config.binaries.includes(bin));
  if (!found) {
    log(c, `exec: "${c.cmd[0]}": executable file not found in $PATH`, events);
    exit(h, c, 127, "not-found", events);
    return;
  }
  if (c.memoryLimit !== undefined && (prog.memory ?? 5) > c.memoryLimit) {
    log(c, "Killed", events);
    c.oomKilled = true;
    exit(h, c, 137, "oom", events);
    return;
  }

  // A command given on `docker run` (echo, sh -c "…") runs instead of the image's program.
  const own = commandRun(h, c, img, events);
  if (own) {
    for (const line of own.output) log(c, line, events);
    exit(h, c, own.code, own.code === 0 ? "done" : "error", events);
    return;
  }

  switch (prog.kind) {
    case "job":
      for (const line of prog.output) log(c, line, events);
      exit(h, c, prog.exitCode ?? 0, (prog.exitCode ?? 0) === 0 ? "done" : "error", events);
      return;
    case "server":
      log(c, `${prog.name ?? "server"}: listening on port ${prog.listens}`, events);
      return;
    case "db": {
      const data = `${prog.dataDir}/${prog.listens === 5432 ? "PG_VERSION" : "dump.rdb"}`;
      const existing = containerFiles(h, c);
      if (existing[data]) log(c, "database system is ready to accept connections (existing data found)", events);
      else {
        writeIn(h, c, data, "17");
        log(c, "initialized a new, empty database", events);
      }
      // A database needs a moment before it accepts connections, healthcheck or not.
      c.healthyAt = h.time + (prog.startTicks ?? 1);
      return;
    }
    case "app": {
      for (const k of prog.needsEnv ?? []) {
        if (!c.env[k]) {
          log(c, `Error: environment variable ${k} is not set`, events);
          exit(h, c, 1, "error", events);
          return;
        }
      }
      if (prog.writes) {
        const owner = Object.entries(img.config.owners).find(([dir]) => prog.writes!.startsWith(dir))?.[1] ?? "root";
        if (c.user !== "root" && owner !== c.user) {
          log(c, `Error: EACCES: permission denied, open '${prog.writes}'`, events);
          exit(h, c, 1, "permission", events);
          return;
        }
      }
      for (const target of prog.connects ?? []) {
        const [host] = target.split(":");
        const peer = resolves(h, c, host!);
        if (!peer) {
          log(c, `Error: getaddrinfo ENOTFOUND ${host}`, events);
          exit(h, c, 1, "error", events);
          return;
        }
        if (peer.health === "starting" || (peer.healthyAt !== null && h.time < peer.healthyAt)) {
          log(c, `Error: connect ECONNREFUSED ${host}:${target.split(":")[1]} (still starting)`, events);
          exit(h, c, 1, "error", events);
          return;
        }
      }
      log(c, `app: listening on port ${prog.listens}`, events);
      return;
    }
  }
}

function exit(h: Host, c: Container, code: number, reason: Extract<DockerEvent, { type: "exited" }>["reason"], events: DockerEvent[], policy = true) {
  c.state = "exited";
  c.exitCode = code;
  c.health = null;
  events.push({ type: "exited", name: c.name, code, reason });
  if (policy && !c.manuallyStopped) {
    const again = c.restart === "always" || c.restart === "unless-stopped" || (c.restart === "on-failure" && code !== 0);
    if (again) {
      c.pendingRestart = true;
      return;
    }
  }
  if (c.removeOnExit) removeContainer(h, c, true, events);
}

function removeContainer(h: Host, c: Container, anonymousToo: boolean, events: DockerEvent[]) {
  delete h.containers[c.id];
  const gone: string[] = [];
  for (const m of c.mounts) {
    const v = h.volumes[m.source];
    if (m.type === "volume" && v?.anonymous && (anonymousToo || c.removeOnExit)) {
      delete h.volumes[m.source];
      gone.push(m.source);
    }
  }
  events.push({ type: "removed", name: c.name, volumes: gone });
}

function writeIn(h: Host, c: Container, path: string, content: string): DockerEvent {
  const mount = [...c.mounts].sort((a, b) => b.target.length - a.target.length).find((m) => path.startsWith(`${m.target}/`));
  if (!mount) {
    c.files[path] = content;
    return { type: "wrote", name: c.name, path, where: "layer" };
  }
  const rel = path.slice(mount.target.length + 1);
  if (mount.type === "volume") {
    h.volumes[mount.source]!.files[rel] = content;
    return { type: "wrote", name: c.name, path, where: "volume", source: mount.source };
  }
  h.hostFiles[`${mount.source.replace(/\/$/, "")}/${rel}`] = content;
  return { type: "wrote", name: c.name, path, where: "bind", source: mount.source };
}

/** Plain shell utilities a container can run as its main process. */
const SHELL_COMMANDS = ["echo", "printf", "sh", "bash", "cat", "ls", "env", "whoami", "true", "false", "hostname", "pwd", "ping", "curl", "wget"];

/**
 * When `docker run image <command>` replaces the image's command with a plain shell command,
 * that command runs, prints and exits like it would in a real container. Null otherwise: the
 * image's own program runs.
 */
function commandRun(h: Host, c: Container, img: Image, events: DockerEvent[]): { output: string[]; code: number } | null {
  const own = [...img.config.entrypoint, ...img.config.cmd];
  const isOwn = c.cmd.length === own.length && c.cmd.every((w, i) => w === own[i]);
  // The image's own command runs as its program, unless it is a plain shell command (an
  // `ENTRYPOINT ["echo", …]` written in a Dockerfile) and the program knows no output of its own.
  const plainJob = img.config.program.kind === "job" && img.config.program.output.length === 0 && img.config.program.exitCode === undefined;
  if (c.cmd.length === 0 || (isOwn && !plainJob)) return null;
  const bin = c.cmd[0]!.split("/").pop()!;
  if (!SHELL_COMMANDS.includes(bin)) return null;
  if (bin === "sh" || bin === "bash") {
    const at = c.cmd.indexOf("-c");
    // A shell with no script and no terminal (no -it) has nothing to read and exits at once.
    if (at === -1) return { output: [], code: 0 };
    return script(h, c, c.cmd[at + 1] ?? "", events);
  }
  return script(h, c, c.cmd.join(" "), events);
}

/** Runs a small shell script: commands joined by `&&` or `;`, with `echo … > file` and `exit N`. */
function script(h: Host, c: Container, text: string, events?: DockerEvent[]): { output: string[]; code: number } {
  const output: string[] = [];
  const parts = text.split(/(&&|;)/).map((x) => x.trim());
  let code = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i]!;
    if (!piece) continue;
    if (i > 0 && parts[i - 1] === "&&" && code !== 0) break;
    const exitMatch = /^exit\s+(\d+)$/.exec(piece);
    if (exitMatch) return { output, code: Number(exitMatch[1]) };
    const redirect = /^(echo|printf)\s+(.*?)\s*(>>?)\s*(\S+)$/.exec(piece);
    if (redirect) {
      const value = unquote(redirect[2]!);
      const path = redirect[4]!;
      const old = containerFiles(h, c)[path];
      const wrote = writeIn(h, c, path, redirect[3] === ">>" && old ? `${old}\n${value}` : value);
      events?.push(wrote);
      code = 0;
      continue;
    }
    if (/^mkdir(\s|$)/.test(piece)) {
      code = 0;
      continue;
    }
    const [bin, ...rest] = piece.split(/\s+/);
    if (bin === "echo" || bin === "printf") {
      output.push(unquote(rest.join(" ")).replace(/\\n$/, ""));
      code = 0;
    } else if (bin === "true") code = 0;
    else if (bin === "false") code = 1;
    else if (bin === "hostname") {
      output.push(c.id);
      code = 0;
    } else if (bin === "pwd") {
      output.push(h.images[c.image]!.config.workdir);
      code = 0;
    } else {
      const ev = execIn(h, c, piece);
      if (ev.type === "execOutput") {
        output.push(...ev.output);
        code = ev.code;
      }
    }
  }
  return { output, code };
}

const unquote = (x: string) => x.trim().replace(/^(["'])(.*)\1$/, "$2");

function execIn(h: Host, c: Container, cmd: string, events?: DockerEvent[]): DockerEvent {
  const img = h.images[c.image]!;
  // A little script (`echo hi > /data/note.txt`, `a && b`) runs piece by piece.
  if (/[>;]|&&/.test(cmd) || /^(echo|printf|true|false|hostname|pwd|mkdir)(\s|$)/.test(cmd)) {
    const r = script(h, c, cmd, events);
    return { type: "execOutput", name: c.name, cmd, output: r.output, code: r.code };
  }
  const [bin, ...rest] = cmd.split(" ");
  const arg = rest.join(" ");
  const out = (output: string[], code = 0): DockerEvent => ({ type: "execOutput", name: c.name, cmd, output, code });
  if (!img.config.binaries.includes(bin!)) return out([`OCI runtime exec failed: exec failed: unable to start container process: exec: "${bin}": executable file not found in $PATH`], 127);
  const files = containerFiles(h, c);
  switch (bin) {
    case "ls": {
      const dir = (arg || img.config.workdir).replace(/\/$/, "");
      const names = new Set(Object.keys(files).filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1).split("/")[0]!));
      // The root of every Linux image holds the usual folders, even when no layer wrote a file there.
      if (dir === "") for (const d of ["bin", "dev", "etc", "home", "lib", "proc", "root", "sys", "tmp", "usr", "var"]) names.add(d);
      return out([...names].sort());
    }
    case "cat": {
      // A relative path is read from the container's working directory, like a real shell.
      const path = arg.startsWith("/") ? arg : `${img.config.workdir.replace(/\/$/, "")}/${arg.replace(/^\.\//, "")}`;
      return files[path] !== undefined ? out([files[path]!]) : out([`cat: ${arg}: No such file or directory`], 1);
    }
    case "env":
      return out(Object.entries(c.env).map(([k, v]) => `${k}=${v}`));
    case "whoami":
      return out([c.user]);
    case "ping":
    case "wget":
    case "curl": {
      // The target is the last word that is not a flag or a flag's number (`ping -c 1 cache`).
      const target = rest.filter((w) => !w.startsWith("-") && !/^\d+$/.test(w)).pop() ?? "";
      const host = target.replace(/^https?:\/\//, "").split(/[:/]/)[0]!;
      const peer = resolves(h, c, host);
      if (!peer) return out([bin === "ping" ? `ping: bad address '${host}'` : bin === "wget" ? `wget: bad address '${host}'` : `curl: (6) Could not resolve host: ${host}`], 1);
      return out([bin === "ping" ? `PING ${host}: 64 bytes from ${peer.name}` : `${peer.name} says hello`]);
    }
    default:
      return out([], 0);
  }
}

function dependsList(s: ComposeService): { name: string; healthy: boolean }[] {
  if (!s.depends_on) return [];
  if (Array.isArray(s.depends_on)) return s.depends_on.map((name) => ({ name, healthy: false }));
  return Object.entries(s.depends_on).map(([name, d]) => ({ name, healthy: d.condition === "service_healthy" }));
}

/** Replaces ${VAR} with values from the project's .env, as Compose does. */
function interpolate(value: string, env: Record<string, string>): string {
  return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, k: string, d?: string) => env[k] ?? d ?? "");
}

function composeUp(h: Host, a: Extract<DockerAction, { type: "composeUp" }>, events: DockerEvent[]): true | string {
  const env = a.env ?? {};
  const project = a.project;
  const defaultNet = `${project}_default`;
  const nets = (a.file.networks ?? []).map((n) => `${project}_${n}`);
  for (const n of [defaultNet, ...nets]) if (!h.networks[n]) h.networks[n] = { name: n, driver: "bridge", builtin: false, project };
  for (const v of a.file.volumes ?? []) {
    const name = `${project}_${v}`;
    if (!h.volumes[name]) h.volumes[name] = { name, files: {}, anonymous: false, project };
  }
  // Start services in dependency order.
  const order: string[] = [];
  const visit = (name: string, seen: Set<string>) => {
    if (order.includes(name)) return;
    if (seen.has(name)) return;
    seen.add(name);
    for (const d of dependsList(a.file.services[name]!)) visit(d.name, seen);
    order.push(name);
  };
  // A service with profiles starts only when one of them is asked for (or another service needs it).
  const active = (name: string) => {
    const p = a.file.services[name]!.profiles;
    return !p || p.length === 0 || p.some((x) => (a.profiles ?? []).includes(x));
  };
  for (const name of Object.keys(a.file.services)) if (active(name)) visit(name, new Set());

  for (const name of order) {
    const svc = a.file.services[name]!;
    const cname = `${project}-${name}-1`;
    const existing = Object.values(h.containers).find((c) => c.name === cname);
    // Like Compose: a running container whose settings did not change is left alone.
    const resolvedEnv = Object.fromEntries(Object.entries(svc.environment ?? {}).map(([k, v]) => [k, interpolate(v, env)]));
    const hash = shortHash(JSON.stringify({ ...svc, environment: resolvedEnv, depends_on: undefined, build: svc.build ? { dockerfile: svc.build.dockerfile, context: svc.build.context, target: svc.build.target } : undefined }));
    if (existing && existing.state === "running" && existing.composeHash === hash && !(a.build && svc.build) && !a.force) continue;
    if (existing) {
      if (existing.state === "running") exit(h, existing, 0, "stopped", [], false);
      removeContainer(h, existing, false, []);
    }
    for (const d of dependsList(svc)) {
      if (!d.healthy) continue;
      const dep = Object.values(h.containers).find((c) => c.project === project && c.service === d.name);
      if (dep && dep.health !== "healthy") {
        events.push({ type: "composeWaiting", service: name, for: d.name });
        let guard = 0;
        while (dep.health !== "healthy" && dep.state === "running" && guard++ < 10) {
          h.time += 1;
          if (dep.healthyAt !== null && h.time >= dep.healthyAt) {
            dep.health = "healthy";
            events.push({ type: "healthy", name: dep.name });
          }
        }
      }
    }
    let image = svc.image;
    if (svc.build) {
      const tag = svc.image ?? `${project}-${name}:latest`;
      const built = build(h, { type: "build", tag, dockerfile: svc.build.dockerfile, context: svc.build.context, ignore: svc.build.ignore, ...(svc.build.target ? { target: svc.build.target } : {}) }, events);
      if (typeof built === "string") return built;
      image = tag;
    }
    if (!image) return `service "${name}" has neither an image nor a build context specified`;
    const volumes = (svc.volumes ?? []).map((v) => {
      const [src, ...rest] = v.split(":");
      return (a.file.volumes ?? []).includes(src!) ? [`${project}_${src}`, ...rest].join(":") : v;
    });
    const c = create(
      h,
      {
        image,
        name: cname,
        ports: svc.ports,
        env: Object.fromEntries(Object.entries(svc.environment ?? {}).map(([k, v]) => [k, interpolate(v, env)])),
        volumes,
        restart: svc.restart,
        memory: svc.mem_limit,
        cmd: svc.command,
        healthcheck: svc.healthcheck,
        project,
        service: name,
        networks: svc.networks ? svc.networks.map((n) => `${project}_${n}`) : [defaultNet],
      },
      events,
    );
    if (typeof c === "string") return c;
    c.composeHash = hash;
    startContainer(h, c, events);
  }
  // `up --wait`: time passes until every service with a healthcheck is healthy (or stops).
  if (a.wait) {
    let guard = 0;
    const pending = () => Object.values(h.containers).filter((c) => c.project === project && c.state === "running" && c.health === "starting");
    while (pending().length && guard++ < 10) {
      h.time += 1;
      for (const c of pending()) {
        if (c.healthyAt !== null && h.time >= c.healthyAt) {
          c.health = "healthy";
          events.push({ type: "healthy", name: c.name });
        }
      }
    }
  }
  events.push({ type: "composeUp", project, services: order });
  return true;
}
