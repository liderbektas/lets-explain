import { AnimatePresence, motion, type Variants } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, short, simulate, status, type GitAction, type GitEvent, type Repo } from "../../engine/git";
import { MetroStage } from "../../iso/MetroStage";
import { makeGitScene, timeWords } from "../shared/GitScene";
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
 * The right-hand panel: the desk with what is unsaved in the folder, and the stash as a depot
 * beside the line, its entries crates on a shelf. `git stash`
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
  // The folder: a desk your unsaved changes lie on.
  const desk = (y: number, h: number, title: string) => (
    <g>
      <rect x={x + 16} y={y + h - 6} width={11} height={14} rx={3} className="desk-leg" />
      <rect x={x + w - 27} y={y + h - 6} width={11} height={14} rx={3} className="desk-leg" />
      <rect x={x} y={y + 4} width={w} height={h - 4} rx={14} className="area-shadow" />
      <rect x={x} y={y} width={w} height={h - 4} rx={14} className="desk-top" />
      <path d={`M${x} ${y + h - 26} V${y + h - 18} Q${x} ${y + h - 4} ${x + 14} ${y + h - 4} H${x + w - 14} Q${x + w} ${y + h - 4} ${x + w} ${y + h - 18} V${y + h - 26}`} className="desk-edge" />
      <text x={x + 14} y={y + 26} className="area-title" style={{ fontSize: 13 }}>
        {title}
      </text>
    </g>
  );
  // The stash: a depot with a striped awning and shelves the entries are stacked on.
  const depot = (y: number, h: number, title: string) => (
    <g>
      <rect x={x} y={y + 4} width={w} height={h} rx={14} className="area-shadow" />
      <rect x={x} y={y} width={w} height={h} rx={14} className="depot-wall" />
      {/* A striped awning over the door, with the depot's name board on it. */}
      <clipPath id="depot-roof">
        <path d={`M${x - 6} ${y + 34} L${x + 10} ${y} H${x + w - 10} L${x + w + 6} ${y + 34} Z`} />
      </clipPath>
      <path d={`M${x - 6} ${y + 34} L${x + 10} ${y} H${x + w - 10} L${x + w + 6} ${y + 34} Z`} className="depot-roof" />
      <g clipPath="url(#depot-roof)">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={x - 6 + i * 28} y={y} width={14} height={34} className="depot-roof-stripe" />
        ))}
      </g>
      <path d={`M${x - 6} ${y + 34} L${x + 10} ${y} H${x + w - 10} L${x + w + 6} ${y + 34} Z`} className="depot-roof-line" />
      <rect x={x + w / 2 - (title.length * 8 + 24) / 2} y={y + 7} width={title.length * 8 + 24} height={21} rx={5} className="depot-sign" />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" className="area-title" style={{ fontSize: 13 }}>
        {title}
      </text>
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${x + 8} ${STASH_ROW(i) + 44} H${x + w - 8}`} className="depot-shelf" />
      ))}
    </g>
  );
  return (
    <g>
      {desk(40, 176, t(text.folder))}
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
            <rect y={3} width={w - 28} height={34} rx={9} className="area-shadow" />
            <rect width={w - 28} height={34} rx={9} className="area-tray" style={{ fill: "var(--card)" }} />
            <path d={`M${w - 40} 0 V10 H${w - 28}`} className="sheet-fold" />
            <text x={12} y={14} className="file-name">
              {c.path}
            </text>
            <text x={12} y={27} className="file-body">
              {clip(repo.work[c.path] ?? "—", 22)}
            </text>
          </motion.g>
        ))}
      </AnimatePresence>
      {depot(226, 206, t(text.stash))}
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
            {/* A crate: what was in the folder, packed away on top of the commit it was based on. */}
            <rect y={3} width={w - 28} height={40} rx={6} className="area-shadow" />
            <rect width={w - 28} height={40} rx={6} className="crate" />
            <path d={`M4 20 H${w - 32}`} className="crate-slat" />
            <rect x={6} y={3} width={78} height={16} rx={3} className="crate-label" />
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
      <MetroStage repo={repo} box={{ x: 0, y: 0, w: 640, h: 470 }} highlight={info.fresh} lanes={2} time={timeWords(info.t)} t={info.t} />
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
