import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, firstParents, headId, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { AreasStage, type AreaFlow, type AreasLabels } from "../../iso/AreasStage";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

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

/**
 * Tags drawn next to the repo tray's short history, so the try-it step shows them without
 * switching to the graph. Positions follow AreasStage's default 860×470 layout.
 */
function TagOverlay({ repo }: { repo: Repo }) {
  const gap = 84;
  const trayW = (860 - 24 - gap * 2) / 3;
  const x = 12 + 2 * (trayW + gap) + trayW - 12;
  const history = firstParents(repo, headId(repo)).slice(0, 3);
  return (
    <g>
      {history.map((id, i) => {
        const names = Object.entries(repo.tags).filter(([, at]) => at === id).map(([n]) => n);
        if (!names.length) return null;
        const text = names.join(", ");
        const w = Math.round(text.length * 7 + 18);
        const y = 20 + 430 - 86 + 8 + i * 24;
        return (
          <g key={id} transform={`translate(${x - w} ${y - 9})`}>
            <rect width={w} height={18} rx={9} style={{ fill: "var(--sun)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={w / 2} y={13} textAnchor="middle" className="file-badge">
              {text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** How many times a file has been edited in the sandbox so far. */
const edits = (history: GitAction[], path: string) => history.filter((a) => a.type === "write" && a.path === path).length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const appChanged = st.unstaged.some((c) => c.path === "app.js");
  return [
    {
      label: ".gitignore",
      buttons: [{ label: tr ? "Yaz" : "Write", action: write(".gitignore", IGNORE), tone: "producer", disabled: repo.work[".gitignore"] === IGNORE }],
    },
    {
      label: "debug.log",
      buttons: [{ label: "rm --cached", action: { type: "rmCached", path: "debug.log" }, tone: "danger", disabled: !("debug.log" in repo.index) }],
    },
    {
      label: "app.js",
      buttons: [
        { label: tr ? "Düzenle" : "Edit", action: write("app.js", `v${edits(history, "app.js") + 2}`), tone: "producer" },
        { label: "add", action: add("app.js"), disabled: !appChanged },
      ],
    },
    {
      label: tr ? "Hepsi" : "All",
      buttons: [
        { label: "add .", action: { type: "add", paths: "." }, disabled: st.unstaged.length === 0 && st.untracked.length === 0 },
        { label: "commit", action: commit(tr ? "Değişiklikler" : "Changes"), tone: "ok", disabled: st.staged.length === 0 },
      ],
    },
    {
      label: "tag",
      buttons: [{ label: "tag v1.0", action: { type: "tag", name: "v1.0" }, tone: "go", disabled: Boolean(repo.tags["v1.0"]) }],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l(".gitignore ile yok sayılan dosyalar ve sürüm tag'leri", "Files ignored with .gitignore, and release tags"),
  view: (repo, info) =>
    GRAPH_STEPS.has(info.step) && !info.sandbox ? (
      <GraphStage repo={repo} highlight={info.fresh} />
    ) : (
      <g>
        <AreasStage repo={repo} labels={labels(info.t)} flow={flowOf(info.last)} last={info.last} />
        {info.sandbox && <TagOverlay repo={repo} />}
      </g>
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
  sandbox: { start: () => START, rows, missions },
});
