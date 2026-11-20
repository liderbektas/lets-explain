import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { createHost, imageFor, imageSize, instructionText, type DockerAction, type Files, type Host, type Instruction } from "../../engine/docker";
import { parseDockerfile } from "../../engine/files";
import { BuildStage } from "../../iso/BuildStage";
import { buildLabels } from "../dockerfile-basics/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { project, SINGLE, scenarios } from "./scenarios";
import { SizeBars } from "./SizeBars";

export const SLUG = "multi-stage";

/** A TypeScript service: dev tools are needed to build it, only dist/ is needed to run it. */
export const PROJECT: Files = {
  "package.json": '{"scripts":{"build":"esbuild src/server.ts --bundle --outfile=dist/server.js"}}',
  "package-lock.json": "lock-1",
  "src/server.ts": "ts source",
};

export const DISTROLESS = "gcr.io/distroless/nodejs22-debian12";
export const BASES = ["node:22", "node:22-slim", "node:22-alpine", DISTROLESS];
const SHORT: Record<string, string> = { "node:22": "node:22", "node:22-slim": "slim", "node:22-alpine": "alpine", [DISTROLESS]: "distroless" };

const APP = { kind: "app" as const, listens: 3000 };
const INSTALL: Instruction = { op: "RUN", cmd: "npm ci", size: 300, seconds: 30, files: { "/app/node_modules/.package-lock.json": "deps + devDeps" } };
const BUILD: Instruction = { op: "RUN", cmd: "npm run build", size: 2, seconds: 8, files: { "/app/dist/server.js": "size:2" } };

/** Everything in one stage: build tools ship with the app. */
export function single(base: string): Instruction[] {
  return [
    { op: "FROM", image: base },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
    INSTALL,
    { op: "COPY", src: ["."], dest: "." },
    BUILD,
    { op: "CMD", args: ["node", "dist/server.js"], program: APP },
  ];
}

/** Build in a full image, then copy only dist/ into a small runtime image. */
export function multi(final: string): Instruction[] {
  return [
    { op: "FROM", image: "node:22", as: "build" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
    INSTALL,
    { op: "COPY", src: ["."], dest: "." },
    BUILD,
    { op: "FROM", image: final },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", from: "build", src: ["/app/dist"], dest: "/app/dist" },
    // distroless has no shell and runs node as its entrypoint, so CMD is just the script.
    { op: "CMD", args: final === DISTROLESS ? ["/app/dist/server.js"] : ["node", "/app/dist/server.js"], program: APP },
  ];
}

const b = (tag: string, dockerfile: Instruction[], extra: Partial<Extract<DockerAction, { type: "build" }>> = {}): DockerAction => ({ type: "build", tag, dockerfile, context: PROJECT, ...extra });

export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [b("shop:single", single("node:22"))],
  [{ type: "run", image: "shop:single", name: "big", detach: true }, { type: "exec", container: "big", cmd: "ls /app" }],
  [b("shop:slim", multi("node:22-slim"))],
  [b("shop:alpine", multi("node:22-alpine"))],
  [b("shop:distroless", multi(DISTROLESS)), { type: "run", image: "shop:distroless", name: "tiny", detach: true }, { type: "exec", container: "tiny", cmd: "sh" }],
  [b("shop:build", multi(DISTROLESS), { target: "build" })],
  [],
  [],
];

/* --------------------------------------------------------- the sandbox */

/** The Dockerfile in your project folder. */
export const DF = "/home/ada/project/Dockerfile";

/** The Dockerfile as written: its instruction lines, and the base of each stage. */
export function writtenDockerfile(h: Host) {
  const ins = parseDockerfile(h.hostFiles[DF] ?? "").instructions;
  return { lines: ins.map(instructionText), bases: ins.flatMap((i) => (i.op === "FROM" ? [i.image] : [])) };
}

function metrics(h: Host, t: (x: L) => string, info: { sandbox: boolean }): Metric[] {
  const last = h.lastBuild;
  const img = last ? imageFor(h, last.tag) : undefined;
  const smallest = Object.entries(h.tags).filter(([k]) => k.startsWith("shop:")).map(([, id]) => imageSize(h.images[id]!));
  return [
    { label: t(l("Son image", "Last image")), value: last ? `${last.size} MB` : "—", tone: last ? (last.size < 200 ? "ok" : last.size > 600 ? "danger" : "warn") : "plain" },
    { label: "Layer", value: img ? img.layers.length : "—" },
    { label: t(l("Build süresi", "Build time")), value: last ? `${last.seconds} s` : "—" },
    ...(info.sandbox ? [] : [{ label: t(l("En küçük", "Smallest")), value: smallest.length ? `${Math.min(...smallest)} MB` : "—" }]),
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Multi-stage build: derleme bir stage'de, çalışan image başka bir stage'de", "Multi-stage build: compile in one stage, ship another"),
  view: (h, info) => {
    const last = h.lastBuild;
    // In the try-it step, show the Dockerfile as it stands until it is built that way.
    const pending = writtenDockerfile(h).lines;
    const stale = info.sandbox && (!last || last.steps.map((x) => x.text).join("|") !== pending.join("|"));
    return (
      <g>
        <g transform="scale(0.68)">
          <BuildStage
            steps={stale ? [] : (last?.steps ?? [])}
            seconds={last?.seconds ?? 0}
            size={last?.size ?? 0}
            tag={last?.tag ?? "shop"}
            labels={buildLabels(info.t)}
            pending={info.sandbox ? pending : undefined}
            play={info.last.some((e) => e.type === "buildStep")}
          />
        </g>
        {info.sandbox ? (
          <SandboxShape host={h} t={info.t} last={info.last} />
        ) : (
          <SizeBars host={h} title={info.t(l("Image boyutları", "Image sizes"))} last={info.last} />
        )}
      </g>
    );
  },
  metrics: (h, t, info) => metrics(h, t, info),
  // Free play: the single-stage Dockerfile, built once.
  sandbox: { start: () => project(SINGLE, true), scenarios },
});

function SandboxShape({ host, t, last }: { host: Host; t: (x: L) => string; last: import("../../engine/docker").DockerEvent[] }) {
  const bases = writtenDockerfile(host).bases.map((b) => SHORT[b] ?? b);
  return (
    <g>
      <g transform="translate(640 30)">
        <text x={0} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, fill: "var(--ink)" }}>
          Dockerfile
        </text>
        <text x={0} y={24} style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 700, fill: "var(--ink-2)" }}>
          {bases.length > 1 ? `${bases[0]} → ${bases[bases.length - 1]}` : `${t(l("tek stage", "one stage"))}: ${bases[0] ?? "—"}`}
        </text>
      </g>
      <SizeBars host={host} title={t(l("Image boyutu", "Image size"))} last={last} y={90} />
    </g>
  );
}
