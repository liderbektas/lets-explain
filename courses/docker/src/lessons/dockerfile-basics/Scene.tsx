import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { createHost, imageFor, type DockerAction, type Files, type Host, type Instruction } from "../../engine/docker";
import { BuildStage, type BuildLabels } from "../../iso/BuildStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { missions } from "./missions";

export const SLUG = "dockerfile-basics";
export const TAG = "my-app";

/** A small Node project, as it sits in your folder. */
export const PROJECT: Files = {
  "package.json": '{"name":"shop","dependencies":{"express":"^4"}}',
  "package-lock.json": "lock-1",
  "server.js": "app.listen(3000)",
};

export const buildLabels = (t: (x: L) => string): BuildLabels => ({
  dockerfile: "Dockerfile",
  layers: t(l("Layer'lar", "Layers")),
  cached: "CACHED",
  ran: t(l("çalıştı", "ran")),
  noLayer: t(l("layer yok", "no layer")),
  total: t(l("toplam", "total")),
  waiting: t(l("Henüz build yok", "Not built yet")),
});

/** The instructions this lesson works with, by key. */
export const INS: Record<string, Instruction> = {
  from: { op: "FROM", image: "node:22-slim" },
  workdir: { op: "WORKDIR", path: "/app" },
  copyPkg: { op: "COPY", src: ["package.json", "package-lock.json"], dest: "./" },
  npm: { op: "RUN", cmd: "npm ci", size: 60, seconds: 20, files: { "/app/node_modules/.package-lock.json": "deps" } },
  copyAll: { op: "COPY", src: ["."], dest: "." },
  env: { op: "ENV", key: "NODE_ENV", value: "production" },
  expose: { op: "EXPOSE", port: 3000 },
  cmd: { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
};

const build = (keys: string[], extra: Partial<Extract<DockerAction, { type: "build" }>> = {}): DockerAction => ({
  type: "build",
  tag: "shop",
  context: PROJECT,
  dockerfile: keys.map((k) => INS[k]!),
  ...extra,
});

/** A version stamp read from a build argument, to show what ARG does to the cache. */
const withArg: Instruction[] = [
  INS.from!,
  { op: "ARG", key: "APP_VERSION", value: "1" },
  INS.workdir!,
  { op: "RUN", cmd: "echo $APP_VERSION > version.txt", size: 1, seconds: 1, files: { "/app/version.txt": "v" } },
  INS.copyPkg!,
  INS.npm!,
  INS.copyAll!,
  INS.cmd!,
];

export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [build(["from"])],
  [build(["from", "workdir", "copyPkg"])],
  [build(["from", "workdir", "copyPkg", "npm"])],
  [build(["from", "workdir", "copyPkg", "npm", "copyAll"])],
  [build(["from", "workdir", "copyPkg", "npm", "copyAll", "env", "expose", "cmd"])],
  [
    { type: "build", tag: "shop", context: PROJECT, dockerfile: withArg },
    { type: "build", tag: "shop", context: PROJECT, dockerfile: withArg, args: { APP_VERSION: "2" } },
  ],
  [],
  [build(["from", "workdir", "copyPkg", "npm", "copyAll", "env", "expose", "cmd"])],
  [],
];

/* --------------------------------------------------------- the sandbox */

/** The Dockerfile you are writing lives in your project folder, one instruction key per line. */
export const DF = "/home/ada/project/Dockerfile";
export const ORDER = ["from", "workdir", "copyPkg", "npm", "copyAll", "expose", "cmd"];
const LABELS: Record<string, string> = {
  from: "FROM node:22-slim",
  workdir: "WORKDIR /app",
  copyPkg: "COPY package*.json ./",
  npm: "RUN npm ci",
  copyAll: "COPY . .",
  expose: "EXPOSE 3000",
  cmd: 'CMD ["node","server.js"]',
};

export const linesOf = (h: Host): string[] => (h.hostFiles[DF] ? h.hostFiles[DF]!.split("\n").filter(Boolean) : []);

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const lines = linesOf(h);
  const add = (k: string) => ({
    label: `+ ${LABELS[k]}`,
    action: { type: "editHost", path: DF, content: [...lines, k].join("\n") } as DockerAction,
    tone: "producer" as const,
    disabled: lines.includes(k) || (k !== "from" && !lines.includes("from")),
  });
  return [
    { label: tr ? "Temel" : "Base", buttons: [add("from"), add("workdir")] },
    { label: tr ? "Dosyalar" : "Files", buttons: [add("copyPkg"), add("npm"), add("copyAll")] },
    { label: tr ? "Ayar" : "Settings", buttons: [add("expose"), add("cmd")] },
    {
      label: "docker",
      buttons: [
        {
          label: `build -t ${TAG} .`,
          action: { type: "build", tag: TAG, context: PROJECT, dockerfile: lines.map((k) => INS[k]!) },
          tone: "go",
          disabled: !lines.includes("from"),
        },
      ],
    },
  ];
}

function metrics(h: Host, t: (x: L) => string): Metric[] {
  const b = h.lastBuild;
  const img = b ? imageFor(h, b.tag) : undefined;
  return [
    { label: t(l("Image boyutu", "Image size")), value: b ? `${b.size} MB` : "—" },
    { label: t(l("Layer", "Layers")), value: img ? img.layers.length : "—" },
    { label: t(l("Build süresi", "Build time")), value: b ? `${b.seconds} s` : "—", tone: b && b.seconds > 10 ? "warn" : "plain" },
    { label: t(l("Cache'ten", "From cache")), value: b ? `${b.cached}/${b.steps.length}` : "—", tone: b && b.cached === b.steps.length ? "ok" : "plain" },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir Dockerfile satır satır build ediliyor: her satırın sonucu ve image'ın layer'ları", "A Dockerfile built line by line: what each line did and the image's layers"),
  view: (h, info) => {
    const b = h.lastBuild;
    const pending = info.sandbox ? linesOf(h).map((k) => LABELS[k]!) : undefined;
    // In the try-it step, show the Dockerfile being written until it is built as it stands.
    const fresh = info.sandbox && b && linesOf(h).length !== b.steps.length;
    return (
      // BuildStage's layer labels run past the right edge at full size, so draw it a little smaller.
      <g transform="translate(25 20) scale(0.9)">
      <BuildStage
        steps={fresh || !b ? [] : b.steps}
        seconds={b?.seconds ?? 0}
        size={b?.size ?? 0}
        tag={b?.tag ?? TAG}
        labels={buildLabels(info.t)}
        pending={pending}
        play={info.last.some((e) => e.type === "buildStep")}
      />
      </g>
    );
  },
  metrics,
  sandbox: { start: () => createHost({ pulled: ["node:22-slim"] }), rows, missions },
});

