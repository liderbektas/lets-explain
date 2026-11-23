import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type Container, type DockerAction, type DockerEvent, type Host, type Instruction } from "../../engine/docker";
import { DockStage } from "../../iso/DockStage";
import { API_BUILD, labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { scenarios, MACHINE } from "./scenarios";
import { TerminalPanel, type TermLine } from "./TerminalPanel";

export const SLUG = "debugging";

const uploader = (tag: string, chown: boolean): DockerAction => ({
  type: "build",
  tag,
  context: { "server.js": "upload" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: ".", ...(chown ? { chown: "node:node" } : {}) },
    { op: "USER", name: "node" },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000, writes: "/app/uploads/photo.png" } },
  ] satisfies Instruction[],
});

const HUNGRY: DockerAction = {
  type: "build",
  tag: "acme/report:1.0",
  context: { "report.js": "big" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "COPY", src: ["report.js"], dest: "/app/" },
    { op: "CMD", args: ["node", "/app/report.js"], program: { kind: "app", listens: 3000, memory: 300 } },
  ],
};

/** The machine: the images are built, nothing runs yet. */
export const START: Host = simulate([API_BUILD, uploader("acme/uploader:1.0", false), uploader("acme/uploader:1.1", true), HUNGRY, { type: "pull", ref: "nginx:1.27" }], createHost()).states[5]!;

const api = (env = false): DockerAction => ({ type: "run", image: "acme/api:1.0", detach: true, name: "api", ...(env ? { env: { DATABASE_URL: "postgres://db/shop" } } : {}) });
const nginx = (name: string, port?: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name, ...(port ? { ports: [port] } : {}) });

export const steps: DockerAction[][] = [
  [api()],
  [],
  [{ type: "run", image: "nginx:1.27", detach: true, name: "typo", cmd: ["ngnix"] }],
  [{ type: "run", image: "acme/report:1.0", detach: true, name: "report", memory: 128 }],
  [nginx("web"), { type: "exec", container: "web", cmd: "whoami" }],
  [nginx("site", "8080:80"), nginx("site2", "8080:80")],
  [{ type: "rm", container: "site2", force: true }, nginx("site2", "8081:80"), { type: "curl", port: 8081 }],
  [{ type: "run", image: "acme/uploader:1.0", detach: true, name: "uploader" }],
  [{ type: "rm", container: "uploader", force: true }, { type: "run", image: "acme/uploader:1.1", detach: true, name: "uploader" }],
  [],
];

/** Steps where a Docker error is the point of the step. */
export const EXPECTED_ERRORS: Record<number, number> = { 5: 1 };

/** What an exit code usually means, short enough for a badge. */
export function meaning(code: number | null, oom: boolean, lang: "tr" | "en"): string {
  const tr = lang === "tr";
  if (code === null) return tr ? "çalışıyor" : "running";
  if (oom || code === 137) return tr ? "137: SIGKILL, çoğu zaman bellek (OOM)" : "137: SIGKILL, usually memory (OOM)";
  const map: Record<number, [string, string]> = {
    0: ["0: işini bitirdi", "0: finished its job"],
    1: ["1: uygulama hatası, loglara bak", "1: app error, read the logs"],
    126: ["126: komut çalıştırılamadı", "126: command could not run"],
    127: ["127: komut bulunamadı", "127: command not found"],
    143: ["143: SIGTERM, durdurma isteği", "143: SIGTERM, asked to stop"],
  };
  const m = map[code];
  return m ? m[tr ? 0 : 1] : `${code}`;
}

/** The container the last action was about, or the newest one. */
function focusOf(h: Host, last: DockerEvent[], fallback?: string): Container | undefined {
  for (const e of last) {
    if ("name" in e && typeof e.name === "string") {
      const c = findContainer(h, e.name);
      if (c) return c;
    }
  }
  return (fallback ? findContainer(h, fallback) : undefined) ?? Object.values(h.containers).at(-1);
}

const statusText = (c: Container) => (c.state === "running" ? "Up" : c.state === "created" ? "Created" : `Exited (${c.exitCode})`);

export function terminalLines(h: Host, last: DockerEvent[], fallback?: string): { lines: TermLine[]; focus?: Container } {
  const c = focusOf(h, last, fallback);
  if (!c) return { lines: [{ cmd: "docker ps -a", out: "(boş / empty)" }] };
  const lines: TermLine[] = [{ cmd: `docker ps -a --filter name=${c.name}`, out: `${c.name}   ${statusText(c)}`, tone: c.state === "exited" && c.exitCode !== 0 ? "bad" : c.state === "running" ? "ok" : "plain" }];
  const exec = last.find((e): e is Extract<DockerEvent, { type: "execOutput" }> => e.type === "execOutput");
  const error = last.find((e): e is Extract<DockerEvent, { type: "error" }> => e.type === "error");
  if (exec) lines.push({ cmd: `docker exec ${exec.name} ${exec.cmd}`, out: exec.output.join(" ") || "(no output)", tone: exec.code === 0 ? "ok" : "bad" });
  else lines.push({ cmd: `docker logs ${c.name}`, out: c.logs.at(-1) ?? "(no logs)", tone: c.state === "exited" && c.exitCode !== 0 ? "bad" : "plain" });
  if (error) lines.push({ cmd: "docker run …", out: /Bind for [^:]*:\d+ failed: port is already allocated/.exec(error.message)?.[0] ?? error.message.replace(/^docker: Error response from daemon: /, ""), tone: "bad" });
  else lines.push({ cmd: `docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' ${c.name}`, out: `${c.exitCode ?? 0} ${c.oomKilled}`, tone: c.oomKilled ? "bad" : "plain" });
  return { lines, focus: c };
}

const recent = (h: Host, n = 3) => Object.values(h.containers).map((c) => c.name).slice(-n);

  simulate([{ type: "run", image: "acme/api:1.0", detach: true, name: "api" }, { type: "run", image: "acme/uploader:1.0", detach: true, name: "uploader" }, nginx("site", "8080:80")], START).states[3]!;

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Kapanan, çöken ve çakışan container'lar, altta terminal çıktısı", "Containers that stop, crash and clash, with terminal output underneath"),
  view: (h, info) => {
    const { lines, focus } = terminalLines(h, info.last);
    const names = recent(h);
    return (
      <g>
        <DockStage host={h} labels={labels(info.t)} t={info.t} highlight={info.fresh} last={info.last} hideImages containers={names} panel />
        <TerminalPanel
          title={info.t(l("Terminal", "Terminal"))}
          lines={lines}
          badge={
            focus && focus.state === "created"
              ? { text: info.t(l("Created: hiç başlamadı", "Created: never started")), tone: "bad" }
              : focus && focus.state === "exited"
                ? { text: meaning(focus.exitCode, focus.oomKilled, info.lang), tone: focus.exitCode === 0 ? "plain" : "bad" }
                : undefined
          }
        />
      </g>
    );
  },
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    const bad = all.filter((c) => c.state === "exited" && c.exitCode !== 0).length;
    return [
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Hatayla kapanan", "Exited with error")), value: bad, tone: bad ? "danger" : "plain" },
      { label: t(l("Başlayamayan", "Never started")), value: all.filter((c) => c.state === "created").length, tone: all.some((c) => c.state === "created") ? "warn" : "plain" },
    ];
  },
  sandbox: { start: () => MACHINE, scenarios },
});
