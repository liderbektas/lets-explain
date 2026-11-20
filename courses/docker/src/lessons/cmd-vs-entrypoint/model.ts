import { createHost, normalize, simulate, type Container, type DockerAction, type Host, type Instruction } from "../../engine/docker";

/**
 * The lesson's images and how Docker turns ENTRYPOINT, CMD and the words after the image
 * name into one command line. The model's `run` takes the final command as `cmd`, so this
 * file does what Docker does: arguments after the image replace CMD and are appended to
 * ENTRYPOINT; `--entrypoint` replaces ENTRYPOINT and drops the image's CMD.
 */

export interface ImageSpec {
  ref: string;
  entrypoint: string[];
  cmd: string[];
  /** How the Dockerfile writes it (shell form shows as plain text). */
  lines: string[];
}

const job = { kind: "job" as const, output: [] as string[] };

export const IMAGES: Record<string, ImageSpec> = {
  "acme/greet:cmd": { ref: "acme/greet:cmd", entrypoint: [], cmd: ["echo", "Merhaba"], lines: ["FROM alpine:3.20", 'CMD ["echo", "Merhaba"]'] },
  "acme/greet:ep": { ref: "acme/greet:ep", entrypoint: ["echo", "Merhaba"], cmd: ["dünya"], lines: ["FROM alpine:3.20", 'ENTRYPOINT ["echo", "Merhaba"]', 'CMD ["dünya"]'] },
  "acme/web:shell": { ref: "acme/web:shell", entrypoint: [], cmd: ["/bin/sh", "-c", "nginx -g 'daemon off;'"], lines: ["FROM nginx:1.27", "CMD nginx -g 'daemon off;'"] },
  "acme/web:exec": { ref: "acme/web:exec", entrypoint: [], cmd: ["nginx", "-g", "daemon off;"], lines: ["FROM nginx:1.27", 'CMD ["nginx", "-g", "daemon off;"]'] },
};

export const BUILDS: DockerAction[] = [
  { type: "build", tag: "acme/greet:cmd", context: {}, dockerfile: [{ op: "FROM", image: "alpine:3.20" }, { op: "CMD", args: ["echo", "Merhaba"], program: job }] },
  {
    type: "build",
    tag: "acme/greet:ep",
    context: {},
    dockerfile: [{ op: "FROM", image: "alpine:3.20" }, { op: "ENTRYPOINT", args: ["echo", "Merhaba"], program: job }, { op: "CMD", args: ["dünya"] }],
  },
  ...(["shell", "exec"] as const).map(
    (kind): DockerAction => ({
      type: "build",
      tag: `acme/web:${kind}`,
      context: {},
      dockerfile: [{ op: "FROM", image: "nginx:1.27" }, { op: "CMD", args: IMAGES[`acme/web:${kind}`]!.cmd, program: { kind: "server", listens: 80, name: "nginx" } } as Instruction],
    }),
  ),
];

/**
 * The spec of the image a container came from: one of the lesson's own, or one the reader built,
 * read from the image's settings (and its Dockerfile lines from the last build of that tag).
 */
export function specFor(c: Container, host?: Host): ImageSpec | undefined {
  const known = IMAGES[c.ref];
  if (known) return known;
  const img = host?.images[c.image];
  if (!img) return undefined;
  const b = host!.lastBuild;
  const lines = b && normalize(b.tag) === normalize(c.ref) ? b.steps.map((s) => s.text) : [];
  return { ref: c.ref.replace(/:latest$/, ""), entrypoint: img.config.entrypoint, cmd: img.config.cmd, lines };
}

/** What `docker run [--entrypoint E] IMAGE [args...]` would execute as PID 1. */
export function commandLine(ref: string, args: string[] = [], entrypoint?: string): string[] {
  const img = IMAGES[ref]!;
  if (entrypoint !== undefined) return [entrypoint, ...args];
  return [...img.entrypoint, ...(args.length ? args : img.cmd)];
}

/** A `docker run` move with the command worked out the way Docker does it. */
export function runOf(name: string, ref: string, args: string[] = [], entrypoint?: string): DockerAction {
  // The engine applies the same rule as `commandLine`: args replace CMD, --entrypoint replaces ENTRYPOINT.
  return { type: "run", image: ref, name, ...(args.length ? { cmd: args } : {}), ...(entrypoint !== undefined ? { entrypoint: [entrypoint] } : {}) };
}

/** The `docker run` line that produced a container, read back from its command. */
export function runLineOf(c: Container, host?: Host): string {
  const img = specFor(c, host);
  if (!img) return `docker run ${c.ref.replace(/:latest$/, "")}`;
  const base = [...img.entrypoint, ...img.cmd];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (same(c.cmd, base)) return `docker run ${img.ref}`;
  const startsWithEntry = img.entrypoint.length > 0 && same(c.cmd.slice(0, img.entrypoint.length), img.entrypoint);
  if (startsWithEntry) return `docker run ${img.ref} ${c.cmd.slice(img.entrypoint.length).join(" ")}`;
  if (img.entrypoint.length === 0) return `docker run ${img.ref} ${c.cmd.join(" ")}`;
  return `docker run --entrypoint ${c.cmd[0]} ${img.ref} ${c.cmd.slice(1).join(" ")}`.trim();
}

/** What the process prints: enough to tell the cases apart. */
export function printed(c: Container): string[] {
  if (c.exitCode === 127) return c.logs.slice(-1);
  const [bin, ...rest] = c.cmd;
  if (bin === "echo") return [rest.join(" ")];
  if (bin === "ls") return ["bin  etc  home  lib  usr  var"];
  if (bin === "/bin/sh" || bin === "nginx") return c.logs.slice(-1);
  return c.logs.slice(-1);
}

/** The container the scene focuses on: the one created last. */
export function newest(h: Host): Container | undefined {
  return Object.values(h.containers).at(-1);
}

/** The lesson's machine: the four small images are built, nothing runs. */
export const START: Host = (() => {
  const r = simulate(BUILDS, createHost());
  return r.states[r.states.length - 1]!;
})();
