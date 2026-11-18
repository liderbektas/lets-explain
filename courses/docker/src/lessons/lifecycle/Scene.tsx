import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { LifecycleStrip, phaseOf } from "./LifecycleStrip";
import { missions } from "./missions";

export const SLUG = "lifecycle";
export const NOTE = "/notes.txt";

/** The lesson's machine: nginx is pulled, nothing exists yet. */
export const START: Host = simulate([{ type: "pull", ref: "nginx:1.27" }, { type: "pull", ref: "hello-world" }], createHost()).states[2]!;

export const create: DockerAction = { type: "create", image: "nginx:1.27", name: "web" };
export const run: DockerAction = { type: "run", image: "nginx:1.27", name: "web", detach: true };
export const start: DockerAction = { type: "start", container: "web" };
export const stop: DockerAction = { type: "stop", container: "web" };
export const kill: DockerAction = { type: "kill", container: "web" };
export const rm: DockerAction = { type: "rm", container: "web" };
export const rmForce: DockerAction = { type: "rm", container: "web", force: true };
export const writeNote: DockerAction = { type: "write", container: "web", path: NOTE, content: "alışveriş listesi" };
export const readNote: DockerAction = { type: "exec", container: "web", cmd: `cat ${NOTE}` };

export const steps: DockerAction[][] = [
  [create],
  [start],
  [writeNote, stop],
  [start, readNote],
  [rm, stop, rm],
  [run, readNote],
  [{ type: "run", image: "hello-world", name: "hello" }],
  [kill],
  [],
  [],
];

/** Steps where a Docker error is the point of the step. */
export const EXPECTED_ERRORS: Record<number, number> = { 4: 1 };

/** Which container the strip follows on each step. */
const tracked = (step: number) => (step === 6 ? "hello" : "web");

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const c = findContainer(h, "web");
  const s = c?.state;
  return [
    {
      label: tr ? "Oluştur" : "Create",
      buttons: [
        { label: "docker create --name web nginx", action: create, tone: "producer", disabled: Boolean(c) },
        { label: "docker run -d --name web nginx", action: run, tone: "producer", disabled: Boolean(c) },
      ],
    },
    {
      label: tr ? "Durum" : "State",
      buttons: [
        { label: "docker start web", action: start, tone: "go", disabled: s !== "created" && s !== "exited" },
        { label: "docker stop web", action: stop, disabled: s !== "running" },
        { label: "docker kill web", action: kill, tone: "danger", disabled: s !== "running" },
      ],
    },
    {
      label: tr ? "Sil" : "Remove",
      buttons: [
        { label: "docker rm web", action: rm, disabled: !c || s === "running" },
        { label: "docker rm -f web", action: rmForce, tone: "danger", disabled: s !== "running" },
      ],
    },
    {
      label: tr ? "İçeride" : "Inside",
      buttons: [
        { label: tr ? "not yaz" : "write a note", action: writeNote, disabled: s !== "running" },
        { label: `cat ${NOTE}`, action: readNote, disabled: s !== "running" },
      ],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir container'ın dört hali: oluşturuldu, çalışıyor, kapandı, silindi", "A container's four states: created, running, exited, removed"),
  view: (h, info) => {
    const name = info.sandbox ? "web" : tracked(info.step);
    const c = findContainer(h, name);
    const gone = info.last.some((e) => e.type === "removed" && e.name === name);
    return (
      <g>
        <HostStage host={h} labels={labels(info.t)} hideImages highlight={info.fresh} last={info.last} />
        <LifecycleStrip
          phase={phaseOf(c, gone)}
          names={{
            created: "created",
            running: "running",
            exited: "exited",
            removed: info.t(l("silindi", "removed")),
          }}
          arrows={{ start: "start", stop: "stop / kill", rm: "rm" }}
        />
      </g>
    );
  },
  metrics: (h, t, info) => {
    const c = findContainer(h, info.sandbox ? "web" : tracked(info.step));
    const all = Object.values(h.containers);
    return [
      { label: t(l("Durum", "State")), value: c ? c.state : "—", tone: c?.state === "running" ? "ok" : "plain" },
      { label: "Exit code", value: c?.exitCode ?? "—", tone: c?.exitCode ? "danger" : "plain" },
      { label: "docker ps", value: all.filter((x) => x.state === "running").length },
      { label: "docker ps -a", value: all.length },
    ];
  },
  sandbox: { start: () => START, rows, missions },
});
