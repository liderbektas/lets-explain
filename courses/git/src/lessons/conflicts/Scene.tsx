import { l, type L } from "@lets-explain/core/i18n";
import type { GitAction } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene } from "../shared/GitScene";
import { FilePanel, type FilePanelLabels } from "./FilePanel";
import { LOG, START, TITLE } from "./repo";
import { scenarios } from "./scenarios";

export const SLUG = "conflicts";

const add = (...paths: string[]): GitAction => ({ type: "add", paths });

// The project lives in repo.ts so the scenarios can build on it without importing the scene.
export { LOG, START, TITLE } from "./repo";

export const steps: GitAction[][] = [
  [],
  [{ type: "merge", target: "feature" }],
  [],
  [{ type: "abort" }],
  [{ type: "merge", target: "feature" }, { type: "resolve", path: TITLE, take: "theirs" }, add(TITLE)],
  [{ type: "resolve", path: LOG, take: "both" }, add(LOG)],
  [{ type: "commit" }],
  [],
  [],
];

export const panelLabels = (t: (x: L) => string): FilePanelLabels => ({
  title: t(l("Klasördeki dosyalar", "Files in the folder")),
  conflict: "conflict",
  needsAdd: t(l("add bekliyor", "needs add")),
  changed: t(l("değişti", "changed")),
  clean: t(l("temiz", "clean")),
  ours: t(l("bizim (HEAD)", "ours (HEAD)")),
  theirs: t(l("onların", "theirs")),
  missing: t(l("(dosya yok)", "(no file)")),
});

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve conflict'li dosyalar", "The commit graph and the conflicted files"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} box={{ x: 0, y: 0, w: 500, h: 470 }} highlight={info.fresh} showGhosts={false} />
      <FilePanel repo={repo} paths={[TITLE, LOG]} labels={panelLabels(info.t)} box={{ x: 506, y: 22, w: 336, h: 430 }} />
    </g>
  ),
  metrics: (repo, t) => {
    const open = repo.op?.conflicts.length ?? 0;
    return [
      { label: t(l("Conflict'li dosya", "Conflicted files")), value: open, tone: open ? "danger" : "plain" },
      { label: t(l("Merge sürüyor", "Merge in progress")), value: repo.op?.kind === "merge" ? t(l("evet", "yes")) : t(l("hayır", "no")), tone: repo.op ? "warn" : "plain" },
      { label: t(l("Commit", "Commits")), value: Object.keys(repo.commits).length },
    ];
  },
  // Free play starts before the merge; each scenario brings its own state.
  sandbox: { start: () => START, scenarios },
});
