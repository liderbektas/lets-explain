import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { missions } from "./missions";
import { WhyPanel, type WhyMode } from "./WhyPanel";

export const SLUG = "why-containers";
export const NOTE = "/tmp/note.txt";

const run = (name: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name });

/** A machine with Docker installed and nothing else. */
export const START: Host = createHost();

export const steps: DockerAction[][] = [
  [],
  [],
  [],
  [],
  [run("web-1"), run("web-2"), run("web-3")],
  [{ type: "write", container: "web-1", path: NOTE, content: "web-1'in notu" }, { type: "exec", container: "web-2", cmd: `cat ${NOTE}` }],
  [{ type: "rm", container: "web-1", force: true }, run("web-1"), { type: "exec", container: "web-1", cmd: `cat ${NOTE}` }],
  [],
  [],
  [],
];

/** None of the lesson steps fail on purpose. */
export const EXPECTED_ERRORS: Record<number, number> = {};

/** Which comparison drawing each diagram step shows; other steps draw the machine. */
const MODES: Record<number, WhyMode> = { 0: "mismatch", 1: "package", 2: "vm", 3: "both", 7: "desktop", 8: "both" };

const sandboxStart = (): Host => simulate([{ type: "pull", ref: "nginx:1.27" }], createHost()).states[1]!;

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const box = (n: string) => findContainer(h, n);
  const up = (n: string) => box(n)?.state === "running";
  return [
    {
      label: tr ? "Başlat" : "Start",
      buttons: ["box1", "box2", "box3"].map((n) => ({ label: `run --name ${n}`, action: run(n), tone: "producer" as const, disabled: Boolean(box(n)) })),
    },
    {
      label: "box1",
      buttons: [
        { label: tr ? "not yaz" : "write note", action: { type: "write", container: "box1", path: NOTE, content: "box1'in notu" }, disabled: !up("box1") },
        { label: `cat ${NOTE}`, action: { type: "exec", container: "box1", cmd: `cat ${NOTE}` }, tone: "go", disabled: !up("box1") },
        { label: "rm -f box1", action: { type: "rm", container: "box1", force: true }, tone: "danger", disabled: !box("box1") },
      ],
    },
    {
      label: "box2",
      buttons: [{ label: `cat ${NOTE}`, action: { type: "exec", container: "box2", cmd: `cat ${NOTE}` }, tone: "go", disabled: !up("box2") }],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Container'lar neden var: sanal makinelerle karşılaştırma ve bir makinede birkaç container", "Why containers exist: compared with virtual machines, and a few containers on one machine"),
  view: (h, info) => {
    const mode = info.sandbox ? undefined : MODES[info.step];
    return mode ? <WhyPanel mode={mode} t={info.t} /> : <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} />;
  },
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: t(l("Çalışan container", "Running containers")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("İndirilen image", "Images pulled")), value: Object.keys(h.images).length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
