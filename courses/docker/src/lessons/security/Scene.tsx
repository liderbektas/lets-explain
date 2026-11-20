import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, imageFor, type Container, type DockerAction, type DockerEvent, type Files, type Host, type Instruction } from "../../engine/docker";
import { makeDockerScene } from "../shared/DockerScene";
import { ROOT_DOCKERFILE, running, scenarios } from "./scenarios";
import { hasSecret, SecurityPanel } from "./SecurityPanel";

export const SLUG = "security";

/** The project folder, with a real-looking secret in `.env` (a made-up key). */
export const CONTEXT: Files = { "package.json": '{"name":"api"}', "server.js": "app", ".env": "API_KEY=sk_live_51Hx_example" };
const APP = { kind: "app" as const, listens: 3000 };
const head: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["package.json"], dest: "./" },
  { op: "RUN", cmd: "npm ci --omit=dev", size: 40, seconds: 20, files: { "/app/node_modules/.package-lock.json": "deps" } },
];

export const DOCKERFILES = {
  /** No USER line: runs as root. */
  root: [...head, { op: "COPY", src: ["."], dest: "." }, { op: "CMD", args: ["node", "server.js"], program: APP }] satisfies Instruction[],
  /** Owned by and running as the image's `node` user. */
  user: [...head, { op: "COPY", src: ["."], dest: ".", chown: "node:node" }, { op: "USER", name: "node" }, { op: "CMD", args: ["node", "server.js"], program: APP }] satisfies Instruction[],
  /** Copies the .env file into the image on purpose. */
  leaky: [...head, { op: "COPY", src: [".env"], dest: "./.env" }, { op: "COPY", src: ["server.js"], dest: "." }, { op: "CMD", args: ["node", "server.js"], program: APP }] satisfies Instruction[],
  /** "Fixes" it by deleting the file in a later layer. */
  leakyRm: [...head, { op: "COPY", src: [".env"], dest: "./.env" }, { op: "RUN", cmd: "rm .env", size: 0, seconds: 1 }, { op: "COPY", src: ["server.js"], dest: "." }, { op: "CMD", args: ["node", "server.js"], program: APP }] satisfies Instruction[],
  /** Two stages; the runtime is distroless: no shell, a non-root user by default. */
  distroless: [
    { op: "FROM", image: "node:22-slim", as: "build" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["package.json"], dest: "./" },
    { op: "RUN", cmd: "npm ci --omit=dev", size: 40, seconds: 20, files: { "/app/node_modules/.package-lock.json": "deps" } },
    { op: "COPY", src: ["."], dest: "." },
    { op: "FROM", image: "gcr.io/distroless/nodejs22-debian12" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", from: "build", src: ["/app"], dest: "/app" },
    // distroless's ENTRYPOINT already is node: CMD only names the script.
    { op: "CMD", args: ["server.js"], program: APP },
  ] satisfies Instruction[],
};

const IGNORE = [".env", ".git"];
const build = (tag: string, dockerfile: Instruction[], ignore = IGNORE): DockerAction => ({ type: "build", tag, dockerfile, context: CONTEXT, ignore });
const run = (name: string, image: string, env?: Record<string, string>): DockerAction => ({ type: "run", image, detach: true, name, ...(env ? { env } : {}) });
const exec = (container: string, cmd: string): DockerAction => ({ type: "exec", container, cmd });

export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [build("acme/api:root", DOCKERFILES.root), run("api-root", "acme/api:root"), exec("api-root", "whoami")],
  [build("acme/api:user", DOCKERFILES.user), run("api-user", "acme/api:user"), exec("api-user", "whoami")],
  [build("acme/api:leaky", DOCKERFILES.leaky, [])],
  [build("acme/api:leaky2", DOCKERFILES.leakyRm, [])],
  [build("acme/api:clean", DOCKERFILES.user), run("api", "acme/api:clean", { API_KEY: "sk_live_51Hx_example" })],
  [],
  [{ type: "pull", ref: "nod:22-slim" }],
  [build("acme/api:distroless", DOCKERFILES.distroless), run("api-dl", "acme/api:distroless"), exec("api-dl", "sh")],
  [],
  [],
];

/** Steps where a Docker error is the point of the step. */
export const EXPECTED_ERRORS: Record<number, number> = { 6: 1 };

/** The container a step is about: the one the last action touched, else the newest. */
function focus(h: Host, names: string[]): Container | undefined {
  for (const n of names) {
    const c = findContainer(h, n);
    if (c) return c;
  }
  return Object.values(h.containers).at(-1);
}

/** What the cards show: the image just built (or the sandbox's running one) and the container in focus. */
function shown(h: Host, sandbox: boolean, last: DockerEvent[]) {
  const touched = last.flatMap((e) => ("name" in e && typeof e.name === "string" ? [e.name] : []));
  const c = sandbox ? findContainer(h, "api") : focus(h, touched);
  const tag = sandbox ? (c ? (Object.keys(h.tags).find((t) => h.tags[t] === c.image) ?? c.ref) : DEV) : (h.lastBuild?.tag ?? c?.ref);
  const image = sandbox && c ? h.images[c.image] : tag ? imageFor(h, tag) : undefined;
  return { c, tag, image };
}

/** The image the try-it step is about. */
const DEV = "acme/api:dev";

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir image'ın katmanları ve ondan çalışan container", "An image's layers and the container running from it"),
  view: (h, info) => {
    const { c, tag, image } = shown(h, info.sandbox, info.last);
    return <SecurityPanel image={image} tag={tag?.replace(/:latest$/, "")} container={c} last={info.last} t={info.t} />;
  },
  metrics: (h, t, info) => {
    // The same image and container the cards show, so the numbers never contradict them.
    const { c, image: img } = shown(h, info.sandbox, info.last);
    return [
      { label: t(l("Kullanıcı", "User")), value: c?.user ?? "—", tone: c?.user === "root" ? "danger" : c ? "ok" : "plain" },
      { label: t(l("Image'da sır", "Secret in image")), value: hasSecret(img) ? t(l("var", "yes")) : t(l("yok", "no")), tone: hasSecret(img) ? "danger" : "ok" },
      { label: t(l("Kabuk", "Shell")), value: img?.config.binaries.includes("sh") ? t(l("var", "yes")) : t(l("yok", "none")) },
    ];
  },
  // Free play: the root Dockerfile and no .dockerignore: the key is inside and `api` runs as root.
  sandbox: { start: () => running(ROOT_DOCKERFILE), scenarios },
});
