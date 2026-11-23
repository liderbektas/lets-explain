import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, reachable, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { MetroStage, type StationMark } from "../../iso/MetroStage";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { ReflogPanel, reflogEntries } from "./ReflogPanel";
import { scenarios } from "./scenarios";

export const SLUG = "reflog";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/**
 * main: Başlangıç — Özellik — Önemli iş, and a branch `deneme` off Özellik with one commit.
 * Every move along the way is in HEAD's reflog.
 */
export const START: Repo = simulate(
  [
    write("README.md", "Merhaba"),
    add("README.md"),
    commit("Başlangıç"),
    write("feature.js", "özellik"),
    add("feature.js"),
    commit("Özellik"),
    { type: "switch", target: "deneme", create: true },
    write("deneme.js", "deneme"),
    add("deneme.js"),
    commit("Deneme"),
    { type: "switch", target: "main" },
    write("important.js", "önemli"),
    add("important.js"),
    commit("Önemli iş"),
  ],
  createRepo({ author: ADA }),
).states[14]!;

/** The two commits the lesson loses and finds again. */
export const IMPORTANT = START.branches.main!;
export const EXPERIMENT = START.branches.deneme!;

export const steps: GitAction[][] = [
  [],
  [{ type: "reset", target: "HEAD~1", mode: "hard" }],
  [],
  [{ type: "reset", target: IMPORTANT, mode: "hard" }],
  [{ type: "deleteBranch", name: "deneme", force: true }],
  [{ type: "branch", name: "deneme", at: EXPERIMENT }],
  [write("README.md", "yarım kalmış iş"), { type: "reset", target: "HEAD", mode: "hard" }],
  [],
  [],
];

/** Free play in the try-it step starts after both accidents: main reset back one commit and `deneme` deleted. */
export const sandboxStart = (): Repo =>
  simulate([{ type: "reset", target: "HEAD~1", mode: "hard" }, { type: "deleteBranch", name: "deneme", force: true }], START).states[2]!;

/**
 * A commit no branch reaches is still named in the reflog: its newest entry hangs on the
 * faded station as a plaque, the name you can bring it back with.
 */
function reflogNames(repo: Repo): Map<string, StationMark> {
  const live = reachable(repo);
  const marks = new Map<string, StationMark>();
  for (const e of reflogEntries(repo, Infinity)) {
    if (!live.has(e.to) && !marks.has(e.to)) marks.set(e.to, { label: `HEAD@{${e.n}}`, tone: "reflog" });
  }
  return marks;
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve HEAD'in günlüğü: git reflog", "The commit graph and HEAD's diary: git reflog"),
  view: (repo, info) => (
    <g>
      <MetroStage repo={repo} highlight={info.fresh} lanes={2} box={{ x: 0, y: 0, w: 570, h: 470 }} marks={reflogNames(repo)} time={timeWords(info.t)} t={info.t} />
      <ReflogPanel repo={repo} x={580} w={268} labels={{ title: info.t(l("HEAD'in günlüğü", "HEAD's diary")), lost: info.t(l("kayıp", "lost")) }} />
    </g>
  ),
  metrics: (repo, t) => {
    const ghosts = Object.keys(repo.commits).filter((c) => !reachable(repo).has(c)).length;
    const st = status(repo);
    return [
      { label: t(l("Reflog girişi", "Reflog entries")), value: repo.reflog.length },
      { label: t(l("Hiçbir branch'te değil", "On no branch")), value: ghosts, tone: ghosts ? "danger" : "ok" },
      { label: t(l("Kaydedilmemiş değişiklik", "Unsaved changes")), value: st.unstaged.length + st.staged.length },
    ];
  },
  // Each scenario brings its own accident; free play starts from the lesson's two.
  sandbox: { start: sandboxStart, scenarios },
});
