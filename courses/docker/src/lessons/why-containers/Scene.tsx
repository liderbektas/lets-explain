import { l } from "@lets-explain/core/i18n";
import { createHost, type DockerAction, type Host } from "../../engine/docker";
import { DockStage } from "../../iso/DockStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { scenarios, MACHINE } from "./scenarios";
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

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Container'lar neden var: sanal makinelerle karşılaştırma ve bir makinede birkaç container", "Why containers exist: compared with virtual machines, and a few containers on one machine"),
  view: (h, info) => {
    const mode = info.sandbox ? undefined : MODES[info.step];
    return mode ? <WhyPanel mode={mode} t={info.t} /> : <DockStage host={h} labels={labels(info.t)} t={info.t} highlight={info.fresh} last={info.last} />;
  },
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: t(l("Çalışan container", "Running containers")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("İndirilen image", "Images pulled")), value: Object.keys(h.images).length },
    ];
  },
  sandbox: { start: () => MACHINE, scenarios },
});
