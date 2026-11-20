import { AnimatePresence, motion, type Variants } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, short, simulate, status, type GitAction, type GitEvent, type Repo } from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene } from "../shared/GitScene";
import { scenarios } from "./scenarios";

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

/** Free play in the try-it step: main already has a hotfix, feature has a half-done change. */
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

const text = {
  folder: l("Klasörde, kaydedilmemiş", "In the folder, unsaved"),
  clean: l("temiz", "clean"),
  stash: l("Stash", "Stash"),
  empty: l("boş", "empty"),
};

/** Where rows sit in the two cards: unsaved changes on top, stash entries below. */
const FOLDER_ROW = (i: number) => 78 + i * 42;
const STASH_ROW = (i: number) => 270 + i * 50;
const glide = { type: "spring", stiffness: 170, damping: 22 } as const;
/** A row leaving: into the stash (`git stash`), back to the folder (`stash pop`), or just gone. */
const leave: Variants = { leave: (to: number | null) => (to === null ? { opacity: 0, transition: { duration: 0.2 } } : { y: to, opacity: 0, transition: { duration: 0.55, ease: "easeInOut" } }) };

/**
 * The right-hand panel: what is unsaved in the folder, and what is in the stash. `git stash`
 * takes the changes out of the folder and pushes them onto the stack as stash@{0} (older
 * entries move down a slot); `stash pop` takes the top entry off and puts its changes back.
 */
function SidePanel({ repo, t, last }: { repo: Repo; t: (x: L) => string; last: GitEvent[] }) {
  const stashing = last.some((e) => e.type === "stashed");
  const popping = last.some((e) => e.type === "stashApplied");
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
        null
      )}
      <AnimatePresence initial={false} custom={stashing ? STASH_ROW(0) : null}>
        {changes.slice(0, 3).map((c, i) => (
          <motion.g
            key={c.path}
            variants={leave}
            initial={popping ? { x: x + 14, y: STASH_ROW(0), opacity: 1 } : { x: x + 14, y: FOLDER_ROW(i), opacity: 0 }}
            animate={{ x: x + 14, y: FOLDER_ROW(i), opacity: 1 }}
            exit="leave"
            transition={glide}
          >
            <rect width={w - 28} height={34} rx={9} className="area-tray" style={{ fill: "var(--card)" }} />
            <text x={12} y={14} className="file-name">
              {c.path}
            </text>
            <text x={12} y={27} className="file-body">
              {clip(repo.work[c.path] ?? "—", 22)}
            </text>
          </motion.g>
        ))}
      </AnimatePresence>
      {card(232, 200, t(text.stash), "var(--lilac-soft)")}
      {repo.stash.length === 0 ? (
        <text x={x + 16} y={284} className="area-empty">
          {t(text.empty)}
        </text>
      ) : (
        null
      )}
      <AnimatePresence initial={false} custom={popping ? FOLDER_ROW(0) : null}>
        {repo.stash.slice(0, 3).map((e, i) => (
          // Keyed by depth from the bottom of the stack: an entry keeps its key as others are pushed on top.
          <motion.g
            key={`stash-${repo.stash.length - i}-${e.base}`}
            variants={leave}
            initial={stashing && i === 0 ? { x: x + 14, y: FOLDER_ROW(0), opacity: 1 } : { x: x + 14, y: STASH_ROW(i), opacity: 0 }}
            animate={{ x: x + 14, y: STASH_ROW(i), opacity: 1 }}
            exit="leave"
            transition={stashing && i === 0 ? { duration: 0.55, ease: "easeInOut" } : glide}
          >
            <rect width={w - 28} height={40} rx={9} className="area-tray" style={{ fill: "var(--card)" }} />
            <text x={12} y={16} className="file-name">{`stash@{${i}}`}</text>
            <text x={12} y={31} className="file-body">
              {clip(`${Object.keys(e.work).join(", ")} · ${short(e.base)}`, 24)}
            </text>
          </motion.g>
        ))}
      </AnimatePresence>
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
      <SidePanel repo={repo} t={info.t} last={info.last} />
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
  // Free play starts from a hotfix on main and half-done work on feature; each scenario brings its own state.
  sandbox: { start: sandboxStart, scenarios },
});
