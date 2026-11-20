import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { createHost, imageFor, type DockerAction, type Files, type Host, type Instruction } from "../../engine/docker";
import { BuildStage } from "../../iso/BuildStage";
import { buildLabels } from "../dockerfile-basics/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { builtWith, NAIVE as NAIVE_DOCKERFILE, scenarios } from "./scenarios";

export const SLUG = "layers-and-cache";

/** The project: a little code, a lock file, a big node_modules from your own `npm install`, and .git. */
export const APP: Files = {
  "package.json": '{"dependencies":{"express":"^4"}}',
  "package-lock.json": "lock-1",
  "server.js": "v1",
  "node_modules/express/index.js": "size:200",
  ".git/HEAD": "commit-1",
};
export const IGNORE = ["node_modules", ".git"];

const FROM: Instruction = { op: "FROM", image: "node:22-slim" };
const WORKDIR: Instruction = { op: "WORKDIR", path: "/app" };
const NPM: Instruction = { op: "RUN", cmd: "npm ci", size: 80, seconds: 30, files: { "/app/node_modules/.package-lock.json": "deps" } };
const CMD: Instruction = { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } };

/** Copies everything, then installs: any code change re-runs npm ci. */
export const NAIVE: Instruction[] = [FROM, WORKDIR, { op: "COPY", src: ["."], dest: "." }, NPM, CMD];
/** Copies the dependency list first, installs, then copies the code. */
export const SMART: Instruction[] = [FROM, WORKDIR, { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" }, NPM, { op: "COPY", src: ["."], dest: "." }, CMD];

const b = (dockerfile: Instruction[], context: Files, ignore: string[] | undefined = IGNORE): DockerAction => ({ type: "build", tag: "shop", dockerfile, context, ignore });
const v = (patch: Files): Files => ({ ...APP, ...patch });

export const START: Host = createHost({ pulled: ["node:22-slim"] });

export const steps: DockerAction[][] = [
  [b(NAIVE, APP)],
  [b(NAIVE, APP)],
  [b(NAIVE, v({ "server.js": "v2" }))],
  [b(SMART, v({ "server.js": "v2" })), b(SMART, v({ "server.js": "v3" }))],
  [b(SMART, v({ "server.js": "v3", "package.json": '{"dependencies":{"express":"^4","zod":"^3"}}', "package-lock.json": "lock-2" }))],
  [b(SMART, v({ "server.js": "v3", "package.json": '{"dependencies":{"express":"^4","zod":"^3"}}', "package-lock.json": "lock-2" }), [])],
  [
    b(SMART, v({ "server.js": "v3", "package.json": '{"dependencies":{"express":"^4","zod":"^3"}}', "package-lock.json": "lock-2" })),
    b(SMART, v({ "server.js": "v3", "package.json": '{"dependencies":{"express":"^4","zod":"^3"}}', "package-lock.json": "lock-2", ".git/HEAD": "commit-2" })),
  ],
  [],
  [],
];

function metrics(h: Host, t: (x: L) => string): Metric[] {
  const last = h.lastBuild;
  const img = last ? imageFor(h, last.tag) : undefined;
  return [
    { label: t(l("Build süresi", "Build time")), value: last ? `${last.seconds} s` : "—", tone: last ? (last.seconds === 0 ? "ok" : last.seconds >= 10 ? "danger" : "plain") : "plain" },
    { label: t(l("Cache'ten", "From cache")), value: last ? `${last.cached}/${last.steps.length}` : "—" },
    { label: t(l("Image boyutu", "Image size")), value: last ? `${last.size} MB` : "—", tone: last && last.size > 400 ? "warn" : "plain" },
    { label: "Layer", value: img ? img.layers.length : "—" },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Build cache: hangi satır cache'ten geldi, hangisi yeniden çalıştı", "The build cache: which lines came from cache and which ran again"),
  view: (h, info) => {
    const last = h.lastBuild;
    // BuildStage's layer labels run past the right edge at full size, so draw it a little smaller.
    return (
      <g transform="translate(25 20) scale(0.9)">
        <BuildStage steps={last?.steps ?? []} seconds={last?.seconds ?? 0} size={last?.size ?? 0} tag={last?.tag ?? "shop"} labels={buildLabels(info.t)} play={info.last.some((e) => e.type === "buildStep")} />
      </g>
    );
  },
  metrics,
  // Free play: the project with the copy-everything-first Dockerfile, built once.
  sandbox: { start: () => builtWith(NAIVE_DOCKERFILE), scenarios },
});
