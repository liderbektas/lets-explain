import { createHost, ignoredBy, type DockerAction, type Files, type Host, type Instruction } from "../../engine/docker";

/** Where the reader's project lives on the host; builds read their context from here. */
export const PROJECT = "/home/ada/project";

/** A small Node web shop, the way a real project folder looks before Docker. */
export const PROJECT_FILES: Files = {
  "package.json": '{"name":"shop","scripts":{"start":"node server.js"}}',
  "package-lock.json": "lockfile v3",
  "server.js": "serves index.html on :3000",
  "index.html": "Merhaba v1",
  "node_modules/express/index.js": "size:200",
  ".git/HEAD": "ref: refs/heads/main",
  ".env": "STRIPE_KEY=sk_live_secret",
};

/** The project's .dockerignore. */
export const IGNORE = ["node_modules", ".git", ".env"];

const program = { kind: "app", listens: 3000 } as const;

/** Copying everything first: any code change re-runs npm ci. */
export const NAIVE: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["."], dest: "." },
  { op: "RUN", cmd: "npm ci --omit=dev", size: 60, seconds: 30 },
  { op: "EXPOSE", port: 3000 },
  { op: "CMD", args: ["node", "server.js"], program },
];

/** The recipe: dependencies first, source after, then a non-root user. */
export const SMART: Instruction[] = [
  { op: "FROM", image: "node:22-slim" },
  { op: "WORKDIR", path: "/app" },
  { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
  { op: "RUN", cmd: "npm ci --omit=dev", size: 60, seconds: 30 },
  { op: "COPY", src: ["."], dest: "." },
  { op: "USER", name: "node" },
  { op: "EXPOSE", port: 3000 },
  { op: "CMD", args: ["node", "server.js"], program },
];

/** The project as a build context: the host folder with its prefix stripped. */
export function contextOf(h: Host): Files {
  const out: Files = {};
  for (const [p, v] of Object.entries(h.hostFiles)) if (p.startsWith(`${PROJECT}/`)) out[p.slice(PROJECT.length + 1)] = v;
  return out;
}

/** `ignore: null` builds as if the project had no .dockerignore. */
export const buildWith = (h: Host, dockerfile: Instruction[], tag = "shop", ignore: string[] | null = IGNORE): DockerAction => ({
  type: "build",
  tag,
  dockerfile,
  context: contextOf(h),
  ...(ignore ? { ignore } : {}),
});

/** Is this the copy-everything-first Dockerfile? (Its first COPY takes the whole folder.) */
export function isNaive(a: DockerAction): boolean {
  if (a.type !== "build") return false;
  const first = a.dockerfile.find((i): i is Extract<Instruction, { op: "COPY" }> => i.op === "COPY");
  return Boolean(first?.src.includes("."));
}

/** A fresh machine with the project folder on it and Docker installed. */
export function freshHost(): Host {
  const files: Files = {};
  for (const [p, v] of Object.entries(PROJECT_FILES)) files[`${PROJECT}/${p}`] = v;
  return createHost({ hostFiles: files });
}

/** Which project files a build leaves out. */
export const ignoredFiles = (ignore: string[]) => Object.keys(PROJECT_FILES).filter((p) => ignoredBy(ignore, p));

/** The current version number written in index.html. */
export const versionOf = (h: Host) => Number(/v(\d+)/.exec(h.hostFiles[`${PROJECT}/index.html`] ?? "")?.[1] ?? 0);
