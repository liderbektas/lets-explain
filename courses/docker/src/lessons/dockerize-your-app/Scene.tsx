import { l, type L } from "@lets-explain/core/i18n";
import { apply, imageFor, imageSize, instructionText, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import { BuildStage, type BuildLabels } from "../../iso/BuildStage";
import { HostStage } from "../../iso/HostStage";
import { labels } from "../run-flags/Scene";
import { makeDockerScene } from "../shared/DockerScene";
import { scenarios, SHIPPED } from "./scenarios";
import { buildWith, contextOf, freshHost, IGNORE, NAIVE, PROJECT, SMART, versionOf } from "./project";
import { ProjectPanel } from "./ProjectPanel";

export const SLUG = "dockerize-your-app";

/** A step's action, or one built from the state just before it (builds read the current folder). */
type Spec = DockerAction | ((h: Host) => DockerAction);

const edit = (n: number): DockerAction => ({ type: "editHost", path: `${PROJECT}/index.html`, content: `Merhaba v${n}` });
const runShop = (ports?: string[]): DockerAction => ({ type: "run", image: "shop", detach: true, name: "shop", ...(ports ? { ports } : {}) });
const curl: DockerAction = { type: "curl", port: 3000 };

const specs: Spec[][] = [
  [],
  [{ type: "pull", ref: "node:22" }, { type: "pull", ref: "node:22-slim" }],
  [(h) => buildWith(h, NAIVE, "shop:fat", null)],
  [(h) => buildWith(h, SMART, "shop")],
  [edit(2), (h) => buildWith(h, SMART, "shop")],
  [runShop(), { type: "exec", container: "shop", cmd: "whoami" }],
  [curl],
  [{ type: "rm", container: "shop", force: true }, runShop(["3000:3000"]), curl],
  [],
  [],
];

/** Resolves the specs against the running story, so every build sees the folder as it is then. */
function resolve(start: Host, list: Spec[][]): DockerAction[][] {
  let h = start;
  return list.map((step) =>
    step.map((spec) => {
      const a = typeof spec === "function" ? spec(h) : spec;
      h = apply(h, a).state;
      return a;
    }),
  );
}

export const START: Host = freshHost();
export const steps: DockerAction[][] = resolve(START, specs);

/** Which Dockerfile each build step shows before it runs. */
const PENDING: Record<number, Instruction[]> = { 2: NAIVE, 3: SMART, 4: SMART };

const buildLabels = (t: (x: L) => string): BuildLabels => ({
  dockerfile: "Dockerfile",
  layers: t(l("Image'ın katmanları", "The image's layers")),
  cached: "CACHED",
  ran: t(l("çalıştı", "ran")),
  noLayer: t(l("katman yok", "no layer")),
  total: t(l("süre", "time")),
  waiting: t(l("Henüz build yok", "Nothing built yet")),
});

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Kendi projeni adım adım bir image'a ve çalışan bir container'a çevirmek", "Turning your own project into an image and a running container, step by step"),
  view: (h, info) => {
    const t = info.t;
    if (info.last.some((e) => e.type === "buildStep") && h.lastBuild) {
      const b = h.lastBuild;
      return <BuildStage steps={b.steps} seconds={b.seconds} size={b.size} tag={b.tag} labels={buildLabels(t)} play />;
    }
    if (!info.sandbox && info.step === 0) {
      return <ProjectPanel files={contextOf(h)} ignore={[]} title={t(l("Proje klasörün", "Your project folder"))} ignoredLabel={t(l("dışarıda", "left out"))} sentLabel={t(l("build'e gider", "sent to build"))} />;
    }
    if (!info.sandbox && info.step === 3 && info.last.length === 0) {
      return <ProjectPanel files={contextOf(h)} ignore={IGNORE} title={t(l(".dockerignore ile", "With .dockerignore"))} ignoredLabel={t(l("dışarıda", "left out"))} sentLabel={t(l("build'e gider", "sent to build"))} />;
    }
    const pending = !info.sandbox ? PENDING[info.step] : undefined;
    if (pending && !info.last.some((e) => e.type === "built")) {
      return <BuildStage steps={[]} seconds={0} size={0} tag="shop" labels={buildLabels(t)} pending={pending.map(instructionText)} />;
    }
    return <HostStage host={h} labels={labels(t)} highlight={info.fresh} last={info.last} />;
  },
  metrics: (h, t) => {
    const img = imageFor(h, "shop");
    const running = Object.values(h.containers).filter((c) => c.state === "running").length;
    return [
      { label: t(l("shop image", "shop image")), value: img ? `${imageSize(img)} MB` : "—" },
      { label: t(l("Son build", "Last build")), value: h.lastBuild ? `${h.lastBuild.seconds}s` : "—", tone: h.lastBuild && h.lastBuild.seconds >= 30 ? "warn" : "plain" },
      { label: t(l("Çalışan", "Running")), value: running, tone: running ? "ok" : "plain" },
      { label: t(l("Koddaki sürüm", "Code version")), value: `v${versionOf(h)}` },
    ];
  },
  // Free play starts from the shipped project; each scenario brings its own state.
  sandbox: { start: () => SHIPPED, scenarios },
});
