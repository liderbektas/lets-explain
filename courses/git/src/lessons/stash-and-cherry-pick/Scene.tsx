import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, short, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";

export const SLUG = "stash-and-cherry-pick";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths: paths[0] === "." ? "." : paths });
const commit = (message: string, all = false): GitAction => ({ type: "commit", message, all });

export const WIP = "v2: arama + filtre (yarım)";

/** main: A. feature: A — F, with a half-done change to app.js in the folder. */
const base: GitAction[] = [
  write("README.md", "v1"),
  write("app.js", "v1"),
  write("login.js", "giriş"),
  add("."),
  commit("Proje başladı"),
  { type: "switch", target: "feature", create: true },
  write("app.js", "v2: arama"),
  add("app.js"),
  commit("Arama özelliği"),
  write("app.js", WIP),
];

export const START: Repo = (() => {
  const r = simulate(base, createRepo({ author: ADA }));
  return r.states[r.states.length - 1]!;
})();

/** Step 1 tries to switch with the half-done change and is refused: that refusal is the lesson. */
export const EXPECTED_ERROR_STEP = 1;

export const steps: GitAction[][] = [
  [],
  [{ type: "switch", target: "main" }],
  [{ type: "stash" }],
  [{ type: "switch", target: "main" }, write("login.js", "giriş (düzeltildi)"), add("login.js"), commit("Giriş hatası düzeltildi")],
  [{ type: "switch", target: "feature" }, { type: "stashPop" }],
  [commit("Filtre eklendi", true)],
  [{ type: "cherryPick", target: "main" }],
  [],
  [],
];

/** The try-it step: main already has a hotfix, feature has a half-done change. */
const sandboxStart = (): Repo => {
  const r = simulate(
    [
      write("README.md", "v1"),
      write("app.js", "v1"),
      write("login.js", "giriş"),
      add("."),
      commit("Proje başladı"),
      { type: "switch", target: "feature", create: true },
      write("app.js", "v2: arama"),
      add("app.js"),
      commit("Arama özelliği"),
      { type: "switch", target: "main" },
      write("login.js", "giriş (düzeltildi)"),
      add("login.js"),
      commit("Hotfix: giriş hatası"),
      { type: "switch", target: "feature" },
      write("app.js", WIP),
    ],
    createRepo({ author: ADA }),
  );
  return r.states[r.states.length - 1]!;
};

const edits = (history: GitAction[], path: string) => history.filter((a) => a.type === "write" && a.path === path).length;

function rows(repo: Repo, lang: "tr" | "en", history: GitAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const branch = currentBranch(repo);
  const dirty = st.unstaged.length > 0 || st.staged.length > 0;
  return [
    {
      label: tr ? "Klasör" : "Folder",
      buttons: [
        { label: tr ? "README düzenle" : "Edit README", action: write("README.md", `v${edits(history, "README.md") + 2}`), tone: "producer" },
        { label: tr ? "login.js düzenle" : "Edit login.js", action: write("login.js", `giriş v${edits(history, "login.js") + 2}`), tone: "producer" },
        { label: "commit -a", action: commit(tr ? "Düzeltme" : "Fix", true), tone: "ok", disabled: st.unstaged.length === 0 && st.staged.length === 0 },
      ],
    },
    {
      label: "Stash",
      buttons: [
        { label: "stash", action: { type: "stash" }, disabled: !dirty },
        { label: "stash pop", action: { type: "stashPop" }, disabled: repo.stash.length === 0 },
        { label: "stash drop", action: { type: "stashDrop" }, tone: "danger", disabled: repo.stash.length === 0 },
      ],
    },
    {
      label: "Branch",
      buttons: [
        { label: "switch main", action: { type: "switch", target: "main" }, disabled: branch === "main" },
        { label: "switch feature", action: { type: "switch", target: "feature" }, disabled: branch === "feature" },
        { label: "cherry-pick main", action: { type: "cherryPick", target: "main" }, tone: "go", disabled: branch === "main" },
      ],
    },
  ];
}

const text = {
  folder: l("Klasörde, kaydedilmemiş", "In the folder, unsaved"),
  clean: l("temiz", "clean"),
  stash: l("Stash", "Stash"),
  empty: l("boş", "empty"),
};

/** The right-hand panel: what is unsaved in the folder, and what is in the stash. */
function SidePanel({ repo, t }: { repo: Repo; t: (x: L) => string }) {
  const st = status(repo);
  const changes = [
    ...st.staged.map((c) => ({ path: c.path, tag: "staged" })),
    ...st.unstaged.map((c) => ({ path: c.path, tag: c.change })),
    ...st.untracked.map((p) => ({ path: p, tag: "new" })),
    ...st.conflicted.map((p) => ({ path: p, tag: "conflict" })),
  ];
  const x = 650;
  const w = 200;
  const card = (y: number, h: number, title: string, fill: string) => (
    <g>
      <rect x={x} y={y + 4} width={w} height={h} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={w} height={h} rx={16} className="area-tray" style={{ fill }} />
      <text x={x + 14} y={y + 26} className="area-title" style={{ fontSize: 13 }}>
        {title}
      </text>
    </g>
  );
  return (
    <g>
      {card(40, 176, t(text.folder), "var(--sky-soft)")}
      {changes.length === 0 ? (
        <text x={x + 16} y={92} className="area-empty">
          {t(text.clean)}
        </text>
      ) : (
        changes.slice(0, 3).map((c, i) => (
          <g key={c.path} transform={`translate(${x + 14} ${44 + 34 + i * 42})`}>
            <rect width={w - 28} height={34} rx={9} className="area-tray" style={{ fill: "var(--card)" }} />
            <text x={12} y={14} className="file-name">
              {c.path}
            </text>
            <text x={12} y={27} className="file-body">
              {clip(repo.work[c.path] ?? "—", 22)}
            </text>
          </g>
        ))
      )}
      {card(232, 200, t(text.stash), "var(--lilac-soft)")}
      {repo.stash.length === 0 ? (
        <text x={x + 16} y={284} className="area-empty">
          {t(text.empty)}
        </text>
      ) : (
        repo.stash.slice(0, 3).map((e, i) => (
          <g key={`${i}-${e.base}`} transform={`translate(${x + 14} ${232 + 38 + i * 50})`}>
            <rect width={w - 28} height={40} rx={9} className="area-tray" style={{ fill: "var(--card)" }} />
            <text x={12} y={16} className="file-name">{`stash@{${i}}`}</text>
            <text x={12} y={31} className="file-body">
              {clip(`${Object.keys(e.work).join(", ")} · ${short(e.base)}`, 24)}
            </text>
          </g>
        ))
      )}
    </g>
  );
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği, kaydedilmemiş değişiklikler ve stash", "The commit graph, unsaved changes and the stash"),
  view: (repo, info) => (
    <g>
      <GraphStage repo={repo} box={{ x: 0, y: 0, w: 640, h: 470 }} highlight={info.fresh} />
      <SidePanel repo={repo} t={info.t} />
    </g>
  ),
  metrics: (repo, t) => {
    const st = status(repo);
    const unsaved = st.unstaged.length + st.staged.length;
    return [
      { label: t(l("Branch", "Branch")), value: currentBranch(repo) ?? "—" },
      { label: t(l("Kaydedilmemiş", "Unsaved")), value: unsaved, tone: unsaved ? "warn" : "plain" },
      { label: t(l("Stash", "Stash")), value: repo.stash.length, tone: repo.stash.length ? "ok" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
