import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { AreasStage, type AreaFlow, type AreasLabels } from "../../iso/AreasStage";
import { MetroStage } from "../../iso/MetroStage";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { scenarios } from "./scenarios";

export const SLUG = "ignore-and-tags";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

export const IGNORE = "*.log\nnode_modules/\n.env";

/**
 * A small project that already made a classic mistake: `debug.log` was committed. The folder
 * also holds things that should never be committed: a log, a dependency folder and secrets.
 */
export const START: Repo = (() => {
  const r = simulate(
    [
      write("app.js", "v1"),
      write("debug.log", "log 1"),
      add("app.js", "debug.log"),
      commit("Başlangıç"),
      write("app.log", "hata satırı"),
      write("node_modules/lib.js", "kütüphane"),
      write(".env", "API_KEY=gizli"),
    ],
    createRepo({ author: ADA }),
  );
  return r.states[r.states.length - 1]!;
})();

export const steps: GitAction[][] = [
  [],
  [write(".gitignore", IGNORE)],
  [{ type: "add", paths: "." }, commit(".gitignore eklendi")],
  [write("debug.log", "log 2")],
  [{ type: "rmCached", path: "debug.log" }, commit("debug.log artık takip edilmiyor")],
  [],
  [{ type: "tag", name: "v1.0" }],
  [write("app.js", "v2"), add("app.js"), commit("Yeni özellik")],
  [],
  [],
];

/** Steps that show the commit graph instead of the three areas. */
const GRAPH_STEPS = new Set([6, 7, 8]);

const labels = (t: (x: L) => string): AreasLabels => ({
  work: t(l("Klasör", "Folder")),
  index: t(l("Staging", "Staging")),
  repo: t(l("Repo", "Repo")),
  workSub: "working tree",
  indexSub: "index",
  repoSub: ".git (commit'ler)",
  empty: t(l("boş", "empty")),
  untracked: t(l("yeni", "new")),
  modified: t(l("değişti", "changed")),
  deleted: t(l("silindi", "deleted")),
  staged: t(l("hazır", "staged")),
  ignored: t(l("yok sayılıyor", "ignored")),
  noCommits: t(l("Henüz commit yok", "No commits yet")),
});

function flowOf(last: { type: string }[]): AreaFlow {
  const e = last[last.length - 1];
  if (!e) return null;
  if (e.type === "staged") return "add";
  if (e.type === "committed") return "commit";
  if (e.type === "untracked") return "unstage";
  return null;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l(".gitignore ile yok sayılan dosyalar ve sürüm tag'leri", "Files ignored with .gitignore, and release tags"),
  view: (repo, info) =>
    GRAPH_STEPS.has(info.step) && !info.sandbox ? (
      <MetroStage repo={repo} highlight={info.fresh} lanes={1} time={timeWords(info.t)} t={info.t} />
    ) : (
      // The repo's map shows tags as plaques on its stations, so the try-it step needs no graph.
      <AreasStage repo={repo} labels={labels(info.t)} flow={flowOf(info.last)} last={info.last} />
    ),
  metrics: (repo, t) => {
    const st = status(repo);
    const tags = Object.keys(repo.tags);
    return [
      { label: t(l("Yok sayılan", "Ignored")), value: st.ignored.length, tone: st.ignored.length ? "ok" : "plain" },
      { label: t(l("Takipsiz", "Untracked")), value: st.untracked.length, tone: st.untracked.length ? "warn" : "plain" },
      { label: t(l("Staging'de", "Staged")), value: st.staged.length, tone: st.staged.length ? "ok" : "plain" },
      { label: "Tag", value: tags.length ? tags.join(", ") : "—" },
    ];
  },
  // Free play starts from the lesson's messy folder; each scenario brings its own project.
  sandbox: { start: () => START, scenarios },
});
